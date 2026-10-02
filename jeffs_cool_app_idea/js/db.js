// IndexedDB wrapper for Jeff's Cool App Idea.
// Two record stores (rooms, equipment) plus a key/value settings store.
// Photos and 3D scan files are stored as Blobs directly in their parent record.

const DB_NAME = 'jeffs-cool-app-db';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('rooms')) {
        db.createObjectStore('rooms', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('equipment')) {
        const store = db.createObjectStore('equipment', { keyPath: 'id' });
        store.createIndex('roomId', 'roomId');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const RoomsDB = {
  async all() {
    const store = await tx('rooms', 'readonly');
    return wrap(store.getAll());
  },
  async get(id) {
    const store = await tx('rooms', 'readonly');
    return wrap(store.get(id));
  },
  async put(room) {
    const store = await tx('rooms', 'readwrite');
    await wrap(store.put(room));
    return room;
  },
  async delete(id) {
    const store = await tx('rooms', 'readwrite');
    return wrap(store.delete(id));
  },
};

export const EquipmentDB = {
  async all() {
    const store = await tx('equipment', 'readonly');
    return wrap(store.getAll());
  },
  async byRoom(roomId) {
    const store = await tx('equipment', 'readonly');
    return wrap(store.index('roomId').getAll(roomId));
  },
  async get(id) {
    const store = await tx('equipment', 'readonly');
    return wrap(store.get(id));
  },
  async put(item) {
    const store = await tx('equipment', 'readwrite');
    await wrap(store.put(item));
    return item;
  },
  async delete(id) {
    const store = await tx('equipment', 'readwrite');
    return wrap(store.delete(id));
  },
};

export const SettingsDB = {
  async get(key, fallback = null) {
    const store = await tx('settings', 'readonly');
    const rec = await wrap(store.get(key));
    return rec ? rec.value : fallback;
  },
  async set(key, value) {
    const store = await tx('settings', 'readwrite');
    return wrap(store.put({ key, value }));
  },
};

export async function wipeAllData() {
  const db = await openDB();
  await Promise.all(
    ['rooms', 'equipment', 'settings'].map(
      (name) =>
        new Promise((resolve, reject) => {
          const req = db.transaction(name, 'readwrite').objectStore(name).clear();
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        })
    )
  );
}
