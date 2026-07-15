/* =========================================================================
 * charts.js — Apache ECharts wrappers with the Flora theme.
 * Conventions: TY series in Royal Purple, LY series in light violet,
 * horizontal bars sorted descending, labels hidden when space is tight
 * (values stay available in tooltips), 'No Data' empty states.
 * ========================================================================= */
'use strict';

var Charts = (function () {

  var instances = {};

  var FLORA_THEME = {
    color: FLORA.chartPalette,
    textStyle: { fontFamily: FLORA.font, color: FLORA.colors.charcoal },
    axisPointer: { lineStyle: { color: FLORA.colors.violet } },
    tooltip: {
      backgroundColor: '#FFFFFF', borderColor: FLORA.colors.pearl,
      textStyle: { color: FLORA.colors.charcoal, fontSize: 12 }
    }
  };
  if (typeof echarts !== 'undefined') echarts.registerTheme('flora', FLORA_THEME);

  function el(id) { return document.getElementById(id); }

  function get(id) {
    var dom = el(id);
    if (!dom) return null;
    if (instances[id] && !instances[id].isDisposed()) return instances[id];
    instances[id] = echarts.init(dom, 'flora', { renderer: 'canvas' });
    return instances[id];
  }

  function noData(id, message) {
    var dom = el(id);
    if (!dom) return;
    if (instances[id] && !instances[id].isDisposed()) { instances[id].dispose(); delete instances[id]; }
    dom.innerHTML = '<div class="no-data">' + (message || 'No Data') + '</div>';
  }

  function clearNoData(id) {
    var dom = el(id);
    if (dom && dom.querySelector('.no-data')) dom.innerHTML = '';
  }

  function baseGrid() {
    return { left: 8, right: 24, top: 32, bottom: 8, containLabel: true };
  }

  /* Abbreviate large values for on-chart labels; tooltips always carry the
   * complete value. 1250 → 1.3k, 2400000 → 2.4M. */
  function fmtShort(v) {
    if (v === null || v === undefined || !isFinite(v)) return '';
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 10000) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return Math.round(v).toLocaleString('en-US');
  }

  /* Diagonal-hatch decal so the LY series is distinguishable without
   * relying on colour alone. */
  var LY_DECAL = {
    symbol: 'line', symbolSize: 1, rotation: Math.PI / 4,
    color: 'rgba(82,57,86,0.35)', dashArrayX: [1, 0], dashArrayY: [3, 3]
  };

  /* Sorted horizontal bar, optional LY series. rows: [{name, ty, ly}] */
  function hbar(id, rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) { noData(id); return; }
    clearNoData(id);
    var chart = get(id);
    if (!chart) return;
    rows = rows.slice().sort(function (a, b) { return (a.ty || 0) - (b.ty || 0); });
    var series = [];
    var mode = Filters.state.comparisonMode;
    var showTy = mode !== 'ly', showLy = mode !== 'ty' && rows.some(function (r) { return r.ly !== undefined && r.ly !== null; });
    var showLabels = rows.length <= 20;
    function barLabel(pos) {
      return {
        show: showLabels, position: pos, fontSize: 10.5, color: FLORA.colors.charcoal,
        formatter: function (p) {
          if (p.value === null || p.value === undefined) return '';
          return opts.pct ? Calc.fmtPct(p.value) : fmtShort(p.value);
        }
      };
    }
    if (showLy) {
      series.push({
        name: 'Last Year', type: 'bar', data: rows.map(function (r) { return r.ly; }),
        itemStyle: { color: FLORA.lyColor, decal: LY_DECAL }, barGap: '12%',
        label: barLabel('right'), labelLayout: { hideOverlap: true }
      });
    }
    if (showTy) {
      series.push({
        name: opts.tyLabel || 'Current', type: 'bar', data: rows.map(function (r) { return r.ty; }),
        itemStyle: { color: FLORA.tyColor },
        label: barLabel('right'), labelLayout: { hideOverlap: true }
      });
    }
    var grid = baseGrid();
    grid.right = 64; // room for end-of-bar labels so values are never clipped
    chart.setOption({
      grid: grid,
      legend: showLy && showTy ? { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } } : { show: false },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: function (params) { return tooltipTyLy(params, rows, opts); }
      },
      xAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: opts.pct ? '{value}%' : undefined }, splitLine: { lineStyle: { color: FLORA.colors.pearl } } },
      yAxis: { type: 'category', data: rows.map(function (r) { return r.name; }), axisLabel: { fontSize: 11, width: 140, overflow: 'truncate' } },
      series: series
    }, true);
    bindClick(chart, opts.onClick, rows);
  }

  /* Vertical bars/columns, optional LY. rows: [{name, ty, ly}] (kept in given order). */
  function vbar(id, rows, opts) {
    opts = opts || {};
    if (!rows || !rows.length) { noData(id); return; }
    clearNoData(id);
    var chart = get(id);
    if (!chart) return;
    var mode = Filters.state.comparisonMode;
    var showTy = mode !== 'ly', showLy = mode !== 'ty' && rows.some(function (r) { return r.ly !== undefined && r.ly !== null; });
    var series = [];
    var showLabels = rows.length <= 12;
    function colLabel() {
      return {
        show: showLabels, position: 'top', fontSize: 10, color: FLORA.colors.charcoal,
        formatter: function (p) {
          if (p.value === null || p.value === undefined) return '';
          return opts.pct ? Calc.fmtPct(p.value) : fmtShort(p.value);
        }
      };
    }
    if (showLy) {
      series.push({
        name: 'Last Year', type: 'bar', data: rows.map(function (r) { return r.ly; }),
        itemStyle: { color: FLORA.lyColor, decal: LY_DECAL },
        label: colLabel(), labelLayout: { hideOverlap: true }
      });
    }
    if (showTy) {
      series.push({
        name: opts.tyLabel || 'Current', type: 'bar', data: rows.map(function (r) { return r.ty; }),
        itemStyle: { color: FLORA.tyColor },
        label: colLabel(), labelLayout: { hideOverlap: true }
      });
    }
    var grid = baseGrid();
    grid.top = 44; // headroom so top-positioned labels never clip
    chart.setOption({
      grid: grid,
      legend: showLy && showTy ? { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } } : { show: false },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: function (p) { return tooltipTyLy(p, rows, opts); } },
      xAxis: { type: 'category', data: rows.map(function (r) { return r.name; }), axisLabel: { fontSize: 10, interval: 0, rotate: rows.length > 8 ? 35 : 0, width: 90, overflow: 'truncate' } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: opts.pct ? '{value}%' : undefined }, splitLine: { lineStyle: { color: FLORA.colors.pearl } } },
      series: series
    }, true);
    bindClick(chart, opts.onClick, rows);
  }

  /* Multi-series line/trend. seriesDefs: [{name, data:[..], color}], categories: [..] */
  function line(id, categories, seriesDefs, opts) {
    opts = opts || {};
    if (!categories || !categories.length || !seriesDefs.length) { noData(id); return; }
    clearNoData(id);
    var chart = get(id);
    if (!chart) return;
    chart.setOption({
      grid: baseGrid(),
      legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 8, textStyle: { fontSize: 11 } },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: categories, axisLabel: { fontSize: 10, rotate: categories.length > 14 ? 45 : 0 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: opts.pct ? '{value}%' : undefined }, splitLine: { lineStyle: { color: FLORA.colors.pearl } } },
      series: seriesDefs.map(function (s) {
        return {
          name: s.name, type: 'line', data: s.data, smooth: false, symbolSize: 5,
          lineStyle: { width: 2, color: s.color }, itemStyle: { color: s.color },
          connectNulls: false
        };
      })
    }, true);
  }

  /* Heatmap. xCats, yCats, cells: [[xIdx, yIdx, value]] */
  function heatmap(id, xCats, yCats, cells, opts) {
    opts = opts || {};
    if (!cells || !cells.length) { noData(id); return; }
    clearNoData(id);
    var chart = get(id);
    if (!chart) return;
    var max = 0;
    cells.forEach(function (c) { if (c[2] > max) max = c[2]; });
    chart.setOption({
      grid: { left: 8, right: 24, top: 8, bottom: 40, containLabel: true },
      tooltip: {
        formatter: function (p) {
          var label = opts.cellLabel ? opts.cellLabel(p.value) :
            (xCats[p.value[0]] + ' × ' + yCats[p.value[1]] + ': ' + Calc.fmtInt(p.value[2]));
          return label;
        }
      },
      xAxis: { type: 'category', data: xCats, axisLabel: { fontSize: 10, interval: 0, rotate: xCats.length > 10 ? 45 : 0 }, splitArea: { show: true } },
      yAxis: { type: 'category', data: yCats, axisLabel: { fontSize: 10 }, splitArea: { show: true } },
      visualMap: {
        min: 0, max: max || 1, calculable: false, orient: 'horizontal',
        left: 'center', bottom: 0, itemHeight: 90,
        inRange: { color: [FLORA.colors.ivory, FLORA.colors.violet, FLORA.colors.royalPurple] },
        textStyle: { fontSize: 10 }
      },
      series: [{
        type: 'heatmap', data: cells,
        label: { show: cells.length <= 80, fontSize: 9, formatter: function (p) { return Calc.fmtInt(p.value[2]); } },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.3)' } }
      }]
    }, true);
    if (opts.onCellClick) {
      chart.off('click');
      chart.on('click', function (p) { opts.onCellClick(p.value); });
    }
  }

  /* Occupancy-style gauge: TY needle with LY value and pp variance beneath. */
  function gauge(id, tyPct, lyPct, title) {
    if (tyPct === null || tyPct === undefined) { noData(id); return; }
    clearNoData(id);
    var chart = get(id);
    if (!chart) return;
    var detailLines = Calc.fmtPct(tyPct);
    var sub = '';
    if (Filters.state.comparisonMode !== 'ty' && lyPct !== null && lyPct !== undefined) {
      var pp = Calc.calculatePercentagePointVariance(tyPct, lyPct);
      sub = 'LY ' + Calc.fmtPct(lyPct) + '  (' + Calc.fmtPp(pp) + ')';
    }
    chart.setOption({
      series: [{
        type: 'gauge', startAngle: 200, endAngle: -20,
        min: 0, max: 100, splitNumber: 5,
        radius: '95%', center: ['50%', '60%'],
        progress: { show: true, width: 16, itemStyle: { color: FLORA.tyColor } },
        axisLine: { lineStyle: { width: 16, color: [[1, FLORA.colors.pearl]] } },
        axisTick: { distance: -22, lineStyle: { color: FLORA.colors.violet } },
        splitLine: { distance: -26, length: 8, lineStyle: { color: FLORA.colors.violet, width: 2 } },
        axisLabel: { distance: -40, fontSize: 10, color: FLORA.colors.charcoal, formatter: '{value}%' },
        pointer: { length: '58%', width: 5, itemStyle: { color: FLORA.colors.royalPurple } },
        anchor: { show: true, size: 12, itemStyle: { color: FLORA.colors.royalPurple } },
        title: { show: true, offsetCenter: [0, '52%'], fontSize: 12, color: '#6E6470' },
        detail: {
          valueAnimation: true, offsetCenter: [0, '28%'], fontSize: 22, fontWeight: 700,
          color: FLORA.colors.charcoal, formatter: function (v) { return Calc.fmtPct(v); }
        },
        data: [{ value: Math.round(tyPct * 10) / 10, name: (title || '') + (sub ? '\n' + sub : '') }]
      }]
    }, true);
  }

  function tooltipTyLy(params, rows, opts) {
    var list = Array.isArray(params) ? params : [params];
    var idx = list[0].dataIndex;
    var row = rows[idx];
    var fmt = opts.pct ? Calc.fmtPct : Calc.fmtInt;
    var html = '<strong>' + list[0].name + '</strong>';
    var mode = Filters.state.comparisonMode;
    if (mode !== 'ly') html += '<br/>Current: ' + fmt(row.ty);
    if (mode !== 'ty' && row.ly !== undefined && row.ly !== null) {
      html += '<br/>Last Year: ' + fmt(row.ly);
      var v = Calc.calculateVariance(row.ty, row.ly);
      if (opts.pct) html += '<br/>Variance: ' + Calc.fmtPp(Calc.calculatePercentagePointVariance(row.ty, row.ly));
      else html += '<br/>Variance: ' + Calc.fmtVarAbs(v.abs) + ' (' + Calc.fmtVarPct(v.pct) + ')';
    }
    if (row.share !== undefined && row.share !== null) html += '<br/>Share: ' + Calc.fmtPct(row.share);
    return html;
  }

  function bindClick(chart, onClick, rows) {
    chart.off('click');
    if (onClick) {
      chart.on('click', function (p) { onClick(rows[p.dataIndex], p); });
    }
  }

  function resizeAll() {
    Object.keys(instances).forEach(function (id) {
      if (instances[id] && !instances[id].isDisposed()) instances[id].resize();
    });
  }

  function disposeAll() {
    Object.keys(instances).forEach(function (id) {
      if (instances[id] && !instances[id].isDisposed()) instances[id].dispose();
    });
    instances = {};
  }

  window.addEventListener('resize', debounceResize);
  var resizeTimer = null;
  function debounceResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeAll, 150);
  }

  return { hbar: hbar, vbar: vbar, line: line, heatmap: heatmap, gauge: gauge, fmtShort: fmtShort, noData: noData, resizeAll: resizeAll, disposeAll: disposeAll };
})();
