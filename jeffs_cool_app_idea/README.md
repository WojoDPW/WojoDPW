# Jeff's Cool App Idea — Home Inventory

A one-stop digital record of your house and everything in it: rooms (with
3D scans), an equipment/fixture registry with warranty and support info,
and a maintenance calendar you can export to any calendar app. Multiple
people can use it: the owner can give family members view-only access,
and hand the whole thing off to a buyer when the house is sold.

It's a static web app — no custom backend to run — backed by **Firebase**
(Auth + Firestore + Storage). All access control is enforced by Firestore
and Storage **security rules**, not by a server you maintain; the same
no-backend spirit as this repo's `draft_board` app, just with real
multi-user accounts this time.

## One-time setup (you need to do this before it works)

### 1. Create a Firebase project

Go to the [Firebase console](https://console.firebase.google.com/) (sign
in with the same Google account as your other Firebase project) → **Add
project**. Give it its own name — don't reuse your fantasy-football
project; keeping them separate means their data and security rules can't
accidentally interfere with each other.

### 2. Enable Authentication

In the new project: **Build → Authentication → Get started → Sign-in
method → Email/Password → Enable**. That's the only provider this app
uses.

### 3. Enable Firestore

**Build → Firestore Database → Create database**. Pick any region close
to you. Start in production mode — you're about to deploy real security
rules, not the wide-open test-mode default.

### 4. Enable Storage

**Build → Storage → Get started**. Photos and 3D scans need this.
**Note:** Firebase now requires the pay-as-you-go **Blaze plan** to use
Storage at all, even for tiny amounts of data. Blaze still has a generous
free tier (5 GB stored, 1 GB/day downloaded) — normal personal use (a few
dozen photos and room scans) will cost at most pennies a month, likely
$0. You do need a billing card on file to enable it, though.

### 5. Register a web app and get your config

**Project settings (gear icon) → General → Your apps → Add app → Web**.
Give it any nickname, skip Firebase Hosting (you're using GitHub Pages).
Copy the `firebaseConfig` object it shows you into
[`js/firebase-config.js`](js/firebase-config.js), replacing the
placeholder values. This config is **not a secret** — it's a public
client identifier, safe to commit and safe to serve from a public page.
Actual security comes from the rules below, not from hiding this object.

### 6. Add your GitHub Pages domain to Authorized domains

**Authentication → Settings → Authorized domains → Add domain** →
`wojodpw.github.io` (or wherever you're hosting this). Without this,
sign-in will fail with an `unauthorized-domain` error once you're not on
`localhost` anymore.

### 7. Deploy the security rules and indexes

These three files in this folder define who can read/write what —
[`firestore.rules`](firestore.rules), [`storage.rules`](storage.rules),
and [`firestore.indexes.json`](firestore.indexes.json). Deploy them
either way:

**Via the console (no install needed):** paste `firestore.rules` into
**Firestore Database → Rules → Publish**, and `storage.rules` into
**Storage → Rules → Publish**. Composite indexes get created
automatically the first time a query needs one — Firestore will show a
console error with a one-click "create index" link if that ever happens;
`firestore.indexes.json` documents which ones this app expects.

**Via the Firebase CLI**, if you have Node installed:

```bash
npm install -g firebase-tools
firebase login
cd jeffs_cool_app_idea
firebase deploy --only firestore:rules,firestore:indexes,storage:rules --project YOUR_PROJECT_ID
```

### 8. Open the app and create your property

Once deployed, open `index.html` (locally via `python3 -m http.server`,
or on GitHub Pages once pushed), sign up with your email, verify it (a
real verification email, sent by Firebase — check your inbox), then
create your property.

## Running it locally

```bash
cd jeffs_cool_app_idea
python3 -m http.server 8080
# then open http://localhost:8080
```

`localhost` is automatically an authorized domain for Firebase Auth, so
no extra config is needed for local testing once steps 1–7 above are
done against your real project.

## What's in here

| Feature | Status |
|---|---|
| Accounts (email/password, email verification) | ✅ Works |
| Rooms registry (incl. exterior) | ✅ Works |
| Equipment/fixture registry (model, serial, warranty, support links, manuals, notes) | ✅ Works |
| Room → equipment linking, "what's in this room" view | ✅ Works |
| 3D room viewer (Three.js) for uploaded scans | ✅ Works, see caveat below |
| Warranty status tracking (active/expiring/expired) | ✅ Works |
| Maintenance scheduling + `.ics` calendar export | ✅ Works |
| AI photo → make/model identification | ✅ Works, requires your own Anthropic API key |
| Invite family members (view-only access) | ✅ Works |
| Transfer ownership to a buyer (revokes everyone else's access) | ✅ Works |
| Live LiDAR capture inside the app | ❌ Not possible from a browser — see below |

### Accounts, family access, and ownership transfer

- **Sign up / sign in** with email + password. You must verify your email
  (click the link Firebase emails you) before you can accept an invite or
  a property transfer — this prevents someone from claiming access with
  an email they don't actually control.
- **Inviting family** (Settings → Family & access, owner only): enter
  their email. They sign up or sign in with that *exact* email, verify
  it, and see the invite waiting for them under **Properties**. They get
  **view-only** access — they can see everything but can't add, edit, or
  delete anything. The owner can revoke access any time; a family member
  can leave on their own.
- **Transferring ownership** (Settings → Transfer this property, owner
  only): for when the house is sold. Enter the buyer's email. Once they
  accept, **the previous owner and every family member immediately and
  permanently lose all access** — this is deliberate (a stranger buying
  your house shouldn't inherit your family's access to your old data),
  and it cannot be undone. Export anything you want to keep first.
- Everything cross-user (invite acceptance, ownership transfer) is
  enforced entirely by Firestore/Storage **security rules** — there's no
  Cloud Function or server doing this work, consistent with the rest of
  this repo. Those rules were validated against the Firestore/Auth/
  Storage emulators with 48 automated tests (43 rules-unit tests + 5
  Storage rules tests) covering the adversarial cases: a stranger trying
  to self-promote to owner, accepting someone else's invite or transfer,
  retaining access after being removed — plus a full end-to-end browser
  test of the real sign-up → invite → transfer flow.

### 3D room scans

There is no web API that lets a browser drive a phone's LiDAR sensor
directly. The realistic workflow:

1. Scan each room (and the exterior) with an existing scanning app —
   e.g. **Polycam**, **3D Scanner App**, or anything built on Apple's
   RoomPlan. Export as `.glb`, `.gltf`, or `.obj`.
2. In this app, open a room (as the owner) and upload that export file.
3. The room page renders it with Three.js — orbit/zoom to look around —
   next to the list of equipment registered in that room. Family members
   (view-only) can see it but not upload or replace it.

### AI photo identification

When adding equipment, you can attach a photo (ideally of the nameplate/
label) and click **"Identify from photo."** This calls Claude's vision API
*directly from your browser* to guess the manufacturer, model number, and
category, which you can then apply to the form with one click.

This requires your own Anthropic API key, pasted into **Settings** (owner
only). A few things worth knowing:

- The key is stored only in this browser's `localStorage`, per device —
  it is never written to Firestore and never sent anywhere except
  `api.anthropic.com`.
- Calling a provider's API directly from a browser means the key is
  visible to anyone with access to that browser's network tab. That's an
  acceptable trade-off for a personal tool like this one, but don't reuse
  a key you care about scoping tightly.
- Get a key at [console.anthropic.com](https://console.anthropic.com/).

### Migrating data from the original local-only version

If you used the very first version of this app (before accounts existed,
data stored only in your browser's IndexedDB), **Settings → Import old
local backup** (owner only) reads one of its exported `.json` backup
files, uploads any embedded photos/3D scans to Firebase Storage, and
creates the corresponding rooms and equipment under your current
property.

### Backup

**Settings → Export this property's data (.json)** (owner only) is a
point-in-time export of your rooms and equipment for your own records —
useful before a risky change, or just to have a copy outside the app.
It's **not** a disaster-recovery mechanism anymore: your actual data and
files already live durably in Firebase (Firestore + Storage), with
Google's own backups behind them. Treat the exported file as sensitive —
the photo/scan links in it work without signing in.

## Data model (Firestore)

```
users/{uid}                              profile (email, displayName)
users/{uid}/memberships/{propertyId}     index: "which properties can I open"

properties/{propertyId}                  name, address, ownerUid, ownerEmail, pendingTransferId
properties/{propertyId}/members/{uid}    role: 'owner' | 'viewer'
properties/{propertyId}/pendingInvites/{email}   owner-visible mirror of outstanding invites
properties/{propertyId}/rooms/{roomId}           name, type, floor, notes, 3D scan file ref
properties/{propertyId}/equipment/{id}           everything about one item + maintenance tasks

invites/{propertyId}__{email}            pending/accepted family invite
transferRequests/{propertyId}__{email}   pending/accepted ownership transfer
```

Photos and 3D scans live in Firebase Storage under
`properties/{propertyId}/equipment/{id}/...` and
`properties/{propertyId}/rooms/{roomId}/...`, referenced from the
Firestore documents above by path + download URL.

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
index.html              App shell, nav, Three.js + Firebase import map
css/styles.css           Styling
firestore.rules          Security rules: all cross-user access control lives here
storage.rules             Security rules for Storage (photos, 3D scans)
firestore.indexes.json   Composite indexes the invite/transfer queries use
firebase.json             Points the Firebase CLI at the two rules files above

js/firebase-config.js    Your Firebase project's web app config (paste yours in)
js/firebase-init.js      Initializes the Firebase SDK from that config
js/auth.js               Sign up/in/out, email verification, token refresh
js/data.js               All Firestore reads/writes (properties, rooms, equipment,
                         members, invites, transfers)
js/storage.js            Firebase Storage upload/download (photos, 3D scans)
js/legacy-import.js      One-time importer for the old local-only version's backups
js/app.js                Routing, rendering, all view wiring
js/forms.js              Add/edit modals for properties, rooms, equipment,
                         maintenance tasks, invites, transfers
js/modal.js              Generic modal open/close
js/viewer3d.js           Three.js room-scan viewer (lazy-loaded)
js/ical.js               .ics calendar file generation
js/ai-identify.js        Claude vision API call for photo identification
js/backup.js             JSON export of one property's structured data
js/local-settings.js     Per-browser preferences (the Anthropic API key) via localStorage
js/utils.js              Date/warranty math, formatting, misc helpers
```

No build step — Three.js and the Firebase SDK both load from their
official CDNs, only when actually needed.
