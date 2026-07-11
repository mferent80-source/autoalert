const CACHE_VERSION = 'v1.7.2';
const CACHE_SHELL = 'aa-shell-' + CACHE_VERSION;

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './version.json',
  './css/aa-v1.0.css',
  './js/aa-core.js',
  './js/aa-icons.js',
  './js/aa-alerts.js',
  './js/aa-firebase.js',
  './js/aa-cars.js',
  './js/aa-notifications.js',
  './js/aa-export.js',
  './js/aa-ui.js',
  './firebase-config.example.js',
  './firebase-config.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_SHELL)
      .then(function (cache) { return cache.addAll(SHELL_URLS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_SHELL; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);

  if (url.pathname.startsWith('/__/auth/') ||
      url.hostname.includes('accounts.google.com') ||
      url.hostname.includes('securetoken.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('firebaseauth.com') ||
      url.hostname.includes('firebasedatabase.app') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE_SHELL).then(function (c) { c.put(e.request, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (r) { return r || caches.match('./index.html'); });
    })
  );
});

self.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'AA_CHECK_ALERTS') return;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clients) {
      clients.forEach(function (c) { c.postMessage({ type: 'AA_RUN_ALERT_CHECK' }); });
    })
  );
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) {
          list[i].navigate(target);
          return list[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('periodicsync', function (e) {
  if (e.tag === 'aa-alerts') {
    e.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(function (clients) {
        clients.forEach(function (c) { c.postMessage({ type: 'AA_RUN_ALERT_CHECK' }); });
      })
    );
  }
});

self.addEventListener('push', function (e) {
  var data = { title: 'AutoAlert', body: 'Ai alerte noi de verificat.' };
  try {
    if (e.data) data = Object.assign(data, e.data.json());
  } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: { url: './index.html' }
    })
  );
});