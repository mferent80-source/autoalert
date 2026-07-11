/* AutoAlert — notifications: morning, evening, live, haptic, sound */
(function (global) {
  'use strict';

  const AA = global.AA || {};
  AA.notif = AA.notif || {};
  let _interval = null;
  let _liveInterval = null;
  let _customInterval = null;
  let _audioCtx = null;

  AA.notif.isEnabled = function () {
    return localStorage.getItem(AA.LS.morningNotif) === '1';
  };

  AA.notif.isEveningEnabled = function () {
    return localStorage.getItem(AA.LS.eveningNotif) === '1';
  };

  AA.notif.isLiveEnabled = function () {
    return localStorage.getItem(AA.LS.liveNotif) === '1';
  };

  AA.notif.isHapticEnabled = function () {
    const s = AA.getSettings();
    return s.hapticAlert !== '0';
  };

  AA.notif.isSoundEnabled = function () {
    const s = AA.getSettings();
    return s.soundAlert !== '0';
  };

  AA.notif._requestPerm = async function () {
    if (!('Notification' in window)) {
      AA.showToast('Browser-ul nu suportă notificări', 'warn');
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      AA.showToast('Permisiune notificări refuzată', 'warn');
      return false;
    }
    AA.notif._registerPeriodicSync();
    return true;
  };

  AA.notif._registerPeriodicSync = function () {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (!reg.periodicSync) return;
      return reg.periodicSync.register('aa-alerts', { minInterval: 12 * 60 * 60 * 1000 })
        .catch(function () { /* unsupported */ });
    }).catch(function () {});
  };

  AA.notif.toggleMorning = async function (enabled) {
    if (enabled) {
      if (!(await AA.notif._requestPerm())) return false;
      localStorage.setItem(AA.LS.morningNotif, '1');
      AA.showToast('Reminder dimineață activ (7–10)', 'success');
      return true;
    }
    localStorage.setItem(AA.LS.morningNotif, '0');
    AA.showToast('Reminder dimineață dezactivat', 'info');
    return true;
  };

  AA.notif.toggleEvening = async function (enabled) {
    if (enabled) {
      if (!(await AA.notif._requestPerm())) return false;
      localStorage.setItem(AA.LS.eveningNotif, '1');
      AA.showToast('Reminder seară activ (18–20)', 'success');
      return true;
    }
    localStorage.setItem(AA.LS.eveningNotif, '0');
    AA.showToast('Reminder seară dezactivat', 'info');
    return true;
  };

  AA.notif._isLiveWindow = function () {
    const now = new Date();
    const day = now.getDay();
    if (day === 0 || day === 6) return false;
    const h = now.getHours();
    return h >= 8 && h <= 18;
  };

  AA.notif.toggleLive = async function (enabled) {
    if (enabled) {
      if (!(await AA.notif._requestPerm())) return false;
      localStorage.setItem(AA.LS.liveNotif, '1');
      AA.notif._startLiveWatcher();
      AA.showToast('Alerte live active (L–V, 8–18)', 'success');
      return true;
    }
    localStorage.setItem(AA.LS.liveNotif, '0');
    AA.notif._stopLiveWatcher();
    AA.showToast('Alerte live dezactivate', 'info');
    return true;
  };

  AA.notif.toggleHaptic = function (enabled) {
    AA.saveSettings({ hapticAlert: enabled ? '1' : '0' });
    if (enabled && navigator.vibrate) {
      navigator.vibrate(80);
      AA.showToast('Vibrație alertă activată', 'success');
    } else {
      AA.showToast('Vibrație alertă dezactivată', 'info');
    }
  };

  AA.notif.toggleSound = function (enabled) {
    AA.saveSettings({ soundAlert: enabled ? '1' : '0' });
    if (enabled) {
      AA.notif.playAlertSound(false);
      AA.showToast('Sunet alertă activat', 'success');
    } else {
      AA.showToast('Sunet alertă dezactivat', 'info');
    }
  };

  AA.notif._getAudio = function () {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
  };

  AA.notif.playAlertSound = function (urgent) {
    if (!AA.notif.isSoundEnabled()) return;
    const ctx = AA.notif._getAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    const playTone = function (freq, start, dur) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.05);
    };
    if (urgent) {
      playTone(880, 0, 0.12);
      playTone(660, 0.14, 0.12);
      playTone(880, 0.28, 0.18);
    } else {
      playTone(523, 0, 0.15);
      playTone(659, 0.18, 0.2);
    }
  };

  AA.notif.vibrateAlert = function (urgent) {
    if (!AA.notif.isHapticEnabled() || !navigator.vibrate) return;
    if (urgent) navigator.vibrate([120, 60, 120, 60, 200]);
    else navigator.vibrate([80, 40, 80]);
  };

  AA.notif.alertIfExpired = function (cars) {
    const agg = AA.aggregateAlerts(cars || {});
    if (!agg.expired) return;
    const key = AA.todayStr() + '_exp';
    if (sessionStorage.getItem('aa_exp_alert') === key) return;
    sessionStorage.setItem('aa_exp_alert', key);
    AA.notif.vibrateAlert(true);
    AA.notif.playAlertSound(true);
  };

  AA.notif._buildBody = function (agg) {
    const parts = [];
    if (agg.expired) parts.push(agg.expired + ' expirate');
    if (agg.urgent) parts.push(agg.urgent + ' urgente');
    if (agg.warning) parts.push(agg.warning + ' în curând');
    let body = parts.join(' · ');
    if (agg.items.length) {
      const top = agg.items.slice(0, 3).map(function (i) {
        return AA.formatPlate(i.plate) + ': ' + i.label;
      });
      body += '\n' + top.join('\n');
    }
    return body;
  };

  AA.notif._fireNotification = function (title, agg, tag, urgent) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    if (!agg.expired && !agg.urgent && !agg.warning) return false;

    if (urgent || agg.expired) {
      AA.notif.vibrateAlert(true);
      AA.notif.playAlertSound(true);
    } else if (agg.urgent) {
      AA.notif.vibrateAlert(false);
      AA.notif.playAlertSound(false);
    }

    new Notification(title, {
      body: AA.notif._buildBody(agg),
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: tag,
      data: { url: './index.html' }
    });
    return true;
  };

  AA.notif._checkWindow = function (slot, hourMin, hourMax, lsKey) {
    const h = new Date().getHours();
    if (h < hourMin || h > hourMax) return;
    const dayKey = AA.todayStr() + '_' + slot;
    if (localStorage.getItem(lsKey) === dayKey) return;
    const cars = (AA.fb.getState().cars) || {};
    const agg = AA.aggregateAlerts(cars);
    const title = slot === 'morning'
      ? 'AutoAlert — Reminder dimineață'
      : 'AutoAlert — Reminder seară';
    if (AA.notif._fireNotification(title, agg, 'aa-' + slot, agg.expired > 0)) {
      localStorage.setItem(lsKey, dayKey);
    }
  };

  AA.notif.checkMorning = function () {
    if (!AA.notif.isEnabled()) return;
    AA.notif._checkWindow('morning', 7, 10, AA.LS.morningNotifDay);
  };

  AA.notif.checkEvening = function () {
    if (!AA.notif.isEveningEnabled()) return;
    AA.notif._checkWindow('evening', 18, 20, AA.LS.eveningNotifDay);
  };

  AA.notif.checkLive = function () {
    if (!AA.notif.isLiveEnabled()) return;
    if (!AA.notif._isLiveWindow()) return;
    const cars = (AA.fb.getState().cars) || {};
    const agg = AA.aggregateAlerts(cars);
    if (!agg.expired && !agg.urgent) return;
    const key = AA.todayStr() + '_live_' + (agg.expired ? 'e' : 'u') + agg.expired + agg.urgent;
    if (localStorage.getItem(AA.LS.liveNotifStamp) === key) return;
    if (AA.notif._fireNotification('AutoAlert — Alertă activă', agg, 'aa-live', agg.expired > 0)) {
      localStorage.setItem(AA.LS.liveNotifStamp, key);
    }
  };

  AA.notif.checkCustomReminders = async function () {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const cars = (AA.fb.getState().cars) || {};
    const today = AA.todayStr();
    const now = new Date();
    const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    const carIds = Object.keys(cars);
    for (let ci = 0; ci < carIds.length; ci++) {
      const carId = carIds[ci];
      const car = cars[carId];
      const sids = Object.keys(car.services || {});
      for (let si = 0; si < sids.length; si++) {
        const sid = sids[si];
        const svc = car.services[sid];
        if (!svc.reminderAt) continue;
        if (svc.reminderFired === svc.reminderAt) continue;
        const localKey = 'aa_rem_fired_' + carId + '_' + sid;
        if (localStorage.getItem(localKey) === svc.reminderAt) continue;

        const parts = AA.splitReminderAt(svc.reminderAt);
        if (parts.date !== today || parts.time !== hm) continue;

        const meta = AA.SERVICE_TYPES[svc.type] || { label: svc.type };
        const d = AA.getServiceDetail(svc, car);
        let body = AA.formatPlate(car.plate) + ' · ' + meta.label;
        if (svc.reminderNote) body = svc.reminderNote + '\n' + body;
        body += '\n' + d.summary;

        new Notification('⏰ Reminder AutoAlert', {
          body: body,
          icon: './icon-192.png',
          badge: './icon-192.png',
          tag: 'aa-custom-' + carId + '-' + sid,
          data: { url: './index.html?action=km' }
        });
        AA.notif.vibrateAlert(d.status === 'expired');
        AA.notif.playAlertSound(d.status === 'expired' || d.status === 'urgent');

        localStorage.setItem(localKey, svc.reminderAt);
        if (AA.cars && AA.cars.updateService) {
          try {
            await AA.cars.updateService(carId, sid, { reminderFired: svc.reminderAt });
          } catch (_) { /* localStorage fallback */ }
        }
      }
    }
  };

  AA.notif._pingServiceWorker = function () {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: 'AA_CHECK_ALERTS' });
  };

  AA.notif._startLiveWatcher = function () {
    if (_liveInterval) return;
    AA.notif.checkLive();
    _liveInterval = setInterval(function () {
      AA.notif.checkLive();
      AA.notif._pingServiceWorker();
    }, 30 * 60 * 1000);
  };

  AA.notif._stopLiveWatcher = function () {
    if (_liveInterval) clearInterval(_liveInterval);
    _liveInterval = null;
  };

  AA.notif.startWatcher = function () {
    if (_interval) return;
    AA.notif.checkMorning();
    AA.notif.checkEvening();
    if (AA.notif.isLiveEnabled()) AA.notif._startLiveWatcher();
    AA.notif.checkCustomReminders();
    if (!_customInterval) {
      _customInterval = setInterval(function () {
        AA.notif.checkCustomReminders();
      }, 60 * 1000);
    }
    _interval = setInterval(function () {
      AA.notif.checkMorning();
      AA.notif.checkEvening();
    }, 15 * 60 * 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        AA.notif.checkMorning();
        AA.notif.checkEvening();
        AA.notif.checkLive();
        AA.notif.checkCustomReminders();
      }
    });
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);