import { isFirebaseConfigured } from './firebase-init.js';
import {
  watchAuth, signUp, signIn, signOutUser, resendVerificationEmail, resetPassword, refreshAuthToken,
} from './auth.js';
import {
  ensureUserDoc, myMemberships, createProperty, getProperty, updatePropertyDetails,
  listMembers, removeMember, leaveProperty,
  listRooms, saveRoom, deleteRoom,
  listEquipment, saveEquipment, deleteEquipment,
  createInvite, listInvitesForProperty, listPendingInvitesForEmail, acceptInvite, revokeInvite, declineInvite,
  createTransferRequest, getTransferForProperty, listPendingTransfersForEmail, cancelTransfer, declineTransfer, acceptTransfer,
} from './data.js';
import { uploadEquipmentPhoto, uploadRoomScan, deleteStorageFile } from './storage.js';
import { uuid, escapeHtml, formatDate, warrantyStatus, todayISO, addMonths } from './utils.js';
import {
  openRoomForm, openEquipmentForm, openMaintenanceTaskForm, confirmDialog,
  openPropertyForm, openInviteForm, openTransferForm,
} from './forms.js';
import { openModal, closeModal } from './modal.js';
import { createRoomViewer, formatFromFilename } from './viewer3d.js';
import { downloadICS } from './ical.js';
import { exportPropertyBackup } from './backup.js';
import { importLegacyBackup } from './legacy-import.js';
import { getLocalSetting, setLocalSetting } from './local-settings.js';

const state = {
  user: null,
  route: 'loading',
  myProperties: [],
  pendingInvites: [],
  pendingTransfers: [],
  propertyId: null,
  property: null,
  role: null,
  rooms: [],
  equipment: [],
  selectedRoomId: null,
  search: '',
  roomFilter: '',
  categoryFilter: '',
};

let activeViewer = null;

function isOwner() {
  return state.role === 'owner';
}

function roomsById() {
  return new Map(state.rooms.map((r) => [r.id, r]));
}

// ---------- bootstrap / auth ----------

async function init() {
  if (!isFirebaseConfigured) {
    document.getElementById('main').innerHTML = `
      <section class="panel">
        <h1>Firebase isn't configured yet</h1>
        <p class="muted">Paste your Firebase project's web app config into <code>js/firebase-config.js</code>, then reload. See the README for the full setup checklist.</p>
      </section>`;
    return;
  }
  watchAuth(onAuthChanged);
  document.querySelectorAll('.nav-tab').forEach((el) => {
    el.addEventListener('click', () => setRoute(el.dataset.route));
  });
  document.getElementById('properties-nav-btn').addEventListener('click', () => setRoute('properties'));
  document.getElementById('signout-btn').addEventListener('click', async () => {
    await signOutUser();
  });
}

async function onAuthChanged(user) {
  state.user = user;
  if (!user) {
    state.propertyId = null;
    state.property = null;
    state.role = null;
    setRoute('auth');
    return;
  }
  await ensureUserDoc(user);
  document.getElementById('app-header-signed-in').style.display = '';
  await refreshAccessAndRoute();
}

async function refreshAccessAndRoute() {
  // Re-fetch profile + force a fresh ID token first: email_verified can go
  // stale in both the cached User object and the token's own claims (see
  // refreshAuthToken's comment), and this is called every time pending
  // invites/transfers are (re-)checked, including after returning from
  // verifying in another tab without a full page reload.
  await refreshAuthToken();
  const [memberships, invites, transfers] = await Promise.all([
    myMemberships(state.user.uid),
    state.user.emailVerified ? listPendingInvitesForEmail(state.user.email) : Promise.resolve([]),
    state.user.emailVerified ? listPendingTransfersForEmail(state.user.email) : Promise.resolve([]),
  ]);
  state.myProperties = memberships;
  state.pendingInvites = invites;
  state.pendingTransfers = transfers;
  updateNotificationBadge();

  if (state.propertyId && memberships.some((m) => m.propertyId === state.propertyId)) {
    setRoute(state.route === 'loading' || state.route === 'auth' || state.route === 'properties' ? 'dashboard' : state.route);
    return;
  }
  if (memberships.length === 1) {
    await openProperty(memberships[0].propertyId);
    return;
  }
  setRoute('properties');
}

function updateNotificationBadge() {
  const count = state.pendingInvites.length + state.pendingTransfers.length;
  const badge = document.getElementById('notification-badge');
  badge.textContent = count > 0 ? String(count) : '';
  badge.style.display = count > 0 ? '' : 'none';
}

async function openProperty(propertyId) {
  try {
    const property = await getProperty(propertyId);
    if (!property) throw new Error('not found');
    const members = await listMembers(propertyId);
    const me = members.find((m) => m.uid === state.user.uid);
    state.propertyId = propertyId;
    state.property = property;
    state.role = me ? me.role : (state.myProperties.find((m) => m.propertyId === propertyId)?.role || 'viewer');
    await loadPropertyData();
    setRoute('dashboard');
  } catch (err) {
    // Stale membership index (e.g. access was revoked) — clean it up and bounce back.
    await leaveProperty(propertyId, state.user.uid).catch(() => {});
    await refreshAccessAndRoute();
  }
}

async function loadPropertyData() {
  const [rooms, equipment] = await Promise.all([listRooms(state.propertyId), listEquipment(state.propertyId)]);
  state.rooms = rooms.sort((a, b) => a.name.localeCompare(b.name));
  state.equipment = equipment.sort((a, b) => a.name.localeCompare(b.name));
}

function setRoute(route, params = {}) {
  state.route = route;
  Object.assign(state, params);
  const inProperty = ['dashboard', 'rooms', 'room-detail', 'equipment', 'maintenance', 'settings'].includes(route);
  document.getElementById('nav-tabs').style.display = inProperty ? '' : 'none';
  document.querySelectorAll('.nav-tab').forEach((el) => el.classList.toggle('active', el.dataset.route === route));
  render();
}

// ---------- top-level render dispatch ----------

function render() {
  if (activeViewer) {
    activeViewer.dispose();
    activeViewer = null;
  }
  const main = document.getElementById('main');
  switch (state.route) {
    case 'auth':
      main.innerHTML = renderAuth();
      wireAuth(main);
      break;
    case 'properties':
      main.innerHTML = renderProperties();
      wireProperties(main);
      break;
    case 'rooms':
      main.innerHTML = renderRooms();
      wireRooms(main);
      break;
    case 'room-detail':
      main.innerHTML = renderRoomDetail();
      wireRoomDetail(main);
      break;
    case 'equipment':
      main.innerHTML = renderEquipmentList();
      wireEquipmentList(main);
      break;
    case 'maintenance':
      main.innerHTML = renderMaintenance();
      wireMaintenance(main);
      break;
    case 'settings':
      main.innerHTML = renderSettings();
      wireSettings(main);
      break;
    case 'dashboard':
      main.innerHTML = renderDashboard();
      wireDashboard(main);
      break;
    default:
      main.innerHTML = '<p class="muted">Loading…</p>';
  }
}

// ---------- auth screen ----------

function renderAuth() {
  return `
    <section class="panel auth-panel">
      <h1>🏠 Jeff's Cool App Idea</h1>
      <p class="muted">Sign in or create an account to access your home inventory.</p>
      <div class="auth-tabs">
        <button class="btn ghost auth-tab active" data-mode="signin">Sign in</button>
        <button class="btn ghost auth-tab" data-mode="signup">Create account</button>
      </div>
      <form id="auth-form" class="form-grid">
        <label class="field" id="displayname-field" style="display:none"><span>Your name</span><input name="displayName" placeholder="Jane Smith"></label>
        <label class="field"><span>Email</span><input name="email" type="email" required></label>
        <label class="field"><span>Password</span><input name="password" type="password" required minlength="6"></label>
        <div id="auth-error"></div>
        <div class="form-actions">
          <button type="button" class="btn link" id="forgot-btn">Forgot password?</button>
          <button type="submit" class="btn primary" id="auth-submit-btn">Sign in</button>
        </div>
      </form>
    </section>
  `;
}

function wireAuth(main) {
  let mode = 'signin';
  const tabs = main.querySelectorAll('.auth-tab');
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    mode = tab.dataset.mode;
    tabs.forEach((t) => t.classList.toggle('active', t === tab));
    main.querySelector('#displayname-field').style.display = mode === 'signup' ? '' : 'none';
    main.querySelector('#auth-submit-btn').textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    main.querySelector('#auth-error').innerHTML = '';
  }));

  main.querySelector('#forgot-btn').addEventListener('click', async () => {
    const email = main.querySelector('[name=email]').value.trim();
    if (!email) {
      main.querySelector('#auth-error').innerHTML = `<p class="error">Enter your email first.</p>`;
      return;
    }
    try {
      await resetPassword(email);
      main.querySelector('#auth-error').innerHTML = `<p class="success">Password reset email sent.</p>`;
    } catch (err) {
      main.querySelector('#auth-error').innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  });

  main.querySelector('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('email').trim();
    const password = fd.get('password');
    const errBox = main.querySelector('#auth-error');
    errBox.innerHTML = '';
    try {
      if (mode === 'signup') {
        await signUp(email, password, fd.get('displayName').trim());
        errBox.innerHTML = `<p class="success">Account created! Check your email to verify it.</p>`;
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      errBox.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  });
}

// ---------- properties picker / invites / transfers ----------

function renderProperties() {
  const verifyBanner = !state.user.emailVerified ? `
    <section class="panel warning-panel">
      <p><strong>Verify your email</strong> to see and accept invitations or property transfers addressed to you.</p>
      <button class="btn ghost" id="resend-verify-btn">Resend verification email</button>
    </section>` : '';

  return `
    ${verifyBanner}
    ${state.pendingTransfers.length ? `
    <section class="panel warning-panel">
      <h2>Pending ownership transfers</h2>
      ${state.pendingTransfers.map((t) => `
        <div class="invite-row">
          <div>
            <strong>${escapeHtml(t.propertyName)}</strong>
            <p class="muted">Offered to you by ${escapeHtml(t.fromEmail)}. Accepting will revoke the current owner's and any family members' access, permanently.</p>
          </div>
          <div class="card-actions">
            <button class="btn danger" data-accept-transfer="${t.id}">Accept transfer</button>
            <button class="btn ghost" data-decline-transfer="${t.id}">Decline</button>
          </div>
        </div>`).join('')}
    </section>` : ''}

    ${state.pendingInvites.length ? `
    <section class="panel">
      <h2>Pending invitations</h2>
      ${state.pendingInvites.map((inv) => `
        <div class="invite-row">
          <div><strong>${escapeHtml(inv.propertyName)}</strong><p class="muted">Invited by ${escapeHtml(inv.invitedByEmail)} — view-only access</p></div>
          <div class="card-actions">
            <button class="btn primary" data-accept-invite="${inv.id}">Accept</button>
            <button class="btn ghost" data-decline-invite="${inv.id}">Decline</button>
          </div>
        </div>`).join('')}
    </section>` : ''}

    <section class="panel">
      <div class="panel-header">
        <h1>My properties</h1>
        <button class="btn primary" id="create-property-btn">+ Add a property</button>
      </div>
      ${state.myProperties.length ? `<div class="card-grid">${state.myProperties.map((m) => `
        <div class="card property-card" data-open-property="${m.propertyId}">
          <h3>${escapeHtml(m.propertyName)}</h3>
          <span class="badge muted">${escapeHtml(m.role)}</span>
        </div>`).join('')}</div>` : '<p class="muted">No properties yet. Add your own, or accept an invitation above.</p>'}
    </section>
  `;
}

function wireProperties(main) {
  main.querySelector('#resend-verify-btn')?.addEventListener('click', async () => {
    await resendVerificationEmail();
    alert('Verification email sent.');
  });
  main.querySelector('#create-property-btn').addEventListener('click', () => {
    openPropertyForm(null, {
      onSave: async ({ name, address }) => {
        const propertyId = await createProperty({ name, address }, state.user);
        await refreshAccessAndRoute();
        await openProperty(propertyId);
      },
    });
  });
  main.querySelectorAll('[data-open-property]').forEach((el) =>
    el.addEventListener('click', () => openProperty(el.dataset.openProperty))
  );
  main.querySelectorAll('[data-accept-invite]').forEach((el) =>
    el.addEventListener('click', async () => {
      const invite = state.pendingInvites.find((i) => i.id === el.dataset.acceptInvite);
      await acceptInvite(invite, state.user);
      await refreshAccessAndRoute();
      await openProperty(invite.propertyId);
    })
  );
  main.querySelectorAll('[data-decline-invite]').forEach((el) =>
    el.addEventListener('click', async () => {
      const invite = state.pendingInvites.find((i) => i.id === el.dataset.declineInvite);
      await declineInvite(invite);
      await refreshAccessAndRoute();
    })
  );
  main.querySelectorAll('[data-accept-transfer]').forEach((el) =>
    el.addEventListener('click', () => {
      const transfer = state.pendingTransfers.find((t) => t.id === el.dataset.acceptTransfer);
      confirmDialog(
        `Accept ownership of "${transfer.propertyName}"? The current owner and any family members will immediately and permanently lose access.`,
        {
          confirmLabel: 'Accept transfer',
          onConfirm: async () => {
            await acceptTransfer(transfer, state.user);
            await refreshAccessAndRoute();
            await openProperty(transfer.propertyId);
          },
        }
      );
    })
  );
  main.querySelectorAll('[data-decline-transfer]').forEach((el) =>
    el.addEventListener('click', async () => {
      await declineTransfer(el.dataset.declineTransfer);
      await refreshAccessAndRoute();
    })
  );
}

// ---------- dashboard ----------

function allTasksFlat() {
  const rooms = roomsById();
  const out = [];
  for (const item of state.equipment) {
    for (const task of item.maintenanceTasks || []) {
      out.push({ task, item, room: rooms.get(item.roomId) });
    }
  }
  return out.sort((a, b) => (a.task.anchorDate || '').localeCompare(b.task.anchorDate || ''));
}

function renderDashboard() {
  const expiringSoon = state.equipment
    .map((item) => ({ item, status: warrantyStatus(item) }))
    .filter((x) => x.status.tone === 'warning' || x.status.tone === 'danger')
    .sort((a, b) => (a.status.expiration || '').localeCompare(b.status.expiration || ''));

  const upcoming = allTasksFlat().filter((x) => x.task.anchorDate && x.task.anchorDate <= addMonths(todayISO(), 1));

  return `
    <section class="panel">
      <div class="panel-header">
        <h1>${escapeHtml(state.property.name)}</h1>
        <span class="badge muted">${escapeHtml(state.role)}</span>
      </div>
      <div class="stat-row">
        <div class="stat"><strong>${state.rooms.length}</strong><span>Rooms</span></div>
        <div class="stat"><strong>${state.equipment.length}</strong><span>Items registered</span></div>
        <div class="stat"><strong>${expiringSoon.length}</strong><span>Warranties expiring/expired</span></div>
        <div class="stat"><strong>${upcoming.length}</strong><span>Maintenance due this month</span></div>
      </div>
    </section>

    <section class="panel">
      <h2>Upcoming maintenance</h2>
      ${upcoming.length ? `<ul class="task-list">${upcoming.map((x) => taskRowHtml(x)).join('')}</ul>` : '<p class="muted">Nothing due in the next 30 days.</p>'}
    </section>

    <section class="panel">
      <h2>Warranty watch</h2>
      ${expiringSoon.length ? `<ul class="task-list">${expiringSoon.map((x) => `
        <li class="task-row" data-open-equipment="${x.item.id}">
          <span class="badge ${x.status.tone}">${escapeHtml(x.status.label)}</span>
          <span>${escapeHtml(x.item.name)}</span>
          <span class="muted">${formatDate(x.status.expiration)}</span>
        </li>`).join('')}</ul>` : '<p class="muted">No warranties expiring soon.</p>'}
    </section>
  `;
}

function taskRowHtml({ task, item, room }) {
  const overdue = task.anchorDate < todayISO();
  return `<li class="task-row" data-open-equipment="${item.id}">
    <span class="badge ${overdue ? 'danger' : 'muted'}">${formatDate(task.anchorDate)}</span>
    <span>${escapeHtml(task.title)} — ${escapeHtml(item.name)}</span>
    <span class="muted">${room ? escapeHtml(room.name) : ''}</span>
  </li>`;
}

function wireDashboard(main) {
  main.querySelectorAll('[data-open-equipment]').forEach((el) =>
    el.addEventListener('click', () => openEquipmentDetail(el.dataset.openEquipment))
  );
}

// ---------- rooms ----------

function renderRooms() {
  return `
    <section class="panel">
      <div class="panel-header">
        <h1>Rooms &amp; exterior</h1>
        ${isOwner() ? '<button class="btn primary" id="add-room-btn">+ Add room</button>' : ''}
      </div>
      ${state.rooms.length ? `<div class="card-grid">${state.rooms.map(roomCardHtml).join('')}</div>` : `<p class="muted">No rooms yet.${isOwner() ? ' Add your rooms (and the exterior) to start organizing equipment by location.' : ''}</p>`}
    </section>
  `;
}

function roomCardHtml(room) {
  const count = state.equipment.filter((e) => e.roomId === room.id).length;
  return `<div class="card room-card" data-room-id="${room.id}">
    <h3>${escapeHtml(room.name)}</h3>
    <p class="muted">${escapeHtml(room.type || '')} ${room.floor ? '· ' + escapeHtml(room.floor) : ''}</p>
    <p>${count} item${count === 1 ? '' : 's'}</p>
    <p class="muted">${room.modelFileName ? '🧊 3D scan uploaded' : 'No 3D scan yet'}</p>
    <div class="card-actions">
      <button class="btn ghost" data-view-room="${room.id}">View</button>
      ${isOwner() ? `<button class="btn ghost" data-edit-room="${room.id}">Edit</button>
      <button class="btn ghost danger" data-delete-room="${room.id}">Delete</button>` : ''}
    </div>
  </div>`;
}

function wireRooms(main) {
  main.querySelector('#add-room-btn')?.addEventListener('click', () => {
    openRoomForm(null, { onSave: (room, file) => saveRoomWithUpload(room, file) });
  });
  main.querySelectorAll('[data-view-room]').forEach((el) =>
    el.addEventListener('click', () => setRoute('room-detail', { selectedRoomId: el.dataset.viewRoom }))
  );
  main.querySelectorAll('[data-edit-room]').forEach((el) =>
    el.addEventListener('click', () => {
      const room = state.rooms.find((r) => r.id === el.dataset.editRoom);
      openRoomForm(room, { onSave: (updated, file) => saveRoomWithUpload(updated, file) });
    })
  );
  main.querySelectorAll('[data-delete-room]').forEach((el) =>
    el.addEventListener('click', () => {
      confirmDialog('Delete this room? Equipment assigned to it will become unassigned.', {
        onConfirm: () => deleteRoomAndReload(el.dataset.deleteRoom),
      });
    })
  );
}

async function saveRoomWithUpload(room, file) {
  if (file) {
    const old = state.rooms.find((r) => r.id === room.id);
    const { path, url } = await uploadRoomScan(state.propertyId, room.id, file);
    room.modelPath = path;
    room.modelUrl = url;
    room.modelFileName = file.name;
    if (old?.modelPath && old.modelPath !== path) await deleteStorageFile(old.modelPath);
  }
  await saveRoom(state.propertyId, room);
  await loadPropertyData();
  render();
}

async function deleteRoomAndReload(roomId) {
  const room = state.rooms.find((r) => r.id === roomId);
  const affected = state.equipment.filter((e) => e.roomId === roomId);
  await Promise.all(affected.map((e) => saveEquipment(state.propertyId, { ...e, roomId: '' })));
  await deleteRoom(state.propertyId, roomId, room?.modelPath);
  await loadPropertyData();
  setRoute('rooms');
}

// ---------- room detail (3D viewer) ----------

function renderRoomDetail() {
  const room = state.rooms.find((r) => r.id === state.selectedRoomId);
  if (!room) return `<p class="muted">Room not found.</p>`;
  const items = state.equipment.filter((e) => e.roomId === room.id);
  return `
    <section class="panel">
      <div class="panel-header">
        <h1>${escapeHtml(room.name)}</h1>
        <div>
          <button class="btn ghost" id="back-to-rooms">← All rooms</button>
          ${isOwner() ? '<button class="btn primary" id="add-equipment-here">+ Add equipment here</button>' : ''}
        </div>
      </div>
      <div class="room-detail-grid">
        <div class="viewer-column">
          <div id="viewer-container" class="viewer-container"></div>
          ${room.modelFileName
            ? (isOwner() ? `<p class="muted">Scan file: ${escapeHtml(room.modelFileName)} — <button class="btn link" id="replace-scan">Replace</button></p>` : `<p class="muted">Scan file: ${escapeHtml(room.modelFileName)}</p>`)
            : (isOwner() ? `<button class="btn ghost" id="upload-scan">Upload 3D scan (.glb/.gltf/.obj)</button>` : `<p class="muted">No 3D scan uploaded for this room yet.</p>`)}
        </div>
        <div class="equipment-column">
          <h2>Equipment in this room (${items.length})</h2>
          ${items.length ? `<ul class="equipment-list">${items.map(equipmentRowHtml).join('')}</ul>` : '<p class="muted">Nothing registered in this room yet.</p>'}
        </div>
      </div>
    </section>
  `;
}

function wireRoomDetail(main) {
  const room = state.rooms.find((r) => r.id === state.selectedRoomId);
  main.querySelector('#back-to-rooms').addEventListener('click', () => setRoute('rooms'));
  main.querySelector('#add-equipment-here')?.addEventListener('click', () => {
    openEquipmentForm({ roomId: room.id }, state.rooms, { onSave: (item, file) => saveEquipmentWithUpload(item, file) });
  });
  main.querySelectorAll('[data-open-equipment]').forEach((el) =>
    el.addEventListener('click', () => openEquipmentDetail(el.dataset.openEquipment))
  );

  const container = main.querySelector('#viewer-container');
  if (room.modelUrl) {
    container.innerHTML = '<p class="muted">Loading 3D model…</p>';
    createRoomViewer(container)
      .then(async (viewer) => {
        activeViewer = viewer;
        await viewer.loadModel(room.modelUrl, formatFromFilename(room.modelFileName));
      })
      .catch((err) => {
        container.innerHTML = `<p class="error">Couldn't load 3D model: ${escapeHtml(err.message)}</p>`;
      });
  } else {
    container.innerHTML = `<div class="viewer-placeholder">
      <p>No 3D scan uploaded for this room yet.</p>
      <p class="muted">Scan it with a LiDAR app (Polycam, 3D Scanner App, or anything that can export <code>.glb</code>/<code>.gltf</code>/<code>.obj</code>), then upload the export here.</p>
    </div>`;
  }

  const uploadBtn = main.querySelector('#upload-scan') || main.querySelector('#replace-scan');
  uploadBtn?.addEventListener('click', () => {
    openRoomForm(room, { onSave: (updated, file) => saveRoomWithUpload(updated, file) });
  });
}

function equipmentRowHtml(item) {
  const status = warrantyStatus(item);
  return `<li class="equipment-row" data-open-equipment="${item.id}">
    <span>${escapeHtml(item.name)}</span>
    <span class="muted">${escapeHtml(item.category || '')}</span>
    <span class="badge ${status.tone}">${escapeHtml(status.label)}</span>
  </li>`;
}

// ---------- equipment list ----------

function renderEquipmentList() {
  const categories = [...new Set(state.equipment.map((e) => e.category).filter(Boolean))].sort();
  const filtered = state.equipment.filter((item) => {
    const hay = `${item.name} ${item.manufacturer} ${item.modelNumber} ${item.serialNumber}`.toLowerCase();
    if (state.search && !hay.includes(state.search.toLowerCase())) return false;
    if (state.roomFilter && item.roomId !== state.roomFilter) return false;
    if (state.categoryFilter && item.category !== state.categoryFilter) return false;
    return true;
  });
  const rooms = roomsById();

  return `
    <section class="panel">
      <div class="panel-header">
        <h1>Equipment registry</h1>
        ${isOwner() ? '<button class="btn primary" id="add-equipment-btn">+ Add equipment</button>' : ''}
      </div>
      <div class="filter-row">
        <input id="search-input" type="search" placeholder="Search name, manufacturer, model, serial…" value="${escapeHtml(state.search)}">
        <select id="room-filter">
          <option value="">All rooms</option>
          ${state.rooms.map((r) => `<option value="${r.id}" ${state.roomFilter === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
        </select>
        <select id="category-filter">
          <option value="">All categories</option>
          ${categories.map((c) => `<option value="${escapeHtml(c)}" ${state.categoryFilter === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
      </div>
      ${filtered.length ? `<ul class="equipment-list wide">${filtered.map((item) => `
        <li class="equipment-row" data-open-equipment="${item.id}">
          <span>${escapeHtml(item.name)}</span>
          <span class="muted">${escapeHtml(item.category || '—')}</span>
          <span class="muted">${escapeHtml(rooms.get(item.roomId)?.name || 'Unassigned')}</span>
          <span class="muted">${escapeHtml([item.manufacturer, item.modelNumber].filter(Boolean).join(' ') || '—')}</span>
          <span class="badge ${warrantyStatus(item).tone}">${escapeHtml(warrantyStatus(item).label)}</span>
        </li>`).join('')}</ul>` : '<p class="muted">No equipment matches.</p>'}
    </section>
  `;
}

function wireEquipmentList(main) {
  main.querySelector('#add-equipment-btn')?.addEventListener('click', () => {
    openEquipmentForm(null, state.rooms, { onSave: (item, file) => saveEquipmentWithUpload(item, file) });
  });
  main.querySelector('#search-input').addEventListener('input', (e) => { state.search = e.target.value; render(); });
  main.querySelector('#room-filter').addEventListener('change', (e) => { state.roomFilter = e.target.value; render(); });
  main.querySelector('#category-filter').addEventListener('change', (e) => { state.categoryFilter = e.target.value; render(); });
  main.querySelectorAll('[data-open-equipment]').forEach((el) =>
    el.addEventListener('click', () => openEquipmentDetail(el.dataset.openEquipment))
  );
}

async function saveEquipmentWithUpload(item, file) {
  if (file) {
    const old = state.equipment.find((e) => e.id === item.id);
    const { path, url } = await uploadEquipmentPhoto(state.propertyId, item.id, file);
    item.photoPath = path;
    item.photoUrl = url;
    if (old?.photoPath && old.photoPath !== path) await deleteStorageFile(old.photoPath);
  }
  await saveEquipment(state.propertyId, item);
  await loadPropertyData();
  render();
}

async function deleteEquipmentAndReload(id) {
  const item = state.equipment.find((e) => e.id === id);
  await deleteEquipment(state.propertyId, id, item?.photoPath);
  await loadPropertyData();
  render();
}

// ---------- equipment detail modal ----------

function openEquipmentDetail(id) {
  const item = state.equipment.find((e) => e.id === id);
  if (item) renderEquipmentDetailModal(item);
}

function renderEquipmentDetailModal(item) {
  const room = state.rooms.find((r) => r.id === item.roomId);
  const status = warrantyStatus(item);

  const card = openModal(`
    <div class="equipment-detail">
      ${item.photoUrl ? `<img class="equipment-photo" src="${item.photoUrl}" alt="${escapeHtml(item.name)}">` : ''}
      <h2>${escapeHtml(item.name)}</h2>
      <p class="muted">${escapeHtml(item.category || '')} ${room ? '· ' + escapeHtml(room.name) : ''}</p>
      <span class="badge ${status.tone}">${escapeHtml(status.label)}${status.expiration ? ' · ' + formatDate(status.expiration) : ''}</span>

      <dl class="detail-grid">
        <dt>Manufacturer</dt><dd>${escapeHtml(item.manufacturer || '—')}</dd>
        <dt>Model number</dt><dd>${escapeHtml(item.modelNumber || '—')}</dd>
        <dt>Serial number</dt><dd>${escapeHtml(item.serialNumber || '—')}</dd>
        <dt>Year manufactured</dt><dd>${escapeHtml(item.yearManufactured || '—')}</dd>
        <dt>Installed</dt><dd>${formatDate(item.installDate)}</dd>
        <dt>Purchased</dt><dd>${formatDate(item.purchaseDate)} ${item.retailer ? 'from ' + escapeHtml(item.retailer) : ''} ${item.purchasePrice ? '· $' + escapeHtml(item.purchasePrice) : ''}</dd>
      </dl>

      <div class="link-row">
        ${item.supportPhone ? `<a class="btn ghost" href="tel:${escapeHtml(item.supportPhone)}">📞 Call support: ${escapeHtml(item.supportPhone)}</a>` : ''}
        ${item.supportWebsite ? `<a class="btn ghost" href="${escapeHtml(item.supportWebsite)}" target="_blank" rel="noopener">Manufacturer site</a>` : ''}
        ${item.troubleshootingUrl ? `<a class="btn ghost" href="${escapeHtml(item.troubleshootingUrl)}" target="_blank" rel="noopener">Troubleshooting</a>` : ''}
        ${item.manualUrl ? `<a class="btn ghost" href="${escapeHtml(item.manualUrl)}" target="_blank" rel="noopener">Manual</a>` : ''}
      </div>

      ${item.notes ? `<p class="notes">${escapeHtml(item.notes)}</p>` : ''}

      <h3>Maintenance tasks</h3>
      <ul class="task-list" id="task-list">
        ${(item.maintenanceTasks || []).map((t) => taskEditRowHtml(item, t)).join('') || '<li class="muted">No recurring maintenance scheduled.</li>'}
      </ul>
      ${isOwner() ? '<button class="btn ghost" id="add-task-btn">+ Add maintenance task</button>' : ''}

      ${isOwner() ? `<div class="form-actions">
        <button class="btn ghost" id="edit-equipment-btn">Edit</button>
        <button class="btn ghost danger" id="delete-equipment-btn">Delete</button>
      </div>` : ''}
    </div>
  `);

  card.querySelector('#edit-equipment-btn')?.addEventListener('click', () => {
    openEquipmentForm(item, state.rooms, { onSave: (updated, file) => saveEquipmentWithUpload(updated, file) });
  });
  card.querySelector('#delete-equipment-btn')?.addEventListener('click', () => {
    confirmDialog(`Delete "${item.name}"? This can't be undone.`, { onConfirm: () => deleteEquipmentAndReload(item.id) });
  });
  card.querySelector('#add-task-btn')?.addEventListener('click', () => {
    openMaintenanceTaskForm(item, null, {
      onSave: async (task) => {
        const updated = { ...item, maintenanceTasks: [...(item.maintenanceTasks || []), task] };
        await saveEquipment(state.propertyId, updated);
        await loadPropertyData();
        openEquipmentDetail(item.id);
      },
    });
  });
  if (isOwner()) wireTaskRowButtons(card, item);
}

function taskEditRowHtml(item, task) {
  const overdue = task.anchorDate < todayISO();
  return `<li class="task-row">
    <span class="badge ${overdue ? 'danger' : 'muted'}">${formatDate(task.anchorDate)}</span>
    <span>${escapeHtml(task.title)} <span class="muted">(every ${task.intervalValue} ${escapeHtml(task.intervalUnit)})</span></span>
    ${isOwner() ? `<button class="btn link" data-edit-task="${task.id}">Edit</button>
    <button class="btn link danger" data-delete-task="${task.id}">Delete</button>` : ''}
  </li>`;
}

function wireTaskRowButtons(card, item) {
  card.querySelectorAll('[data-edit-task]').forEach((el) =>
    el.addEventListener('click', () => {
      const task = (item.maintenanceTasks || []).find((t) => t.id === el.dataset.editTask);
      openMaintenanceTaskForm(item, task, {
        onSave: async (updatedTask) => {
          const updated = { ...item, maintenanceTasks: item.maintenanceTasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)) };
          await saveEquipment(state.propertyId, updated);
          await loadPropertyData();
          openEquipmentDetail(item.id);
        },
      });
    })
  );
  card.querySelectorAll('[data-delete-task]').forEach((el) =>
    el.addEventListener('click', () => {
      confirmDialog('Delete this maintenance task?', {
        onConfirm: async () => {
          const updated = { ...item, maintenanceTasks: item.maintenanceTasks.filter((t) => t.id !== el.dataset.deleteTask) };
          await saveEquipment(state.propertyId, updated);
          await loadPropertyData();
          openEquipmentDetail(item.id);
        },
      });
    })
  );
}

// ---------- maintenance / calendar ----------

function renderMaintenance() {
  const tasks = allTasksFlat();
  return `
    <section class="panel">
      <div class="panel-header">
        <h1>Maintenance calendar</h1>
        <button class="btn primary" id="export-ics-btn">📅 Export .ics</button>
      </div>
      <p class="muted">Exports every recurring maintenance task and warranty-expiration reminder as a calendar file you import once into Apple/Google/Outlook Calendar.</p>
      ${tasks.length ? `<ul class="task-list">${tasks.map((x) => taskRowHtml(x)).join('')}</ul>` : '<p class="muted">No maintenance tasks yet.</p>'}
    </section>
  `;
}

function wireMaintenance(main) {
  main.querySelector('#export-ics-btn').addEventListener('click', () => downloadICS(state.equipment, roomsById()));
  main.querySelectorAll('[data-open-equipment]').forEach((el) =>
    el.addEventListener('click', () => openEquipmentDetail(el.dataset.openEquipment))
  );
}

// ---------- settings ----------

function renderSettings() {
  return `
    <section class="panel">
      <h1>Settings</h1>
      <p class="muted">Signed in as ${escapeHtml(state.user.email)} ${state.user.emailVerified ? '' : '<span class="badge warning">unverified</span>'}</p>
      <div class="form-actions">
        ${state.myProperties.length > 1 ? '<button class="btn ghost" id="switch-property-btn">Switch property</button>' : ''}
        <button class="btn ghost" id="settings-signout-btn">Sign out</button>
      </div>
    </section>

    <section class="panel">
      <h2>Property</h2>
      ${isOwner()
        ? `<p>${escapeHtml(state.property.name)} ${state.property.address ? '· ' + escapeHtml(state.property.address) : ''}</p>
           <button class="btn ghost" id="edit-property-btn">Edit name/address</button>`
        : `<p>${escapeHtml(state.property.name)} ${state.property.address ? '· ' + escapeHtml(state.property.address) : ''}</p>
           <p class="muted">You have view-only access to this property.</p>
           <button class="btn ghost danger" id="leave-property-btn">Leave this property</button>`}
    </section>

    <section class="panel" id="members-panel">
      <h2>Family &amp; access</h2>
      <div id="members-list"><p class="muted">Loading…</p></div>
      ${isOwner() ? '<button class="btn ghost" id="invite-btn">+ Invite a family member</button>' : ''}
      ${isOwner() ? '<div id="pending-invites-list"></div>' : ''}
    </section>

    ${isOwner() ? `
    <section class="panel">
      <h2>Transfer this property</h2>
      <div id="transfer-status"><p class="muted">Loading…</p></div>
    </section>

    <section class="panel">
      <h2>AI photo identification</h2>
      <p class="muted">Paste your own Anthropic API key to enable "Identify from photo" when adding equipment. Stored only in this browser, sent only to Anthropic.</p>
      <form id="settings-form" class="form-grid">
        <label class="field"><span>Anthropic API key</span><input name="apiKey" type="password" id="api-key-input" placeholder="sk-ant-..."></label>
        <label class="field"><span>Model</span><input name="model" id="model-input" placeholder="claude-sonnet-5-5"></label>
        <div class="form-actions"><button type="submit" class="btn primary">Save</button></div>
      </form>

      <h2>Backup &amp; migration</h2>
      <div class="form-actions">
        <button class="btn ghost" id="export-backup-btn">Export this property's data (.json)</button>
        <label class="btn ghost file-btn">Import old local backup<input type="file" id="import-legacy-input" accept="application/json" hidden></label>
      </div>
      <div id="import-progress"></div>
    </section>` : ''}
  `;
}

function wireSettings(main) {
  main.querySelector('#settings-signout-btn').addEventListener('click', () => signOutUser());
  main.querySelector('#switch-property-btn')?.addEventListener('click', () => setRoute('properties'));

  main.querySelector('#edit-property-btn')?.addEventListener('click', () => {
    openPropertyForm(state.property, {
      onSave: async ({ name, address }) => {
        await updatePropertyDetails(state.propertyId, { name, address });
        state.property = { ...state.property, name, address };
        render();
      },
    });
  });
  main.querySelector('#leave-property-btn')?.addEventListener('click', () => {
    confirmDialog(`Leave "${state.property.name}"? You'll lose access until invited again.`, {
      confirmLabel: 'Leave property',
      onConfirm: async () => {
        await leaveProperty(state.propertyId, state.user.uid);
        state.propertyId = null;
        await refreshAccessAndRoute();
      },
    });
  });

  loadMembersPanel(main);

  main.querySelector('#invite-btn')?.addEventListener('click', () => {
    openInviteForm({
      onSave: async (email) => {
        await createInvite(state.propertyId, state.property.name, email, state.user);
        loadMembersPanel(main);
      },
    });
  });

  if (isOwner()) {
    loadTransferPanel(main);

    main.querySelector('#api-key-input').value = getLocalSetting('anthropicApiKey', '') || '';
    main.querySelector('#model-input').value = getLocalSetting('aiModel', '') || '';
    main.querySelector('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      setLocalSetting('anthropicApiKey', fd.get('apiKey').trim());
      setLocalSetting('aiModel', fd.get('model').trim());
      alert('Settings saved.');
    });

    main.querySelector('#export-backup-btn').addEventListener('click', () => {
      exportPropertyBackup(state.property, state.rooms, state.equipment);
    });

    main.querySelector('#import-legacy-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const progress = main.querySelector('#import-progress');
      progress.innerHTML = `<p class="muted">Importing…</p>`;
      try {
        const result = await importLegacyBackup(file, state.propertyId, {
          onProgress: (done, total) => { progress.innerHTML = `<p class="muted">Importing… ${done}/${total}</p>`; },
        });
        await loadPropertyData();
        progress.innerHTML = `<p class="success">Imported ${result.rooms} room(s) and ${result.equipment} item(s).</p>`;
      } catch (err) {
        progress.innerHTML = `<p class="error">Import failed: ${escapeHtml(err.message)}</p>`;
      }
    });
  }
}

async function loadMembersPanel(main) {
  const [members, invites] = await Promise.all([
    listMembers(state.propertyId),
    isOwner() ? listInvitesForProperty(state.propertyId) : Promise.resolve([]),
  ]);
  const listEl = main.querySelector('#members-list');
  if (listEl) {
    listEl.innerHTML = `<ul class="task-list">${members.map((m) => `
      <li class="task-row">
        <span class="badge muted">${escapeHtml(m.role)}</span>
        <span>${escapeHtml(m.displayName || m.email)}</span>
        ${isOwner() && m.uid !== state.user.uid ? `<button class="btn link danger" data-remove-member="${m.uid}">Remove</button>` : ''}
      </li>`).join('')}</ul>`;
    listEl.querySelectorAll('[data-remove-member]').forEach((el) =>
      el.addEventListener('click', () => {
        confirmDialog('Remove this person\'s access?', {
          onConfirm: async () => { await removeMember(state.propertyId, el.dataset.removeMember); loadMembersPanel(main); },
        });
      })
    );
  }
  const pendingEl = main.querySelector('#pending-invites-list');
  if (pendingEl) {
    // Every doc in this mirror collection represents an outstanding invite
    // by construction — accept/decline/revoke all delete it.
    pendingEl.innerHTML = invites.length ? `<ul class="task-list">${invites.map((inv) => `
      <li class="task-row">
        <span class="badge warning">pending</span>
        <span>${escapeHtml(inv.email)}</span>
        <button class="btn link danger" data-revoke-invite="${escapeHtml(inv.email)}">Revoke</button>
      </li>`).join('')}</ul>` : '';
    pendingEl.querySelectorAll('[data-revoke-invite]').forEach((el) =>
      el.addEventListener('click', async () => { await revokeInvite(state.propertyId, el.dataset.revokeInvite); loadMembersPanel(main); })
    );
  }
}

async function loadTransferPanel(main) {
  const statusEl = main.querySelector('#transfer-status');
  const transfer = await getTransferForProperty(state.propertyId);
  if (transfer) {
    statusEl.innerHTML = `<p>Pending transfer to <strong>${escapeHtml(transfer.toEmail)}</strong></p>
      <button class="btn ghost danger" id="cancel-transfer-btn">Cancel transfer</button>`;
    statusEl.querySelector('#cancel-transfer-btn').addEventListener('click', async () => {
      await cancelTransfer(transfer);
      loadTransferPanel(main);
    });
  } else {
    statusEl.innerHTML = `<button class="btn danger" id="start-transfer-btn">Transfer to a new owner</button>`;
    statusEl.querySelector('#start-transfer-btn').addEventListener('click', () => {
      openTransferForm({
        onSave: async (email) => {
          await createTransferRequest(state.propertyId, state.property.name, email, state.user);
          loadTransferPanel(main);
        },
      });
    });
  }
}

init();
