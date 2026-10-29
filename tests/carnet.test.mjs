// Motorul carnetului: rulează exact fișierele din aplicație, prin vm (ca scripts/push).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['js/aa-core.js', 'js/aa-alerts.js', 'js/aa-carnet.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const AA = globalThis.AA;
const TODAY = '2026-10-29';
const thisYear = new Date().getFullYear();

// ── Datele: luna adăugată se oprește la capătul lunii ──
test('31 ianuarie + 1 lună = ultima zi din februarie', () => {
  assert.equal(AA.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(AA.addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(AA.addMonths('2026-05-15', 6), '2026-11-15');
  assert.equal(AA.addMonths('2026-08-31', 6), '2027-02-28');
});

test('ITP: mașina de peste 12 ani merge la 1 an, cea nouă la 2 ani', () => {
  assert.equal(AA.defaultIntervalMonths('itp', { year: thisYear - 16 }), 12);
  assert.equal(AA.defaultIntervalMonths('itp', { year: thisYear - 5 }), 24);
  assert.equal(AA.defaultIntervalMonths('itp', {}), 24);
  assert.equal(AA.defaultIntervalMonths('rca', { year: thisYear - 16 }), 12);
});

// ── Termenul următor după „Făcut” ──
test('„Făcut” păstrează intervalul ales: RCA pe 6 luni rămâne 6 luni', () => {
  assert.equal(AA.carnet.nextDueDate({ type: 'rca', intervalMonths: 6 }, TODAY, {}), '2027-04-29');
});

test('rovinieta pe 30 de zile rămâne 30 de zile', () => {
  assert.equal(AA.carnet.nextDueDate({ type: 'rovigneta', intervalDays: 30 }, TODAY, {}), '2026-11-28');
});

test('ITP la mașina veche, fără interval scris: 12 luni', () => {
  assert.equal(AA.carnet.nextDueDate({ type: 'itp' }, TODAY, { year: thisYear - 16 }), '2027-10-29');
});

test('termen doar pe km: fără dată', () => {
  assert.equal(AA.carnet.nextDueDate({ type: 'ulei' }, TODAY, {}), null);
});

test('anvelopele de vară montate devreme sar la sezonul următor', () => {
  assert.equal(AA.carnet.nextDueDate({ type: 'roata_vara' }, '2026-03-25', {}), '2027-04-01');
  assert.equal(AA.carnet.nextDueDate({ type: 'roata_iarna' }, TODAY, {}), '2027-10-01');
  assert.equal(AA.carnet.nextDueDate({ type: 'roata_iarna' }, '2026-06-10', {}), '2026-10-01');
});

test('Valabil: se citește din termen și se scrie înapoi ca patch', () => {
  assert.equal(AA.carnet.validityOf({ type: 'rca', intervalMonths: 6 }, {}), 'm6');
  assert.equal(AA.carnet.validityOf({ type: 'rovigneta', intervalDays: 30 }, {}), 'd30');
  assert.equal(AA.carnet.validityOf({ type: 'rca' }, {}), 'm12');
  assert.equal(AA.carnet.validityOf({ type: 'ulei' }, {}), '');
  assert.deepEqual(AA.carnet.validityPatch('d30'), { intervalDays: 30, intervalMonths: null });
  assert.deepEqual(AA.carnet.validityPatch('m6'), { intervalMonths: 6, intervalDays: null });
  assert.deepEqual(AA.carnet.validityPatch(''), {});
  const opts = AA.carnet.validityOptions('rovigneta').map((o) => o.value);
  assert.ok(opts.includes('d30') && opts.includes('m12'));
});

// ── Intervenția: mai multe operații, termenele potrivite se resetează ──
function carWithTerms() {
  return {
    plate: 'B 123 ABC', currentKm: 90000,
    services: {
      s1: { type: 'ulei', mode: 'mileage', lastKm: 80000, intervalKm: 10000 },
      s2: { type: 'filtre', mode: 'mileage', lastKm: 75000, intervalKm: 15000 },
      s3: { type: 'itp', mode: 'date', nextDate: '2027-01-10' },
      s4: { type: 'placute', mode: 'mileage', lastKm: 50000, intervalKm: 40000 }
    }
  };
}

test('revizia cu ulei + filtru aer + plăcuțe resetează exact termenele lor', () => {
  const p = AA.carnet.planIntervention(carWithTerms(), {
    date: TODAY, km: '90100', cost: '1250', shop: 'Service Auto Ion',
    ops: { ulei: true, filtru_ulei: true, filtru_aer: true, placute_fata: true, necunoscut: true },
    other: 'Schimbat bec far stânga', notes: 'Următoarea la 100.000'
  });
  assert.deepEqual(Object.keys(p.serviceUpdates).sort(), ['s1', 's2', 's4']);
  assert.equal(p.serviceUpdates.s1.lastKm, 90100);
  assert.equal(p.serviceUpdates.s1.lastDate, TODAY);
  assert.deepEqual(p.resets, ['Schimb ulei', 'Filtre', 'Plăcuțe frână']);
  assert.equal(p.entry.type, 'interventie');
  assert.equal(p.entry.kind, 'interventie');
  assert.equal(p.entry.doneKm, 90100);
  assert.equal(p.entry.cost, 1250);
  assert.equal(p.entry.shop, 'Service Auto Ion');
  assert.deepEqual(p.entry.ops, { ulei: true, filtru_ulei: true, filtru_aer: true, placute_fata: true });
  assert.equal(p.entry.other, 'Schimbat bec far stânga');
});

test('intervenția goală nu se salvează', () => {
  assert.throws(() => AA.carnet.planIntervention(carWithTerms(), { date: TODAY, km: 1, ops: {} }), /Bifează/);
});

test('intervenția doar cu „altceva” e validă și nu resetează nimic', () => {
  const p = AA.carnet.planIntervention(carWithTerms(), { date: TODAY, km: 90000, ops: {}, other: 'Reparat ambreiaj' });
  assert.deepEqual(p.serviceUpdates, {});
  assert.equal(p.entry.other, 'Reparat ambreiaj');
});

test('termen pe dată resetat dintr-o intervenție primește data următoare', () => {
  const car = carWithTerms();
  car.services.s5 = { type: 'lichid_frana', mode: 'date', nextDate: '2026-11-01' };
  const p = AA.carnet.planIntervention(car, { date: TODAY, km: 90000, ops: { lichid_frana: true } });
  assert.equal(p.serviceUpdates.s5.nextDate, '2028-10-29');
});

// ── Kilometrii: cifra greșită se poate corecta, cu confirmare ──
test('km mai mici decât cei salvați cer confirmare, apoi se acceptă', () => {
  assert.deepEqual(AA.carnet.resolveKm(329000, 129000, false), { km: 129000, needsConfirm: true });
  assert.deepEqual(AA.carnet.resolveKm(329000, 129000, true), { km: 129000, needsConfirm: false });
  assert.deepEqual(AA.carnet.resolveKm(100000, 120000, false), { km: 120000, needsConfirm: false });
  assert.deepEqual(AA.carnet.resolveKm(0, 5000000, false), { km: 999999, needsConfirm: false });
  assert.throws(() => AA.carnet.resolveKm(1000, 'abc', false), /Km/);
});

// ── Anvelopele: vârsta din DOT și profilul ──
test('DOT 2318 = anvelope de ~8,4 ani: avertisment', () => {
  const s = AA.carnet.tireStatus({ season: 'iarna', dot: '2318', treadMm: 6 }, TODAY);
  assert.equal(s.status, 'warning');
  assert.equal(s.ageYears, 8.4);
  assert.match(s.text, /8,4 ani/);
});

test('peste 10 ani: urgent; profil sub 1,6 mm: ilegal', () => {
  assert.equal(AA.carnet.tireStatus({ season: 'vara', dot: '0115' }, TODAY).status, 'urgent');
  assert.equal(AA.carnet.tireStatus({ season: 'vara', dot: '4524', treadMm: 1.4 }, TODAY).status, 'expired');
});

test('profil sub 4 mm la iarnă, sub 3 mm la vară: avertisment', () => {
  assert.equal(AA.carnet.tireStatus({ season: 'iarna', dot: '4524', treadMm: 3.5 }, TODAY).status, 'warning');
  assert.equal(AA.carnet.tireStatus({ season: 'vara', dot: '4524', treadMm: 3.5 }, TODAY).status, 'ok');
  assert.equal(AA.carnet.tireStatus({ season: 'vara', dot: '', treadMm: null }, TODAY).status, 'ok');
  assert.equal(AA.carnet.tireStatus({ season: 'vara', dot: '99xx' }, TODAY).status, 'ok');
});

test('în alerte (push, bord) intră doar profilul setului MONTAT', () => {
  const car = { plate: 'B 1 AAA', currentKm: 1000, services: {}, tires: { t1: { season: 'iarna', dot: '4524', treadMm: 3.2, mounted: true } } };
  assert.equal(AA.getCarWorstStatus(car), 'warning');
  const agg = AA.aggregateAlerts({ c1: car });
  assert.equal(agg.warning, 1);
  assert.equal(agg.items[0].label, 'Anvelope iarnă');
  assert.match(agg.items[0].summary, /profil 3,2 mm/);
});

test('setul depozitat și vârsta singură nu dau alerte zilnice', () => {
  const stored = { plate: 'B 1 AAA', currentKm: 1000, services: {}, tires: { t1: { season: 'vara', dot: '1218', treadMm: 1.2, mounted: false } } };
  assert.equal(AA.getCarWorstStatus(stored), 'ok');
  assert.equal(AA.aggregateAlerts({ c1: stored }).items.length, 0);
  const oldMounted = { plate: 'B 1 AAA', currentKm: 1000, services: {}, tires: { t1: { season: 'vara', dot: '0115', treadMm: 6, mounted: true } } };
  assert.equal(AA.aggregateAlerts({ c1: oldMounted }).items.length, 0);
  // pe ecranul mașinii vârsta se vede în continuare
  assert.equal(AA.carnet.tireStatus(oldMounted.tires.t1, TODAY).status, 'urgent');
});

// ── Cheltuielile ──
test('cheltuieli: anul ăsta, anul trecut, pe categorii, la 100 km', () => {
  const car = {
    currentKm: 100000,
    history: {
      a: { type: 'rca', doneDate: '2026-03-01', cost: 1200, doneKm: 90000 },
      b: { type: 'interventie', doneDate: '2026-06-01', cost: 800.55, doneKm: 95000 },
      c: { type: 'anvelope', doneDate: '2026-10-20', cost: 150 },
      d: { type: 'ulei', doneDate: '2025-05-01', cost: 300, doneKm: 85000 }
    }
  };
  const s = AA.carnet.costSummary(car, TODAY);
  assert.equal(s.thisYear, 2150.55);
  assert.equal(s.lastYear, 300);
  assert.deepEqual(s.byCat, { documente: 1200, intretinere: 1100.55, anvelope: 150 });
  assert.equal(s.kmSpan, 15000);
  assert.equal(s.per100km, 16.3);
});

test('cheltuieli fără istorie: zero, fără cost la 100 km', () => {
  const s = AA.carnet.costSummary({ currentKm: 1000 }, TODAY);
  assert.equal(s.thisYear, 0);
  assert.equal(s.per100km, null);
});

// ── Eticheta din carnet ──
test('eticheta: termenele vechi după tip, intervențiile după operații', () => {
  assert.equal(AA.carnet.historyLabel({ type: 'ulei' }), 'Schimb ulei');
  assert.equal(AA.carnet.historyLabel({ type: 'interventie', ops: { ulei: true, bujii: true } }), 'Ulei motor, Bujii');
  assert.equal(AA.carnet.historyLabel({ type: 'interventie', ops: {}, other: 'Reparat ambreiaj' }), 'Reparat ambreiaj');
  assert.equal(AA.carnet.historyLabel({ type: 'anvelope', notes: 'x' }), 'Anvelope');
  assert.equal(AA.carnet.historyLabel({ type: 'ceva_vechi' }), 'ceva_vechi');
});

test('tipurile noi de termen există și au interval', () => {
  for (const k of ['placute', 'lichid_frana', 'antigel', 'baterie', 'ac', 'trusa', 'extinctor', 'impozit', 'permis']) {
    assert.ok(AA.SERVICE_TYPES[k], k);
    assert.ok(AA.defaultService(k), k);
  }
  assert.equal(AA.defaultService('placute').intervalKm, 40000);
});

// ── „Făcut” pe un termen ──
test('„Făcut” pe RCA de 6 luni: termen nou +6 luni, cu notă în istoric', () => {
  const car = { currentKm: 50000, services: { s: { type: 'rca', mode: 'date', intervalMonths: 6, nextDate: TODAY } } };
  const p = AA.carnet.planDone(car, 's', { date: TODAY, km: '50000', cost: '640', notes: 'Allianz', nextDate: '' });
  assert.equal(p.updates.nextDate, '2027-04-29');
  assert.equal(p.updates.lastDate, TODAY);
  assert.equal(p.entry.type, 'rca');
  assert.equal(p.entry.cost, 640);
  assert.equal(p.entry.notes, 'Allianz');
  assert.equal(p.entry.serviceId, 's');
});

test('„Făcut” cu Valabil schimbat și termen scris de mână', () => {
  const car = { currentKm: 50000, services: { s: { type: 'rca', mode: 'date', intervalMonths: 6 } } };
  const a = AA.carnet.planDone(car, 's', { date: TODAY, validity: 'm12' });
  assert.equal(a.updates.intervalMonths, null, 'RCA pe 1 an = implicitul: intervalul salvat se șterge');
  assert.equal(a.updates.nextDate, '2027-10-29');
  const b = AA.carnet.planDone(car, 's', { date: TODAY, nextDate: '2027-05-01' });
  assert.equal(b.updates.nextDate, '2027-05-01');
});

test('„Făcut” pe ulei: km din fereastră devin număr', () => {
  const car = { currentKm: 50000, services: { s: { type: 'ulei', mode: 'mileage', lastKm: 40000, intervalKm: 10000 } } };
  const p = AA.carnet.planDone(car, 's', { date: TODAY, km: '50100' });
  assert.equal(p.updates.lastKm, 50100);
  assert.equal(p.updates.nextDate, undefined);
  assert.equal(p.entry.doneKm, 50100);
});

// ── Revizia de cod: istoricul vechi nu strică termenele mai noi ──
function carDoneRecently() {
  return {
    currentKm: 100000, year: 2015,
    services: {
      r: { type: 'revizie', mode: 'both', lastDate: '2026-08-29', nextDate: '2027-08-29', lastKm: 98000, intervalKm: 15000, createdAt: Date.parse('2025-01-10T10:00:00') },
      u: { type: 'ulei', mode: 'mileage', lastKm: 98000, intervalKm: 10000, lastDate: '2026-08-29', createdAt: Date.parse('2025-01-10T10:00:00') },
      b: { type: 'baterie', mode: 'date', lastDate: '2026-01-05', nextDate: '2030-01-05', createdAt: Date.parse('2025-01-10T10:00:00') }
    },
    history: { h: { type: 'interventie', ops: { revizie: true, ulei: true }, doneDate: '2026-08-29', doneKm: 98000 } }
  };
}

test('intervenția din 2023 trecută în carnet NU resetează termenele mai noi', () => {
  const p = AA.carnet.planIntervention(carDoneRecently(), { date: '2023-05-10', km: 110000 - 30000, ops: { revizie: true, ulei: true, baterie: true } });
  assert.deepEqual(p.serviceUpdates, {});
  assert.deepEqual(p.skipped, ['Revizie', 'Schimb ulei', 'Baterie']);
  assert.equal(p.entry.doneDate, '2023-05-10');
});

test('ultimul schimb de ulei trecut după ce termenul a fost creat azi îl actualizează', () => {
  const created = Date.parse(TODAY + 'T09:00:00');
  const car = { currentKm: 90000, services: { u: { type: 'ulei', mode: 'mileage', lastKm: 90000, intervalKm: 10000, lastDate: TODAY, createdAt: created } } };
  const p = AA.carnet.planIntervention(car, { date: '2026-09-15', km: 87000, ops: { ulei: true } });
  assert.equal(p.serviceUpdates.u.lastKm, 87000);
});

test('Valabil pentru termenele vechi se deduce din ultima și următoarea dată', () => {
  assert.equal(AA.carnet.validityOf({ type: 'rca', lastDate: '2026-05-01', nextDate: '2026-11-01' }, {}), 'm6');
  assert.equal(AA.carnet.validityOf({ type: 'rovigneta', lastDate: '2026-10-20', nextDate: '2026-11-19' }, {}), 'd30');
  assert.equal(AA.carnet.validityOf({ type: 'rca', lastDate: '2026-10-29', nextDate: '2027-03-14' }, {}), 'm12');
});

test('Valabil egal cu implicitul nu se scrie (ITP anual rămâne automat după 12 ani)', () => {
  const car = { year: 2020 };
  assert.deepEqual(AA.carnet.validityPatchFor({ type: 'itp' }, car, 'm24'), {});
  assert.deepEqual(AA.carnet.validityPatchFor({ type: 'itp', intervalMonths: 12 }, car, 'm24'), { intervalMonths: null, intervalDays: null });
  assert.deepEqual(AA.carnet.validityPatchFor({ type: 'rca' }, car, 'm6'), { intervalMonths: 6, intervalDays: null });
  const c = { currentKm: 50000, year: 2020, services: { s: { type: 'itp', mode: 'date', nextDate: TODAY } } };
  const p = AA.carnet.planDone(c, 's', { date: TODAY, validity: 'm24' });
  assert.equal(p.updates.intervalMonths, undefined);
  assert.equal(p.updates.nextDate, '2028-10-29');
});

test('km mai mari la intervenție ridică și km de la bord', () => {
  const car = { currentKm: 100000, services: {} };
  assert.equal(AA.carnet.planIntervention(car, { date: TODAY, km: 105000, other: 'x' }).carKm, 105000);
  assert.equal(AA.carnet.planIntervention(car, { date: TODAY, km: 90000, other: 'x' }).carKm, null);
  const c2 = { currentKm: 100000, services: { s: { type: 'ulei', mode: 'mileage', lastKm: 90000, intervalKm: 10000 } } };
  assert.equal(AA.carnet.planDone(c2, 's', { date: TODAY, km: 105000 }).carKm, 105000);
});

test('Valabil gol nu dă „0 ani”', () => {
  assert.equal(AA.carnet.validityLabel(''), '');
});
