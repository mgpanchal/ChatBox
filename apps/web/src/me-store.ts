import { api, type Me } from './api';
import { idbGet, idbPut, idbDelete } from './idb';
import { bus } from './bus';

type Listener = (me: Me | null) => void;

const ME_KEY = 'me';
const FRESH_TTL_MS = 60_000;

let cached: Me | null = null;
let cachedAt = 0;
let inflight: Promise<Me> | null = null;
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(cached);
}

export function hydrateMeStore(): Promise<void> {
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = idbGet<{ me: Me; at: number }>('me', ME_KEY).then((row) => {
    if (row?.me) {
      cached = row.me;
      cachedAt = row.at ?? 0;
      emit();
    }
    hydrated = true;
  });
  return hydrationPromise;
}

if (typeof window !== 'undefined') {
  bus.subscribe((msg) => {
    if (msg.type === 'me-updated') {
      idbGet<{ me: Me; at: number }>('me', ME_KEY).then((row) => {
        if (row?.me && (row.at ?? 0) > cachedAt) {
          cached = row.me;
          cachedAt = row.at ?? Date.now();
          emit();
        }
      });
    } else if (msg.type === 'me-cleared') {
      cached = null;
      cachedAt = 0;
      emit();
    }
  });
}

export const meStore = {
  get: () => cached,
  isHydrated: () => hydrated,
  hydration: () => hydrateMeStore(),
  set: (me: Me | null, options?: { broadcast?: boolean }) => {
    cached = me;
    cachedAt = Date.now();
    emit();
    if (me) idbPut('me', ME_KEY, { me, at: cachedAt }).catch(() => {});
    else idbDelete('me', ME_KEY).catch(() => {});
    if (options?.broadcast !== false) bus.publish(me ? { type: 'me-updated' } : { type: 'me-cleared' });
  },
  refresh: async (): Promise<Me> => {
    if (inflight) return inflight;
    inflight = api.me().finally(() => {
      inflight = null;
    });
    const me = await inflight;
    cached = me;
    cachedAt = Date.now();
    emit();
    idbPut('me', ME_KEY, { me, at: cachedAt }).catch(() => {});
    bus.publish({ type: 'me-updated' });
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
    idbDelete('me', ME_KEY).catch(() => {});
    bus.publish({ type: 'me-cleared' });
  },
  subscribe: (l: Listener) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
