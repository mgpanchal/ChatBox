import { api, type ConversationDetail, type MessageItem } from './api';
import { idbGet, idbPut, idbDelete, idbGetAll, idbClearAll } from './idb';
import { bus } from './bus';

export type Pagination = {
  hasMore: boolean;
  oldestLoadedAt: string | null;
  inflight: boolean;
  failureCount: number;
  cooldownUntil: number;
};

type Entry = {
  meta: ConversationDetail;
  messages: MessageItem[];
  fetchedAt: number;
  pagination: Pagination;
};

type Listener = (id: string, entry: Entry) => void;

const MAX_HOT = 50;
const MAX_MESSAGES_PER_CONVO = 1000;
const FRESH_TTL_MS = 30_000;
const PAGE_SIZE = 50;
const COOLDOWN_AFTER_SUCCESS_MS = 100;
const RETRY_BASE_MS = 800;
const RETRY_MAX = 3;

const hot = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();
const olderInflight = new Map<string, Promise<MessageItem[]>>();
const aroundInflight = new Map<string, Promise<MessageItem[]>>();
const listeners = new Set<Listener>();
const writeQueue = new Map<string, number>();
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

function defaultPagination(messages: MessageItem[]): Pagination {
  return {
    hasMore: messages.length >= PAGE_SIZE,
    oldestLoadedAt: messages[0]?.createdAt ?? null,
    inflight: false,
    failureCount: 0,
    cooldownUntil: 0,
  };
}

function touch(id: string, entry: Entry) {
  hot.delete(id);
  hot.set(id, entry);
  while (hot.size > MAX_HOT) {
    const oldest = hot.keys().next().value;
    if (!oldest) break;
    hot.delete(oldest);
  }
}

function trim(messages: MessageItem[]): MessageItem[] {
  // Trim from the OLDEST end (front) so newest are always retained.
  return messages.length > MAX_MESSAGES_PER_CONVO
    ? messages.slice(messages.length - MAX_MESSAGES_PER_CONVO)
    : messages;
}

function dedupAndSort(messages: MessageItem[]): MessageItem[] {
  const map = new Map<string, MessageItem>();
  for (const m of messages) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function schedulePersist(id: string, entry: Entry) {
  const existing = writeQueue.get(id);
  if (existing) clearTimeout(existing);
  const handle = window.setTimeout(() => {
    writeQueue.delete(id);
    const trimmed = trim(entry.messages);
    const persistEntry: Entry = {
      ...entry,
      messages: trimmed,
      pagination: { ...entry.pagination, oldestLoadedAt: trimmed[0]?.createdAt ?? entry.pagination.oldestLoadedAt },
    };
    idbPut('conversations', id, persistEntry)
      .then(() => bus.publish({ type: 'conversation-updated', id }))
      .catch(() => {});
  }, 250);
  writeQueue.set(id, handle);
}

function notify(id: string, entry: Entry) {
  for (const l of listeners) l(id, entry);
}

if (typeof window !== 'undefined') {
  bus.subscribe(async (msg) => {
    if (msg.type === 'conversation-updated') {
      const row = await idbGet<Entry>('conversations', msg.id);
      if (row) {
        const existing = hot.get(msg.id);
        if (!existing || existing.fetchedAt < (row.fetchedAt ?? 0)) {
          touch(msg.id, row);
          notify(msg.id, row);
        }
      }
    }
  });
}

export function hydrateConversationCache(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = idbGetAll<Entry>('conversations').then((rows) => {
    rows.sort((a, b) => (a.value.fetchedAt ?? 0) - (b.value.fetchedAt ?? 0));
    for (const { key, value } of rows) {
      if (!value || !value.meta || !value.messages) continue;
      // Hydrate forward-compatible: legacy entries lack pagination.
      const pagination = value.pagination ?? defaultPagination(value.messages);
      hot.set(key, { ...value, pagination });
    }
    while (hot.size > MAX_HOT) {
      const oldest = hot.keys().next().value;
      if (!oldest) break;
      hot.delete(oldest);
    }
    hydrated = true;
  });
  return hydrationPromise;
}

export const conversationCache = {
  get: (id: string): Entry | undefined => {
    const e = hot.get(id);
    if (e) touch(id, e);
    return e;
  },
  isHydrated: () => hydrated,
  hydration: () => hydrateConversationCache(),
  set: (id: string, meta: ConversationDetail, messages: MessageItem[], hasMore?: boolean) => {
    const sorted = dedupAndSort(messages);
    const existing = hot.get(id);
    const pagination: Pagination = {
      hasMore: hasMore ?? existing?.pagination.hasMore ?? (sorted.length >= PAGE_SIZE),
      oldestLoadedAt: sorted[0]?.createdAt ?? null,
      inflight: false,
      failureCount: 0,
      cooldownUntil: 0,
    };
    const entry: Entry = { meta, messages: sorted, fetchedAt: Date.now(), pagination };
    touch(id, entry);
    schedulePersist(id, entry);
    notify(id, entry);
  },
  // Update messages without changing pagination state (e.g. on realtime new/edit/delete).
  updateMessages: (id: string, mutate: (msgs: MessageItem[]) => MessageItem[]) => {
    const entry = hot.get(id);
    if (!entry) return;
    const next: Entry = {
      ...entry,
      messages: dedupAndSort(mutate(entry.messages)),
      fetchedAt: Date.now(),
    };
    touch(id, next);
    schedulePersist(id, next);
    notify(id, next);
  },
  prefetch: (id: string): Promise<Entry> => {
    const existing = inflight.get(id);
    if (existing) return existing;
    const cached = hot.get(id);
    if (cached && Date.now() - cached.fetchedAt < FRESH_TTL_MS) return Promise.resolve(cached);
    const p = Promise.all([api.getConversation(id), api.listMessages(id, { limit: PAGE_SIZE })])
      .then(([meta, msgs]) => {
        const sorted = dedupAndSort(msgs.messages);
        const pagination: Pagination = {
          hasMore: msgs.hasMore,
          oldestLoadedAt: sorted[0]?.createdAt ?? null,
          inflight: false,
          failureCount: 0,
          cooldownUntil: 0,
        };
        const entry: Entry = { meta, messages: sorted, fetchedAt: Date.now(), pagination };
        touch(id, entry);
        schedulePersist(id, entry);
        notify(id, entry);
        return entry;
      })
      .finally(() => {
        inflight.delete(id);
      });
    inflight.set(id, p);
    return p;
  },
  // Path B — load older. Returns an array of NEW older messages (not the whole list).
  loadOlder: async (id: string): Promise<MessageItem[]> => {
    const existing = olderInflight.get(id);
    if (existing) return existing;
    const entry = hot.get(id);
    if (!entry) return [];
    const { pagination } = entry;
    if (pagination.inflight) return [];
    if (!pagination.hasMore) return [];
    if (Date.now() < pagination.cooldownUntil) return [];
    if (!pagination.oldestLoadedAt) return [];

    pagination.inflight = true;
    const before = pagination.oldestLoadedAt;

    const p = (async (): Promise<MessageItem[]> => {
      try {
        const r = await api.listMessages(id, { before, limit: PAGE_SIZE });
        const fresh = r.messages;
        const merged = dedupAndSort([...fresh, ...entry.messages]);
        const next: Entry = {
          ...entry,
          messages: merged,
          fetchedAt: Date.now(),
          pagination: {
            hasMore: r.hasMore,
            oldestLoadedAt: merged[0]?.createdAt ?? before,
            inflight: false,
            failureCount: 0,
            cooldownUntil: Date.now() + COOLDOWN_AFTER_SUCCESS_MS,
          },
        };
        touch(id, next);
        schedulePersist(id, next);
        notify(id, next);
        return fresh;
      } catch (e) {
        const failures = pagination.failureCount + 1;
        const cooldown = RETRY_BASE_MS * Math.pow(2, failures - 1);
        const reachedMax = failures >= RETRY_MAX;
        const next: Entry = {
          ...entry,
          pagination: {
            ...pagination,
            inflight: false,
            failureCount: failures,
            cooldownUntil: Date.now() + cooldown,
            hasMore: reachedMax ? false : pagination.hasMore,
          },
        };
        touch(id, next);
        notify(id, next);
        throw e;
      }
    })().finally(() => {
      olderInflight.delete(id);
    });

    olderInflight.set(id, p);
    return p;
  },
  // Path D — load a window around a specific message.
  loadAround: async (id: string, messageId: string): Promise<MessageItem[]> => {
    const existing = aroundInflight.get(id);
    if (existing) return existing;
    const entry = hot.get(id);

    const p = (async () => {
      const r = await api.listMessages(id, { around: messageId, limit: 100 });
      const merged = dedupAndSort([...(entry?.messages ?? []), ...r.messages]);
      const meta = entry?.meta ?? (await api.getConversation(id));
      const oldestLoadedAt = r.messages[0]?.createdAt ?? merged[0]?.createdAt ?? null;
      const next: Entry = {
        meta,
        messages: merged,
        fetchedAt: Date.now(),
        pagination: {
          hasMore: r.hasMore,
          oldestLoadedAt,
          inflight: false,
          failureCount: 0,
          cooldownUntil: 0,
        },
      };
      touch(id, next);
      schedulePersist(id, next);
      notify(id, next);
      return r.messages;
    })().finally(() => {
      aroundInflight.delete(id);
    });

    aroundInflight.set(id, p);
    return p;
  },
  // Reset retry budget after user taps "retry".
  resetFailure: (id: string) => {
    const entry = hot.get(id);
    if (!entry) return;
    const next: Entry = {
      ...entry,
      pagination: {
        ...entry.pagination,
        failureCount: 0,
        cooldownUntil: 0,
        hasMore: true,
      },
    };
    touch(id, next);
    notify(id, next);
  },
  remove: (id: string) => {
    hot.delete(id);
    const handle = writeQueue.get(id);
    if (handle) {
      clearTimeout(handle);
      writeQueue.delete(id);
    }
    idbDelete('conversations', id).catch(() => {});
  },
  clear: async () => {
    hot.clear();
    inflight.clear();
    olderInflight.clear();
    aroundInflight.clear();
    for (const handle of writeQueue.values()) clearTimeout(handle);
    writeQueue.clear();
    await idbClearAll();
  },
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  size: () => hot.size,
};
