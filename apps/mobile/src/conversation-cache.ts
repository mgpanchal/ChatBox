import { api, type ConversationDetail, type MessageItem } from './api';
import { storageGet, storagePut, storageDelete, storageGetAllByPrefix, storageClearByPrefix } from './storage';

export type Pagination = {
  hasMore: boolean;
  oldestLoadedAt: string | null;
};

type Entry = {
  meta: ConversationDetail;
  messages: MessageItem[];
  fetchedAt: number;
  pagination: Pagination;
};

type Listener = (id: string, entry: Entry) => void;

const KEY_PREFIX = 'conv:';
const MAX_HOT = 30;
const MAX_MESSAGES_PER_CONVO = 500;
const FRESH_TTL_MS = 30_000;
const PAGE_SIZE = 50;

const hot = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();
const olderInflight = new Map<string, Promise<MessageItem[]>>();
const listeners = new Set<Listener>();
const writeQueue = new Map<string, ReturnType<typeof setTimeout>>();
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;

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
  const handle = setTimeout(() => {
    writeQueue.delete(id);
    const trimmed = trim(entry.messages);
    const persistEntry: Entry = {
      ...entry,
      messages: trimmed,
      pagination: { ...entry.pagination, oldestLoadedAt: trimmed[0]?.createdAt ?? entry.pagination.oldestLoadedAt },
    };
    storagePut(`${KEY_PREFIX}${id}`, persistEntry);
  }, 250);
  writeQueue.set(id, handle);
}

function notify(id: string, entry: Entry) {
  for (const l of listeners) l(id, entry);
}

export function hydrateConversationCache(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    const rows = await storageGetAllByPrefix<Entry>(KEY_PREFIX);
    rows.sort((a, b) => (a.value.fetchedAt ?? 0) - (b.value.fetchedAt ?? 0));
    for (const { key, value } of rows) {
      if (!value || !value.meta || !value.messages) continue;
      const id = key.slice(KEY_PREFIX.length);
      const pagination = value.pagination ?? { hasMore: value.messages.length >= PAGE_SIZE, oldestLoadedAt: value.messages[0]?.createdAt ?? null };
      hot.set(id, { ...value, pagination });
    }
    while (hot.size > MAX_HOT) {
      const oldest = hot.keys().next().value;
      if (!oldest) break;
      hot.delete(oldest);
    }
    hydrated = true;
  })();
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
    const entry: Entry = {
      meta,
      messages: sorted,
      fetchedAt: Date.now(),
      pagination: {
        hasMore: hasMore ?? existing?.pagination.hasMore ?? (sorted.length >= PAGE_SIZE),
        oldestLoadedAt: sorted[0]?.createdAt ?? null,
      },
    };
    touch(id, entry);
    schedulePersist(id, entry);
    notify(id, entry);
  },

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
        const entry: Entry = {
          meta,
          messages: sorted,
          fetchedAt: Date.now(),
          pagination: { hasMore: msgs.hasMore, oldestLoadedAt: sorted[0]?.createdAt ?? null },
        };
        touch(id, entry);
        schedulePersist(id, entry);
        notify(id, entry);
        return entry;
      })
      .finally(() => { inflight.delete(id); });
    inflight.set(id, p);
    return p;
  },

  loadOlder: async (id: string): Promise<MessageItem[]> => {
    const existing = olderInflight.get(id);
    if (existing) return existing;
    const entry = hot.get(id);
    if (!entry || !entry.pagination.hasMore || !entry.pagination.oldestLoadedAt) return [];

    const before = entry.pagination.oldestLoadedAt;
    const p = (async () => {
      const r = await api.listMessages(id, { before, limit: PAGE_SIZE });
      const merged = dedupAndSort([...r.messages, ...entry.messages]);
      const next: Entry = {
        ...entry,
        messages: merged,
        fetchedAt: Date.now(),
        pagination: {
          hasMore: r.hasMore,
          oldestLoadedAt: merged[0]?.createdAt ?? before,
        },
      };
      touch(id, next);
      schedulePersist(id, next);
      notify(id, next);
      return r.messages;
    })().finally(() => { olderInflight.delete(id); });

    olderInflight.set(id, p);
    return p;
  },

  remove: (id: string) => {
    hot.delete(id);
    const handle = writeQueue.get(id);
    if (handle) { clearTimeout(handle); writeQueue.delete(id); }
    storageDelete(`${KEY_PREFIX}${id}`);
  },

  clear: async () => {
    hot.clear();
    inflight.clear();
    olderInflight.clear();
    for (const handle of writeQueue.values()) clearTimeout(handle);
    writeQueue.clear();
    await storageClearByPrefix(KEY_PREFIX);
  },

  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  size: () => hot.size,
};
