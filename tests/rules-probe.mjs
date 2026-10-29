// Proba regulilor RTDB în emulator: scrierile noi din 1.7.0 trec ca membru, cele greșite sunt refuzate.
// Rulare: npx --yes firebase-tools@13 emulators:exec --only database --project autoalert-89b80 "node tests/rules-probe.mjs"
import fs from 'node:fs';

const NS = 'autoalert-89b80';
const HOST = 'http://127.0.0.1:' + (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':').pop();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
// Token de utilizator nesemnat (emulatorul îl acceptă doar prin &auth=; cu Bearer ar fi admin).
const userTok = (uid) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({
  sub: uid, user_id: uid, aud: NS, iss: 'https://securetoken.google.com/' + NS, iat: now, exp: now + 3600, auth_time: now
}) + '.';

async function req(method, path, body, uid) {
  const url = HOST + '/' + path + '.json?ns=' + NS + (uid ? '&auth=' + userTok(uid) : '');
  const r = await fetch(url, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: uid ? {} : { Authorization: 'Bearer owner' }
  });
  return r.status;
}

let fails = 0;
async function expect(name, status, want) {
  const ok = want === 'ok' ? status === 200 : status !== 200;
  if (!ok) fails++;
  console.log((ok ? 'OK   ' : 'GREȘ ') + name + ' → ' + status);
}

const rules = fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
await fetch(HOST + '/.settings/rules.json?ns=' + NS, { method: 'PUT', body: rules, headers: { Authorization: 'Bearer owner' } });

const F = 'families/f1';
await req('PUT', F, {
  name: 'Test', ownerUid: 'u1', inviteCode: 'ABC234', createdAt: 1,
  members: { u1: { role: 'owner', joinedAt: 1 } },
  cars: { c1: { plate: 'B 1 AAA', currentKm: 1000, services: { s1: { type: 'ulei', mode: 'mileage', lastKm: 0, intervalKm: 10000 } } } }
});

const C = F + '/cars/c1';
await expect('termen nou: plăcuțe', await req('PUT', C + '/services/s2', { type: 'placute', mode: 'mileage', lastKm: 1000, intervalKm: 40000 }, 'u1'), 'ok');
await expect('termen nou: impozit', await req('PUT', C + '/services/s3', { type: 'impozit', mode: 'date', nextDate: '2027-03-31' }, 'u1'), 'ok');
await expect('Valabil: intervalMonths', await req('PATCH', C + '/services/s3', { intervalMonths: 6, intervalDays: null }, 'u1'), 'ok');
await expect('Valabil: intervalDays', await req('PATCH', C + '/services/s3', { intervalDays: 30, intervalMonths: null }, 'u1'), 'ok');
await expect('intervenție cu operații', await req('PUT', C + '/history/h1', {
  type: 'interventie', kind: 'interventie', doneDate: '2026-10-29', doneKm: 1000, cost: 1250.5,
  notes: '', shop: 'Service Ion', other: 'Bec far', ops: { ulei: true, filtru_aer: true }, createdAt: 1
}, 'u1'), 'ok');
await expect('editare intervenție', await req('PATCH', C + '/history/h1', { cost: 1300, updatedAt: 2 }, 'u1'), 'ok');
await expect('schimb anvelope în istoric', await req('PUT', C + '/history/h2', { type: 'anvelope', doneDate: '2026-10-29', doneKm: 1000, cost: 0, notes: 'Montat setul de iarnă', createdAt: 1 }, 'u1'), 'ok');
await expect('set anvelope', await req('PUT', C + '/tires/t1', {
  season: 'iarna', brand: 'MICHELIN', size: '205/55 R16', dot: '2318', treadMm: 6.5, location: 'Hotel anvelope', mounted: true, notes: '', createdAt: 1, updatedAt: 1
}, 'u1'), 'ok');
await expect('montat alt set', await req('PATCH', C + '/tires/t1', { mounted: false, updatedAt: 2 }, 'u1'), 'ok');
await expect('km corectați în jos', await req('PATCH', C, { currentKm: 900, currentKmUpdatedAt: 2, updatedAt: 2, updatedBy: 'u1' }, 'u1'), 'ok');
await expect('șterge intrare din carnet', await req('DELETE', C + '/history/h2', undefined, 'u1'), 'ok');

await expect('REFUZ: sezon necunoscut', await req('PUT', C + '/tires/t2', { season: 'toamna' }, 'u1'), 'refuz');
await expect('REFUZ: câmp străin pe anvelope', await req('PATCH', C + '/tires/t1', { pret: 5 }, 'u1'), 'refuz');
await expect('REFUZ: operație ne-booleană', await req('PATCH', C + '/history/h1', { ops: { ulei: 'da' } }, 'u1'), 'refuz');
await expect('REFUZ: profil ca text', await req('PATCH', C + '/tires/t1', { treadMm: '6' }, 'u1'), 'refuz');
await expect('REFUZ: tip de termen inventat', await req('PUT', C + '/services/s9', { type: 'vopsea' }, 'u1'), 'refuz');
await expect('REFUZ: străin scrie anvelope', await req('PUT', C + '/tires/t3', { season: 'vara' }, 'u2'), 'refuz');

await expect('REFUZ: cheie cu ghilimele în carnet', await req('PUT', C + '/history/x%22%3E%3Cimg', { type: 'ulei', doneDate: '2026-10-29' }, 'u1'), 'refuz');
await expect('REFUZ: cheie cu ghilimele la anvelope', await req('PUT', C + '/tires/x%22onclick', { season: 'vara' }, 'u1'), 'refuz');
await expect('REFUZ: cheie cu ghilimele la termene', await req('PUT', C + '/services/x%22y', { type: 'itp' }, 'u1'), 'refuz');
await expect('cheie ca a aplicației (genId) trece', await req('PUT', C + '/history/mf1k2x9abc123', { type: 'ulei', doneDate: '2026-10-29' }, 'u1'), 'ok');

console.log(fails ? fails + ' GREȘITE' : 'toate probele regulilor trec');
process.exit(fails ? 1 : 0);
