import { RoomsDB, EquipmentDB } from './db.js';
import { blobToBase64, base64ToBlob, downloadBlob, uuid } from './utils.js';

// JSON export/import — the sync story for this local-first app. Since
// everything lives in this browser's IndexedDB, exporting a JSON snapshot
// (photos and 3D scans included, base64-encoded) is how you back up the
// house record or move it to another device/browser.

async function blobFieldsToBase64(record, blobFields) {
  const out = { ...record };
  for (const field of blobFields) {
    if (out[field] instanceof Blob) {
      out[field] = { __blob: true, data: await blobToBase64(out[field]), type: out[field].type };
    }
  }
  return out;
}

function base64FieldsToBlob(record, blobFields) {
  const out = { ...record };
  for (const field of blobFields) {
    if (out[field] && out[field].__blob) {
      out[field] = base64ToBlob(out[field].data, out[field].type);
    }
  }
  return out;
}

export async function exportBackup() {
  const [rooms, equipment] = await Promise.all([RoomsDB.all(), EquipmentDB.all()]);
  const roomsOut = await Promise.all(rooms.map((r) => blobFieldsToBase64(r, ['modelBlob'])));
  const equipmentOut = await Promise.all(equipment.map((e) => blobFieldsToBase64(e, ['photoBlob'])));
  const payload = {
    app: 'jeffs-cool-app-idea',
    version: 1,
    exportedAt: new Date().toISOString(),
    rooms: roomsOut,
    equipment: equipmentOut,
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    `home-inventory-backup-${new Date().toISOString().slice(0, 10)}.json`
  );
}

export async function importBackup(file, { replaceExisting = false } = {}) {
  const text = await file.text();
  const payload = JSON.parse(text);
  if (payload.app !== 'jeffs-cool-app-idea') {
    throw new Error('This file does not look like a backup from this app.');
  }

  if (replaceExisting) {
    const [existingRooms, existingEquipment] = await Promise.all([RoomsDB.all(), EquipmentDB.all()]);
    await Promise.all(existingRooms.map((r) => RoomsDB.delete(r.id)));
    await Promise.all(existingEquipment.map((e) => EquipmentDB.delete(e.id)));
  }

  const idMap = new Map();
  for (const room of payload.rooms || []) {
    const restored = base64FieldsToBlob(room, ['modelBlob']);
    const newId = replaceExisting ? restored.id : uuid();
    idMap.set(room.id, newId);
    await RoomsDB.put({ ...restored, id: newId });
  }
  for (const item of payload.equipment || []) {
    const restored = base64FieldsToBlob(item, ['photoBlob']);
    const newId = replaceExisting ? restored.id : uuid();
    const roomId = restored.roomId && idMap.has(restored.roomId) ? idMap.get(restored.roomId) : restored.roomId;
    await EquipmentDB.put({ ...restored, id: newId, roomId });
  }

  return { rooms: (payload.rooms || []).length, equipment: (payload.equipment || []).length };
}
