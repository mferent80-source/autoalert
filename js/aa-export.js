/* AutoAlert — PDF / print export */
(function (global) {
  'use strict';

  const AA = global.AA || {};
  AA.export = AA.export || {};

  function statusColor(st) {
    if (st === 'expired') return '#dc2626';
    if (st === 'urgent') return '#ea580c';
    if (st === 'warning') return '#ca8a04';
    return '#16a34a';
  }

  AA.export.buildReportHtml = function (st) {
    const family = st.family ? st.family.name : 'Familie';
    const date = AA.todayStr();
    const cars = st.cars || {};
    const ids = Object.keys(cars).sort(function (a, b) {
      return (cars[a].plate || '').localeCompare(cars[b].plate || '', 'ro');
    });

    let body = '';
    if (!ids.length) {
      body = '<p class="empty">Nicio mașină înregistrată.</p>';
    }

    ids.forEach(function (cid) {
      const car = cars[cid];
      const sids = AA.ui && AA.ui._sortServiceIds
        ? AA.ui._sortServiceIds(car)
        : Object.keys(car.services || {});

      let rows = '';
      sids.forEach(function (sid) {
        const svc = car.services[sid];
        const d = AA.getServiceDetail(svc, car);
        rows += '<tr>' +
          '<td><strong>' + AA.escapeHtml(d.label) + '</strong></td>' +
          '<td style="color:' + statusColor(d.status) + '">' + AA.escapeHtml(AA.STATUS_LABELS[d.status] || d.status) + '</td>' +
          '<td>' + AA.escapeHtml(d.summary) + '</td>' +
          '<td>' + AA.escapeHtml(svc.nextDate ? AA.formatDate(svc.nextDate) : '—') + '</td>' +
          '<td class="mono">' + (svc.intervalKm ? AA.formatKm((svc.lastKm || 0) + svc.intervalKm) : '—') + '</td>' +
          '</tr>';
      });

      if (!rows) {
        rows = '<tr><td colspan="5" class="empty">Niciun serviciu</td></tr>';
      }

      const hist = Object.keys(car.history || {}).sort(function (a, b) {
        return (car.history[b].createdAt || 0) - (car.history[a].createdAt || 0);
      }).slice(0, 5).map(function (hid) {
        const h = car.history[hid];
        const meta = AA.SERVICE_TYPES[h.type] || { label: h.type };
        return '<li>' + AA.formatDate(h.doneDate) + ' — ' + AA.escapeHtml(meta.label) +
          (h.doneKm != null ? ' · ' + AA.formatKm(h.doneKm) : '') + '</li>';
      }).join('');

      body += '<section class="car-block">' +
        '<h2>' + AA.escapeHtml(AA.formatPlate(car.plate) || '—') + '</h2>' +
        '<p class="sub">' + AA.escapeHtml(AA.formatCarLabel(car.brand, car.model, car.year)) +
        ' · Km: <span class="mono">' + AA.formatKm(car.currentKm) + '</span></p>' +
        '<table><thead><tr>' +
        '<th>Serviciu</th><th>Status</th><th>Detalii</th><th>Dată limită</th><th>Km țintă</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
        (hist ? '<p class="hist-title">Istoric recent</p><ul>' + hist + '</ul>' : '') +
        '</section>';
    });

    return '<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8">' +
      '<title>AutoAlert Raport ' + date + '</title>' +
      '<style>' +
      '@page { margin: 16mm; }' +
      'body { font-family: "Segoe UI", system-ui, sans-serif; color: #111; font-size: 12px; line-height: 1.45; }' +
      'header { border-bottom: 2px solid #f97316; padding-bottom: 10px; margin-bottom: 18px; }' +
      'h1 { margin: 0; font-size: 22px; }' +
      '.meta { color: #555; margin-top: 4px; }' +
      'h2 { margin: 0 0 4px; font-size: 16px; color: #ea580c; }' +
      '.sub { margin: 0 0 10px; color: #444; }' +
      '.car-block { break-inside: avoid; margin-bottom: 22px; }' +
      'table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }' +
      'th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }' +
      'th { background: #f5f5f5; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }' +
      '.mono { font-family: Consolas, monospace; }' +
      '.empty { color: #888; font-style: italic; }' +
      '.hist-title { font-weight: 600; margin: 8px 0 4px; }' +
      'ul { margin: 0; padding-left: 18px; }' +
      'footer { margin-top: 24px; font-size: 10px; color: #888; text-align: center; }' +
      '</style></head><body>' +
      '<header><h1>AutoAlert — Raport mentenanță</h1>' +
      '<p class="meta">' + AA.escapeHtml(family) + ' · Generat ' + AA.formatDate(date) + '</p></header>' +
      body +
      '<footer>AutoAlert v' + AA.APP_VERSION + ' · mferent80-source.github.io/autoalert</footer>' +
      '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>' +
      '</body></html>';
  };

  AA.export.pdfReport = function (st) {
    const html = AA.export.buildReportHtml(st);
    const w = window.open('', '_blank');
    if (!w) {
      AA.showToast('Permite popup-uri pentru export PDF', 'error');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    AA.showToast('Alege „Salvează ca PDF” în dialogul de print', 'info');
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);