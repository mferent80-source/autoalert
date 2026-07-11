/* AutoAlert — core utilities */
(function (global) {
  'use strict';

  const AA = global.AA || {};
  AA.APP_VERSION = '1.3.4';

  AA.LS = {
    morningNotif: 'aa_morning_notif',
    morningNotifDay: 'aa_morning_notif_day',
    cachePrefix: 'aa_cache_',
    settings: 'aa_settings'
  };

  AA.STATUS_ORDER = { expired: 0, urgent: 1, warning: 2, ok: 3 };
  AA.STATUS_LABELS = {
    expired: 'Expirat',
    urgent: 'Urgent',
    warning: 'În curând',
    ok: 'OK'
  };

  AA.todayStr = function () {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  };

  AA.parseDate = function (str) {
    if (!str || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
    const p = str.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  };

  AA.diffDays = function (fromStr, toStr) {
    const a = AA.parseDate(fromStr);
    const b = AA.parseDate(toStr);
    if (!a || !b) return null;
    a.setHours(0, 0, 0, 0);
    b.setHours(0, 0, 0, 0);
    return Math.round((b - a) / 86400000);
  };

  AA.addDays = function (dateStr, days) {
    const d = AA.parseDate(dateStr);
    if (!d) return '';
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  };

  AA.addMonths = function (dateStr, months) {
    const d = AA.parseDate(dateStr);
    if (!d) return '';
    d.setMonth(d.getMonth() + months);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  };

  AA.formatDate = function (str) {
    const d = AA.parseDate(str);
    if (!d) return '—';
    return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  AA.formatKm = function (n) {
    if (n == null || isNaN(n)) return '—';
    return Number(n).toLocaleString('ro-RO') + ' km';
  };

  AA.genId = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  AA.genInviteCode = function () {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  };

  AA.worstStatus = function (statuses) {
    let worst = 'ok';
    for (const s of statuses) {
      if ((AA.STATUS_ORDER[s] ?? 3) < (AA.STATUS_ORDER[worst] ?? 3)) worst = s;
    }
    return worst;
  };

  AA.cleanRtdb = function (obj) {
    if (obj == null) return obj;
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (_) {
      if (typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) {
        return obj.map(AA.cleanRtdb).filter(function (v) { return v !== undefined; });
      }
      const out = {};
      Object.keys(obj).forEach(function (k) {
        if (obj[k] === undefined) return;
        const v = AA.cleanRtdb(obj[k]);
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
  };

  AA.escapeHtml = function (str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  AA.showToast = function (msg, type) {
    type = type || 'info';
    let box = document.getElementById('toastContainer');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toastContainer';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('fadeout');
      setTimeout(function () { el.remove(); }, 280);
    }, 3200);
  };

  AA.getSettings = function () {
    try {
      return JSON.parse(localStorage.getItem(AA.LS.settings) || '{}');
    } catch (_) {
      return {};
    }
  };

  AA.saveSettings = function (patch) {
    const s = Object.assign(AA.getSettings(), patch);
    localStorage.setItem(AA.LS.settings, JSON.stringify(s));
    return s;
  };

  AA.cacheSave = function (familyId, data) {
    if (!familyId) return;
    localStorage.setItem(AA.LS.cachePrefix + familyId, JSON.stringify({
      data: data,
      savedAt: Date.now()
    }));
  };

  AA.cacheLoad = function (familyId) {
    if (!familyId) return null;
    try {
      const raw = localStorage.getItem(AA.LS.cachePrefix + familyId);
      if (!raw) return null;
      return JSON.parse(raw).data;
    } catch (_) {
      return null;
    }
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);