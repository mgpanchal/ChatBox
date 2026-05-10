import { api, type ConversationListItem, type DirectoryUser, type Team } from './api';
import { idbGet, idbPut, idbDelete } from './idb';
import { bus } from './bus';

type BusType = 'conversation-list-updated' | 'directory-updated';

type ListListener<T> = (data: T[]) => void;

function makeListStore<T>(storeKey: 'list' | 'directory', idbKey: string, fetcher: () => Promise<T[]>, freshMs: number, busType: BusType) {
  let cached: T[] | null = null;
  let cachedAt = 0;
  let inflight: Promise<T[]> | null = null;
  let hydrated = false;
  let hydrationPromise: Promise<void> | null = null;
  const listeners = new Set<ListListener<T>>();

  const emit = () => {
    if (cached) for (const l of listeners) l(cached);
  };

  const hydrate = (): Promise<void> => {
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = idbGet<{ data: T[]; at: number }>(storeKey, idbKey).then((row) => {
      if (row?.data) {
        cached = row.data;
        cachedAt = row.at ?? 0;
        emit();
      }
      hydrated = true;
    });
    return hydrationPromise;
  };

  if (typeof window !== 'undefined') {
    bus.subscribe(async (msg) => {
      if (msg.type !== busType) return;
      const row = await idbGet<{ data: T[]; at: number }>(storeKey, idbKey);
      if (row?.data && (row.at ?? 0) > cachedAt) {
        cached = row.data;
        cachedAt = row.at ?? Date.now();
        emit();
      }
    });
  }

  const refresh = async (): Promise<T[]> => {
    if (inflight) return inflight;
    inflight = fetcher().finally(() => {
      inflight = null;
    });
    const data = await inflight;
    cached = data;
    cachedAt = Date.now();
    emit();
    idbPut(storeKey, idbKey, { data, at: cachedAt })
      .then(() => bus.publish({ type: busType }))
      .catch(() => {});
    return data;
  };

  return {
    get: () => cached,
    isHydrated: () => hydrated,
    hydration: hydrate,
    set: (data: T[]) => {
      cached = data;
      cachedAt = Date.now();
      emit();
      idbPut(storeKey, idbKey, { data, at: cachedAt })
        .then(() => bus.publish({ type: busType }))
        .catch(() => {});
    },
    refresh,
    ensure: async (): Promise<T[]> => {
      if (cached && Date.now() - cachedAt < freshMs) return cached;
      if (cached) {
        refresh().catch(() => {});
        return cached;
      }
      return refresh();
    },
    clear: () => {
      cached = null;
      cachedAt = 0;
      emit();
      idbDelete(storeKey, idbKey).catch(() => {});
    },
    subscribe: (l: ListListener<T>) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export const conversationListStore = makeListStore<ConversationListItem>(
  'list',
  'conversations',
  () => api.listConversations(),
  15_000,
  'conversation-list-updated',
);

export const directoryStore = makeListStore<DirectoryUser>(
  'directory',
  'users',
  () => api.listUsers(),
  60_000,
  'directory-updated',
);

export const teamsStore = makeListStore<Team>(
  'directory',
  'teams',
  () => api.listTeams(),
  300_000,
  'directory-updated',
);
