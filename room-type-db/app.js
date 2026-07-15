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

    var p = tyPeriod();
    var dates = Calc.includedDates(p.from, p.to, latestBd);
    var occRows = occupancyByRtg(bdTy, bdLy, dates.length);
    Charts.vbar('ov-occ', occRows, { pct: true, tyLabel: 'Occupancy %' });

    renderSingleTrend('ov-arr-trend', adTy, adLy, 'Arrival Date', 'Arrival Rooms', 'Arrivals');
    renderSingleTrend('ov-dep-trend', ddTy, ddLy, 'Departure Date', 'Departure Rooms', 'Departures');
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

  /* Dedicated daily trend for a single flow (arrivals OR departures):
   * TY line + LY line; tooltip carries TY, LY, and variance per day. */
  function renderSingleTrend(elId, tyRecs, lyRecs, dateField, valueField, label) {
    var p = tyPeriod();
    var dates = Calc.includedDates(p.from, p.to, latestBd);
    if (!dates.length) { Charts.noData(elId); return; }
    function daily(recs) {
      var m = {};
      recs.forEach(function (r) {
        var v = r[valueField];
        if (v === null || v <= 0) return;
        m[r[dateField]] = (m[r[dateField]] || 0) + v;
      });
      return m;
    }
    var tyByDay = daily(tyRecs);
    var lyByDay = daily(lyRecs);
    var lyDates = dates.map(function (d) { return Calc.shiftYear(d, -1); });
    var tyData = dates.map(function (d) { return tyByDay[d] || 0; });
    var lyData = lyDates.map(function (d) { return lyByDay[d] || 0; });
    var mode = Filters.state.comparisonMode;
    var series = [];
    if (mode !== 'ly') series.push({ name: label, data: tyData, color: FLORA.tyColor });
    if (mode !== 'ty' && lyRecs.length) series.push({ name: label + ' LY', data: lyData, color: FLORA.lyColor });
    var chart = (function () { Charts.line(elId, dates.map(function (d) { return d.substring(5); }), series); })();
    // richer tooltip with variance
    var inst = echarts.getInstanceByDom(document.getElementById(elId));
    if (inst) {
      inst.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: function (params) {
            var i = params[0].dataIndex;
            var html = '<strong>' + dates[i] + '</strong>';
            if (mode !== 'ly') html += '<br/>' + label + ': ' + Calc.fmtInt(tyData[i]);
            if (mode !== 'ty' && lyRecs.length) {
              html += '<br/>LY (' + lyDates[i] + '): ' + Calc.fmtInt(lyData[i]);
              var v = Calc.calculateVariance(tyData[i], lyData[i]);
              html += '<br/>Variance: ' + Calc.fmtVarAbs(v.abs) + ' (' + Calc.fmtVarPct(v.pct) + ')';
            }
            return html;
          }
        },
        series: series.map(function (s, idx) {
          return {
            label: idx === 0 && dates.length <= 14
              ? { show: true, position: 'top', fontSize: 9.5, formatter: function (pp) { return Charts.fmtShort(pp.value); } }
              : { show: false }
          };
        })
      });
    }
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

    // Property Occupancy gauge: occupied ÷ sellable × 100 for the scope
    var occT = tyOccupancy(bdTy);
    var occL = hasLy ? lyOccupancy(bdLy) : { pct: null };
    Charts.gauge('rt-gauge', occT.pct, occL.pct, 'Property Occupancy');
    document.getElementById('rt-gauge-detail').innerHTML = occT.pct === null
      ? '<span class="muted">No valid inventory in scope</span>'
      : 'Occupied ' + Calc.fmtInt(occT.sold) + ' of ' + Calc.fmtInt(occT.available) + ' sellable room-nights' +
        (hasLy && occL.pct !== null ? ' · LY ' + Calc.fmtPct(occL.pct) + ' <span class="muted">(' + Calc.fmtPp(Calc.calculatePercentagePointVariance(occT.pct, occL.pct)) + ')</span>' : '');

    // Room Type Share of Property Occupancy: occupied rooms per RTG ÷ total occupied
    var occShare = shareRows(byGroupTyLy(
      bdTy.filter(function (r) { return r._validCombo; }),
      bdLy.filter(function (r) { return r._validCombo; }),
      function (r) { return r._rtg; }, Calc.calculateRoomNightsSold));
    Charts.hbar('rt-occ-share', occShare, { pct: true, tyLabel: 'Share of Occupied' });

    renderRtOccTrend(bdTy, bdLy);
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
    var tyData = dailyOcc(bdTy, dates);
    var lyData = dailyOcc(bdLy, lyDates);
    var series = [];
    var mode = Filters.state.comparisonMode;
    if (mode !== 'ly') series.push({ name: 'Occupancy %', data: tyData, color: FLORA.tyColor });
    if (mode !== 'ty' && bdLy.length) series.push({ name: 'Occupancy % LY', data: lyData, color: FLORA.lyColor });
    Charts.line('rt-occ-trend', dates.map(function (d) { return d.substring(5); }), series, { pct: true });
    // capacity reference (100%) + full tooltip with variance
    var inst = echarts.getInstanceByDom(document.getElementById('rt-occ-trend'));
    if (inst) {
      inst.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: function (params) {
            var i = params[0].dataIndex;
            var html = '<strong>' + dates[i] + '</strong>';
            if (mode !== 'ly') html += '<br/>Occupancy: ' + Calc.fmtPct(tyData[i]);
            if (mode !== 'ty' && bdLy.length) {
              html += '<br/>LY (' + lyDates[i] + '): ' + Calc.fmtPct(lyData[i]);
              html += '<br/>Variance: ' + Calc.fmtPp(Calc.calculatePercentagePointVariance(tyData[i], lyData[i]));
            }
            html += '<br/><span class="muted">Capacity reference: 100%</span>';
            return html;
          }
        },
        yAxis: { max: function (value) { return Math.max(100, Math.ceil(value.max / 10) * 10); } },
        series: [{
          markLine: {
            silent: true, symbol: 'none',
            lineStyle: { color: '#B3413D', type: 'dashed', width: 1 },
            label: { formatter: 'Capacity 100%', fontSize: 10, color: '#B3413D' },
            data: [{ yAxis: 100 }]
          }
        }]
      });
    }
  }

  /* ================= Tab 3 — Guest Occupancy Combinations ================= */
  var cmbMetric = 'arrivals';

  var CMB_METRICS = {
    arrivals: { label: 'Arrivals', fmt: Calc.fmtInt },
    reservations: { label: 'Reservations', fmt: Calc.fmtInt },
    roomnights: { label: 'Room Nights', fmt: Calc.fmtInt },
    revenue: { label: 'Revenue', fmt: function (v) { return v === null ? 'N/A' : Charts.fmtShort(v); } },
    adr: { label: 'ADR', fmt: function (v) { return v === null ? 'N/A' : v.toFixed(1); } },
    share: { label: 'Share %', fmt: Calc.fmtPct }
  };

  /* Aggregate every metric per Adults|Children cell in one pass. */
  function comboCellStats(adRecs, bdRecs) {
    var cells = {};
    function cell(a, c) {
      var k = a + '|' + c;
      return cells[k] || (cells[k] = { arrivals: 0, reservations: 0, confs: {}, roomnights: 0, revenue: 0, rtgs: {} });
    }
    adRecs.forEach(function (r) {
      var a = r['Adults'], c = r['Children'];
      if (a === null || c === null || r._occ === 'Invalid') return;
      var ar = r['Arrival Rooms'];
      if (ar !== null && ar > 0) {
        var cl = cell(a, c);
        cl.arrivals += ar;
        var conf = r['Confirmation Number'] || (r['Guest Name'] + '|' + r['Arrival Date']);
        if (!cl.confs[conf]) { cl.confs[conf] = 1; cl.reservations++; }
        cl.rtgs[r._rtg] = (cl.rtgs[r._rtg] || 0) + ar;
      }
    });
    bdRecs.forEach(function (r) {
      var a = r['Adults'], c = r['Children'];
      if (a === null || c === null || r._occ === 'Invalid') return;
      var cl = cell(a, c);
      if (r['Room Nights'] !== null) cl.roomnights += r['Room Nights'];
      if (r['Revenue'] !== null) cl.revenue += r['Revenue'];
    });
    return cells;
  }

  function comboMetricValue(cl, totalArrivals) {
    if (!cl) return null;
    if (cmbMetric === 'arrivals') return cl.arrivals || null;
    if (cmbMetric === 'reservations') return cl.reservations || null;
    if (cmbMetric === 'roomnights') return cl.roomnights || null;
    if (cmbMetric === 'revenue') return cl.revenue || null;
    if (cmbMetric === 'adr') return cl.roomnights > 0 ? cl.revenue / cl.roomnights : null;
    if (cmbMetric === 'share') return totalArrivals > 0 && cl.arrivals ? (cl.arrivals / totalArrivals) * 100 : null;
    return null;
  }

  function renderCombos() {
    var adTy = tyRecords('ad'), adLy = lyRecords('ad');
    var bdTy = tyRecords('bd');

    document.querySelectorAll('#cmb-metric button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.metric === cmbMetric);
      b.onclick = function () { cmbMetric = b.dataset.metric; renderCombos(); };
    });

    // Fixed matrix per spec: rows 1–8 adults, columns 0–6 children
    var ADULT_ROWS = [1, 2, 3, 4, 5, 6, 7, 8];
    var CHILD_COLS = [0, 1, 2, 3, 4, 5, 6];
    var cells = comboCellStats(adTy, bdTy);
    var totalArrivals = 0;
    Object.keys(cells).forEach(function (k) { totalArrivals += cells[k].arrivals; });
    var md = CMB_METRICS[cmbMetric];

    function cl(r, c) { return cells[ADULT_ROWS[r] + '|' + CHILD_COLS[c]]; }
    function val(r, c) { return comboMetricValue(cl(r, c), totalArrivals); }
    function sumRow(r) {
      var agg = { arrivals: 0, reservations: 0, roomnights: 0, revenue: 0 };
      CHILD_COLS.forEach(function (_, c) {
        var x = cl(r, c); if (!x) return;
        agg.arrivals += x.arrivals; agg.reservations += x.reservations;
        agg.roomnights += x.roomnights; agg.revenue += x.revenue;
      });
      return comboMetricValue(agg, totalArrivals);
    }
    function sumCol(c) {
      var agg = { arrivals: 0, reservations: 0, roomnights: 0, revenue: 0 };
      ADULT_ROWS.forEach(function (_, r) {
        var x = cl(r, c); if (!x) return;
        agg.arrivals += x.arrivals; agg.reservations += x.reservations;
        agg.roomnights += x.roomnights; agg.revenue += x.revenue;
      });
      return comboMetricValue(agg, totalArrivals);
    }
    var grandAgg = { arrivals: 0, reservations: 0, roomnights: 0, revenue: 0 };
    Object.keys(cells).forEach(function (k) {
      var x = cells[k];
      grandAgg.arrivals += x.arrivals; grandAgg.reservations += x.reservations;
      grandAgg.roomnights += x.roomnights; grandAgg.revenue += x.revenue;
    });

    UI.heatTable(document.getElementById('cmb-heatmap'), {
      corner: 'Adults ↓ / Children →',
      rowLabels: ADULT_ROWS.map(function (a) { return a + (a === 1 ? ' Adult' : ' Adults'); }),
      colLabels: CHILD_COLS.map(function (c) { return c + (c === 1 ? ' Child' : ' Children'); }),
      value: val,
      fmt: function (v) { return v === null ? '–' : md.fmt(v); },
      rowTotal: sumRow,
      colTotal: sumCol,
      grandTotal: comboMetricValue(grandAgg, totalArrivals),
      title: function (r, c, v) {
        var x = cl(r, c);
        if (!x) return 'No records for this combination';
        var topRtgs = Object.keys(x.rtgs).sort(function (p, q) { return x.rtgs[q] - x.rtgs[p]; }).slice(0, 3).join(', ');
        var adr = x.roomnights > 0 ? (x.revenue / x.roomnights).toFixed(1) : 'N/A';
        var share = totalArrivals > 0 ? Calc.fmtPct((x.arrivals / totalArrivals) * 100) : 'N/A';
        return ADULT_ROWS[r] + ' Adults + ' + CHILD_COLS[c] + ' Children (guests: ' + (ADULT_ROWS[r] + CHILD_COLS[c]) + ')' +
          '\nRoom types: ' + (topRtgs || '–') +
          '\nArrivals: ' + Calc.fmtInt(x.arrivals) + ' · Reservations: ' + Calc.fmtInt(x.reservations) +
          '\nRoom nights: ' + Calc.fmtInt(x.roomnights) + ' · Revenue: ' + Charts.fmtShort(x.revenue) +
          '\nADR: ' + adr + ' · Share: ' + share;
      },
      onCellClick: function (r, c) {
        var a = ADULT_ROWS[r], ch = CHILD_COLS[c];
        var parts = [];
        if (a > 0) parts.push(a + (a === 1 ? ' Adult' : ' Adults'));
        if (ch > 0) parts.push(ch + (ch === 1 ? ' Child' : ' Children'));
        var combo = parts.join(' + ');
        Filters.state.occupancyCombos = [combo];
        Filters.save();
        buildFilterBar();
        refresh();
        UI.toast('Filtered all visuals to ' + combo + ' — clear the chip to reset', 'info');
      }
    });

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

    renderMonthlyRtSummary();
  }

  /* Monthly summary of arrivals by room type: count, share of month, MoM
   * movement, LY comparison, variance in value and percent. Uses all loaded
   * months (period filters intentionally not applied so movement is visible). */
  function renderMonthlyRtSummary() {
    var allAd = allPeriodRecords('ad');
    var byMonth = Calc.groupBy(allAd, function (r) { return r._adMonth; });
    var monthList = Object.keys(byMonth).sort();
    var rows = [];
    monthList.forEach(function (m, mi) {
      var monthRecs = byMonth[m];
      var monthTotal = Calc.calculateArrivalRooms(monthRecs);
      var byRtg = Calc.groupBy(monthRecs, function (r) { return r._rtg; });
      Object.keys(byRtg).sort().forEach(function (g) {
        var ty = Calc.calculateArrivalRooms(byRtg[g]);
        var prevMonth = mi > 0 ? monthList[mi - 1] : null;
        var mom = null;
        if (prevMonth) {
          var prevRecs = (Calc.groupBy(byMonth[prevMonth], function (r) { return r._rtg; })[g]) || [];
          mom = Calc.calculateArrivalRooms(prevRecs);
        }
        var lyMonth = Calc.shiftMonth(m, -1);
        var lyRecs = byMonth[lyMonth]
          ? (Calc.groupBy(byMonth[lyMonth], function (r) { return r._rtg; })[g] || [])
          : null;
        var ly = lyRecs === null ? null : Calc.calculateArrivalRooms(lyRecs);
        rows.push({
          month: m, rtg: g, ty: ty,
          share: Calc.share(ty, monthTotal),
          mom: mom, ly: ly
        });
      });
    });
    rows.sort(function (a, b) { return a.month === b.month ? b.ty - a.ty : (a.month < b.month ? 1 : -1); });
    UI.table(document.getElementById('cmb-trend'), {
      pageSize: 14,
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'rtg', label: 'Room Type' },
        { key: 'ty', label: 'Arrivals', cls: 'num', fmt: Calc.fmtInt },
        { key: 'share', label: 'Share of Month', cls: 'num', fmt: Calc.fmtPct },
        { key: 'momv', label: 'MoM', cls: 'num', html: true, fmt: function (v, r) { return r.mom === null ? '<span class="muted">–</span>' : UI.varianceHtml(r.ty, r.mom); } },
        { key: 'ly', label: 'Last Year', cls: 'num', fmt: function (v) { return v === null ? 'N/A' : Calc.fmtInt(v); } },
        { key: 'lyv', label: 'vs LY', cls: 'num', html: true, fmt: function (v, r) { return UI.varianceHtml(r.ty, r.ly); } }
      ],
      rows: rows,
      emptyText: 'No arrival data loaded'
    });
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

    // Hourly distribution: 24 one-hour intervals (+ Unknown when present)
    var tyTotals = Calc.timeGroupTotals(tyR, groupField, roomsField);
    var lyTotals = Calc.timeGroupTotals(lyR, groupField, roomsField);
    var distRows = TIME_GROUPS.map(function (g) {
      return { name: g.short, full: g.label, ty: tyTotals[g.label] || 0, ly: lyR.length ? (lyTotals[g.label] || 0) : null };
    });
    if (tyTotals[TIME_GROUP_UNKNOWN] || lyTotals[TIME_GROUP_UNKNOWN]) {
      distRows.push({ name: 'Unk', full: TIME_GROUP_UNKNOWN, ty: tyTotals[TIME_GROUP_UNKNOWN] || 0, ly: lyR.length ? (lyTotals[TIME_GROUP_UNKNOWN] || 0) : null });
    }
    Charts.vbar(prefix + '-dist', distRows, {
      tyLabel: label + ' Rooms',
      onClick: function (row) {
        openRecordsModal(label + 's — ' + row.full, tyR.filter(function (r) {
          return r[groupField] === row.full && (r[roomsField] || 0) > 0;
        }));
      }
    });

    // Hour × day-of-week heatmap with peak periods highlighted via intensity
    renderHourDowHeatmap(prefix + '-dow-heat', tyR, dateField, groupField, roomsField, label);

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

    // Room-type hourly pattern table: volume, share, peak hour, TY/LY, variance
    renderRtgPatternTable(prefix + '-rtg-table', tyR, lyR, groupField, roomsField, label);

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

  /* Hour-of-day × day-of-week heatmap; peaks stand out through intensity. */
  function renderHourDowHeatmap(elId, recs, dateField, groupField, roomsField, label) {
    var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var grid = {};
    var total = 0;
    recs.forEach(function (r) {
      var w = r[roomsField];
      if (w === null || w === undefined || w <= 0) return;
      var d = r[dateField];
      if (!d) return;
      var g = r[groupField];
      var hourIdx = -1;
      for (var i = 0; i < TIME_GROUPS.length; i++) if (TIME_GROUPS[i].label === g) { hourIdx = i; break; }
      if (hourIdx === -1) return; // Unknown times excluded from the grid, shown in DQ
      var p = d.split('-');
      var dow = (new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay() + 6) % 7; // Mon=0
      var k = hourIdx + '|' + dow;
      grid[k] = (grid[k] || 0) + w;
      total += w;
    });
    var cells = [];
    Object.keys(grid).forEach(function (k) {
      var p = k.split('|');
      cells.push([+p[0], +p[1], grid[k]]);
    });
    Charts.heatmap(elId, TIME_GROUPS.map(function (g) { return g.short; }), DOW, cells, {
      cellLabel: function (v) {
        var share = total > 0 ? Calc.fmtPct((v[2] / total) * 100) : 'N/A';
        return DOW[v[1]] + ' ' + TIME_GROUPS[v[0]].label + '\n' + label + ' rooms: ' + Calc.fmtInt(v[2]) + ' · Share: ' + share;
      }
    });
  }

  /* Per-room-type hourly pattern summary table. */
  function renderRtgPatternTable(elId, tyR, lyR, groupField, roomsField, label) {
    var tyG = Calc.groupBy(tyR, function (r) { return r._rtg; });
    var lyG = Calc.groupBy(lyR, function (r) { return r._rtg; });
    var tyTotal = Calc.sumField(tyR, roomsField);
    var names = {};
    Object.keys(tyG).forEach(function (k) { names[k] = 1; });
    Object.keys(lyG).forEach(function (k) { names[k] = 1; });
    var rows = Object.keys(names).filter(function (g) { return g !== UNMAPPED || Filters.state.includeUnmapped; }).map(function (g) {
      var ty = Calc.sumField(tyG[g] || [], roomsField);
      var ly = lyR.length ? Calc.sumField(lyG[g] || [], roomsField) : null;
      var peak = Calc.peakTimeGroups(Calc.timeGroupTotals(tyG[g] || [], groupField, roomsField));
      var props = {};
      (tyG[g] || []).forEach(function (r) { if ((r[roomsField] || 0) > 0) props[r['Property']] = 1; });
      return {
        rtg: g, property: Object.keys(props).sort().join(', ') || '—',
        ty: ty, ly: ly, share: Calc.share(ty, tyTotal),
        peak: peak.peaks.join(' & ') || 'N/A', peakRooms: peak.value
      };
    }).sort(function (a, b) { return b.ty - a.ty; });
    UI.table(document.getElementById(elId), {
      pageSize: 12,
      columns: [
        { key: 'rtg', label: 'Room Type' },
        { key: 'property', label: 'Property' },
        { key: 'ty', label: label + ' Rooms TY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'ly', label: label + ' Rooms LY', cls: 'num', fmt: function (v) { return v === null ? 'N/A' : Calc.fmtInt(v); } },
        { key: 'var', label: 'Variance', cls: 'num', html: true, fmt: function (v, r) { return UI.varianceHtml(r.ty, r.ly); } },
        { key: 'share', label: 'Share', cls: 'num', fmt: Calc.fmtPct },
        { key: 'peak', label: 'Peak ' + label + ' Hour' },
        { key: 'peakRooms', label: 'Rooms in Peak', cls: 'num', fmt: Calc.fmtInt }
      ],
      rows: rows,
      emptyText: 'No ' + label.toLowerCase() + ' records in the current selection'
    });
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
    var shortLabels = TIME_GROUPS.map(function (g) { return g.short; }).concat(['Unk']);
    Charts.heatmap(elId, shortLabels, rowNames, cells, {
      cellLabel: function (v) { return rowNames[v[1]] + ' · ' + TIME_GROUP_LABELS[v[0]] + ': ' + Calc.fmtInt(v[2]); }
    });
  }

  /* ================= Tab 6 — Room Number Statistics ================= */
  var rnRtgFilter = '';   // section-local room-type slicer
  var rnHeatMetric = 'arrivals';

  function renderRoomNumbers() {
    var adTyAll = tyRecords('ad'), adLyAll = lyRecords('ad');
    var bdTyAll = tyRecords('bd');

    // Section slicer: narrow this tab's visuals to one Room Type Group
    var rtgSet = {};
    adTyAll.forEach(function (r) { if (r._rtg && (Filters.state.includeUnmapped || r._rtg !== UNMAPPED)) rtgSet[r._rtg] = 1; });
    var rtgList = Object.keys(rtgSet).sort();
    if (rnRtgFilter && rtgList.indexOf(rnRtgFilter) === -1) rnRtgFilter = '';
    var slicer = document.getElementById('rn-rtg-slicer');
    slicer.innerHTML = '<button type="button" data-rtg="" class="' + (rnRtgFilter === '' ? 'active' : '') + '">All Room Types</button>' +
      rtgList.map(function (g) {
        return '<button type="button" data-rtg="' + UI.esc(g) + '" class="' + (rnRtgFilter === g ? 'active' : '') + '">' + UI.esc(g) + '</button>';
      }).join('');
    slicer.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { rnRtgFilter = b.dataset.rtg; renderRoomNumbers(); };
    });

    function bySlicer(list) {
      return rnRtgFilter ? list.filter(function (r) { return r._rtg === rnRtgFilter; }) : list;
    }
    var adTy = bySlicer(adTyAll), adLy = bySlicer(adLyAll), bdTy = bySlicer(bdTyAll);
    var arrOnly = adTy.filter(function (r) { return (r['Arrival Rooms'] || 0) > 0 && r['Room Number']; });

    var rows = byGroupTyLy(adTy, adLy, function (r) { return r['Room Number'] || ''; }, Calc.calculateArrivalRooms)
      .filter(function (r) { return r.name && (r.ty > 0 || (r.ly || 0) > 0); })
      .sort(function (a, b) { return (b.ty || 0) - (a.ty || 0); });

    // enrich tooltip data: room type + room nights per room
    var infoByRoom = {};
    arrOnly.forEach(function (r) {
      var i = infoByRoom[r['Room Number']] || (infoByRoom[r['Room Number']] = { rtgs: {}, rn: 0 });
      i.rtgs[r._rtg] = 1;
    });
    bdTy.forEach(function (r) {
      if (!r['Room Number'] || r['Room Nights'] === null) return;
      var i = infoByRoom[r['Room Number']] || (infoByRoom[r['Room Number']] = { rtgs: {}, rn: 0 });
      i.rn += r['Room Nights'];
    });
    var topRows = rows.slice(0, 20).map(function (r) {
      var i = infoByRoom[r.name] || { rtgs: {}, rn: 0 };
      r.share = null;
      r.tooltipExtra = 'Room type: ' + (Object.keys(i.rtgs).join(', ') || '—') + ' · Room nights: ' + Calc.fmtInt(i.rn);
      return r;
    });
    Charts.hbar('rn-top', topRows, {
      tyLabel: 'Arrival Rooms',
      onClick: function (row) { openRoomDrilldown(row.name, adTy); }
    });
    var inst = echarts.getInstanceByDom(document.getElementById('rn-top'));
    if (inst) {
      inst.setOption({
        tooltip: {
          formatter: function (params) {
            var list = Array.isArray(params) ? params : [params];
            var row = topRows.slice().sort(function (a, b) { return (a.ty || 0) - (b.ty || 0); })[list[0].dataIndex];
            var html = '<strong>Room ' + UI.esc(row.name) + '</strong><br/>' + row.tooltipExtra;
            html += '<br/>Arrivals TY: ' + Calc.fmtInt(row.ty);
            if (row.ly !== null && row.ly !== undefined) {
              var v = Calc.calculateVariance(row.ty, row.ly);
              html += '<br/>Arrivals LY: ' + Calc.fmtInt(row.ly) + '<br/>Variance: ' + Calc.fmtVarAbs(v.abs) + ' (' + Calc.fmtVarPct(v.pct) + ')';
            }
            return html;
          }
        }
      });
    }

    renderRoomMonthHeat(bdTy, adTy);
    renderFloorAnalysis(adTy, adLy, bdTy);

    var tableRows = rows.slice(0, 200).map(function (r) {
      var recs = arrOnly.filter(function (x) { return x['Room Number'] === r.name; });
      var info = infoByRoom[r.name] || { rn: 0 };
      r.roomNights = info.rn;
      var combos = Calc.occupancyCombinations(recs);
      var topCombo = Object.keys(combos).sort(function (a, b) { return combos[b] - combos[a]; })[0] || 'N/A';
      var peak = Calc.calculatePeakArrivalGroup(recs);
      var props = {};
      recs.forEach(function (x) { props[x['Property']] = 1; });
      var rtgsHere = {};
      recs.forEach(function (x) { rtgsHere[x._rtg] = 1; });
      return {
        room: r.name, property: Object.keys(props).join(', '),
        rtg: Object.keys(rtgsHere).sort().join(', ') || '—',
        roomNights: info.rn,
        ty: r.ty, ly: r.ly, topCombo: topCombo,
        peak: peak.peaks.join(' & ') || 'N/A'
      };
    });
    UI.table(document.getElementById('rn-table'), {
      pageSize: 15,
      columns: [
        { key: 'room', label: 'Room Number' },
        { key: 'property', label: 'Property' },
        { key: 'rtg', label: 'Room Type' },
        { key: 'ty', label: 'Arrivals TY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'ly', label: 'Arrivals LY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'var', label: 'Variance', cls: 'num', html: true, fmt: function (v, r) { return UI.varianceHtml(r.ty, r.ly); } },
        { key: 'roomNights', label: 'Room Nights', cls: 'num', fmt: Calc.fmtInt },
        { key: 'topCombo', label: 'Top Combination' },
        { key: 'peak', label: 'Peak Arrival Hour' }
      ],
      rows: tableRows,
      onRowClick: function (row) { openRoomDrilldown(row.room, adTy); },
      emptyText: 'No arrival records in the current selection'
    });
  }

  /* Room Number × Month heatmap: rooms as rows, each loaded/selected month as
   * a column (never expanded to days), switchable metric, totals + tooltips. */
  var RN_HEAT_METRICS = {
    arrivals: { label: 'Arrivals', fmt: Calc.fmtInt },
    roomnights: { label: 'Room Nights', fmt: Calc.fmtInt },
    occupancy: { label: 'Occupancy %', fmt: Calc.fmtPct },
    revenue: { label: 'Revenue', fmt: function (v) { return v === null ? '–' : Charts.fmtShort(v); } }
  };

  function renderRoomMonthHeat(bdTy, adTy) {
    document.querySelectorAll('#rn-heat-metric button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.metric === rnHeatMetric);
      b.onclick = function () { rnHeatMetric = b.dataset.metric; renderRoomMonthHeat(tyRecords('bd'), tyRecords('ad')); };
    });
    var container = document.getElementById('rn-heatmap');

    // months: the selected months when the Month filter is active, else all loaded
    var monthsSel = Filters.state.months.slice().sort();
    var allAd = allPeriodRecords('ad');
    var allBd = allPeriodRecords('bd');
    if (rnRtgFilter) {
      allAd = allAd.filter(function (r) { return r._rtg === rnRtgFilter; });
      allBd = allBd.filter(function (r) { return r._rtg === rnRtgFilter; });
    }
    if (!monthsSel.length) {
      var mset = {};
      allBd.forEach(function (r) { if (r._bdMonth) mset[r._bdMonth] = 1; });
      monthsSel = Object.keys(mset).sort();
    }
    if (!monthsSel.length) { container.innerHTML = '<div class="no-data">No Data</div>'; return; }

    // top rooms by TY arrivals in scope
    var arrByRoom = {};
    adTy.forEach(function (r) {
      var w = r['Arrival Rooms'];
      if (w === null || w <= 0 || !r['Room Number']) return;
      arrByRoom[r['Room Number']] = (arrByRoom[r['Room Number']] || 0) + w;
    });
    var roomList = Object.keys(arrByRoom).sort(function (a, b) { return arrByRoom[b] - arrByRoom[a]; }).slice(0, 15);
    if (!roomList.length) { container.innerHTML = '<div class="no-data">No arrival records in the current selection</div>'; return; }

    // per room per month aggregates
    var agg = {};
    function cell(room, m) { var k = room + '|' + m; return agg[k] || (agg[k] = { arrivals: 0, rn: 0, rev: 0 }); }
    allAd.forEach(function (r) {
      var w = r['Arrival Rooms'];
      if (w !== null && w > 0 && r['Room Number'] && r._adMonth) cell(r['Room Number'], r._adMonth).arrivals += w;
    });
    allBd.forEach(function (r) {
      if (!r['Room Number'] || !r._bdMonth) return;
      var c = cell(r['Room Number'], r._bdMonth);
      if (r['Room Nights'] !== null) c.rn += r['Room Nights'];
      if (r['Revenue'] !== null) c.rev += r['Revenue'];
    });
    function daysInMonth(m) {
      var p = m.split('-');
      var full = new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate();
      if (latestBd && latestBd.substring(0, 7) === m) return Math.min(full, +latestBd.substring(8, 10));
      return full;
    }
    function metricVal(c, m) {
      if (!c) return null;
      if (rnHeatMetric === 'arrivals') return c.arrivals || null;
      if (rnHeatMetric === 'roomnights') return c.rn || null;
      if (rnHeatMetric === 'revenue') return c.rev || null;
      if (rnHeatMetric === 'occupancy') {
        var d = daysInMonth(m);
        return d > 0 && c.rn ? (c.rn / d) * 100 : null;
      }
      return null;
    }
    var md = RN_HEAT_METRICS[rnHeatMetric];
    UI.heatTable(container, {
      corner: 'Room ↓ / Month →',
      rowLabels: roomList,
      colLabels: monthsSel,
      value: function (r, c) { return metricVal(agg[roomList[r] + '|' + monthsSel[c]], monthsSel[c]); },
      fmt: function (v) { return v === null ? '–' : md.fmt(v); },
      rowTotal: rnHeatMetric === 'occupancy' ? null : function (r) {
        var s = 0;
        monthsSel.forEach(function (m) { var v = metricVal(agg[roomList[r] + '|' + m], m); if (v) s += v; });
        return s;
      },
      colTotal: rnHeatMetric === 'occupancy' ? null : function (c) {
        var s = 0;
        roomList.forEach(function (rm) { var v = metricVal(agg[rm + '|' + monthsSel[c]], monthsSel[c]); if (v) s += v; });
        return s;
      },
      title: function (r, c, v) {
        var x = agg[roomList[r] + '|' + monthsSel[c]];
        if (!x) return 'No records';
        return 'Room ' + roomList[r] + ' · ' + monthsSel[c] +
          '\nArrivals: ' + Calc.fmtInt(x.arrivals) + ' · Room nights: ' + Calc.fmtInt(x.rn) +
          '\nRevenue: ' + Charts.fmtShort(x.rev) +
          '\nOccupancy: ' + (daysInMonth(monthsSel[c]) > 0 ? Calc.fmtPct((x.rn / daysInMonth(monthsSel[c])) * 100) : 'N/A');
      },
      onCellClick: function (r) { openRoomDrilldown(roomList[r], adTy); }
    });
  }

  /* Floor analysis from the two-digit room-number prefix (01–12 = floors 1–12).
   * Room numbers stay text with leading zeros; anything else → Unmapped. */
  function floorOf(roomNumber) {
    var s = String(roomNumber || '').trim();
    var m = s.match(/^(\d{2})/);
    if (m) {
      var f = parseInt(m[1], 10);
      if (f >= 1 && f <= 12) return 'Floor ' + f;
    }
    return 'Unmapped Room Numbers';
  }

  function renderFloorAnalysis(adTy, adLy, bdTy) {
    var p = tyPeriod();
    var nDates = Calc.includedDates(p.from, p.to, latestBd).length;
    var floors = {};
    function fl(name) {
      return floors[name] || (floors[name] = {
        arrivalsTy: 0, arrivalsLy: 0, rn: 0, rev: 0, rooms: {}, occupiedRooms: {}
      });
    }
    adTy.forEach(function (r) {
      var w = r['Arrival Rooms'];
      if (w !== null && w > 0 && r['Room Number']) fl(floorOf(r['Room Number'])).arrivalsTy += w;
    });
    adLy.forEach(function (r) {
      var w = r['Arrival Rooms'];
      if (w !== null && w > 0 && r['Room Number']) fl(floorOf(r['Room Number'])).arrivalsLy += w;
    });
    bdTy.forEach(function (r) {
      if (!r['Room Number']) return;
      var f = fl(floorOf(r['Room Number']));
      f.rooms[r['Room Number']] = 1;
      if (r['Room Nights'] !== null && r['Room Nights'] > 0) {
        f.rn += r['Room Nights'];
        f.occupiedRooms[r['Room Number']] = 1;
      }
      if (r['Revenue'] !== null) f.rev += r['Revenue'];
    });
    var hasLy = adLy.length > 0;
    var names = Object.keys(floors).sort(function (a, b) {
      var na = a.match(/(\d+)/), nb = b.match(/(\d+)/);
      if (a.indexOf('Unmapped') === 0) return 1;
      if (b.indexOf('Unmapped') === 0) return -1;
      return (+na[1]) - (+nb[1]);
    });
    var rows = names.map(function (n) {
      var f = floors[n];
      var roomsObserved = Object.keys(f.rooms).length;
      var occ = (roomsObserved > 0 && nDates > 0) ? (f.rn / (roomsObserved * nDates)) * 100 : null;
      return {
        floor: n, arrivalsTy: f.arrivalsTy, arrivalsLy: hasLy ? f.arrivalsLy : null,
        occupiedRooms: Object.keys(f.occupiedRooms).length, roomsObserved: roomsObserved,
        rn: f.rn, occ: occ, rev: f.rev, adr: f.rn > 0 ? f.rev / f.rn : null
      };
    });
    UI.table(document.getElementById('floor-table'), {
      pageSize: 14,
      columns: [
        { key: 'floor', label: 'Floor' },
        { key: 'arrivalsTy', label: 'Arrivals TY', cls: 'num', fmt: Calc.fmtInt },
        { key: 'arrivalsLy', label: 'Arrivals LY', cls: 'num', fmt: function (v) { return v === null ? 'N/A' : Calc.fmtInt(v); } },
        { key: 'var', label: 'Variance', cls: 'num', html: true, fmt: function (v, r) { return UI.varianceHtml(r.arrivalsTy, r.arrivalsLy); } },
        { key: 'occupiedRooms', label: 'Occupied Rooms', cls: 'num', fmt: Calc.fmtInt },
        { key: 'rn', label: 'Room Nights', cls: 'num', fmt: Calc.fmtInt },
        { key: 'occ', label: 'Occupancy %', cls: 'num', fmt: Calc.fmtPct },
        { key: 'rev', label: 'Revenue', cls: 'num', fmt: function (v) { return Charts.fmtShort(v); } },
        { key: 'adr', label: 'ADR', cls: 'num', fmt: function (v) { return v === null ? 'N/A' : v.toFixed(1); } }
      ],
      rows: rows,
      emptyText: 'No records in the current selection'
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
      var cov = Importer.mappingCoverage(pendingUpload.headerInfo, pendingUpload.overrides);
      if (cov.missingRequired.length) {
        UI.toast('Required column(s) not mapped: ' + cov.missingRequired.join(', ') + '. Map them or fix the source file before continuing.', 'error');
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
    // progress UI inside the wizard so large files never look frozen
    document.getElementById('upload-modal-title').textContent = 'Upload — Analyzing…';
    var body = document.getElementById('upload-modal-body');
    body.innerHTML = '<div class="progress-wrap"><div class="progress-label" id="upload-progress-label">Preparing rows…</div>' +
      '<div class="progress-track"><div class="progress-fill" id="upload-progress-fill" style="width:0%"></div></div></div>';
    function setProgress(pct, label) {
      var f = document.getElementById('upload-progress-fill');
      var l = document.getElementById('upload-progress-label');
      if (f) f.style.width = pct + '%';
      if (l) l.textContent = label;
    }
    setTimeout(function () {
      try {
        var sheet = pendingUpload.parsed.sheets[pendingUpload.sheetIdx];
        var sourceMeta = { fileName: pendingUpload.parsed.fileName, sheetName: sheet.name };
        var candidates = Importer.buildRecords(sheet.rows, pendingUpload.headerInfo, pendingUpload.overrides, sourceMeta);
        setProgress(10, 'Normalized ' + candidates.length.toLocaleString() + ' rows. Classifying…');
        var existingByKey = new Map();
        records.forEach(function (r) { existingByKey.set(r.key, r); });
        Importer.classifyAsync(candidates, existingByKey, function (done, total) {
          setProgress(10 + Math.round((done / Math.max(total, 1)) * 88),
            'Classifying ' + done.toLocaleString() + ' of ' + total.toLocaleString() + ' rows…');
        }).then(function (cls) {
          renderUploadPreview(cls, sourceMeta);
        });
      } catch (err) {
        UI.toast('Preview failed: ' + err.message, 'error');
        cancelUpload();
      }
    }, 30);
  }

  function renderUploadPreview(cls, sourceMeta) {
    try {
        pendingUpload.classification = cls;
        pendingUpload.sourceMeta = sourceMeta;

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
        var cov = Importer.mappingCoverage(pendingUpload.headerInfo, pendingUpload.overrides);
        body.innerHTML =
          '<p class="upload-file-name">File: <strong>' + UI.esc(sourceMeta.fileName) + '</strong> · Worksheet: <strong>' + UI.esc(sourceMeta.sheetName) + '</strong>' +
          ' · Coverage: <strong>' + (cls.minBd || '?') + ' → ' + (cls.maxBd || '?') + '</strong>' +
          ' · Properties: <strong>' + Array.from(cls.properties).join(', ') + '</strong></p>' +
          (cov.missing.length ? '<div class="unmapped-block"><strong>Columns not present in this file:</strong> ' +
            cov.missing.map(UI.esc).join(', ') + '. These fields will be blank on imported records.</div>' : '') +
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
          ((cls.newRecords.length + cls.updates.length) === 0
            ? '<div class="unmapped-block"><strong>Nothing to import:</strong> every row in this file already exists in the database with identical values, so the Confirm button is disabled. This is normal when re-uploading a file (or a date range) that was imported before.</div>'
            : '') +
          '<p class="upload-note">Confirming will append new records, update matching records, and skip duplicates. Historical records are never removed. The import can be rolled back afterwards.</p>' +
          '<div class="modal-actions">' +
          '<button type="button" class="btn" id="upload-back">‹ Back</button>' +
          '<button type="button" class="btn" id="upload-cancel">Cancel</button>' +
          '<button type="button" class="btn btn-primary" id="upload-confirm"' + ((cls.newRecords.length + cls.updates.length) ? '' : ' disabled') + '>Confirm Import</button></div>';

        document.getElementById('upload-back').onclick = renderUploadStep2;
        document.getElementById('upload-cancel').onclick = cancelUpload;
        document.getElementById('upload-confirm').onclick = confirmUpload;
    } catch (err) {
      UI.toast('Preview failed: ' + err.message, 'error');
      cancelUpload();
    }
  }

  function confirmUpload() {
    var n = pendingUpload.classification.newRecords.length + pendingUpload.classification.updates.length;
    UI.loader(true, 'Writing ' + n.toLocaleString() + ' records to the local database…');
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
