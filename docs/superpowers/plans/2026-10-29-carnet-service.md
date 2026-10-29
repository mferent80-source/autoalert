# AutoAlert 1.7.0 — Carnet de service, anvelope, termene noi, cheltuieli

> Aprobat de el în chat, 29.10.2026 („e ok poți să faci”). Execuție: direct, în sesiune (regula lui: fără lanț de agenți).

**Goal:** tot ce ține de mașină într-un loc: intervenții cu mai multe operații, seturi de anvelope, termene noi, cheltuieli; plus reparațiile din audit.

**Architecture:** logica pură în `js/aa-carnet.js` (operații, termen următor, anvelope, cheltuieli) + extinderi în `js/aa-alerts.js` (tipuri noi, alerte de anvelope în `aggregateAlerts`, deci și în push). Testele cu `node --test tests/` încarcă fișierele prin `vm`, ca `scripts/push`. UI în `js/aa-ui.js`, stil în `css/aa-v2.css`, reguli RTDB extinse ÎNAINTE de codul care le folosește.

## Global Constraints
- Versiunea 1.7.0 peste tot (`AA.APP_VERSION`, `version.json`, `?v=` din `index.html`, `CACHE_VERSION` din SW).
- Rezultatele afișate cu cel mult o zecimală (regula lui, 03.10).
- Nimic pierdut: tot ce arată azi ecranul mașinii rămâne (termene, Făcut, Editează, Șterge, km, istoric).
- Regulile RTDB publicate și verificate înaintea codului de aplicație.

## Review Focus
1. Mașină fără `year` / fără istorie / fără anvelope: niciun ecran nu cade.
2. Termen editat de mână (RCA 6 luni) → „Făcut” păstrează 6 luni.
3. Km mai mici decât cei salvați → se cere confirmarea, nu se refuză tăcut.
4. Intrări vechi de istoric (`type: 'ulei'`, fără `kind`) se afișează și se editează la fel.
5. 31 ian + 1 lună = 28/29 feb, nu 3 martie.

### Task 1: Motorul (`js/aa-carnet.js`, `js/aa-alerts.js`) — TDD
- `AA.addMonths` cu capăt de lună; `AA.defaultIntervalMonths(type, car)` (ITP 12 luni la mașini > 12 ani).
- `AA.carnet.nextDueDate(svc, doneDate, car)`; `AA.carnet.validityOptions(type)`; `AA.carnet.planIntervention(car, data)` → `{ serviceUpdates, entry, resets }`.
- `AA.carnet.tireStatus(tire, today)`; alerte de anvelope în `getCarWorstStatus` și `aggregateAlerts`.
- `AA.carnet.costSummary(car, today)`; `AA.carnet.historyLabel(h)`; `AA.carnet.resolveKm(cur, val, allowLower)`.
- Tipuri noi: placute, lichid_frana, antigel, baterie, ac, trusa, extinctor, impozit, permis.

### Task 2: Reguli RTDB — tipurile noi, `intervalMonths`, `tires`, câmpurile noi din `history`. Push separat, se așteaptă workflow-ul verde și se citesc regulile active.

### Task 3: UI — „Făcut” cu Valabil + termenul următor + notă; km corectabili; carnet complet pe ani, editabil; „+ Intervenție”; anvelope (seturi, „Am montat”); cheltuieli; demo cu date noi.

### Task 4: Probe — `node --test tests/` + `scripts/push`, poze în demo pe telefon și monitor, apoi livrare + proba pe live.
