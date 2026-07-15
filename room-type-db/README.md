# Flora Room Type, Arrival & Departure Intelligence

A complete, self-contained HTML analytics dashboard for hotel room-type performance,
arrival/departure patterns, guest occupancy combinations, room-number statistics,
physical occupancy, and year-on-year comparison — with a daily Excel/CSV upload
workflow, IndexedDB persistence, duplicate prevention, upload history, and rollback.

Business rules, mappings, inventory, and acceptance tests come from the
`flora-room-dashboard` skill (`.claude/skills/flora-room-dashboard/PROJECT_CONTEXT.md`).

## Project files

```text
room-type-db/
├── index.html          Application shell (7 tabs, filter bar, modals)
├── styles.css          Flora-branded responsive styling
├── app.js              Orchestration + tab renderers
├── js/
│   ├── constants.js    Mappings (Room Type / SEGGRP / Account Manager), inventory, time groups, field aliases
│   ├── normalization.js Field/value normalization, record keys, derived groups, ISO weeks
│   ├── database.js     IndexedDB layer (records, batches, meta) with atomic commit/rollback
│   ├── import.js       Excel/CSV parsing, header mapping, classification, commit
│   ├── calculations.js Date spine, metrics, occupancy, shares, weighted times, peaks, TY/LY engine
│   ├── filters.js      Global filter state + record filtering (per-section date basis)
│   ├── validation.js   Data Quality engine (18 categories)
│   ├── exports.js      CSV exports, JSON backup/restore
│   ├── charts.js       Apache ECharts wrappers with the Flora theme
│   └── ui.js           Multi-select dropdowns, tables, modals, toasts, KPI cards
└── vendor/             SheetJS, Papa Parse, Apache ECharts (bundled — works fully offline)
```

## How to run

The dashboard is a static site — no build step, no server-side code.

- **Easiest (recommended for daily users):** download the single file
  **`Flora_Room_Dashboard.html`** and double-click it. Everything (styles, code,
  libraries) is bundled inside — no other files needed. Do **not** confuse it with
  the older `Flora_Hotels_Dashboard.html` in the repository root, which is a
  different dashboard for month statistics and will report "No data found." if you
  feed it the Room Type export.
- **Developer layout:** open `index.html` (requires the full `room-type-db/`
  folder: `js/`, `vendor/`, `styles.css`).
- **Recommended:** serve the folder so IndexedDB storage is scoped to a stable origin:
  `python3 -m http.server 8000` inside `room-type-db/`, then open
  `http://localhost:8000`. (With `file://`, some browsers isolate or evict storage
  more aggressively.)

All three libraries are bundled in `vendor/` — no internet connection is needed.

## Uploading the initial Excel file

1. Open the dashboard. With an empty database you'll see the welcome dialog.
2. Click **Upload First File** (or **⬆ Upload / Update Data** in the header) and pick
   the PMS export (e.g. `Room_Type_Stat__New.xlsx`).
3. **Step 1 — Worksheet:** the wizard scores every sheet by how many recognizable
   headers it contains and pre-selects the data sheet (`Room Type`). Staging/config
   sheets score near zero.
4. **Step 2 — Field Mapping:** every source column is auto-mapped through the alias
   table (e.g. `Resort`→Property, `Booked Room Category Label`→Booked Room Type,
   `Phone No`→Phone Number). Adjust or set columns to *(ignore)* if needed.
   Business Date and Property are mandatory.
5. **Step 3 — Preview:** shows total rows, new records, updates, exact duplicates,
   invalid rows, unmapped values, and date/property coverage — nothing is written
   until you click **Confirm Import**.

## Daily updates

Upload each new daily export the same way. The import engine classifies every row:

- **New record** (key not seen before) → appended.
- **Matching record with changed values** → updated to the latest version; the
  previous version is retained in the batch for rollback.
- **Exact duplicate** (same key, identical content) → skipped, counted in the preview.
- **Invalid row** (missing Business Date or Property) → rejected and listed.

Historical records are never removed by an upload.

### How duplicate prevention works

Each record gets a normalized key:

```text
Property + Business Date + Confirmation Number + Room Number
+ Booked Room Type + Arrival Date + Departure Date
```

When Confirmation Number is blank, a fallback key uses Guest Name + normalized
Phone Number + Room Number + dates instead. Values are trimmed, dates normalized to
`YYYY-MM-DD`, codes uppercased, and Room Number kept as text (leading zeros preserved).
Re-uploading the same file therefore changes nothing — verified with the real
42,702-row export (second upload: 0 new, 0 updated, 42,702 duplicates).

## Browser persistence

- All records, upload batches, and history live in **IndexedDB** — they survive
  refreshes, browser restarts, and machine reboots.
- `localStorage` holds only lightweight UI preferences (active filters).
- Data is per-browser, per-origin, per-machine. It is **not** synced anywhere.

### Storage limitations to know about

- Chrome/Edge allow large IndexedDB quotas (typically several GB); 42k records ≈ 40 MB.
- Browsers can evict site data under disk pressure or when the user clears
  browsing data — **take regular JSON backups** (below).
- Private/incognito windows discard IndexedDB when closed.
- Opening the dashboard from a different origin (e.g. `file://` vs `localhost`)
  gives a different, empty database.

## Backup, restore, rollback, reset

All under **Export ▾** in the header (rollback lives in the Data Quality tab):

- **JSON Backup** — full dump of records + upload history. Take one after every
  significant upload and store it outside the browser.
- **Restore JSON Backup…** — replaces the current database with a backup
  (confirmation required; the restore is atomic).
- **Roll Back Latest Upload** (Data Quality & Upload History tab) — deletes the
  records appended by the most recent active batch and restores the previous
  version of every record it updated, in one transaction. The batch stays in
  history marked *Rolled back*.
- **Reset Database…** — deletes everything. Requires typing `RESET` to confirm.
  No permanent deletion happens anywhere else in the UI.

## Calculations (source of truth: PROJECT_CONTEXT.md)

- Arrivals = `SUM(Arrival Rooms)` on Arrival Date basis; Departures =
  `SUM(Departure Rooms)` on Departure Date basis; Room Nights Sold =
  `SUM(Room Nights)` on Business Date basis. Never row counts.
- Occupancy = Room Nights Sold ÷ (Physical Rooms × included calendar dates),
  matched strictly by **Property + Room Type Group**. Invalid combinations show
  N/A and appear in Data Quality. Multi-property occupancy sums sold and available
  room-nights first — percentages are never averaged.
- The occupancy date spine includes zero-activity dates, stops at the latest
  loaded Business Date, and never includes future dates.
- Last-year comparison shifts the exact included period back one calendar year
  (1–15 July 2026 ↔ 1–15 July 2025) with the same filters; LY = 0 → variance N/A.
- Blank ≠ zero everywhere. Unknown/invalid times group as `Unknown / Invalid Time`
  and can never become a peak group. Occupancy above 100% is shown and flagged,
  never capped.
- `UNMAPPED` room types / market groups / account managers are excluded from
  production visuals unless **Include Unmapped** is switched on, and always appear
  in Data Quality.

### Documented mapping decisions

- Blank **Account Manager** (76% of rows in the source export) is grouped as
  `UNASSIGNED`, consistent with the approved `NA → UNASSIGNED` rule.
- Room type code `PM` (posting master) has no approved mapping → `UNMAPPED`.

## Acceptance-test results

Test run 2026-07-15 (Node harness executing the production modules + Playwright
Chromium driving the real UI; source: real 42,702-row `Room_Type_Stat__New.xlsx`).

| # | Test (PROJECT_CONTEXT.md §20) | Result |
|---|---|---|
| 1 | Same file uploaded twice does not double the database (verified at 42,702-row scale) | ✔ |
| 2 | New Business Date appends | ✔ |
| 3 | Matching records update; previous version retained | ✔ |
| 4 | Latest import rolls back (append removed, update restored) — verified in browser | ✔ |
| 5 | Arrival values 1, 2, 3 → total 6 | ✔ |
| 6 | Departure values 1, 1, 2 → total 4 | ✔ |
| 7 | FCHDXB 2BHK CREEK, 10 room nights, one date → 83.33% | ✔ |
| 8 | 100 room nights / 10 dates / 12 rooms → 83.33% | ✔ |
| 9 | Multi-property occupancy = combined sold ÷ combined available (never averaged) | ✔ |
| 10 | Dynamic Adults+Children combinations use SUM(Arrival Rooms) | ✔ |
| 11 | 1–15 July 2026 compares with 1–15 July 2025 (leap-day safe) | ✔ |
| 12 | UNMAPPED in Data Quality, excluded by default, included via switch | ✔ |
| 13 | Latest Business Date 15 July → denominator uses 1–15 July | ✔ |
| 14 | Filters update KPIs/charts/tables/drill-downs/exports (all consume Filters.apply) | ✔ |
| 15 | Blank and zero remain different | ✔ |
| 16 | Invalid time can never become a peak group | ✔ |
| 17 | Invalid Property–Room Type combinations excluded, shown as N/A | ✔ |
| 18 | Occupancy above 100% shown and flagged, not capped | ✔ |

Additional verified behaviour: wizard auto-selects the `Room Type` sheet and
auto-maps all 29 columns of the real export; 596 exact PMS duplicates absorbed on
first import (42,106 stored); IndexedDB persists across reload; the Confirm button
disables when a re-upload contains nothing new; all 7 tabs render with real data
and zero console errors; all 18 Data Quality categories present.

## Timezone-safe date parsing

Excel date cells are read as raw serial numbers and converted with pure UTC
arithmetic, so the calendar date is identical regardless of the computer's
timezone (verified under Asia/Dubai, UTC, America/New_York, Pacific/Kiritimati
UTC+14, and Pacific/Midway UTC−11). Databases imported with a pre-fix build in
an affected timezone (dates one day early, e.g. coverage starting 2025-05-31
instead of 2025-06-01) should be **Reset** and re-imported once with the fixed
build.

## Known limitations

- Data lives only in the browser that uploaded it — use JSON backups to move
  between machines or share.
- The Data Quality "Duplicate records" category refers to stored records sharing a
  key (should be zero in normal operation); intra-file duplicates are absorbed at
  import and reported in upload history instead.
- Monthly-trend visuals ("by month" charts/tables) intentionally ignore the
  month/week/date-range filters so a trend is visible; all other filters apply.
- Physical inventory is fixed in `js/constants.js` per the approved configuration
  (FCHDXB 180 · FAHDXB 185 · FIHDXB 227). Inventory changes require editing that
  file — by design, to keep occupancy denominators under change control.
