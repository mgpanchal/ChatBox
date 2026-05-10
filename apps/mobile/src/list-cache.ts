import { api, type ConversationListItem, type DirectoryUser, type Team } from './api';
import { storageGet, storagePut, storageDelete } from './storage';

type ListListener<T> = (data: T[]) => void;

function makeListStore<T>(idbKey: string, fetcher: () => Promise<T[]>, freshMs: number) {
  let cached: T[] | null = null;
  let cachedAt = 0;
  let inflight: Promise<T[]> | null = null;
  let hydrated = false;
  let hydrationPromise: Promise<void> | null = null;
  const listeners = new Set<ListListener<T>>();

  const emit = () => { if (cached) for (const l of listeners) l(cached); };

  const hydrate = (): Promise<void> => {
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = (async () => {
      const row = await storageGet<{ data: T[]; at: number }>(idbKey);
      if (row?.data) { cached = row.data; cachedAt = row.at ?? 0; emit(); }
      hydrated = true;
    })();
    return hydrationPromise;
  };

  const refresh = async (): Promise<T[]> => {
    if (inflight) return inflight;
    inflight = fetcher().finally(() => { inflight = null; });
    const data = await inflight;
    cached = data;
    cachedAt = Date.now();
    emit();
    storagePut(idbKey, { data, at: cachedAt });
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
      storagePut(idbKey, { data, at: cachedAt });
    },
    refresh,
    ensure: async (): Promise<T[]> => {
      if (cached && Date.now() - cachedAt < freshMs) return cached;
      if (cached) { refresh().catch(() => {}); return cached; }
      return refresh();
    },
    clear: () => {
      cached = null;
      cachedAt = 0;
      emit();
      storageDelete(idbKey);
    },
    subscribe: (l: ListListener<T>) => {
      listeners.add(l);
      return () => { listeners.delete(l); };
    },
  };
}

export const conversationListStore = makeListStore<ConversationListItem>('list:conversations', () => api.listConversations(), 15_000);
export const directoryStore = makeListStore<DirectoryUser>('list:users', () => api.listUsers(), 60_000);
export const teamsStore = makeListStore<Team>('list:teams', () => api.listTeams(), 300_000);
