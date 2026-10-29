/* AutoAlert — carnet de service: intervenții, termenul următor, anvelope, cheltuieli (logică pură) */
(function (global) {
  'use strict';

  const AA = global.AA || {};
  AA.carnet = AA.carnet || {};

  // Ce poate bifa omul într-o intervenție. Al treilea câmp = termenul care se resetează.
  AA.OPERATIONS = [
    { group: 'Revizie', items: [['revizie', 'Revizie completă', 'revizie']] },
    { group: 'Motor', items: [
      ['ulei', 'Ulei motor', 'ulei'], ['filtru_ulei', 'Filtru ulei'], ['filtru_aer', 'Filtru aer', 'filtre'],
      ['filtru_combustibil', 'Filtru combustibil', 'filtre'], ['bujii', 'Bujii'],
      ['distributie', 'Kit distribuție', 'distributie'], ['curea_accesorii', 'Curea accesorii']
    ] },
    { group: 'Frâne', items: [
      ['placute_fata', 'Plăcuțe față', 'placute'], ['placute_spate', 'Plăcuțe spate', 'placute'],
      ['discuri', 'Discuri frână'], ['lichid_frana', 'Lichid frână', 'lichid_frana']
    ] },
    { group: 'Climă și lichide', items: [
      ['filtru_polen', 'Filtru polen', 'filtre'], ['ac', 'Revizie AC', 'ac'], ['antigel', 'Antigel', 'antigel']
    ] },
    { group: 'Electric', items: [['baterie', 'Baterie', 'baterie'], ['becuri', 'Becuri'], ['stergatoare', 'Ștergătoare']] },
    { group: 'Rulare', items: [
      ['geometrie', 'Geometrie'], ['echilibrare', 'Echilibrare'], ['amortizoare', 'Amortizoare'], ['ambreiaj', 'Ambreiaj']
    ] }
  ];

  AA.carnet.opList = function () {
    const out = [];
    AA.OPERATIONS.forEach(function (g) {
      g.items.forEach(function (it) { out.push({ key: it[0], label: it[1], resets: it[2] || null, group: g.group }); });
    });
    return out;
  };

  AA.TIRE_SEASONS = {
    vara: { label: 'Anvelope vară', short: 'Vară', minMm: 3 },
    iarna: { label: 'Anvelope iarnă', short: 'Iarnă', minMm: 4 },
    all: { label: 'Anvelope all-season', short: 'All-season', minMm: 4 }
  };

  // 8,4 · 1.250 · 16,3 — cel mult o zecimală pe ecran.
  AA.fmt1 = function (n) {
    return Number(n || 0).toLocaleString('ro-RO', { maximumFractionDigits: 1 });
  };

  function round2(n) { return Math.round(n * 100) / 100; }

  function toKm(v, fallback) {
    if (v === '' || v == null) return fallback;
    const n = Number(v);
    if (isNaN(n)) return fallback;
    return Math.max(0, Math.min(999999, Math.round(n)));
  }

  function toCost(v) {
    const n = Number(v);
    if (v === '' || v == null || isNaN(n)) return 0;
    return round2(Math.max(0, Math.min(1000000, n)));
  }

  function svcMode(svc) {
    const meta = AA.SERVICE_TYPES[svc.type] || {};
    return svc.mode || meta.mode || 'date';
  }

  // ── Valabil: „m6” = 6 luni, „d30” = 30 de zile ──
  AA.carnet.validityLabel = function (v) {
    if (!v) return '';
    const n = Number(String(v).slice(1));
    if (v[0] === 'd') return n === 1 ? '1 zi' : n + (n >= 20 ? ' de zile' : ' zile');
    if (n % 12 === 0) return n === 12 ? '1 an' : (n / 12) + ' ani';
    return n === 1 ? '1 lună' : n + ' luni';
  };

  AA.carnet.validityOf = function (svc, car) {
    const meta = AA.SERVICE_TYPES[svc.type] || {};
    if (svcMode(svc) === 'mileage' || meta.suggestMonth) return '';
    if (svc.intervalDays > 0) return 'd' + svc.intervalDays;
    if (svc.intervalMonths > 0) return 'm' + svc.intervalMonths;
    // Termenele de dinainte de 1.7.0 n-aveau interval salvat: îl deducem din ultima → următoarea dată.
    if (svc.lastDate && svc.nextDate) {
      const hit = AA.carnet.validityOptions(svc.type).find(function (o) {
        const n = Number(o.value.slice(1));
        return (o.value[0] === 'd' ? AA.addDays(svc.lastDate, n) : AA.addMonths(svc.lastDate, n)) === svc.nextDate;
      });
      if (hit) return hit.value;
    }
    const m = AA.defaultIntervalMonths(svc.type, car);
    return m ? 'm' + m : '';
  };

  AA.carnet.validityPatch = function (v) {
    if (!v) return {};
    const n = Number(String(v).slice(1));
    if (!(n > 0)) return {};
    return v[0] === 'd' ? { intervalDays: n, intervalMonths: null } : { intervalMonths: n, intervalDays: null };
  };

  // Ce se scrie în termen pentru Valabil ales: implicitul tipului nu se scrie (rămâne automat).
  AA.carnet.validityPatchFor = function (svc, car, v) {
    if (!v) return {};
    const stored = svc.intervalDays > 0 || svc.intervalMonths > 0;
    const defM = AA.defaultIntervalMonths(svc.type, car);
    if (defM && v === 'm' + defM) return stored ? { intervalMonths: null, intervalDays: null } : {};
    return AA.carnet.validityPatch(v);
  };

  AA.carnet.validityOptions = function (type, current) {
    const meta = AA.SERVICE_TYPES[type] || {};
    const list = (meta.valid || ['m1', 'm3', 'm6', 'm12', 'm24']).slice();
    if (current && list.indexOf(current) < 0) list.push(current);
    return list.map(function (v) { return { value: v, label: AA.carnet.validityLabel(v) }; });
  };

  // Data următoare după „Făcut” la doneDate. null = termen doar pe km.
  AA.carnet.nextDueDate = function (svc, doneDate, car, validity) {
    const meta = AA.SERVICE_TYPES[svc.type] || {};
    if (svcMode(svc) === 'mileage') return null;
    const v = validity || '';
    if (v) {
      const n = Number(v.slice(1));
      return v[0] === 'd' ? AA.addDays(doneDate, n) : AA.addMonths(doneDate, n);
    }
    if (svc.intervalDays > 0) return AA.addDays(doneDate, svc.intervalDays);
    if (svc.intervalMonths > 0) return AA.addMonths(doneDate, svc.intervalMonths);
    if (meta.suggestMonth) {
      // Sezonul următor: prima dată de sezon care cade la cel puțin 90 de zile după ce s-a făcut.
      const from = AA.addDays(doneDate, 90);
      let y = Number(from.slice(0, 4));
      const md = String(meta.suggestMonth).padStart(2, '0') + '-' + String(meta.suggestDay || 1).padStart(2, '0');
      if (y + '-' + md < from) y++;
      return y + '-' + md;
    }
    const m = AA.defaultIntervalMonths(svc.type, car);
    return m ? AA.addMonths(doneDate, m) : null;
  };

  // Ce se scrie în termen după ce s-a făcut (comun pentru „Făcut” și pentru intervenții).
  function resetUpdates(svc, car, date, km, validity, nextDate) {
    const meta = AA.SERVICE_TYPES[svc.type] || {};
    const mode = svcMode(svc);
    const u = { lastDate: date, updatedAt: Date.now() };
    if (mode === 'date' || mode === 'both') {
      const nd = (nextDate && /^\d{4}-\d{2}-\d{2}$/.test(nextDate)) ? nextDate : AA.carnet.nextDueDate(svc, date, car, validity);
      if (nd) u.nextDate = nd;
      Object.assign(u, AA.carnet.validityPatchFor(svc, car, validity));
    }
    if (mode === 'mileage' || mode === 'both') {
      u.lastKm = km;
      if (!svc.intervalKm && meta.defaultIntervalKm) u.intervalKm = meta.defaultIntervalKm;
    }
    return u;
  }

  // „Făcut” pe un termen: opts = { date, km, cost, notes, validity, nextDate }
  AA.carnet.planDone = function (car, sid, opts) {
    opts = opts || {};
    const svc = car && car.services ? car.services[sid] : null;
    if (!svc) throw new Error('Termen negăsit');
    const date = opts.date || AA.todayStr();
    const km = toKm(opts.km, toKm(car.currentKm, 0));
    return {
      carKm: km > (Number(car.currentKm) || 0) ? km : null,
      updates: resetUpdates(svc, car, date, km, opts.validity || '', opts.nextDate || ''),
      entry: {
        serviceId: sid,
        type: svc.type,
        doneDate: date,
        doneKm: km,
        cost: toCost(opts.cost),
        notes: String(opts.notes || '').slice(0, 500),
        createdAt: Date.now()
      }
    };
  };

  // Intervenția: data = { date, km, cost, shop, ops: {cheie: true}, other, notes }
  AA.carnet.planIntervention = function (car, data) {
    data = data || {};
    const date = data.date || AA.todayStr();
    const km = toKm(data.km, toKm(car && car.currentKm, 0));
    const ops = {};
    const resetTypes = [];
    AA.carnet.opList().forEach(function (op) {
      if (!data.ops || !data.ops[op.key]) return;
      ops[op.key] = true;
      if (op.resets && resetTypes.indexOf(op.resets) < 0) resetTypes.push(op.resets);
    });
    const other = String(data.other || '').trim().slice(0, 200);
    if (!Object.keys(ops).length && !other) throw new Error('Bifează ce s-a făcut sau scrie la „Altceva”');

    const services = (car && car.services) || {};
    const serviceUpdates = {};
    const resets = [];
    const skipped = [];
    resetTypes.forEach(function (type) {
      Object.keys(services).forEach(function (sid) {
        if (services[sid].type !== type) return;
        const label = (AA.SERVICE_TYPES[type] || {}).label || type;
        // Istoric vechi trecut acum în carnet: termenul are deja ceva mai nou, nu-l dăm înapoi.
        const last = AA.carnet.lastDoneOf(car, sid);
        if (last && date < last) {
          if (skipped.indexOf(label) < 0) skipped.push(label);
          return;
        }
        serviceUpdates[sid] = resetUpdates(services[sid], car, date, km, '', '');
        if (resets.indexOf(label) < 0) resets.push(label);
      });
    });

    const entry = {
      type: 'interventie',
      kind: 'interventie',
      doneDate: date,
      doneKm: km,
      cost: toCost(data.cost),
      notes: String(data.notes || '').slice(0, 500),
      createdAt: Date.now()
    };
    if (Object.keys(ops).length) entry.ops = ops;
    if (other) entry.other = other;
    const shop = String(data.shop || '').trim().slice(0, 80);
    if (shop) entry.shop = shop;
    return {
      serviceUpdates: serviceUpdates, entry: entry, resets: resets, skipped: skipped,
      carKm: km > (Number(car && car.currentKm) || 0) ? km : null
    };
  };

  function localDay(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Cea mai nouă dată la care știm sigur că s-a făcut termenul: din carnet, sau din termenul
  // editat de mână (lastDate diferit de ziua creării, care e doar valoarea pusă implicit).
  AA.carnet.lastDoneOf = function (car, sid) {
    const svc = car.services[sid];
    let best = '';
    if (svc.lastDate && svc.createdAt && svc.lastDate !== localDay(svc.createdAt)) best = svc.lastDate;
    const resetsType = function (h) {
      return AA.carnet.opList().some(function (op) { return h.ops && h.ops[op.key] && op.resets === svc.type; });
    };
    Object.keys(car.history || {}).forEach(function (k) {
      const h = car.history[k];
      const hit = h.serviceId === sid || (!h.serviceId && h.type === svc.type) || (h.type === 'interventie' && resetsType(h));
      if (hit && h.doneDate && h.doneDate > best) best = h.doneDate;
    });
    return best || null;
  };

  // Ce scrie pe rândul din carnet.
  AA.carnet.historyLabel = function (h) {
    if (h.type === 'interventie') {
      const names = AA.carnet.opList().filter(function (op) { return h.ops && h.ops[op.key]; })
        .map(function (op) { return op.label; });
      if (h.other) names.push(h.other);
      return names.join(', ') || 'Intervenție';
    }
    if (h.type === 'anvelope') return 'Anvelope';
    const meta = AA.SERVICE_TYPES[h.type];
    return meta ? meta.label : String(h.type || '');
  };

  // Km la bord: mai puțini decât cei salvați ⇒ se cere confirmarea (corectarea unei greșeli).
  AA.carnet.resolveKm = function (current, value, allowLower) {
    const n = Number(value);
    if (value === '' || value == null || isNaN(n)) throw new Error('Km invalid');
    const km = Math.max(0, Math.min(999999, Math.round(n)));
    const cur = Number(current) || 0;
    if (km < cur && !allowLower) return { km: km, needsConfirm: true };
    return { km: km, needsConfirm: false };
  };

  // ── Anvelope: vârsta din DOT (SSAA = săptămâna, anul) și profilul ──
  AA.carnet.tireAge = function (dot, today) {
    if (!/^\d{4}$/.test(String(dot || ''))) return null;
    const week = Number(String(dot).slice(0, 2));
    const year = 2000 + Number(String(dot).slice(2));
    if (week < 1 || week > 53) return null;
    const made = AA.addDays(year + '-01-01', (week - 1) * 7);
    const days = AA.diffDays(made, today || AA.todayStr());
    if (days == null || days < 0) return null;
    return Math.round((days / 365.25) * 10) / 10;
  };

  AA.carnet.tireStatus = function (tire, today) {
    const season = AA.TIRE_SEASONS[tire.season] || AA.TIRE_SEASONS.vara;
    const age = AA.carnet.tireAge(tire.dot, today);
    const mm = (tire.treadMm === '' || tire.treadMm == null) ? null : Number(tire.treadMm);
    const parts = [];
    const statuses = [];
    if (age != null) {
      parts.push((age < 1 ? 'sub un an' : 'au ' + AA.fmt1(age) + ' ani') + ' (DOT ' + tire.dot + ')');
      statuses.push(age >= 10 ? 'urgent' : age >= 6 ? 'warning' : 'ok');
    }
    if (mm != null && !isNaN(mm)) {
      parts.push('profil ' + AA.fmt1(mm) + ' mm');
      statuses.push(mm < 1.6 ? 'expired' : mm < season.minMm ? 'warning' : 'ok');
    }
    const status = statuses.length ? AA.worstStatus(statuses) : 'ok';
    let hint = '';
    if (status === 'expired') hint = 'sub 1,6 mm — minimul legal';
    else if (mm != null && mm < season.minMm) hint = 'profil sub ' + season.minMm + ' mm';
    else if (age != null && age >= 6) hint = 'peste 6 ani — de verificat la service';
    return { status: status, ageYears: age, text: parts.join(' · ') || 'fără DOT și profil', hint: hint, label: season.label };
  };

  // Pentru alerte (push, bord): doar setul montat și doar profilul. Vârsta și seturile din
  // depozit se văd pe ecranul mașinii, fără notificări zilnice fără sfârșit.
  AA.carnet.tireAlertItems = function (car) {
    const out = [];
    const tires = (car && car.tires) || {};
    Object.keys(tires).forEach(function (tid) {
      const t = tires[tid];
      if (!t.mounted) return;
      out.push({ tid: tid, tire: t, st: AA.carnet.tireStatus({ season: t.season, treadMm: t.treadMm }) });
    });
    return out;
  };

  AA.carnet.tireItems = function (car, today) {
    const out = [];
    const tires = (car && car.tires) || {};
    Object.keys(tires).forEach(function (tid) {
      const s = AA.carnet.tireStatus(tires[tid], today);
      out.push({ tid: tid, tire: tires[tid], st: s });
    });
    return out;
  };

  // ── Cheltuieli ──
  AA.carnet.costCategory = function (type) {
    if (['itp', 'rca', 'casco', 'rovigneta', 'taxa_pod', 'impozit', 'permis'].indexOf(type) >= 0) return 'documente';
    if (['anvelope', 'roata_iarna', 'roata_vara'].indexOf(type) >= 0) return 'anvelope';
    return 'intretinere';
  };

  AA.carnet.costSummary = function (car, today) {
    today = today || AA.todayStr();
    const y = Number(today.slice(0, 4));
    const hist = (car && car.history) || {};
    const s = { thisYear: 0, lastYear: 0, total: 0, byCat: { documente: 0, intretinere: 0, anvelope: 0 }, kmSpan: 0, per100km: null };
    let minKm = null;
    Object.keys(hist).forEach(function (k) {
      const h = hist[k];
      const c = Number(h.cost) || 0;
      const hy = Number(String(h.doneDate || '').slice(0, 4));
      if (hy === y) s.thisYear += c;
      if (hy === y - 1) s.lastYear += c;
      s.total += c;
      s.byCat[AA.carnet.costCategory(h.type)] += c;
      if (h.doneKm > 0 && (minKm == null || h.doneKm < minKm)) minKm = h.doneKm;
    });
    s.thisYear = round2(s.thisYear);
    s.lastYear = round2(s.lastYear);
    s.total = round2(s.total);
    Object.keys(s.byCat).forEach(function (k) { s.byCat[k] = round2(s.byCat[k]); });
    if (minKm != null && car.currentKm > minKm) s.kmSpan = car.currentKm - minKm;
    if (s.kmSpan >= 1000 && s.total > 0) s.per100km = Math.round((s.total / (s.kmSpan / 100)) * 10) / 10;
    return s;
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);
