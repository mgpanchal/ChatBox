const DB_NAME = 'chatbox-cache';
const DB_VERSION = 1;
const STORES = ['conversations', 'me', 'list', 'directory'] as const;
export type Store = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IDB blocked'));
  });
  return dbPromise;
}

function tx(db: IDBDatabase, store: Store, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

export async function idbGet<T>(store: Store, key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = tx(db, store, 'readonly').get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function idbPut<T>(store: Store, key: string, value: T): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const req = tx(db, store, 'readwrite').put(value as any, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* swallow — IDB is best-effort */
  }
}

export async function idbDelete(store: Store, key: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const req = tx(db, store, 'readwrite').delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

export async function idbGetAll<T>(store: Store): Promise<Array<{ key: string; value: T }>> {
  try {
    const db = await open();
    return await new Promise<Array<{ key: string; value: T }>>((resolve, reject) => {
      const out: Array<{ key: string; value: T }> = [];
      const req = tx(db, store, 'readonly').openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve(out);
        out.push({ key: String(cursor.key), value: cursor.value as T });
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function idbClearAll(): Promise<void> {
  try {
    const db = await open();
    await Promise.all(
      STORES.map(
        (s) =>
          new Promise<void>((resolve, reject) => {
            const req = tx(db, s, 'readwrite').clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          }),
      ),
    );
  } catch {}
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    const already = await navigator.storage.persisted();
    if (already) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
