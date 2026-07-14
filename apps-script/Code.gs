/* =========================================================================
 * SOCIAL MEDIA CONTENT DELIVERY TRACKER
 * Backend (Code.gs) - Google Apps Script
 * ========================================================================= */

/* ---------------------------------------------------------------------
 * CONFIG
 * ------------------------------------------------------------------- */
var SHEETS = {
  TRACKER: 'CONTENT_TRACKER',
  LOG: 'UPDATE_LOG',
  TEAM: 'TEAM',
  SETTINGS: 'SETTINGS',
  REMINDERS: 'REMINDER_LOG'
};

var TRACKER_HEADERS = [
  'Request ID', 'Property', 'Campaign', 'Platform', 'Content Type', 'Content Title', 'Detailed Brief',
  'Requester', 'Requester Email', 'Assigned To', 'Assignee Email', 'Priority',
  'Request Date', 'Original Due Date', 'Revised Due Date',
  'Status', 'Progress Percentage', 'Approval Status',
  'Reference Link', 'Drive Link', 'Canva Link', 'Notes',
  'Draft Link', 'Published Link', 'Publication Date',
  'Latest Update', 'Blocker', 'Next Action',
  'Last Updated By', 'Last Updated Date',
  'Last Reminder Sent', 'Reminder Count',
  'Completion Date', 'Days Overdue', 'SLA Status', 'Record Status',
  'Approved By', 'Approval Date', 'Approval Comment',
  'Cancellation Reason', 'Hold Reason'
];

var LOG_HEADERS = [
  'Log ID', 'Timestamp', 'Request ID', 'Update Type', 'Updated By',
  'Previous Status', 'New Status', 'Previous Progress', 'New Progress',
  'Comment', 'Blocker', 'Next Action',
  'Previous Due Date', 'Revised Due Date', 'Expected Completion Date'
];

var TEAM_HEADERS = ['Name', 'Email', 'Role', 'Department', 'Is Social Media Manager', 'Is Department Head', 'Active'];

var SETTINGS_HEADERS = ['Key', 'Value', 'Description'];

var REMINDER_HEADERS = ['Log ID', 'Timestamp', 'Request ID', 'Reminder Type', 'Escalation Level', 'Recipients', 'Status', 'Notes'];

var STATUS_OPTIONS = [
  'Brief Pending', 'Assigned', 'In Progress', 'Draft Submitted', 'Awaiting Internal Review',
  'Revision Required', 'Awaiting Final Approval', 'Approved', 'Scheduled', 'Published',
  'On Hold', 'Cancelled'
];

var PRIORITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];
var APPROVAL_OPTIONS = ['Not Required', 'Pending', 'Revision Required', 'Approved', 'Rejected'];
var RECORD_STATUS_OPTIONS = ['Active', 'Completed', 'Cancelled', 'Archived'];
var ROLE_OPTIONS = ['Administrator', 'Requester', 'Social Media Team', 'Approver', 'Viewer'];

var ACTIVE_STATUSES_FOR_REMINDERS_EXCLUDED = ['Published', 'Cancelled', 'On Hold'];

var DEFAULT_SETTINGS = [
  ['Company Name', 'Social Media Team', 'Displayed in header and emails'],
  ['Time Zone', 'Asia/Dubai', 'IANA time zone used for all date logic'],
  ['Web App URL', '', 'Deployed web app URL - update after each deployment'],
  ['Reminder Working Days', 'Mon,Tue,Wed,Thu,Fri', 'Comma separated working days used for due-soon calculation'],
  ['Due Soon Working Days Before', '2', 'Working days before due date to send the due-soon reminder'],
  ['Escalation Level 2 Days Overdue', '2', 'Days overdue to escalate to the social media manager'],
  ['Escalation Level 3 Days Overdue', '3', 'Days overdue to escalate to the department head'],
  ['Stale Progress Hours', '48', 'Hours without an update before a stale-progress reminder is sent'],
  ['Social Media Manager Email', '', 'Fallback recipient for level 2 escalation if TEAM tab has no manager flagged'],
  ['Department Head Email', '', 'Fallback recipient for level 3 escalation if TEAM tab has no department head flagged'],
  ['Email From Name', 'Content Delivery Tracker', 'Display name used on outgoing emails'],
  ['Default Fallback Role', 'Requester', 'Role granted to signed-in users not listed in the TEAM tab'],
  ['Properties List', 'Property A,Property B,Property C', 'Comma separated list of properties for dropdowns'],
  ['Campaigns List', 'Always On,Seasonal,Promotional,Launch', 'Comma separated list of campaigns for dropdowns'],
  ['Platforms List', 'Instagram,Facebook,TikTok,LinkedIn,X,YouTube,Website,Email', 'Comma separated list of platforms'],
  ['Content Types List', 'Reel,Static Post,Carousel,Story,Video,Blog Post,Newsletter,Ad Creative', 'Comma separated list of content types']
];

/* ---------------------------------------------------------------------
 * WEB APP ENTRY POINTS
 * ------------------------------------------------------------------- */
function doGet(e) {
  var page = HtmlService.createTemplateFromFile('Index').evaluate();
  page.setTitle('Social Media Content Delivery Tracker');
  page.addMetaTag('viewport', 'width=device-width, initial-scale=1');
  page.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return page;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getWebAppUrl_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (err) {
    return '';
  }
}

/* ---------------------------------------------------------------------
 * SETUP
 * ------------------------------------------------------------------- */
function setupApplication() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var trackerSheet = ensureSheet_(ss, SHEETS.TRACKER, TRACKER_HEADERS);
  var logSheet = ensureSheet_(ss, SHEETS.LOG, LOG_HEADERS);
  var teamSheet = ensureSheet_(ss, SHEETS.TEAM, TEAM_HEADERS);
  var settingsSheet = ensureSheet_(ss, SHEETS.SETTINGS, SETTINGS_HEADERS);
  var reminderSheet = ensureSheet_(ss, SHEETS.REMINDERS, REMINDER_HEADERS);

  seedSettings_(settingsSheet);
  seedTeamIfEmpty_(teamSheet);
  applyTrackerValidation_(trackerSheet);
  applyTrackerFormats_(trackerSheet);
  applyLogFormats_(logSheet);

  createDailyReminderTrigger();

  SpreadsheetApp.flush();
  return 'Setup complete. Sheets ready, validations applied, and daily trigger created.';
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  var existingHeaderRange = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || 1));
  var existingHeaders = sheet.getLastRow() > 0 ? existingHeaderRange.getValues()[0] : [];
  var hasHeaders = existingHeaders.join('') !== '';

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a3c6e').setFontColor('#ffffff');
  } else {
    // Add any missing headers to the right without disturbing existing data/columns.
    var currentLastCol = sheet.getLastColumn();
    var currentHeaders = sheet.getRange(1, 1, 1, currentLastCol).getValues()[0];
    headers.forEach(function (h) {
      if (currentHeaders.indexOf(h) === -1) {
        sheet.getRange(1, currentLastCol + 1).setValue(h);
        currentLastCol++;
        currentHeaders.push(h);
      }
    });
    sheet.setFrozenRows(1);
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  return sheet;
}

function seedSettings_(settingsSheet) {
  var existing = readObjects_(settingsSheet);
  var existingKeys = existing.map(function (r) { return r['Key']; });
  var rowsToAdd = [];
  DEFAULT_SETTINGS.forEach(function (row) {
    if (existingKeys.indexOf(row[0]) === -1) {
      rowsToAdd.push(row);
    }
  });
  if (rowsToAdd.length > 0) {
    settingsSheet.getRange(settingsSheet.getLastRow() + 1, 1, rowsToAdd.length, 3).setValues(rowsToAdd);
  }
}

function seedTeamIfEmpty_(teamSheet) {
  if (teamSheet.getLastRow() > 1) return;
  var sampleEmail = Session.getEffectiveUser().getEmail() || 'admin@example.com';
  teamSheet.getRange(2, 1, 1, TEAM_HEADERS.length).setValues([
    ['Administrator', sampleEmail, 'Administrator', 'Marketing', 'No', 'No', 'Yes']
  ]);
}

function applyTrackerValidation_(sheet) {
  var maxRows = 2000;
  var col = trackerColIndex_();
  setDropdown_(sheet, col['Status'], maxRows, STATUS_OPTIONS);
  setDropdown_(sheet, col['Priority'], maxRows, PRIORITY_OPTIONS);
  setDropdown_(sheet, col['Approval Status'], maxRows, APPROVAL_OPTIONS);
  setDropdown_(sheet, col['Record Status'], maxRows, RECORD_STATUS_OPTIONS);
}

function setDropdown_(sheet, colIndex, maxRows, options) {
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(options, true).setAllowInvalid(false).build();
  sheet.getRange(2, colIndex, maxRows - 1, 1).setDataValidation(rule);
}

function applyTrackerFormats_(sheet) {
  var maxRows = 2000;
  var col = trackerColIndex_();
  ['Request Date', 'Original Due Date', 'Revised Due Date', 'Last Updated Date', 'Last Reminder Sent',
    'Completion Date', 'Approval Date', 'Publication Date'].forEach(function (name) {
    sheet.getRange(2, col[name], maxRows - 1, 1).setNumberFormat('yyyy-mm-dd');
  });
  sheet.getRange(2, col['Progress Percentage'], maxRows - 1, 1).setNumberFormat('0"%"');
  sheet.getRange(2, col['Days Overdue'], maxRows - 1, 1).setNumberFormat('0');
  sheet.getRange(2, col['Reminder Count'], maxRows - 1, 1).setNumberFormat('0');
  sheet.setColumnWidths(1, TRACKER_HEADERS.length, 140);
}

function applyLogFormats_(sheet) {
  var col = headerIndexMap_(LOG_HEADERS);
  sheet.getRange(2, col['Timestamp'], 2000, 1).setNumberFormat('yyyy-mm-dd hh:mm');
}

function createDailyReminderTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var exists = triggers.some(function (t) { return t.getHandlerFunction() === 'checkAndSendReminders'; });
  if (!exists) {
    ScriptApp.newTrigger('checkAndSendReminders')
      .timeBased()
      .everyDays(1)
      .atHour(8)
      .inTimezone('Asia/Dubai')
      .create();
  }
  return 'Trigger ready';
}

/* ---------------------------------------------------------------------
 * GENERIC SHEET HELPERS
 * ------------------------------------------------------------------- */
function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name + '. Run setupApplication() first.');
  return sheet;
}

function headerIndexMap_(headers) {
  var map = {};
  headers.forEach(function (h, i) { map[h] = i + 1; });
  return map;
}

function trackerColIndex_() {
  return headerIndexMap_(getSheetHeaders_(getSheet_(SHEETS.TRACKER)));
}

function getSheetHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function readObjects_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[r][c];
    }
    obj.__row = r + 2;
    out.push(obj);
  }
  return out;
}

function objectToRow_(headers, obj) {
  return headers.map(function (h) {
    return obj.hasOwnProperty(h) ? obj[h] : '';
  });
}

function appendObject_(sheet, headers, obj) {
  sheet.appendRow(objectToRow_(headers, obj));
}

function findRowIndexByKey_(sheet, keyHeader, keyValue) {
  var col = headerIndexMap_(getSheetHeaders_(sheet));
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var values = sheet.getRange(2, col[keyHeader], lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(keyValue)) return i + 2;
  }
  return -1;
}

function sanitize_(value) {
  if (value === null || value === undefined) return '';
  var s = String(value);
  return s.replace(/[<>]/g, function (m) { return m === '<' ? '&lt;' : '&gt;'; }).trim();
}

/* ---------------------------------------------------------------------
 * CACHING (settings / team / options)
 * ------------------------------------------------------------------- */
function getSettingsMap() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('settings_map');
  if (cached) return JSON.parse(cached);

  var sheet = getSheet_(SHEETS.SETTINGS);
  var rows = readObjects_(sheet);
  var map = {};
  rows.forEach(function (r) { map[r['Key']] = r['Value']; });
  cache.put('settings_map', JSON.stringify(map), 300);
  return map;
}

function invalidateCaches_() {
  var cache = CacheService.getScriptCache();
  cache.removeAll(['settings_map', 'team_list']);
}

function getTeamList() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('team_list');
  if (cached) return JSON.parse(cached);

  var sheet = getSheet_(SHEETS.TEAM);
  var rows = readObjects_(sheet);
  cache.put('team_list', JSON.stringify(rows), 300);
  return rows;
}

function getDropdownOptions_() {
  var settings = getSettingsMap();
  function splitList(key) {
    return (settings[key] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  return {
    statuses: STATUS_OPTIONS,
    priorities: PRIORITY_OPTIONS,
    approvalStatuses: APPROVAL_OPTIONS,
    recordStatuses: RECORD_STATUS_OPTIONS,
    roles: ROLE_OPTIONS,
    properties: splitList('Properties List'),
    campaigns: splitList('Campaigns List'),
    platforms: splitList('Platforms List'),
    contentTypes: splitList('Content Types List'),
    assignees: getTeamList().filter(function (t) { return String(t['Active']).toLowerCase() !== 'no'; })
      .map(function (t) { return { name: t['Name'], email: t['Email'] }; })
  };
}

/* ---------------------------------------------------------------------
 * AUTH / ROLE RESOLUTION
 * ------------------------------------------------------------------- */
function getCurrentUserContext_() {
  var email = '';
  try { email = Session.getActiveUser().getEmail(); } catch (e1) { email = ''; }
  if (!email) {
    try { email = Session.getEffectiveUser().getEmail(); } catch (e2) { email = ''; }
  }
  var team = getTeamList();
  var match = team.filter(function (t) {
    return t['Email'] && String(t['Email']).toLowerCase() === String(email).toLowerCase();
  })[0];

  var settings = getSettingsMap();
  var role = settings['Default Fallback Role'] || 'Requester';
  var name = email ? email.split('@')[0] : 'Guest';

  if (match) {
    role = match['Role'] || role;
    name = match['Name'] || name;
    if (String(match['Active']).toLowerCase() === 'no') {
      role = 'Viewer';
    }
  }

  return { email: email, name: name, role: role, isKnownTeamMember: !!match };
}

function getBootstrapData() {
  var user = getCurrentUserContext_();
  return {
    user: user,
    options: getDropdownOptions_(),
    settings: getSettingsMap(),
    webAppUrl: getWebAppUrl_()
  };
}

/* ---------------------------------------------------------------------
 * ID GENERATION
 * ------------------------------------------------------------------- */
function generateRequestId_(sheet) {
  var year = new Date().getFullYear();
  var prefix = 'SM-' + year + '-';
  var col = headerIndexMap_(getSheetHeaders_(sheet));
  var lastRow = sheet.getLastRow();
  var maxSeq = 0;
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, col['Request ID'], lastRow - 1, 1).getValues();
    ids.forEach(function (row) {
      var id = String(row[0] || '');
      if (id.indexOf(prefix) === 0) {
        var seq = parseInt(id.substring(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  }
  var next = maxSeq + 1;
  return prefix + ('0000' + next).slice(-4);
}

/* ---------------------------------------------------------------------
 * DATE / SLA HELPERS
 * ------------------------------------------------------------------- */
function toDateOnly_(value) {
  if (!value) return null;
  var d = (value instanceof Date) ? new Date(value.getTime()) : new Date(value);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayDateOnly_() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween_(a, b) {
  var msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function effectiveDueDate_(record) {
  return toDateOnly_(record['Revised Due Date']) || toDateOnly_(record['Original Due Date']);
}

var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function isWorkingDay_(date, workingDaySet) {
  return workingDaySet.indexOf(DAY_NAMES[date.getDay()]) !== -1;
}

function subtractWorkingDays_(date, n, workingDaySet) {
  var d = new Date(date.getTime());
  var remaining = n;
  while (remaining > 0) {
    d.setDate(d.getDate() - 1);
    if (isWorkingDay_(d, workingDaySet)) remaining--;
  }
  return d;
}

function computeDaysOverdue_(record) {
  var due = effectiveDueDate_(record);
  if (!due) return 0;
  var completionDate = toDateOnly_(record['Completion Date']);
  var reference = completionDate || todayDateOnly_();
  var overdue = daysBetween_(due, reference);
  return overdue > 0 ? overdue : 0;
}

function computeSLAStatus_(record) {
  var status = record['Status'];
  var due = effectiveDueDate_(record);
  if (status === 'Cancelled') return 'N/A';
  if (status === 'Published') {
    var completion = toDateOnly_(record['Completion Date']);
    if (due && completion) {
      return completion.getTime() <= due.getTime() ? 'On Time' : 'Delayed';
    }
    return 'Completed';
  }
  if (!due) return 'N/A';
  var today = todayDateOnly_();
  var diff = daysBetween_(today, due);
  if (diff < 0) return 'Overdue';
  if (diff <= 2) return 'Due Soon';
  return 'On Track';
}

function formatDate_(date) {
  if (!date) return '';
  return Utilities.formatDate(date, 'Asia/Dubai', 'dd MMM yyyy');
}

/* ---------------------------------------------------------------------
 * COMPUTED FIELD REFRESH (applied on every read for accuracy)
 * ------------------------------------------------------------------- */
function decorateRecord_(record) {
  record['Days Overdue'] = computeDaysOverdue_(record);
  record['SLA Status'] = computeSLAStatus_(record);
  return record;
}

function persistComputedFields_(sheet, record) {
  var col = headerIndexMap_(getSheetHeaders_(sheet));
  sheet.getRange(record.__row, col['Days Overdue']).setValue(record['Days Overdue']);
  sheet.getRange(record.__row, col['SLA Status']).setValue(record['SLA Status']);
}

/* ---------------------------------------------------------------------
 * TRACKER READ APIs
 * ------------------------------------------------------------------- */
function getTrackerRows_(includeArchived) {
  var sheet = getSheet_(SHEETS.TRACKER);
  var rows = readObjects_(sheet);
  rows.forEach(decorateRecord_);
  if (!includeArchived) {
    rows = rows.filter(function (r) { return r['Record Status'] !== 'Archived'; });
  }
  return rows;
}

function getTrackerData(filters) {
  var rows = getTrackerRows_(false);
  return applyFilters_(rows, filters);
}

function applyFilters_(rows, filters) {
  filters = filters || {};
  return rows.filter(function (r) {
    if (filters.property && r['Property'] !== filters.property) return false;
    if (filters.campaign && r['Campaign'] !== filters.campaign) return false;
    if (filters.platform && r['Platform'] !== filters.platform) return false;
    if (filters.contentType && r['Content Type'] !== filters.contentType) return false;
    if (filters.assignedTo && r['Assigned To'] !== filters.assignedTo) return false;
    if (filters.priority && r['Priority'] !== filters.priority) return false;
    if (filters.status && r['Status'] !== filters.status) return false;
    if (filters.approvalStatus && r['Approval Status'] !== filters.approvalStatus) return false;
    if (filters.recordStatus && r['Record Status'] !== filters.recordStatus) return false;
    if (filters.overdueOnly && r['SLA Status'] !== 'Overdue') return false;
    if (filters.noRecentUpdate) {
      var last = toDateOnly_(r['Last Updated Date']);
      if (!last || daysBetween_(last, todayDateOnly_()) < 2) return false;
    }
    if (filters.dueFrom) {
      var due = effectiveDueDate_(r);
      if (!due || due.getTime() < new Date(filters.dueFrom).getTime()) return false;
    }
    if (filters.dueTo) {
      var due2 = effectiveDueDate_(r);
      if (!due2 || due2.getTime() > new Date(filters.dueTo).getTime()) return false;
    }
    if (filters.search) {
      var needle = String(filters.search).toLowerCase();
      var haystack = [r['Request ID'], r['Content Title'], r['Campaign'], r['Requester'], r['Assigned To']]
        .join(' ').toLowerCase();
      if (haystack.indexOf(needle) === -1) return false;
    }
    return true;
  });
}

function getRequestDetail(requestId) {
  var rows = getTrackerRows_(true);
  var record = rows.filter(function (r) { return r['Request ID'] === requestId; })[0];
  if (!record) throw new Error('Request not found: ' + requestId);
  return {
    record: record,
    updates: getUpdateTimeline(requestId),
    reminders: getReminderHistory(requestId)
  };
}

function getUpdateTimeline(requestId) {
  var sheet = getSheet_(SHEETS.LOG);
  var rows = readObjects_(sheet);
  return rows.filter(function (r) { return r['Request ID'] === requestId; })
    .sort(function (a, b) { return new Date(b['Timestamp']) - new Date(a['Timestamp']); });
}

function getReminderHistory(requestId) {
  var sheet = getSheet_(SHEETS.REMINDERS);
  var rows = readObjects_(sheet);
  return rows.filter(function (r) { return r['Request ID'] === requestId; })
    .sort(function (a, b) { return new Date(b['Timestamp']) - new Date(a['Timestamp']); });
}

/* ---------------------------------------------------------------------
 * CREATE REQUEST
 * ------------------------------------------------------------------- */
function createRequest(form) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    validateNewRequest_(form);
    var sheet = getSheet_(SHEETS.TRACKER);
    var requestId = generateRequestId_(sheet);
    var user = getCurrentUserContext_();
    var now = new Date();

    var record = {
      'Request ID': requestId,
      'Property': sanitize_(form.property),
      'Campaign': sanitize_(form.campaign),
      'Platform': sanitize_(form.platform),
      'Content Type': sanitize_(form.contentType),
      'Content Title': sanitize_(form.contentTitle),
      'Detailed Brief': sanitize_(form.detailedBrief),
      'Requester': sanitize_(form.requester),
      'Requester Email': sanitize_(form.requesterEmail),
      'Assigned To': sanitize_(form.assignedTo),
      'Assignee Email': sanitize_(form.assigneeEmail),
      'Priority': sanitize_(form.priority),
      'Request Date': now,
      'Original Due Date': new Date(form.originalDueDate),
      'Revised Due Date': '',
      'Status': 'Brief Pending',
      'Progress Percentage': 0,
      'Approval Status': 'Not Required',
      'Reference Link': sanitize_(form.referenceLink),
      'Drive Link': sanitize_(form.driveLink),
      'Canva Link': sanitize_(form.canvaLink),
      'Notes': sanitize_(form.notes),
      'Draft Link': '',
      'Published Link': '',
      'Publication Date': '',
      'Latest Update': 'Request created.',
      'Blocker': '',
      'Next Action': 'Assign and begin work.',
      'Last Updated By': user.name,
      'Last Updated Date': now,
      'Last Reminder Sent': '',
      'Reminder Count': 0,
      'Completion Date': '',
      'Days Overdue': 0,
      'SLA Status': 'On Track',
      'Record Status': 'Active',
      'Approved By': '',
      'Approval Date': '',
      'Approval Comment': '',
      'Cancellation Reason': '',
      'Hold Reason': ''
    };

    if (record['Assigned To']) record['Status'] = 'Assigned';

    appendObject_(sheet, TRACKER_HEADERS, record);
    appendUpdateLog_({
      requestId: requestId, updateType: 'Created', updatedBy: user.name,
      prevStatus: '', newStatus: record['Status'], prevProgress: '', newProgress: 0,
      comment: 'New content request created.', blocker: '', nextAction: record['Next Action'],
      prevDueDate: '', revisedDueDate: '', expectedCompletion: ''
    });

    return { success: true, requestId: requestId };
  } finally {
    lock.releaseLock();
  }
}

function validateNewRequest_(form) {
  var required = ['property', 'campaign', 'platform', 'contentType', 'contentTitle', 'detailedBrief',
    'requester', 'requesterEmail', 'priority', 'originalDueDate'];
  required.forEach(function (f) {
    if (!form[f] || String(form[f]).trim() === '') {
      throw new Error('Missing required field: ' + f);
    }
  });
  var due = new Date(form.originalDueDate);
  var today = todayDateOnly_();
  if (due.getTime() < today.getTime()) {
    throw new Error('Original due date cannot be earlier than today.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.requesterEmail)) {
    throw new Error('Requester email is not valid.');
  }
  if (form.assigneeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.assigneeEmail)) {
    throw new Error('Assignee email is not valid.');
  }
}

/* ---------------------------------------------------------------------
 * UPDATE LOG
 * ------------------------------------------------------------------- */
function appendUpdateLog_(data) {
  var sheet = getSheet_(SHEETS.LOG);
  var logId = 'LG-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
  appendObject_(sheet, LOG_HEADERS, {
    'Log ID': logId,
    'Timestamp': new Date(),
    'Request ID': data.requestId,
    'Update Type': data.updateType,
    'Updated By': data.updatedBy,
    'Previous Status': data.prevStatus,
    'New Status': data.newStatus,
    'Previous Progress': data.prevProgress,
    'New Progress': data.newProgress,
    'Comment': sanitize_(data.comment),
    'Blocker': sanitize_(data.blocker),
    'Next Action': sanitize_(data.nextAction),
    'Previous Due Date': data.prevDueDate,
    'Revised Due Date': data.revisedDueDate,
    'Expected Completion Date': data.expectedCompletion
  });
}

/* ---------------------------------------------------------------------
 * RECORD LOOKUP / MUTATION HELPER
 * ------------------------------------------------------------------- */
function loadTrackerRecord_(sheet, requestId) {
  var row = findRowIndexByKey_(sheet, 'Request ID', requestId);
  if (row === -1) throw new Error('Request not found: ' + requestId);
  var headers = getSheetHeaders_(sheet);
  var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  var record = {};
  headers.forEach(function (h, i) { record[h] = values[i]; });
  record.__row = row;
  return record;
}

function writeTrackerRecord_(sheet, record) {
  var headers = getSheetHeaders_(sheet);
  var row = objectToRow_(headers, record);
  sheet.getRange(record.__row, 1, 1, headers.length).setValues([row]);
}

/* ---------------------------------------------------------------------
 * UPDATE PROGRESS
 * ------------------------------------------------------------------- */
function updateProgress(requestId, form) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_(SHEETS.TRACKER);
    var record = loadTrackerRecord_(sheet, requestId);
    var user = getCurrentUserContext_();

    if (!form.status || form.progress === undefined || form.progress === null || form.progress === '') {
      throw new Error('Status and progress percentage are required.');
    }
    if (!form.comment || String(form.comment).trim() === '') {
      throw new Error('A progress comment is required.');
    }
    if (!form.nextAction || String(form.nextAction).trim() === '') {
      throw new Error('Next action is required.');
    }

    var progress = Math.max(0, Math.min(100, Number(form.progress)));
    var isDelayed = !!form.isDelayed;
    if (isDelayed) {
      if (!form.delayReason || !form.blocker || !form.revisedDueDate) {
        throw new Error('Delay reason, blocker, and revised due date are required for a delayed update.');
      }
    }

    var prevStatus = record['Status'];
    var prevProgress = record['Progress Percentage'];
    var prevDueDate = record['Revised Due Date'] || record['Original Due Date'];

    record['Status'] = form.status;
    record['Progress Percentage'] = progress;
    record['Latest Update'] = sanitize_(form.comment);
    record['Next Action'] = sanitize_(form.nextAction);
    record['Blocker'] = isDelayed ? sanitize_(form.blocker) : sanitize_(form.blocker || '');
    record['Last Updated By'] = user.name;
    record['Last Updated Date'] = new Date();

    if (isDelayed && form.revisedDueDate) {
      record['Revised Due Date'] = new Date(form.revisedDueDate);
    }

    decorateRecord_(record);
    writeTrackerRecord_(sheet, record);

    appendUpdateLog_({
      requestId: requestId, updateType: isDelayed ? 'Delay Reported' : 'Progress Update', updatedBy: user.name,
      prevStatus: prevStatus, newStatus: record['Status'], prevProgress: prevProgress, newProgress: progress,
      comment: form.comment + (isDelayed ? (' | Delay reason: ' + form.delayReason) : ''),
      blocker: record['Blocker'], nextAction: record['Next Action'],
      prevDueDate: prevDueDate, revisedDueDate: record['Revised Due Date'],
      expectedCompletion: form.expectedCompletionDate || ''
    });

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------------
 * DRAFT SUBMISSION
 * ------------------------------------------------------------------- */
function submitDraft(requestId, draftLink, comment) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!draftLink) throw new Error('Draft link is required.');
    var sheet = getSheet_(SHEETS.TRACKER);
    var record = loadTrackerRecord_(sheet, requestId);
    var user = getCurrentUserContext_();
    var prevStatus = record['Status'];
    var prevProgress = record['Progress Percentage'];

    record['Draft Link'] = sanitize_(draftLink);
    record['Status'] = 'Draft Submitted';
    record['Approval Status'] = 'Pending';
    record['Progress Percentage'] = Math.max(record['Progress Percentage'], 80);
    record['Latest Update'] = sanitize_(comment) || 'Draft submitted for review.';
    record['Last Updated By'] = user.name;
    record['Last Updated Date'] = new Date();

    decorateRecord_(record);
    writeTrackerRecord_(sheet, record);

    appendUpdateLog_({
      requestId: requestId, updateType: 'Draft Submitted', updatedBy: user.name,
      prevStatus: prevStatus, newStatus: record['Status'], prevProgress: prevProgress, newProgress: record['Progress Percentage'],
      comment: 'Draft submitted: ' + draftLink + (comment ? (' - ' + comment) : ''),
      blocker: record['Blocker'], nextAction: 'Awaiting review', prevDueDate: '', revisedDueDate: '', expectedCompletion: ''
    });

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function requestApproval(requestId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_(SHEETS.TRACKER);
    var record = loadTrackerRecord_(sheet, requestId);
    var user = getCurrentUserContext_();
    var prevStatus = record['Status'];

    record['Status'] = 'Awaiting Final Approval';
    record['Approval Status'] = 'Pending';
    record['Last Updated By'] = user.name;
    record['Last Updated Date'] = new Date();

    decorateRecord_(record);
    writeTrackerRecord_(sheet, record);

    appendUpdateLog_({
      requestId: requestId, updateType: 'Approval Requested', updatedBy: user.name,
      prevStatus: prevStatus, newStatus: record['Status'], prevProgress: record['Progress Percentage'], newProgress: record['Progress Percentage'],
      comment: 'Sent for final approval.', blocker: '', nextAction: 'Awaiting approver decision', prevDueDate: '', revisedDueDate: '', expectedCompletion: ''
    });

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------------
 * APPROVAL WORKFLOW
 * ------------------------------------------------------------------- */
function recordApproval(requestId, decision, comment, revisedDueDate) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (['Approved', 'Revision Required', 'Rejected'].indexOf(decision) === -1) {
      throw new Error('Invalid approval decision.');
    }
    var sheet = getSheet_(SHEETS.TRACKER);
    var record = loadTrackerRecord_(sheet, requestId);
    var user = getCurrentUserContext_();
    var prevStatus = record['Status'];
    var prevDueDate = record['Revised Due Date'] || record['Original Due Date'];

    record['Approval Status'] = decision;
    record['Approved By'] = user.name;
    record['Approval Date'] = new Date();
    record['Approval Comment'] = sanitize_(comment);
    record['Last Updated By'] = user.name;
    record['Last Updated Date'] = new Date();

    if (decision === 'Approved') {
      record['Status'] = 'Approved';
      record['Progress Percentage'] = Math.max(record['Progress Percentage'], 90);
    } else if (decision === 'Revision Required') {
      if (!revisedDueDate) throw new Error('A revised expected delivery date is required when requesting revisions.');
      record['Status'] = 'Revision Required';
      record['Revised Due Date'] = new Date(revisedDueDate);
      record['Next Action'] = 'Address reviewer feedback and resubmit draft.';
    } else {
      record['Status'] = 'Revision Required';
    }

    decorateRecord_(record);
    writeTrackerRecord_(sheet, record);

    appendUpdateLog_({
      requestId: requestId, updateType: 'Approval Decision (' + decision + ')', updatedBy: user.name,
      prevStatus: prevStatus, newStatus: record['Status'], prevProgress: record['Progress Percentage'], newProgress: record['Progress Percentage'],
      comment: comment, blocker: record['Blocker'], nextAction: record['Next Action'],
      prevDueDate: prevDueDate, revisedDueDate: record['Revised Due Date'], expectedCompletion: ''
    });

    if (decision !== 'Approved') {
      notifyAssignee_(record, 'Revision requested on ' + requestId, comment);
    }

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------------
 * SCHEDULE / PUBLISH / HOLD / CANCEL / ARCHIVE
 * ------------------------------------------------------------------- */
function markScheduled(requestId, scheduledDate, comment) {
  return transitionStatus_(requestId, function (record) {
    record['Status'] = 'Scheduled';
    if (scheduledDate) record['Revised Due Date'] = record['Revised Due Date'] || new Date(scheduledDate);
    record['Latest Update'] = sanitize_(comment) || 'Content scheduled for publication.';
  }, 'Scheduled');
}

function markPublished(requestId, form) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!form.publishedUrl || !form.publicationDate || !form.platform) {
      throw new Error('Published URL, publication date, and platform are required.');
    }
    var sheet = getSheet_(SHEETS.TRACKER);
    var record = loadTrackerRecord_(sheet, requestId);
    var user = getCurrentUserContext_();
    var prevStatus = record['Status'];

    record['Published Link'] = sanitize_(form.publishedUrl);
    record['Publication Date'] = new Date(form.publicationDate);
    record['Platform'] = sanitize_(form.platform) || record['Platform'];
    record['Status'] = 'Published';
    record['Progress Percentage'] = 100;
    record['Completion Date'] = new Date(form.publicationDate);
    record['Record Status'] = 'Completed';
    record['Latest Update'] = sanitize_(form.comment) || 'Content published.';
    record['Last Updated By'] = user.name;
    record['Last Updated Date'] = new Date();

    decorateRecord_(record);
    writeTrackerRecord_(sheet, record);

    appendUpdateLog_({
      requestId: requestId, updateType: 'Published', updatedBy: user.name,
      prevStatus: prevStatus, newStatus: 'Published', prevProgress: record['Progress Percentage'], newProgress: 100,
      comment: 'Published at ' + form.publishedUrl + (form.comment ? (' - ' + form.comment) : ''),
      blocker: '', nextAction: 'None - complete', prevDueDate: '', revisedDueDate: '', expectedCompletion: ''
    });

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function holdRequest(requestId, reason) {
  if (!reason) throw new Error('A hold reason is required.');
  return transitionStatus_(requestId, function (record) {
    record['Status'] = 'On Hold';
    record['Hold Reason'] = sanitize_(reason);
    record['Latest Update'] = 'Placed on hold: ' + reason;
  }, 'On Hold');
}

function resumeRequest(requestId, newStatus) {
  return transitionStatus_(requestId, function (record) {
    record['Status'] = newStatus || 'In Progress';
    record['Hold Reason'] = '';
    record['Latest Update'] = 'Resumed from hold.';
  }, 'Resumed');
}

function cancelRequest(requestId, reason) {
  if (!reason) throw new Error('A cancellation reason is required.');
  return transitionStatus_(requestId, function (record) {
    record['Status'] = 'Cancelled';
    record['Cancellation Reason'] = sanitize_(reason);
    record['Record Status'] = 'Cancelled';
    record['Completion Date'] = new Date();
    record['Latest Update'] = 'Cancelled: ' + reason;
  }, 'Cancelled');
}

function archiveRequest(requestId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_(SHEETS.TRACKER);
    var record = loadTrackerRecord_(sheet, requestId);
    if (['Published', 'Cancelled'].indexOf(record['Status']) === -1) {
      throw new Error('Only Published or Cancelled requests can be archived.');
    }
    var user = getCurrentUserContext_();
    record['Record Status'] = 'Archived';
    record['Last Updated By'] = user.name;
    record['Last Updated Date'] = new Date();
    writeTrackerRecord_(sheet, record);

    appendUpdateLog_({
      requestId: requestId, updateType: 'Archived', updatedBy: user.name,
      prevStatus: record['Status'], newStatus: record['Status'], prevProgress: record['Progress Percentage'], newProgress: record['Progress Percentage'],
      comment: 'Record archived.', blocker: '', nextAction: '', prevDueDate: '', revisedDueDate: '', expectedCompletion: ''
    });
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function transitionStatus_(requestId, mutateFn, logLabel) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_(SHEETS.TRACKER);
    var record = loadTrackerRecord_(sheet, requestId);
    var user = getCurrentUserContext_();
    var prevStatus = record['Status'];
    var prevProgress = record['Progress Percentage'];

    mutateFn(record);
    record['Last Updated By'] = user.name;
    record['Last Updated Date'] = new Date();

    decorateRecord_(record);
    writeTrackerRecord_(sheet, record);

    appendUpdateLog_({
      requestId: requestId, updateType: logLabel, updatedBy: user.name,
      prevStatus: prevStatus, newStatus: record['Status'], prevProgress: prevProgress, newProgress: record['Progress Percentage'],
      comment: record['Latest Update'], blocker: record['Blocker'] || '', nextAction: record['Next Action'] || '',
      prevDueDate: '', revisedDueDate: record['Revised Due Date'] || '', expectedCompletion: ''
    });

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------------------------------------
 * ARCHIVE VIEW
 * ------------------------------------------------------------------- */
function getArchivedRecords(filters) {
  var rows = getTrackerRows_(true).filter(function (r) { return r['Record Status'] === 'Archived'; });
  return applyFilters_(rows, filters);
}

/* ---------------------------------------------------------------------
 * DASHBOARD
 * ------------------------------------------------------------------- */
function getDashboardData() {
  var rows = getTrackerRows_(false);
  var today = todayDateOnly_();
  var in7 = new Date(today.getTime() + 7 * 86400000);
  var monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  var active = rows.filter(function (r) { return ['Published', 'Cancelled'].indexOf(r['Status']) === -1; });
  var dueToday = active.filter(function (r) { var d = effectiveDueDate_(r); return d && d.getTime() === today.getTime(); });
  var dueSoon = active.filter(function (r) {
    var d = effectiveDueDate_(r);
    return d && d.getTime() >= today.getTime() && d.getTime() <= in7.getTime();
  });
  var overdue = active.filter(function (r) { return r['SLA Status'] === 'Overdue'; });
  var criticalOverdue = overdue.filter(function (r) { return r['Priority'] === 'Critical'; });
  var awaitingApproval = rows.filter(function (r) { return r['Approval Status'] === 'Pending'; });
  var scheduled = rows.filter(function (r) { return r['Status'] === 'Scheduled'; });
  var publishedThisMonth = rows.filter(function (r) {
    var pd = toDateOnly_(r['Publication Date']);
    return r['Status'] === 'Published' && pd && pd.getTime() >= monthStart.getTime();
  });
  var staleUpdates = active.filter(function (r) {
    var last = toDateOnly_(r['Last Updated Date']) || toDateOnly_(r['Request Date']);
    if (!last) return false;
    var hours = (new Date().getTime() - new Date(r['Last Updated Date'] || r['Request Date']).getTime()) / 3600000;
    return hours >= 48;
  });

  var completed = rows.filter(function (r) { return r['Status'] === 'Published'; });
  var onTime = completed.filter(function (r) { return r['SLA Status'] === 'On Time'; });
  var onTimePct = completed.length > 0 ? Math.round((onTime.length / completed.length) * 100) : 0;

  function countBy(list, key) {
    var out = {};
    list.forEach(function (r) {
      var k = r[key] || 'Unspecified';
      out[k] = (out[k] || 0) + 1;
    });
    return Object.keys(out).map(function (k) { return [k, out[k]]; });
  }

  var pendingByAssignee = countBy(active, 'Assigned To');
  var byStatus = countBy(rows, 'Status');
  var byProperty = countBy(rows, 'Property');
  var byPlatform = countBy(rows, 'Platform');

  var monthlyMap = {};
  rows.forEach(function (r) {
    var rd = toDateOnly_(r['Request Date']);
    if (rd) {
      var key = Utilities.formatDate(rd, 'Asia/Dubai', 'yyyy-MM');
      monthlyMap[key] = monthlyMap[key] || { requested: 0, published: 0 };
      monthlyMap[key].requested++;
    }
    var pd = toDateOnly_(r['Publication Date']);
    if (pd) {
      var key2 = Utilities.formatDate(pd, 'Asia/Dubai', 'yyyy-MM');
      monthlyMap[key2] = monthlyMap[key2] || { requested: 0, published: 0 };
      monthlyMap[key2].published++;
    }
  });
  var monthlyKeys = Object.keys(monthlyMap).sort();
  var monthly = monthlyKeys.map(function (k) { return [k, monthlyMap[k].requested, monthlyMap[k].published]; });

  var onTimeVsDelayed = [
    ['On Time', completed.filter(function (r) { return r['SLA Status'] === 'On Time'; }).length],
    ['Delayed', completed.filter(function (r) { return r['SLA Status'] === 'Delayed'; }).length]
  ];

  var delayByTypeMap = {};
  completed.forEach(function (r) {
    var due = effectiveDueDate_(r);
    var completion = toDateOnly_(r['Completion Date']);
    if (!due || !completion) return;
    var delay = daysBetween_(due, completion);
    var type = r['Content Type'] || 'Unspecified';
    delayByTypeMap[type] = delayByTypeMap[type] || { total: 0, count: 0 };
    delayByTypeMap[type].total += Math.max(0, delay);
    delayByTypeMap[type].count++;
  });
  var avgDelayByType = Object.keys(delayByTypeMap).map(function (t) {
    return [t, Math.round((delayByTypeMap[t].total / delayByTypeMap[t].count) * 10) / 10];
  });

  return {
    kpis: {
      active: active.length,
      dueToday: dueToday.length,
      dueSoon: dueSoon.length,
      overdue: overdue.length,
      criticalOverdue: criticalOverdue.length,
      awaitingApproval: awaitingApproval.length,
      scheduled: scheduled.length,
      publishedThisMonth: publishedThisMonth.length,
      staleUpdates: staleUpdates.length,
      onTimePct: onTimePct
    },
    charts: {
      pendingByAssignee: pendingByAssignee,
      byStatus: byStatus,
      byProperty: byProperty,
      byPlatform: byPlatform,
      monthly: monthly,
      onTimeVsDelayed: onTimeVsDelayed,
      avgDelayByType: avgDelayByType
    }
  };
}

/* ---------------------------------------------------------------------
 * REPORTS
 * ------------------------------------------------------------------- */
function getReportsData(range) {
  var rows = getTrackerRows_(true);
  if (range && range.from) {
    rows = rows.filter(function (r) {
      var rd = toDateOnly_(r['Request Date']);
      return rd && rd.getTime() >= new Date(range.from).getTime();
    });
  }
  if (range && range.to) {
    rows = rows.filter(function (r) {
      var rd = toDateOnly_(r['Request Date']);
      return rd && rd.getTime() <= new Date(range.to).getTime();
    });
  }

  function groupPerformance(key) {
    var map = {};
    rows.forEach(function (r) {
      var k = r[key] || 'Unspecified';
      map[k] = map[k] || { total: 0, onTime: 0, delayed: 0, overdue: 0, active: 0 };
      map[k].total++;
      if (r['Status'] === 'Published') {
        if (r['SLA Status'] === 'On Time') map[k].onTime++; else map[k].delayed++;
      } else if (['Cancelled'].indexOf(r['Status']) === -1) {
        map[k].active++;
        if (r['SLA Status'] === 'Overdue') map[k].overdue++;
      }
    });
    return Object.keys(map).map(function (k) {
      var v = map[k];
      var completed = v.onTime + v.delayed;
      return {
        name: k, total: v.total, onTime: v.onTime, delayed: v.delayed,
        overdue: v.overdue, active: v.active,
        onTimePct: completed > 0 ? Math.round((v.onTime / completed) * 100) : null
      };
    });
  }

  return {
    byAssignee: groupPerformance('Assigned To'),
    byProperty: groupPerformance('Property'),
    byPlatform: groupPerformance('Platform'),
    byContentType: groupPerformance('Content Type'),
    totalRequests: rows.length
  };
}

/* ---------------------------------------------------------------------
 * TEAM MANAGEMENT
 * ------------------------------------------------------------------- */
function getTeamMembers() {
  return readObjects_(getSheet_(SHEETS.TEAM));
}

function upsertTeamMember(member) {
  if (!member.name || !member.email || !member.role) {
    throw new Error('Name, email, and role are required.');
  }
  var sheet = getSheet_(SHEETS.TEAM);
  var rowIndex = findRowIndexByKey_(sheet, 'Email', member.email);
  var record = {
    'Name': sanitize_(member.name),
    'Email': sanitize_(member.email),
    'Role': sanitize_(member.role),
    'Department': sanitize_(member.department),
    'Is Social Media Manager': member.isSocialMediaManager ? 'Yes' : 'No',
    'Is Department Head': member.isDepartmentHead ? 'Yes' : 'No',
    'Active': member.active === false ? 'No' : 'Yes'
  };
  if (rowIndex === -1) {
    appendObject_(sheet, TEAM_HEADERS, record);
  } else {
    var row = objectToRow_(TEAM_HEADERS, record);
    sheet.getRange(rowIndex, 1, 1, TEAM_HEADERS.length).setValues([row]);
  }
  invalidateCaches_();
  return { success: true };
}

function setTeamMemberActive(email, active) {
  var sheet = getSheet_(SHEETS.TEAM);
  var rowIndex = findRowIndexByKey_(sheet, 'Email', email);
  if (rowIndex === -1) throw new Error('Team member not found.');
  var col = headerIndexMap_(TEAM_HEADERS);
  sheet.getRange(rowIndex, col['Active']).setValue(active ? 'Yes' : 'No');
  invalidateCaches_();
  return { success: true };
}

/* ---------------------------------------------------------------------
 * SETTINGS MANAGEMENT
 * ------------------------------------------------------------------- */
function getAllSettings() {
  return readObjects_(getSheet_(SHEETS.SETTINGS));
}

function saveSettings(entries) {
  var sheet = getSheet_(SHEETS.SETTINGS);
  var col = headerIndexMap_(SETTINGS_HEADERS);
  entries.forEach(function (entry) {
    var rowIndex = findRowIndexByKey_(sheet, 'Key', entry.key);
    if (rowIndex === -1) {
      appendObject_(sheet, SETTINGS_HEADERS, { 'Key': entry.key, 'Value': entry.value, 'Description': entry.description || '' });
    } else {
      sheet.getRange(rowIndex, col['Value']).setValue(entry.value);
    }
  });
  invalidateCaches_();
  return { success: true };
}

/* ---------------------------------------------------------------------
 * REMINDER ENGINE
 * ------------------------------------------------------------------- */
function checkAndSendReminders() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = getSheet_(SHEETS.TRACKER);
    var settings = getSettingsMap();
    var workingDaySet = (settings['Reminder Working Days'] || 'Mon,Tue,Wed,Thu,Fri').split(',').map(function (s) { return s.trim(); });
    var dueSoonDays = parseInt(settings['Due Soon Working Days Before'], 10) || 2;
    var level2Days = parseInt(settings['Escalation Level 2 Days Overdue'], 10) || 2;
    var level3Days = parseInt(settings['Escalation Level 3 Days Overdue'], 10) || 3;
    var staleHours = parseInt(settings['Stale Progress Hours'], 10) || 48;

    var rows = readObjects_(sheet);
    var today = todayDateOnly_();
    var now = new Date();
    var sentTodayIndex = buildTodaysReminderIndex_();

    rows.forEach(function (record) {
      decorateRecord_(record);
      if (ACTIVE_STATUSES_FOR_REMINDERS_EXCLUDED.indexOf(record['Status']) !== -1) return;
      if (record['Record Status'] === 'Archived') return;

      var due = effectiveDueDate_(record);
      var reminderType = null;
      var escalationLevel = 1;

      if (due) {
        var dueSoonDate = subtractWorkingDays_(due, dueSoonDays, workingDaySet);
        var diffDays = daysBetween_(today, due);

        if (today.getTime() === dueSoonDate.getTime()) {
          reminderType = 'Due Soon'; escalationLevel = 1;
        } else if (diffDays === 0) {
          reminderType = 'Due Today'; escalationLevel = 1;
        } else if (diffDays < 0) {
          var daysOverdue = -diffDays;
          reminderType = daysOverdue === 1 ? 'Overdue' : 'Daily Overdue';
          if (daysOverdue >= level3Days) escalationLevel = 3;
          else if (daysOverdue >= level2Days) escalationLevel = 2;
          else escalationLevel = 1;
        }
      }

      if (reminderType) {
        var key = record['Request ID'] + '|' + reminderType;
        if (!sentTodayIndex[key]) {
          sendReminderForRecord_(sheet, record, reminderType, escalationLevel, settings);
        }
      }

      var lastUpdate = record['Last Updated Date'] ? new Date(record['Last Updated Date']) : new Date(record['Request Date']);
      if (lastUpdate) {
        var hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 3600000;
        if (hoursSinceUpdate >= staleHours) {
          var staleKey = record['Request ID'] + '|Stale Progress';
          if (!sentTodayIndex[staleKey]) {
            sendReminderForRecord_(sheet, record, 'Stale Progress', 1, settings);
          }
        }
      }
    });

    return { success: true, checked: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function buildTodaysReminderIndex_() {
  var sheet = getSheet_(SHEETS.REMINDERS);
  var rows = readObjects_(sheet);
  var todayStr = Utilities.formatDate(new Date(), 'Asia/Dubai', 'yyyy-MM-dd');
  var index = {};
  rows.forEach(function (r) {
    var ts = r['Timestamp'] ? new Date(r['Timestamp']) : null;
    if (ts && Utilities.formatDate(ts, 'Asia/Dubai', 'yyyy-MM-dd') === todayStr) {
      index[r['Request ID'] + '|' + r['Reminder Type']] = true;
    }
  });
  return index;
}

function resolveRecipients_(record, level) {
  var settings = getSettingsMap();
  var team = getTeamList();
  var manager = team.filter(function (t) { return String(t['Is Social Media Manager']).toLowerCase() === 'yes'; })[0];
  var deptHead = team.filter(function (t) { return String(t['Is Department Head']).toLowerCase() === 'yes'; })[0];
  var managerEmail = manager ? manager['Email'] : settings['Social Media Manager Email'];
  var deptHeadEmail = deptHead ? deptHead['Email'] : settings['Department Head Email'];

  var recipients = [];
  if (record['Assignee Email']) recipients.push(record['Assignee Email']);
  if (level >= 2) {
    if (record['Requester Email']) recipients.push(record['Requester Email']);
    if (managerEmail) recipients.push(managerEmail);
  }
  if (level >= 3) {
    if (deptHeadEmail) recipients.push(deptHeadEmail);
  }
  return recipients.filter(function (e, i, arr) { return e && arr.indexOf(e) === i; });
}

function sendReminderForRecord_(sheet, record, reminderType, level, settings) {
  var recipients = resolveRecipients_(record, level);
  var status = 'Sent';
  var notes = '';

  if (recipients.length === 0) {
    status = 'Failed';
    notes = 'No recipient email addresses resolved.';
  } else {
    try {
      var subject = buildReminderSubject_(record, reminderType, level);
      var htmlBody = buildReminderEmailHtml_(record, reminderType, level, settings);
      MailApp.sendEmail({
        to: recipients.join(','),
        subject: subject,
        htmlBody: htmlBody,
        name: settings['Email From Name'] || 'Content Delivery Tracker'
      });
    } catch (err) {
      status = 'Failed';
      notes = String(err);
    }
  }

  logReminder_(record['Request ID'], reminderType, level, recipients.join(','), status, notes);

  if (status === 'Sent') {
    var col = headerIndexMap_(getSheetHeaders_(sheet));
    sheet.getRange(record.__row, col['Last Reminder Sent']).setValue(new Date());
    var currentCount = Number(record['Reminder Count']) || 0;
    sheet.getRange(record.__row, col['Reminder Count']).setValue(currentCount + 1);
  }
}

function logReminder_(requestId, reminderType, level, recipients, status, notes) {
  var sheet = getSheet_(SHEETS.REMINDERS);
  var logId = 'RM-' + new Date().getTime() + '-' + Math.floor(Math.random() * 1000);
  appendObject_(sheet, REMINDER_HEADERS, {
    'Log ID': logId,
    'Timestamp': new Date(),
    'Request ID': requestId,
    'Reminder Type': reminderType,
    'Escalation Level': level,
    'Recipients': recipients,
    'Status': status,
    'Notes': notes
  });
}

function buildReminderSubject_(record, reminderType, level) {
  var prefix = level >= 3 ? '[ESCALATION - DEPT HEAD] ' : (level >= 2 ? '[ESCALATION - MANAGER] ' : '');
  return prefix + reminderType + ': ' + record['Request ID'] + ' - ' + record['Content Title'];
}

function buildReminderEmailHtml_(record, reminderType, level, settings) {
  var template = HtmlService.createTemplateFromFile('EmailTemplates');
  template.record = record;
  template.reminderType = reminderType;
  template.level = level;
  template.webAppUrl = getWebAppUrl_();
  template.daysOverdue = computeDaysOverdue_(record);
  template.originalDue = formatDate_(toDateOnly_(record['Original Due Date']));
  template.revisedDue = record['Revised Due Date'] ? formatDate_(toDateOnly_(record['Revised Due Date'])) : '';
  template.companyName = settings['Company Name'] || 'Content Delivery Tracker';
  return template.evaluate().getContent();
}

function notifyAssignee_(record, subject, message) {
  if (!record['Assignee Email']) return;
  try {
    MailApp.sendEmail({
      to: record['Assignee Email'],
      subject: subject,
      htmlBody: '<p>' + sanitize_(message) + '</p><p><a href="' + getWebAppUrl_() + '">Open in Content Delivery Tracker</a></p>'
    });
  } catch (err) {
    // Non-fatal: notification failures should not block the workflow action.
  }
}

/* ---------------------------------------------------------------------
 * MANUAL TEST HOOK
 * ------------------------------------------------------------------- */
function testReminderRun() {
  return checkAndSendReminders();
}
