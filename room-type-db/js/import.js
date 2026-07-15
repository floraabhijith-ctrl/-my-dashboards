/* =========================================================================
 * import.js — Excel/CSV parsing, worksheet selection, header mapping,
 * classification (new / update / duplicate / invalid / unmapped), preview,
 * commit, rollback. PROJECT_CONTEXT.md §5.
 * ========================================================================= */
'use strict';

var Importer = (function () {

  /* Parse a File into { sheets: [{name, rows(2d array), rowCount}] } */
  function parseFile(file) {
    return new Promise(function (resolve, reject) {
      var name = file.name.toLowerCase();
      if (name.endsWith('.csv')) {
        Papa.parse(file, {
          skipEmptyLines: 'greedy',
          complete: function (res) {
            resolve({ fileName: file.name, sheets: [{ name: 'CSV', rows: res.data }] });
          },
          error: function (err) { reject(err); }
        });
      } else {
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            var wb = XLSX.read(new Uint8Array(e.target.result), {
              type: 'array', cellDates: true, raw: true
            });
            var sheets = wb.SheetNames.map(function (sn) {
              var rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {
                header: 1, raw: true, defval: null, blankrows: false
              });
              return { name: sn, rows: rows };
            });
            resolve({ fileName: file.name, sheets: sheets });
          } catch (err) { reject(err); }
        };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsArrayBuffer(file);
      }
    });
  }

  /* Find the most plausible header row: the row with the most alias matches
   * within the first 15 rows. Returns {rowIndex, mapping:[{col, source, field}], score}. */
  function detectHeaders(rows) {
    var best = { rowIndex: -1, mapping: [], score: 0 };
    var limit = Math.min(rows.length, 15);
    for (var r = 0; r < limit; r++) {
      var row = rows[r] || [];
      var mapping = [];
      var score = 0;
      for (var c = 0; c < row.length; c++) {
        if (row[c] === null || row[c] === undefined || row[c] === '') continue;
        var field = Norm.mapHeader(row[c]);
        mapping.push({ col: c, source: String(row[c]), field: field });
        if (field) score++;
      }
      if (score > best.score) best = { rowIndex: r, mapping: mapping, score: score };
    }
    return best;
  }

  /* Build normalized candidate records from a sheet given a header mapping.
   * mappingOverrides: {colIndex: 'Standard Field'|null} from the mapping UI. */
  function buildRecords(rows, headerInfo, mappingOverrides, sourceMeta) {
    var colField = {};
    headerInfo.mapping.forEach(function (m) {
      var f = mappingOverrides && mappingOverrides.hasOwnProperty(m.col)
        ? mappingOverrides[m.col] : m.field;
      if (f) colField[m.col] = f;
    });

    var out = [];
    for (var r = headerInfo.rowIndex + 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      var any = false;
      var mapped = {};
      Object.keys(colField).forEach(function (c) {
        var v = row[c];
        mapped[colField[c]] = v;
        if (v !== null && v !== undefined && v !== '') any = true;
      });
      if (!any) continue;
      var rec = Norm.normalizeRecord(mapped);
      rec._srcRow = r + 1; // 1-based, matches what the user sees in Excel
      rec._srcFile = sourceMeta.fileName;
      rec._srcSheet = sourceMeta.sheetName;
      out.push(rec);
    }
    return out;
  }

  /* Validate a candidate record. Returns array of {field, value, reason, suggestion}. */
  function validateRecord(rec) {
    var problems = [];
    if (!rec['Business Date']) {
      problems.push({ field: 'Business Date', value: '', reason: 'Missing or invalid Business Date', suggestion: 'Provide the business date in YYYY-MM-DD or DD/MM/YYYY format' });
    }
    if (!rec['Property']) {
      problems.push({ field: 'Property', value: '', reason: 'Missing Property', suggestion: 'Provide the property/resort code' });
    }
    ['Room Nights', 'Arrival Rooms', 'Departure Rooms', 'Adults', 'Children', 'Revenue'].forEach(function (f) {
      if (rec[f] !== null && rec[f] < 0) {
        problems.push({ field: f, value: String(rec[f]), reason: 'Negative value', suggestion: 'Verify the source export' });
      }
    });
    if (rec['Arrival Date'] === '' && rec._rawArrival) {
      problems.push({ field: 'Arrival Date', value: String(rec._rawArrival), reason: 'Invalid Arrival Date', suggestion: 'Correct the date format' });
    }
    return problems;
  }

  /* Classify candidates against the existing key map.
   * existingByKey: Map(key → record). Returns full classification. */
  function classify(candidates, existingByKey) {
    var seenInFile = new Map(); // key → signature (dedupe within the file itself)
    var result = {
      newRecords: [], updates: [], duplicates: 0, invalid: [],
      unmappedRoomTypes: new Map(), unmappedMarketGroups: new Map(),
      unmappedAccountManagers: new Map(), invalidCombos: new Map(),
      minBd: '', maxBd: '', properties: new Set(), total: candidates.length
    };

    candidates.forEach(function (rec) {
      Norm.deriveGroups(rec);
      var problems = validateRecord(rec);
      if (problems.length && problems.some(function (p) { return p.field === 'Business Date' || p.field === 'Property'; })) {
        result.invalid.push({ rec: rec, problems: problems });
        return;
      }

      if (rec._rtg === UNMAPPED && rec['Booked Room Type']) {
        bump(result.unmappedRoomTypes, rec['Booked Room Type']);
      }
      if (rec._seg === UNMAPPED && rec['Market Group']) {
        bump(result.unmappedMarketGroups, rec['Market Group']);
      }
      if (rec._amg === UNMAPPED && rec['Account Manager']) {
        bump(result.unmappedAccountManagers, rec['Account Manager']);
      }
      if (!rec._validCombo && rec._rtg !== UNMAPPED) {
        bump(result.invalidCombos, rec['Property'] + ' + ' + rec._rtg);
      }

      if (rec['Business Date']) {
        if (!result.minBd || rec['Business Date'] < result.minBd) result.minBd = rec['Business Date'];
        if (!result.maxBd || rec['Business Date'] > result.maxBd) result.maxBd = rec['Business Date'];
      }
      if (rec['Property']) result.properties.add(rec['Property']);

      var key = Norm.recordKey(rec);
      var sig = Norm.contentSignature(rec);
      rec.key = key;

      if (seenInFile.has(key)) {
        // Same key twice in one file: identical → duplicate; changed → later row wins as update
        if (seenInFile.get(key) === sig) { result.duplicates++; return; }
        seenInFile.set(key, sig);
        replaceInFileLists(result, key, rec);
        return;
      }
      seenInFile.set(key, sig);

      var existing = existingByKey.get(key);
      if (!existing) {
        result.newRecords.push(rec);
      } else if (Norm.contentSignature(existing) === sig) {
        result.duplicates++;
      } else {
        result.updates.push({ rec: rec, prev: existing });
      }
    });

    return result;
  }

  function bump(map, k) { map.set(k, (map.get(k) || 0) + 1); }

  function replaceInFileLists(result, key, rec) {
    for (var i = 0; i < result.newRecords.length; i++) {
      if (result.newRecords[i].key === key) { result.newRecords[i] = rec; return; }
    }
    for (var j = 0; j < result.updates.length; j++) {
      if (result.updates[j].rec.key === key) { result.updates[j].rec = rec; return; }
    }
    result.newRecords.push(rec);
  }

  /* Strip in-memory derived fields before persisting. */
  function persistable(rec, batchId, now, existingImportTs) {
    var out = {};
    Object.keys(rec).forEach(function (k) {
      if (k.charAt(0) !== '_') out[k] = rec[k];
    });
    out.srcFile = rec._srcFile;
    out.srcSheet = rec._srcSheet;
    out.srcRow = rec._srcRow;
    out.batchId = batchId;
    out.importTimestamp = existingImportTs || now;
    out.updateTimestamp = now;
    return out;
  }

  /* Commit a classified upload. Returns the batch object. */
  function commit(classification, sourceMeta) {
    var now = new Date().toISOString();
    var batchId = 'B' + Date.now();
    var toWrite = [];

    classification.newRecords.forEach(function (rec) {
      toWrite.push(persistable(rec, batchId, now, null));
    });
    var updatedPrev = [];
    classification.updates.forEach(function (u) {
      updatedPrev.push(u.prev);
      toWrite.push(persistable(u.rec, batchId, now, u.prev.importTimestamp));
    });

    var batch = {
      batchId: batchId,
      timestamp: now,
      fileName: sourceMeta.fileName,
      sheetName: sourceMeta.sheetName,
      rowsReceived: classification.total,
      rowsAppended: classification.newRecords.length,
      rowsUpdated: classification.updates.length,
      duplicates: classification.duplicates,
      invalidRows: classification.invalid.length,
      unmappedRows: sumMap(classification.unmappedRoomTypes) + sumMap(classification.unmappedMarketGroups),
      coverageFrom: classification.minBd,
      coverageTo: classification.maxBd,
      addedKeys: classification.newRecords.map(function (r) { return r.key; }),
      updatedPrev: updatedPrev,
      invalidDetails: classification.invalid.slice(0, 500).map(function (iv) {
        return {
          srcFile: iv.rec._srcFile, srcSheet: iv.rec._srcSheet, srcRow: iv.rec._srcRow,
          property: iv.rec['Property'], confirmation: iv.rec['Confirmation Number'],
          problems: iv.problems
        };
      }),
      rolledBack: false
    };

    return DB.commitBatch(toWrite, batch).then(function () { return batch; });
  }

  function sumMap(m) {
    var s = 0; m.forEach(function (v) { s += v; }); return s;
  }

  return {
    parseFile: parseFile,
    detectHeaders: detectHeaders,
    buildRecords: buildRecords,
    classify: classify,
    commit: commit
  };
})();
