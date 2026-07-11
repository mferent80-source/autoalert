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
      plate: String(data.plate || '').trim().toUpperCase().slice(0, 10),
      brand: String(data.brand || '').trim().slice(0, 60),
      model: String(data.model || '').trim().slice(0, 60),
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
    if (patch.plate != null) allowed.plate = String(patch.plate).trim().toUpperCase().slice(0, 10);
    if (patch.brand != null) allowed.brand = String(patch.brand).trim().slice(0, 60);
    if (patch.model != null) allowed.model = String(patch.model).trim().slice(0, 60);
    if (patch.year != null) allowed.year = Number(patch.year);
    if (patch.color != null) allowed.color = String(patch.color).slice(0, 20);
    await AA.fb.updateFamilyData('cars/' + carId, allowed);
  };

  AA.cars.updateKm = async function (carId, km) {
    const val = Math.max(0, Math.min(999999, Number(km)));
    if (isNaN(val)) throw new Error('Km invalid');
    const state = AA.fb.getState();
    const car = state.cars[carId];
    const current = car ? car.currentKm : 0;
    const nextKm = Math.max(current, val);
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
    const svc = AA.defaultService(type);
    if (!svc) throw new Error('Tip serviciu invalid');
    const sid = AA.genId();
    const state = AA.fb.getState();
    const car = state.cars[carId];
    if (car && car.currentKm != null && (svc.mode === 'mileage' || svc.mode === 'both')) {
      svc.lastKm = car.currentKm;
    }
    try {
      await AA.fb.set('cars/' + carId + '/services/' + sid, svc);
    } catch (e) {
      throw new Error(AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message);
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

  AA.cars.markDone = async function (carId, sid, opts) {
    opts = opts || {};
    const state = AA.fb.getState();
    const car = state.cars[carId];
    const svc = car && car.services ? car.services[sid] : null;
    if (!svc) throw new Error('Serviciu negăsit');

    const today = opts.date || AA.todayStr();
    const km = opts.km != null ? opts.km : (car ? car.currentKm : 0);
    const meta = AA.SERVICE_TYPES[svc.type] || {};
    const histId = AA.genId();

    const updates = {
      lastDate: today,
      updatedAt: Date.now()
    };

    if (meta.intervalMonths) {
      updates.nextDate = AA.addMonths(today, meta.intervalMonths);
      updates.intervalDays = meta.intervalMonths * 30;
    } else if (meta.suggestMonth) {
      const parts = today.split('-').map(Number);
      let y = parts[0];
      if (parts[1] >= meta.suggestMonth) y++;
      updates.nextDate = y + '-' + String(meta.suggestMonth).padStart(2, '0') + '-' + String(meta.suggestDay || 1).padStart(2, '0');
    }

    if (svc.mode === 'mileage' || svc.mode === 'both' || meta.mode === 'mileage' || meta.mode === 'both') {
      updates.lastKm = km;
      if (!svc.intervalKm && meta.defaultIntervalKm) updates.intervalKm = meta.defaultIntervalKm;
    }

    try {
      await AA.fb.updateFamilyData('cars/' + carId + '/services/' + sid, updates);
      await AA.fb.set('cars/' + carId + '/history/' + histId, {
        serviceId: sid,
        type: svc.type,
        doneDate: today,
        doneKm: km,
        cost: Number(opts.cost) || 0,
        notes: String(opts.notes || '').slice(0, 500),
        doneBy: AA.fb.getState().user.uid,
        createdAt: Date.now()
      });
    } catch (e) {
      throw new Error(AA.fb._rtdbErr ? AA.fb._rtdbErr(e) : e.message);
    }
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);