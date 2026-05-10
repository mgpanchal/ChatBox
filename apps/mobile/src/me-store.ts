import { api, type Me } from './api';
import { storageGet, storagePut, storageDelete } from './storage';

const KEY = 'me';
const FRESH_TTL_MS = 60_000;

type Listener = (me: Me | null) => void;

let cached: Me | null = null;
let cachedAt = 0;
let inflight: Promise<Me> | null = null;
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

const emit = () => { for (const l of listeners) l(cached); };

export function hydrateMeStore(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    const row = await storageGet<{ me: Me; at: number }>(KEY);
    if (row?.me) { cached = row.me; cachedAt = row.at ?? 0; emit(); }
    hydrated = true;
  })();
  return hydrationPromise;
}

export const meStore = {
  get: () => cached,
  isHydrated: () => hydrated,
  hydration: () => hydrateMeStore(),
  set: (me: Me | null) => {
    cached = me;
    cachedAt = Date.now();
    emit();
    if (me) storagePut(KEY, { me, at: cachedAt });
    else storageDelete(KEY);
  },
  refresh: async (): Promise<Me> => {
    if (inflight) return inflight;
    inflight = api.me().finally(() => { inflight = null; });
    const me = await inflight;
    cached = me;
    cachedAt = Date.now();
    emit();
    storagePut(KEY, { me, at: cachedAt });
    return me;
  },
  ensure: async (): Promise<Me> => {
    if (cached && Date.now() - cachedAt < FRESH_TTL_MS) return cached;
    if (cached) {
      meStore.refresh().catch(() => {});
      return cached;
    }
    return meStore.refresh();
  },
  clear: () => {
    cached = null;
    cachedAt = 0;
    emit();
    storageDelete(KEY);
  },
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
};
