/* =========================================================================
 * validation.js — Data Quality engine (PROJECT_CONTEXT.md §16 Tab 7).
 * Runs over the loaded records and produces categorized issues with
 * drillable detail rows.
 * ========================================================================= */
'use strict';

var Validation = (function () {

  function detail(rec, field, value, reason, suggestion) {
    return {
      srcFile: rec.srcFile || rec._srcFile || '',
      srcSheet: rec.srcSheet || rec._srcSheet || '',
      srcRow: rec.srcRow || rec._srcRow || '',
      property: rec['Property'] || '',
      confirmation: rec['Confirmation Number'] || '',
      businessDate: rec['Business Date'] || '',
      field: field,
      value: value === null || value === undefined ? '' : String(value),
      reason: reason,
      suggestion: suggestion
    };
  }

  /* Full data-quality scan. occupancyFlags: [{property, rtg, month, pct}] appended
   * by the dashboard when a computed occupancy exceeds 100%. */
  function run(records, occupancyFlags) {
    var cats = {};
    function add(cat, d) { (cats[cat] = cats[cat] || []).push(d); }

    var byKey = {};
    records.forEach(function (r) {
      var k = r.key || Norm.recordKey(r);
      (byKey[k] = byKey[k] || []).push(r);
    });
    Object.keys(byKey).forEach(function (k) {
      if (byKey[k].length > 1) {
        byKey[k].forEach(function (r) {
          add('Duplicate records', detail(r, 'Record Key', k, 'More than one stored record shares the same key', 'Investigate the source export'));
        });
      }
    });

    records.forEach(function (r) {
      if (r._rtg === UNMAPPED && r['Booked Room Type']) {
        add('Unmapped Room Type Codes', detail(r, 'Booked Room Type', r['Booked Room Type'], 'Code has no Room Type Group mapping', 'Add the code to the approved mapping'));
      }
      if (r._seg === UNMAPPED && r['Market Group']) {
        add('Unmapped Market Groups', detail(r, 'Market Group', r['Market Group'], 'Code has no SEGGRP mapping', 'Add the code to the approved mapping'));
      }
      if (r._amg === UNMAPPED && r['Account Manager']) {
        add('Unmapped Account Managers', detail(r, 'Account Manager', r['Account Manager'], 'Name has no Account Manager Group mapping', 'Add the name to the approved mapping'));
      }
      if (!r._validCombo && r._rtg !== UNMAPPED && r['Property']) {
        add('Invalid Property–Room Type combinations', detail(r, 'Property + Room Type Group', r['Property'] + ' + ' + r._rtg, 'No physical inventory configured for this combination', 'Verify property inventory configuration'));
      }
      if (!r['Business Date']) {
        add('Missing Business Dates', detail(r, 'Business Date', '', 'Business Date is missing or invalid', 'Correct the source row'));
      }
      if (r['Arrival Date'] === '' ) {
        add('Invalid Arrival Dates', detail(r, 'Arrival Date', '', 'Arrival Date is missing or invalid', 'Correct the source row'));
      }
      if (r['Departure Date'] === '') {
        add('Invalid Departure Dates', detail(r, 'Departure Date', '', 'Departure Date is missing or invalid', 'Correct the source row'));
      }
      if (r['Arrival Time'] !== '' && r['Arrival Time Minutes'] === null) {
        add('Invalid Arrival Times', detail(r, 'Arrival Time', r['Arrival Time'], 'Time could not be parsed', 'Use HH:mm format'));
      }
      if (r['Departure Time'] !== '' && r['Departure Time Minutes'] === null) {
        add('Invalid Departure Times', detail(r, 'Departure Time', r['Departure Time'], 'Time could not be parsed', 'Use HH:mm format'));
      }
      if (r['Arrival Rooms'] === null) {
        add('Missing Arrival Rooms', detail(r, 'Arrival Rooms', '', 'Blank value (blank is not zero)', 'Confirm the export includes Arrival Rooms'));
      }
      if (r['Departure Rooms'] === null) {
        add('Missing Departure Rooms', detail(r, 'Departure Rooms', '', 'Blank value (blank is not zero)', 'Confirm the export includes Departure Rooms'));
      }
      if (!r['Room Number']) {
        add('Missing Room Numbers', detail(r, 'Room Number', '', 'Room Number is blank', 'Verify the source export'));
      }
      if (!r['Confirmation Number']) {
        add('Missing Confirmation Numbers', detail(r, 'Confirmation Number', '', 'Blank — fallback record key in use', 'Verify the source export'));
      }
      ['Room Nights', 'Arrival Rooms', 'Departure Rooms', 'Adults', 'Children', 'Revenue'].forEach(function (f) {
        if (r[f] !== null && r[f] < 0) {
          add('Negative numeric values', detail(r, f, r[f], 'Negative value', 'Verify the source export'));
        }
      });
      var ar = r['Arrival Rooms'];
      if (ar !== null && ar > 0 && r['Adults'] === 0 && r['Children'] === 0) {
        add('Zero adults and zero children', detail(r, 'Adults/Children', '0 / 0', 'Arrival with no recorded guests', 'Verify guest counts'));
      }
      if (r['Room Nights'] === null) {
        add('Missing or unavailable Room Nights', detail(r, 'Room Nights', '', 'Blank value — occupancy for this row cannot be counted', 'Confirm the export includes Room Nights'));
      }
    });

    (occupancyFlags || []).forEach(function (f) {
      add('Room Type Occupancy above 100%', {
        srcFile: '', srcSheet: '', srcRow: '', property: f.property,
        confirmation: '', businessDate: f.period || '',
        field: 'Occupancy %', value: Calc.fmtPct(f.pct),
        reason: f.property + ' ' + f.rtg + ' occupancy exceeds 100% (' + Calc.fmtPct(f.pct) + ')',
        suggestion: 'Inspect the supporting records — possible over-booking rows or inventory misconfiguration'
      });
    });

    return cats;
  }

  return { run: run };
})();
