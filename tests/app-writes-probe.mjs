// Scrierile ADEVĂRATE ale aplicației (js/aa-cars.js) trimise în emulatorul RTDB ca membru al familiei.
// Prinde ce a stricat „Făcut” în 1.6.1: o formă de date pe care regulile o refuză.
// Rulare: npx --yes firebase-tools@13 emulators:exec --only database --project autoalert-89b80 "node tests/app-writes-probe.mjs"
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['js/aa-core.js', 'js/aa-alerts.js', 'js/aa-carnet.js', 'js/aa-cars.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const AA = globalThis.AA;
const NS = 'autoalert-89b80';
const HOST = 'http://127.0.0.1:' + (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':').pop();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const tok = b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ sub: 'u1', user_id: 'u1', aud: NS, iss: 'https://securetoken.google.com/' + NS, iat: now, exp: now + 3600, auth_time: now }) + '.';
const FAM = 'families/f1/';

async function rest(method, p, body, asUser) {
  const r = await fetch(HOST + '/' + p + '.json?ns=' + NS + (asUser ? '&auth=' + tok : ''), {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: asUser ? {} : { Authorization: 'Bearer owner' }
  });
  return { status: r.status, body: await r.text() };
}

// AA.fb ca în aa-firebase.js (aceeași logică de updatedAt/updatedBy), dar prin REST ca utilizatorul u1.
let cars = {};
async function refresh() { cars = JSON.parse((await rest('GET', FAM + 'cars')).body) || {}; }
let lastStatus = 0;
AA.fb = {
  getState: () => ({ user: { uid: 'u1' }, cars: JSON.parse(JSON.stringify(cars)) }),
  _rtdbErr: (e) => e.message,
  updateFamilyData: async (p, data) => {
    const payload = Object.assign({}, data);
    const nested = /\/(services|history|tires)\//.test(p);
    payload.updatedAt = Date.now();
    if (!nested) payload.updatedBy = 'u1';
    const r = await rest('PATCH', FAM + p, AA.cleanRtdb(payload), true);
    lastStatus = r.status;
    if (r.status !== 200) throw new Error('refuzat ' + r.status + ' ' + r.body);
  },
  set: async (p, data) => { const r = await rest('PUT', FAM + p, AA.cleanRtdb(data), true); lastStatus = r.status; if (r.status !== 200) throw new Error('refuzat ' + r.status); },
  remove: async (p) => { const r = await rest('DELETE', FAM + p, undefined, true); lastStatus = r.status; if (r.status !== 200) throw new Error('refuzat ' + r.status); }
};

await fetch(HOST + '/.settings/rules.json?ns=' + NS, { method: 'PUT', body: fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8'), headers: { Authorization: 'Bearer owner' } });
await rest('PUT', 'families/f1', {
  name: 'Test', ownerUid: 'u1', inviteCode: 'ABC234', createdAt: 1,
  members: { u1: { role: 'owner', joinedAt: 1 } },
  cars: { c1: { plate: 'B 1 AAA', year: 2010, currentKm: 90000, services: {
    s1: { type: 'ulei', mode: 'mileage', lastKm: 80000, intervalKm: 10000 },
    s2: { type: 'rca', mode: 'date', nextDate: '2026-11-01', intervalMonths: 6 },
    s3: { type: 'roata_iarna', mode: 'date', nextDate: '2026-10-01', warnDaysBefore: [14] }
  } } }
});

let fails = 0;
async function step(name, fn, check) {
  try {
    await refresh();
    await fn();
    await refresh();
    const msg = check ? check() : '';
    if (msg) throw new Error(msg);
    console.log('OK   ' + name);
  } catch (e) {
    fails++;
    console.log('GREȘ ' + name + ' → ' + e.message);
  }
}
const c1 = () => cars.c1;
const histOf = (type) => Object.values(c1().history || {}).find((h) => h.type === type);

await step('termen nou din listă (plăcuțe)', () => AA.cars.addService('c1', 'placute'),
  () => Object.values(c1().services).some((s) => s.type === 'placute') ? '' : 'lipsește');
await step('termen nou ITP pe mașina din 2010 ⇒ peste 12 luni', () => AA.cars.addService('c1', 'itp'),
  () => { const s = Object.values(c1().services).find((x) => x.type === 'itp'); return s.nextDate === AA.addMonths(AA.todayStr(), 12) ? '' : 'nextDate ' + s.nextDate; });
await step('Făcut pe RCA (6 luni) cu notă și cost', () => AA.cars.markDone('c1', 's2', { date: '2026-10-29', km: '90000', cost: '640', notes: 'Allianz', validity: 'm6', nextDate: '' }),
  () => c1().services.s2.nextDate === '2027-04-29' && histOf('rca').notes === 'Allianz' ? '' : JSON.stringify(c1().services.s2));
await step('Valabil schimbat din editare (luni ⇒ zile)', () => AA.cars.updateService('c1', 's2', Object.assign({ notes: '' }, AA.carnet.validityPatch('d30'))),
  () => c1().services.s2.intervalDays === 30 && c1().services.s2.intervalMonths == null ? '' : JSON.stringify(c1().services.s2));
await step('intervenție: ulei + filtru aer + plăcuțe + altceva', () => AA.cars.addIntervention('c1', {
  date: '2026-10-29', km: '90100', cost: '1250,5'.replace(',', '.'), shop: 'Service Ion',
  ops: { ulei: true, filtru_aer: true, placute_fata: true }, other: 'Bec far', notes: 'ok'
}), () => c1().services.s1.lastKm === 90100 && histOf('interventie').ops.filtru_aer === true ? '' : 'nu s-a resetat uleiul');
await step('corectare intrare din carnet', async () => {
  const hid = Object.keys(c1().history).find((k) => c1().history[k].type === 'interventie');
  await AA.cars.updateHistory('c1', hid, { date: '2026-10-28', km: '90050', cost: '1300', shop: '', ops: { ulei: true }, other: '', notes: 'corectat' });
}, () => { const h = histOf('interventie'); return h.cost === 1300 && !h.shop && !h.ops.filtru_aer ? '' : JSON.stringify(h); });
let tid;
await step('set anvelope iarnă nou (profil cu virgulă)', async () => { tid = await AA.cars.saveTire('c1', null, { season: 'iarna', brand: 'nokian', size: '195/65 r15', dot: '2318', treadMm: '6,5', location: 'Hotel', mounted: false, notes: '' }); },
  () => c1().tires[tid].treadMm === 6.5 && c1().tires[tid].brand === 'NOKIAN' ? '' : JSON.stringify(c1().tires[tid]));
let tid2;
await step('set vară montat (fără profil)', async () => { tid2 = await AA.cars.saveTire('c1', null, { season: 'vara', brand: '', size: '', dot: '', treadMm: '', location: '', mounted: true, notes: '' }); },
  () => c1().tires[tid2].mounted === true ? '' : 'nemontat');
await step('Am montat iarna ⇒ vara demontată, termenul de iarnă bifat, urmă în carnet', () => AA.cars.mountTire('c1', tid, { date: '2026-10-29', km: '90200', cost: '' }),
  () => (c1().tires[tid].mounted && !c1().tires[tid2].mounted && c1().services.s3.nextDate === '2027-10-01' && histOf('anvelope')) ? '' : JSON.stringify(c1().services.s3));
await step('km corectați în jos (confirmat)', () => AA.cars.updateKm('c1', '85000', true), () => c1().currentKm === 85000 ? '' : 'km ' + c1().currentKm);
await step('km mai mici fără confirmare nu schimbă nimic', () => AA.cars.updateKm('c1', '1000', false), () => c1().currentKm === 85000 ? '' : 'km ' + c1().currentKm);
await step('șterge setul de anvelope', () => AA.cars.removeTire('c1', tid2), () => c1().tires[tid2] ? 'încă există' : '');
await step('șterge o intrare din carnet', () => AA.cars.removeHistory('c1', Object.keys(c1().history).find((k) => c1().history[k].type === 'anvelope')), () => histOf('anvelope') ? 'încă există' : '');

// Din revizia de cod
await step('intervenție din 2023 NU dă înapoi uleiul schimbat azi', () => AA.cars.addIntervention('c1', { date: '2023-05-10', km: '60000', ops: { ulei: true }, cost: '', other: '', notes: 'veche' }),
  () => c1().services.s1.lastKm === 90100 ? '' : 'lastKm ' + c1().services.s1.lastKm);
await step('km mai mari la intervenție ridică bordul', () => AA.cars.addIntervention('c1', { date: '2026-10-29', km: '91000', ops: {}, other: 'Bec', cost: '' }),
  () => c1().currentKm === 91000 ? '' : 'bord ' + c1().currentKm);
await step('corectare cu km gol nu pune km de azi', async () => {
  const hid = Object.keys(c1().history).find((k) => c1().history[k].notes === 'veche');
  await AA.cars.updateHistory('c1', hid, { date: '2023-05-10', km: '', cost: '90', ops: { ulei: true }, other: '', shop: '', notes: 'veche' });
}, () => { const h = Object.values(c1().history).find((x) => x.notes === 'veche'); return h.doneKm === 60000 && h.cost === 90 ? '' : JSON.stringify(h); });
await step('Făcut cu Valabil = implicitul șterge intervalul salvat', () => AA.cars.markDone('c1', 's2', { date: '2026-10-29', km: '91000', validity: 'm12' }),
  () => c1().services.s2.intervalDays == null && c1().services.s2.intervalMonths == null && c1().services.s2.nextDate === '2027-10-29' ? '' : JSON.stringify(c1().services.s2));

console.log(fails ? fails + ' GREȘITE' : 'toate scrierile aplicației trec de reguli');
process.exit(fails ? 1 : 0);
