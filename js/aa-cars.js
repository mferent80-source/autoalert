/* AutoAlert — cars & services CRUD */
(function (global) {
  'use strict';

  const AA = global.AA || {};
  AA.cars = AA.cars || {};

  function numVal(v, fallback) {
    if (v === '' || v == null) return fallback;
    const n = Number(v);
    return isNaN(n) ? fallback : n;
  }

  AA.cars.add = async function (data) {
    const id = AA.genId();
    const car = {
      plate: AA.formatPlate(data.plate).slice(0, 10),
      brand: AA.formatCarField(data.brand).slice(0, 60),
      model: AA.formatCarField(data.model).slice(0, 60),
      year: Number(data.year) || new Date().getFullYear(),
      currentKm: Math.max(0, Math.min(999999, Number(data.currentKm) || 0)),
      currentKmUpdatedAt: Date.now(),
      color: String(data.color || '#f97316').slice(0, 20),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: AA.fb.getState().user.uid,
      services: {}
    };
    if (!car.plate) throw new Error('Numărul de înmatriculare e obligatoriu');
    await AA.fb.set('cars/' + id, car);
    return id;
  };

  AA.cars.update = async function (carId, patch) {
    const allowed = {};
    if (patch.plate != null) allowed.plate = AA.formatPlate(patch.plate).slice(0, 10);
    if (patch.brand != null) allowed.brand = AA.formatCarField(patch.brand).slice(0, 60);
    if (patch.model != null) allowed.model = AA.formatCarField(patch.model).slice(0, 60);
    if (patch.year != null && patch.year !== '') {
      const y = Math.round(Number(patch.year));
      if (!(y >= 1970 && y <= 2100)) throw new Error('Anul trebuie să fie între 1970 și 2100');
      allowed.year = y;
    }
    if (patch.color != null) allowed.color = String(patch.color).slice(0, 20);
    await AA.fb.updateFamilyData('cars/' + carId, allowed);
  };

  // allowLower: omul a confirmat că vrea să corecteze o cifră greșită în jos.
  AA.cars.updateKm = async function (carId, km, allowLower) {
    const state = AA.fb.getState();
    const car = state.cars[carId];
    const current = car ? car.currentKm : 0;
    const r = AA.carnet.resolveKm(current, km, !!allowLower);
    const nextKm = r.needsConfirm ? current : r.km;
    await AA.fb.updateFamilyData('cars/' + carId, {
      currentKm: nextKm,
      currentKmUpdatedAt: Date.now()
    });
    return nextKm;
  };

  AA.cars.remove = async function (carId) {
    await AA.fb.remove('cars/' + carId);
  };

  AA.cars.addService = async function (carId, type) {
    const meta = AA.SERVICE_TYPES[type];
    if (!meta) throw new Error('Tip serviciu invalid: ' + type);
    const svc = AA.defaultService(type);
    if (!svc) throw new Error('Tip serviciu invalid: ' + type);
    const sid = AA.genId();
    const state = AA.fb.getState();
    const car = state.cars[carId];
    if (!car) throw new Error('Mașină negăsită');
    if (car.currentKm != null && (svc.mode === 'mileage' || svc.mode === 'both')) {
      svc.lastKm = car.currentKm;
    }
    // ITP la mașina de peste 12 ani: primul termen la 1 an, nu la 2.
    const months = AA.defaultIntervalMonths(type, car);
    if (svc.nextDate && meta.intervalMonths && months !== meta.intervalMonths) {
      svc.nextDate = AA.addMonths(AA.todayStr(), months);
    }
    const payload = AA.cleanRtdb(svc);
    try {
      await AA.fb.set('cars/' + carId + '/services/' + sid, payload);
    } catch (e) {
      const err = AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : ((e && e.message) || 'Eroare Firebase');
      throw new Error(meta.label + ': ' + err);
    }
    return { sid: sid, svc: svc };
  };

  AA.cars.updateService = async function (carId, sid, patch) {
    const allowed = { updatedAt: Date.now() };
    if (patch.lastDate != null && patch.lastDate !== '') allowed.lastDate = String(patch.lastDate);
    if (patch.nextDate != null && patch.nextDate !== '') allowed.nextDate = String(patch.nextDate);
    if (patch.lastKm != null) allowed.lastKm = numVal(patch.lastKm, 0);
    if (patch.intervalKm != null && patch.intervalKm !== '') allowed.intervalKm = numVal(patch.intervalKm, 0);
    if (patch.warnKmBefore != null && patch.warnKmBefore !== '') allowed.warnKmBefore = numVal(patch.warnKmBefore, 0);
    if (patch.notes != null) allowed.notes = String(patch.notes).slice(0, 500);
    if (patch.cost != null && patch.cost !== '') allowed.cost = numVal(patch.cost, 0);
    if (patch.mode != null) allowed.mode = patch.mode;
    // Valabil: null șterge câmpul (se trece de la luni la zile sau invers).
    ['intervalMonths', 'intervalDays'].forEach(function (k) {
      if (patch[k] === null) allowed[k] = null;
      else if (patch[k] != null && patch[k] !== '') allowed[k] = numVal(patch[k], 0);
    });
    if (patch.reminderAt === null) {
      allowed.reminderAt = null;
      allowed.reminderFired = null;
    } else if (patch.reminderAt != null && patch.reminderAt !== '') {
      allowed.reminderAt = String(patch.reminderAt).slice(0, 16);
      allowed.reminderFired = null;
    }
    if (patch.reminderFired != null && patch.reminderFired !== '' && patch.reminderAt == null) {
      allowed.reminderFired = String(patch.reminderFired).slice(0, 16);
    }
    if (patch.reminderNote != null) allowed.reminderNote = String(patch.reminderNote).slice(0, 200);
    try {
      await AA.fb.updateFamilyData('cars/' + carId + '/services/' + sid, allowed);
    } catch (e) {
      throw new Error(AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message);
    }
  };

  AA.cars.removeService = async function (carId, sid) {
    try {
      await AA.fb.remove('cars/' + carId + '/services/' + sid);
    } catch (e) {
      throw new Error(AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message);
    }
  };

  // O singură scriere atomică pe mașină: câmpurile termenelor + intrarea din carnet (+ anvelope).
  AA.cars._commit = async function (carId, serviceUpdates, histId, entry, extra) {
    const flat = {};
    Object.keys(serviceUpdates || {}).forEach(function (sid) {
      const u = serviceUpdates[sid];
      Object.keys(u).forEach(function (k) {
        flat['services/' + sid + '/' + k] = u[k] === undefined ? null : u[k];
      });
    });
    if (histId && entry) flat['history/' + histId] = Object.assign({ doneBy: AA.fb.getState().user.uid }, entry);
    Object.assign(flat, extra || {});
    try {
      await AA.fb.updateFamilyData('cars/' + carId, flat);
    } catch (e) {
      throw new Error(AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message);
    }
  };

  // Km mai mari decât bordul, scriși la o intervenție, ridică și bordul (în aceeași scriere).
  function kmExtra(carKm) {
    return carKm ? { currentKm: carKm, currentKmUpdatedAt: Date.now() } : {};
  }

  function carOf(carId) {
    const car = AA.fb.getState().cars[carId];
    if (!car) throw new Error('Mașină negăsită');
    return car;
  }

  // opts = { date, km, cost, notes, validity, nextDate }
  AA.cars.markDone = async function (carId, sid, opts) {
    const car = carOf(carId);
    const plan = AA.carnet.planDone(car, sid, opts);
    const up = {};
    up[sid] = plan.updates;
    await AA.cars._commit(carId, up, AA.genId(), plan.entry, kmExtra(plan.carKm));
  };

  // Intervenție din carnet; întoarce { resets, skipped } (numele termenelor).
  AA.cars.addIntervention = async function (carId, data) {
    const car = carOf(carId);
    const plan = AA.carnet.planIntervention(car, data);
    await AA.cars._commit(carId, plan.serviceUpdates, AA.genId(), plan.entry, kmExtra(plan.carKm));
    return { resets: plan.resets, skipped: plan.skipped };
  };

  // Corectarea unei intrări din carnet. Termenele NU se mai schimbă.
  AA.cars.updateHistory = async function (carId, hid, data) {
    const car = carOf(carId);
    const h = car.history && car.history[hid];
    if (!h) throw new Error('Intrarea nu mai există');
    const patch = {
      doneDate: String(data.date || h.doneDate).slice(0, 12),
      cost: Math.max(0, Math.min(1000000, Math.round(numVal(data.cost, 0) * 100) / 100)),
      notes: String(data.notes || '').slice(0, 500)
    };
    // Km gol = nu se știe; nu punem pe tăcute km de azi pe o intrare veche.
    if (data.km !== '' && data.km != null) patch.doneKm = Math.max(0, Math.min(999999, Math.round(numVal(data.km, 0))));
    if (h.type === 'interventie') {
      const plan = AA.carnet.planIntervention(car, data);
      patch.ops = plan.entry.ops || null;
      patch.other = plan.entry.other || null;
      patch.shop = plan.entry.shop || null;
    }
    try {
      await AA.fb.updateFamilyData('cars/' + carId + '/history/' + hid, patch);
    } catch (e) {
      throw new Error(AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message);
    }
  };

  AA.cars.removeHistory = async function (carId, hid) {
    try {
      await AA.fb.remove('cars/' + carId + '/history/' + hid);
    } catch (e) {
      throw new Error(AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message);
    }
  };

  // ── Anvelope ──
  AA.cars.tirePayload = function (data) {
    const t = {
      season: AA.TIRE_SEASONS[data.season] ? data.season : 'vara',
      brand: AA.formatCarField(data.brand).slice(0, 60),
      size: String(data.size || '').trim().toUpperCase().slice(0, 30),
      dot: String(data.dot || '').replace(/\D/g, '').slice(0, 4),
      location: String(data.location || '').trim().slice(0, 80),
      notes: String(data.notes || '').trim().slice(0, 200),
      mounted: !!data.mounted,
      updatedAt: Date.now()
    };
    const mm = data.treadMm === '' || data.treadMm == null ? null : Number(String(data.treadMm).replace(',', '.'));
    t.treadMm = mm == null || isNaN(mm) ? null : Math.max(0, Math.min(20, Math.round(mm * 10) / 10));
    return t;
  };

  AA.cars.saveTire = async function (carId, tid, data) {
    const car = carOf(carId);
    const t = AA.cars.tirePayload(data);
    const id = tid || AA.genId();
    const extra = {};
    if (!tid) t.createdAt = Date.now();
    Object.keys(t).forEach(function (k) { extra['tires/' + id + '/' + k] = t[k]; });
    // Un singur set montat pe mașină.
    if (t.mounted) {
      Object.keys(car.tires || {}).forEach(function (other) {
        if (other !== id && car.tires[other].mounted) extra['tires/' + other + '/mounted'] = false;
      });
    }
    await AA.cars._commit(carId, {}, null, null, extra);
    return id;
  };

  AA.cars.removeTire = async function (carId, tid) {
    try {
      await AA.fb.remove('cars/' + carId + '/tires/' + tid);
    } catch (e) {
      throw new Error(AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message);
    }
  };

  // „Am montat setul”: celelalte se demontează, termenul sezonului se bifează, rămâne o urmă în carnet.
  AA.cars.mountTire = async function (carId, tid, opts) {
    opts = opts || {};
    const car = carOf(carId);
    const tire = car.tires && car.tires[tid];
    if (!tire) throw new Error('Setul nu mai există');
    const date = opts.date || AA.todayStr();
    const km = Math.max(0, Math.min(999999, Math.round(numVal(opts.km, car.currentKm || 0))));
    const extra = kmExtra(km > (Number(car.currentKm) || 0) ? km : null);
    Object.keys(car.tires).forEach(function (other) {
      extra['tires/' + other + '/mounted'] = other === tid;
    });
    const termType = tire.season === 'iarna' ? 'roata_iarna' : (tire.season === 'vara' ? 'roata_vara' : null);
    const serviceUpdates = {};
    Object.keys(car.services || {}).forEach(function (sid) {
      if (termType && car.services[sid].type === termType) {
        serviceUpdates[sid] = AA.carnet.planDone(car, sid, { date: date, km: km }).updates;
      }
    });
    const season = AA.TIRE_SEASONS[tire.season] || AA.TIRE_SEASONS.vara;
    const what = [tire.brand, tire.size].filter(Boolean).join(' ');
    const entry = {
      type: 'anvelope',
      doneDate: date,
      doneKm: km,
      cost: Math.max(0, Math.min(1000000, numVal(opts.cost, 0))),
      notes: ('Montat setul ' + season.short.toLowerCase() + (what ? ' (' + what + ')' : '')).slice(0, 500),
      createdAt: Date.now()
    };
    await AA.cars._commit(carId, serviceUpdates, AA.genId(), entry, extra);
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);