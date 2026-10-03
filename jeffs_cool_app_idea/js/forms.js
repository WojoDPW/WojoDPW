import { openModal, closeModal } from './modal.js';
import { uuid, todayISO, escapeHtml } from './utils.js';
import { identifyFromImage } from './ai-identify.js';
import { SettingsDB } from './db.js';

const CATEGORIES = [
  'HVAC',
  'Water Heater',
  'Generator',
  'Electrical Panel',
  'Plumbing Fixture',
  'Appliance',
  'Lighting',
  'Security/Smart Home',
  'Structural/Exterior',
  'Other',
];

function field(label, inputHtml, { hint } = {}) {
  return `<label class="field">
    <span>${label}</span>
    ${inputHtml}
    ${hint ? `<small class="hint">${hint}</small>` : ''}
  </label>`;
}

export function openRoomForm(room, { onSave }) {
  const isNew = !room;
  const r = room || { id: uuid(), name: '', type: '', floor: '', notes: '' };
  const card = openModal(`
    <h2>${isNew ? 'Add room' : 'Edit room'}</h2>
    <form id="room-form" class="form-grid">
      ${field('Room name', `<input name="name" required value="${escapeHtml(r.name)}" placeholder="Kitchen, Primary Bath, Exterior – Front...">`)}
      ${field('Type', `<input name="type" value="${escapeHtml(r.type)}" placeholder="kitchen, bedroom, bathroom, garage, exterior...">`)}
      ${field('Floor', `<input name="floor" value="${escapeHtml(r.floor)}" placeholder="1st floor, basement, attic...">`)}
      ${field('Notes', `<textarea name="notes" rows="2">${escapeHtml(r.notes)}</textarea>`)}
      ${field(
        '3D scan file (.glb, .gltf, .obj)',
        `<input name="modelFile" type="file" accept=".glb,.gltf,.obj">`,
        { hint: r.modelFileName ? `Current file: ${escapeHtml(r.modelFileName)}` : 'Exported from a scanning app like Polycam or 3D Scanner App.' }
      )}
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button type="submit" class="btn primary">Save room</button>
      </div>
    </form>
  `);

  card.querySelector('#room-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const updated = {
      ...r,
      name: fd.get('name').trim(),
      type: fd.get('type').trim(),
      floor: fd.get('floor').trim(),
      notes: fd.get('notes').trim(),
    };
    const file = fd.get('modelFile');
    if (file && file.size > 0) {
      updated.modelBlob = file;
      updated.modelFileName = file.name;
    }
    await onSave(updated);
    closeModal();
  });
}

export function openMaintenanceTaskForm(equipment, task, { onSave }) {
  const isNew = !task;
  const t = task || { id: uuid(), title: '', intervalValue: 3, intervalUnit: 'months', anchorDate: todayISO(), notes: '' };
  const card = openModal(`
    <h2>${isNew ? 'Add maintenance task' : 'Edit maintenance task'}</h2>
    <form id="task-form" class="form-grid">
      ${field('Task', `<input name="title" required value="${escapeHtml(t.title)}" placeholder="Replace filter, Service unit, Flush tank...">`)}
      <div class="form-row">
        ${field('Repeat every', `<input name="intervalValue" type="number" min="1" value="${t.intervalValue}">`)}
        ${field('Unit', `
          <select name="intervalUnit">
            ${['days', 'weeks', 'months', 'years'].map((u) => `<option value="${u}" ${t.intervalUnit === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select>`)}
      </div>
      ${field('Next/first due date', `<input name="anchorDate" type="date" value="${t.anchorDate}" required>`)}
      ${field('Notes', `<textarea name="notes" rows="2">${escapeHtml(t.notes)}</textarea>`)}
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button type="submit" class="btn primary">Save task</button>
      </div>
    </form>
  `);

  card.querySelector('#task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const updated = {
      ...t,
      title: fd.get('title').trim(),
      intervalValue: Number(fd.get('intervalValue')),
      intervalUnit: fd.get('intervalUnit'),
      anchorDate: fd.get('anchorDate'),
      notes: fd.get('notes').trim(),
    };
    onSave(updated);
    closeModal();
  });
}

export function openEquipmentForm(equipment, rooms, { onSave }) {
  const isNew = !equipment;
  const e0 = equipment || {
    id: uuid(),
    name: '',
    category: '',
    roomId: '',
    manufacturer: '',
    modelNumber: '',
    serialNumber: '',
    yearManufactured: '',
    installDate: '',
    purchaseDate: '',
    purchasePrice: '',
    retailer: '',
    warrantyStartDate: '',
    warrantyLengthMonths: '',
    warrantyExpirationDate: '',
    supportPhone: '',
    supportWebsite: '',
    manufacturerWebsite: '',
    troubleshootingUrl: '',
    manualUrl: '',
    notes: '',
    maintenanceTasks: [],
  };

  const roomOptions = `<option value="">— Unassigned —</option>` +
    rooms.map((r) => `<option value="${r.id}" ${e0.roomId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');

  const categoryOptions = CATEGORIES.map(
    (c) => `<option value="${c}" ${e0.category === c ? 'selected' : ''}>${c}</option>`
  ).join('');

  const card = openModal(`
    <h2>${isNew ? 'Add equipment / fixture' : 'Edit equipment / fixture'}</h2>
    <form id="equipment-form" class="form-grid">
      <div id="ai-identify-box" class="ai-box">
        ${field('Photo (nameplate or the unit itself)', `<input name="photoFile" type="file" accept="image/*" id="photo-input">`)}
        <button type="button" class="btn ghost" id="identify-btn">✨ Identify from photo</button>
        <div id="identify-result"></div>
      </div>

      ${field('Name', `<input name="name" required value="${escapeHtml(e0.name)}" placeholder="Kitchen refrigerator, Main HVAC unit...">`)}
      <div class="form-row">
        ${field('Category', `<select name="category">${categoryOptions}</select>`)}
        ${field('Room', `<select name="roomId">${roomOptions}</select>`)}
      </div>
      <div class="form-row">
        ${field('Manufacturer', `<input name="manufacturer" value="${escapeHtml(e0.manufacturer)}">`)}
        ${field('Model number', `<input name="modelNumber" value="${escapeHtml(e0.modelNumber)}">`)}
        ${field('Serial number', `<input name="serialNumber" value="${escapeHtml(e0.serialNumber)}">`)}
      </div>
      <div class="form-row">
        ${field('Year manufactured', `<input name="yearManufactured" value="${escapeHtml(e0.yearManufactured)}" placeholder="2019">`)}
        ${field('Install date', `<input name="installDate" type="date" value="${e0.installDate}">`)}
      </div>
      <div class="form-row">
        ${field('Purchase date', `<input name="purchaseDate" type="date" value="${e0.purchaseDate}">`)}
        ${field('Purchase price', `<input name="purchasePrice" value="${escapeHtml(e0.purchasePrice)}" placeholder="1299.00">`)}
        ${field('Retailer', `<input name="retailer" value="${escapeHtml(e0.retailer)}">`)}
      </div>
      <fieldset class="warranty-fieldset">
        <legend>Warranty</legend>
        <div class="form-row">
          ${field('Start date', `<input name="warrantyStartDate" type="date" value="${e0.warrantyStartDate}">`)}
          ${field('Length (months)', `<input name="warrantyLengthMonths" type="number" min="0" value="${escapeHtml(e0.warrantyLengthMonths)}">`)}
          ${field('Or exact expiration date', `<input name="warrantyExpirationDate" type="date" value="${e0.warrantyExpirationDate}">`)}
        </div>
      </fieldset>
      <div class="form-row">
        ${field('Support phone', `<input name="supportPhone" value="${escapeHtml(e0.supportPhone)}">`)}
        ${field('Support / manufacturer website', `<input name="supportWebsite" type="url" value="${escapeHtml(e0.supportWebsite)}">`)}
      </div>
      <div class="form-row">
        ${field('Troubleshooting link', `<input name="troubleshootingUrl" type="url" value="${escapeHtml(e0.troubleshootingUrl)}">`)}
        ${field('Manual link', `<input name="manualUrl" type="url" value="${escapeHtml(e0.manualUrl)}">`)}
      </div>
      ${field('Notes', `<textarea name="notes" rows="3">${escapeHtml(e0.notes)}</textarea>`)}
      <div class="form-actions">
        <button type="button" class="btn ghost" data-close>Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  `);

  card.querySelector('#identify-btn').addEventListener('click', async () => {
    const fileInput = card.querySelector('#photo-input');
    const resultBox = card.querySelector('#identify-result');
    const file = fileInput.files[0];
    if (!file) {
      resultBox.innerHTML = `<p class="error">Choose a photo first.</p>`;
      return;
    }
    resultBox.innerHTML = `<p class="muted">Looking at the photo…</p>`;
    try {
      const apiKey = await SettingsDB.get('anthropicApiKey');
      const model = await SettingsDB.get('aiModel');
      const result = await identifyFromImage(file, { apiKey, model });
      resultBox.innerHTML = `<p class="success">Guess (${escapeHtml(result.confidence || 'unknown')} confidence): ${escapeHtml(
        [result.manufacturer, result.modelNumber].filter(Boolean).join(' ') || 'nothing legible'
      )}</p>${result.notes ? `<p class="muted">${escapeHtml(result.notes)}</p>` : ''}
      <button type="button" class="btn ghost" id="apply-identify">Apply to form</button>`;
      card.querySelector('#apply-identify')?.addEventListener('click', () => {
        if (result.manufacturer) card.querySelector('[name=manufacturer]').value = result.manufacturer;
        if (result.modelNumber) card.querySelector('[name=modelNumber]').value = result.modelNumber;
        if (result.serialNumber) card.querySelector('[name=serialNumber]').value = result.serialNumber;
        if (result.category && CATEGORIES.includes(result.category)) {
          card.querySelector('[name=category]').value = result.category;
        }
      });
    } catch (err) {
      resultBox.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  });

  card.querySelector('#equipment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const updated = { ...e0 };
    for (const key of [
      'name', 'category', 'roomId', 'manufacturer', 'modelNumber', 'serialNumber',
      'yearManufactured', 'installDate', 'purchaseDate', 'purchasePrice', 'retailer',
      'warrantyStartDate', 'warrantyLengthMonths', 'warrantyExpirationDate',
      'supportPhone', 'supportWebsite', 'manufacturerWebsite', 'troubleshootingUrl',
      'manualUrl', 'notes',
    ]) {
      updated[key] = (fd.get(key) || '').toString().trim();
    }
    const photoFile = fd.get('photoFile');
    if (photoFile && photoFile.size > 0) {
      updated.photoBlob = photoFile;
    }
    if (!updated.maintenanceTasks) updated.maintenanceTasks = [];
    onSave(updated);
    closeModal();
  });
}

export function confirmDialog(message, { onConfirm }) {
  const card = openModal(`
    <h2>Are you sure?</h2>
    <p>${escapeHtml(message)}</p>
    <div class="form-actions">
      <button type="button" class="btn ghost" data-close>Cancel</button>
      <button type="button" class="btn danger" id="confirm-yes">Delete</button>
    </div>
  `);
  card.querySelector('#confirm-yes').addEventListener('click', () => {
    onConfirm();
    closeModal();
  });
}
