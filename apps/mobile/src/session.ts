import * as SecureStore from 'expo-secure-store';

// Stored under these keys in the device keychain (iOS) / EncryptedSharedPreferences (Android).
const ACCESS_KEY = 'chatbox.access';
const REFRESH_KEY = 'chatbox.refresh';

type Listener = (signedIn: boolean) => void;

let cachedAccess: string | null = null;
let cachedRefresh: string | null = null;
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(!!cachedAccess);
}

export const session = {
  /** Read tokens from SecureStore once at app start. Subsequent calls are no-ops. */
  hydrate: (): Promise<void> => {
    if (hydrationPromise) return hydrationPromise;
    hydrationPromise = (async () => {
      try {
        const [a, r] = await Promise.all([
          SecureStore.getItemAsync(ACCESS_KEY),
          SecureStore.getItemAsync(REFRESH_KEY),
        ]);
        cachedAccess = a;
        cachedRefresh = r;
      } catch {
        cachedAccess = null;
        cachedRefresh = null;
      }
      hydrated = true;
      emit();
    })();
    return hydrationPromise;
  },
  isHydrated: () => hydrated,
  isSignedIn: () => !!cachedAccess,
  getAccess: () => cachedAccess,
  getRefresh: () => cachedRefresh,
  set: async (access: string, refresh: string) => {
    cachedAccess = access;
    cachedRefresh = refresh;
    try {
      await SecureStore.setItemAsync(ACCESS_KEY, access);
      await SecureStore.setItemAsync(REFRESH_KEY, refresh);
    } catch {
      // ignore — in-memory copy still works for this session
    }
    emit();
  },
  setAccess: async (access: string) => {
    cachedAccess = access;
    try {
      await SecureStore.setItemAsync(ACCESS_KEY, access);
    } catch {}
    emit();
  },
  clear: async () => {
    cachedAccess = null;
    cachedRefresh = null;
    try {
      await SecureStore.deleteItemAsync(ACCESS_KEY);
      await SecureStore.deleteItemAsync(REFRESH_KEY);
    } catch {}
    emit();
  },
  subscribe: (l: Listener): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
