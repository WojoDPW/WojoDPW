import { db } from './firebase-init.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where,
  writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { uuid } from './utils.js';
import { deleteStorageFile } from './storage.js';

function lower(email) {
  return (email || '').trim().toLowerCase();
}

// ---------- users ----------

export async function ensureUserDoc(user) {
  await setDoc(doc(db, 'users', user.uid), {
    email: lower(user.email),
    displayName: user.displayName || '',
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function myMemberships(uid) {
  const snap = await getDocs(collection(db, `users/${uid}/memberships`));
  return snap.docs.map((d) => ({ propertyId: d.id, ...d.data() }));
}

// ---------- properties ----------

export async function createProperty({ name, address }, user) {
  const propertyId = uuid();
  const email = lower(user.email);
  const batch = writeBatch(db);
  batch.set(doc(db, 'properties', propertyId), {
    name, address: address || '', ownerUid: user.uid, ownerEmail: email, createdAt: serverTimestamp(),
  });
  batch.set(doc(db, `properties/${propertyId}/members`, user.uid), {
    role: 'owner', email, displayName: user.displayName || '', addedAt: serverTimestamp(),
  });
  batch.set(doc(db, `users/${user.uid}/memberships`, propertyId), {
    propertyId, propertyName: name, role: 'owner',
  });
  await batch.commit();
  return propertyId;
}

export async function getProperty(propertyId) {
  const snap = await getDoc(doc(db, 'properties', propertyId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updatePropertyDetails(propertyId, { name, address }) {
  await updateDoc(doc(db, 'properties', propertyId), { name, address });
}

export async function listMembers(propertyId) {
  const snap = await getDocs(collection(db, `properties/${propertyId}/members`));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// Owner removing someone ELSE: only the members/{uid} doc can be deleted
// (rules don't let the owner touch another user's own index). The removed
// member's "My Properties" list will self-heal next time it loads, since a
// membership entry that no longer resolves is simply skipped.
export async function removeMember(propertyId, memberUid) {
  await deleteDoc(doc(db, `properties/${propertyId}/members`, memberUid));
}

// A member leaving voluntarily: cleans up both their own docs.
export async function leaveProperty(propertyId, uid) {
  const batch = writeBatch(db);
  batch.delete(doc(db, `properties/${propertyId}/members`, uid));
  batch.delete(doc(db, `users/${uid}/memberships`, propertyId));
  await batch.commit();
}

// ---------- rooms ----------

export async function listRooms(propertyId) {
  const snap = await getDocs(collection(db, `properties/${propertyId}/rooms`));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveRoom(propertyId, room) {
  const { id, ...fields } = room;
  await setDoc(doc(db, `properties/${propertyId}/rooms`, id), fields, { merge: true });
  return id;
}

export async function deleteRoom(propertyId, roomId, modelPath) {
  await deleteDoc(doc(db, `properties/${propertyId}/rooms`, roomId));
  await deleteStorageFile(modelPath);
}

// ---------- equipment ----------

export async function listEquipment(propertyId) {
  const snap = await getDocs(collection(db, `properties/${propertyId}/equipment`));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function saveEquipment(propertyId, item) {
  const { id, ...fields } = item;
  await setDoc(doc(db, `properties/${propertyId}/equipment`, id), fields, { merge: true });
  return id;
}

export async function deleteEquipment(propertyId, equipmentId, photoPath) {
  await deleteDoc(doc(db, `properties/${propertyId}/equipment`, equipmentId));
  await deleteStorageFile(photoPath);
}

// ---------- invites (family, view-only) ----------

export function inviteDocId(propertyId, email) {
  return `${propertyId}__${lower(email)}`;
}

export async function createInvite(propertyId, propertyName, email, invitedBy) {
  const id = inviteDocId(propertyId, email);
  const emailLower = lower(email);
  const batch = writeBatch(db);
  batch.set(doc(db, 'invites', id), {
    propertyId, propertyName, email: emailLower, role: 'viewer',
    invitedByUid: invitedBy.uid, invitedByEmail: lower(invitedBy.email),
    status: 'pending', createdAt: serverTimestamp(),
  });
  // Path-scoped mirror so the owner can list pending invites without a
  // content-filtered query against the top-level invites collection.
  batch.set(doc(db, `properties/${propertyId}/pendingInvites`, emailLower), {
    email: emailLower, createdAt: serverTimestamp(),
  });
  await batch.commit();
  return id;
}

export async function listInvitesForProperty(propertyId) {
  const snap = await getDocs(collection(db, `properties/${propertyId}/pendingInvites`));
  return snap.docs.map((d) => ({ email: d.id, ...d.data() }));
}

export async function listPendingInvitesForEmail(email) {
  const snap = await getDocs(query(
    collection(db, 'invites'),
    where('email', '==', lower(email)),
    where('status', '==', 'pending')
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function acceptInvite(invite, user) {
  const batch = writeBatch(db);
  const email = lower(user.email);
  batch.set(doc(db, `properties/${invite.propertyId}/members`, user.uid), {
    role: 'viewer', email, displayName: user.displayName || '', addedAt: serverTimestamp(),
  });
  batch.set(doc(db, `users/${user.uid}/memberships`, invite.propertyId), {
    propertyId: invite.propertyId, propertyName: invite.propertyName, role: 'viewer',
  });
  batch.update(doc(db, 'invites', invite.id), { status: 'accepted', acceptedAt: serverTimestamp() });
  batch.delete(doc(db, `properties/${invite.propertyId}/pendingInvites`, email));
  await batch.commit();
}

export async function revokeInvite(propertyId, email) {
  const emailLower = lower(email);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'invites', inviteDocId(propertyId, emailLower)));
  batch.delete(doc(db, `properties/${propertyId}/pendingInvites`, emailLower));
  await batch.commit();
}

export async function declineInvite(invite) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'invites', invite.id));
  batch.delete(doc(db, `properties/${invite.propertyId}/pendingInvites`, invite.email));
  await batch.commit();
}

// ---------- ownership transfer ----------

export function transferDocId(propertyId, email) {
  return `${propertyId}__${lower(email)}`;
}

export async function createTransferRequest(propertyId, propertyName, toEmail, fromUser) {
  const id = transferDocId(propertyId, toEmail);
  const batch = writeBatch(db);
  batch.set(doc(db, 'transferRequests', id), {
    propertyId, propertyName, fromUid: fromUser.uid, fromEmail: lower(fromUser.email),
    toEmail: lower(toEmail), status: 'pending', createdAt: serverTimestamp(),
  });
  // Tracked on the property itself so the owner can look up the single
  // active transfer by direct ID (a plain get, never a content-filtered
  // query against the top-level transferRequests collection).
  batch.update(doc(db, 'properties', propertyId), { pendingTransferId: id });
  await batch.commit();
  return id;
}

export async function getTransferForProperty(propertyId) {
  const property = await getProperty(propertyId);
  if (!property?.pendingTransferId) return null;
  const snap = await getDoc(doc(db, 'transferRequests', property.pendingTransferId));
  if (!snap.exists() || snap.data().status !== 'pending') return null;
  return { id: snap.id, ...snap.data() };
}

export async function listPendingTransfersForEmail(email) {
  const snap = await getDocs(query(
    collection(db, 'transferRequests'),
    where('toEmail', '==', lower(email)),
    where('status', '==', 'pending')
  ));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function cancelTransfer(transfer) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'transferRequests', transfer.id));
  batch.update(doc(db, 'properties', transfer.propertyId), { pendingTransferId: null });
  await batch.commit();
}

export async function declineTransfer(transferId) {
  // The declining buyer isn't the owner, so they can't clear the property's
  // pendingTransferId pointer — it's left stale, and getTransferForProperty
  // already treats a missing/non-pending referenced doc as "no transfer".
  await deleteDoc(doc(db, 'transferRequests', transferId));
}

/**
 * Buyer accepts a pending transfer: installs themselves as owner and fully
 * revokes every existing member (previous owner + any family viewers).
 */
export async function acceptTransfer(transfer, buyer) {
  const members = await listMembers(transfer.propertyId);
  const batch = writeBatch(db);
  const email = lower(buyer.email);

  batch.update(doc(db, 'properties', transfer.propertyId), { ownerUid: buyer.uid, ownerEmail: email, pendingTransferId: null });
  batch.set(doc(db, `properties/${transfer.propertyId}/members`, buyer.uid), {
    role: 'owner', email, displayName: buyer.displayName || '', addedAt: serverTimestamp(),
  });

  for (const member of members) {
    if (member.uid === buyer.uid) continue;
    batch.delete(doc(db, `properties/${transfer.propertyId}/members`, member.uid));
    batch.delete(doc(db, `users/${member.uid}/memberships`, transfer.propertyId));
  }

  batch.set(doc(db, `users/${buyer.uid}/memberships`, transfer.propertyId), {
    propertyId: transfer.propertyId, propertyName: transfer.propertyName, role: 'owner',
  });
  batch.update(doc(db, 'transferRequests', transfer.id), { status: 'accepted', acceptedAt: serverTimestamp() });

  await batch.commit();
}
