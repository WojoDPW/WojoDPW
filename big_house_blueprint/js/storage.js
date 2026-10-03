import { storage } from './firebase-init.js';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { uuid } from './utils.js';

export async function uploadEquipmentPhoto(propertyId, equipmentId, file) {
  const path = `properties/${propertyId}/equipment/${equipmentId}/${uuid()}-${file.name}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type || 'image/jpeg' });
  const url = await getDownloadURL(fileRef);
  return { path, url };
}

export async function uploadRoomScan(propertyId, roomId, file) {
  const path = `properties/${propertyId}/rooms/${roomId}/${uuid()}-${file.name}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { path, url };
}

export async function deleteStorageFile(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    // Already gone, or never existed — fine either way.
  }
}
