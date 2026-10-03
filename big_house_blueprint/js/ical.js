import { warrantyExpiration, downloadBlob } from './utils.js';

// Minimal iCalendar (RFC 5545) builder — just enough for all-day maintenance
// tasks (with RRULE recurrence) and one-off warranty-expiration reminders.
// No external library needed, and the output is a static file you import
// once into any calendar app; recurring tasks stay correct because the
// recurrence rule (not a live feed) is what repeats them.

function foldLine(line) {
  if (line.length <= 73) return line;
  let out = '';
  let rest = line;
  out += rest.slice(0, 73);
  rest = rest.slice(73);
  while (rest.length) {
    out += '\r\n ' + rest.slice(0, 72);
    rest = rest.slice(72);
  }
  return out;
}

function dateStamp(isoDate) {
  return isoDate.replace(/-/g, '');
}

function freqForUnit(unit) {
  switch (unit) {
    case 'days':
      return 'DAILY';
    case 'weeks':
      return 'WEEKLY';
    case 'months':
      return 'MONTHLY';
    case 'years':
      return 'YEARLY';
    default:
      return null;
  }
}

function buildTaskEvent(equipment, room, task) {
  const lines = [];
  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${task.id}@big-house-blueprint`);
  lines.push(`DTSTAMP:${dateStamp(task.anchorDate || task.nextDue)}T000000Z`);
  lines.push(`DTSTART;VALUE=DATE:${dateStamp(task.anchorDate || task.nextDue)}`);
  const summary = `Maintenance: ${equipment.name} — ${task.title}`;
  lines.push(`SUMMARY:${summary}`);
  const descParts = [];
  if (room) descParts.push(`Room: ${room.name}`);
  if (equipment.manufacturer || equipment.modelNumber) {
    descParts.push(`Model: ${[equipment.manufacturer, equipment.modelNumber].filter(Boolean).join(' ')}`);
  }
  if (task.notes) descParts.push(task.notes);
  if (descParts.length) lines.push(`DESCRIPTION:${descParts.join('\\n')}`);
  if (room) lines.push(`LOCATION:${room.name}`);
  const freq = freqForUnit(task.intervalUnit);
  if (freq && task.intervalValue) {
    lines.push(`RRULE:FREQ=${freq};INTERVAL=${task.intervalValue}`);
  }
  lines.push('BEGIN:VALARM');
  lines.push('ACTION:DISPLAY');
  lines.push(`DESCRIPTION:${summary}`);
  lines.push('TRIGGER:-P1D');
  lines.push('END:VALARM');
  lines.push('END:VEVENT');
  return lines;
}

function buildWarrantyEvent(equipment) {
  const expiration = warrantyExpiration(equipment);
  if (!expiration) return [];
  const lines = [];
  lines.push('BEGIN:VEVENT');
  lines.push(`UID:warranty-${equipment.id}@big-house-blueprint`);
  lines.push(`DTSTAMP:${dateStamp(expiration)}T000000Z`);
  lines.push(`DTSTART;VALUE=DATE:${dateStamp(expiration)}`);
  lines.push(`SUMMARY:Warranty expires: ${equipment.name}`);
  lines.push('BEGIN:VALARM');
  lines.push('ACTION:DISPLAY');
  lines.push(`DESCRIPTION:Warranty expires soon: ${equipment.name}`);
  lines.push('TRIGGER:-P7D');
  lines.push('END:VALARM');
  lines.push('END:VEVENT');
  return lines;
}

export function buildICS(equipmentList, roomsById) {
  const lines = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Big House BluePrint//Home Maintenance//EN');
  lines.push('CALSCALE:GREGORIAN');
  for (const equipment of equipmentList) {
    const room = equipment.roomId ? roomsById.get(equipment.roomId) : null;
    for (const task of equipment.maintenanceTasks || []) {
      if (!task.anchorDate && !task.nextDue) continue;
      lines.push(...buildTaskEvent(equipment, room, task));
    }
    lines.push(...buildWarrantyEvent(equipment));
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export function downloadICS(equipmentList, roomsById, filename = 'home-maintenance.ics') {
  const ics = buildICS(equipmentList, roomsById);
  downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), filename);
}
