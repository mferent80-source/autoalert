const CACHE_VERSION = 'v1.2.2';
const CACHE_SHELL = 'aa-shell-' + CACHE_VERSION;

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './version.json',
  './css/aa-v1.0.css',
  './js/aa-core.js',
  './js/aa-icons.js',
  './js/aa-alerts.js',
  './js/aa-firebase.js',
  './js/aa-cars.js',
  './js/aa-notifications.js',
  './js/aa-ui.js',
  './firebase-config.example.js'
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