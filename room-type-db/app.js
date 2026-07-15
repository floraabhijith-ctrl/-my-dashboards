/* =========================================================================
 * Flora Room Type, Arrival & Departure Intelligence — app.js
 * Bootstrap, global filters, seven tabs, upload wizard, drill-downs,
 * exports, backup/restore, rollback.
 * ========================================================================= */
'use strict';

var App = (function () {

  var records = [];        // all stored records, derived groups computed
  var batches = [];
  var latestBd = '';
  var earliestBd = '';
  var currentTab = 'overview';
  var msControls = [];
  var qualityCache = null; // {cats, count}
  var rtMetric = 'arrivals';
  var pendingUpload = null; // wizard state

  var TABS = [
    { id: 'overview', label: 'Executive Overview' },
    { id: 'roomtypes', label: 'Room Type Statistics' },
    { id: 'combos', label: 'Guest Occupancy Combinations' },
    { id: 'arrivals', label: 'Arrival Patterns' },
    { id: 'departures', label: 'Departure Patterns' },
    { id: 'roomnumbers', label: 'Room Number Statistics' },
    { id: 'quality', label: 'Data Quality & Upload History' }
  ];

  /* ================= bootstrap ================= */
  function init() {
    UI.loader(true, 'Loading stored data…');
    Filters.load();
    Promise.all([DB.getAllRecords(), DB.getBatches()]).then(function (res) {
      setRecords(res[0]);
      batches = res[1];
      Filters.applyDefaults(records);
      buildTabs();
      buildFilterBar();
      bindHeaderActions();
      refresh();
      UI.loader(false);
      if (!records.length) UI.openModal('welcome-modal');
    }).catch(function (err) {
      UI.loader(false);
      UI.toast('Failed to open the local database: ' + err.message, 'error');
    });
  }

  function setRecords(list) {
    records = list;
    latestBd = ''; earliestBd = '';
    records.forEach(function (r) {
      Norm.deriveGroups(r);
      if (r['Business Date']) {
        if (!latestBd || r['Business Date'] > latestBd) latestBd = r['Business Date'];
        if (!earliestBd || r['Business Date'] < earliestBd) earliestBd = r['Business Date'];
      }
    });
    qualityCache = null;
  }

  function reloadFromDb() {
    return Promise.all([DB.getAllRecords(), DB.getBatches()]).then(function (res) {
      setRecords(res[0]);
      batches = res[1];
      Filters.applyDefaults(records);
    });
  }

  /* ================= period helpers ================= */
  /* TY period capped at latest Business Date (§13); LY = exact shift (§14). */
  function tyPeriod() {
    var p = Filters.activePeriod();
    if (!p.from || !p.to) return { from: earliestBd, to: latestBd };
    var to = p.to;
    if (latestBd && latestBd < to) to = latestBd;
    return { from: p.from, to: to };
  }
  function lyPeriod() {
    var p = tyPeriod();
    return Calc.calculateLastYearPeriod(p.from, p.to);
  }
  function tyRecords(basis) { return Filters.apply(records, basis); }
  function lyRecords(basis) {
    var ly = lyPeriod();
    if (!ly.from || !ly.to) return [];
    return Filters.apply(records, basis, { months: [], weeks: [], dateFrom: ly.from, dateTo: ly.to });
  }
  /* Records with period filters removed (for by-month / trend visuals). */
  function allPeriodRecords(basis) {
    return Filters.apply(records, basis, { months: [], weeks: [], dateFrom: '', dateTo: '' });
  }

  function occCombosInScope() {
    return Calc.validCombos(Filters.state.properties, Filters.state.roomTypeGroups);
  }
  function tyOccupancy(recs) {
    var p = tyPeriod();
    var dates = Calc.includedDates(p.from, p.to, latestBd);
    return Calc.calculateOccupancy(recs, occCombosInScope(), dates.length);
  }
  function lyOccupancy(recs) {
    var ly = lyPeriod();
    var dates = Calc.dateSpine(ly.from, ly.to); // completed historical period
    return Calc.calculateOccupancy(recs, occCombosInScope(), dates.length);
  }

  /* ================= tabs & filter bar ================= */
  function buildTabs() {
    var nav = document.getElementById('tab-nav');
    nav.innerHTML = TABS.map(function (t) {
      return '<button type="button" class="tab-btn' + (t.id === currentTab ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');
    nav.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentTab = btn.dataset.tab;
        nav.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.toggle('active', b === btn); });
        document.querySelectorAll('.tab-panel').forEach(function (p) {
          p.classList.toggle('active', p.id === 'tab-' + currentTab);
        });
        renderCurrentTab();
      });
    });
  }

  function buildFilterBar() {
    var primary = document.getElementById('filters-primary');
    var advanced = document.getElementById('filters-advanced');
    primary.innerHTML = '';
    advanced.innerHTML = '';
    msControls = [];

    function opts() { return Filters.buildOptions(records); }

    function add(container, id, label, key) {
      msControls.push(UI.multiSelect(container, {
        id: id, label: label,
        options: function () { return opts()[key]; },
        selected: function () { return Filters.state[key]; },
        onChange: function (list) {
          Filters.state[key] = list;
          Filters.save();
          refresh();
        }
      }));
    }

    add(primary, 'property', 'Property', 'properties');
    add(primary, 'rtg', 'Room Type Group', 'roomTypeGroups');
    add(primary, 'seg', 'SEGGRP Group', 'seggrps');
    add(primary, 'month', 'Month', 'months');

    add(advanced, 'mkt', 'Market Code', 'marketCodes');
    add(advanced, 'amg', 'Account Manager', 'accountManagerGroups');
    add(advanced, 'status', 'Reservation Status', 'reservationStatuses');
    add(advanced, 'nat', 'Nationality', 'nationalities');
    add(advanced, 'occ', 'Occupancy Combination', 'occupancyCombos');
    add(advanced, 'week', 'Week (ISO)', 'weeks');

    var dr = document.createElement('div');
    dr.className = 'ms-wrap daterange-wrap';
    dr.innerHTML = '<label class="ms-label">Date Range</label>' +
      '<div class="daterange"><input type="date" id="f-date-from" value="' + Filters.state.dateFrom + '">' +
      '<span>–</span><input type="date" id="f-date-to" value="' + Filters.state.dateTo + '"></div>';
    advanced.appendChild(dr);
    dr.querySelector('#f-date-from').addEventListener('change', function (e) {
      Filters.state.dateFrom = e.target.value; Filters.save(); refresh();
    });
    dr.querySelector('#f-date-to').addEventListener('change', function (e) {
      Filters.state.dateTo = e.target.value; Filters.save(); refresh();
    });

    document.getElementById('toggle-advanced').onclick = function () {
      var el = document.getElementById('filters-advanced');
      el.classList.toggle('open');
      this.textContent = el.classList.contains('open') ? 'Advanced Filters ▴' : 'Advanced Filters ▾';
    };
    document.getElementById('include-unmapped').checked = Filters.state.includeUnmapped;
    document.getElementById('include-unmapped').onchange = function (e) {
      Filters.state.includeUnmapped = e.target.checked; Filters.save(); refresh();
    };
    document.getElementById('reset-filters').onclick = function () {
      Filters.reset(records); Filters.save();
      buildFilterBar(); refresh();
      UI.toast('Filters reset to defaults', 'info');
    };
    document.querySelectorAll('#cmp-mode button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === Filters.state.comparisonMode);
      b.onclick = function () {
        Filters.state.comparisonMode = b.dataset.mode; Filters.save();
        document.querySelectorAll('#cmp-mode button').forEach(function (x) { x.classList.toggle('active', x === b); });
        refresh();
      };
    });
  }

  function renderChips() {
    var chipsEl = document.getElementById('filter-chips');
    var chips = [];
    var s = Filters.state;
    function chip(label, values, key) {
      values.forEach(function (v) {
        chips.push('<span class="chip">' + UI.esc(label + ': ' + v) +
          '<button type="button" data-key="' + key + '" data-val="' + UI.esc(v) + '">×</button></span>');
      });
    }
    chip('Property', s.properties, 'properties');
    chip('Room Type', s.roomTypeGroups, 'roomTypeGroups');
    chip('SEGGRP', s.seggrps, 'seggrps');
    chip('Month', s.months, 'months');
    chip('Market', s.marketCodes, 'marketCodes');
    chip('Acct Mgr', s.accountManagerGroups, 'accountManagerGroups');
    chip('Status', s.reservationStatuses, 'reservationStatuses');
    chip('Nationality', s.nationalities, 'nationalities');
    chip('Combination', s.occupancyCombos, 'occupancyCombos');
    chip('Week', s.weeks, 'weeks');
    if (s.dateFrom) chips.push('<span class="chip">From: ' + s.dateFrom + '<button type="button" data-key="dateFrom" data-val="">×</button></span>');
    if (s.dateTo) chips.push('<span class="chip">To: ' + s.dateTo + '<button type="button" data-key="dateTo" data-val="">×</button></span>');
    if (s.includeUnmapped) chips.push('<span class="chip warn">Including UNMAPPED<button type="button" data-key="includeUnmapped" data-val="">×</button></span>');
    chipsEl.innerHTML = chips.join('');
    chipsEl.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.dataset.key;
        if (key === 'dateFrom' || key === 'dateTo') Filters.state[key] = '';
        else if (key === 'includeUnmapped') Filters.state.includeUnmapped = false;
        else {
          var arr = Filters.state[key];
          var idx = arr.indexOf(b.dataset.val);
          if (idx !== -1) arr.splice(idx, 1);
        }
        Filters.save(); buildFilterBar(); refresh();
      });
    });
  }

  function renderHeaderStats() {
    var el = document.getElementById('header-stats');
    if (!records.length) { el.innerHTML = '<span class="hs-item">No data loaded yet</span>'; return; }
    var lastUpload = batches.length ? batches[0].timestamp.replace('T', ' ').substring(0, 16) : '—';
    var props = Filters.state.properties.length ? Filters.state.properties.join(', ') : 'All properties';
    el.innerHTML =
      '<span class="hs-item"><strong>Latest Business Date</strong>' + latestBd + '</span>' +
      '<span class="hs-item"><strong>Coverage</strong>' + earliestBd + ' → ' + latestBd + '</span>' +
      '<span class="hs-item"><strong>Stored Rows</strong>' + records.length.toLocaleString() + '</span>' +
      '<span class="hs-item"><strong>Last Upload</strong>' + lastUpload + '</span>' +
      '<span class="hs-item"><strong>Property</strong>' + UI.esc(props) + '</span>';
  }

  function refresh() {
    renderChips();
    renderHeaderStats();
    renderCurrentTab();
  }

  function renderCurrentTab() {
    var fns = {
      overview: renderOverview, roomtypes: renderRoomTypes, combos: renderCombos,
      arrivals: renderArrivals, departures: renderDepartures,
      roomnumbers: renderRoomNumbers, quality: renderQuality
    };
    try {
      fns[currentTab]();
    } catch (err) {
      UI.toast('Render error: ' + err.message, 'error');
      if (window.console) console.error(err);
    }
    setTimeout(Charts.resizeAll, 50);
  }

  /* ================= shared aggregation helpers ================= */
  function byGroupTyLy(tyRecs, lyRecs, keyFn, metricFn) {
    var tyG = Calc.groupBy(tyRecs, keyFn);
    var lyG = Calc.groupBy(lyRecs, keyFn);
    var names = {};
    Object.keys(tyG).forEach(function (k) { names[k] = 1; });
    Object.keys(lyG).forEach(function (k) { names[k] = 1; });
    return Object.keys(names).map(function (k) {
      return {
        name: k,
        ty: metricFn(tyG[k] || []),
        ly: lyG[k] ? metricFn(lyG[k]) : null
      };
    });
  }

  function shareRows(rows) {
    var totTy = 0, totLy = 0, anyLy = false;
    rows.forEach(function (r) { totTy += r.ty || 0; if (r.ly !== null) { totLy += r.ly; anyLy = true; } });
    return rows.map(function (r) {
      return {
        name: r.name,
        ty: Calc.share(r.ty || 0, totTy),
        ly: anyLy && r.ly !== null ? Calc.share(r.ly, totLy) : null
      };
    }).filter(function (r) { return r.ty !== null || r.ly !== null; });
  }

  function occupancyFlagsForScope() {
    var flags = [];
    var p = tyPeriod();
    var dates = Calc.includedDates(p.from, p.to, latestBd);
    if (!dates.length) return flags;
    var tyBd = tyRecords('bd');
    occCombosInScope().forEach(function (c) {
      var recs = tyBd.filter(function (r) { return r['Property'] === c.property && r._rtg === c.rtg; });
      var occ = Calc.calculateOccupancy(recs, [c], dates.length);
      if (occ.pct !== null && occ.pct > 100) {
        flags.push({ property: c.property, rtg: c.rtg, pct: occ.pct, period: p.from + ' → ' + p.to });
      }
    });
    return flags;
  }

  function qualityData() {
    if (!qualityCache) {
      var cats = Validation.run(records, occupancyFlagsForScope());
      var count = 0;
      Object.keys(cats).forEach(function (k) { count += cats[k].length; });
      qualityCache = { cats: cats, count: count };
    }
    return qualityCache;
  }

  /* ================= Tab 1 — Executive Overview ================= */
  function renderOverview() {
    var bdTy = tyRecords('bd'), bdLy = lyRecords('bd');
    var adTy = tyRecords('ad'), adLy = lyRecords('ad');
    var ddTy = tyRecords('dd'), ddLy = lyRecords('dd');

    var arrTy = Calc.calculateArrivalRooms(adTy), arrLy = adLy.length ? Calc.calculateArrivalRooms(adLy) : null;
    var depTy = Calc.calculateDepartureRooms(ddTy), depLy = ddLy.length ? Calc.calculateDepartureRooms(ddLy) : null;
    var rnTy = Calc.calculateRoomNightsSold(bdTy), rnLy = bdLy.length ? Calc.calculateRoomNightsSold(bdLy) : null;
    var occTy = tyOccupancy(bdTy), occLy = bdLy.length ? lyOccupancy(bdLy) : { pct: null };

    var peakArr = Calc.calculatePeakArrivalGroup(adTy);
    var peakDep = Calc.calculatePeakDepartureGroup(ddTy);

    var rtRows = byGroupTyLy(bdTy, bdLy, function (r) { return r._rtg; }, Calc.calculateRoomNightsSold);
    rtRows.sort(function (a, b) { return (b.ty || 0) - (a.ty || 0); });
    var mostUsedRt = rtRows.length && rtRows[0].ty > 0 ? rtRows[0].name : 'N/A';

    var combos = Calc.occupancyCombinations(adTy);
    var comboNames = Object.keys(combos).sort(function (a, b) { return combos[b] - combos[a]; });
    var topCombo = comboNames.length ? comboNames[0] : 'N/A';

    var dq = qualityData();

    var kpis = document.getElementById('ov-kpis');
    kpis.innerHTML =
      UI.kpiCard('Total Arrival Rooms', Calc.fmtInt(arrTy), arrLy === null ? null : Calc.fmtInt(arrLy), UI.varianceHtml(arrTy, arrLy), 'SUM(Arrival Rooms) on Arrival Date basis') +
      UI.kpiCard('Total Departure Rooms', Calc.fmtInt(depTy), depLy === null ? null : Calc.fmtInt(depLy), UI.varianceHtml(depTy, depLy), 'SUM(Departure Rooms) on Departure Date basis') +
      UI.kpiCard('Room Nights Sold', Calc.fmtInt(rnTy), rnLy === null ? null : Calc.fmtInt(rnLy), UI.varianceHtml(rnTy, rnLy), 'SUM(Room Nights) on Business Date basis') +
      UI.kpiCard('Room Type Occupancy', Calc.fmtPct(occTy.pct), occLy.pct === null ? null : Calc.fmtPct(occLy.pct), UI.varianceHtml(occTy.pct, occLy.pct, true), 'Room Nights Sold ÷ available room-nights (valid Property + Room Type inventory)') +
      UI.kpiCard('Peak Arrival Time', peakArr.peaks.length ? peakArr.peaks.join(' & ') : 'N/A', null, '', 'Valid time group with highest SUM(Arrival Rooms)') +
      UI.kpiCard('Peak Departure Time', peakDep.peaks.length ? peakDep.peaks.join(' & ') : 'N/A', null, '', 'Valid time group with highest SUM(Departure Rooms)') +
      UI.kpiCard('Most Used Room Type', mostUsedRt, null, '', 'Highest Room Nights Sold in the current selection') +
      UI.kpiCard('Top Guest Combination', topCombo, null, '', 'Highest SUM(Arrival Rooms) Adults + Children combination') +
      '<div class="kpi-card clickable" id="kpi-dq" title="Open Data Quality tab"><div class="kpi-label">Data Quality Warnings</div>' +
      '<div class="kpi-value ' + (dq.count ? 'warn-text' : '') + '">' + dq.count.toLocaleString() + '</div></div>';
    document.getElementById('kpi-dq').onclick = function () {
      document.querySelector('[data-tab=quality]').click();
    };

    var arrShare = shareRows(byGroupTyLy(adTy, adLy, function (r) { return r._rtg; }, Calc.calculateArrivalRooms));
    Charts.hbar('ov-arr-share', arrShare, { pct: true, tyLabel: 'Arrival Share' });

    var depShare = shareRows(byGroupTyLy(ddTy, ddLy, function (r) { return r._rtg; }, Calc.calculateDepartureRooms));
    Charts.hbar('ov-dep-share', depShare, { pct: true, tyLabel: 'Departure Share' });

    var p = tyPeriod();
    var dates = Calc.includedDates(p.from, p.to, latestBd);
    var occRows = occupancyByRtg(bdTy, bdLy, dates.length);
    Charts.vbar('ov-occ', occRows, { pct: true, tyLabel: 'Occupancy %' });

    renderTrend('ov-trend', adTy, adLy, ddTy, ddLy);
  }

  function occupancyByRtg(bdTy, bdLy, nDatesTy) {
    var ly = lyPeriod();
    var nDatesLy = Calc.dateSpine(ly.from, ly.to).length;
    var rtgs = {};
    occCombosInScope().forEach(function (c) { rtgs[c.rtg] = 1; });
    return Object.keys(rtgs).map(function (g) {
      var combosG = occCombosInScope().filter(function (c) { return c.rtg === g; });
      var tyRecs = bdTy.filter(function (r) { return r._rtg === g; });
      var lyRecs = bdLy.filter(function (r) { return r._rtg === g; });
      var occT = Calc.calculateOccupancy(tyRecs, combosG, nDatesTy);
      var occL = bdLy.length ? Calc.calculateOccupancy(lyRecs, combosG, nDatesLy) : { pct: null };
      return { name: g, ty: occT.pct, ly: occL.pct };
    }).filter(function (r) { return r.ty !== null || r.ly !== null; });
  }

  function renderTrend(elId, adTy, adLy, ddTy, ddLy) {
    var p = tyPeriod();
    var dates = Calc.includedDates(p.from, p.to, latestBd);
    if (!dates.length) { Charts.noData(elId); return; }
    function daily(recs, dateField, valueField) {
      var m = {};
      recs.forEach(function (r) {
        var v = r[valueField];
        if (v === null || v <= 0) return;
        m[r[dateField]] = (m[r[dateField]] || 0) + v;
      });
      return m;
    }
    var arrByDay = daily(adTy, 'Arrival Date', 'Arrival Rooms');
    var depByDay = daily(ddTy, 'Departure Date', 'Departure Rooms');
    var lyDates = dates.map(function (d) { return Calc.shiftYear(d, -1); });
    var arrLyByDay = daily(adLy, 'Arrival Date', 'Arrival Rooms');
    var depLyByDay = daily(ddLy, 'Departure Date', 'Departure Rooms');

    var cats = dates.map(function (d) { return d.substring(5); });
    var series = [];
    var mode = Filters.state.comparisonMode;
    if (mode !== 'ly') {
      series.push({ name: 'Arrivals', data: dates.map(function (d) { return arrByDay[d] || 0; }), color: FLORA.tyColor });
      series.push({ name: 'Departures', data: dates.map(function (d) { return depByDay[d] || 0; }), color: '#7E6489' });
    }
    if (mode !== 'ty' && adLy.length + ddLy.length > 0) {
      series.push({ name: 'Arrivals LY', data: lyDates.map(function (d) { return arrLyByDay[d] || 0; }), color: FLORA.lyColor });
      series.push({ name: 'Departures LY', data: lyDates.map(function (d) { return depLyByDay[d] || 0; }), color: '#E0D3E8' });
    }
    Charts.line(elId, cats, series);
  }

  /* ================= Tab 2 — Room Type Statistics ================= */
  function renderRoomTypes() {
    var bdTy = tyRecords('bd'), bdLy = lyRecords('bd');
    var adTy = tyRecords('ad'), adLy = lyRecords('ad');
    var ddTy = tyRecords('dd'), ddLy = lyRecords('dd');
    var p = tyPeriod();
    var nTy = Calc.includedDates(p.from, p.to, latestBd).length;
    var ly = lyPeriod();
    var nLy = Calc.dateSpine(ly.from, ly.to).length;
    var hasLy = bdLy.length + adLy.length + ddLy.length > 0;

    document.querySelectorAll('#rt-metric button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.metric === rtMetric);
      b.onclick = function () { rtMetric = b.dataset.metric; renderRoomTypes(); };
    });

    var totalRnTy = Calc.calculateRoomNightsSold(bdTy);

    var rows = occCombosInScope().map(function (c) {
      function filt(list) {
        return list.filter(function (r) { return r['Property'] === c.property && r._rtg === c.rtg; });
      }
      var arrT = Calc.calculateArrivalRooms(filt(adTy));
      var arrL = hasLy ? Calc.calculateArrivalRooms(filt(adLy)) : null;
      var depT = Calc.calculateDepartureRooms(filt(ddTy));
      var depL = hasLy ? Calc.calculateDepartureRooms(filt(ddLy)) : null;
      var rnT = Calc.calculateRoomNightsSold(filt(bdTy));
      var rnL = hasLy ? Calc.calculateRoomNightsSold(filt(bdLy)) : null;
      var availT = Calc.calculateAvailableRoomNights(c.property, c.rtg, nTy);
      var availL = Calc.calculateAvailableRoomNights(c.property, c.rtg, nLy);
      var occT = availT ? (rnT / availT) * 100 : null;
      var occL = hasLy && availL ? (rnL / availL) * 100 : null;
      return {
        property: c.property, rtg: c.rtg, rooms: c.rooms,
        arrT: arrT, arrL: arrL, depT: depT, depL: depL,
        rnT: rnT, rnL: rnL, rnShare: Calc.share(rnT, totalRnTy),
        availT: availT, occT: occT, occL: occL
      };
    });

    UI.table(document.getElementById('rt-table'), {
      pageSize: 25,
      columns: [
        { key: 'property', label: 'Property' },
        { key: 'rtg', label: 'Room Type Group' },
        { key: 'rooms', label: 'Physical Rooms', cls: 'num' },
        { key: 'arrT', label: 'Arrivals TY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'arrL', label: 'Arrivals LY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'arrVar', label: 'Arr. Var', cls: 'num', html: true, fmt: function (v, r) { return UI.varianceHtml(r.arrT, r.arrL); } },
        { key: 'depT', label: 'Departures TY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'depL', label: 'Departures LY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'depVar', label: 'Dep. Var', cls: 'num', html: true, fmt: function (v, r) { return UI.varianceHtml(r.depT, r.depL); } },
        { key: 'rnT', label: 'Room Nights TY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'rnL', label: 'Room Nights LY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'rnShare', label: 'RN Share', cls: 'num', fmt: Calc.fmtPct },
        { key: 'availT', label: 'Available RN', cls: 'num', fmt: Calc.fmtInt },
        { key: 'occT', label: 'Occupancy TY', cls: 'num', html: true, fmt: function (v) { return occCell(v); } },
        { key: 'occL', label: 'Occupancy LY', cls: 'num', fmt: Calc.fmtPct },
        { key: 'occVar', label: 'Occ. Var', cls: 'num', html: true, fmt: function (v, r) { return UI.varianceHtml(r.occT, r.occL, true); } }
      ],
      rows: rows,
      emptyText: 'No valid Property + Room Type combinations in the current selection'
    });

    var metricDefs = {
      arrivals: { fn: Calc.calculateArrivalRooms, tyR: adTy, lyR: adLy, pct: false, label: 'Arrival Rooms' },
      departures: { fn: Calc.calculateDepartureRooms, tyR: ddTy, lyR: ddLy, pct: false, label: 'Departure Rooms' },
      roomnights: { fn: Calc.calculateRoomNightsSold, tyR: bdTy, lyR: bdLy, pct: false, label: 'Room Nights Sold' },
      share: { pct: true, label: 'Room Night Share %' },
      occupancy: { pct: true, label: 'Occupancy %' }
    };
    var md = metricDefs[rtMetric];
    var chartRows;
    if (rtMetric === 'occupancy') {
      chartRows = occupancyByRtg(bdTy, bdLy, nTy);
    } else if (rtMetric === 'share') {
      chartRows = shareRows(byGroupTyLy(bdTy, bdLy, function (r) { return r._rtg; }, Calc.calculateRoomNightsSold));
    } else {
      chartRows = byGroupTyLy(md.tyR, md.lyR, function (r) { return r._rtg; }, md.fn);
    }
    Charts.hbar('rt-share-chart', chartRows, { pct: md.pct, tyLabel: md.label });

    renderRtOccTrend(bdTy, bdLy);
    renderRtMatrix(md, bdTy, adTy, ddTy, nTy);
  }

  function occCell(v) {
    if (v === null || v === undefined) return '<span class="muted">N/A</span>';
    var txt = Calc.fmtPct(v);
    if (v > 100) return '<span class="var down" title="Above 100% — flagged in Data Quality">' + txt + ' ⚠</span>';
    return txt;
  }

  function renderRtOccTrend(bdTy, bdLy) {
    var p = tyPeriod();
    var dates = Calc.includedDates(p.from, p.to, latestBd);
    if (!dates.length) { Charts.noData('rt-occ-trend'); return; }
    var combos = occCombosInScope();
    var roomsPerDay = 0;
    combos.forEach(function (c) { roomsPerDay += c.rooms; });
    function dailyOcc(recs, dateList) {
      var soldByDay = {};
      recs.forEach(function (r) {
        if (!r._validCombo || r['Room Nights'] === null) return;
        soldByDay[r['Business Date']] = (soldByDay[r['Business Date']] || 0) + r['Room Nights'];
      });
      return dateList.map(function (d) {
        if (!roomsPerDay) return null;
        return Math.round(((soldByDay[d] || 0) / roomsPerDay) * 1000) / 10;
      });
    }
    var lyDates = dates.map(function (d) { return Calc.shiftYear(d, -1); });
    var series = [];
    var mode = Filters.state.comparisonMode;
    if (mode !== 'ly') series.push({ name: 'Occupancy %', data: dailyOcc(bdTy, dates), color: FLORA.tyColor });
    if (mode !== 'ty' && bdLy.length) series.push({ name: 'Occupancy % LY', data: dailyOcc(bdLy, lyDates), color: FLORA.lyColor });
    Charts.line('rt-occ-trend', dates.map(function (d) { return d.substring(5); }), series, { pct: true });
  }

  function renderRtMatrix(md, bdTy, adTy, ddTy, nTy) {
    var combos = occCombosInScope();
    var props = [], rtgs = [];
    combos.forEach(function (c) {
      if (props.indexOf(c.property) === -1) props.push(c.property);
      if (rtgs.indexOf(c.rtg) === -1) rtgs.push(c.rtg);
    });
    props.sort(); rtgs.sort();
    var cells = [];
    combos.forEach(function (c) {
      var v;
      if (rtMetric === 'occupancy') {
        var recs = bdTy.filter(function (r) { return r['Property'] === c.property && r._rtg === c.rtg; });
        var occ = Calc.calculateOccupancy(recs, [c], nTy);
        v = occ.pct === null ? 0 : Math.round(occ.pct * 10) / 10;
      } else if (rtMetric === 'departures') {
        v = Calc.calculateDepartureRooms(ddTy.filter(function (r) { return r['Property'] === c.property && r._rtg === c.rtg; }));
      } else if (rtMetric === 'arrivals') {
        v = Calc.calculateArrivalRooms(adTy.filter(function (r) { return r['Property'] === c.property && r._rtg === c.rtg; }));
      } else {
        v = Calc.calculateRoomNightsSold(bdTy.filter(function (r) { return r['Property'] === c.property && r._rtg === c.rtg; }));
      }
      cells.push([props.indexOf(c.property), rtgs.indexOf(c.rtg), v]);
    });
    Charts.heatmap('rt-matrix', props, rtgs, cells, {
      cellLabel: function (v) {
        var suffix = rtMetric === 'occupancy' ? '%' : '';
        return props[v[0]] + ' × ' + rtgs[v[1]] + ': ' + v[2] + suffix;
      }
    });
  }

  /* ================= Tab 3 — Guest Occupancy Combinations ================= */
  function renderCombos() {
    var adTy = tyRecords('ad'), adLy = lyRecords('ad');

    var matrix = Calc.occupancyMatrix(adTy);
    if (matrix.length) {
      var as = [], cs = [];
      matrix.forEach(function (m) {
        if (as.indexOf(m.a) === -1) as.push(m.a);
        if (cs.indexOf(m.c) === -1) cs.push(m.c);
      });
      as.sort(function (x, y) { return x - y; });
      cs.sort(function (x, y) { return x - y; });
      var cells = matrix.map(function (m) { return [as.indexOf(m.a), cs.indexOf(m.c), m.rooms]; });
      Charts.heatmap('cmb-heatmap', as.map(function (a) { return a + 'A'; }), cs.map(function (c) { return c + 'C'; }), cells, {
        cellLabel: function (v) { return as[v[0]] + ' Adults × ' + cs[v[1]] + ' Children: ' + Calc.fmtInt(v[2]) + ' arrival rooms'; },
        onCellClick: function (v) {
          openRecordsModal('Reservations — ' + as[v[0]] + ' Adults + ' + cs[v[1]] + ' Children',
            adTy.filter(function (r) {
              return r['Adults'] === as[v[0]] && r['Children'] === cs[v[1]] && (r['Arrival Rooms'] || 0) > 0;
            }));
        }
      });
    } else {
      Charts.noData('cmb-heatmap');
    }

    var tyC = Calc.occupancyCombinations(adTy);
    var lyC = Calc.occupancyCombinations(adLy);
    var names = {};
    Object.keys(tyC).forEach(function (k) { names[k] = 1; });
    Object.keys(lyC).forEach(function (k) { names[k] = 1; });
    var rankRows = Object.keys(names).map(function (k) {
      return { name: k, ty: tyC[k] || 0, ly: adLy.length ? (lyC[k] || 0) : null };
    }).sort(function (a, b) { return b.ty - a.ty; }).slice(0, 15);
    Charts.hbar('cmb-ranking', rankRows, {
      tyLabel: 'Arrival Rooms',
      onClick: function (row) {
        openRecordsModal('Reservations — ' + row.name, adTy.filter(function (r) {
          return r._occ === row.name && (r['Arrival Rooms'] || 0) > 0;
        }));
      }
    });

    var rtgSel = document.getElementById('cmb-rtg-select');
    var rtgs = {};
    adTy.forEach(function (r) { if (r._rtg && r._rtg !== UNMAPPED) rtgs[r._rtg] = 1; });
    var rtgList = Object.keys(rtgs).sort();
    var cur = rtgSel.value && rtgList.indexOf(rtgSel.value) !== -1 ? rtgSel.value : (rtgList[0] || '');
    rtgSel.innerHTML = rtgList.map(function (g) {
      return '<option value="' + UI.esc(g) + '"' + (g === cur ? ' selected' : '') + '>' + UI.esc(g) + '</option>';
    }).join('');
    rtgSel.onchange = renderCombos;
    if (cur) {
      var sub = adTy.filter(function (r) { return r._rtg === cur; });
      var subLy = adLy.filter(function (r) { return r._rtg === cur; });
      var tySub = Calc.occupancyCombinations(sub);
      var lySub = Calc.occupancyCombinations(subLy);
      var subTotal = 0;
      Object.keys(tySub).forEach(function (k) { subTotal += tySub[k]; });
      var explorerRows = Object.keys(tySub).map(function (k) {
        return { name: k, ty: tySub[k], ly: adLy.length ? (lySub[k] || 0) : null, share: Calc.share(tySub[k], subTotal) };
      }).sort(function (a, b) { return b.ty - a.ty; }).slice(0, 12);
      Charts.hbar('cmb-explorer', explorerRows, { tyLabel: 'Arrival Rooms' });
    } else {
      Charts.noData('cmb-explorer');
    }

    var allAd = allPeriodRecords('ad');
    var months = {};
    allAd.forEach(function (r) { if (r._adMonth) months[r._adMonth] = 1; });
    var monthList = Object.keys(months).sort();
    var top5 = rankRows.slice(0, 5).map(function (r) { return r.name; });
    if (monthList.length && top5.length) {
      var series = top5.map(function (combo, i) {
        return {
          name: combo,
          color: FLORA.chartPalette[i % FLORA.chartPalette.length],
          data: monthList.map(function (m) {
            var recs = allAd.filter(function (r) { return r._adMonth === m && r._occ === combo; });
            return Calc.calculateArrivalRooms(recs);
          })
        };
      });
      Charts.line('cmb-trend', monthList, series);
    } else {
      Charts.noData('cmb-trend');
    }
  }

  /* ================= Tabs 4 & 5 — Arrival / Departure Patterns ================= */
  function renderArrivals() { renderPatterns('arr', 'ad', 'Arrival'); }
  function renderDepartures() { renderPatterns('dep', 'dd', 'Departure'); }

  function renderPatterns(prefix, basis, label) {
    var roomsField = label + ' Rooms';
    var groupField = basis === 'ad' ? '_atg' : '_dtg';
    var dateField = label + ' Date';
    var timeField = label + ' Time';
    var tyR = tyRecords(basis), lyR = lyRecords(basis);

    var tyTotals = Calc.timeGroupTotals(tyR, groupField, roomsField);
    var lyTotals = Calc.timeGroupTotals(lyR, groupField, roomsField);
    var distRows = TIME_GROUP_LABELS.map(function (l) {
      return { name: l, ty: tyTotals[l] || 0, ly: lyR.length ? (lyTotals[l] || 0) : null };
    });
    Charts.vbar(prefix + '-dist', distRows, {
      tyLabel: label + ' Rooms',
      onClick: function (row) {
        openRecordsModal(label + 's — ' + row.name, tyR.filter(function (r) {
          return r[groupField] === row.name && (r[roomsField] || 0) > 0;
        }));
      }
    });

    var all = allPeriodRecords(basis);
    var monthField = basis === 'ad' ? '_adMonth' : '_ddMonth';
    var byMonth = Calc.groupBy(all, function (r) { return r[monthField]; });
    var monthRows = Object.keys(byMonth).sort().map(function (m) {
      var peak = Calc.peakTimeGroups(Calc.timeGroupTotals(byMonth[m], groupField, roomsField));
      return { month: m, peak: peak.peaks.join(' & ') || 'N/A', rooms: peak.value, total: Calc.sumField(byMonth[m], roomsField) };
    });
    UI.table(document.getElementById(prefix + '-peak-month'), {
      pageSize: 12,
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'peak', label: 'Peak ' + label + ' Time Group' },
        { key: 'rooms', label: 'Rooms in Peak', cls: 'num', fmt: Calc.fmtInt },
        { key: 'total', label: 'Total ' + label + ' Rooms', cls: 'num', fmt: Calc.fmtInt }
      ],
      rows: monthRows, emptyText: 'No Data'
    });

    var byWeek = Calc.groupBy(tyR, function (r) { return r[dateField] ? Norm.isoWeek(r[dateField]) : ''; });
    var weekRows = Object.keys(byWeek).sort().map(function (w) {
      var peak = Calc.peakTimeGroups(Calc.timeGroupTotals(byWeek[w], groupField, roomsField));
      return { week: w, peak: peak.peaks.join(' & ') || 'N/A', rooms: peak.value, total: Calc.sumField(byWeek[w], roomsField) };
    });
    UI.table(document.getElementById(prefix + '-peak-week'), {
      pageSize: 10,
      columns: [
        { key: 'week', label: 'ISO Week (Mon–Sun)' },
        { key: 'peak', label: 'Peak ' + label + ' Time Group' },
        { key: 'rooms', label: 'Rooms in Peak', cls: 'num', fmt: Calc.fmtInt },
        { key: 'total', label: 'Total ' + label + ' Rooms', cls: 'num', fmt: Calc.fmtInt }
      ],
      rows: weekRows, emptyText: 'No Data'
    });

    renderPatternHeatmap(prefix + '-by-rtg', tyR, function (r) { return r._rtg; }, groupField, roomsField);
    renderPatternHeatmap(prefix + '-by-seg', tyR, function (r) { return r._seg; }, groupField, roomsField);

    var detail = tyR.filter(function (r) { return (r[roomsField] || 0) > 0; });
    detail.sort(function (a, b) { return a[dateField] < b[dateField] ? 1 : -1; });
    UI.table(document.getElementById(prefix + '-detail'), {
      pageSize: 20,
      columns: [
        { key: dateField, label: label + ' Date' },
        { key: timeField, label: 'Time' },
        { key: groupField, label: 'Time Group' },
        { key: 'Property', label: 'Property' },
        { key: '_rtg', label: 'Room Type' },
        { key: 'Room Number', label: 'Room' },
        { key: 'Guest Name', label: 'Guest' },
        { key: '_occ', label: 'Combination' },
        { key: '_seg', label: 'SEGGRP' },
        { key: 'Confirmation Number', label: 'Confirmation' }
      ],
      rows: detail,
      onRowClick: openRecordDetail,
      emptyText: 'No ' + label.toLowerCase() + ' records in the current selection'
    });
    document.getElementById(prefix + '-export').onclick = function () {
      Exports.exportDetailCsv(detail, 'flora_' + label.toLowerCase() + 's_');
      UI.toast(label + ' detail exported with active filters applied', 'success');
    };
  }

  function renderPatternHeatmap(elId, recs, rowFn, groupField, roomsField) {
    var groups = Calc.groupBy(recs, rowFn);
    var rowNames = Object.keys(groups).filter(function (g) { return g !== UNMAPPED || Filters.state.includeUnmapped; }).sort();
    if (!rowNames.length) { Charts.noData(elId); return; }
    var cells = [];
    rowNames.forEach(function (g, yi) {
      var totals = Calc.timeGroupTotals(groups[g], groupField, roomsField);
      TIME_GROUP_LABELS.forEach(function (l, xi) {
        if (totals[l]) cells.push([xi, yi, totals[l]]);
      });
    });
    var shortLabels = TIME_GROUP_LABELS.map(function (l) { return l.replace(' AM–', '–').replace(' PM–', '–').replace('Unknown / Invalid Time', 'Unknown'); });
    Charts.heatmap(elId, shortLabels, rowNames, cells, {
      cellLabel: function (v) { return rowNames[v[1]] + ' · ' + TIME_GROUP_LABELS[v[0]] + ': ' + Calc.fmtInt(v[2]); }
    });
  }

  /* ================= Tab 6 — Room Number Statistics ================= */
  function renderRoomNumbers() {
    var adTy = tyRecords('ad'), adLy = lyRecords('ad');
    var arrOnly = adTy.filter(function (r) { return (r['Arrival Rooms'] || 0) > 0 && r['Room Number']; });

    var rows = byGroupTyLy(adTy, adLy, function (r) { return r['Room Number'] || ''; }, Calc.calculateArrivalRooms)
      .filter(function (r) { return r.name && (r.ty > 0 || (r.ly || 0) > 0); })
      .sort(function (a, b) { return (b.ty || 0) - (a.ty || 0); });

    Charts.hbar('rn-top', rows.slice(0, 20), {
      tyLabel: 'Arrival Rooms',
      onClick: function (row) { openRoomDrilldown(row.name, adTy); }
    });

    var allAd = allPeriodRecords('ad').filter(function (r) { return (r['Arrival Rooms'] || 0) > 0 && r['Room Number']; });
    var months = {};
    allAd.forEach(function (r) { if (r._adMonth) months[r._adMonth] = 1; });
    var monthList = Object.keys(months).sort();
    var top15 = rows.slice(0, 15).map(function (r) { return r.name; });
    if (monthList.length && top15.length) {
      var cells = [];
      top15.forEach(function (rm, yi) {
        monthList.forEach(function (m, xi) {
          var v = Calc.calculateArrivalRooms(allAd.filter(function (r) { return r['Room Number'] === rm && r._adMonth === m; }));
          if (v) cells.push([xi, yi, v]);
        });
      });
      Charts.heatmap('rn-heatmap', monthList, top15, cells, {
        cellLabel: function (v) { return 'Room ' + top15[v[1]] + ' · ' + monthList[v[0]] + ': ' + Calc.fmtInt(v[2]) + ' arrivals'; }
      });
    } else {
      Charts.noData('rn-heatmap');
    }

    var tableRows = rows.slice(0, 200).map(function (r) {
      var recs = arrOnly.filter(function (x) { return x['Room Number'] === r.name; });
      var combos = Calc.occupancyCombinations(recs);
      var topCombo = Object.keys(combos).sort(function (a, b) { return combos[b] - combos[a]; })[0] || 'N/A';
      var peak = Calc.calculatePeakArrivalGroup(recs);
      var props = {};
      recs.forEach(function (x) { props[x['Property']] = 1; });
      return {
        room: r.name, property: Object.keys(props).join(', '),
        ty: r.ty, ly: r.ly, topCombo: topCombo,
        peak: peak.peaks.join(' & ') || 'N/A'
      };
    });
    UI.table(document.getElementById('rn-table'), {
      pageSize: 15,
      columns: [
        { key: 'room', label: 'Room Number' },
        { key: 'property', label: 'Property' },
        { key: 'ty', label: 'Arrival Rooms TY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'ly', label: 'Arrival Rooms LY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'var', label: 'Variance', cls: 'num', html: true, fmt: function (v, r) { return UI.varianceHtml(r.ty, r.ly); } },
        { key: 'topCombo', label: 'Top Combination' },
        { key: 'peak', label: 'Peak Arrival Time' }
      ],
      rows: tableRows,
      onRowClick: function (row) { openRoomDrilldown(row.room, adTy); },
      emptyText: 'No arrival records in the current selection'
    });
  }

  function openRoomDrilldown(roomNumber, adTy) {
    var recs = adTy.filter(function (r) { return r['Room Number'] === roomNumber && (r['Arrival Rooms'] || 0) > 0; });
    var combos = Calc.occupancyCombinations(recs);
    var comboList = Object.keys(combos).sort(function (a, b) { return combos[b] - combos[a]; })
      .map(function (k) { return UI.esc(k) + ' (' + Calc.fmtInt(combos[k]) + ')'; }).slice(0, 6).join(' · ') || 'N/A';
    var totals = Calc.timeGroupTotals(recs, '_atg', 'Arrival Rooms');
    var timeList = TIME_GROUP_LABELS.filter(function (l) { return totals[l]; })
      .map(function (l) { return UI.esc(l) + ' (' + Calc.fmtInt(totals[l]) + ')'; }).join(' · ') || 'N/A';
    var segs = Calc.groupBy(recs, function (r) { return r._seg; });
    var segList = Object.keys(segs).sort(function (a, b) {
      return Calc.calculateArrivalRooms(segs[b]) - Calc.calculateArrivalRooms(segs[a]);
    }).map(function (s) { return UI.esc(s) + ' (' + Calc.fmtInt(Calc.calculateArrivalRooms(segs[s])) + ')'; }).join(' · ') || 'N/A';

    document.getElementById('records-modal-title').textContent = 'Room ' + roomNumber + ' — Drill-Down';
    var statsHtml =
      '<div class="drill-stats">' +
      '<div><strong>Total Arrival Rooms:</strong> ' + Calc.fmtInt(Calc.calculateArrivalRooms(recs)) + '</div>' +
      '<div><strong>Occupancy Combinations:</strong> ' + comboList + '</div>' +
      '<div><strong>Arrival Time Pattern:</strong> ' + timeList + '</div>' +
      '<div><strong>Market Segments:</strong> ' + segList + '</div>' +
      '</div>';
    renderRecordsModal(recs, statsHtml);
    UI.openModal('records-modal');
  }

  /* ================= Tab 7 — Data Quality & Upload History ================= */
  var activeQualityCat = null;

  function renderQuality() {
    var dq = qualityData();
    var cats = dq.cats;
    var ALL_CATS = ['Duplicate records', 'Unmapped Room Type Codes', 'Unmapped Market Groups',
      'Unmapped Account Managers', 'Invalid Property–Room Type combinations', 'Missing Business Dates',
      'Invalid Arrival Dates', 'Invalid Departure Dates', 'Invalid Arrival Times', 'Invalid Departure Times',
      'Missing Arrival Rooms', 'Missing Departure Rooms', 'Missing Room Numbers', 'Missing Confirmation Numbers',
      'Negative numeric values', 'Room Type Occupancy above 100%', 'Zero adults and zero children',
      'Missing or unavailable Room Nights'];

    var grid = document.getElementById('dq-cards');
    grid.innerHTML = ALL_CATS.map(function (c) {
      var n = (cats[c] || []).length;
      return '<button type="button" class="dq-card' + (n ? ' has-issues' : '') + (activeQualityCat === c ? ' active' : '') + '" data-cat="' + UI.esc(c) + '">' +
        '<span class="dq-count">' + n.toLocaleString() + '</span><span class="dq-name">' + UI.esc(c) + '</span></button>';
    }).join('');
    grid.querySelectorAll('.dq-card').forEach(function (b) {
      b.addEventListener('click', function () {
        activeQualityCat = b.dataset.cat === activeQualityCat ? null : b.dataset.cat;
        renderQuality();
      });
    });

    var detailWrap = document.getElementById('dq-detail');
    if (activeQualityCat && (cats[activeQualityCat] || []).length) {
      document.getElementById('dq-detail-title').textContent = activeQualityCat + ' — detail';
      UI.table(detailWrap, {
        pageSize: 15,
        columns: [
          { key: 'srcFile', label: 'Source File' },
          { key: 'srcSheet', label: 'Worksheet' },
          { key: 'srcRow', label: 'Row', cls: 'num' },
          { key: 'property', label: 'Property' },
          { key: 'confirmation', label: 'Confirmation' },
          { key: 'businessDate', label: 'Business Date' },
          { key: 'field', label: 'Problem Field' },
          { key: 'value', label: 'Original Value' },
          { key: 'reason', label: 'Reason' },
          { key: 'suggestion', label: 'Suggested Correction' }
        ],
        rows: cats[activeQualityCat],
        emptyText: 'No issues'
      });
    } else {
      document.getElementById('dq-detail-title').textContent = 'Select a category above to inspect detail records';
      detailWrap.innerHTML = '';
    }

    document.getElementById('dq-export').onclick = function () {
      Exports.exportDataQuality(cats);
      UI.toast('Data Quality export downloaded', 'success');
    };

    var histRows = batches.map(function (b) {
      return {
        timestamp: b.timestamp.replace('T', ' ').substring(0, 19),
        fileName: b.fileName, sheetName: b.sheetName,
        coverage: (b.coverageFrom || '?') + ' → ' + (b.coverageTo || '?'),
        received: b.rowsReceived, appended: b.rowsAppended, updated: b.rowsUpdated,
        duplicates: b.duplicates, invalid: b.invalidRows, unmapped: b.unmappedRows,
        status: b.rolledBack ? 'Rolled back' : 'Active',
        _batch: b
      };
    });
    UI.table(document.getElementById('upload-history'), {
      pageSize: 10,
      columns: [
        { key: 'timestamp', label: 'Import Timestamp' },
        { key: 'fileName', label: 'File' },
        { key: 'sheetName', label: 'Worksheet' },
        { key: 'coverage', label: 'Date Coverage' },
        { key: 'received', label: 'Received', cls: 'num' },
        { key: 'appended', label: 'Appended', cls: 'num' },
        { key: 'updated', label: 'Updated', cls: 'num' },
        { key: 'duplicates', label: 'Duplicates', cls: 'num' },
        { key: 'invalid', label: 'Invalid', cls: 'num' },
        { key: 'unmapped', label: 'Unmapped', cls: 'num' },
        { key: 'status', label: 'Status' }
      ],
      rows: histRows,
      emptyText: 'No uploads yet'
    });

    document.getElementById('hist-export').onclick = function () {
      Exports.exportUploadHistory(batches);
      UI.toast('Upload history exported', 'success');
    };

    var latest = batches.filter(function (b) { return !b.rolledBack; })[0];
    var rbBtn = document.getElementById('rollback-latest');
    rbBtn.disabled = !latest;
    rbBtn.onclick = function () {
      if (!latest) return;
      UI.confirmDialog('Roll back latest upload',
        'This removes the ' + latest.rowsAppended + ' records appended by "' + latest.fileName +
        '" and restores the previous version of the ' + latest.rowsUpdated + ' records it updated. Continue?',
        { okLabel: 'Roll Back', danger: true }).then(function (ok) {
          if (!ok) return;
          UI.loader(true, 'Rolling back…');
          DB.rollbackBatch(latest).then(reloadFromDb).then(function () {
            UI.loader(false);
            UI.toast('Rollback complete', 'success');
            buildFilterBar(); refresh();
          }).catch(function (err) {
            UI.loader(false);
            UI.toast('Rollback failed: ' + err.message, 'error');
          });
        });
    };
  }

  /* ================= records modal / record detail ================= */
  function renderRecordsModal(recs, prefixHtml) {
    var body = document.getElementById('records-modal-body');
    body.innerHTML = (prefixHtml || '') + '<div id="records-modal-table"></div>' +
      '<div class="modal-actions"><button type="button" class="btn" id="records-export">Export These Records (CSV)</button></div>';
    UI.table(document.getElementById('records-modal-table'), {
      pageSize: 12,
      columns: [
        { key: 'Business Date', label: 'Business Date' },
        { key: 'Property', label: 'Property' },
        { key: '_rtg', label: 'Room Type' },
        { key: 'Room Number', label: 'Room' },
        { key: 'Guest Name', label: 'Guest' },
        { key: 'Arrival Date', label: 'Arrival' },
        { key: 'Departure Date', label: 'Departure' },
        { key: '_occ', label: 'Combination' },
        { key: '_seg', label: 'SEGGRP' },
        { key: 'Confirmation Number', label: 'Confirmation' }
      ],
      rows: recs,
      onRowClick: openRecordDetail,
      emptyText: 'No records'
    });
    document.getElementById('records-export').onclick = function () {
      Exports.exportDetailCsv(recs, 'flora_records_');
      UI.toast('Records exported', 'success');
    };
  }

  function openRecordsModal(title, recs) {
    document.getElementById('records-modal-title').textContent = title + ' (' + recs.length.toLocaleString() + ')';
    renderRecordsModal(recs, '');
    UI.openModal('records-modal');
  }

  function openRecordDetail(rec) {
    document.getElementById('record-detail-title').textContent =
      'Record — ' + (rec['Confirmation Number'] || 'no confirmation') + ' · ' + (rec['Business Date'] || '');
    var rows = FIELDS.map(function (f) {
      var v = rec[f];
      return '<tr><th>' + UI.esc(f) + '</th><td>' + UI.esc(v === null || v === undefined ? '' : v) + '</td></tr>';
    }).join('') +
      '<tr><th>Room Type Group</th><td>' + UI.esc(rec._rtg) + '</td></tr>' +
      '<tr><th>SEGGRP Group</th><td>' + UI.esc(rec._seg) + '</td></tr>' +
      '<tr><th>Account Manager Group</th><td>' + UI.esc(rec._amg) + '</td></tr>' +
      '<tr><th>Arrival Time Group</th><td>' + UI.esc(rec._atg) + '</td></tr>' +
      '<tr><th>Departure Time Group</th><td>' + UI.esc(rec._dtg) + '</td></tr>' +
      '<tr><th>Occupancy Combination</th><td>' + UI.esc(rec._occ) + '</td></tr>' +
      '<tr><th>Source</th><td>' + UI.esc((rec.srcFile || '') + ' · ' + (rec.srcSheet || '') + ' · row ' + (rec.srcRow || '')) + '</td></tr>' +
      '<tr><th>Batch</th><td>' + UI.esc(rec.batchId || '') + '</td></tr>';
    document.getElementById('record-detail-body').innerHTML = '<table class="detail-table">' + rows + '</table>';
    UI.openModal('record-detail-modal');
  }

  /* ================= upload wizard ================= */
  function bindHeaderActions() {
    document.getElementById('upload-btn').onclick = function () {
      document.getElementById('upload-input').click();
    };
    document.getElementById('welcome-upload-btn').onclick = function () {
      UI.closeModal('welcome-modal');
      document.getElementById('upload-input').click();
    };
    document.getElementById('upload-input').onchange = function (e) {
      if (e.target.files.length) startUpload(e.target.files[0]);
      e.target.value = '';
    };

    document.getElementById('export-menu-btn').onclick = function (e) {
      e.stopPropagation();
      document.getElementById('export-menu').classList.toggle('open');
    };
    document.addEventListener('click', function () {
      document.getElementById('export-menu').classList.remove('open');
    });

    document.getElementById('exp-summary').onclick = exportSummary;
    document.getElementById('exp-detail').onclick = function () {
      var basis = currentTab === 'departures' ? 'dd' : currentTab === 'arrivals' || currentTab === 'roomnumbers' || currentTab === 'combos' ? 'ad' : 'bd';
      Exports.exportDetailCsv(tyRecords(basis), 'flora_filtered_detail_');
      UI.toast('Filtered detail exported', 'success');
    };
    document.getElementById('exp-full').onclick = function () {
      Exports.exportFullDatabase(records);
      UI.toast('Full database exported', 'success');
    };
    document.getElementById('exp-backup').onclick = function () {
      Exports.backupJson(records, batches);
      UI.toast('JSON backup downloaded — keep it safe', 'success');
    };
    document.getElementById('exp-restore').onclick = function () {
      document.getElementById('restore-input').click();
    };
    document.getElementById('restore-input').onchange = function (e) {
      if (e.target.files.length) restoreBackup(e.target.files[0]);
      e.target.value = '';
    };
    document.getElementById('exp-print').onclick = function () { window.print(); };
    document.getElementById('exp-reset').onclick = resetDatabase;
  }

  function exportSummary() {
    var bdTy = tyRecords('bd'), adTy = tyRecords('ad'), ddTy = tyRecords('dd');
    var p = tyPeriod();
    var nTy = Calc.includedDates(p.from, p.to, latestBd).length;
    var rows = occCombosInScope().map(function (c) {
      function filt(list) { return list.filter(function (r) { return r['Property'] === c.property && r._rtg === c.rtg; }); }
      var rn = Calc.calculateRoomNightsSold(filt(bdTy));
      var avail = Calc.calculateAvailableRoomNights(c.property, c.rtg, nTy);
      return {
        'Property': c.property, 'Room Type Group': c.rtg, 'Physical Rooms': c.rooms,
        'Arrival Rooms': Calc.calculateArrivalRooms(filt(adTy)),
        'Departure Rooms': Calc.calculateDepartureRooms(filt(ddTy)),
        'Room Nights Sold': rn,
        'Available Room-Nights': avail,
        'Occupancy %': avail ? ((rn / avail) * 100).toFixed(1) : 'N/A',
        'Period From': p.from, 'Period To': p.to
      };
    });
    Exports.exportSummaryCsv(
      ['Property', 'Room Type Group', 'Physical Rooms', 'Arrival Rooms', 'Departure Rooms',
        'Room Nights Sold', 'Available Room-Nights', 'Occupancy %', 'Period From', 'Period To'],
      rows, 'flora_filtered_summary_');
    UI.toast('Filtered summary exported', 'success');
  }

  function startUpload(file) {
    UI.loader(true, 'Reading ' + file.name + '…');
    Importer.parseFile(file).then(function (parsed) {
      UI.loader(false);
      pendingUpload = { parsed: parsed, sheetIdx: 0, overrides: {} };
      var candidates = parsed.sheets.map(function (s, i) {
        return { i: i, name: s.name, rows: s.rows.length, headers: Importer.detectHeaders(s.rows) };
      });
      candidates.sort(function (a, b) { return b.headers.score - a.headers.score; });
      pendingUpload.sheetIdx = candidates[0].i;
      renderUploadStep1(candidates);
      UI.openModal('upload-modal');
    }).catch(function (err) {
      UI.loader(false);
      UI.toast('Could not read the file: ' + err.message, 'error');
    });
  }

  function renderUploadStep1(candidates) {
    var body = document.getElementById('upload-modal-body');
    document.getElementById('upload-modal-title').textContent = 'Upload — Step 1 of 3 · Select Worksheet';
    body.innerHTML =
      '<p class="upload-file-name">File: <strong>' + UI.esc(pendingUpload.parsed.fileName) + '</strong></p>' +
      '<div class="sheet-list">' + candidates.map(function (c) {
        return '<label class="sheet-option' + (c.i === pendingUpload.sheetIdx ? ' selected' : '') + '">' +
          '<input type="radio" name="sheet" value="' + c.i + '"' + (c.i === pendingUpload.sheetIdx ? ' checked' : '') + '>' +
          '<span class="sheet-name">' + UI.esc(c.name) + '</span>' +
          '<span class="sheet-meta">' + c.rows.toLocaleString() + ' rows · ' + c.headers.score + ' recognized fields</span>' +
          '</label>';
      }).join('') + '</div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn" id="upload-cancel">Cancel</button>' +
      '<button type="button" class="btn btn-primary" id="upload-next">Next — Field Mapping ›</button></div>';
    body.querySelectorAll('input[name=sheet]').forEach(function (r) {
      r.onchange = function () {
        pendingUpload.sheetIdx = +r.value;
        body.querySelectorAll('.sheet-option').forEach(function (o) { o.classList.remove('selected'); });
        r.closest('.sheet-option').classList.add('selected');
      };
    });
    document.getElementById('upload-cancel').onclick = cancelUpload;
    document.getElementById('upload-next').onclick = renderUploadStep2;
  }

  function renderUploadStep2() {
    var sheet = pendingUpload.parsed.sheets[pendingUpload.sheetIdx];
    var headerInfo = Importer.detectHeaders(sheet.rows);
    pendingUpload.headerInfo = headerInfo;
    if (headerInfo.rowIndex === -1 || !headerInfo.score) {
      UI.toast('No recognizable headers found on this worksheet. Choose another sheet.', 'error');
      return;
    }
    document.getElementById('upload-modal-title').textContent = 'Upload — Step 2 of 3 · Field Mapping';
    var body = document.getElementById('upload-modal-body');
    var opts = ['(ignore)'].concat(FIELDS);
    body.innerHTML =
      '<p>Header row detected at worksheet row <strong>' + (headerInfo.rowIndex + 1) + '</strong>. ' +
      'Confirm or adjust the mapping — ambiguous columns are safer ignored than guessed.</p>' +
      '<div class="table-scroll mapping-scroll"><table class="flora-table"><thead><tr>' +
      '<th>Source Column</th><th>Mapped Field</th></tr></thead><tbody>' +
      headerInfo.mapping.map(function (m) {
        var cur = pendingUpload.overrides.hasOwnProperty(m.col) ? pendingUpload.overrides[m.col] : m.field;
        return '<tr><td>' + UI.esc(m.source) + '</td><td><select data-col="' + m.col + '">' +
          opts.map(function (o) {
            var val = o === '(ignore)' ? '' : o;
            return '<option value="' + UI.esc(val) + '"' + ((cur || '') === val ? ' selected' : '') + '>' + UI.esc(o) + '</option>';
          }).join('') + '</select></td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn" id="upload-back">‹ Back</button>' +
      '<button type="button" class="btn" id="upload-cancel">Cancel</button>' +
      '<button type="button" class="btn btn-primary" id="upload-next">Next — Preview ›</button></div>';

    body.querySelectorAll('select[data-col]').forEach(function (sel) {
      sel.onchange = function () {
        pendingUpload.overrides[+sel.dataset.col] = sel.value || null;
      };
    });
    document.getElementById('upload-back').onclick = function () { startUploadStep1Again(); };
    document.getElementById('upload-cancel').onclick = cancelUpload;
    document.getElementById('upload-next').onclick = function () {
      var mapped = {};
      pendingUpload.headerInfo.mapping.forEach(function (m) {
        var f = pendingUpload.overrides.hasOwnProperty(m.col) ? pendingUpload.overrides[m.col] : m.field;
        if (f) mapped[f] = true;
      });
      if (!mapped['Business Date'] || !mapped['Property']) {
        UI.toast('Business Date and Property must both be mapped before continuing.', 'error');
        return;
      }
      renderUploadStep3();
    };
  }

  function startUploadStep1Again() {
    var candidates = pendingUpload.parsed.sheets.map(function (s, i) {
      return { i: i, name: s.name, rows: s.rows.length, headers: Importer.detectHeaders(s.rows) };
    });
    candidates.sort(function (a, b) { return b.headers.score - a.headers.score; });
    renderUploadStep1(candidates);
  }

  function renderUploadStep3() {
    UI.loader(true, 'Analyzing upload…');
    setTimeout(function () {
      try {
        var sheet = pendingUpload.parsed.sheets[pendingUpload.sheetIdx];
        var sourceMeta = { fileName: pendingUpload.parsed.fileName, sheetName: sheet.name };
        var candidates = Importer.buildRecords(sheet.rows, pendingUpload.headerInfo, pendingUpload.overrides, sourceMeta);
        var existingByKey = new Map();
        records.forEach(function (r) { existingByKey.set(r.key, r); });
        var cls = Importer.classify(candidates, existingByKey);
        pendingUpload.classification = cls;
        pendingUpload.sourceMeta = sourceMeta;
        UI.loader(false);

        document.getElementById('upload-modal-title').textContent = 'Upload — Step 3 of 3 · Preview & Confirm';
        var body = document.getElementById('upload-modal-body');
        function statCard(label, value, cls2) {
          return '<div class="stat-card ' + (cls2 || '') + '"><span class="stat-value">' + value.toLocaleString() + '</span><span class="stat-label">' + label + '</span></div>';
        }
        function unmappedList(title, map) {
          if (!map.size) return '';
          var items = [];
          map.forEach(function (v, k) { items.push(UI.esc(k) + ' (' + v + ')'); });
          return '<div class="unmapped-block"><strong>' + title + ':</strong> ' + items.join(' · ') + '</div>';
        }
        body.innerHTML =
          '<p class="upload-file-name">File: <strong>' + UI.esc(sourceMeta.fileName) + '</strong> · Worksheet: <strong>' + UI.esc(sourceMeta.sheetName) + '</strong>' +
          ' · Coverage: <strong>' + (cls.minBd || '?') + ' → ' + (cls.maxBd || '?') + '</strong>' +
          ' · Properties: <strong>' + Array.from(cls.properties).join(', ') + '</strong></p>' +
          '<div class="stat-grid">' +
          statCard('Total Rows', cls.total) +
          statCard('New Records', cls.newRecords.length, 'good') +
          statCard('Updated Records', cls.updates.length, 'info') +
          statCard('Exact Duplicates (skipped)', cls.duplicates, 'muted') +
          statCard('Invalid Rows', cls.invalid.length, cls.invalid.length ? 'bad' : 'muted') +
          '</div>' +
          unmappedList('Unmapped Room Types', cls.unmappedRoomTypes) +
          unmappedList('Unmapped Market Groups', cls.unmappedMarketGroups) +
          unmappedList('Unmapped Account Managers', cls.unmappedAccountManagers) +
          unmappedList('Invalid Property–Room Type combinations', cls.invalidCombos) +
          (cls.invalid.length ? '<div class="unmapped-block bad"><strong>Invalid row examples:</strong> ' +
            cls.invalid.slice(0, 5).map(function (iv) {
              return 'row ' + iv.rec._srcRow + ' (' + iv.problems.map(function (p) { return p.reason; }).join('; ') + ')';
            }).join(' · ') + '</div>' : '') +
          '<p class="upload-note">Confirming will append new records, update matching records, and skip duplicates. Historical records are never removed. The import can be rolled back afterwards.</p>' +
          '<div class="modal-actions">' +
          '<button type="button" class="btn" id="upload-back">‹ Back</button>' +
          '<button type="button" class="btn" id="upload-cancel">Cancel</button>' +
          '<button type="button" class="btn btn-primary" id="upload-confirm"' + ((cls.newRecords.length + cls.updates.length) ? '' : ' disabled') + '>Confirm Import</button></div>';

        document.getElementById('upload-back').onclick = renderUploadStep2;
        document.getElementById('upload-cancel').onclick = cancelUpload;
        document.getElementById('upload-confirm').onclick = confirmUpload;
      } catch (err) {
        UI.loader(false);
        UI.toast('Preview failed: ' + err.message, 'error');
      }
    }, 30);
  }

  function confirmUpload() {
    UI.loader(true, 'Importing…');
    Importer.commit(pendingUpload.classification, pendingUpload.sourceMeta).then(function (batch) {
      return reloadFromDb().then(function () {
        UI.loader(false);
        UI.closeModal('upload-modal');
        UI.toast('Imported: ' + batch.rowsAppended + ' new, ' + batch.rowsUpdated + ' updated, ' +
          batch.duplicates + ' duplicates skipped', 'success');
        pendingUpload = null;
        buildFilterBar();
        refresh();
      });
    }).catch(function (err) {
      UI.loader(false);
      UI.toast('Import failed — nothing was written: ' + err.message, 'error');
    });
  }

  function cancelUpload() {
    pendingUpload = null;
    UI.closeModal('upload-modal');
  }

  /* ================= backup / restore / reset ================= */
  function restoreBackup(file) {
    Exports.parseBackup(file).then(function (payload) {
      return UI.confirmDialog('Restore JSON backup',
        'This replaces the current database (' + records.length.toLocaleString() + ' records) with the backup (' +
        payload.records.length.toLocaleString() + ' records, exported ' + (payload.exportedAt || 'unknown') + '). Continue?',
        { okLabel: 'Restore', danger: true }).then(function (ok) {
          if (!ok) return null;
          UI.loader(true, 'Restoring backup…');
          return DB.restoreBackup(payload.records, payload.batches).then(reloadFromDb).then(function () {
            UI.loader(false);
            UI.toast('Backup restored', 'success');
            buildFilterBar(); refresh();
          });
        });
    }).catch(function (err) {
      UI.loader(false);
      UI.toast('Restore failed: ' + err.message, 'error');
    });
  }

  function resetDatabase() {
    UI.confirmDialog('Reset database',
      'This permanently deletes all ' + records.length.toLocaleString() + ' stored records and the full upload history from this browser. Export a JSON backup first if you may need the data again.',
      { okLabel: 'Delete Everything', danger: true, requireText: 'RESET' }).then(function (ok) {
        if (!ok) return;
        UI.loader(true, 'Resetting…');
        DB.clearAll().then(reloadFromDb).then(function () {
          UI.loader(false);
          UI.toast('Database reset', 'success');
          buildFilterBar(); refresh();
        }).catch(function (err) {
          UI.loader(false);
          UI.toast('Reset failed: ' + err.message, 'error');
        });
      });
  }

  return { init: init };
})();

document.addEventListener('DOMContentLoaded', App.init);
