import { RoomsDB, EquipmentDB, SettingsDB, wipeAllData } from './db.js';
import { uuid, escapeHtml, formatDate, warrantyStatus, blobToObjectURL, todayISO, addMonths } from './utils.js';
import { openRoomForm, openEquipmentForm, openMaintenanceTaskForm, confirmDialog } from './forms.js';
import { openModal, closeModal } from './modal.js';
import { createRoomViewer, formatFromFilename } from './viewer3d.js';
import { downloadICS } from './ical.js';
import { exportBackup, importBackup } from './backup.js';

const state = {
  rooms: [],
  equipment: [],
  route: 'dashboard',
  selectedRoomId: null,
  search: '',
  roomFilter: '',
  categoryFilter: '',
};

let activeViewer = null;

async function loadData() {
  const [rooms, equipment] = await Promise.all([RoomsDB.all(), EquipmentDB.all()]);
  state.rooms = rooms.sort((a, b) => a.name.localeCompare(b.name));
  state.equipment = equipment.sort((a, b) => a.name.localeCompare(b.name));
}

function roomsById() {
  return new Map(state.rooms.map((r) => [r.id, r]));
}

function setRoute(route, params = {}) {
  state.route = route;
  Object.assign(state, params);
  document.querySelectorAll('.nav-tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === route);
  });
  render();
}

function render() {
  if (activeViewer) {
    activeViewer.dispose();
    activeViewer = null;
  }
  const main = document.getElementById('main');
  switch (state.route) {
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
    default:
      main.innerHTML = renderDashboard();
      wireDashboard(main);
  }
}

// ---------- Dashboard ----------

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

  const upcoming = allTasksFlat().filter((x) => {
    const d = x.task.anchorDate;
    if (!d) return false;
    return d <= addMonths(todayISO(), 1);
  });

  return `
    <section class="panel">
      <h1>Home overview</h1>
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

// ---------- Rooms ----------

function renderRooms() {
  return `
    <section class="panel">
      <div class="panel-header">
        <h1>Rooms &amp; exterior</h1>
        <button class="btn primary" id="add-room-btn">+ Add room</button>
      </div>
      ${state.rooms.length ? `<div class="card-grid">${state.rooms.map(roomCardHtml).join('')}</div>` : `<p class="muted">No rooms yet. Add your rooms (and the exterior) to start organizing equipment by location, and upload a 3D scan for each once you have one.</p>`}
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
      <button class="btn ghost" data-edit-room="${room.id}">Edit</button>
      <button class="btn ghost danger" data-delete-room="${room.id}">Delete</button>
    </div>
  </div>`;
}

function wireRooms(main) {
  main.querySelector('#add-room-btn').addEventListener('click', () => {
    openRoomForm(null, { onSave: saveRoom });
  });
  main.querySelectorAll('[data-view-room]').forEach((el) =>
    el.addEventListener('click', () => setRoute('room-detail', { selectedRoomId: el.dataset.viewRoom }))
  );
  main.querySelectorAll('[data-edit-room]').forEach((el) =>
    el.addEventListener('click', () => {
      const room = state.rooms.find((r) => r.id === el.dataset.editRoom);
      openRoomForm(room, { onSave: saveRoom });
    })
  );
  main.querySelectorAll('[data-delete-room]').forEach((el) =>
    el.addEventListener('click', () => {
      confirmDialog('Delete this room? Equipment assigned to it will become unassigned.', {
        onConfirm: () => deleteRoom(el.dataset.deleteRoom),
      });
    })
  );
}

async function saveRoom(room) {
  await RoomsDB.put(room);
  await loadData();
  render();
}

async function deleteRoom(id) {
  const affected = state.equipment.filter((e) => e.roomId === id);
  await Promise.all(affected.map((e) => EquipmentDB.put({ ...e, roomId: '' })));
  await RoomsDB.delete(id);
  await loadData();
  setRoute('rooms');
}

// ---------- Room detail (with 3D viewer) ----------

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
          <button class="btn primary" id="add-equipment-here">+ Add equipment here</button>
        </div>
      </div>
      <div class="room-detail-grid">
        <div class="viewer-column">
          <div id="viewer-container" class="viewer-container"></div>
          ${room.modelFileName ? `<p class="muted">Scan file: ${escapeHtml(room.modelFileName)} — <button class="btn link" id="replace-scan">Replace</button></p>` : `<button class="btn ghost" id="upload-scan">Upload 3D scan (.glb/.gltf/.obj)</button>`}
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
  main.querySelector('#add-equipment-here').addEventListener('click', () => {
    openEquipmentForm({ ...blankEquipmentWithRoom(room.id) }, state.rooms, { onSave: saveEquipment });
  });
  main.querySelectorAll('[data-open-equipment]').forEach((el) =>
    el.addEventListener('click', () => openEquipmentDetail(el.dataset.openEquipment))
  );

  const container = main.querySelector('#viewer-container');
  if (room.modelBlob) {
    container.innerHTML = '<p class="muted">Loading 3D model…</p>';
    createRoomViewer(container)
      .then(async (viewer) => {
        activeViewer = viewer;
        await viewer.loadModel(room.modelBlob, formatFromFilename(room.modelFileName));
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
    openRoomForm(room, { onSave: saveRoom });
  });
}

function blankEquipmentWithRoom(roomId) {
  return { roomId };
}

function equipmentRowHtml(item) {
  const status = warrantyStatus(item);
  return `<li class="equipment-row" data-open-equipment="${item.id}">
    <span>${escapeHtml(item.name)}</span>
    <span class="muted">${escapeHtml(item.category || '')}</span>
    <span class="badge ${status.tone}">${escapeHtml(status.label)}</span>
  </li>`;
}

// ---------- Equipment list ----------

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
        <button class="btn primary" id="add-equipment-btn">+ Add equipment</button>
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
  main.querySelector('#add-equipment-btn').addEventListener('click', () => {
    openEquipmentForm(null, state.rooms, { onSave: saveEquipment });
  });
  main.querySelector('#search-input').addEventListener('input', (e) => {
    state.search = e.target.value;
    render();
  });
  main.querySelector('#room-filter').addEventListener('change', (e) => {
    state.roomFilter = e.target.value;
    render();
  });
  main.querySelector('#category-filter').addEventListener('change', (e) => {
    state.categoryFilter = e.target.value;
    render();
  });
  main.querySelectorAll('[data-open-equipment]').forEach((el) =>
    el.addEventListener('click', () => openEquipmentDetail(el.dataset.openEquipment))
  );
}

async function saveEquipment(item) {
  await EquipmentDB.put(item);
  await loadData();
  render();
}

async function deleteEquipment(id) {
  await EquipmentDB.delete(id);
  await loadData();
  render();
}

// ---------- Equipment detail modal ----------

function openEquipmentDetail(id) {
  const item = state.equipment.find((e) => e.id === id);
  if (!item) return;
  renderEquipmentDetailModal(item);
}

function renderEquipmentDetailModal(item) {
  const room = state.rooms.find((r) => r.id === item.roomId);
  const status = warrantyStatus(item);
  const photoUrl = item.photoBlob ? blobToObjectURL(item.photoBlob) : null;

  const card = openModal(`
    <div class="equipment-detail">
      ${photoUrl ? `<img class="equipment-photo" src="${photoUrl}" alt="${escapeHtml(item.name)}">` : ''}
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
      <button class="btn ghost" id="add-task-btn">+ Add maintenance task</button>

      <div class="form-actions">
        <button class="btn ghost" id="edit-equipment-btn">Edit</button>
        <button class="btn ghost danger" id="delete-equipment-btn">Delete</button>
      </div>
    </div>
  `);

  card.querySelector('#edit-equipment-btn').addEventListener('click', () => {
    openEquipmentForm(item, state.rooms, { onSave: saveEquipment });
  });
  card.querySelector('#delete-equipment-btn').addEventListener('click', () => {
    confirmDialog(`Delete "${item.name}"? This can't be undone.`, {
      onConfirm: () => deleteEquipment(item.id),
    });
  });
  card.querySelector('#add-task-btn').addEventListener('click', () => {
    openMaintenanceTaskForm(item, null, {
      onSave: async (task) => {
        const updated = { ...item, maintenanceTasks: [...(item.maintenanceTasks || []), task] };
        await saveEquipment(updated);
        openEquipmentDetail(item.id);
      },
    });
  });
  wireTaskRowButtons(card, item);
}

function taskEditRowHtml(item, task) {
  const overdue = task.anchorDate < todayISO();
  return `<li class="task-row">
    <span class="badge ${overdue ? 'danger' : 'muted'}">${formatDate(task.anchorDate)}</span>
    <span>${escapeHtml(task.title)} <span class="muted">(every ${task.intervalValue} ${escapeHtml(task.intervalUnit)})</span></span>
    <button class="btn link" data-edit-task="${task.id}">Edit</button>
    <button class="btn link danger" data-delete-task="${task.id}">Delete</button>
  </li>`;
}

function wireTaskRowButtons(card, item) {
  card.querySelectorAll('[data-edit-task]').forEach((el) =>
    el.addEventListener('click', () => {
      const task = (item.maintenanceTasks || []).find((t) => t.id === el.dataset.editTask);
      openMaintenanceTaskForm(item, task, {
        onSave: async (updatedTask) => {
          const updated = {
            ...item,
            maintenanceTasks: item.maintenanceTasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
          };
          await saveEquipment(updated);
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
          await saveEquipment(updated);
          openEquipmentDetail(item.id);
        },
      });
    })
  );
}

// ---------- Maintenance / calendar ----------

function renderMaintenance() {
  const tasks = allTasksFlat();
  return `
    <section class="panel">
      <div class="panel-header">
        <h1>Maintenance calendar</h1>
        <button class="btn primary" id="export-ics-btn">📅 Export .ics</button>
      </div>
      <p class="muted">Exports every recurring maintenance task and warranty-expiration reminder as a calendar file you import once into Apple/Google/Outlook Calendar. Recurrence is baked into the file, so it stays correct — just re-export and re-import after you add or change tasks.</p>
      ${tasks.length ? `<ul class="task-list">${tasks.map((x) => taskRowHtml(x)).join('')}</ul>` : '<p class="muted">No maintenance tasks yet. Add some from an equipment item\'s detail view.</p>'}
    </section>
  `;
}

function wireMaintenance(main) {
  main.querySelector('#export-ics-btn').addEventListener('click', () => {
    downloadICS(state.equipment, roomsById());
  });
  main.querySelectorAll('[data-open-equipment]').forEach((el) =>
    el.addEventListener('click', () => openEquipmentDetail(el.dataset.openEquipment))
  );
}

// ---------- Settings ----------

function renderSettings() {
  return `
    <section class="panel">
      <h1>Settings</h1>

      <h2>AI photo identification</h2>
      <p class="muted">Paste your own Anthropic API key to enable "Identify from photo" when adding equipment. The key is stored only in this browser's local storage and sent directly to Anthropic's API — never to any other server.</p>
      <form id="settings-form" class="form-grid">
        <label class="field"><span>Anthropic API key</span><input name="apiKey" type="password" id="api-key-input" placeholder="sk-ant-..."></label>
        <label class="field"><span>Model</span><input name="model" id="model-input" placeholder="claude-sonnet-5-5"></label>
        <div class="form-actions"><button type="submit" class="btn primary">Save</button></div>
      </form>

      <h2>Backup</h2>
      <p class="muted">Everything here lives in this browser only. Export a backup regularly, and after switching browsers/devices, import it there.</p>
      <div class="form-actions">
        <button class="btn ghost" id="export-backup-btn">Export backup (.json)</button>
        <label class="btn ghost file-btn">Import backup<input type="file" id="import-backup-input" accept="application/json" hidden></label>
      </div>

      <h2>Sample data</h2>
      <div class="form-actions">
        <button class="btn ghost" id="load-sample-btn">Load sample rooms &amp; equipment</button>
        <button class="btn ghost danger" id="wipe-btn">Erase all data</button>
      </div>
    </section>
  `;
}

function wireSettings(main) {
  (async () => {
    main.querySelector('#api-key-input').value = (await SettingsDB.get('anthropicApiKey')) || '';
    main.querySelector('#model-input').value = (await SettingsDB.get('aiModel')) || '';
  })();

  main.querySelector('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await SettingsDB.set('anthropicApiKey', fd.get('apiKey').trim());
    await SettingsDB.set('aiModel', fd.get('model').trim());
    alert('Settings saved.');
  });

  main.querySelector('#export-backup-btn').addEventListener('click', () => exportBackup());

  main.querySelector('#import-backup-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const result = await importBackup(file, { replaceExisting: false });
      await loadData();
      alert(`Imported ${result.rooms} room(s) and ${result.equipment} item(s).`);
      render();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  });

  main.querySelector('#load-sample-btn').addEventListener('click', async () => {
    await loadSampleData();
    await loadData();
    render();
  });

  main.querySelector('#wipe-btn').addEventListener('click', () => {
    confirmDialog('Erase every room and equipment record in this browser? This cannot be undone.', {
      onConfirm: async () => {
        await wipeAllData();
        await loadData();
        setRoute('dashboard');
      },
    });
  });
}

async function loadSampleData() {
  const kitchen = { id: uuid(), name: 'Kitchen', type: 'kitchen', floor: '1st floor', notes: '' };
  const bath = { id: uuid(), name: 'Primary Bathroom', type: 'bathroom', floor: '2nd floor', notes: '' };
  const exterior = { id: uuid(), name: 'Exterior', type: 'exterior', floor: '', notes: '' };
  await Promise.all([RoomsDB.put(kitchen), RoomsDB.put(bath), RoomsDB.put(exterior)]);

  const fridge = {
    id: uuid(), name: 'Kitchen Refrigerator', category: 'Appliance', roomId: kitchen.id,
    manufacturer: 'Samsung', modelNumber: 'RF28R7351SG', serialNumber: '0ABC123456',
    yearManufactured: '2021', installDate: '2021-06-15', purchaseDate: '2021-06-01',
    purchasePrice: '2199.00', retailer: 'Home Depot',
    warrantyStartDate: '2021-06-15', warrantyLengthMonths: '12', warrantyExpirationDate: '',
    supportPhone: '1-800-726-7864', supportWebsite: 'https://www.samsung.com/us/support/',
    manufacturerWebsite: 'https://www.samsung.com', troubleshootingUrl: 'https://www.samsung.com/us/support/troubleshooting/',
    manualUrl: '', notes: 'French door, counter-depth.',
    maintenanceTasks: [{ id: uuid(), title: 'Clean condenser coils', intervalValue: 6, intervalUnit: 'months', anchorDate: todayISO(), notes: '' }],
  };

  const hvac = {
    id: uuid(), name: 'Main HVAC Unit', category: 'HVAC', roomId: exterior.id,
    manufacturer: 'Carrier', modelNumber: '24ACC636A003', serialNumber: '1234ABCD',
    yearManufactured: '2019', installDate: '2019-05-01', purchaseDate: '2019-04-20',
    purchasePrice: '5400.00', retailer: 'Local HVAC contractor',
    warrantyStartDate: '2019-05-01', warrantyLengthMonths: '120', warrantyExpirationDate: '',
    supportPhone: '1-800-227-7437', supportWebsite: 'https://www.carrier.com',
    manufacturerWebsite: 'https://www.carrier.com', troubleshootingUrl: '',
    manualUrl: '', notes: '10-year parts warranty, registered.',
    maintenanceTasks: [
      { id: uuid(), title: 'Replace air filter', intervalValue: 3, intervalUnit: 'months', anchorDate: todayISO(), notes: '20x25x1' },
      { id: uuid(), title: 'Annual professional service', intervalValue: 1, intervalUnit: 'years', anchorDate: todayISO(), notes: '' },
    ],
  };

  const faucet = {
    id: uuid(), name: 'Primary Bath Sink Faucet', category: 'Plumbing Fixture', roomId: bath.id,
    manufacturer: 'Moen', modelNumber: '6610', serialNumber: '',
    yearManufactured: '2022', installDate: '2022-03-10', purchaseDate: '',
    purchasePrice: '', retailer: '',
    warrantyStartDate: '', warrantyLengthMonths: '', warrantyExpirationDate: '',
    supportPhone: '1-800-289-6636', supportWebsite: 'https://www.moen.com/support',
    manufacturerWebsite: 'https://www.moen.com', troubleshootingUrl: '',
    manualUrl: '', notes: 'Lifetime warranty on finish and function.',
    maintenanceTasks: [],
  };

  await Promise.all([EquipmentDB.put(fridge), EquipmentDB.put(hvac), EquipmentDB.put(faucet)]);
}

// ---------- Bootstrap ----------

async function init() {
  await loadData();
  document.querySelectorAll('.nav-tab').forEach((el) => {
    el.addEventListener('click', () => setRoute(el.dataset.route));
  });
  setRoute('dashboard');
}

init();
