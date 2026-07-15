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
    if (showLy) {
      series.push({
        name: 'Last Year', type: 'bar', data: rows.map(function (r) { return r.ly; }),
        itemStyle: { color: FLORA.lyColor }, barGap: '10%',
        label: { show: false }
      });
    }
    if (showTy) {
      series.push({
        name: opts.tyLabel || 'Current', type: 'bar', data: rows.map(function (r) { return r.ty; }),
        itemStyle: { color: FLORA.tyColor },
        label: {
          show: rows.length <= 14, position: 'right', fontSize: 11,
          formatter: function (p) { return opts.pct ? Calc.fmtPct(p.value) : Calc.fmtInt(p.value); }
        }
      });
    }
    chart.setOption({
      grid: baseGrid(),
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
    if (showLy) {
      series.push({ name: 'Last Year', type: 'bar', data: rows.map(function (r) { return r.ly; }), itemStyle: { color: FLORA.lyColor } });
    }
    if (showTy) {
      series.push({
        name: opts.tyLabel || 'Current', type: 'bar', data: rows.map(function (r) { return r.ty; }),
        itemStyle: { color: FLORA.tyColor },
        label: { show: rows.length <= 10, position: 'top', fontSize: 10, formatter: function (p) { return opts.pct ? Calc.fmtPct(p.value) : Calc.fmtInt(p.value); } }
      });
    }
    chart.setOption({
      grid: baseGrid(),
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

  return { hbar: hbar, vbar: vbar, line: line, heatmap: heatmap, noData: noData, resizeAll: resizeAll, disposeAll: disposeAll };
})();
