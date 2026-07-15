/* =========================================================================
 * ui.js — reusable UI components: multi-select dropdowns with search/select-
 * all/clear, modals, toasts, confirms, paginated tables, filter chips,
 * upload wizard steps.
 * ========================================================================= */
'use strict';

var UI = (function () {

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- toast ---------------- */
  function toast(message, type) {
    var stack = document.getElementById('toast-stack');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(function () { el.classList.add('gone'); setTimeout(function () { el.remove(); }, 400); }, 3800);
  }

  /* ---------------- loader ---------------- */
  function loader(on, label) {
    var el = document.getElementById('global-loader');
    el.classList.toggle('active', !!on);
    document.getElementById('loader-label').textContent = label || 'Working…';
  }

  /* ---------------- modal ---------------- */
  function openModal(id) { document.getElementById(id).classList.add('active'); }
  function closeModal(id) { document.getElementById(id).classList.remove('active'); }

  function confirmDialog(title, message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var body = document.getElementById('confirm-body');
      document.getElementById('confirm-title').textContent = title;
      body.innerHTML = '<p>' + esc(message) + '</p>' +
        (opts.requireText ? '<p class="confirm-type-hint">Type <strong>' + esc(opts.requireText) + '</strong> to confirm:</p><input type="text" id="confirm-text-input" autocomplete="off">' : '');
      var okBtn = document.getElementById('confirm-ok');
      var cancelBtn = document.getElementById('confirm-cancel');
      okBtn.textContent = opts.okLabel || 'Confirm';
      okBtn.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
      function cleanup(result) {
        okBtn.onclick = null; cancelBtn.onclick = null;
        closeModal('confirm-modal');
        resolve(result);
      }
      okBtn.onclick = function () {
        if (opts.requireText) {
          var input = document.getElementById('confirm-text-input');
          if (input.value.trim() !== opts.requireText) {
            input.classList.add('input-error');
            return;
          }
        }
        cleanup(true);
      };
      cancelBtn.onclick = function () { cleanup(false); };
      openModal('confirm-modal');
    });
  }

  /* ---------------- multi-select dropdown ---------------- */
  /* Renders into container. cfg: {id, label, options[], selected[], onChange(list)} */
  function multiSelect(container, cfg) {
    var wrap = document.createElement('div');
    wrap.className = 'ms-wrap';
    wrap.id = 'ms-' + cfg.id;
    container.appendChild(wrap);
    var open = false;

    function selectedLabel() {
      var sel = cfg.selected();
      if (!sel.length) return 'All';
      if (sel.length === 1) return sel[0];
      return sel.length + ' selected';
    }

    function render() {
      var sel = cfg.selected();
      wrap.innerHTML =
        '<label class="ms-label">' + esc(cfg.label) + '</label>' +
        '<button type="button" class="ms-trigger' + (sel.length ? ' has-sel' : '') + '">' +
          '<span>' + esc(selectedLabel()) + '</span><span class="ms-caret">▾</span></button>' +
        '<div class="ms-panel' + (open ? ' open' : '') + '">' +
          '<input type="text" class="ms-search" placeholder="Search…">' +
          '<div class="ms-actions">' +
            '<button type="button" class="ms-all">Select All</button>' +
            '<button type="button" class="ms-clear">Clear</button>' +
          '</div>' +
          '<div class="ms-options"></div>' +
        '</div>';

      var optsEl = wrap.querySelector('.ms-options');
      function drawOptions(filterText) {
        var ft = (filterText || '').toLowerCase();
        var selNow = cfg.selected();
        optsEl.innerHTML = cfg.options().filter(function (o) {
          return !ft || String(o).toLowerCase().indexOf(ft) !== -1;
        }).map(function (o) {
          var checked = selNow.indexOf(o) !== -1;
          return '<label class="ms-opt"><input type="checkbox" value="' + esc(o) + '"' + (checked ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
        }).join('') || '<div class="ms-empty">No options</div>';
        optsEl.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
          cb.addEventListener('change', function () {
            var selNow2 = cfg.selected().slice();
            var idx = selNow2.indexOf(cb.value);
            if (cb.checked && idx === -1) selNow2.push(cb.value);
            if (!cb.checked && idx !== -1) selNow2.splice(idx, 1);
            cfg.onChange(selNow2);
            wrap.querySelector('.ms-trigger span').textContent = selectedLabel();
            wrap.querySelector('.ms-trigger').classList.toggle('has-sel', cfg.selected().length > 0);
          });
        });
      }
      drawOptions('');

      wrap.querySelector('.ms-trigger').addEventListener('click', function (e) {
        e.stopPropagation();
        closeAllPanels(wrap);
        open = !open;
        wrap.querySelector('.ms-panel').classList.toggle('open', open);
        if (open) wrap.querySelector('.ms-search').focus();
      });
      wrap.querySelector('.ms-search').addEventListener('input', function (e) { drawOptions(e.target.value); });
      wrap.querySelector('.ms-search').addEventListener('click', function (e) { e.stopPropagation(); });
      wrap.querySelector('.ms-all').addEventListener('click', function (e) {
        e.stopPropagation();
        cfg.onChange(cfg.options().slice());
        render(); open = true; wrap.querySelector('.ms-panel').classList.add('open');
      });
      wrap.querySelector('.ms-clear').addEventListener('click', function (e) {
        e.stopPropagation();
        cfg.onChange([]);
        render(); open = true; wrap.querySelector('.ms-panel').classList.add('open');
      });
      wrap.querySelector('.ms-panel').addEventListener('click', function (e) { e.stopPropagation(); });
    }

    render();
    return { render: render, close: function () { open = false; var p = wrap.querySelector('.ms-panel'); if (p) p.classList.remove('open'); } };
  }

  function closeAllPanels(except) {
    document.querySelectorAll('.ms-panel.open').forEach(function (p) {
      if (!except || !except.contains(p)) p.classList.remove('open');
    });
  }
  document.addEventListener('click', function () { closeAllPanels(null); });

  /* ---------------- paginated table ---------------- */
  /* cfg: {columns:[{key,label,fmt,cls}], rows, pageSize, onRowClick, emptyText} */
  function table(container, cfg) {
    var page = 0;
    var pageSize = cfg.pageSize || 25;

    function render() {
      var rows = cfg.rows;
      var pages = Math.max(1, Math.ceil(rows.length / pageSize));
      if (page >= pages) page = pages - 1;
      var slice = rows.slice(page * pageSize, (page + 1) * pageSize);

      var html = '<div class="table-scroll"><table class="flora-table"><thead><tr>' +
        cfg.columns.map(function (c) { return '<th class="' + (c.cls || '') + '">' + esc(c.label) + '</th>'; }).join('') +
        '</tr></thead><tbody>';
      if (!slice.length) {
        html += '<tr><td colspan="' + cfg.columns.length + '"><div class="no-data">' + esc(cfg.emptyText || 'No Data') + '</div></td></tr>';
      } else {
        slice.forEach(function (row, i) {
          html += '<tr data-idx="' + (page * pageSize + i) + '"' + (cfg.onRowClick ? ' class="clickable"' : '') + '>' +
            cfg.columns.map(function (c) {
              var v = c.fmt ? c.fmt(row[c.key], row) : row[c.key];
              return '<td class="' + (c.cls || '') + '">' + (c.html ? v : esc(v)) + '</td>';
            }).join('') + '</tr>';
        });
      }
      html += '</tbody></table></div>';
      if (rows.length > pageSize) {
        html += '<div class="table-pager">' +
          '<button type="button" class="pg-prev btn btn-small"' + (page === 0 ? ' disabled' : '') + '>‹ Prev</button>' +
          '<span>Page ' + (page + 1) + ' of ' + pages + ' · ' + rows.length.toLocaleString() + ' rows</span>' +
          '<button type="button" class="pg-next btn btn-small"' + (page >= pages - 1 ? ' disabled' : '') + '>Next ›</button></div>';
      }
      container.innerHTML = html;

      if (cfg.onRowClick) {
        container.querySelectorAll('tbody tr[data-idx]').forEach(function (tr) {
          tr.addEventListener('click', function () { cfg.onRowClick(cfg.rows[+tr.dataset.idx]); });
        });
      }
      var prev = container.querySelector('.pg-prev');
      var next = container.querySelector('.pg-next');
      if (prev) prev.addEventListener('click', function () { page--; render(); });
      if (next) next.addEventListener('click', function () { page++; render(); });
    }
    render();
    return {
      update: function (rows) { cfg.rows = rows; page = 0; render(); }
    };
  }

  /* ---------------- variance cell ---------------- */
  function varianceHtml(ty, ly, isPct) {
    if (ly === null || ly === undefined) return '<span class="muted">N/A</span>';
    if (isPct) {
      var pp = Calc.calculatePercentagePointVariance(ty, ly);
      if (pp === null) return '<span class="muted">N/A</span>';
      var cls0 = pp > 0 ? 'up' : pp < 0 ? 'down' : 'flat';
      var arrow0 = pp > 0 ? '▲' : pp < 0 ? '▼' : '■';
      return '<span class="var ' + cls0 + '">' + arrow0 + ' ' + Calc.fmtPp(pp) + '</span>';
    }
    var v = Calc.calculateVariance(ty, ly);
    if (v.abs === null) return '<span class="muted">N/A</span>';
    var cls = v.abs > 0 ? 'up' : v.abs < 0 ? 'down' : 'flat';
    var arrow = v.abs > 0 ? '▲' : v.abs < 0 ? '▼' : '■';
    return '<span class="var ' + cls + '">' + arrow + ' ' + Calc.fmtVarAbs(v.abs) + ' (' + Calc.fmtVarPct(v.pct) + ')</span>';
  }

  /* ---------------- KPI card ---------------- */
  function kpiCard(label, tyText, lyText, varianceHtmlStr, tooltip) {
    return '<div class="kpi-card" title="' + esc(tooltip || '') + '">' +
      '<div class="kpi-label">' + esc(label) + '</div>' +
      '<div class="kpi-value">' + esc(tyText) + '</div>' +
      (Filters.state.comparisonMode !== 'ty' && lyText !== null && lyText !== undefined
        ? '<div class="kpi-ly">LY: ' + esc(lyText) + (varianceHtmlStr ? ' · ' + varianceHtmlStr : '') + '</div>'
        : '') +
      '</div>';
  }

  return {
    esc: esc, toast: toast, loader: loader,
    openModal: openModal, closeModal: closeModal, confirmDialog: confirmDialog,
    multiSelect: multiSelect, table: table,
    varianceHtml: varianceHtml, kpiCard: kpiCard
  };
})();
