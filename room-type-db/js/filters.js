/* =========================================================================
 * filters.js — global filter state and record filtering.
 * Every filter affects KPIs, charts, tables, tooltips, drill-downs and
 * exports because every consumer pulls records through Filters.apply().
 * Date basis per section: 'bd' (Business Date), 'ad' (Arrival), 'dd' (Departure).
 * ========================================================================= */
'use strict';

var Filters = (function () {

  var PREF_KEY = 'flora_rtdb_filters_v1';

  var state = {
    properties: [],        // multi-select; default = single property
    roomTypeGroups: [],
    seggrps: [],
    months: [],            // 'YYYY-MM'
    marketCodes: [],
    accountManagerGroups: [],
    reservationStatuses: [],
    nationalities: [],
    occupancyCombos: [],
    weeks: [],             // ISO 'YYYY-Www'
    dateFrom: '',
    dateTo: '',
    includeUnmapped: false,
    comparisonMode: 'both' // 'both' | 'ty' | 'ly'
  };

  function save() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(state)); } catch (e) { /* quota — non-fatal */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(PREF_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(state).forEach(function (k) {
          if (saved.hasOwnProperty(k)) state[k] = saved[k];
        });
      }
    } catch (e) { /* corrupted prefs — keep defaults */ }
  }

  /* Defaults: one property, latest available Business-Date month (§15). */
  function applyDefaults(records) {
    var props = {};
    var months = {};
    records.forEach(function (r) {
      if (r['Property']) props[r['Property']] = true;
      if (r._bdMonth) months[r._bdMonth] = true;
    });
    var propList = Object.keys(props).sort();
    var monthList = Object.keys(months).sort();
    var valid = state.properties.filter(function (p) { return props[p]; });
    if (!valid.length && propList.length) state.properties = [propList[0]];
    else state.properties = valid.length ? valid : state.properties;
    var validMonths = state.months.filter(function (m) { return months[m]; });
    if (!validMonths.length && monthList.length) state.months = [monthList[monthList.length - 1]];
    else state.months = validMonths.length ? validMonths : state.months;
    save();
  }

  function reset(records) {
    state.properties = [];
    state.roomTypeGroups = [];
    state.seggrps = [];
    state.months = [];
    state.marketCodes = [];
    state.accountManagerGroups = [];
    state.reservationStatuses = [];
    state.nationalities = [];
    state.occupancyCombos = [];
    state.weeks = [];
    state.dateFrom = '';
    state.dateTo = '';
    state.includeUnmapped = false;
    applyDefaults(records);
  }

  function inList(list, v) { return !list.length || list.indexOf(v) !== -1; }

  /* Core filter. dateBasis: 'bd' | 'ad' | 'dd'. Month/week/date-range apply
   * to the section's date basis; every other filter is record-level. */
  function apply(records, dateBasis, overrides) {
    var s = overrides ? merged(overrides) : state;
    var dateField = dateBasis === 'ad' ? 'Arrival Date' : dateBasis === 'dd' ? 'Departure Date' : 'Business Date';
    var monthField = dateBasis === 'ad' ? '_adMonth' : dateBasis === 'dd' ? '_ddMonth' : '_bdMonth';

    var out = [];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (!inList(s.properties, r['Property'])) continue;
      if (!s.includeUnmapped) {
        if (r._rtg === UNMAPPED) continue;
        if (r._seg === UNMAPPED) continue;
      }
      if (!inList(s.roomTypeGroups, r._rtg)) continue;
      if (!inList(s.seggrps, r._seg)) continue;
      if (!inList(s.marketCodes, r['Market Code'])) continue;
      if (!inList(s.accountManagerGroups, r._amg)) continue;
      if (!inList(s.reservationStatuses, r['Reservation Status'])) continue;
      if (!inList(s.nationalities, r['Nationality'])) continue;
      if (!inList(s.occupancyCombos, r._occ)) continue;

      var dv = r[dateField];
      if (s.months.length && s.months.indexOf(r[monthField]) === -1) continue;
      if (s.weeks.length) {
        if (!dv || s.weeks.indexOf(Norm.isoWeek(dv)) === -1) continue;
      }
      if (s.dateFrom && (!dv || dv < s.dateFrom)) continue;
      if (s.dateTo && (!dv || dv > s.dateTo)) continue;
      out.push(r);
    }
    return out;
  }

  function merged(overrides) {
    var s = {};
    Object.keys(state).forEach(function (k) { s[k] = state[k]; });
    Object.keys(overrides).forEach(function (k) { s[k] = overrides[k]; });
    return s;
  }

  /* The active TY period as {from, to} in YYYY-MM-DD, derived from month /
   * week / date-range filters (priority: date range > weeks > months). */
  function activePeriod() {
    if (state.dateFrom || state.dateTo) {
      return { from: state.dateFrom || '0000-01-01', to: state.dateTo || '9999-12-31' };
    }
    if (state.weeks.length) {
      var ws = state.weeks.slice().sort();
      return { from: isoWeekStart(ws[0]), to: isoWeekEnd(ws[ws.length - 1]) };
    }
    if (state.months.length) {
      var ms = state.months.slice().sort();
      var first = ms[0], last = ms[ms.length - 1];
      var lp = last.split('-');
      var lastDay = new Date(Date.UTC(+lp[0], +lp[1], 0)).getUTCDate();
      return { from: first + '-01', to: last + '-' + Norm.pad2(lastDay) };
    }
    return { from: '', to: '' };
  }

  function isoWeekStart(yw) { // 'YYYY-Www' → Monday YYYY-MM-DD
    var p = yw.split('-W');
    var y = +p[0], w = +p[1];
    var jan4 = new Date(Date.UTC(y, 0, 4));
    var day = (jan4.getUTCDay() + 6) % 7;
    var monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - day + (w - 1) * 7);
    return monday.getUTCFullYear() + '-' + Norm.pad2(monday.getUTCMonth() + 1) + '-' + Norm.pad2(monday.getUTCDate());
  }
  function isoWeekEnd(yw) {
    var start = isoWeekStart(yw);
    var p = start.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    d.setUTCDate(d.getUTCDate() + 6);
    return d.getUTCFullYear() + '-' + Norm.pad2(d.getUTCMonth() + 1) + '-' + Norm.pad2(d.getUTCDate());
  }

  /* Records for the LY period: same filters, dates shifted back one year. */
  function applyLastYear(records, dateBasis) {
    var period = activePeriod();
    if (!period.from || !period.to) return [];
    var ly = Calc.calculateLastYearPeriod(period.from, period.to);
    return apply(records, dateBasis, {
      months: [], weeks: [], dateFrom: ly.from, dateTo: ly.to
    });
  }

  /* Build the option lists from data. Property-aware Room Type options. */
  function buildOptions(records) {
    var sets = {
      properties: {}, roomTypeGroups: {}, seggrps: {}, months: {}, marketCodes: {},
      accountManagerGroups: {}, reservationStatuses: {}, nationalities: {},
      occupancyCombos: {}, weeks: {}
    };
    records.forEach(function (r) {
      if (r['Property']) sets.properties[r['Property']] = 1;
      var propOk = !state.properties.length || state.properties.indexOf(r['Property']) !== -1;
      if (propOk) {
        if (r._rtg && (state.includeUnmapped || r._rtg !== UNMAPPED)) sets.roomTypeGroups[r._rtg] = 1;
        if (r._seg && (state.includeUnmapped || r._seg !== UNMAPPED)) sets.seggrps[r._seg] = 1;
        if (r._bdMonth) sets.months[r._bdMonth] = 1;
        if (r['Market Code']) sets.marketCodes[r['Market Code']] = 1;
        if (r._amg) sets.accountManagerGroups[r._amg] = 1;
        if (r['Reservation Status']) sets.reservationStatuses[r['Reservation Status']] = 1;
        if (r['Nationality']) sets.nationalities[r['Nationality']] = 1;
        if (r._occ && r._occ !== 'Invalid') sets.occupancyCombos[r._occ] = 1;
        if (r['Business Date']) sets.weeks[Norm.isoWeek(r['Business Date'])] = 1;
      }
    });
    var opts = {};
    Object.keys(sets).forEach(function (k) { opts[k] = Object.keys(sets[k]).sort(); });
    // occupancy combos: sort by adults then children for readability
    opts.occupancyCombos.sort(function (a, b) {
      function rank(s) {
        var m = s.match(/^(\d+) Adult/); var a0 = m ? +m[1] : 0;
        var m2 = s.match(/(\d+) Child/); var c0 = m2 ? +m2[1] : 0;
        return a0 * 100 + c0;
      }
      return rank(a) - rank(b);
    });
    return opts;
  }

  return {
    state: state,
    save: save,
    load: load,
    applyDefaults: applyDefaults,
    reset: reset,
    apply: apply,
    applyLastYear: applyLastYear,
    activePeriod: activePeriod,
    buildOptions: buildOptions
  };
})();
