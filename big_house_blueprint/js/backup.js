import { downloadBlob } from './utils.js';

// A simple point-in-time export of one property's structured data, for
// your own records or to move between tools. It is NOT the disaster
// recovery mechanism anymore — the data and files themselves already live
// durably in Firebase (Firestore + Storage), so there's nothing to restore
// here on data loss. Treat this file as sensitive: the photo/scan links it
// contains work without signing in.
export function exportPropertyBackup(property, rooms, equipment) {
  const payload = {
    app: 'big-house-blueprint',
    version: 2,
    exportedAt: new Date().toISOString(),
    property: { name: property.name, address: property.address },
    rooms,
    equipment,
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `${property.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-backup-${new Date().toISOString().slice(0, 10)}.json`
  );
}
