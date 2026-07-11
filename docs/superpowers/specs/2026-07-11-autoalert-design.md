# AutoAlert — Design Spec v1.0

**Data:** 2026-07-11 · **Aprobat de:** Marius (brainstorming iterativ)

## Scop

Aplicație de alerte auto pentru familie: ITP, RCA/CASCO, rovinietă, schimburi (ulei, filtre, distribuție), revizie, anvelope, taxă pod. Alerte pe **dată** și **kilometraj**, cu sync cloud între membrii familiei.

**Public țintă:** familie cu mai multe mașini, conturi Google separate, date partajate într-un grup comun.

**Platformă:** PWA (faza 1) + wrapper Android WebView APK (faza 2).

---

## Decizii de design (brainstorming)

| Întrebare | Decizie |
|-----------|---------|
| Public | Familie — mai multe mașini, partajare |
| Platformă | PWA + APK Android (ambele) |
| Partajare date | Conturi separate + grup familie cu cod invitație |
| Tipuri alertă v1 | Dată + kilometraj (fără tipuri custom) |
| Notificări | Reminder dimineață (7–10) + praguri configurabile per tip |
| Temă vizuală | Dashboard auto dedicat — negru/gri, accente portocalii |
| Arhitectură | PWA modulară (vanilla JS + Firebase) |

---

## Arhitectură

```
┌─────────────────────────────────────────────────┐
│  PWA (browser / instalat)                       │
│  ┌─────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Dashboard│  │ Mașini   │  │ Setări/Familie│  │
│  └────┬────┘  └────┬─────┘  └───────┬───────┘  │
│       └────────────┴────────────────┘           │
│                    │                            │
│         localStorage (cache offline)            │
│                    │                            │
│              Firebase Auth (Google)             │
│              Firebase RTDB (sync familie)       │
└─────────────────────────────────────────────────┘
                         │
              (faza 2) Android WebView APK
```

### Abordare implementare

**Varianta aleasă:** PWA modulară — HTML + vanilla JS împărțit în module, Firebase Auth + RTDB, APK WebView în faza 2.

Alternative respinse:
- Monolit single-file (DatorieTrack-style) — prea greu de întreținut
- React/Next — departe de ecosistemul existent, încetinește MVP-ul

---

## Model de date Firebase

```
users/{uid}/
  familyId: string
  displayName: string
  email: string

families/{familyId}/
  name: string
  inviteCode: string        # 6 chars uppercase, ex. "X7K2M9"
  ownerUid: string
  createdAt: number

  members/{uid}/
    role: "owner" | "member"
    joinedAt: number
    displayName: string

  cars/{carId}/
    plate: string           # max 10 chars
    brand: string
    model: string
    year: number
    currentKm: number       # 0–999999
    currentKmUpdatedAt: number
    color: string           # opțional, pentru UI
    createdAt: number
    updatedAt: number
    updatedBy: string       # uid

    services/{serviceId}/
      type: enum            # vezi tabelul de mai jos
      mode: "date" | "mileage" | "both"
      lastDate: string      # ISO YYYY-MM-DD
      nextDate: string
      intervalDays: number  # calculat sau manual
      lastKm: number
      intervalKm: number
      warnKmBefore: number
      warnDaysBefore: number[]   # ex. [30, 14, 7]
      notes: string
      cost: number          # opțional, RON
      createdAt: number
      updatedAt: number

    history/{historyId}/     # la „Marchează făcut"
      serviceId: string
      type: string
      doneDate: string
      doneKm: number
      cost: number
      notes: string
      doneBy: string        # uid

```

**Join familie:** query `families` cu `.orderByChild('inviteCode').equalTo(code)` — necesită `.indexOn: "inviteCode"` în rules.

### Tipuri servicii predefinite (v1)

| Tip | `type` key | Mod default | Alerte default |
|-----|------------|-------------|----------------|
| ITP | `itp` | date | 30, 14, 7 zile |
| RCA | `rca` | date | 30, 14 zile |
| CASCO | `casco` | date | 30, 14 zile |
| Rovinietă | `rovigneta` | date | 14, 7, 3 zile |
| Taxă pod Fetești | `taxa_pod` | date | 14, 7 zile |
| Schimb ulei | `ulei` | mileage | 1000 km înainte |
| Filtre | `filtre` | mileage | 500 km înainte |
| Distribuție | `distributie` | mileage | 2000 km înainte |
| Revizie | `revizie` | both | 1000 km + 30 zile |
| Anvelope iarnă | `roata_iarna` | date | 14 zile (sugestie 1 oct) |
| Anvelope vară | `roata_vara` | date | 14 zile (sugestie 1 apr) |

---

## Flux familie

1. **Owner** se loghează cu Google → creează familie (nume) → primește cod invitație
2. **Membri** se loghează → introduc codul → sunt adăugați în `members/{uid}`
3. Toți membrii văd aceleași mașini și servicii (subscribe RTDB)
4. Oricine poate: adăuga mașină, actualiza km, marca service făcut, edita servicii
5. Doar **owner** poate: elimina membri, regenera cod invitație, șterge familia
6. Membrii non-owner pot **părăsi familia**

---

## Motor de alerte

### Calcul status

Pentru fiecare serviciu, se calculează un status pe dată și/sau km; se ia cel mai grav:

| Status | Condiție dată | Condiție km |
|--------|---------------|-------------|
| `expired` | `daysLeft < 0` | `kmLeft <= 0` |
| `urgent` | `daysLeft <= min(warnDaysBefore)` | `kmLeft <= warnKmBefore` |
| `warning` | `daysLeft <= max(warnDaysBefore)` | `kmLeft <= warnKmBefore * 2` |
| `ok` | altfel | altfel |

Ordine gravitate: `expired` > `urgent` > `warning` > `ok`

### Reminder dimineață

- Activare: toggle în Setări (`localStorage.morningNotif = '1'`)
- Fereastră: 7:00–10:59, maxim o notificare/zi (`morningNotifDay`)
- Trigger: la deschiderea app + verificare periodică (`setInterval` 15 min)
- Conținut: „X urgente · Y în curând" + detalii scurte per mașină
- Tag notificare: `aa-morning` (înlocuiește notificarea anterioară)

### Faza 2 APK

- `WorkManager` la 7:30 zilnic — notificare nativă chiar dacă PWA e închis
- Bridge JS ↔ Kotlin pentru scheduling

---

## Sync și offline

**Strategie:** offline-first cu cache local.

1. La login: subscribe `families/{familyId}/**`
2. La fiecare `onSnapshot`: scrie în `localStorage` cheia `aa_cache_{familyId}`
3. La deschidere: render instant din cache, apoi sync Firebase
4. **Conflict:** last-write-wins per câmp; `updatedAt` + `updatedBy` pentru audit
5. **Km curent:** la conflict, se păstrează valoarea **cea mai mare** (km nu scade)

---

## UI — Identitate vizuală „Garage Dashboard"

### Tokeni CSS

| Token | Valoare | Utilizare |
|-------|---------|-----------|
| `--bg0` | `#0d0f12` | Fundal principal |
| `--bg1` | `#151820` | Carduri |
| `--bg2` | `#1c2030` | Input-uri, hover |
| `--border` | `#2a3040` | Contururi |
| `--txt1` | `#e8eaef` | Text principal |
| `--txt2` | `#8b92a8` | Text secundar |
| `--accent` | `#f97316` | CTA, accent activ |
| `--accent2` | `#ea580c` | Hover |
| `--green` | `#22c55e` | OK |
| `--yellow` | `#eab308` | Atenție |
| `--red` | `#ef4444` | Expirat / urgent |
| `--blue` | `#3b82f6` | Info (km, date) |

**Fonturi:** DM Sans (UI), JetBrains Mono (numere, numere înmatriculare, km, date).

### Ecrane

1. **Login / Onboarding** — Google Sign-In, creare familie sau cod invitație, wizard opțional prima mașină
2. **Dashboard** — banner status, carduri mașini sortate după urgență, FAB adaugă mașină
3. **Detalii mașină** — header, km curent editabil, listă servicii cu badge + countdown
4. **Formular serviciu** — tip, mod, câmpuri dinamice, preview următor termen
5. **Familie** — membri, cod invitație (copy), gestionare roluri
6. **Setări** — reminder dimineață, praguri globale default, export JSON, versiune

### Navigare

Bottom bar: **Acasă** | **Mașini** | **Familie** + acces Setări din header.

---

## Structură fișiere

```
AutoAlert/
├── index.html
├── manifest.json
├── service-worker.js
├── version.json
├── icon.svg
├── icon-192.png
├── icon-512.png
├── css/
│   └── aa-v1.0.css
├── js/
│   ├── aa-core.js           # utilitare, storage, date math
│   ├── aa-firebase.js       # auth, sync, family CRUD
│   ├── aa-cars.js           # mașini + servicii CRUD
│   ├── aa-alerts.js         # motor alerte + status
│   ├── aa-notifications.js  # reminder dimineață, permisiuni
│   └── aa-ui.js             # render, formulare, navigare
├── database.rules.json
└── docs/superpowers/specs/
    └── 2026-07-11-autoalert-design.md
```

### PWA

- `manifest.json`: `display: standalone`, `theme_color: #0d0f12`
- Service worker: cache-first pentru assets statice; network-first pentru Firebase
- `version.json` pentru invalidare cache la update

---

## Securitate Firebase RTDB

- Citire/scriere `families/{familyId}` doar pentru membri existenți
- `members/{memberUid}`: write de către propriul uid (join) sau owner (remove)
- `users/{uid}`: read/write doar propriul uid
- `.indexOn: "inviteCode"` pe nodul `families` pentru lookup la join
- Validare schema: `plate` max 10, `currentKm` 0–999999, `type` din enum fix, `warnDaysBefore` array max 5 elemente

---

## MVP Scope

### În v1.0

- Google login + familie cu cod invitație
- 2+ mașini per familie
- 11 tipuri servicii predefinite
- Alerte dată + km cu praguri configurabile per serviciu
- Reminder dimineață (PWA Notification API)
- Dashboard cu status colorat (roșu/portocaliu/galben/verde)
- Marchează făcut + istoric simplu per mașină
- Export JSON backup
- Offline cache + sync Firebase

### Nu în v1.0

- Tipuri custom de alertă
- Integrare API externe (ITP, RCA online)
- Push server-side (FCM)
- Grafice costuri / rapoarte
- Light theme
- Mai mult de o familie per user
- Notificări native Android (faza 2)

---

## Faza 2 — APK Android

Refolosește pattern FinTrackPro-Android:

- `WebViewAssetLoader` servește PWA din `assets/`
- `AndroidBridge` pentru export fișier + notificări native
- `WorkManager` reminder 7:30 zilnic
- `versionCode` sincronizat cu `version.json`

Proiect separat: `AutoAlert-Android/` (sau reutilizare template FinTrackPro).

---

## Verificare

- [ ] `index.html` funcțional în browser (ambele fluxuri: owner + member)
- [ ] Firebase rules deployate și testate
- [ ] Alerte corecte pentru dată expirată, în prag, și km depășit
- [ ] Reminder dimineață cu permisiune acordată
- [ ] Offline: date vizibile din cache fără rețea
- [ ] PWA instalabilă pe Android (HTTPS deploy)
- [ ] `version.json` bump la release

---

## Versiune inițială

**APP_VERSION:** 1.0.0