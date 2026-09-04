// @ts-check
/**
 * Persist the last browser-granted file handle locally.
 *
 * IndexedDB is only a convenience: browsers may deny storage, and opening a
 * deck must continue to work when they do.
 */

const DB = 'quire';
const STORE = 'handles';

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @param {FileSystemFileHandle} handle */
async function rememberHandle(handle) {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, 'last');
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } catch {
    /* remembering is a convenience, never a requirement */
  }
}

/** @returns {Promise<FileSystemFileHandle | null>} */
async function recallHandle() {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('last');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export { rememberHandle, recallHandle };
