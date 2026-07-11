/* AutoAlert — SVG icons, avatars, countdown rings */
(function (global) {
  'use strict';

  const AA = global.AA || {};
  AA.icon = AA.icon || {};

  const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#14b8a6'];

  const PATHS = {
    itp: '<path d="M14 6h-4V4a2 2 0 012-2h4a2 2 0 012 2v2h2v2h-2v10a2 2 0 01-2 2H8a2 2 0 01-2-2V8H4V6h2V4a2 2 0 012-2h4a2 2 0 012 2v2zm-2 0V4h-4v2h4zM8 8v10h8V8H8z" transform="scale(1.1) translate(-1 -1)"/>',
    rca: '<path d="M12 2l7 4v6c0 5-3.5 9-7 10C8.5 21 5 17 5 12V6l7-4zm0 2.2L7 7.5V12c0 3.8 2.5 7.2 5 8.2 2.5-1 5-4.4 5-8.2V7.5L12 4.2z"/>',
    casco: '<path d="M12 2l8 5v7c0 4.5-3.2 8.5-8 9.5C7.2 22.5 4 18.5 4 14V7l8-5zm3 8l-5 5-2-2 1.4-1.4.6.6 3.6-3.6L15 10z"/>',
    rovigneta: '<path d="M3 12h18M5 8h14M7 16h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="2" fill="none"/>',
    taxa_pod: '<path d="M4 14h16M6 10h4v8H6zM14 10h4v8h-4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M2 18h20" stroke="currentColor" stroke-width="2"/>',
    ulei: '<ellipse cx="12" cy="14" rx="6" ry="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 7h6l1 4H8l1-4z" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    filtre: '<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    distributie: '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M14.3 14.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M14.3 9.7l2.8-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    revizie: '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    roata_iarna: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2" fill="none"/>',
    roata_vara: '<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M5 19l2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    home: '<path d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
    car: '<path d="M5 11l1.5-4h11L19 11M5 11v6h2v-2h10v2h2v-6M7 17a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zm10 0a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
    family: '<circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="17" cy="10" r="2.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 20c0-2.5 1.8-4.5 4-4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    wheel: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 3v18M3 12h18" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="3" r="1.5" fill="currentColor"/><circle cx="12" cy="21" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="21" cy="12" r="1.5" fill="currentColor"/>',
    check: '<path d="M5 12l4 4L19 7" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
  };

  AA.icon.render = function (type, size, cls) {
    size = size || 20;
    cls = cls || '';
    const path = PATHS[type] || PATHS.revizie;
    return '<svg class="aa-icon ' + (cls || '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
  };

  AA.icon.initials = function (name) {
    const parts = String(name || '?').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0][0] || '?').toUpperCase();
  };

  AA.icon.avatarColor = function (name) {
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return COLORS[Math.abs(h) % COLORS.length];
  };

  AA.icon.avatar = function (name, size) {
    size = size || 36;
    const ini = AA.escapeHtml(AA.icon.initials(name));
    const bg = AA.icon.avatarColor(name);
    return '<span class="avatar" style="width:' + size + 'px;height:' + size + 'px;background:' + bg + ';font-size:' + Math.round(size * 0.38) + 'px" title="' + AA.escapeHtml(name) + '">' + ini + '</span>';
  };

  AA.icon.ring = function (pct, status, label) {
    pct = pct == null ? 100 : Math.max(0, Math.min(100, pct));
    const r = 26;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    const display = label != null ? String(label) : Math.round(pct) + '%';
    return '<div class="countdown-ring status-' + (status || 'ok') + '">' +
      '<svg viewBox="0 0 64 64" width="64" height="64">' +
      '<circle class="ring-bg" cx="32" cy="32" r="' + r + '"/>' +
      '<circle class="ring-fg" cx="32" cy="32" r="' + r + '" stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '"/>' +
      '</svg>' +
      '<span class="ring-label">' + AA.escapeHtml(display) + '</span></div>';
  };

  AA.icon.ringLabel = function (service, car) {
    const meta = AA.SERVICE_TYPES[service.type] || {};
    const mode = service.mode || meta.mode || 'date';
    const today = AA.todayStr();
    if ((mode === 'date' || mode === 'both') && service.nextDate) {
      const d = AA.diffDays(today, service.nextDate);
      if (d < 0) return Math.abs(d) + 'z';
      if (d === 0) return 'Azi';
      return d + 'z';
    }
    if ((mode === 'mileage' || mode === 'both') && service.intervalKm && car && car.currentKm != null) {
      const km = (service.lastKm || 0) + service.intervalKm - car.currentKm;
      if (km <= 0) return '0';
      if (km >= 1000) return Math.round(km / 1000) + 'k';
      return String(km);
    }
    return '—';
  };

  global.AA = AA;
})(typeof window !== 'undefined' ? window : globalThis);