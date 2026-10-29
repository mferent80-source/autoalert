/* AutoAlert — UI rendering & navigation */
(function (global) {
  'use strict';

  const AA = global.AA || {};
  AA.ui = AA.ui || {};

  let _view = 'loading';
  let _selectedCarId = null;
  let _modal = null;
  let _demoMode = false;
  let _renderTimer = null;
  let _deepLinkDone = false;
  let _okCollapsed = true;

  AA.ui._countCarAlerts = function (car) {
    const c = { expired: 0, urgent: 0, warning: 0, total: 0 };
    Object.keys(car.services || {}).forEach(function (sid) {
      const st = AA.getServiceStatus(car.services[sid], car);
      if (st === 'expired') c.expired++;
      else if (st === 'urgent') c.urgent++;
      else if (st === 'warning') c.warning++;
    });
    AA.tireItemsOf(car).forEach(function (t) {
      const st = t.st.status;
      if (st === 'expired') c.expired++;
      else if (st === 'urgent') c.urgent++;
      else if (st === 'warning') c.warning++;
    });
    c.total = c.expired + c.urgent + c.warning;
    return c;
  };

  AA.ui._alertCountLabel = function (counts) {
    const parts = [];
    if (counts.expired) parts.push(counts.expired + ' expirat' + (counts.expired > 1 ? 'e' : ''));
    if (counts.urgent) parts.push(counts.urgent + ' urgent' + (counts.urgent > 1 ? 'e' : ''));
    if (counts.warning) parts.push(counts.warning + ' curând');
    return parts.join(' · ');
  };

  AA.ui._countAlertCars = function (cars) {
    let n = 0;
    Object.keys(cars || {}).forEach(function (id) {
      if (AA.getCarWorstStatus(cars[id]) !== 'ok') n++;
    });
    return n;
  };

  AA.ui._worstFleetStatus = function (cars) {
    let worst = 'ok';
    Object.keys(cars || {}).forEach(function (id) {
      const s = AA.getCarWorstStatus(cars[id]);
      if ((AA.STATUS_RANK[s] ?? 3) < (AA.STATUS_RANK[worst] ?? 3)) worst = s;
    });
    return worst;
  };

  // „o zi”, „5 zile”, „20 de zile”, „1.200 de km”
  AA.ui._n = function (n, one, many) {
    n = Math.abs(n);
    if (n === 1) return one;
    const r = n % 100;
    return n.toLocaleString('ro-RO') + ((n >= 20 && (r === 0 || r >= 20)) ? ' de ' : ' ') + many;
  };

  AA.ui._de = function (n) {
    n = Math.abs(n);
    const r = n % 100;
    return (n >= 20 && (r === 0 || r >= 20)) ? 'de ' : '';
  };

  // Citirea unui termen: ce scrie pe rând, ce cifră mare apare pe bord, cât mai e din interval.
  AA.ui._svcInfo = function (svc, car) {
    const meta = AA.SERVICE_TYPES[svc.type] || { label: svc.type };
    const mode = svc.mode || meta.mode || 'date';
    const today = AA.todayStr();
    let date = null;
    let km = null;
    if ((mode === 'date' || mode === 'both') && svc.nextDate) {
      const d = AA.diffDays(today, svc.nextDate);
      if (d != null) date = { left: d, st: AA.statusFromDate(d, svc.warnDaysBefore || meta.warnDaysBefore), at: svc.nextDate };
    }
    if ((mode === 'mileage' || mode === 'both') && svc.intervalKm && car && car.currentKm != null) {
      const due = Number(svc.lastKm || 0) + Number(svc.intervalKm);
      const k = due - Number(car.currentKm);
      km = { left: k, st: AA.statusFromKm(k, svc.warnKmBefore ?? meta.warnKmBefore), at: due };
    }
    let lead = date || km;
    if (date && km && (AA.STATUS_RANK[km.st] ?? 3) < (AA.STATUS_RANK[date.st] ?? 3)) lead = km;
    const other = lead === date ? km : (lead === km ? date : null);

    const fmtDate = function (x) {
      const n = x.left;
      if (n < 0) return { text: 'expirat de ' + AA.ui._n(n, 'o zi', 'zile'), num: String(-n), unit: AA.ui._de(n) + (n === -1 ? 'zi' : 'zile') + ' peste termen', sub: AA.formatDate(x.at) };
      if (n === 0) return { text: 'expiră azi', num: 'Azi', unit: 'e ultima zi', sub: AA.formatDate(x.at) };
      if (n === 1) return { text: 'expiră mâine', num: '1', unit: 'zi rămasă', sub: AA.formatDate(x.at) };
      return { text: 'în ' + AA.ui._n(n, 'o zi', 'zile'), num: String(n), unit: AA.ui._de(n) + 'zile rămase', sub: AA.formatDate(x.at) };
    };
    const fmtKm = function (x) {
      const n = x.left;
      const at = 'la ' + AA.formatKm(x.at);
      if (n < 0) return { text: 'depășit cu ' + AA.ui._n(n, '1 km', 'km'), num: (-n).toLocaleString('ro-RO'), unit: AA.ui._de(n) + 'km peste interval', sub: at };
      if (n === 0) return { text: 'la limită', num: '0', unit: 'km rămași', sub: at };
      return { text: 'încă ' + AA.ui._n(n, '1 km', 'km'), num: n.toLocaleString('ro-RO'), unit: AA.ui._de(n) + 'km rămași', sub: at };
    };

    const out = {
      status: AA.getServiceStatus(svc, car),
      label: meta.label,
      pct: AA.getServiceProgress(svc, car),
      text: 'fără termen',
      sub: 'setează data sau km',
      num: '—',
      unit: '',
      other: ''
    };
    if (lead) Object.assign(out, lead === date ? fmtDate(lead) : fmtKm(lead));
    if (other) out.other = (other === date ? fmtDate(other) : fmtKm(other)).text;
    return out;
  };

  // Toate termenele familiei, cele mai grave primele.
  AA.ui._agenda = function (cars) {
    const items = [];
    Object.keys(cars || {}).forEach(function (carId) {
      const car = cars[carId];
      Object.keys(car.services || {}).forEach(function (sid) {
        const svc = car.services[sid];
        const info = AA.ui._svcInfo(svc, car);
        items.push({ carId: carId, sid: sid, car: car, svc: svc, info: info });
      });
      AA.tireItemsOf(car).forEach(function (t) {
        if (t.st.status === 'ok') return;
        items.push({ carId: carId, sid: 'tire:' + t.tid, tid: t.tid, car: car,
          svc: { type: AA.ui._tireIcon(t.tire.season) }, info: AA.ui._tireInfo(t) });
      });
    });
    items.sort(function (a, b) {
      const ra = AA.STATUS_RANK[a.info.status] ?? 3;
      const rb = AA.STATUS_RANK[b.info.status] ?? 3;
      if (ra !== rb) return ra - rb;
      const pa = a.info.pct == null ? 101 : a.info.pct;
      const pb = b.info.pct == null ? 101 : b.info.pct;
      return pa - pb;
    });
    return items;
  };

  AA.ui._tireIcon = function (season) {
    return season === 'iarna' ? 'roata_iarna' : (season === 'vara' ? 'roata_vara' : 'wheel');
  };

  // Un set de anvelope citit ca un termen: profilul jos bate vârsta.
  AA.ui._tireInfo = function (t) {
    const s = t.st;
    const season = AA.TIRE_SEASONS[t.tire.season] || AA.TIRE_SEASONS.vara;
    const mm = t.tire.treadMm;
    const lowMm = mm != null && mm !== '' && Number(mm) < season.minMm;
    return {
      status: s.status, label: s.label, pct: null, other: '',
      text: lowMm ? 'profil ' + AA.fmt1(mm) + ' mm' : (s.ageYears != null ? 'au ' + AA.fmt1(s.ageYears) + ' ani' : s.text),
      sub: s.hint || (t.tire.dot ? 'DOT ' + t.tire.dot : ''),
      num: lowMm ? AA.fmt1(mm) : AA.fmt1(s.ageYears || 0),
      unit: lowMm ? 'mm profil rămas' : 'ani de la fabricație'
    };
  };

  AA.ui._lei = function (n) {
    return AA.fmt1(n) + ' lei';
  };

  AA.ui._plate = function (plate, size) {
    const p = AA.formatPlate(plate) || '—';
    return '<span class="plate' + (size ? ' plate-' + size : '') + '" aria-label="Număr ' + AA.escapeHtml(p) + '">' +
      '<span class="plate-eu" aria-hidden="true">RO</span><span class="plate-num">' + AA.escapeHtml(p) + '</span></span>';
  };

  AA.ui._carName = function (car, withYear) {
    return AA.escapeHtml(AA.formatCarLabel(car.brand, car.model, withYear ? car.year : '')) || 'Mașină';
  };

  AA.ui._carMeta = function (car) {
    const counts = AA.ui._countCarAlerts(car);
    const n = Object.keys(car.services || {}).length;
    const right = counts.total
      ? '<b>' + AA.escapeHtml(AA.ui._alertCountLabel(counts)) + '</b>'
      : (n ? 'totul în regulă' : 'fără termene');
    return AA.formatKm(car.currentKm) + ' · ' + right;
  };

  AA.ui._carRow = function (car, id) {
    const worst = AA.getCarWorstStatus(car);
    return '<div class="car-row st-' + worst + '" data-car="' + AA.escapeHtml(id) + '" role="button" tabindex="0">' +
      AA.ui._plate(car.plate) +
      '<div class="car-row-main">' +
      '<div class="car-row-name">' + AA.ui._carName(car, true) + '</div>' +
      '<div class="car-row-meta">' + AA.ui._carMeta(car) + '</div>' +
      '</div>' +
      '<span class="dot" aria-hidden="true"></span>' +
      '</div>';
  };

  AA.ui._agendaRow = function (it) {
    return '<div class="row st-' + it.info.status + '" data-car="' + AA.escapeHtml(it.carId) + '" role="button" tabindex="0">' +
      AA.ui._svcIcon(it.svc.type, 22) +
      '<div class="row-main" style="min-width:0">' +
      '<div class="row-title">' + AA.escapeHtml(it.info.label) + '</div>' +
      '<div class="row-sub">' + AA.ui._plate(it.car.plate, 'sm') +
      '<span class="ellip">' + AA.ui._carName(it.car) + '</span></div>' +
      '</div>' +
      '<div class="row-val"><b>' + AA.escapeHtml(it.info.text) + '</b><span>' + AA.escapeHtml(it.info.sub) + '</span></div>' +
      '</div>';
  };

  AA.ui._lampIcon = function (size) {
    size = size || 22;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="6"/><path d="M12 9v3.5M12 15.2v.1"/>' +
      '<path d="M4.6 6.6a9 9 0 000 10.8M19.4 6.6a9 9 0 010 10.8"/></svg>';
  };

  AA.ui._gearIcon = function () {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>';
  };

  AA.ui._trashIcon = function () {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/></svg>';
  };

  // Bordul: cel mai urgent termen, cu cifra mare și butonul „Făcut” la îndemână.
  AA.ui._dashHero = function (st, agenda) {
    const carCount = Object.keys(st.cars || {}).length;
    if (!carCount) {
      return '<div class="empty"><strong>Adaugă prima mașină</strong>' +
        'Treci numărul, kilometrii și termenele (ITP, RCA, ulei). Te anunțăm înainte să expire ceva.' +
        '<button class="btn btn-primary" id="fabAddCar">Adaugă mașină</button></div>';
    }
    const top = agenda.find(function (it) { return it.info.status !== 'ok'; });
    if (!top) {
      const next = agenda.find(function (it) { return it.info.num !== '—'; });
      return '<section class="cluster cluster-calm">' +
        '<h2>Totul e în regulă</h2>' +
        '<p>' + (next
          ? 'Următorul termen: ' + AA.escapeHtml(next.info.label) + ' la ' + AA.escapeHtml(AA.formatPlate(next.car.plate)) + ', ' + AA.escapeHtml(next.info.text) + '.'
          : 'Adaugă termene la mașini ca să-ți putem da de știre.') +
        '</p></section>';
    }
    const i = top.info;
    return '<section class="cluster st-' + i.status + '" aria-label="Cel mai urgent termen">' +
      '<div class="cluster-top">' +
      '<div class="cluster-svc">' + AA.ui._svcIcon(top.svc.type, 24) + AA.escapeHtml(i.label) + '</div>' +
      '<span class="lamp">' + AA.STATUS_LABELS[i.status] + '</span>' +
      '</div>' +
      '<div class="cluster-read"><span class="cluster-num">' + AA.escapeHtml(i.num) + '</span>' +
      '<span class="cluster-unit">' + AA.escapeHtml(i.unit) + '<br>' + AA.escapeHtml(i.sub) + '</span></div>' +
      '<div class="cluster-car">' + AA.ui._plate(top.car.plate) + '<span>' + AA.ui._carName(top.car) + '</span></div>' +
      '<div class="cluster-actions">' +
      (top.tid ? '' : '<button class="btn btn-done" data-quick-done="' + AA.escapeHtml(top.carId) + '" data-sid="' + AA.escapeHtml(top.sid) + '">' + AA.ui._svcIcon('check', 18) + ' Făcut</button>') +
      '<button class="btn" data-car="' + AA.escapeHtml(top.carId) + '">Vezi mașina</button>' +
      '</div></section>';
  };

  AA.ui._sortServiceIds = function (car) {
    return Object.keys(car.services || {}).sort(function (a, b) {
      const sa = AA.getServiceStatus(car.services[a], car);
      const sb = AA.getServiceStatus(car.services[b], car);
      const ra = AA.STATUS_RANK[sa] ?? 3;
      const rb = AA.STATUS_RANK[sb] ?? 3;
      if (ra !== rb) return ra - rb;
      const la = (AA.SERVICE_TYPES[car.services[a].type] || {}).label || '';
      const lb = (AA.SERVICE_TYPES[car.services[b].type] || {}).label || '';
      return la.localeCompare(lb, 'ro');
    });
  };

  AA.ui.getState = function () {
    if (_demoMode) return AA.ui._demoState();
    return AA.fb.getState();
  };

  AA.ui._demoState = function () {
    const today = AA.todayStr();
    const car1 = 'demo_car1';
    const car2 = 'demo_car2';
    return {
      ready: true,
      configured: true,
      demo: true,
      user: { uid: 'demo', displayName: 'Marius Demo', email: 'demo@autoalert.ro' },
      familyId: 'demo_family',
      family: { name: 'Familia Popescu', inviteCode: 'X7K2M9', ownerUid: 'demo', createdAt: Date.now() },
      members: {
        demo: { role: 'owner', displayName: 'Marius Demo', joinedAt: Date.now() },
        demo2: { role: 'member', displayName: 'Ana Popescu', joinedAt: Date.now() }
      },
      cars: {
        [car1]: {
          plate: 'B 123 ABC',
          brand: 'Dacia',
          model: 'Logan',
          year: 2019,
          currentKm: 87200,
          color: '#3b82f6',
          services: {
            s1: { type: 'itp', mode: 'date', nextDate: AA.addDays(today, -3), warnDaysBefore: [30, 14, 7] },
            s2: { type: 'rca', mode: 'date', nextDate: AA.addDays(today, 12), warnDaysBefore: [30, 14] },
            s3: { type: 'ulei', mode: 'mileage', lastKm: 77000, intervalKm: 10000, warnKmBefore: 1000 },
            s6: { type: 'placute', mode: 'mileage', lastKm: 52000, intervalKm: 40000, warnKmBefore: 2000 },
            s7: { type: 'rovigneta', mode: 'date', nextDate: AA.addDays(today, 21), intervalDays: 30, warnDaysBefore: [14, 7, 3] }
          },
          tires: {
            t1: { season: 'vara', brand: 'MICHELIN', size: '195/65 R15', dot: '1222', treadMm: 5.5, location: 'pe mașină', mounted: true },
            t2: { season: 'iarna', brand: 'NOKIAN', size: '195/65 R15', dot: '2318', treadMm: 6, location: 'Hotel anvelope Vulcan', mounted: false }
          },
          history: {
            h1: { type: 'ulei', doneDate: AA.addMonths(today, -8), doneKm: 77000, cost: 280, createdAt: Date.now() - 3 },
            h2: { type: 'interventie', kind: 'interventie', doneDate: AA.addMonths(today, -8), doneKm: 77000, cost: 1250, shop: 'Service Auto Ion',
              ops: { ulei: true, filtru_ulei: true, filtru_aer: true, filtru_polen: true, bujii: true }, notes: 'Următoarea revizie la 87.000', createdAt: Date.now() - 2 },
            h3: { type: 'rca', doneDate: AA.addMonths(today, -11), doneKm: 74000, cost: 1180, notes: 'Allianz', createdAt: Date.now() - 4 },
            h4: { type: 'anvelope', doneDate: AA.addMonths(today, -6), doneKm: 79500, cost: 160, notes: 'Montat setul vară (MICHELIN 195/65 R15)', createdAt: Date.now() - 1 },
            h5: { type: 'itp', doneDate: AA.addMonths(today, -24), doneKm: 61000, cost: 160, createdAt: Date.now() - 5 }
          }
        },
        [car2]: {
          plate: 'CJ 45 XYZ',
          brand: 'VW',
          model: 'Golf',
          year: 2015,
          currentKm: 156400,
          color: '#a855f7',
          services: {
            s4: { type: 'rovigneta', mode: 'date', nextDate: AA.addDays(today, 5), warnDaysBefore: [14, 7, 3] },
            s5: { type: 'filtre', mode: 'mileage', lastKm: 151000, intervalKm: 15000, warnKmBefore: 500 }
          },
          history: {}
        }
      },
      offline: false
    };
  };

  AA.ui.startDemo = function () {
    _demoMode = true;
    _selectedCarId = 'demo_car1';
    AA.ui.navigate('dashboard');
  };

  AA.ui.stopDemo = function () {
    _demoMode = false;
    _modal = null;
    AA.ui.render();
  };

  // ── Istoric: „Înapoi” de pe telefon merge la ecranul anterior, nu iese din aplicație ──
  // Stiva: [baza (Acasă)] [Acasă] [ecran] [ecran] … ; din „baza” apare „apasă încă o dată ca să ieși”.
  let _skipPop = false;
  let _rearmTimer = null;

  AA.ui._hist = function (extra) {
    const cur = history.state || {};
    return Object.assign({ aa: 'view', view: _view, carId: _selectedCarId, d: cur.d || 0 }, extra || {});
  };

  AA.ui._push = function (modal) {
    try {
      const cur = history.state || {};
      const st = AA.ui._hist({ d: (cur.d || 0) + 1, modal: !!modal });
      if (cur.modal && !modal) history.replaceState(Object.assign(st, { d: cur.d || 1 }), '');
      else history.pushState(st, '');
    } catch (_) { /* fără istoric: navigarea merge oricum */ }
  };

  // Butoanele „‹ Mașini” / „‹ Acasă” fac același lucru ca „Înapoi” de pe telefon.
  AA.ui.goBack = function (fallback) {
    const cur = history.state || {};
    if (cur.aa === 'view' && cur.d > 0) { history.back(); return; }
    AA.ui.navigate(fallback || 'dashboard');
  };

  AA.ui._onPop = function (e) {
    if (_skipPop) { _skipPop = false; return; }
    const s = e.state || {};
    _modal = null;
    if (s.aa === 'base') {
      _view = 'dashboard';
      AA.ui.render();
      AA.showToast('Apasă încă o dată Înapoi ca să ieși', 'info');
      clearTimeout(_rearmTimer);
      _rearmTimer = setTimeout(function () {
        if (history.state && history.state.aa === 'base') {
          try { history.pushState(AA.ui._hist({ aa: 'view', view: _view, d: 0 }), ''); } catch (_) {}
        }
      }, 2000);
      return;
    }
    if (s.aa === 'view') {
      if (s.view) _view = s.view;
      if (s.carId) _selectedCarId = s.carId;
    }
    AA.ui.render();
  };

  AA.ui._initHistory = function () {
    try {
      history.replaceState({ aa: 'base', view: 'dashboard', d: 0 }, '');
      history.pushState({ aa: 'view', view: 'dashboard', d: 0 }, '');
    } catch (_) { return; }
    window.addEventListener('popstate', AA.ui._onPop);
  };

  AA.ui.navigate = function (view, opts) {
    opts = opts || {};
    const changed = view !== _view || (opts.carId != null && opts.carId !== _selectedCarId);
    const first = _view === 'loading';
    _view = view;
    if (opts.carId != null) _selectedCarId = opts.carId;
    if (first) {
      try { history.replaceState(AA.ui._hist({ d: 0 }), ''); } catch (_) {}
    } else if (changed) {
      AA.ui._push(false);
    }
    AA.ui.render();
  };

  AA.ui.render = function () {
    const root = document.getElementById('app');
    if (!root) return;
    const st = AA.ui.getState();

    if (!st.ready) {
      root.innerHTML = '<div class="center-msg"><div class="spinner"></div><p>Se încarcă…</p></div>';
      return;
    }

    if (!st.configured) {
      root.innerHTML = AA.ui._renderSetup();
      AA.ui._bindSetup();
      return;
    }

    if (!st.user) {
      root.innerHTML = AA.ui._renderAuth();
      AA.ui._bindAuth();
      return;
    }

    if (!st.familyId) {
      root.innerHTML = AA.ui._renderOnboard();
      AA.ui._bindOnboard();
      return;
    }

    root.innerHTML =
      AA.ui._renderHeader(st) +
      '<main id="mainContent">' + AA.ui._renderView(st) + '</main>' +
      AA.ui._renderNav(st) +
      (_modal ? AA.ui._renderModal() : '');

    AA.ui._bindMain(st);
    if (_modal) AA.ui._bindModal(st);
  };

  AA.ui._renderSetup = function () {
    return '<div class="center-card">' +
      '<div class="logo">Auto<span>Alert</span></div>' +
      '<p class="muted">Configurează Firebase înainte de prima utilizare.</p>' +
      '<ol class="setup-steps">' +
      '<li>Creează proiect Firebase (Realtime Database + Google Auth)</li>' +
      '<li>Copiază <code>firebase-config.example.js</code> → <code>firebase-config.js</code></li>' +
      '<li>Completează cheile API și reîncarcă pagina</li>' +
      '</ol>' +
      '<button class="btn btn-primary" id="btnDemo">Previzualizare demo</button>' +
      '<p class="muted">Vezi cum arată app-ul cu date fictive, fără Firebase.</p>' +
      '</div>';
  };

  AA.ui._progressBar = function (pct, status) {
    if (pct == null) return '';
    const w = Math.round(pct);
    return '<div class="prog-track"><div class="prog-fill status-' + status + '" style="width:' + w + '%"></div></div>';
  };

  AA.ui._carColor = function (car) {
    if (car && car.color) return car.color;
    return '#fb923c';
  };

  AA.ui._bindUpperInput = function (id, formatter) {
    const el = document.getElementById(id);
    if (!el) return;
    el.oninput = function () {
      const pos = el.selectionStart;
      const up = formatter(el.value);
      if (el.value !== up) {
        el.value = up;
        el.setSelectionRange(pos, pos);
      }
    };
  };

  AA.ui._svcIcon = function (type, size) {
    return AA.icon ? AA.icon.render(type, size || 18, 'svc-icon') : '';
  };

  AA.ui._svcBubble = function (type, size) {
    return AA.icon && AA.icon.bubble ? AA.icon.bubble(type, size || 30) : AA.ui._svcIcon(type, 18);
  };

  AA.ui._ring = function (svc, car, d) {
    if (!AA.icon || !AA.icon.ring) return '';
    return AA.icon.ring(d.progress, d.status, AA.icon.ringLabel(svc, car));
  };

  AA.ui.hideSplash = function () {
    const s = document.getElementById('splash');
    if (!s || s.classList.contains('splash-out')) return;
    s.classList.add('splash-out');
    setTimeout(function () { s.remove(); }, 500);
  };

  AA.ui.animateDone = function (sid) {
    const el = document.querySelector('[data-svc="' + (global.CSS && CSS.escape ? CSS.escape(sid) : sid) + '"]');
    if (!el) return;
    el.classList.add('svc-done-flash');
    const burst = document.createElement('div');
    burst.className = 'done-burst';
    burst.innerHTML = AA.icon ? AA.icon.render('check', 32, 'done-check') : '✓';
    el.appendChild(burst);
    for (let i = 0; i < 10; i++) {
      const p = document.createElement('span');
      p.className = 'confetti';
      p.style.setProperty('--x', (Math.random() * 80 - 40) + 'px');
      p.style.setProperty('--r', Math.random() * 360 + 'deg');
      p.style.background = ['#f97316', '#22c55e', '#3b82f6', '#eab308'][i % 4];
      el.appendChild(p);
    }
    if (AA.notif) {
      AA.notif.vibrateAlert(false);
      AA.notif.playAlertSound(false);
    }
    setTimeout(function () {
      el.classList.remove('svc-done-flash');
      burst.remove();
      el.querySelectorAll('.confetti').forEach(function (c) { c.remove(); });
    }, 1400);
  };

  AA.ui._renderAuth = function () {
    const cfg = global.AA_FIREBASE_CONFIG || {};
    const wrongProject = cfg.projectId === 'datorietrack';
    return '<div class="center-card auth-card">' +
      '<div class="auth-mark">' + AA.ui._plate('AUTO ALERT', 'lg') + '</div>' +
      '<p class="muted">Termenele mașinilor din familie — ITP, RCA, rovinietă, ulei — într-un singur loc, cu alertă pe telefon înainte să expire.</p>' +
      (wrongProject
        ? '<div class="auth-warn">Proiectul <b>datorietrack</b> e pentru DatorieTrack, nu suportă login Google pentru AutoAlert. Deschide <a href="./setup-firebase.html" target="_blank">setup-firebase.html</a> și creează proiect <b>autoalert</b>.</div>'
        : '') +
      '<button class="btn btn-primary" id="btnGoogle">Continuă cu Google</button>' +
      '<button class="btn btn-ghost" id="btnDemoAuth">Vezi cu date de probă</button>' +
      '<p class="ver">v' + AA.APP_VERSION + '</p>' +
      '</div>';
  };

  AA.ui._renderOnboard = function () {
    return '<div class="center-card">' +
      '<div class="auth-mark">' + AA.ui._plate('AUTO ALERT', 'lg') + '</div>' +
      '<p class="muted">Creează familia ta sau intră în una existentă cu codul primit.</p>' +
      '<div class="tabs-onboard">' +
      '<button class="tab-btn active" data-tab="create">Creează familie</button>' +
      '<button class="tab-btn" data-tab="join">Am un cod</button>' +
      '</div>' +
      '<div id="panelCreate">' +
      '<input class="input" id="familyName" placeholder="Nume familie (ex. Familia Popescu)" maxlength="80">' +
      '<button class="btn btn-primary" id="btnCreateFamily">Creează familia</button>' +
      '</div>' +
      '<div id="panelJoin" class="hidden">' +
      '<input class="input mono" id="inviteCode" placeholder="Codul de 6 caractere" maxlength="6" style="text-transform:uppercase">' +
      '<button class="btn btn-primary" id="btnJoinFamily">Intră în familie</button>' +
      '</div>' +
      '<button class="btn btn-ghost" id="btnLogout">Deconectare</button>' +
      '</div>';
  };

  AA.ui._renderHeader = function (st) {
    const name = st.user ? st.user.displayName : '';
    return '<header class="app-header">' +
      '<div class="wordmark">' + AA.ui._lampIcon(24) + 'AutoAlert</div>' +
      '<div class="header-actions">' +
      '<button class="icon-btn" id="btnSettings" title="Setări" aria-label="Setări">' + AA.ui._gearIcon() + '</button>' +
      (AA.icon ? AA.icon.avatar(name, 32) : '') +
      '</div></header>' +
      (st.demo ? '<div class="strip strip-demo"><span>Date de probă — nimic nu se salvează</span><button class="link-btn" id="btnExitDemo">Ieși</button></div>' : '') +
      (st.offline ? '<div class="strip strip-offline">Fără internet — vezi ultimele date salvate</div>' : '');
  };

  AA.ui._renderNav = function (st) {
    const alertCars = AA.ui._countAlertCars(st.cars);
    const fleetWorst = AA.ui._worstFleetStatus(st.cars);
    const active = _view === 'car-detail' ? 'cars' : _view;
    const items = [
      { id: 'dashboard', label: 'Acasă', icon: 'home' },
      { id: 'cars', label: 'Mașini', icon: 'car' },
      { id: 'family', label: 'Familie', icon: 'family' }
    ];
    return '<nav class="bottom-nav"><div class="bottom-nav-inner">' + items.map(function (it) {
      const badge = (it.id === 'cars' && alertCars)
        ? '<span class="nav-badge st-' + fleetWorst + '">' + alertCars + '</span>'
        : '';
      return '<button class="nav-btn' + (active === it.id ? ' active' : '') + '" data-nav="' + it.id + '"' +
        (active === it.id ? ' aria-current="page"' : '') + '>' +
        '<span class="nav-icon">' + AA.ui._svcIcon(it.icon, 24) + badge + '</span>' + it.label + '</button>';
    }).join('') + '</div></nav>';
  };

  AA.ui._renderView = function (st) {
    if (_view === 'settings') return AA.ui._renderSettings(st);
    if (_view === 'cars') return AA.ui._renderCars(st);
    if (_view === 'car-detail') return AA.ui._renderCarDetail(st);
    if (_view === 'family') return AA.ui._renderFamily(st);
    return AA.ui._renderDashboard(st);
  };

  AA.ui._renderDashboard = function (st) {
    const agenda = AA.ui._agenda(st.cars);
    const carIds = Object.keys(st.cars || {}).sort(function (a, b) {
      return AA.STATUS_RANK[AA.getCarWorstStatus(st.cars[a])] - AA.STATUS_RANK[AA.getCarWorstStatus(st.cars[b])];
    });
    const top = agenda.find(function (it) { return it.info.status !== 'ok'; });
    const rest = agenda.filter(function (it) { return it !== top; });
    const now = rest.filter(function (it) { return it.info.status === 'expired' || it.info.status === 'urgent'; });
    const soon = rest.filter(function (it) { return it.info.status === 'warning'; });
    const later = rest.filter(function (it) { return it.info.status === 'ok'; });

    let main = AA.ui._dashHero(st, agenda);
    if (now.length) {
      main += '<h2 class="sec">De rezolvat <small>' + now.length + '</small></h2>' +
        '<div class="rows">' + now.map(AA.ui._agendaRow).join('') + '</div>';
    }
    if (soon.length) {
      main += '<h2 class="sec">În curând <small>' + soon.length + '</small></h2>' +
        '<div class="rows">' + soon.map(AA.ui._agendaRow).join('') + '</div>';
    }
    if (later.length) {
      const hidden = !!top && _okCollapsed;
      main += '<button type="button" class="sec sec-toggle" id="toggleOkCars" aria-expanded="' + (!hidden) + '">' +
        '<span>Mai târziu <small>' + later.length + '</small></span>' +
        '<small>' + (hidden ? 'Arată ▾' : 'Ascunde ▴') + '</small></button>' +
        (hidden ? '' : '<div class="rows">' + later.map(AA.ui._agendaRow).join('') + '</div>');
    }

    if (!carIds.length) return main;
    const side = '<h2 class="sec">Mașinile <small>' + carIds.length + '</small></h2>' +
      '<div class="rows">' + carIds.map(function (id) { return AA.ui._carRow(st.cars[id], id); }).join('') + '</div>' +
      '<button class="add-row" id="fabAddCar">+ Adaugă mașină</button>';
    return '<div class="dash-grid"><div class="dash-main">' + main + '</div>' +
      '<aside class="dash-side">' + side + '</aside></div>';
  };

  AA.ui._renderCars = function (st) {
    const ids = Object.keys(st.cars || {}).sort(function (a, b) {
      return AA.STATUS_RANK[AA.getCarWorstStatus(st.cars[a])] - AA.STATUS_RANK[AA.getCarWorstStatus(st.cars[b])];
    });
    if (!ids.length) {
      return '<div class="narrow"><h2 class="sec">Mașini</h2><div class="empty"><strong>Nicio mașină încă</strong>' +
        'Adaugă mașina cu numărul și kilometrii de acum.' +
        '<button class="btn btn-primary" id="fabAddCar">Adaugă mașină</button></div></div>';
    }
    return '<div class="narrow"><h2 class="sec">Mașini <small>' + ids.length + '</small></h2>' +
      '<div class="rows">' + ids.map(function (id) { return AA.ui._carRow(st.cars[id], id); }).join('') + '</div>' +
      '<button class="add-row" id="fabAddCar">+ Adaugă mașină</button></div>';
  };

  AA.ui._renderCarDetail = function (st) {
    const car = st.cars[_selectedCarId];
    if (!car) {
      return '<div class="narrow"><div class="topbar"><button class="back-btn" data-back>‹ Înapoi</button></div>' +
        '<div class="empty"><strong>Mașina nu mai există</strong>Poate a șters-o cineva din familie.</div></div>';
    }

    const services = AA.ui._sortServiceIds(car).map(function (sid) {
      const svc = car.services[sid];
      const i = AA.ui._svcInfo(svc, car);
      const extras = [];
      if (i.other) extras.push('<span class="chip">și ' + AA.escapeHtml(i.other) + '</span>');
      if (svc.reminderAt && AA.isReminderActive(svc.reminderAt)) {
        extras.push('<span class="chip" title="Reminder personalizat">⏰ ' + AA.escapeHtml(AA.formatReminderDisplay(svc.reminderAt)) + '</span>');
      }
      if (svc.intervalDays > 0 || svc.intervalMonths > 0) {
        extras.push('<span class="chip">se reînnoiește la ' + AA.escapeHtml(AA.carnet.validityLabel(AA.carnet.validityOf(svc, car))) + '</span>');
      }
      if (svc.notes) extras.push('<span class="chip">' + AA.escapeHtml(svc.notes) + '</span>');
      const gauge = i.pct == null ? '' :
        '<div class="gauge" aria-hidden="true"><i style="width:' + Math.max(2, Math.round(i.pct)) + '%"></i></div>';
      return '<div class="svc st-' + i.status + '" data-svc="' + AA.escapeHtml(sid) + '">' +
        '<div class="svc-head">' + AA.ui._svcIcon(svc.type, 22) +
        '<div class="svc-name">' + AA.escapeHtml(i.label) + '</div>' +
        (i.status !== 'ok' ? '<span class="lamp">' + AA.STATUS_LABELS[i.status] + '</span>' : '') +
        '</div>' +
        '<div class="svc-read"><b>' + AA.escapeHtml(i.text) + '</b><span>' + AA.escapeHtml(i.sub) + '</span></div>' +
        gauge +
        (extras.length ? '<div class="svc-extra">' + extras.join('') + '</div>' : '') +
        '<div class="svc-actions">' +
        '<button class="btn btn-sm btn-done" data-done="' + AA.escapeHtml(sid) + '">' + AA.ui._svcIcon('check', 16) + ' Făcut</button>' +
        '<button class="btn btn-sm" data-edit-svc="' + AA.escapeHtml(sid) + '">Editează</button>' +
        '<button class="btn btn-sm btn-trash" data-del-svc="' + AA.escapeHtml(sid) + '" title="Șterge termenul" aria-label="Șterge ' + AA.escapeHtml(i.label) + '">' + AA.ui._trashIcon() + '</button>' +
        '</div></div>';
    }).join('');

    const tireIds = Object.keys(car.tires || {}).sort(function (a, b) {
      const ta = car.tires[a], tb = car.tires[b];
      if (!!tb.mounted !== !!ta.mounted) return tb.mounted ? 1 : -1;
      return String(ta.season).localeCompare(String(tb.season));
    });
    const tires = tireIds.map(function (tid) {
      const t = car.tires[tid];
      const s = AA.carnet.tireStatus(t);
      const season = AA.TIRE_SEASONS[t.season] || AA.TIRE_SEASONS.vara;
      const name = [season.short, t.brand, t.size].filter(Boolean).join(' · ');
      const extras = [];
      if (t.mounted) extras.push('<span class="chip chip-on">montat acum</span>');
      if (t.location) extras.push('<span class="chip">stă: ' + AA.escapeHtml(t.location) + '</span>');
      if (t.notes) extras.push('<span class="chip">' + AA.escapeHtml(t.notes) + '</span>');
      return '<div class="svc st-' + s.status + '" data-tire="' + AA.escapeHtml(tid) + '">' +
        '<div class="svc-head">' + AA.ui._svcIcon(AA.ui._tireIcon(t.season), 22) +
        '<div class="svc-name">' + AA.escapeHtml(name) + '</div>' +
        (s.status !== 'ok' ? '<span class="lamp">' + AA.STATUS_LABELS[s.status] + '</span>' : '') +
        '</div>' +
        '<div class="svc-read"><b>' + AA.escapeHtml(s.text) + '</b><span>' + AA.escapeHtml(s.hint) + '</span></div>' +
        (extras.length ? '<div class="svc-extra">' + extras.join('') + '</div>' : '') +
        '<div class="svc-actions">' +
        (t.mounted ? '' : '<button class="btn btn-sm btn-done" data-mount="' + AA.escapeHtml(tid) + '">' + AA.ui._svcIcon('check', 16) + ' Am montat</button>') +
        '<button class="btn btn-sm" data-edit-tire="' + AA.escapeHtml(tid) + '">Editează</button>' +
        '<button class="btn btn-sm btn-trash" data-del-tire="' + AA.escapeHtml(tid) + '" title="Șterge setul" aria-label="Șterge setul ' + AA.escapeHtml(name) + '">' + AA.ui._trashIcon() + '</button>' +
        '</div></div>';
    }).join('');

    // Carnetul întreg, pe ani, cel mai nou sus. Fiecare rând se deschide pentru corectare.
    const hist = car.history || {};
    const hids = Object.keys(hist).sort(function (a, b) {
      const da = String(hist[a].doneDate || ''), db = String(hist[b].doneDate || '');
      if (da !== db) return db.localeCompare(da);
      return (hist[b].createdAt || 0) - (hist[a].createdAt || 0);
    });
    let lastYear = null;
    let history = '';
    hids.forEach(function (hid) {
      const h = hist[hid];
      const y = String(h.doneDate || '').slice(0, 4) || '—';
      if (y !== lastYear) {
        let tot = 0;
        hids.forEach(function (k) { if (String(hist[k].doneDate || '').slice(0, 4) === y) tot += Number(hist[k].cost) || 0; });
        history += '<div class="hist-year"><span>' + AA.escapeHtml(y) + '</span><span>' + (tot ? AA.ui._lei(tot) : '') + '</span></div>';
        lastYear = y;
      }
      const right = [];
      if (h.doneKm) right.push(AA.formatKm(h.doneKm));
      if (h.cost) right.push(AA.ui._lei(h.cost));
      const smalls = [];
      if (h.shop) smalls.push(h.shop);
      if (h.notes) smalls.push(h.notes);
      history += '<button type="button" class="hist hist-btn" data-hist="' + AA.escapeHtml(hid) + '">' +
        '<time>' + AA.formatDate(h.doneDate) + '</time>' +
        '<span class="hist-what">' + AA.escapeHtml(AA.carnet.historyLabel(h)) +
        (smalls.length ? '<small>' + AA.escapeHtml(smalls.join(' · ')) + '</small>' : '') + '</span>' +
        '<span>' + right.join('<br>') + '</span></button>';
    });

    const cs = AA.carnet.costSummary(car);
    const yNow = Number(AA.todayStr().slice(0, 4));
    const costs = cs.total > 0 ?
      '<div class="costs">' +
      '<div><b>' + AA.ui._lei(cs.thisYear) + '</b><span>cheltuit în ' + yNow + '</span></div>' +
      (cs.lastYear ? '<div><b>' + AA.ui._lei(cs.lastYear) + '</b><span>în ' + (yNow - 1) + '</span></div>' : '') +
      (cs.per100km != null ? '<div><b>' + AA.ui._lei(cs.per100km) + '</b><span>la 100 km, din ' + AA.formatKm(cs.kmSpan) + '</span></div>' : '') +
      '</div>' +
      '<p class="cost-cats">De la început: acte și taxe ' + AA.ui._lei(cs.byCat.documente) +
      ', întreținere ' + AA.ui._lei(cs.byCat.intretinere) + ', anvelope ' + AA.ui._lei(cs.byCat.anvelope) + '</p>'
      : '';

    return '<div class="narrow">' +
      '<div class="topbar">' +
      '<button class="back-btn" data-back>‹ Înapoi</button>' +
      '<button class="btn btn-sm btn-ghost" id="btnEditCar">Editează mașina</button>' +
      '</div>' +
      '<div class="car-id">' + AA.ui._plate(car.plate, 'lg') +
      '<div class="car-id-sub">' + AA.ui._carName(car, true) + '</div></div>' +
      '<div class="odo">' +
      '<div><label for="kmInput">Kilometri la bord</label>' +
      '<div class="odo-field"><input class="mono" id="kmInput" type="number" inputmode="numeric" min="0" max="999999" value="' + (car.currentKm || 0) + '">' +
      '<span class="odo-unit">km</span></div></div>' +
      '<button class="btn btn-sm btn-primary" id="btnSaveKm">Salvează km</button>' +
      '</div>' +
      '<h2 class="sec">Termene <button class="btn btn-sm" id="btnAddService">+ Adaugă</button></h2>' +
      (services ? '<div class="rows">' + services + '</div>' :
        '<div class="empty"><strong>Niciun termen</strong>Adaugă ITP, RCA, rovinieta sau schimbul de ulei.</div>') +
      '<h2 class="sec">Anvelope <button class="btn btn-sm" id="btnAddTire">+ Set</button></h2>' +
      (tires ? '<div class="rows">' + tires + '</div>' :
        '<p class="note">Notează seturile de vară și de iarnă. Din DOT aflăm vârsta, din profil cât mai țin.</p>') +
      '<h2 class="sec">Carnet de service <button class="btn btn-sm" id="btnAddIntervention">+ Intervenție</button></h2>' +
      costs +
      (history ? '<div class="rows">' + history + '</div>' :
        '<p class="note">Nimic notat încă. După service apasă „+ Intervenție” și bifează ce s-a schimbat.</p>') +
      '<div class="danger-zone"><button class="btn btn-danger-text" id="btnDelCar">Șterge mașina</button></div>' +
      '</div>';
  };

  AA.ui._renderFamily = function (st) {
    const isOwner = st.family && st.user && st.family.ownerUid === st.user.uid;
    const ids = Object.keys(st.members || {});
    const members = ids.map(function (uid) {
      const m = st.members[uid];
      return '<div class="member-row">' +
        (AA.icon ? AA.icon.avatar(m.displayName || uid, 36) : '') +
        '<span class="member-name">' + AA.escapeHtml(m.displayName || uid) + '</span>' +
        '<span class="role">' + (m.role === 'owner' ? 'Administrator' : 'Membru') + '</span>' +
        (isOwner && uid !== st.user.uid ?
          '<button class="btn btn-sm btn-danger" data-rm="' + AA.escapeHtml(uid) + '">Elimină</button>' : '') +
        '</div>';
    }).join('');

    return '<div class="narrow">' +
      '<h2 class="sec">' + AA.escapeHtml(st.family ? st.family.name : 'Familie') + '</h2>' +
      '<div class="ticket">' +
      '<p>Codul de invitație</p>' +
      '<div class="invite-code mono">' + AA.escapeHtml(st.family ? st.family.inviteCode : '') + '</div>' +
      '<div class="ticket-actions">' +
      '<button class="btn btn-sm" id="btnCopyCode">Copiază codul</button>' +
      (isOwner ? '<button class="btn btn-sm btn-ghost" id="btnRegenCode">Cod nou</button>' : '') +
      '</div>' +
      '<p style="margin-top:14px;font-size:14px">Cine intră cu codul vede aceleași mașini și primește aceleași alerte.</p>' +
      '</div>' +
      '<h2 class="sec">Membri <small>' + ids.length + '</small></h2>' +
      '<div class="rows">' + members + '</div>' +
      '<div class="danger-zone"><button class="btn btn-danger-text" id="btnLeaveFamily">' +
      (isOwner ? 'Șterge familia' : 'Părăsește familia') + '</button></div>' +
      '</div>';
  };

  AA.ui._renderSettings = function (st) {
    const enabled = AA.notif.isEnabled();
    const evening = AA.notif.isEveningEnabled();
    const live = AA.notif.isLiveEnabled();
    const haptic = AA.notif.isHapticEnabled();
    const sound = AA.notif.isSoundEnabled();
    const pushOn = AA.push && AA.push.isOn();
    const pushOk = AA.push && AA.push.supported();
    const row = function (id, on, title, hint) {
      return '<label class="set-row"><span>' + title + (hint ? '<small>' + hint + '</small>' : '') + '</span>' +
        '<input type="checkbox" id="' + id + '" ' + (on ? 'checked' : '') + '></label>';
    };
    return '<div class="narrow">' +
      '<div class="topbar"><button class="back-btn" data-back>‹ Acasă</button></div>' +
      '<h2 class="sec">Alerte pe telefon</h2>' +
      '<label class="set-row set-row-main"><span><b>Primește alerte pe telefon</b>' +
      '<small>' + (pushOk
        ? 'Dimineața, după ora 8, primești ce expiră, plus reminderele tale. Merge și cu aplicația închisă.'
        : 'Browserul ăsta nu primește notificări. Pe Android deschide aplicația în Chrome și pune-o pe ecranul principal.') +
      '</small></span>' +
      '<input type="checkbox" id="chkPush" ' + (pushOn ? 'checked' : '') + (pushOk ? '' : ' disabled') + '></label>' +
      '<div class="set-actions"><button class="btn btn-sm" id="btnTestPush"' + (pushOn ? '' : ' disabled') + '>Trimite o alertă de probă</button></div>' +
      '<h2 class="sec">Cât timp aplicația e deschisă</h2>' +
      row('chkMorning', enabled, 'Rezumat dimineața', 'între 7 și 10') +
      row('chkEvening', evening, 'Rezumat seara', 'între 18 și 20') +
      row('chkLive', live, 'Alerte în timpul zilei', 'luni–vineri, 8–18, la 30 de minute') +
      row('chkHaptic', haptic, 'Vibrație la termene expirate', '') +
      row('chkSound', sound, 'Sunet la termene expirate', '') +
      '<h2 class="sec">Export</h2>' +
      '<div class="set-actions">' +
      '<button class="btn" id="btnExportPdf">Raport PDF</button>' +
      '<button class="btn btn-ghost" id="btnExport">Copie JSON</button>' +
      '</div>' +
      '<h2 class="sec">Cont</h2>' +
      '<button class="btn btn-ghost" id="btnLogout">Deconectare</button>' +
      '<p class="ver">AutoAlert v' + AA.APP_VERSION + '</p>' +
      '</div>';
  };

  AA.ui._renderModal = function () {
    const m = _modal;
    if (m.type === 'car') {
      const c = m.data || {};
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal">' +
        '<h3>' + (m.edit ? 'Editează mașina' : 'Mașină nouă') + '</h3>' +
        '<input class="input mono input-plate" id="mPlate" placeholder="B 123 ABC" autocapitalize="characters" value="' + AA.escapeHtml(AA.formatPlate(c.plate || '')) + '">' +
        '<input class="input input-upper" id="mBrand" placeholder="Marcă" autocapitalize="characters" value="' + AA.escapeHtml(AA.formatCarField(c.brand || '')) + '">' +
        '<input class="input input-upper" id="mModel" placeholder="Model" autocapitalize="characters" value="' + AA.escapeHtml(AA.formatCarField(c.model || '')) + '">' +
        '<input class="input" id="mYear" type="number" placeholder="An" value="' + (c.year || new Date().getFullYear()) + '">' +
        '<input class="input mono" id="mKm" type="number" placeholder="Km curent" value="' + (c.currentKm || 0) + '">' +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" id="modalCancel">Anulează</button>' +
        '<button class="btn btn-primary" id="modalSave">Salvează</button></div></div></div>';
    }
    if (m.type === 'service') {
      const types = Object.keys(AA.SERVICE_TYPES).map(function (k) {
        const t = AA.SERVICE_TYPES[k];
        return '<option value="' + k + '"' + (m.data && m.data.type === k ? ' selected' : '') + '>' + t.label + '</option>';
      }).join('');
      const s = m.data || {};
      const typeKey = s.type || 'itp';
      const meta = AA.SERVICE_TYPES[typeKey] || { mode: 'date' };
      const mode = s.mode || meta.mode || 'date';
      const showDate = mode === 'date' || mode === 'both';
      const showKm = mode === 'mileage' || mode === 'both';
      const title = m.edit ? ('Editează: ' + (meta.label || typeKey)) : 'Serviciu nou';
      const rem = AA.splitReminderAt(s.reminderAt);
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal modal-lg">' +
        '<h3>' + AA.escapeHtml(title) + '</h3>' +
        (m.edit ? '<p class="muted modal-hint">Tip: <b>' + AA.escapeHtml(meta.label || typeKey) + '</b></p>' :
          '<select class="input" id="mSvcType">' + types + '</select>') +
        (showDate ? (
          '<div class="modal-section">Termen (dată)</div>' +
          '<label class="lbl">Ultima dată</label><input class="input" id="mLastDate" type="date" value="' + (s.lastDate || AA.todayStr()) + '">' +
          '<label class="lbl">Următoarea dată</label><input class="input" id="mNextDate" type="date" value="' + (s.nextDate || '') + '">'
        ) : '') +
        (showDate && !meta.suggestMonth ? AA.ui._validSelect('mValid', typeKey, AA.carnet.validityOf(s, AA.ui._selCar())) : '') +
        (showKm ? (
          '<div class="modal-section">Termen (km)</div>' +
          '<label class="lbl">Ultimul km</label><input class="input mono" id="mLastKm" type="number" min="0" value="' + (s.lastKm != null ? s.lastKm : 0) + '">' +
          '<label class="lbl">Interval km</label><input class="input mono" id="mIntervalKm" type="number" min="0" value="' + (s.intervalKm != null ? s.intervalKm : (meta.defaultIntervalKm || '')) + '">' +
          '<label class="lbl">Alertă km înainte</label><input class="input mono" id="mWarnKm" type="number" min="0" value="' + (s.warnKmBefore != null ? s.warnKmBefore : (meta.warnKmBefore || '')) + '">'
        ) : '') +
        '<div class="modal-section">Reminder personalizat</div>' +
        '<p class="muted modal-hint">Notificare la data și ora alese (în plus față de alertele automate).</p>' +
        '<label class="lbl">Data reminder</label><input class="input" id="mRemDate" type="date" value="' + rem.date + '">' +
        '<label class="lbl">Ora reminder</label><input class="input" id="mRemTime" type="time" value="' + rem.time + '">' +
        '<label class="lbl">Mesaj (opțional)</label><input class="input" id="mRemNote" placeholder="ex. Programează la service" value="' + AA.escapeHtml(s.reminderNote || '') + '">' +
        (s.reminderAt ? '<button type="button" class="btn btn-sm btn-ghost" id="mRemClear">Șterge reminder</button>' : '') +
        '<label class="lbl">Note serviciu</label><input class="input" id="mNotes" value="' + AA.escapeHtml(s.notes || '') + '">' +
        '<div class="modal-actions">' +
        (m.edit && m.sid ? '<button class="btn btn-danger" id="modalDelete">Șterge</button>' : '') +
        '<button class="btn btn-ghost" id="modalCancel">Anulează</button>' +
        '<button class="btn btn-primary" id="modalSave">Salvează</button></div></div></div>';
    }
    if (m.type === 'mark-done') {
      const s = m.data || {};
      const meta = AA.SERVICE_TYPES[s.type] || { label: s.type };
      const car = AA.ui._selCar();
      const today = AA.todayStr();
      const mode = s.mode || meta.mode || 'date';
      const hasDate = mode === 'date' || mode === 'both';
      const valid = AA.carnet.validityOf(s, car);
      const next = hasDate ? (AA.carnet.nextDueDate(s, today, car, valid) || '') : '';
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal">' +
        '<h3>Marchează făcut: ' + AA.escapeHtml(meta.label) + '</h3>' +
        '<div class="grid2">' +
        '<div><label class="lbl" for="mDoneDate">Data</label><input class="input" id="mDoneDate" type="date" value="' + today + '"></div>' +
        '<div><label class="lbl" for="mDoneKm">Km la intervenție</label><input class="input mono" id="mDoneKm" type="number" inputmode="numeric" value="' + (car ? car.currentKm : 0) + '"></div>' +
        '</div>' +
        (valid ? AA.ui._validSelect('mDoneValid', s.type, valid) : '') +
        (hasDate ? '<label class="lbl" for="mDoneNext">Următorul termen</label><input class="input" id="mDoneNext" type="date" value="' + next + '">' : '') +
        '<label class="lbl" for="mDoneCost">Cost (lei, opțional)</label><input class="input mono" id="mDoneCost" type="number" inputmode="decimal" min="0" placeholder="0">' +
        '<label class="lbl" for="mDoneNotes">Notă (opțional)</label><input class="input" id="mDoneNotes" maxlength="500" placeholder="ex. asigurător, atelier, ce ulei">' +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" id="modalCancel">Anulează</button>' +
        '<button class="btn btn-primary" id="modalSave">Confirmă</button></div></div></div>';
    }
    if (m.type === 'intervention') {
      const h = m.data || {};
      const car = AA.ui._selCar();
      const isNew = !m.hid;
      const isInterv = isNew || h.type === 'interventie';
      const ops = h.ops || {};
      const groups = isInterv ? AA.OPERATIONS.map(function (g) {
        return '<fieldset class="ops"><legend>' + AA.escapeHtml(g.group) + '</legend><div class="ops-grid">' +
          g.items.map(function (it) {
            return '<label class="op"><input type="checkbox" data-op="' + it[0] + '"' + (ops[it[0]] ? ' checked' : '') + '><span>' + AA.escapeHtml(it[1]) + '</span></label>';
          }).join('') + '</div></fieldset>';
      }).join('') : '';
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal modal-lg">' +
        '<h3>' + (isNew ? 'Intervenție nouă' : AA.escapeHtml(isInterv ? 'Intervenție' : AA.carnet.historyLabel(h))) + '</h3>' +
        (isNew ? '' : '<p class="muted modal-hint">Corectezi doar ce scrie în carnet. Termenele rămân cum sunt.</p>') +
        '<div class="grid2">' +
        '<div><label class="lbl" for="mIvDate">Data</label><input class="input" id="mIvDate" type="date" value="' + AA.escapeHtml(h.doneDate || AA.todayStr()) + '"></div>' +
        '<div><label class="lbl" for="mIvKm">Km</label><input class="input mono" id="mIvKm" type="number" inputmode="numeric" min="0" value="' + (h.doneKm != null ? h.doneKm : (isNew && car ? car.currentKm : '')) + '"></div>' +
        '</div>' +
        '<div class="grid2">' +
        '<div><label class="lbl" for="mIvCost">Cost (lei)</label><input class="input mono" id="mIvCost" type="number" inputmode="decimal" min="0" placeholder="0" value="' + (h.cost ? h.cost : '') + '"></div>' +
        (isInterv ? '<div><label class="lbl" for="mIvShop">Atelier</label><input class="input" id="mIvShop" maxlength="80" placeholder="unde ai fost" value="' + AA.escapeHtml(h.shop || '') + '"></div>' : '<div></div>') +
        '</div>' +
        (isInterv ? '<div class="modal-section">Ce s-a făcut</div>' + groups +
          '<label class="lbl" for="mIvOther">Altceva</label><input class="input" id="mIvOther" maxlength="200" placeholder="ex. reparat climă, schimbat oglindă" value="' + AA.escapeHtml(h.other || '') + '">' +
          (isNew ? '<p class="modal-hint resets" id="ivResets" aria-live="polite"></p>' : '') : '') +
        '<label class="lbl" for="mIvNotes">Notă</label><input class="input" id="mIvNotes" maxlength="500" placeholder="ex. ce ulei, următoarea vizită" value="' + AA.escapeHtml(h.notes || '') + '">' +
        '<div class="modal-actions">' +
        (isNew ? '' : '<button class="btn btn-danger" id="modalDelete">Șterge</button>') +
        '<button class="btn btn-ghost" id="modalCancel">Anulează</button>' +
        '<button class="btn btn-primary" id="modalSave">Salvează</button></div></div></div>';
    }
    if (m.type === 'tire') {
      const t = m.data || {};
      const seasons = Object.keys(AA.TIRE_SEASONS).map(function (k) {
        return '<option value="' + k + '"' + ((t.season || 'vara') === k ? ' selected' : '') + '>' + AA.TIRE_SEASONS[k].short + '</option>';
      }).join('');
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal">' +
        '<h3>' + (m.tid ? 'Setul de anvelope' : 'Set nou de anvelope') + '</h3>' +
        '<label class="lbl" for="mTSeason">Sezon</label><select class="input" id="mTSeason">' + seasons + '</select>' +
        '<div class="grid2">' +
        '<div><label class="lbl" for="mTBrand">Marcă</label><input class="input input-upper" id="mTBrand" maxlength="60" autocapitalize="characters" placeholder="ex. MICHELIN" value="' + AA.escapeHtml(t.brand || '') + '"></div>' +
        '<div><label class="lbl" for="mTSize">Dimensiune</label><input class="input mono input-upper" id="mTSize" maxlength="30" placeholder="205/55 R16" value="' + AA.escapeHtml(t.size || '') + '"></div>' +
        '</div>' +
        '<div class="grid2">' +
        '<div><label class="lbl" for="mTDot">DOT</label><input class="input mono" id="mTDot" inputmode="numeric" maxlength="4" placeholder="ex. 2318" value="' + AA.escapeHtml(t.dot || '') + '"></div>' +
        '<div><label class="lbl" for="mTMm">Profil (mm)</label><input class="input mono" id="mTMm" inputmode="decimal" placeholder="ex. 6,5" value="' + (t.treadMm != null ? AA.fmt1(t.treadMm) : '') + '"></div>' +
        '</div>' +
        '<p class="muted modal-hint">DOT: ultimele 4 cifre de pe flanc, săptămâna și anul (2318 = săptămâna 23 din 2018).</p>' +
        '<label class="lbl" for="mTLoc">Unde stau</label><input class="input" id="mTLoc" maxlength="80" placeholder="pe mașină, acasă, hotel anvelope" value="' + AA.escapeHtml(t.location || '') + '">' +
        '<label class="chk-row"><input type="checkbox" id="mTMounted"' + (t.mounted ? ' checked' : '') + '> Sunt montate acum</label>' +
        '<label class="lbl" for="mTNotes">Notă</label><input class="input" id="mTNotes" maxlength="200" value="' + AA.escapeHtml(t.notes || '') + '">' +
        '<div class="modal-actions">' +
        (m.tid ? '<button class="btn btn-danger" id="modalDelete">Șterge</button>' : '') +
        '<button class="btn btn-ghost" id="modalCancel">Anulează</button>' +
        '<button class="btn btn-primary" id="modalSave">Salvează</button></div></div></div>';
    }
    if (m.type === 'mount-tire') {
      const t = m.data || {};
      const car = AA.ui._selCar();
      const season = AA.TIRE_SEASONS[t.season] || AA.TIRE_SEASONS.vara;
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal">' +
        '<h3>Am montat: ' + AA.escapeHtml([season.short, t.brand].filter(Boolean).join(' ')) + '</h3>' +
        '<p class="muted modal-hint">Celelalte seturi trec la „demontate”, iar termenul de schimb al sezonului se bifează.</p>' +
        '<div class="grid2">' +
        '<div><label class="lbl" for="mMtDate">Data</label><input class="input" id="mMtDate" type="date" value="' + AA.todayStr() + '"></div>' +
        '<div><label class="lbl" for="mMtKm">Km</label><input class="input mono" id="mMtKm" type="number" inputmode="numeric" value="' + (car ? car.currentKm : 0) + '"></div>' +
        '</div>' +
        '<label class="lbl" for="mMtCost">Cost (lei, opțional)</label><input class="input mono" id="mMtCost" type="number" inputmode="decimal" min="0" placeholder="0">' +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" id="modalCancel">Anulează</button>' +
        '<button class="btn btn-primary" id="modalSave">Confirmă</button></div></div></div>';
    }
    if (m.type === 'pick-service') {
      const gst = AA.ui.getState();
      const pickCar = _selectedCarId && gst.cars ? gst.cars[_selectedCarId] : null;
      const existing = {};
      if (pickCar && pickCar.services) {
        Object.keys(pickCar.services).forEach(function (sid) {
          existing[pickCar.services[sid].type] = true;
        });
      }
      const btn = function (k) {
        const t = AA.SERVICE_TYPES[k];
        const has = existing[k];
        return '<button type="button" class="pick-btn' + (has ? ' pick-btn-has' : '') + '" data-svc-type="' + k + '">' +
          AA.ui._svcIcon(k, 22) + '<span>' + t.label + (has ? ' <em class="pick-tag">deja adăugat</em>' : '') + '</span></button>';
      };
      const groups = AA.ui.PICK_GROUPS.map(function (g, gi) {
        const keys = g[1].filter(function (k) { return AA.SERVICE_TYPES[k]; });
        if (gi === AA.ui.PICK_GROUPS.length - 1) {
          Object.keys(AA.SERVICE_TYPES).forEach(function (k) {
            if (!AA.ui.PICK_GROUPS.some(function (x) { return x[1].indexOf(k) >= 0; })) keys.push(k);
          });
        }
        return '<div class="pick-group">' + g[0] + '</div><div class="pick-grid">' + keys.map(btn).join('') + '</div>';
      }).join('');
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal modal-lg">' +
        '<h3>Ce termen adaugi?</h3><div id="pickServiceGrid">' + groups + '</div>' +
        '<button class="btn btn-ghost" id="modalCancel">Anulează</button></div></div>';
    }
    return '';
  };

  AA.ui.PICK_GROUPS = [
    ['Acte și taxe', ['itp', 'rca', 'casco', 'rovigneta', 'taxa_pod', 'impozit', 'permis']],
    ['Întreținere', ['revizie', 'ulei', 'filtre', 'distributie', 'placute', 'lichid_frana', 'antigel', 'baterie', 'ac']],
    ['Sezon și siguranță', ['roata_iarna', 'roata_vara', 'trusa', 'extinctor']]
  ];

  AA.ui._selCar = function () {
    const gst = AA.ui.getState();
    return gst.cars && _selectedCarId ? gst.cars[_selectedCarId] : null;
  };

  AA.ui._validSelect = function (id, type, current) {
    const opts = AA.carnet.validityOptions(type, current).map(function (o) {
      return '<option value="' + o.value + '"' + (o.value === current ? ' selected' : '') + '>' + AA.escapeHtml(o.label) + '</option>';
    }).join('');
    return '<label class="lbl" for="' + id + '">Valabil</label><select class="input" id="' + id + '">' + opts + '</select>';
  };

  AA.ui.openModal = function (type, data, edit, opts) {
    const wasOpen = !!_modal;
    _modal = Object.assign({ type: type, data: data || {}, edit: !!edit }, opts || {});
    if (!wasOpen) AA.ui._push(true);
    AA.ui.render();
  };

  AA.ui.closeModal = function () {
    _modal = null;
    if (history.state && history.state.modal) {
      _skipPop = true;
      history.back();
    }
    AA.ui.render();
  };

  AA.ui._bindAuth = function () {
    const btn = document.getElementById('btnGoogle');
    if (btn) btn.onclick = async function () {
      btn.disabled = true;
      try { await AA.fb.signInGoogle(); }
      catch (e) {
        var m = (AA.fb._authErrorMsg ? AA.fb._authErrorMsg(e) : null) || e.message || 'Eroare login';
        AA.showToast(m, 'error');
        btn.disabled = false;
      }
    };
    const demo = document.getElementById('btnDemoAuth');
    if (demo) demo.onclick = function () { AA.ui.startDemo(); };
  };

  AA.ui._bindOnboard = function () {
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('.tab-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        document.getElementById('panelCreate').classList.toggle('hidden', b.dataset.tab !== 'create');
        document.getElementById('panelJoin').classList.toggle('hidden', b.dataset.tab !== 'join');
      };
    });
    const create = document.getElementById('btnCreateFamily');
    if (create) create.onclick = async function () {
      try {
        const r = await AA.fb.createFamily(document.getElementById('familyName').value);
        AA.showToast('Familie creată! Cod: ' + r.inviteCode, 'success');
        AA.ui.navigate('dashboard');
      } catch (e) {
        AA.showToast((AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message), 'error');
      }
    };
    const join = document.getElementById('btnJoinFamily');
    if (join) join.onclick = async function () {
      try {
        await AA.fb.joinFamily(document.getElementById('inviteCode').value);
        AA.showToast('Bine ai venit în familie!', 'success');
        AA.ui.navigate('dashboard');
      } catch (e) {
        AA.showToast((AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message), 'error');
      }
    };
    const lo = document.getElementById('btnLogout');
    if (lo) lo.onclick = function () { AA.fb.signOut(); };
  };

  AA.ui._bindMain = function (st) {
    const exitDemo = document.getElementById('btnExitDemo');
    if (exitDemo) exitDemo.onclick = function () { AA.ui.stopDemo(); };
    AA.ui._bindCommon(st);

    if (st.demo) {
      document.querySelectorAll('[data-nav]').forEach(function (b) {
        b.onclick = function () { _modal = null; AA.ui.navigate(b.dataset.nav); };
      });
      const settings = document.getElementById('btnSettings');
      if (settings) settings.onclick = function () { AA.ui.navigate('settings'); };
      document.querySelectorAll('[data-car]').forEach(function (el) {
        el.onclick = function () { AA.ui.navigate('car-detail', { carId: el.dataset.car }); };
      });
      const fab = document.getElementById('fabAddCar');
      if (fab) fab.onclick = function () { AA.showToast('Disponibil după configurare Firebase', 'info'); };
      const toggleOkDemo = document.getElementById('toggleOkCars');
      if (toggleOkDemo) toggleOkDemo.onclick = function (e) {
        e.stopPropagation();
        _okCollapsed = !_okCollapsed;
        AA.ui.render();
      };
      if (_view === 'car-detail') AA.ui._bindCarDetailDemo(st);
      if (_view === 'family') { /* render only */ }
      if (_view === 'settings') AA.ui._bindSettingsDemo(st);
      return;
    }

    document.querySelectorAll('[data-nav]').forEach(function (b) {
      b.onclick = function () { _modal = null; AA.ui.navigate(b.dataset.nav); };
    });
    const settings = document.getElementById('btnSettings');
    if (settings) settings.onclick = function () { AA.ui.navigate('settings'); };

    document.querySelectorAll('[data-car]').forEach(function (el) {
      el.onclick = function () { AA.ui.navigate('car-detail', { carId: el.dataset.car }); };
    });

    const fab = document.getElementById('fabAddCar');
    if (fab) fab.onclick = function () { AA.ui.openModal('car'); };

    const toggleOk = document.getElementById('toggleOkCars');
    if (toggleOk) toggleOk.onclick = function (e) {
      e.stopPropagation();
      _okCollapsed = !_okCollapsed;
      AA.ui.render();
    };

    if (_view === 'car-detail') AA.ui._bindCarDetail(st);
    if (_view === 'family') AA.ui._bindFamily(st);
    if (_view === 'settings') AA.ui._bindSettings(st);
  };

  AA.ui._bindCommon = function (st) {
    // Rândurile cu role=button se deschid și din tastatură
    document.querySelectorAll('[data-car][role="button"]').forEach(function (el) {
      el.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      };
    });
    // „Făcut” direct de pe bord
    document.querySelectorAll('[data-quick-done]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        const carId = b.dataset.quickDone;
        const sid = b.dataset.sid;
        const car = st.cars && st.cars[carId];
        const svc = car && car.services ? car.services[sid] : null;
        if (!svc) return;
        if (st.demo) { AA.showToast('Mod demo — doar vizualizare', 'info'); return; }
        _selectedCarId = carId;
        AA.ui.openModal('mark-done', svc, true, { sid: sid });
      };
    });
  };

  AA.ui._bindPush = function (demo) {
    const chk = document.getElementById('chkPush');
    const test = document.getElementById('btnTestPush');
    if (chk) chk.onchange = async function () {
      if (demo) { chk.checked = false; AA.showToast('Mod demo — intră în cont ca să pornești alertele', 'info'); return; }
      chk.disabled = true;
      try {
        if (chk.checked) {
          await AA.push.enable();
          AA.showToast('Alertele pe telefon sunt pornite', 'success');
        } else {
          await AA.push.disable();
          AA.showToast('Alertele pe telefon sunt oprite', 'info');
        }
      } catch (e) {
        chk.checked = AA.push.isOn();
        AA.showToast((e && e.message) || 'Nu am putut porni alertele', 'error');
      }
      chk.disabled = false;
      if (test) test.disabled = !AA.push.isOn();
    };
    if (test) test.onclick = async function () {
      try { await AA.push.test(); }
      catch (e) { AA.showToast((e && e.message) || 'Proba nu a mers', 'error'); }
    };
  };

  // null = omul a renunțat; true = a confirmat corectarea în jos; false = km mai mari, nimic de întrebat.
  AA.ui._confirmLowerKm = function (car, val) {
    const cur = car ? Number(car.currentKm) || 0 : 0;
    const r = AA.carnet.resolveKm(cur, val, false);
    if (!r.needsConfirm) return false;
    return confirm('Scrii ' + r.km.toLocaleString('ro-RO') + ' km, mai puțin decât cei salvați (' +
      cur.toLocaleString('ro-RO') + ' km). Corectezi o greșeală?') ? true : null;
  };

  AA.ui._bindCarDetail = function (st) {
    const back = document.querySelector('[data-back]');
    if (back) back.onclick = function () { AA.ui.goBack('cars'); };

    const saveKm = document.getElementById('btnSaveKm');
    if (saveKm) saveKm.onclick = async function () {
      try {
        const val = document.getElementById('kmInput').value;
        const allow = AA.ui._confirmLowerKm(st.cars[_selectedCarId], val);
        if (allow == null) return;
        const v = await AA.cars.updateKm(_selectedCarId, val, allow);
        AA.showToast('Km actualizat: ' + v.toLocaleString('ro-RO'), 'success');
      } catch (e) { AA.showToast(e.message, 'error'); }
    };

    const addSvc = document.getElementById('btnAddService');
    if (addSvc) addSvc.onclick = function () { AA.ui.openModal('pick-service'); };

    document.querySelectorAll('[data-done]').forEach(function (b) {
      b.onclick = function () {
        const sid = b.dataset.done;
        const car = st.cars[_selectedCarId];
        const svc = car && car.services ? car.services[sid] : null;
        if (!svc) return;
        AA.ui.openModal('mark-done', svc, true, { sid: sid });
      };
    });

    document.querySelectorAll('[data-edit-svc]').forEach(function (b) {
      b.onclick = function () {
        const car = st.cars[_selectedCarId];
        AA.ui.openModal('service', car.services[b.dataset.editSvc], true, { sid: b.dataset.editSvc });
      };
    });

    document.querySelectorAll('[data-del-svc]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('Ștergi acest serviciu?')) return;
        try {
          await AA.cars.removeService(_selectedCarId, b.dataset.delSvc);
          AA.showToast('Serviciu șters', 'info');
        } catch (e) {
          AA.showToast((AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message), 'error');
        }
      };
    });

    const editCar = document.getElementById('btnEditCar');
    if (editCar) editCar.onclick = function () {
      const car = st.cars[_selectedCarId];
      AA.ui.openModal('car', car, true, { carId: _selectedCarId });
    };

    const delCar = document.getElementById('btnDelCar');
    if (delCar) delCar.onclick = async function () {
      if (!confirm('Ștergi mașina și toate serviciile?')) return;
      try {
        await AA.cars.remove(_selectedCarId);
        AA.showToast('Mașină ștearsă', 'info');
        AA.ui.navigate('cars');
      } catch (e) {
        AA.showToast((AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message), 'error');
      }
    };

    const car = st.cars[_selectedCarId];
    const addTire = document.getElementById('btnAddTire');
    if (addTire) addTire.onclick = function () {
      const hasMounted = Object.keys(car.tires || {}).some(function (k) { return car.tires[k].mounted; });
      AA.ui.openModal('tire', { season: 'vara', mounted: !hasMounted });
    };
    document.querySelectorAll('[data-edit-tire]').forEach(function (b) {
      b.onclick = function () { AA.ui.openModal('tire', car.tires[b.dataset.editTire], true, { tid: b.dataset.editTire }); };
    });
    document.querySelectorAll('[data-mount]').forEach(function (b) {
      b.onclick = function () { AA.ui.openModal('mount-tire', car.tires[b.dataset.mount], true, { tid: b.dataset.mount }); };
    });
    document.querySelectorAll('[data-del-tire]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('Ștergi setul de anvelope?')) return;
        try {
          await AA.cars.removeTire(_selectedCarId, b.dataset.delTire);
          AA.showToast('Set șters', 'info');
        } catch (e) { AA.showToast(e.message, 'error'); }
      };
    });
    const addIv = document.getElementById('btnAddIntervention');
    if (addIv) addIv.onclick = function () { AA.ui.openModal('intervention', {}); };
    document.querySelectorAll('[data-hist]').forEach(function (b) {
      b.onclick = function () { AA.ui.openModal('intervention', car.history[b.dataset.hist], true, { hid: b.dataset.hist }); };
    });
  };

  AA.ui._bindFamily = function (st) {
    const copy = document.getElementById('btnCopyCode');
    if (copy) copy.onclick = function () {
      navigator.clipboard.writeText(st.family.inviteCode).then(function () {
        AA.showToast('Cod copiat', 'success');
      }, function () {
        AA.showToast('Nu am putut copia. Codul: ' + st.family.inviteCode, 'info');
      });
    };
    const regen = document.getElementById('btnRegenCode');
    if (regen) regen.onclick = async function () {
      try {
        const c = await AA.fb.regenerateInvite();
        AA.showToast('Cod nou: ' + c, 'success');
      } catch (e) { AA.showToast(e.message, 'error'); }
    };
    document.querySelectorAll('[data-rm]').forEach(function (b) {
      b.onclick = async function () {
        if (!confirm('Elimini acest membru?')) return;
        try { await AA.fb.removeMember(b.dataset.rm); AA.showToast('Membru eliminat', 'info'); }
        catch (e) { AA.showToast(e.message, 'error'); }
      };
    });
    const leave = document.getElementById('btnLeaveFamily');
    if (leave) leave.onclick = async function () {
      const isOwner = st.family.ownerUid === st.user.uid;
      if (!confirm(isOwner ? 'Ștergi familia pentru toți?' : 'Părăsești familia?')) return;
      try { await AA.fb.leaveFamily(); AA.showToast('Gata', 'info'); }
      catch (e) { AA.showToast(e.message, 'error'); }
    };
  };

  AA.ui._bindSettings = function (st) {
    const back = document.querySelector('[data-back]');
    if (back) back.onclick = function () { AA.ui.goBack('dashboard'); };
    AA.ui._bindPush(false);
    const chk = document.getElementById('chkMorning');
    if (chk) chk.onchange = function () { AA.notif.toggleMorning(chk.checked); };
    const chkE = document.getElementById('chkEvening');
    if (chkE) chkE.onchange = function () { AA.notif.toggleEvening(chkE.checked); };
    const chkL = document.getElementById('chkLive');
    if (chkL) chkL.onchange = function () { AA.notif.toggleLive(chkL.checked); };
    const chkH = document.getElementById('chkHaptic');
    if (chkH) chkH.onchange = function () { AA.notif.toggleHaptic(chkH.checked); };
    const chkS = document.getElementById('chkSound');
    if (chkS) chkS.onchange = function () { AA.notif.toggleSound(chkS.checked); };
    const expPdf = document.getElementById('btnExportPdf');
    if (expPdf) expPdf.onclick = function () {
      if (AA.export && AA.export.pdfReport) AA.export.pdfReport(st);
      else AA.showToast('Export PDF indisponibil', 'error');
    };
    const exp = document.getElementById('btnExport');
    if (exp) exp.onclick = function () {
      const blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'autoalert-backup-' + AA.todayStr() + '.json';
      a.click();
    };
    const lo = document.getElementById('btnLogout');
    if (lo) lo.onclick = function () { AA.fb.signOut(); };
  };

  AA.ui._bindModal = function (st) {
    const cancel = document.getElementById('modalCancel');
    if (cancel) cancel.onclick = AA.ui.closeModal;
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.onclick = function (e) { if (e.target === overlay) AA.ui.closeModal(); };

    if (_modal.type === 'pick-service') {
      document.querySelectorAll('#pickServiceGrid [data-svc-type]').forEach(function (b) {
        b.onclick = async function () {
          if (b.disabled) return;
          const type = b.dataset.svcType;
          const meta = AA.SERVICE_TYPES[type] || { label: type };
          b.disabled = true;
          b.classList.add('pick-btn-loading');
          try {
            await AA.cars.addService(_selectedCarId, type);
            AA.showToast(meta.label + ' adăugat', 'success');
            AA.ui.closeModal();
          } catch (e) {
            AA.showToast((e && e.message) || 'Eroare la adăugare', 'error');
            b.disabled = false;
            b.classList.remove('pick-btn-loading');
          }
        };
      });
      return;
    }

    const remClear = document.getElementById('mRemClear');
    if (remClear) remClear.onclick = async function () {
      if (!_modal.sid || !confirm('Ștergi reminder-ul personalizat?')) return;
      try {
        await AA.cars.updateService(_selectedCarId, _modal.sid, { reminderAt: null, reminderNote: '' });
        AA.showToast('Reminder șters', 'info');
        AA.ui.closeModal();
      } catch (e) {
        AA.showToast((e && e.message) || 'Eroare', 'error');
      }
    };

    // „Făcut”: data sau Valabil schimbă termenul următor
    const doneDate = document.getElementById('mDoneDate');
    const doneValid = document.getElementById('mDoneValid');
    const doneNext = document.getElementById('mDoneNext');
    if (doneNext && doneDate) {
      const recalc = function () {
        const nd = AA.carnet.nextDueDate(_modal.data || {}, doneDate.value || AA.todayStr(), AA.ui._selCar(), doneValid ? doneValid.value : '');
        if (nd) doneNext.value = nd;
      };
      doneDate.onchange = recalc;
      if (doneValid) doneValid.onchange = recalc;
    }

    // Editare termen: Valabil schimbat ⇒ următoarea dată din ultima dată
    const svcValid = document.getElementById('mValid');
    if (svcValid) svcValid.onchange = function () {
      const ld = document.getElementById('mLastDate');
      const nd = document.getElementById('mNextDate');
      const next = ld && ld.value ? AA.carnet.nextDueDate(_modal.data || {}, ld.value, AA.ui._selCar(), svcValid.value) : null;
      if (nd && next) nd.value = next;
    };

    // Intervenția nouă: spune dinainte ce termene se actualizează
    const resetsEl = document.getElementById('ivResets');
    if (resetsEl) {
      const showResets = function () {
        try {
          const plan = AA.carnet.planIntervention(AA.ui._selCar() || {}, AA.ui._readIntervention());
          const parts = [];
          if (plan.resets.length) parts.push('Se actualizează și termenele: ' + plan.resets.join(', ') + '.');
          if (plan.skipped.length) parts.push('Rămân cum sunt, au deja o dată mai nouă: ' + plan.skipped.join(', ') + '.');
          resetsEl.textContent = parts.join(' ');
        } catch (_) { resetsEl.textContent = ''; }
      };
      document.querySelectorAll('[data-op]').forEach(function (c) { c.onchange = showResets; });
      ['mIvDate', 'mIvKm'].forEach(function (id) { const el = document.getElementById(id); if (el) el.onchange = showResets; });
      showResets();
    }
    AA.ui._bindUpperInput('mTBrand', AA.formatCarField);

    if (_modal.type === 'intervention' || _modal.type === 'tire') {
      const del = document.getElementById('modalDelete');
      if (del) del.onclick = async function () {
        const isTire = _modal.type === 'tire';
        if (!confirm(isTire ? 'Ștergi setul de anvelope?' :
          'Ștergi intrarea din carnet? Termenele rămân cum sunt; dacă le-a schimbat greșit, corectează-le din „Editează”.')) return;
        try {
          if (st.demo) { AA.showToast('Mod demo — doar vizualizare', 'info'); return; }
          if (isTire) await AA.cars.removeTire(_selectedCarId, _modal.tid);
          else await AA.cars.removeHistory(_selectedCarId, _modal.hid);
          AA.showToast(isTire ? 'Set șters' : 'Intrare ștearsă', 'info');
          AA.ui.closeModal();
        } catch (e) { AA.showToast(e.message, 'error'); }
      };
    }

    const delBtn = document.getElementById('modalDelete');
    if (delBtn && _modal.type === 'service') delBtn.onclick = async function () {
      if (!_modal.sid || !confirm('Ștergi acest serviciu?')) return;
      try {
        await AA.cars.removeService(_selectedCarId, _modal.sid);
        AA.showToast('Serviciu șters', 'info');
        AA.ui.closeModal();
      } catch (e) {
        AA.showToast((AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message), 'error');
      }
    };

    AA.ui._bindUpperInput('mPlate', AA.formatPlate);
    AA.ui._bindUpperInput('mBrand', AA.formatCarField);
    AA.ui._bindUpperInput('mModel', AA.formatCarField);

    const save = document.getElementById('modalSave');
    if (!save) return;
    save.onclick = async function () {
      try {
        if (st.demo) { AA.showToast('Mod demo — doar vizualizare', 'info'); AA.ui.closeModal(); return; }
        if (_modal.type === 'car') {
          const payload = {
            plate: document.getElementById('mPlate').value,
            brand: document.getElementById('mBrand').value,
            model: document.getElementById('mModel').value,
            year: document.getElementById('mYear').value,
            currentKm: document.getElementById('mKm').value
          };
          if (_modal.edit && _modal.carId) {
            const hasKm = String(payload.currentKm).trim() !== '';
            const allow = hasKm ? AA.ui._confirmLowerKm(st.cars[_modal.carId], payload.currentKm) : false;
            if (allow == null) return;
            await AA.cars.update(_modal.carId, payload);
            if (hasKm) await AA.cars.updateKm(_modal.carId, payload.currentKm, allow);
            AA.showToast('Mașină actualizată', 'success');
          } else {
            await AA.cars.add(payload);
            AA.showToast('Mașină adăugată', 'success');
          }
        } else if (_modal.type === 'service') {
          const patch = { notes: document.getElementById('mNotes').value };
          const ld = document.getElementById('mLastDate');
          const nd = document.getElementById('mNextDate');
          const lk = document.getElementById('mLastKm');
          const ik = document.getElementById('mIntervalKm');
          const wk = document.getElementById('mWarnKm');
          if (ld) patch.lastDate = ld.value;
          if (nd) patch.nextDate = nd.value;
          if (lk) patch.lastKm = lk.value;
          if (ik) patch.intervalKm = ik.value;
          if (wk) patch.warnKmBefore = wk.value;
          const vd = document.getElementById('mValid');
          if (vd) Object.assign(patch, AA.carnet.validityPatchFor(_modal.data || {}, AA.ui._selCar(), vd.value));
          const remDate = document.getElementById('mRemDate');
          const remTime = document.getElementById('mRemTime');
          const remNote = document.getElementById('mRemNote');
          if (remDate && remDate.value) {
            if (!('Notification' in window)) {
              AA.showToast('Browser fără notificări', 'warn');
            } else if (Notification.permission !== 'granted') {
              const perm = await Notification.requestPermission();
              if (perm !== 'granted') {
                AA.showToast('Activează notificările pentru reminder', 'warn');
              }
            }
            patch.reminderAt = AA.formatReminderAt(remDate.value, remTime ? remTime.value : '09:00');
            if (remNote) patch.reminderNote = remNote.value;
          } else if (remDate) {
            patch.reminderAt = null;
            patch.reminderNote = '';
          }
          if (_modal.edit && _modal.sid) {
            await AA.cars.updateService(_selectedCarId, _modal.sid, patch);
          } else {
            const type = document.getElementById('mSvcType').value;
            const r = await AA.cars.addService(_selectedCarId, type);
            await AA.cars.updateService(_selectedCarId, r.sid, patch);
          }
          AA.showToast('Serviciu salvat', 'success');
        } else if (_modal.type === 'mark-done') {
          AA.ui.animateDone(_modal.sid);
          const nx = document.getElementById('mDoneNext');
          const vd = document.getElementById('mDoneValid');
          await AA.cars.markDone(_selectedCarId, _modal.sid, {
            date: document.getElementById('mDoneDate').value,
            km: document.getElementById('mDoneKm').value,
            cost: document.getElementById('mDoneCost').value,
            notes: document.getElementById('mDoneNotes').value,
            validity: vd ? vd.value : '',
            nextDate: nx ? nx.value : ''
          });
          AA.showToast('Marcat ca făcut', 'success');
        } else if (_modal.type === 'intervention') {
          const data = AA.ui._readIntervention();
          if (_modal.hid) {
            await AA.cars.updateHistory(_selectedCarId, _modal.hid, data);
            AA.showToast('Carnet actualizat', 'success');
          } else {
            const r = await AA.cars.addIntervention(_selectedCarId, data);
            AA.showToast(r.resets.length ? 'Intervenție salvată. Actualizat: ' + r.resets.join(', ') : 'Intervenție salvată', 'success');
          }
        } else if (_modal.type === 'tire') {
          await AA.cars.saveTire(_selectedCarId, _modal.tid || null, {
            season: document.getElementById('mTSeason').value,
            brand: document.getElementById('mTBrand').value,
            size: document.getElementById('mTSize').value,
            dot: document.getElementById('mTDot').value,
            treadMm: document.getElementById('mTMm').value,
            location: document.getElementById('mTLoc').value,
            mounted: document.getElementById('mTMounted').checked,
            notes: document.getElementById('mTNotes').value
          });
          AA.showToast('Set de anvelope salvat', 'success');
        } else if (_modal.type === 'mount-tire') {
          await AA.cars.mountTire(_selectedCarId, _modal.tid, {
            date: document.getElementById('mMtDate').value,
            km: document.getElementById('mMtKm').value,
            cost: document.getElementById('mMtCost').value
          });
          AA.showToast('Set montat, notat în carnet', 'success');
        }
        AA.ui.closeModal();
      } catch (e) {
        AA.showToast((AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message), 'error');
      }
    };
  };

  AA.ui._readIntervention = function () {
    const val = function (id) { const el = document.getElementById(id); return el ? el.value : ''; };
    const ops = {};
    document.querySelectorAll('[data-op]').forEach(function (c) { if (c.checked) ops[c.dataset.op] = true; });
    return {
      date: val('mIvDate'), km: val('mIvKm'), cost: val('mIvCost'), shop: val('mIvShop'),
      ops: ops, other: val('mIvOther'), notes: val('mIvNotes')
    };
  };

  AA.ui._bindCarDetailDemo = function (st) {
    const back = document.querySelector('[data-back]');
    if (back) back.onclick = function () { AA.ui.goBack('cars'); };
    const addSvc = document.getElementById('btnAddService');
    if (addSvc) addSvc.onclick = function () { AA.showToast('Mod demo — doar vizualizare', 'info'); };
    document.querySelectorAll('[data-edit-svc]').forEach(function (b) {
      b.onclick = function () { AA.showToast('Mod demo — doar vizualizare', 'info'); };
    });
    document.querySelectorAll('[data-done]').forEach(function (b) {
      b.onclick = function () {
        AA.ui.animateDone(b.dataset.done);
        AA.showToast('Demo — animație marcare făcut', 'success');
      };
    });
    const saveKm = document.getElementById('btnSaveKm');
    if (saveKm) saveKm.onclick = function () { AA.showToast('Mod demo — doar vizualizare', 'info'); };
    document.querySelectorAll('[data-del-svc],#btnEditCar,#btnDelCar,#btnAddTire,[data-edit-tire],[data-mount],[data-del-tire],#btnAddIntervention,[data-hist]').forEach(function (b) {
      b.onclick = function () { AA.showToast('Mod demo — doar vizualizare', 'info'); };
    });
  };

  AA.ui._bindSettingsDemo = function () {
    const back = document.querySelector('[data-back]');
    if (back) back.onclick = function () { AA.ui.goBack('dashboard'); };
    AA.ui._bindPush(true);
    document.querySelectorAll('#btnExport,#btnExportPdf,#btnLogout').forEach(function (el) {
      el.onclick = function () { AA.showToast('Mod demo — doar vizualizare', 'info'); };
    });
    document.querySelectorAll('#chkMorning,#chkEvening,#chkLive,#chkHaptic,#chkSound').forEach(function (el) {
      el.onchange = function () {
        if (el.id === 'chkHaptic') AA.notif.toggleHaptic(el.checked);
        else if (el.id === 'chkSound') AA.notif.toggleSound(el.checked);
        else AA.showToast('Mod demo — doar vizualizare', 'info');
        if (el.id === 'chkMorning') el.checked = false;
      };
    });
  };

  AA.ui._bindSetup = function () {
    const btn = document.getElementById('btnDemo');
    if (btn) btn.onclick = function () { AA.ui.startDemo(); };
  };

  AA.ui._handleDeepLink = function (st) {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    const action = params.get('action');
    if (view === 'cars') AA.ui.navigate('cars');
    else if (view === 'settings') AA.ui.navigate('settings');
    else if (view === 'family') AA.ui.navigate('family');
    else if (action === 'km' && st.cars) {
      const ids = Object.keys(st.cars);
      if (!ids.length) {
        AA.showToast('Adaugă o mașină mai întâi', 'info');
        return;
      }
      _selectedCarId = ids[0];
      AA.ui.navigate('car-detail', { carId: ids[0] });
      setTimeout(function () {
        const km = document.getElementById('kmInput');
        if (km) { km.focus(); km.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }, 120);
    }
    if (view || action) {
      try { history.replaceState(history.state, '', location.pathname); } catch (_) {}
    }
  };

  AA.ui.init = function () {
    AA.ui._initHistory();
    const finish = function () {
      AA.ui.hideSplash();
      AA.notif.startWatcher();
      if (AA.push) setTimeout(AA.push.resync, 3000);
      if (_view === 'loading') AA.ui.navigate('dashboard');
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'AA_RUN_ALERT_CHECK') {
          AA.notif.checkMorning();
          AA.notif.checkEvening();
          AA.notif.checkLive();
          AA.notif.checkCustomReminders();
        }
      });
    }
    if (new URLSearchParams(location.search).get('demo') === '1') {
      AA.fb.init().then(function () { AA.ui.startDemo(); finish(); });
      return;
    }
    AA.fb.onState(function () {
      if (_demoMode) return;
      clearTimeout(_renderTimer);
      _renderTimer = setTimeout(function () {
        AA.ui.render();
        AA.notif.checkMorning();
        AA.notif.checkEvening();
        const st = AA.fb.getState();
        if (st.familyId && st.cars) AA.notif.alertIfExpired(st.cars);
        if (!_deepLinkDone && st.familyId && new URLSearchParams(location.search).toString()) {
          _deepLinkDone = true;
          AA.ui._handleDeepLink(st);
        }
      }, 48);
    });
    AA.fb.init().then(finish);
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);