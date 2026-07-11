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
            s3: { type: 'ulei', mode: 'mileage', lastKm: 77000, intervalKm: 10000, warnKmBefore: 1000 }
          },
          history: {
            h1: { type: 'ulei', doneDate: AA.addMonths(today, -8), doneKm: 77000, cost: 280, createdAt: Date.now() }
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

  AA.ui.navigate = function (view, opts) {
    opts = opts || {};
    _view = view;
    if (opts.carId != null) _selectedCarId = opts.carId;
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
      AA.ui._renderNav() +
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

  AA.ui._svcIcon = function (type, size) {
    return AA.icon ? AA.icon.render(type, size || 18, 'svc-icon') : '';
  };

  AA.ui._svcBubble = function (type, size) {
    return AA.icon && AA.icon.bubble ? AA.icon.bubble(type, size || 30) : AA.ui._svcIcon(type, 18);
  };

  AA.ui._dashHero = function (st, agg) {
    const name = st.user ? st.user.displayName.split(' ')[0] : '';
    let mood = 'alert';
    let msg = 'Totul e în regulă — nici o alertă activă';
    if (agg.expired) {
      mood = 'danger';
      msg = agg.expired + ' alertă' + (agg.expired > 1 ? 'e expirată' : ' expirată') + ' — acționează azi';
    } else if (agg.urgent) {
      mood = 'urgent';
      msg = agg.urgent + ' urgent' + (agg.urgent > 1 ? 'e' : '') + ' — verifică programările';
    } else if (agg.warning) {
      mood = 'warn';
      msg = agg.warning + ' în curând — planifică din timp';
    }
    return '<div class="dash-hero dash-hero-' + mood + '">' +
      '<div class="dash-hero-content">' +
      '<div class="dash-greet">Bună, ' + AA.escapeHtml(name) + '</div>' +
      '<div class="dash-mood">' + msg + '</div>' +
      '</div>' +
      '<div class="dash-hero-visual">' + (AA.icon ? AA.icon.bubble('wheel', 52) : '') + '</div>' +
      '</div>';
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
    const el = document.querySelector('[data-svc="' + sid + '"]');
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
    return '<div class="auth-screen">' +
      '<div class="auth-glow"></div>' +
      '<div class="center-card auth-card">' +
      '<div class="auth-icon">' + (AA.icon ? AA.icon.render('wheel', 56) : '') + '</div>' +
      '<div class="logo">Auto<span>Alert</span></div>' +
      '<p class="muted">Alerte ITP, RCA, rovinietă, schimburi — pentru toată familia.</p>' +
      (wrongProject
        ? '<div class="auth-warn">Proiectul <b>datorietrack</b> e pentru DatorieTrack, nu suportă login Google pentru AutoAlert. Deschide <a href="./setup-firebase.html" target="_blank">setup-firebase.html</a> și creează proiect <b>autoalert</b>.</div>'
        : '') +
      '<button class="btn btn-primary btn-glow" id="btnGoogle">Continuă cu Google</button>' +
      '<button class="btn btn-ghost" id="btnDemoAuth">Previzualizare demo</button>' +
      '<p class="ver">v' + AA.APP_VERSION + '</p>' +
      '</div></div>';
  };

  AA.ui._renderOnboard = function () {
    return '<div class="center-card">' +
      '<div class="logo">Auto<span>Alert</span></div>' +
      '<p class="muted">Creează o familie nouă sau intră cu cod de invitație.</p>' +
      '<div class="tabs-onboard">' +
      '<button class="tab-btn active" data-tab="create">Creează familie</button>' +
      '<button class="tab-btn" data-tab="join">Am cod</button>' +
      '</div>' +
      '<div id="panelCreate">' +
      '<input class="input" id="familyName" placeholder="Nume familie (ex. Familia Popescu)" maxlength="80">' +
      '<button class="btn btn-primary" id="btnCreateFamily">Creează</button>' +
      '</div>' +
      '<div id="panelJoin" class="hidden">' +
      '<input class="input mono" id="inviteCode" placeholder="Cod invitație (6 caractere)" maxlength="6" style="text-transform:uppercase">' +
      '<button class="btn btn-primary" id="btnJoinFamily">Intră în familie</button>' +
      '</div>' +
      '<button class="btn btn-ghost" id="btnLogout">Deconectare</button>' +
      '</div>';
  };

  AA.ui._renderHeader = function (st) {
    const name = st.user ? st.user.displayName.split(' ')[0] : '';
    return '<header class="app-header">' +
      '<div class="logo-sm">Auto<span>Alert</span></div>' +
      '<div class="header-actions">' +
      '<button class="btn-icon" id="btnSettings" title="Setări">⚙️</button>' +
      (AA.icon ? AA.icon.avatar(st.user.displayName, 28) : '') +
      '<span class="user-chip">' + AA.escapeHtml(name) + '</span>' +
      '</div>' +
      (st.demo ? '<div class="demo-banner">Mod demo — date fictive · <button class="link-btn" id="btnExitDemo">Ieși</button></div>' : '') +
      (st.offline ? '<div class="offline-banner">Offline — date din cache</div>' : '') +
      '</header>';
  };

  AA.ui._renderNav = function () {
    const items = [
      { id: 'dashboard', label: 'Acasă', icon: 'home' },
      { id: 'cars', label: 'Mașini', icon: 'car' },
      { id: 'family', label: 'Familie', icon: 'family' }
    ];
    return '<nav class="bottom-nav">' + items.map(function (it) {
      return '<button class="nav-btn' + (_view === it.id ? ' active' : '') + '" data-nav="' + it.id + '">' +
        '<span class="nav-icon">' + AA.ui._svcIcon(it.icon, 22) + '</span>' + it.label + '</button>';
    }).join('') + '</nav>';
  };

  AA.ui._renderView = function (st) {
    if (_view === 'settings') return AA.ui._renderSettings(st);
    if (_view === 'cars') return AA.ui._renderCars(st);
    if (_view === 'car-detail') return AA.ui._renderCarDetail(st);
    if (_view === 'family') return AA.ui._renderFamily(st);
    return AA.ui._renderDashboard(st);
  };

  AA.ui._renderDashboard = function (st) {
    const agg = AA.aggregateAlerts(st.cars);
    const carIds = Object.keys(st.cars || {}).sort(function (a, b) {
      return AA.STATUS_RANK[AA.getCarWorstStatus(st.cars[a])] - AA.STATUS_RANK[AA.getCarWorstStatus(st.cars[b])];
    });

    const okCount = Object.keys(st.cars || {}).length;
    const hero = AA.ui._dashHero(st, agg);
    const banner = hero +
      '<div class="stats-row">' +
      '<div class="stat-pill stat-danger' + (agg.expired ? ' active' : '') + '">' +
      '<span class="stat-num">' + agg.expired + '</span><span class="stat-lbl">Expirate</span></div>' +
      '<div class="stat-pill stat-urgent' + (agg.urgent ? ' active' : '') + '">' +
      '<span class="stat-num">' + agg.urgent + '</span><span class="stat-lbl">Urgente</span></div>' +
      '<div class="stat-pill stat-warn' + (agg.warning ? ' active' : '') + '">' +
      '<span class="stat-num">' + agg.warning + '</span><span class="stat-lbl">Curând</span></div>' +
      '</div>' +
      ((agg.expired || agg.urgent || agg.warning) ? '' :
        '<div class="status-banner ok">' + AA.ui._svcIcon('check', 16) + ' Toate cele ' + okCount + ' mașini sunt în regulă</div>');

    const cards = carIds.map(function (id) {
      const car = st.cars[id];
      const worst = AA.getCarWorstStatus(car);
      const alerts = Object.keys(car.services || {}).map(function (sid) {
        const svc = car.services[sid];
        const d = AA.getServiceDetail(svc, car);
        if (d.status === 'ok') return '';
        return '<div class="svc-row status-' + d.status + '">' +
          '<div class="svc-row-main">' +
          '<span class="svc-label">' + AA.ui._svcBubble(svc.type, 28) + '<span>' + AA.escapeHtml(d.label) + '</span></span>' +
          '<span class="svc-meta">' + AA.escapeHtml(d.summary) + '</span>' +
          AA.ui._progressBar(d.progress, d.status) +
          '</div></div>';
      }).filter(Boolean).join('');

      const accent = AA.ui._carColor(car);
      return '<div class="car-card status-border-' + worst + ' card-glow-' + worst + '" data-car="' + id + '" style="--car-accent:' + accent + '">' +
        '<div class="car-card-stripe"></div>' +
        '<div class="car-card-body">' +
        '<div class="car-card-head">' +
        '<div class="car-thumb" style="background:' + accent + '22;border-color:' + accent + '55">' +
        AA.ui._svcIcon('car', 22) + '</div>' +
        '<div class="car-card-id">' +
        '<span class="plate-chip mono">' + AA.escapeHtml(car.plate) + '</span>' +
        '<span class="car-name">' + AA.escapeHtml((car.brand || '') + ' ' + (car.model || '')) + '</span>' +
        '</div>' +
        '<span class="badge badge-' + worst + '">' + AA.STATUS_LABELS[worst] + '</span>' +
        '</div>' +
        (alerts || '<div class="svc-row status-ok"><span class="svc-label">' + AA.ui._svcBubble('check', 26) + '<span>Nici o alertă activă</span></span></div>') +
        '</div></div>';
    }).join('');

    return banner +
      '<div class="section-title">Mașinile tale</div>' +
      (cards || '<div class="empty">Nicio mașină încă. Adaugă prima mașină.</div>') +
      '<button class="fab" id="fabAddCar" title="Adaugă mașină">+</button>';
  };

  AA.ui._renderCars = function (st) {
    const ids = Object.keys(st.cars || {});
    if (!ids.length) {
      return '<div class="empty">Nicio mașină. Apasă + pentru a adăuga.</div>' +
        '<button class="fab" id="fabAddCar">+</button>';
    }
    return ids.map(function (id) {
      const car = st.cars[id];
      const worst = AA.getCarWorstStatus(car);
      const accent = AA.ui._carColor(car);
      return '<div class="list-card" data-car="' + id + '" style="--car-accent:' + accent + '">' +
        '<div class="list-card-stripe"></div>' +
        '<div class="car-thumb car-thumb-sm" style="background:' + accent + '22;border-color:' + accent + '55">' +
        AA.ui._svcIcon('car', 18) + '</div>' +
        '<div class="list-card-info">' +
        '<div class="plate-chip mono">' + AA.escapeHtml(car.plate) + '</div>' +
        '<div class="list-sub">' + AA.escapeHtml((car.brand || '') + ' ' + (car.model || '')) +
        ' · ' + AA.formatKm(car.currentKm) + '</div></div>' +
        '<span class="status-dot status-dot-' + worst + '"></span></div>';
    }).join('') + '<button class="fab" id="fabAddCar">+</button>';
  };

  AA.ui._renderCarDetail = function (st) {
    const car = st.cars[_selectedCarId];
    if (!car) return '<div class="empty">Mașină negăsită.</div>';

    const services = AA.ui._sortServiceIds(car).map(function (sid) {
      const svc = car.services[sid];
      const d = AA.getServiceDetail(svc, car);
      return '<div class="list-card svc-card status-border-' + d.status + '" data-svc="' + sid + '">' +
        '<div class="svc-card-layout">' +
        AA.ui._ring(svc, car, d) +
        '<div class="svc-card-body">' +
        '<div class="svc-head"><span class="svc-title">' + AA.ui._svcBubble(svc.type, 34) + '<span>' + AA.escapeHtml(d.label) + '</span></span>' +
        '<span class="badge badge-' + d.status + '">' + AA.STATUS_LABELS[d.status] + '</span></div>' +
        '<div class="list-sub">' + AA.escapeHtml(d.summary) + '</div>' +
        AA.ui._progressBar(d.progress, d.status) +
        '<div class="svc-actions">' +
        '<button class="btn btn-sm btn-done" data-done="' + sid + '">' + AA.ui._svcIcon('check', 14) + ' Făcut</button>' +
        '<button class="btn btn-sm btn-ghost" data-edit-svc="' + sid + '">Editează</button>' +
        '<button class="btn btn-sm btn-danger" data-del-svc="' + sid + '">Șterge</button>' +
        '</div></div></div></div>';
    }).join('');

    const history = Object.keys(car.history || {}).sort(function (a, b) {
      return (car.history[b].createdAt || 0) - (car.history[a].createdAt || 0);
    }).slice(0, 8).map(function (hid) {
      const h = car.history[hid];
      const meta = AA.SERVICE_TYPES[h.type] || { label: h.type };
      return '<div class="hist-row">' + AA.formatDate(h.doneDate) + ' · ' +
        AA.escapeHtml(meta.label) + ' · ' + AA.formatKm(h.doneKm) + '</div>';
    }).join('');

    const accent = AA.ui._carColor(car);
    return '<button class="btn btn-ghost back-btn" data-back>← Înapoi</button>' +
      '<div class="car-toolbar">' +
      '<button class="btn btn-sm btn-ghost" id="btnEditCar">Editează mașina</button>' +
      '<button class="btn btn-sm btn-danger" id="btnDelCar">Șterge mașina</button>' +
      '</div>' +
      '<div class="car-hero" style="--car-accent:' + accent + '">' +
      '<div class="car-hero-glow"></div>' +
      '<div class="car-hero-thumb">' + AA.ui._svcIcon('car', 36) + '</div>' +
      '<div class="plate-chip plate-chip-lg mono">' + AA.escapeHtml(car.plate) + '</div>' +
      '<div class="car-hero-sub">' + AA.escapeHtml((car.brand || '') + ' ' + (car.model || '') + ' · ' + (car.year || '')) + '</div>' +
      '</div>' +
      '<div class="km-box">' +
      '<label>Km curent</label>' +
      '<div class="km-row">' +
      '<input class="input mono" id="kmInput" type="number" min="0" max="999999" value="' + (car.currentKm || 0) + '">' +
      '<button class="btn btn-primary" id="btnSaveKm">Salvează</button>' +
      '</div></div>' +
      '<div class="section-title">Servicii <button class="btn btn-sm" id="btnAddService">+ Adaugă</button></div>' +
      (services || '<div class="empty">Niciun serviciu. Adaugă ITP, RCA, ulei…</div>') +
      (history ? '<div class="section-title">Istoric recent</div>' + history : '');
  };

  AA.ui._renderFamily = function (st) {
    const isOwner = st.family && st.user && st.family.ownerUid === st.user.uid;
    const members = Object.keys(st.members || {}).map(function (uid) {
      const m = st.members[uid];
      return '<div class="member-row">' +
        (AA.icon ? AA.icon.avatar(m.displayName || uid) : '') +
        '<span class="member-name">' + AA.escapeHtml(m.displayName || uid) + '</span>' +
        '<span class="badge">' + (m.role === 'owner' ? 'Owner' : 'Membru') + '</span>' +
        (isOwner && uid !== st.user.uid ?
          '<button class="btn btn-sm btn-danger" data-rm="' + uid + '">Elimină</button>' : '') +
        '</div>';
    }).join('');

    return '<div class="section-title">' + AA.escapeHtml(st.family ? st.family.name : 'Familie') + '</div>' +
      '<div class="invite-box">' +
      '<div class="muted">Cod invitație</div>' +
      '<div class="invite-code mono">' + AA.escapeHtml(st.family ? st.family.inviteCode : '') + '</div>' +
      '<button class="btn btn-sm" id="btnCopyCode">Copiază</button>' +
      (isOwner ? '<button class="btn btn-sm btn-ghost" id="btnRegenCode">Regenerează</button>' : '') +
      '</div>' +
      '<div class="section-title">Membri</div>' + members +
      '<button class="btn btn-ghost btn-danger-text" id="btnLeaveFamily">' +
      (isOwner ? 'Șterge familia' : 'Părăsește familia') + '</button>';
  };

  AA.ui._renderSettings = function (st) {
    const enabled = AA.notif.isEnabled();
    const evening = AA.notif.isEveningEnabled();
    const live = AA.notif.isLiveEnabled();
    const haptic = AA.notif.isHapticEnabled();
    const sound = AA.notif.isSoundEnabled();
    return '<button class="btn btn-ghost back-btn" data-back>← Înapoi</button>' +
      '<div class="section-title">Notificări</div>' +
      '<label class="toggle-row">' +
      '<span>Reminder dimineață (7–10)</span>' +
      '<input type="checkbox" id="chkMorning" ' + (enabled ? 'checked' : '') + '>' +
      '</label>' +
      '<label class="toggle-row">' +
      '<span>Reminder seară (18–20)</span>' +
      '<input type="checkbox" id="chkEvening" ' + (evening ? 'checked' : '') + '>' +
      '</label>' +
      '<label class="toggle-row">' +
      '<span>Alerte live (la 30 min)</span>' +
      '<input type="checkbox" id="chkLive" ' + (live ? 'checked' : '') + '>' +
      '</label>' +
      '<label class="toggle-row">' +
      '<span>Vibrație la alerte expirate</span>' +
      '<input type="checkbox" id="chkHaptic" ' + (haptic ? 'checked' : '') + '>' +
      '</label>' +
      '<label class="toggle-row">' +
      '<span>Sunet la alerte expirate</span>' +
      '<input type="checkbox" id="chkSound" ' + (sound ? 'checked' : '') + '>' +
      '</label>' +
      '<div class="section-title">Export</div>' +
      '<button class="btn" id="btnExportPdf">Raport PDF (ITP, RCA…)</button>' +
      '<button class="btn btn-ghost" id="btnExport">Backup JSON</button>' +
      '<div class="section-title">Cont</div>' +
      '<button class="btn btn-ghost" id="btnLogout">Deconectare</button>' +
      '<p class="ver">AutoAlert v' + AA.APP_VERSION + '</p>';
  };

  AA.ui._renderModal = function () {
    const m = _modal;
    if (m.type === 'car') {
      const c = m.data || {};
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal">' +
        '<h3>' + (m.edit ? 'Editează mașina' : 'Mașină nouă') + '</h3>' +
        '<input class="input mono" id="mPlate" placeholder="B 123 ABC" value="' + AA.escapeHtml(c.plate || '') + '">' +
        '<input class="input" id="mBrand" placeholder="Marcă" value="' + AA.escapeHtml(c.brand || '') + '">' +
        '<input class="input" id="mModel" placeholder="Model" value="' + AA.escapeHtml(c.model || '') + '">' +
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
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal modal-lg">' +
        '<h3>' + AA.escapeHtml(title) + '</h3>' +
        (m.edit ? '<p class="muted modal-hint">Tip: <b>' + AA.escapeHtml(meta.label || typeKey) + '</b></p>' :
          '<select class="input" id="mSvcType">' + types + '</select>') +
        (showDate ? (
          '<div class="modal-section">Termen (dată)</div>' +
          '<label class="lbl">Ultima dată</label><input class="input" id="mLastDate" type="date" value="' + (s.lastDate || AA.todayStr()) + '">' +
          '<label class="lbl">Următoarea dată</label><input class="input" id="mNextDate" type="date" value="' + (s.nextDate || '') + '">'
        ) : '') +
        (showKm ? (
          '<div class="modal-section">Termen (km)</div>' +
          '<label class="lbl">Ultimul km</label><input class="input mono" id="mLastKm" type="number" min="0" value="' + (s.lastKm != null ? s.lastKm : 0) + '">' +
          '<label class="lbl">Interval km</label><input class="input mono" id="mIntervalKm" type="number" min="0" value="' + (s.intervalKm != null ? s.intervalKm : (meta.defaultIntervalKm || '')) + '">' +
          '<label class="lbl">Alertă km înainte</label><input class="input mono" id="mWarnKm" type="number" min="0" value="' + (s.warnKmBefore != null ? s.warnKmBefore : (meta.warnKmBefore || '')) + '">'
        ) : '') +
        '<label class="lbl">Note</label><input class="input" id="mNotes" value="' + AA.escapeHtml(s.notes || '') + '">' +
        '<div class="modal-actions">' +
        (m.edit && m.sid ? '<button class="btn btn-danger" id="modalDelete">Șterge</button>' : '') +
        '<button class="btn btn-ghost" id="modalCancel">Anulează</button>' +
        '<button class="btn btn-primary" id="modalSave">Salvează</button></div></div></div>';
    }
    if (m.type === 'mark-done') {
      const s = m.data || {};
      const meta = AA.SERVICE_TYPES[s.type] || { label: s.type };
      const gst = AA.ui.getState();
      const car = gst.cars && _selectedCarId ? gst.cars[_selectedCarId] : null;
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal">' +
        '<h3>Marchează făcut: ' + AA.escapeHtml(meta.label) + '</h3>' +
        '<label class="lbl">Data</label><input class="input" id="mDoneDate" type="date" value="' + AA.todayStr() + '">' +
        '<label class="lbl">Km la intervenție</label><input class="input mono" id="mDoneKm" type="number" value="' + (car ? car.currentKm : 0) + '">' +
        '<label class="lbl">Cost (RON, opțional)</label><input class="input mono" id="mDoneCost" type="number" min="0" placeholder="0">' +
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
      const opts = Object.keys(AA.SERVICE_TYPES).map(function (k) {
        const t = AA.SERVICE_TYPES[k];
        const has = existing[k];
        return '<button type="button" class="pick-btn' + (has ? ' pick-btn-has' : '') + '" data-svc-type="' + k + '">' +
          AA.ui._svcBubble(k, 36) + '<span>' + t.label + (has ? ' <em class="pick-tag">✓</em>' : '') + '</span></button>';
      }).join('');
      return '<div class="modal-overlay" id="modalOverlay"><div class="modal modal-lg">' +
        '<h3>Alege tip serviciu</h3><div class="pick-grid" id="pickServiceGrid">' + opts + '</div>' +
        '<button class="btn btn-ghost" id="modalCancel">Anulează</button></div></div>';
    }
    return '';
  };

  AA.ui.openModal = function (type, data, edit, opts) {
    _modal = Object.assign({ type: type, data: data || {}, edit: !!edit }, opts || {});
    AA.ui.render();
  };

  AA.ui.closeModal = function () {
    _modal = null;
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

    if (_view === 'car-detail') AA.ui._bindCarDetail(st);
    if (_view === 'family') AA.ui._bindFamily(st);
    if (_view === 'settings') AA.ui._bindSettings(st);
  };

  AA.ui._bindCarDetail = function (st) {
    const back = document.querySelector('[data-back]');
    if (back) back.onclick = function () { AA.ui.navigate('cars'); };

    const saveKm = document.getElementById('btnSaveKm');
    if (saveKm) saveKm.onclick = async function () {
      try {
        const v = await AA.cars.updateKm(_selectedCarId, document.getElementById('kmInput').value);
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
  };

  AA.ui._bindFamily = function (st) {
    const copy = document.getElementById('btnCopyCode');
    if (copy) copy.onclick = function () {
      navigator.clipboard.writeText(st.family.inviteCode);
      AA.showToast('Cod copiat', 'success');
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
    if (back) back.onclick = function () { AA.ui.navigate('dashboard'); };
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

    const delBtn = document.getElementById('modalDelete');
    if (delBtn) delBtn.onclick = async function () {
      if (!_modal.sid || !confirm('Ștergi acest serviciu?')) return;
      try {
        await AA.cars.removeService(_selectedCarId, _modal.sid);
        AA.showToast('Serviciu șters', 'info');
        AA.ui.closeModal();
      } catch (e) {
        AA.showToast((AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message), 'error');
      }
    };

    const save = document.getElementById('modalSave');
    if (!save) return;
    save.onclick = async function () {
      try {
        if (_modal.type === 'car') {
          const payload = {
            plate: document.getElementById('mPlate').value,
            brand: document.getElementById('mBrand').value,
            model: document.getElementById('mModel').value,
            year: document.getElementById('mYear').value,
            currentKm: document.getElementById('mKm').value
          };
          if (_modal.edit && _modal.carId) {
            await AA.cars.update(_modal.carId, payload);
            if (payload.currentKm != null) await AA.cars.updateKm(_modal.carId, payload.currentKm);
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
          await AA.cars.markDone(_selectedCarId, _modal.sid, {
            date: document.getElementById('mDoneDate').value,
            km: document.getElementById('mDoneKm').value,
            cost: document.getElementById('mDoneCost').value
          });
          AA.showToast('Marcat ca făcut', 'success');
        }
        AA.ui.closeModal();
      } catch (e) {
        AA.showToast((AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message), 'error');
      }
    };
  };

  AA.ui._bindCarDetailDemo = function (st) {
    const back = document.querySelector('[data-back]');
    if (back) back.onclick = function () { AA.ui.navigate('cars'); };
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
  };

  AA.ui._bindSettingsDemo = function () {
    const back = document.querySelector('[data-back]');
    if (back) back.onclick = function () { AA.ui.navigate('dashboard'); };
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
      try { history.replaceState(null, '', location.pathname); } catch (_) {}
    }
  };

  AA.ui.init = function () {
    const finish = function () {
      AA.ui.hideSplash();
      AA.notif.startWatcher();
      if (_view === 'loading') AA.ui.navigate('dashboard');
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'AA_RUN_ALERT_CHECK') {
          AA.notif.checkMorning();
          AA.notif.checkEvening();
          AA.notif.checkLive();
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