/* =========================================================================
 * Flora Room Type, Arrival & Departure Intelligence
 * constants.js — mappings, inventory, field aliases, time groups
 * Source of truth: .claude/skills/flora-room-dashboard/PROJECT_CONTEXT.md
 * ========================================================================= */
'use strict';

var FLORA = {
  colors: {
    royalPurple: '#523956',
    ivory: '#F9F5F2',
    pearl: '#F2E9E0',
    violet: '#AB96BA',
    white: '#FFFFFF',
    charcoal: '#2B2B2B',
    green: '#2E7D52',
    red: '#B3413D',
    amber: '#B07C3A'
  },
  chartPalette: ['#523956', '#AB96BA', '#7E6489', '#C9B8D4', '#8A7090', '#63495F', '#BFA8CB', '#3E2B41'],
  lyColor: '#C9B8D4',
  tyColor: '#523956',
  font: '"Flora","Roboto","Arial",sans-serif'
};

/* Standard field names used internally everywhere. */
var FIELDS = [
  'Property', 'Business Date', 'Room Nights', 'Reservation Status', 'Room Number',
  'E-mail', 'Phone Number', 'Booked Room Type', 'Arrival Date', 'Arrival Rooms',
  'Arrival Time', 'Departure Date', 'Departure Rooms', 'Departure Time', 'Guest Name',
  'Revenue', 'Adults', 'Children', 'VIP Status', 'Market Code', 'Market Group',
  'Period', 'COMP/TVL', 'Source', 'Default Key', 'Account Manager', 'Rate Code',
  'Confirmation Number', 'Nationality'
];

/* Fields that must remain text (never coerced to numbers). */
var TEXT_FIELDS = ['Property', 'Room Number', 'Confirmation Number', 'Phone Number',
  'Rate Code', 'Booked Room Type', 'Market Code'];

/* Source-header aliases → standard field. Matching is case-insensitive,
 * with spaces/punctuation collapsed (see normalizeHeader in normalization.js). */
var FIELD_ALIASES = {
  'property': 'Property', 'resort': 'Property',
  'business date': 'Business Date',
  'room nights': 'Room Nights', 'room ngt': 'Room Nights',
  'reservation status': 'Reservation Status',
  'room number': 'Room Number', 'room no': 'Room Number',
  'e-mail': 'E-mail', 'email': 'E-mail',
  'phone number': 'Phone Number', 'phone no': 'Phone Number',
  'booked room type': 'Booked Room Type', 'room type': 'Booked Room Type',
  'booked room category label': 'Booked Room Type',
  'arrival date': 'Arrival Date', 'arr date': 'Arrival Date',
  'arrival rooms': 'Arrival Rooms', 'arr rooms': 'Arrival Rooms',
  'arrival time': 'Arrival Time', 'arr time': 'Arrival Time',
  'departure date': 'Departure Date', 'dep date': 'Departure Date',
  'departure rooms': 'Departure Rooms', 'dep rooms': 'Departure Rooms',
  'departure time': 'Departure Time', 'dep time': 'Departure Time',
  'guest name': 'Guest Name',
  'revenue': 'Revenue',
  'adults': 'Adults',
  'children': 'Children',
  'vip status': 'VIP Status',
  'market code': 'Market Code', 'market c': 'Market Code', 'mkt code': 'Market Code',
  'market (code)': 'Market Code',
  'market group': 'Market Group', 'market g': 'Market Group', 'mkt group': 'Market Group',
  'market group (code)': 'Market Group',
  'period': 'Period', 'period (description)': 'Period',
  'comp/tvl': 'COMP/TVL', 'comp tvl': 'COMP/TVL',
  'source': 'Source',
  'default key': 'Default Key', 'default keyword': 'Default Key',
  'account manager': 'Account Manager', 'acct manager': 'Account Manager',
  'rate code': 'Rate Code',
  'confirmation number': 'Confirmation Number', 'confirmation': 'Confirmation Number',
  'confirmation no': 'Confirmation Number',
  'nationality': 'Nationality', 'nationality description': 'Nationality',
  'nationality (description)': 'Nationality'
};

/* SEGGRP grouping — PROJECT_CONTEXT.md §6 */
var SEGGRP_MAP = {
  'AIR': 'AIR',
  'CGRP': 'CORP',
  'COR': 'CORP',
  'CORPL': 'LSY',
  'DIR': 'DRT',
  'LEGRP': 'TRVL',
  'LEI': 'TRVL',
  'MGT': 'MGT',
  'HOU': 'MGT',
  'COMP': 'MGT',
  'FLRW': 'WEB',
  'OTA': 'OTA'
};

/* Room Type grouping — PROJECT_CONTEXT.md §8 */
var ROOM_TYPE_GROUP_MAP = (function () {
  var groups = {
    'BASE': ['STCR', 'STPC', 'OBCR', 'OBPV', 'OBPC', 'OBPP',
      'SUPK', 'SUPT', 'PRMK', 'PRMT', 'CLAK', 'CLAT',
      'DLXK', 'DLXT', 'OBR', 'PRM', 'STR', 'SUP', 'CLA', 'DLX'],
    'SUI': ['EXSUK', 'EXSUT', 'SUI'],
    'CON': ['CONCK', 'CONPT', 'CON', 'CONK', 'CONT'],
    '2BHK CREEK': ['TBCR', 'CPCV'],
    '2BHK CHILD': ['TBCB', 'TBPCB', 'TBR'],
    '2BHK MAID': ['TBPV', 'TBPP']
  };
  var map = {};
  Object.keys(groups).forEach(function (g) {
    groups[g].forEach(function (code) { map[code] = g; });
  });
  return map;
})();

var ROOM_TYPE_GROUPS = ['BASE', 'SUI', 'CON', '2BHK CREEK', '2BHK CHILD', '2BHK MAID'];

/* Account Manager grouping — PROJECT_CONTEXT.md §7.
 * exact: normalized-name → group. prefixes: [normalized prefix, group]. */
var ACCOUNT_MANAGER_MAP = {
  exact: {
    'ARUN ANAND RAJA': 'ARUN', 'ARUN RAJA': 'ARUN',
    'ASHIF SALEEM': 'ASHIF',
    'MUHAMMAD AWAIS ARSHAD': 'AWAIS',
    'CHRISTZELLE MIRASOL': 'CHRISTZELLE',
    'IRISH MALAYA': 'IRISH',
    'CONFIG CONFIG': 'MGT',
    'NADIA WAQAS': 'NADIA',
    'SADIK P C': 'SADIK', 'SADIK P. C.': 'SADIK',
    'JENNIFER ATIENZA': 'UNASSIGNED', 'MANDEEP SINGH': 'UNASSIGNED',
    'MOUSTAFA SAFWAT': 'UNASSIGNED', 'NOUSHAD ABDUL RAHIM': 'UNASSIGNED',
    'OPERA SUPERVISOR': 'UNASSIGNED', 'REMON YAMANI': 'UNASSIGNED',
    'SALWA ZEDAN': 'UNASSIGNED', 'SINOJ BASKARAN': 'UNASSIGNED',
    'BELRAJ A. GOPI': 'UNASSIGNED', 'KAVITHA RANIDAS': 'UNASSIGNED',
    'MANOJ CHANDRAN': 'UNASSIGNED', 'NA': 'UNASSIGNED',
    'SREEJITH NAIR': 'UNASSIGNED', 'VIMAL K. BALACHANDRAN': 'UNASSIGNED',
    'WAJIRA PRADEEP': 'UNASSIGNED'
  },
  prefixes: [
    ['GROUP COMPANIES GROUP CO', 'MGT'],
    ['SALWA ZEDAN ALY PROD. - STA', 'UNASSIGNED']
  ],
  /* Documented decision: blank Account Manager is treated as UNASSIGNED
   * (consistent with the explicit NA → UNASSIGNED rule). */
  blankGroup: 'UNASSIGNED'
};

/* Physical inventory — PROJECT_CONTEXT.md §9. Match by Property + Room Type Group only. */
var PHYSICAL_INVENTORY = {
  'FCHDXB': { 'BASE': 144, '2BHK CREEK': 12, '2BHK CHILD': 12, '2BHK MAID': 12 },
  'FAHDXB': { 'BASE': 149, 'SUI': 12, 'CON': 24 },
  'FIHDXB': { 'BASE': 155, 'SUI': 12, 'CON': 60 }
};

/* Hourly operational time groups (approved change 2026-07: replaces the
 * original 7-band grouping). 24 one-hour intervals, 00:00–00:59 … 23:00–23:59,
 * used identically for arrivals and departures. Minutes are inclusive bounds. */
var TIME_GROUPS = (function () {
  var out = [];
  for (var h = 0; h < 24; h++) {
    var hh = (h < 10 ? '0' : '') + h;
    out.push({ label: hh + ':00–' + hh + ':59', short: hh + ':00', hour: h, from: h * 60, to: h * 60 + 59 });
  }
  return out;
})();
var TIME_GROUP_UNKNOWN = 'Unknown / Invalid Time';
var TIME_GROUP_LABELS = TIME_GROUPS.map(function (g) { return g.label; }).concat([TIME_GROUP_UNKNOWN]);

var UNMAPPED = 'UNMAPPED';

/* IndexedDB schema */
var DB_NAME = 'flora_room_type_db';
var DB_VERSION = 1;
var STORE_RECORDS = 'records';
var STORE_BATCHES = 'batches';
var STORE_META = 'meta';

/* Export field order for detail CSV exports (standard fields + derived). */
var EXPORT_DERIVED = ['Room Type Group', 'SEGGRP Group', 'Account Manager Group',
  'Arrival Time Group', 'Departure Time Group', 'Occupancy Combination'];
