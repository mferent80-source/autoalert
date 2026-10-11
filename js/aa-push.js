/* AutoAlert — notificări pe telefon: afișare prin service worker + abonare Web Push */
(function (global) {
  'use strict';

  const AA = global.AA || {};
  AA.push = AA.push || {};

  // Cheia publică VAPID; perechea ei privată stă doar în secretul GitHub VAPID_PRIVATE.
  AA.push.VAPID_PUBLIC = 'BFLq-xIuv3-E4Ue3HZN9b7y1B8w6nFQdtY3BFiVNnQyaLYNIDkZ6vpa6KwFxqGHbxGqDvS1QLsmosjQcuXS_NMo';
  const LS_KEY = 'aa_push_on';

  AA.push.supported = function () {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  };

  AA.push.isOn = function () {
    return localStorage.getItem(LS_KEY) === '1' &&
      'Notification' in window && Notification.permission === 'granted';
  };

  AA.push._b64ToBytes = function (b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };

  AA.push._subId = async function (endpoint) {
    const data = new TextEncoder().encode(endpoint);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).slice(0, 12)
      .map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  };

  AA.push._reg = function () {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise(function (_, rej) { setTimeout(function () { rej(new Error('Service worker indisponibil')); }, 4000); })
    ]);
  };

  // Pe Android, `new Notification()` aruncă „Illegal constructor”; merge doar prin service worker.
  AA.push.show = async function (title, opts) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    opts = Object.assign({ icon: './icon-192.png', badge: './icon-192.png' }, opts || {});
    if ('serviceWorker' in navigator) {
      try {
        const reg = await AA.push._reg();
        await reg.showNotification(title, opts);
        return true;
      } catch (_) { /* încercăm varianta desktop */ }
    }
    try { new Notification(title, opts); return true; } catch (_) { return false; }
  };

  AA.push._save = async function (sub) {
    const j = sub.toJSON();
    const st = AA.fb.getState();
    if (!st.user || !st.familyId) throw new Error('Intră în cont și într-o familie mai întâi');
    const id = await AA.push._subId(j.endpoint);
    await AA.fb.set('push/' + id, {
      endpoint: j.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
      uid: st.user.uid,
      ua: String(navigator.userAgent || '').slice(0, 120),
      createdAt: Date.now()
    });
    return id;
  };

  AA.push.enable = async function () {
    if (!AA.push.supported()) {
      throw new Error('Browserul ăsta nu primește notificări. Pe Android deschide aplicația în Chrome și adaug-o pe ecranul principal.');
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      throw new Error('Notificările sunt blocate. Pornește-le din Chrome → Setări site → Notificări.');
    }
    const reg = await AA.push._reg();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: AA.push._b64ToBytes(AA.push.VAPID_PUBLIC)
      });
    }
    await AA.push._save(sub);
    localStorage.setItem(LS_KEY, '1');
    return true;
  };

  AA.push.disable = async function () {
    localStorage.setItem(LS_KEY, '0');
    if (!AA.push.supported()) return;
    const reg = await AA.push._reg();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const id = await AA.push._subId(sub.endpoint);
    try { await AA.fb.remove('push/' + id); } catch (_) { /* rămâne curățat de server la primul 410 */ }
    await sub.unsubscribe();
  };

  // La pornire: dacă alertele sunt pornite, ne asigurăm că abonamentul e tot în baza de date.
  AA.push.resync = async function (tries) {
    if (!AA.push.isOn() || !AA.push.supported()) return;
    const st = AA.fb.getState();
    if (!st.user || !st.familyId) {
      tries = tries || 0;
      if (tries < 6) setTimeout(function () { AA.push.resync(tries + 1); }, 5000);
      return;
    }
    try {
      const reg = await AA.push._reg();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: AA.push._b64ToBytes(AA.push.VAPID_PUBLIC)
        });
      }
      await AA.push._save(sub);
    } catch (e) {
      console.warn('push resync', e);
    }
  };

  AA.push.test = async function () {
    const ok = await AA.push.show('AutoAlert · probă', {
      body: 'Așa arată o alertă pe telefon. Dimineața primești termenele care se apropie.',
      tag: 'aa-test',
      data: { url: './index.html' }
    });
    if (!ok) throw new Error('Notificările nu sunt pornite pe dispozitivul ăsta');
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);
