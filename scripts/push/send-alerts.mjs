// AutoAlert — trimite alertele pe telefoane (Web Push), rulat de GitHub Actions la 30 de minute.
// Folosește ACELAȘI motor de alerte ca aplicația (js/aa-core.js + js/aa-alerts.js).
//
// Mediu: FIREBASE_SA (JSON cont de serviciu), VAPID_PRIVATE, TZ=Europe/Bucharest, DRY_RUN=1 (doar afișează).
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';
import webpush from 'web-push';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DB_URL = 'https://autoalert-89b80-default-rtdb.europe-west1.firebasedatabase.app';
const VAPID_PUBLIC = 'BFLq-xIuv3-E4Ue3HZN9b7y1B8w6nFQdtY3BFiVNnQyaLYNIDkZ6vpa6KwFxqGHbxGqDvS1QLsmosjQcuXS_NMo';
const APP_URL = 'https://mferent80-source.github.io/autoalert/';
const DRY = process.env.DRY_RUN === '1';
const DIGEST_FROM = 8;   // rezumatul pleacă la prima rulare după 8:00
const DIGEST_UNTIL = 21; // după 21:00 nu mai trezim pe nimeni cu rezumatul zilei

for (const f of ['js/aa-core.js', 'js/aa-alerts.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const AA = globalThis.AA;

function pad(n) { return String(n).padStart(2, '0'); }

export function buildDigest(agg) {
  const parts = [];
  if (agg.expired) parts.push(agg.expired + (agg.expired === 1 ? ' expirat' : ' expirate'));
  if (agg.urgent) parts.push(agg.urgent + (agg.urgent === 1 ? ' urgent' : ' urgente'));
  if (agg.warning) parts.push(agg.warning + ' în curând');
  const lines = agg.items.slice(0, 4).map(function (i) {
    return AA.formatPlate(i.plate) + ' · ' + i.label + ': ' + i.summary;
  });
  if (agg.items.length > 4) lines.push('și încă ' + (agg.items.length - 4));
  return {
    title: 'AutoAlert: ' + parts.join(', '),
    body: lines.join('\n'),
    tag: 'aa-digest',
    urgent: agg.expired > 0,
    url: './index.html'
  };
}

// Ce trebuie trimis unei familii acum. Întoarce mesajele și scrierile de marcaj.
export function planFamily(fid, fam, now) {
  const today = AA.todayStr();
  const nowStamp = today + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  const oldest = AA.addDays(today, -1);
  const msgs = [];
  const marks = {};
  const cars = fam.cars || {};

  const log = fam.pushLog || {};
  const h = now.getHours();
  if (h >= DIGEST_FROM && h < DIGEST_UNTIL && log.digest !== today) {
    const agg = AA.aggregateAlerts(cars);
    if (agg.expired || agg.urgent || agg.warning) msgs.push(buildDigest(agg));
    marks['families/' + fid + '/pushLog/digest'] = today;
  }

  Object.keys(cars).forEach(function (carId) {
    const car = cars[carId];
    Object.keys(car.services || {}).forEach(function (sid) {
      const svc = car.services[sid];
      const r = svc.reminderAt;
      if (!r || r.length < 16) return;
      if (svc.reminderPushed === r || svc.reminderFired === r) return;
      if (r > nowStamp) return;                 // încă nu e ora
      if (r.slice(0, 10) < oldest) return;      // prea vechi, nu mai deranjăm
      const meta = AA.SERVICE_TYPES[svc.type] || { label: svc.type };
      const d = AA.getServiceDetail(svc, car);
      const body = [svc.reminderNote, AA.formatPlate(car.plate) + ' · ' + meta.label, d.summary].filter(Boolean).join('\n');
      msgs.push({
        title: '⏰ ' + meta.label + ' · ' + AA.formatPlate(car.plate),
        body: body,
        tag: 'aa-rem-' + carId + '-' + sid,
        urgent: d.status === 'expired',
        url: './index.html'
      });
      marks['families/' + fid + '/cars/' + carId + '/services/' + sid + '/reminderPushed'] = r;
    });
  });
  return { msgs: msgs, marks: marks };
}

async function main() {
  if (!process.env.FIREBASE_SA) throw new Error('Lipsește FIREBASE_SA');
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)),
    databaseURL: DB_URL
  });
  if (!DRY) {
    if (!process.env.VAPID_PRIVATE) throw new Error('Lipsește VAPID_PRIVATE');
    webpush.setVapidDetails(APP_URL, VAPID_PUBLIC, process.env.VAPID_PRIVATE);
  }

  const db = admin.database();
  const fams = (await db.ref('families').get()).val() || {};
  const now = new Date();
  const updates = {};
  let sent = 0, failed = 0, dropped = 0;

  for (const fid of Object.keys(fams)) {
    const fam = fams[fid] || {};
    const subs = fam.push || {};
    const subIds = Object.keys(subs);
    if (!subIds.length) continue;
    const plan = planFamily(fid, fam, now);
    if (!plan.msgs.length) { Object.assign(updates, plan.marks); continue; }

    let okFam = 0;
    for (const m of plan.msgs) {
      for (const subId of subIds) {
        const s = subs[subId];
        if (!s || !s.endpoint) continue;
        if (DRY) { console.log('[probă]', fid.slice(0, 6), subId.slice(0, 6), m.title); okFam++; continue; }
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(m),
            { TTL: 12 * 3600, urgency: m.urgent ? 'high' : 'normal' }
          );
          sent++; okFam++;
        } catch (e) {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) {
            updates['families/' + fid + '/push/' + subId] = null; // telefonul s-a dezabonat
            dropped++;
          } else {
            failed++;
            console.warn('trimitere eșuată', fid.slice(0, 6), e && e.statusCode, e && e.body);
          }
        }
      }
    }
    // Marcajele se scriu doar dacă a ajuns măcar o notificare — altfel reîncercăm la următoarea rulare.
    if (okFam) Object.assign(updates, plan.marks);
  }

  if (!DRY && Object.keys(updates).length) await db.ref().update(updates);
  console.log('familii:', Object.keys(fams).length, '· trimise:', sent, '· eșuate:', failed, '· abonamente moarte:', dropped, DRY ? '· PROBĂ' : '');
  await admin.app().delete();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(function (e) { console.error(e); process.exit(1); });
}
