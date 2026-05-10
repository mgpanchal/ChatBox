import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Thin wrapper over AsyncStorage so the rest of the app talks in JSON-typed
 * keys. Keys are namespaced by feature: conv:<id>, list:<key>, dir:<key>, me.
 */
export async function storageGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function storagePut<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort; quota / serialization failure is silently dropped
  }
}

export async function storageDelete(key: string): Promise<void> {
  try { await AsyncStorage.removeItem(key); } catch {}
}

export async function storageGetAllByPrefix<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const matching = allKeys.filter((k) => k.startsWith(prefix));
    if (matching.length === 0) return [];
    const pairs = await AsyncStorage.multiGet(matching);
    const out: Array<{ key: string; value: T }> = [];
    for (const [k, raw] of pairs) {
      if (!raw) continue;
      try { out.push({ key: k, value: JSON.parse(raw) as T }); } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

export async function storageClearByPrefix(prefix: string): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const matching = allKeys.filter((k) => k.startsWith(prefix));
    if (matching.length > 0) await AsyncStorage.multiRemove(matching);
  } catch {}
}
