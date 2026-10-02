# Jeff's Cool App Idea — Home Inventory

A one-stop digital record of your house and everything in it: rooms (with
3D scans), an equipment/fixture registry with warranty and support info,
and a maintenance calendar you can export to any calendar app.

It's a static, local-first web app — no server, no account, no build step.
Open `index.html` and it works. All data lives in your browser's
IndexedDB; there's nothing to install or pay for to get started.

## Running it

Just open `index.html` in a browser. For the 3D room viewer and photo
upload to work reliably (some browsers restrict certain APIs on the
`file://` scheme), serve the folder over local HTTP instead:

```bash
cd jeffs_cool_app_idea
python3 -m http.server 8080
# then open http://localhost:8080
```

To host it for yourself permanently, the easiest option already used
elsewhere in this repo is **GitHub Pages**: repo **Settings → Pages →
Deploy from a branch**, pointing at this folder. Since all your data is
local to whichever browser opens the page, hosting it publicly is fine —
nobody else's data mixes with yours, and nobody can read your data without
access to your browser.

## What's in here

| Feature | Status |
|---|---|
| Rooms registry (incl. exterior) | ✅ Works |
| Equipment/fixture registry (model, serial, warranty, support links, manuals, notes) | ✅ Works |
| Room → equipment linking, "what's in this room" view | ✅ Works |
| 3D room viewer (Three.js) for uploaded scans | ✅ Works, see caveat below |
| Warranty status tracking (active/expiring/expired) | ✅ Works |
| Maintenance scheduling + `.ics` calendar export | ✅ Works |
| AI photo → make/model identification | ✅ Works, requires your own API key |
| JSON backup/restore (export/import) | ✅ Works |
| Live LiDAR capture inside the app | ❌ Not possible from a browser — see below |

### 3D room scans

There is no web API that lets a browser drive a phone's LiDAR sensor
directly. The realistic workflow:

1. Scan each room (and the exterior) with an existing scanning app —
   e.g. **Polycam**, **3D Scanner App**, or anything built on Apple's
   RoomPlan. Export as `.glb`, `.gltf`, or `.obj`.
2. In this app, open a room and upload that export file.
3. The room page renders it with Three.js — orbit/zoom to look around —
   next to the list of equipment registered in that room.

If a future need justifies it, a companion native/PWA capture app using
ARKit's RoomPlan or ARCore's Depth API could feed scans in automatically;
that's out of scope for a browser-only app and would need its own native
project.

### AI photo identification

When adding equipment, you can attach a photo (ideally of the nameplate/
label) and click **"Identify from photo."** This calls Claude's vision API
*directly from your browser* to guess the manufacturer, model number, and
category, which you can then apply to the form with one click.

This requires your own Anthropic API key, pasted into **Settings**. A few
things worth knowing:

- The key is stored only in this browser's local storage/IndexedDB. It is
  never sent anywhere except `api.anthropic.com`.
- Calling a provider's API directly from a browser means the key is
  visible to anyone with access to that browser's network tab. That's an
  acceptable trade-off for a personal single-user tool like this one, but
  don't reuse a key you care about scoping tightly, and don't adapt this
  pattern for an app other people will use with a shared key.
- Get a key at [console.anthropic.com](https://console.anthropic.com/).

### Backups / multi-device

There's no sync server — this is intentionally zero-infrastructure. Use
**Settings → Export backup** regularly (it bundles rooms, equipment,
photos, and 3D scan files into one `.json` file) and **Import backup** on
another browser/device to carry your data over. A natural next step, if
you want automatic multi-device sync later, is swapping the `db.js`
storage layer for Firebase Firestore + Storage — the same pattern this
repo's `draft_board` app already uses for shared state, with no server to
run.

## Data model

- **Room**: name, type, floor, notes, optional 3D scan file.
- **Equipment**: name, category, room, manufacturer, model/serial number,
  year manufactured, install/purchase dates and price, retailer, warranty
  (start date + length, or an explicit expiration date), support phone,
  support/manufacturer website, troubleshooting link, manual link, a
  photo, free-form notes, and a list of recurring maintenance tasks
  (title, interval, next-due date, notes).

## Calendar export

**Maintenance → Export .ics** builds one calendar file containing:

- A recurring all-day event per maintenance task (using an `RRULE`, so the
  recurrence is baked into the file — no live feed to keep in sync).
- A one-off reminder for each item's warranty expiration date, with a
  7-day-ahead alarm.

Import it once into Apple Calendar, Google Calendar, or Outlook; re-export
and re-import after adding or changing tasks.

## Project layout

```
index.html          App shell, nav, Three.js import map
css/styles.css       Styling
js/db.js             IndexedDB wrapper (rooms, equipment, settings stores)
js/utils.js          Date/warranty math, formatting, blob helpers
js/app.js            Routing, rendering, all view wiring
js/forms.js          Add/edit modals for rooms, equipment, maintenance tasks
js/modal.js          Generic modal open/close
js/viewer3d.js       Three.js room-scan viewer (lazy-loaded)
js/ical.js           .ics calendar file generation
js/ai-identify.js    Claude vision API call for photo identification
js/backup.js         JSON export/import
```

No build step, no dependencies to install — Three.js loads from a CDN
only when you actually open a room's 3D view.
