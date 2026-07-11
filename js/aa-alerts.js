/* AutoAlert — alert engine */
(function (global) {
  'use strict';

  const AA = global.AA || {};

  AA.SERVICE_TYPES = {
    itp:          { label: 'ITP', icon: '🔧', mode: 'date',    warnDaysBefore: [30, 14, 7], intervalMonths: 24 },
    rca:          { label: 'RCA', icon: '🛡️', mode: 'date',    warnDaysBefore: [30, 14], intervalMonths: 12 },
    casco:        { label: 'CASCO', icon: '🛡️', mode: 'date',  warnDaysBefore: [30, 14], intervalMonths: 12 },
    rovigneta:    { label: 'Rovinietă', icon: '🛣️', mode: 'date', warnDaysBefore: [14, 7, 3], intervalMonths: 12 },
    taxa_pod:     { label: 'Taxă pod Fetești', icon: '🌉', mode: 'date', warnDaysBefore: [14, 7], intervalMonths: 12 },
    ulei:         { label: 'Schimb ulei', icon: '🛢️', mode: 'mileage', warnKmBefore: 1000, defaultIntervalKm: 10000 },
    filtre:       { label: 'Filtre', icon: '💨', mode: 'mileage', warnKmBefore: 500, defaultIntervalKm: 15000 },
    distributie:  { label: 'Distribuție', icon: '⚙️', mode: 'mileage', warnKmBefore: 2000, defaultIntervalKm: 90000 },
    revizie:      { label: 'Revizie', icon: '🔩', mode: 'both', warnDaysBefore: [30], warnKmBefore: 1000, defaultIntervalKm: 15000, intervalMonths: 12 },
    roata_iarna:  { label: 'Anvelope iarnă', icon: '❄️', mode: 'date', warnDaysBefore: [14], suggestMonth: 10, suggestDay: 1 },
    roata_vara:   { label: 'Anvelope vară', icon: '☀️', mode: 'date', warnDaysBefore: [14], suggestMonth: 4, suggestDay: 1 }
  };

  AA.STATUS_RANK = { expired: 0, urgent: 1, warning: 2, ok: 3 };

  AA.statusFromDate = function (daysLeft, warnDaysBefore) {
    if (daysLeft == null) return 'ok';
    const warns = (warnDaysBefore && warnDaysBefore.length) ? warnDaysBefore : [30, 14, 7];
    const minW = Math.min.apply(null, warns);
    const maxW = Math.max.apply(null, warns);
    if (daysLeft < 0) return 'expired';
    if (daysLeft <= minW) return 'urgent';
    if (daysLeft <= maxW) return 'warning';
    return 'ok';
  };

  AA.statusFromKm = function (kmLeft, warnKmBefore) {
    if (kmLeft == null) return 'ok';
    const w = warnKmBefore || 1000;
    if (kmLeft <= 0) return 'expired';
    if (kmLeft <= w) return 'urgent';
    if (kmLeft <= w * 2) return 'warning';
    return 'ok';
  };

  AA.getServiceStatus = function (service, car) {
    const meta = AA.SERVICE_TYPES[service.type] || {};
    const statuses = [];
    const today = AA.todayStr();
    const mode = service.mode || meta.mode || 'date';

    if ((mode === 'date' || mode === 'both') && service.nextDate) {
      const daysLeft = AA.diffDays(today, service.nextDate);
      statuses.push(AA.statusFromDate(daysLeft, service.warnDaysBefore || meta.warnDaysBefore));
    }

    if ((mode === 'mileage' || mode === 'both') && service.intervalKm && car && car.currentKm != null) {
      const lastKm = service.lastKm || 0;
      const kmLeft = (lastKm + service.intervalKm) - car.currentKm;
      statuses.push(AA.statusFromKm(kmLeft, service.warnKmBefore ?? meta.warnKmBefore));
    }

    if (!statuses.length) return 'ok';
    return AA.worstStatus(statuses);
  };

  AA.getServiceProgress = function (service, car) {
    const meta = AA.SERVICE_TYPES[service.type] || {};
    const mode = service.mode || meta.mode || 'date';
    const today = AA.todayStr();
    let pct = null;

    if ((mode === 'date' || mode === 'both') && service.nextDate) {
      const daysLeft = AA.diffDays(today, service.nextDate);
      const warns = service.warnDaysBefore || meta.warnDaysBefore || [30];
      const span = Math.max(Math.max.apply(null, warns), 30);
      pct = Math.max(0, Math.min(100, (daysLeft / span) * 100));
    } else if ((mode === 'mileage' || mode === 'both') && service.intervalKm && car && car.currentKm != null) {
      const kmLeft = (service.lastKm || 0) + service.intervalKm - car.currentKm;
      pct = Math.max(0, Math.min(100, (kmLeft / service.intervalKm) * 100));
    }
    return pct;
  };

  AA.getServiceDetail = function (service, car) {
    const meta = AA.SERVICE_TYPES[service.type] || { label: service.type, icon: '📋' };
    const today = AA.todayStr();
    const mode = service.mode || meta.mode || 'date';
    const status = AA.getServiceStatus(service, car);
    const parts = [];

    if ((mode === 'date' || mode === 'both') && service.nextDate) {
      const daysLeft = AA.diffDays(today, service.nextDate);
      if (daysLeft < 0) parts.push('Expirat acum ' + Math.abs(daysLeft) + ' zile');
      else if (daysLeft === 0) parts.push('Expiră azi');
      else parts.push('În ' + daysLeft + ' zile (' + AA.formatDate(service.nextDate) + ')');
    }

    if ((mode === 'mileage' || mode === 'both') && service.intervalKm && car && car.currentKm != null) {
      const kmLeft = (service.lastKm || 0) + service.intervalKm - car.currentKm;
      if (kmLeft <= 0) parts.push('Depășit cu ' + Math.abs(kmLeft).toLocaleString('ro-RO') + ' km');
      else parts.push(kmLeft.toLocaleString('ro-RO') + ' km rămași');
    }

    return {
      status: status,
      label: meta.label,
      icon: meta.icon,
      summary: parts.join(' · ') || 'Fără termen setat',
      progress: AA.getServiceProgress(service, car)
    };
  };

  AA.getCarWorstStatus = function (car) {
    const services = car.services || {};
    const list = Object.keys(services).map(function (k) { return services[k]; });
    if (!list.length) return 'ok';
    return AA.worstStatus(list.map(function (s) { return AA.getServiceStatus(s, car); }));
  };

  AA.aggregateAlerts = function (cars) {
    let expired = 0, urgent = 0, warning = 0;
    const items = [];
    Object.keys(cars || {}).forEach(function (carId) {
      const car = cars[carId];
      Object.keys(car.services || {}).forEach(function (sid) {
        const svc = car.services[sid];
        const st = AA.getServiceStatus(svc, car);
        if (st === 'expired') expired++;
        else if (st === 'urgent') urgent++;
        else if (st === 'warning') warning++;
        if (st !== 'ok') {
          const d = AA.getServiceDetail(svc, car);
          items.push({
            carId: carId,
            serviceId: sid,
            plate: car.plate,
            carLabel: (car.brand || '') + ' ' + (car.model || ''),
            status: st,
            summary: d.summary,
            label: d.label,
            icon: d.icon
          });
        }
      });
    });
    items.sort(function (a, b) {
      return (AA.STATUS_RANK[a.status] ?? 3) - (AA.STATUS_RANK[b.status] ?? 3);
    });
    return { expired: expired, urgent: urgent, warning: warning, items: items };
  };

  AA.defaultService = function (type) {
    const meta = AA.SERVICE_TYPES[type];
    if (!meta) return null;
    const today = AA.todayStr();
    const svc = {
      type: type,
      mode: meta.mode,
      lastDate: today,
      notes: '',
      cost: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (meta.mode === 'date' || meta.mode === 'both') {
      if (meta.intervalMonths) {
        svc.nextDate = AA.addMonths(today, meta.intervalMonths);
      } else if (meta.suggestMonth) {
        const y = new Date().getFullYear();
        const m = String(meta.suggestMonth).padStart(2, '0');
        const d = String(meta.suggestDay || 1).padStart(2, '0');
        svc.nextDate = y + '-' + m + '-' + d;
        if (AA.diffDays(today, svc.nextDate) < 0) {
          svc.nextDate = (y + 1) + '-' + m + '-' + d;
        }
      }
    }
    if (meta.mode === 'mileage' || meta.mode === 'both') {
      svc.lastKm = 0;
      svc.intervalKm = meta.defaultIntervalKm || 10000;
      if (meta.warnKmBefore != null) svc.warnKmBefore = meta.warnKmBefore;
    }
    return AA.cleanRtdb ? AA.cleanRtdb(svc) : svc;
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);