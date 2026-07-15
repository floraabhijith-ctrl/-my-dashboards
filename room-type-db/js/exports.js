/* =========================================================================
 * exports.js — CSV/JSON exports, backup & restore (PROJECT_CONTEXT.md §18).
 * Every filtered export receives its records through Filters.apply(), so
 * active filters always shape export content.
 * ========================================================================= */
'use strict';

var Exports = (function () {

  function csvEscape(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(headers, rows) {
    var lines = [headers.map(csvEscape).join(',')];
    rows.forEach(function (r) {
      lines.push(headers.map(function (h) { return csvEscape(r[h]); }).join(','));
    });
    return lines.join('\r\n');
  }

  function download(filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + Norm.pad2(d.getMonth() + 1) + Norm.pad2(d.getDate()) + '_' +
      Norm.pad2(d.getHours()) + Norm.pad2(d.getMinutes());
  }

  /* Detail rows: standard fields + standardized derived fields (§18). */
  function detailRow(r) {
    var out = {};
    FIELDS.forEach(function (f) { out[f] = r[f]; });
    out['Room Type Group'] = r._rtg;
    out['SEGGRP Group'] = r._seg;
    out['Account Manager Group'] = r._amg;
    out['Arrival Time Group'] = r._atg;
    out['Departure Time Group'] = r._dtg;
    out['Occupancy Combination'] = r._occ;
    out['Source File'] = r.srcFile || '';
    out['Source Worksheet'] = r.srcSheet || '';
    out['Source Row'] = r.srcRow || '';
    out['Batch ID'] = r.batchId || '';
    out['Import Timestamp'] = r.importTimestamp || '';
    out['Update Timestamp'] = r.updateTimestamp || '';
    return out;
  }

  var DETAIL_HEADERS = FIELDS.concat(EXPORT_DERIVED,
    ['Source File', 'Source Worksheet', 'Source Row', 'Batch ID', 'Import Timestamp', 'Update Timestamp']);

  function exportDetailCsv(records, name) {
    download((name || 'flora_detail_') + stamp() + '.csv',
      toCsv(DETAIL_HEADERS, records.map(detailRow)));
  }

  function exportSummaryCsv(headers, rows, name) {
    download((name || 'flora_summary_') + stamp() + '.csv', toCsv(headers, rows));
  }

  function exportFullDatabase(records) {
    exportDetailCsv(records, 'flora_full_database_');
  }

  function exportDataQuality(cats) {
    var headers = ['Category', 'Source File', 'Worksheet', 'Source Row', 'Property',
      'Confirmation Number', 'Business Date', 'Problem Field', 'Original Value', 'Reason', 'Suggested Correction'];
    var rows = [];
    Object.keys(cats).forEach(function (cat) {
      cats[cat].forEach(function (d) {
        rows.push({
          'Category': cat, 'Source File': d.srcFile, 'Worksheet': d.srcSheet,
          'Source Row': d.srcRow, 'Property': d.property, 'Confirmation Number': d.confirmation,
          'Business Date': d.businessDate, 'Problem Field': d.field, 'Original Value': d.value,
          'Reason': d.reason, 'Suggested Correction': d.suggestion
        });
      });
    });
    download('flora_data_quality_' + stamp() + '.csv', toCsv(headers, rows));
  }

  function exportUploadHistory(batches) {
    var headers = ['Import Timestamp', 'File Name', 'Worksheet', 'Coverage From', 'Coverage To',
      'Rows Received', 'Rows Appended', 'Rows Updated', 'Duplicates', 'Invalid Rows', 'Unmapped Rows', 'Rollback Status'];
    var rows = batches.map(function (b) {
      return {
        'Import Timestamp': b.timestamp, 'File Name': b.fileName, 'Worksheet': b.sheetName,
        'Coverage From': b.coverageFrom, 'Coverage To': b.coverageTo,
        'Rows Received': b.rowsReceived, 'Rows Appended': b.rowsAppended,
        'Rows Updated': b.rowsUpdated, 'Duplicates': b.duplicates,
        'Invalid Rows': b.invalidRows, 'Unmapped Rows': b.unmappedRows,
        'Rollback Status': b.rolledBack ? 'Rolled back ' + (b.rollbackTimestamp || '') : 'Active'
      };
    });
    download('flora_upload_history_' + stamp() + '.csv', toCsv(headers, rows));
  }

  function backupJson(records, batches) {
    var payload = {
      app: 'Flora Room Type, Arrival & Departure Intelligence',
      schemaVersion: DB_VERSION,
      exportedAt: new Date().toISOString(),
      recordCount: records.length,
      records: records,
      batches: batches
    };
    download('flora_backup_' + stamp() + '.json', JSON.stringify(payload), 'application/json');
  }

  function parseBackup(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var payload = JSON.parse(reader.result);
          if (!payload || !Array.isArray(payload.records)) {
            reject(new Error('Not a valid Flora backup file (missing records array).'));
            return;
          }
          resolve(payload);
        } catch (e) { reject(new Error('Backup file is not valid JSON.')); }
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsText(file);
    });
  }

  return {
    toCsv: toCsv,
    download: download,
    exportDetailCsv: exportDetailCsv,
    exportSummaryCsv: exportSummaryCsv,
    exportFullDatabase: exportFullDatabase,
    exportDataQuality: exportDataQuality,
    exportUploadHistory: exportUploadHistory,
    backupJson: backupJson,
    parseBackup: parseBackup
  };
})();
