# AutoAlert MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AutoAlert v1.0 PWA — family car maintenance alerts with Firebase sync, date + mileage reminders, and Garage Dashboard UI.

**Architecture:** Modular vanilla JS (`AA` namespace) + Firebase Auth/RTDB + localStorage offline cache. Single `index.html` shell with view-based navigation.

**Tech Stack:** HTML5, CSS3, vanilla JS, Firebase JS SDK 10.12.2 (CDN), PWA service worker, Google Fonts (DM Sans, JetBrains Mono).

## Global Constraints

- **APP_VERSION:** `1.0.0`
- **Theme:** Garage Dashboard — `--bg0: #0d0f12`, `--accent: #f97316`
- **11 service types:** itp, rca, casco, rovigneta, taxa_pod, ulei, filtre, distributie, revizie, roata_iarna, roata_vara
- **Family join:** `families.orderByChild('inviteCode').equalTo(code)` with `.indexOn: "inviteCode"`
- **Morning reminder:** 7:00–10:59, tag `aa-morning`, `localStorage.morningNotif`
- **Km conflict rule:** keep highest `currentKm`
- **No custom alert types, no light theme, no FCM in v1.0**

---

### Task 1: Project scaffold + core utilities

**Files:**
- Create: `index.html`, `manifest.json`, `version.json`, `icon.svg`, `css/aa-v1.0.css`
- Create: `js/aa-core.js`, `js/aa-alerts.js`
- Create: `firebase-config.example.js`

**Interfaces — Produces:**
- `AA.APP_VERSION`, `AA.todayStr()`, `AA.diffDays(a,b)`, `AA.genId()`, `AA.genInviteCode()`
- `AA.SERVICE_TYPES`, `AA.getServiceStatus(service, car)`, `AA.worstStatus(statuses)`
- `AA.showToast(msg, type)`, `AA.LS` keys

- [ ] **Step 1:** Create scaffold files with theme tokens and HTML shell (auth, dashboard, cars, family, settings views)
- [ ] **Step 2:** Implement `aa-core.js` date/id/storage helpers
- [ ] **Step 3:** Implement `aa-alerts.js` with status engine per spec table
- [ ] **Step 4:** Manual test in browser console: `AA.getServiceStatus({nextDate:'2026-07-01',warnDaysBefore:[30,14,7]}, {currentKm:50000})` → `expired`
- [ ] **Step 5:** Commit `feat: scaffold AutoAlert core and alert engine`

### Task 2: Firebase auth + family sync

**Files:**
- Create: `js/aa-firebase.js`, `database.rules.json`, `firebase-config.example.js`
- Modify: `index.html` (load Firebase SDK + config)

**Interfaces — Consumes:** `AA.genId`, `AA.genInviteCode`, `AA.LS`
**Interfaces — Produces:**
- `AA.fb.init()`, `AA.fb.signInGoogle()`, `AA.fb.signOut()`
- `AA.fb.createFamily(name)`, `AA.fb.joinFamily(code)`, `AA.fb.leaveFamily()`
- `AA.fb.subscribeFamily(cb)`, `AA.fb.getState()` → `{ user, family, members, cars }`

- [ ] **Step 1:** Write `database.rules.json` with member-only access + schema validation
- [ ] **Step 2:** Implement auth + family CRUD + RTDB listener with localStorage cache `aa_cache_{familyId}`
- [ ] **Step 3:** Show setup screen when `AA_FIREBASE_CONFIG` missing
- [ ] **Step 4:** Commit `feat: Firebase auth and family sync`

### Task 3: Cars + services CRUD

**Files:**
- Create: `js/aa-cars.js`
- Modify: `js/aa-ui.js` (forms)

**Interfaces — Produces:**
- `AA.cars.add(car)`, `AA.cars.updateKm(carId, km)`, `AA.cars.remove(carId)`
- `AA.cars.addService(carId, service)`, `AA.cars.updateService(carId, sid, data)`
- `AA.cars.markDone(carId, sid, {date, km, cost})` → updates service + writes history

- [ ] **Step 1:** Implement CRUD with `updatedAt`/`updatedBy` on every write
- [ ] **Step 2:** Wire forms in UI for add car, add/edit service, mark done
- [ ] **Step 3:** Commit `feat: cars and services CRUD`

### Task 4: UI + notifications + PWA

**Files:**
- Create: `js/aa-ui.js`, `js/aa-notifications.js`, `service-worker.js`
- Modify: `index.html`, `manifest.json`

**Interfaces — Produces:**
- `AA.ui.render()`, `AA.ui.navigate(view)`
- `AA.notif.toggleMorning(enabled)`, `AA.notif.checkMorning()`
- Service worker precaching shell assets

- [ ] **Step 1:** Dashboard with urgency-sorted car cards and status badges
- [ ] **Step 2:** Morning notification + settings toggle + JSON export
- [ ] **Step 3:** Register service worker, verify offline shell loads
- [ ] **Step 4:** Commit `feat: UI, notifications, and PWA shell`

### Task 5: Verification

- [ ] Login flow (owner create + member join)
- [ ] Add car + ITP service → dashboard shows correct countdown
- [ ] Mark done resets dates
- [ ] Km update triggers mileage alert
- [ ] Export JSON downloads valid backup
- [ ] Bump `version.json` to `1.0.0`, commit `chore: release v1.0.0`