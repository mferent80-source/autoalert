import test from 'node:test';
import assert from 'node:assert/strict';
import { planFamily } from './send-alerts.mjs';

const AA = globalThis.AA;
const at = (h, m) => { const d = new Date(); d.setHours(h, m || 0, 0, 0); return d; };

function family(extra) {
  const today = AA.todayStr();
  return Object.assign({
    cars: {
      c1: {
        plate: 'B 123 ABC', brand: 'Dacia', model: 'Logan', currentKm: 87200,
        services: {
          s1: { type: 'itp', mode: 'date', nextDate: AA.addDays(today, -3), warnDaysBefore: [30, 14, 7] },
          s2: { type: 'rca', mode: 'date', nextDate: AA.addDays(today, 200) }
        }
      }
    },
    push: { p1: { endpoint: 'https://fcm.googleapis.com/x', p256dh: 'k', auth: 'a', uid: 'u' } }
  }, extra || {});
}

test('rezumatul pleacă după 8:00 și se marchează pe ziua de azi', () => {
  const p = planFamily('f1', family(), at(8, 30));
  assert.equal(p.msgs.length, 1);
  assert.match(p.msgs[0].title, /1 expirat/);
  assert.match(p.msgs[0].body, /B 123 ABC · ITP/);
  assert.equal(p.msgs[0].urgent, true);
  assert.equal(p.marks['families/f1/pushLog/digest'], AA.todayStr());
});

test('înainte de 8:00 nu trimite rezumat', () => {
  assert.equal(planFamily('f1', family(), at(7, 30)).msgs.length, 0);
});

test('a doua rulare din aceeași zi nu repetă rezumatul', () => {
  const p = planFamily('f1', family({ pushLog: { digest: AA.todayStr() } }), at(12));
  assert.equal(p.msgs.length, 0);
});

test('fără nimic de semnalat: nu trimite, dar marchează ziua', () => {
  const f = family();
  delete f.cars.c1.services.s1;
  const p = planFamily('f1', f, at(9));
  assert.equal(p.msgs.length, 0);
  assert.equal(p.marks['families/f1/pushLog/digest'], AA.todayStr());
});

test('reminderul personalizat pleacă o singură dată, după ora lui', () => {
  const today = AA.todayStr();
  const f = family({ pushLog: { digest: today } });
  f.cars.c1.services.s2.reminderAt = today + 'T10:15';
  f.cars.c1.services.s2.reminderNote = 'Sună la asigurator';
  assert.equal(planFamily('f1', f, at(10, 0)).msgs.length, 0, 'încă nu e ora');
  const p = planFamily('f1', f, at(10, 30));
  assert.equal(p.msgs.length, 1);
  assert.match(p.msgs[0].title, /RCA · B 123 ABC/);
  assert.match(p.msgs[0].body, /Sună la asigurator/);
  assert.equal(p.marks['families/f1/cars/c1/services/s2/reminderPushed'], today + 'T10:15');
  f.cars.c1.services.s2.reminderPushed = today + 'T10:15';
  assert.equal(planFamily('f1', f, at(11)).msgs.length, 0, 'nu se repetă');
});

test('reminderul arătat deja de aplicație (reminderFired) nu se mai trimite', () => {
  const today = AA.todayStr();
  const f = family({ pushLog: { digest: today } });
  f.cars.c1.services.s2.reminderAt = today + 'T09:00';
  f.cars.c1.services.s2.reminderFired = today + 'T09:00';
  assert.equal(planFamily('f1', f, at(10)).msgs.length, 0);
});

test('reminderele mai vechi de o zi sunt ignorate', () => {
  const today = AA.todayStr();
  const f = family({ pushLog: { digest: today } });
  f.cars.c1.services.s2.reminderAt = AA.addDays(today, -5) + 'T09:00';
  assert.equal(planFamily('f1', f, at(10)).msgs.length, 0);
});

test('rezumatul cuprinde profilul tocit al setului montat (motorul carnetului e încărcat)', () => {
  const f = family();
  delete f.cars.c1.services.s1;
  f.cars.c1.tires = { t1: { season: 'iarna', dot: '4524', treadMm: 3, mounted: true }, t2: { season: 'vara', dot: '0115', treadMm: 1, mounted: false } };
  const p = planFamily('f1', f, at(9));
  assert.equal(p.msgs.length, 1);
  assert.match(p.msgs[0].body, /Anvelope iarnă/);
});
