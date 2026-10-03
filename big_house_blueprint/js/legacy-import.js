import { base64ToBlob, uuid } from './utils.js';
import { uploadRoomScan, uploadEquipmentPhoto } from './storage.js';
import { saveRoom, saveEquipment } from './data.js';

// Migrates a backup exported from the original single-user, local-only
// version of this app (IndexedDB + blobs, "version": 1) into a Firestore
// property: uploads any embedded photo/3D-scan blobs to Storage and
// creates the corresponding room/equipment documents.
export async function importLegacyBackup(file, propertyId, { onProgress } = {}) {
  const text = await file.text();
  const payload = JSON.parse(text);
  // 'jeffs-cool-app-idea' is what that original version's exports actually
  // say — it's a historical format marker, not the app's current name, so
  // it's intentionally left unchanged by the rename to Big House BluePrint.
  if (payload.app !== 'jeffs-cool-app-idea') {
    throw new Error('This file does not look like a backup from this app.');
  }

  const roomIdMap = new Map();
  let done = 0;
  const total = (payload.rooms || []).length + (payload.equipment || []).length;
  const tick = () => onProgress?.(++done, total);

  for (const room of payload.rooms || []) {
    const newId = uuid();
    roomIdMap.set(room.id, newId);
    const fields = { name: room.name, type: room.type || '', floor: room.floor || '', notes: room.notes || '' };
    if (room.modelBlob && room.modelBlob.__blob) {
      const blob = base64ToBlob(room.modelBlob.data, room.modelBlob.type);
      const file = new File([blob], room.modelFileName || 'scan.glb', { type: room.modelBlob.type });
      const { path, url } = await uploadRoomScan(propertyId, newId, file);
      fields.modelPath = path;
      fields.modelUrl = url;
      fields.modelFileName = room.modelFileName || file.name;
    }
    await saveRoom(propertyId, { id: newId, ...fields });
    tick();
  }

  for (const item of payload.equipment || []) {
    const newId = uuid();
    const roomId = item.roomId && roomIdMap.has(item.roomId) ? roomIdMap.get(item.roomId) : '';
    const fields = { ...item, id: newId, roomId };
    delete fields.photoBlob;
    if (item.photoBlob && item.photoBlob.__blob) {
      const blob = base64ToBlob(item.photoBlob.data, item.photoBlob.type);
      const file = new File([blob], 'photo.jpg', { type: item.photoBlob.type });
      const { path, url } = await uploadEquipmentPhoto(propertyId, newId, file);
      fields.photoPath = path;
      fields.photoUrl = url;
    }
    await saveEquipment(propertyId, fields);
    tick();
  }

  return { rooms: (payload.rooms || []).length, equipment: (payload.equipment || []).length };
}
