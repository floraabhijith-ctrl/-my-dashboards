/* =========================================================================
 * calculations.js — date spine, core metrics, occupancy, shares, weighted
 * times, peak groups, occupancy combinations, TY/LY comparison engine.
 * Rules: PROJECT_CONTEXT.md §4, §9–§14. All functions take pre-filtered
 * record arrays; filtering itself lives in filters.js.
 * ========================================================================= */
'use strict';

var Calc = (function () {

  /* ---------- basic sums (never row counts) ---------- */
  function sumField(records, field) {
    var s = 0;
    for (var i = 0; i < records.length; i++) {
      var v = records[i][field];
      if (v !== null && v !== undefined) s += v;
    }
    return s;
  }
  function calculateArrivalRooms(records) { return sumField(records, 'Arrival Rooms'); }
  function calculateDepartureRooms(records) { return sumField(records, 'Departure Rooms'); }
  function calculateRoomNightsSold(records) { return sumField(records, 'Room Nights'); }

  /* ---------- shares ---------- */
  function share(part, total) {
    if (!total || total <= 0) return null; // N/A
    return (part / total) * 100;
  }
  var calculateArrivalShare = share, calculateDepartureShare = share, calculateRoomNightShare = share;

  /* ---------- date spine ---------- */
  /* All calendar dates in [fromYmd, toYmd] inclusive, as YYYY-MM-DD strings. */
  function dateSpine(fromYmd, toYmd) {
    var out = [];
    if (!fromYmd || !toYmd || fromYmd > toYmd) return out;
    var p = fromYmd.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var end = toYmd;
    for (;;) {
      var ymd = d.getUTCFullYear() + '-' + Norm.pad2(d.getUTCMonth() + 1) + '-' + Norm.pad2(d.getUTCDate());
      if (ymd > end) break;
      out.push(ymd);
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }

  /* Occupancy denominator dates for a period, capped at the latest loaded
   * Business Date — future dates never enter denominators (§13). */
  function includedDates(fromYmd, toYmd, latestBusinessDate) {
    var to = toYmd;
    if (latestBusinessDate && latestBusinessDate < to) to = latestBusinessDate;
    return dateSpine(fromYmd, to);
  }

  /* ---------- occupancy ---------- */
  function calculateAvailableRoomNights(property, rtg, nDates) {
    var inv = PHYSICAL_INVENTORY[property];
    if (!inv || !inv.hasOwnProperty(rtg)) return null; // invalid combination
    return inv[rtg] * nDates;
  }

  /* Multi-property / multi-group occupancy: sum sold and available across
   * every VALID Property+RTG combination, then divide (§9, §12).
   * records must already be filtered to the period on Business Date.
   * combos: [{property, rtg}] — the valid combinations in scope.
   * nDates: number of included calendar dates. */
  function calculateOccupancy(records, combos, nDates) {
    if (!nDates || nDates <= 0 || !combos.length) return { pct: null, sold: 0, available: 0 };
    var soldByCombo = {};
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!r._validCombo) continue;
      var k = r['Property'] + '|' + r._rtg;
      var rn = r['Room Nights'];
      if (rn !== null && rn !== undefined) soldByCombo[k] = (soldByCombo[k] || 0) + rn;
    }
    var sold = 0, available = 0;
    combos.forEach(function (c) {
      var avail = calculateAvailableRoomNights(c.property, c.rtg, nDates);
      if (avail === null) return; // invalid combination — excluded, surfaced in Data Quality
      available += avail;
      sold += soldByCombo[c.property + '|' + c.rtg] || 0;
    });
    if (available <= 0) return { pct: null, sold: sold, available: 0 };
    return { pct: (sold / available) * 100, sold: sold, available: available };
  }

  /* All valid combos for the given property list (or all properties). */
  function validCombos(properties, rtgs) {
    var out = [];
    var props = properties && properties.length ? properties : Object.keys(PHYSICAL_INVENTORY);
    props.forEach(function (p) {
      var inv = PHYSICAL_INVENTORY[p];
      if (!inv) return;
      Object.keys(inv).forEach(function (g) {
        if (rtgs && rtgs.length && rtgs.indexOf(g) === -1) return;
        out.push({ property: p, rtg: g, rooms: inv[g] });
      });
    });
    return out;
  }

  /* ---------- weighted times & peaks ---------- */
  function calculateWeightedTime(records, minutesField, roomsField) {
    var num = 0, den = 0;
    for (var i = 0; i < records.length; i++) {
      var m = records[i][minutesField];
      var w = records[i][roomsField];
      if (m === null || m === undefined || w === null || w === undefined || w <= 0) continue;
      num += m * w;
      den += w;
    }
    if (den <= 0) return null;
    return num / den; // minutes since midnight
  }
  function calculateWeightedArrivalTime(records) {
    return calculateWeightedTime(records, 'Arrival Time Minutes', 'Arrival Rooms');
  }
  function calculateWeightedDepartureTime(records) {
    return calculateWeightedTime(records, 'Departure Time Minutes', 'Departure Rooms');
  }

  function formatMinutes(mins) {
    if (mins === null || mins === undefined) return 'N/A';
    var h = Math.floor(mins / 60), m = Math.round(mins % 60);
    if (m === 60) { h += 1; m = 0; }
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + Norm.pad2(m) + ' ' + ampm;
  }

  /* Sum rooms per time group. Invalid times go to Unknown but can never be
   * the peak (§10). Ties return every tied group. */
  function timeGroupTotals(records, groupField, roomsField) {
    var totals = {};
    TIME_GROUP_LABELS.forEach(function (l) { totals[l] = 0; });
    for (var i = 0; i < records.length; i++) {
      var w = records[i][roomsField];
      if (w === null || w === undefined || w <= 0) continue;
      totals[records[i][groupField]] += w;
    }
    return totals;
  }

  function peakTimeGroups(totals) {
    var best = 0, peaks = [];
    TIME_GROUPS.forEach(function (g) { // valid groups only — Unknown excluded
      var v = totals[g.label] || 0;
      if (v > best) { best = v; peaks = [g.label]; }
      else if (v === best && v > 0) peaks.push(g.label);
    });
    return { peaks: peaks, value: best };
  }

  function calculatePeakArrivalGroup(records) {
    return peakTimeGroups(timeGroupTotals(records, '_atg', 'Arrival Rooms'));
  }
  function calculatePeakDepartureGroup(records) {
    return peakTimeGroups(timeGroupTotals(records, '_dtg', 'Departure Rooms'));
  }

  /* ---------- occupancy combinations (Adults × Children) ---------- */
  /* Metric is SUM(Arrival Rooms) (§11). Returns map combo → arrival rooms. */
  function occupancyCombinations(records) {
    var out = {};
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var w = r['Arrival Rooms'];
      if (w === null || w === undefined || w <= 0) continue;
      if (r._occ === 'Invalid') continue;
      out[r._occ] = (out[r._occ] || 0) + w;
    }
    return out;
  }

  /* Adults × Children matrix for heatmap: {a, c, rooms} triples. */
  function occupancyMatrix(records) {
    var cell = {};
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var w = r['Arrival Rooms'];
      if (w === null || w === undefined || w <= 0 || r._occ === 'Invalid') continue;
      var k = r['Adults'] + '|' + r['Children'];
      cell[k] = (cell[k] || 0) + w;
    }
    return Object.keys(cell).map(function (k) {
      var p = k.split('|');
      return { a: +p[0], c: +p[1], rooms: cell[k] };
    });
  }

  /* ---------- grouping helper ---------- */
  /* Aggregate a metric per group value. metricFn(records)→number. */
  function groupBy(records, keyFn) {
    var groups = {};
    for (var i = 0; i < records.length; i++) {
      var k = keyFn(records[i]);
      if (k === null || k === undefined || k === '') continue;
      (groups[k] = groups[k] || []).push(records[i]);
    }
    return groups;
  }

  /* ---------- last-year comparison (§14) ---------- */
  function calculateLastYearPeriod(fromYmd, toYmd) {
    return { from: shiftYear(fromYmd, -1), to: shiftYear(toYmd, -1) };
  }
  function shiftYear(ymd, delta) {
    if (!ymd) return '';
    var p = ymd.split('-');
    var y = +p[0] + delta, mo = +p[1], d = +p[2];
    // clamp 29 Feb → 28 Feb in non-leap years
    var maxD = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (d > maxD) d = maxD;
    return y + '-' + Norm.pad2(mo) + '-' + Norm.pad2(d);
  }
  function shiftMonth(ym, delta) { // 'YYYY-MM'
    if (!ym) return '';
    var p = ym.split('-');
    return (+p[0] + delta) + '-' + p[1];
  }

  function calculateVariance(ty, ly) {
    if (ty === null || ly === null || ty === undefined || ly === undefined) return { abs: null, pct: null };
    var abs = ty - ly;
    var pct = ly === 0 ? null : (abs / ly) * 100; // LY zero → N/A, never Infinity
    return { abs: abs, pct: pct };
  }
  function calculatePercentagePointVariance(tyPct, lyPct) {
    if (tyPct === null || lyPct === null || tyPct === undefined || lyPct === undefined) return null;
    return tyPct - lyPct;
  }

  /* ---------- formatting ---------- */
  function fmtInt(v) {
    if (v === null || v === undefined) return 'N/A';
    return Math.round(v).toLocaleString('en-US');
  }
  function fmtPct(v) {
    if (v === null || v === undefined || !isFinite(v)) return 'N/A';
    return v.toFixed(1) + '%';
  }
  function fmtPp(v) {
    if (v === null || v === undefined || !isFinite(v)) return 'N/A';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + ' pp';
  }
  function fmtVarPct(v) {
    if (v === null || v === undefined || !isFinite(v)) return 'N/A';
    return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  }
  function fmtVarAbs(v) {
    if (v === null || v === undefined) return 'N/A';
    var r = Math.round(v);
    return (r >= 0 ? '+' : '') + r.toLocaleString('en-US');
  }

  return {
    sumField: sumField,
    calculateArrivalRooms: calculateArrivalRooms,
    calculateDepartureRooms: calculateDepartureRooms,
    calculateRoomNightsSold: calculateRoomNightsSold,
    share: share,
    dateSpine: dateSpine,
    includedDates: includedDates,
    calculateAvailableRoomNights: calculateAvailableRoomNights,
    calculateOccupancy: calculateOccupancy,
    validCombos: validCombos,
    calculateWeightedArrivalTime: calculateWeightedArrivalTime,
    calculateWeightedDepartureTime: calculateWeightedDepartureTime,
    formatMinutes: formatMinutes,
    timeGroupTotals: timeGroupTotals,
    peakTimeGroups: peakTimeGroups,
    calculatePeakArrivalGroup: calculatePeakArrivalGroup,
    calculatePeakDepartureGroup: calculatePeakDepartureGroup,
    occupancyCombinations: occupancyCombinations,
    occupancyMatrix: occupancyMatrix,
    groupBy: groupBy,
    calculateLastYearPeriod: calculateLastYearPeriod,
    shiftYear: shiftYear,
    shiftMonth: shiftMonth,
    calculateVariance: calculateVariance,
    calculatePercentagePointVariance: calculatePercentagePointVariance,
    fmtInt: fmtInt, fmtPct: fmtPct, fmtPp: fmtPp, fmtVarPct: fmtVarPct, fmtVarAbs: fmtVarAbs
  };
})();
