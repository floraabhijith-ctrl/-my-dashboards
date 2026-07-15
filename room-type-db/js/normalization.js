/* =========================================================================
 * normalization.js — field/value normalization, record keys, derived groups
 * Rules: PROJECT_CONTEXT.md §3, §5, §6–§8, §10, §11
 * ========================================================================= */
'use strict';

var Norm = (function () {

  function collapseSpaces(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function normalizeHeader(h) {
    return collapseSpaces(h).toLowerCase();
  }

  /* Map a raw header to a standard field name, or null when unknown. */
  function mapHeader(raw) {
    var key = normalizeHeader(raw);
    if (FIELD_ALIASES.hasOwnProperty(key)) return FIELD_ALIASES[key];
    return null;
  }

  function normalizeCode(v) {
    return collapseSpaces(v).toUpperCase();
  }

  function normalizeText(v) {
    return collapseSpaces(v);
  }

  /* Dates → 'YYYY-MM-DD' or '' when missing/invalid.
   * Accepts Date objects, Excel serials, and common string formats.
   * Excel serials interpreted with the 1900 system (SheetJS default). */
  function normalizeDate(v) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      /* Noon-shift + UTC getters: date-only cells arrive as midnight in either
       * UTC or local time depending on the producing library and timezone
       * (SheetJS lands seconds short of midnight in some zones). Shifting to
       * midday makes the calendar date unambiguous for any offset within ±12h. */
      var noon = new Date(v.getTime() + 12 * 3600000);
      return fmtYmd(noon.getUTCFullYear(), noon.getUTCMonth() + 1, noon.getUTCDate());
    }
    if (typeof v === 'number' && isFinite(v)) {
      // Excel serial date (1900 date system). 25569 = days between 1900-01-01 and 1970-01-01 (+1 for Excel's leap bug).
      var ms = Math.round((v - 25569) * 86400000);
      var d = new Date(ms);
      return fmtYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    var s = collapseSpaces(v);
    if (!s) return '';
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return fmtYmd(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) return fmtYmd(+m[3], +m[2], +m[1]); // DD/MM/YYYY (Dubai locale)
    var parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return fmtYmd(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
    }
    return '';
  }

  function fmtYmd(y, mo, d) {
    if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return String(y) + '-' + pad2(mo) + '-' + pad2(d);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* Times → minutes since midnight (0..1439) or null when invalid/missing.
   * Accepts 'HH:mm', 'HH:mm:ss', 'h:mm AM/PM', Excel time fractions, Date objects. */
  function normalizeTimeMinutes(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      return v.getHours() * 60 + v.getMinutes();
    }
    if (typeof v === 'number' && isFinite(v)) {
      var frac = v % 1;                       // works for both pure fractions and date-times
      if (v >= 0 && v < 1) frac = v;
      var mins = Math.round(frac * 1440);
      if (mins === 1440) mins = 0;
      return (mins >= 0 && mins < 1440) ? mins : null;
    }
    var s = collapseSpaces(v).toUpperCase();
    if (!s) return null;
    var m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/);
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (m[4] === 'PM' && h < 12) h += 12;
    if (m[4] === 'AM' && h === 12) h = 0;
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  function timeGroupFor(minutes) {
    if (minutes === null || minutes === undefined) return TIME_GROUP_UNKNOWN;
    for (var i = 0; i < TIME_GROUPS.length; i++) {
      if (minutes >= TIME_GROUPS[i].from && minutes <= TIME_GROUPS[i].to) return TIME_GROUPS[i].label;
    }
    return TIME_GROUP_UNKNOWN;
  }

  /* Numbers: blank stays null (blank !== 0 — PROJECT_INSTRUCTIONS rule 18/19). */
  function normalizeNumber(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = collapseSpaces(v).replace(/,/g, '');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  /* Phone normalization for key matching only (digits, keep leading +). */
  function normalizePhoneForKey(v) {
    var s = collapseSpaces(v);
    if (!s) return '';
    return s.replace(/[^\d+]/g, '');
  }

  function nullToken(v) {
    var s = collapseSpaces(v);
    return s === '' ? '~' : s;
  }

  /* -----------------------------------------------------------------
   * Record key — PROJECT_CONTEXT.md §5
   * ----------------------------------------------------------------- */
  function recordKey(rec) {
    var conf = collapseSpaces(rec['Confirmation Number']);
    if (conf !== '') {
      return [
        nullToken(normalizeCode(rec['Property'])),
        nullToken(rec['Business Date']),
        nullToken(conf.toUpperCase()),
        nullToken(rec['Room Number']),
        nullToken(normalizeCode(rec['Booked Room Type'])),
        nullToken(rec['Arrival Date']),
        nullToken(rec['Departure Date'])
      ].join('|');
    }
    return [
      'FB',
      nullToken(normalizeCode(rec['Property'])),
      nullToken(rec['Business Date']),
      nullToken(normalizeText(rec['Guest Name']).toUpperCase()),
      nullToken(normalizePhoneForKey(rec['Phone Number'])),
      nullToken(rec['Room Number']),
      nullToken(rec['Arrival Date']),
      nullToken(rec['Departure Date'])
    ].join('|');
  }

  /* Content signature to distinguish "identical duplicate" from "changed values". */
  function contentSignature(rec) {
    return FIELDS.map(function (f) {
      var v = rec[f];
      return v === null || v === undefined ? '' : String(v);
    }).join('');
  }

  /* -----------------------------------------------------------------
   * Row normalization: raw parsed row (already header-mapped) → record
   * ----------------------------------------------------------------- */
  function normalizeRecord(mappedRow) {
    var rec = {};
    FIELDS.forEach(function (f) {
      var v = mappedRow.hasOwnProperty(f) ? mappedRow[f] : null;
      if (f === 'Business Date' || f === 'Arrival Date' || f === 'Departure Date') {
        rec[f] = normalizeDate(v);
      } else if (f === 'Room Nights' || f === 'Arrival Rooms' || f === 'Departure Rooms' ||
                 f === 'Revenue' || f === 'Adults' || f === 'Children') {
        rec[f] = normalizeNumber(v);
      } else if (f === 'Arrival Time' || f === 'Departure Time') {
        // keep original text; minutes computed as derived
        rec[f] = v === null || v === undefined ? '' : collapseSpaces(v);
        rec[f + ' Minutes'] = normalizeTimeMinutes(v);
      } else if (TEXT_FIELDS.indexOf(f) !== -1) {
        rec[f] = f === 'Property' || f === 'Market Code' || f === 'Booked Room Type'
          ? normalizeCode(v) : normalizeText(v);
      } else {
        rec[f] = normalizeText(v);
      }
    });
    return rec;
  }

  /* -----------------------------------------------------------------
   * Derived groups — computed in memory on load (never persisted),
   * so mapping updates apply to historical data automatically.
   * ----------------------------------------------------------------- */
  function deriveGroups(rec) {
    var rt = normalizeCode(rec['Booked Room Type']);
    rec._rtg = rt === '' ? UNMAPPED : (ROOM_TYPE_GROUP_MAP[rt] || UNMAPPED);

    var mg = normalizeCode(rec['Market Group']);
    rec._seg = mg === '' ? UNMAPPED : (SEGGRP_MAP[mg] || UNMAPPED);

    var am = collapseSpaces(rec['Account Manager']).toUpperCase();
    if (am === '') {
      rec._amg = ACCOUNT_MANAGER_MAP.blankGroup;
    } else if (ACCOUNT_MANAGER_MAP.exact.hasOwnProperty(am)) {
      rec._amg = ACCOUNT_MANAGER_MAP.exact[am];
    } else {
      rec._amg = UNMAPPED;
      for (var i = 0; i < ACCOUNT_MANAGER_MAP.prefixes.length; i++) {
        if (am.indexOf(ACCOUNT_MANAGER_MAP.prefixes[i][0]) === 0) {
          rec._amg = ACCOUNT_MANAGER_MAP.prefixes[i][1];
          break;
        }
      }
    }

    rec._atg = timeGroupFor(rec['Arrival Time Minutes']);
    rec._dtg = timeGroupFor(rec['Departure Time Minutes']);

    // Occupancy Combination — dynamic from Adults + Children (§11)
    var a = rec['Adults'], c = rec['Children'];
    if (a === null || c === null || a < 0 || c < 0 || (a === 0 && c === 0) ||
        a !== Math.floor(a) || c !== Math.floor(c)) {
      rec._occ = 'Invalid';
    } else {
      var parts = [];
      if (a > 0) parts.push(a + (a === 1 ? ' Adult' : ' Adults'));
      if (c > 0) parts.push(c + (c === 1 ? ' Child' : ' Children'));
      rec._occ = parts.join(' + ');
    }

    // Valid Property + Room Type Group inventory combination? (§9)
    var inv = PHYSICAL_INVENTORY[rec['Property']];
    rec._validCombo = !!(inv && rec._rtg !== UNMAPPED && inv.hasOwnProperty(rec._rtg));

    // Precomputed date parts for fast filtering
    rec._bdMonth = rec['Business Date'] ? rec['Business Date'].substring(0, 7) : '';
    rec._adMonth = rec['Arrival Date'] ? rec['Arrival Date'].substring(0, 7) : '';
    rec._ddMonth = rec['Departure Date'] ? rec['Departure Date'].substring(0, 7) : '';
    return rec;
  }

  /* ISO week 'YYYY-Www' (Monday–Sunday) for a YYYY-MM-DD string. */
  function isoWeek(ymd) {
    if (!ymd) return '';
    var p = ymd.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var dayNum = (d.getUTCDay() + 6) % 7;      // Mon=0..Sun=6
    d.setUTCDate(d.getUTCDate() - dayNum + 3); // nearest Thursday
    var firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    var fDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - fDayNum + 3);
    var week = 1 + Math.round((d - firstThursday) / 604800000);
    return d.getUTCFullYear() + '-W' + pad2(week);
  }

  return {
    collapseSpaces: collapseSpaces,
    normalizeHeader: normalizeHeader,
    mapHeader: mapHeader,
    normalizeCode: normalizeCode,
    normalizeText: normalizeText,
    normalizeDate: normalizeDate,
    normalizeTimeMinutes: normalizeTimeMinutes,
    timeGroupFor: timeGroupFor,
    normalizeNumber: normalizeNumber,
    recordKey: recordKey,
    contentSignature: contentSignature,
    normalizeRecord: normalizeRecord,
    deriveGroups: deriveGroups,
    isoWeek: isoWeek,
    pad2: pad2
  };
})();
