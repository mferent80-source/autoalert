/* AutoAlert — morning reminders */
(function (global) {
  'use strict';

  const AA = global.AA || {};
  AA.notif = AA.notif || {};
  let _interval = null;

  AA.notif.isEnabled = function () {
    return localStorage.getItem(AA.LS.morningNotif) === '1';
  };

  AA.notif.toggleMorning = async function (enabled) {
    if (enabled) {
      if (!('Notification' in window)) {
        AA.showToast('Browser-ul nu suportă notificări', 'warn');
        return false;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        AA.showToast('Permisiune notificări refuzată', 'warn');
        return false;
      }
      localStorage.setItem(AA.LS.morningNotif, '1');
      AA.showToast('Reminder dimineață activ (7–10)', 'success');
      return true;
    }
    localStorage.setItem(AA.LS.morningNotif, '0');
    AA.showToast('Reminder dimineață dezactivat', 'info');
    return true;
  };

  AA.notif.checkMorning = function () {
    if (!AA.notif.isEnabled()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const h = new Date().getHours();
    if (h < 7 || h > 10) return;

    const dayKey = AA.todayStr();
    if (localStorage.getItem(AA.LS.morningNotifDay) === dayKey) return;

    const cars = (AA.fb.getState().cars) || {};
    const agg = AA.aggregateAlerts(cars);
    if (!agg.expired && !agg.urgent && !agg.warning) return;

    localStorage.setItem(AA.LS.morningNotifDay, dayKey);

    const parts = [];
    if (agg.expired) parts.push(agg.expired + ' expirate');
    if (agg.urgent) parts.push(agg.urgent + ' urgente');
    if (agg.warning) parts.push(agg.warning + ' în curând');

    let body = parts.join(' · ');
    if (agg.items.length) {
      const top = agg.items.slice(0, 3).map(function (i) {
        return i.plate + ': ' + i.label;
      });
      body += '\n' + top.join('\n');
    }

    new Notification('AutoAlert — Alerte', {
      body: body,
      icon: 'icon.svg',
      tag: 'aa-morning'
    });
  };

  AA.notif.startWatcher = function () {
    if (_interval) return;
    AA.notif.checkMorning();
    _interval = setInterval(AA.notif.checkMorning, 15 * 60 * 1000);
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);