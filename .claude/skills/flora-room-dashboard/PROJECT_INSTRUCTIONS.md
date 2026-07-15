# PROJECT_INSTRUCTIONS.md  
## Flora Room Type, Arrival & Departure Intelligence Dashboard

## 1. Purpose

This file defines how Claude should work on the project.

Use it as the implementation and maintenance guide whenever the dashboard is created, enhanced, debugged, or transferred to a new thread.

The dashboard must remain a fully operational HTML analytics application. It must not become a static mock-up.

---

## 2. Working Method

Before making any change:

1. Read `PROJECT_CONTEXT.md`.
2. Review the existing project files.
3. Identify the current architecture.
4. Confirm the active calculation logic.
5. Identify which files will be modified.
6. Preserve all working functionality unless a newer approved instruction replaces it.

Do not rebuild the whole project unless it is technically necessary.

---

## 3. Non-Negotiable Business Rules

1. Arrival analysis must use `SUM(Arrival Rooms)`.
2. Departure analysis must use `SUM(Departure Rooms)`.
3. Room-night analysis must use `SUM(Room Nights)`.
4. Room Type Occupancy must use Room Nights Sold divided by valid physical inventory.
5. Never calculate occupancy from arrivals.
6. Never use reservation row count as a substitute for arrivals or departures.
7. Never average occupancy percentages across properties.
8. Current-month occupancy must stop at the latest loaded Business Date.
9. Future dates must not be included in occupancy denominators.
10. Last-year comparisons must use the exact corresponding date period shifted back one calendar year.
11. Unmapped values must appear in Data Quality.
12. Unmapped values must remain excluded from production visuals unless the user enables them.
13. All filters must apply consistently to cards, charts, tables, tooltips, drill-downs, and exports.
14. Re-uploading the same file must not duplicate data.
15. Daily uploads must preserve historical records.
16. Matching records must be updated using the latest uploaded version.
17. The latest upload must be reversible.
18. Zero is a valid numeric value and must not be treated as missing.
19. Blank values must not be silently converted to zero or one.
20. Invalid Property–Room Type combinations must not be included in occupancy calculations.

---

## 4. Required Project Files

Maintain at least the following files:

```text
/
├── index.html
├── styles.css
├── app.js
├── README.md
├── PROJECT_INSTRUCTIONS.md
├── PROJECT_CONTEXT.md
└── CHAT_UPDATE_PROMPT.md
```

A modular structure is preferred:

```text
/js
├── constants.js
├── database.js
├── import.js
├── normalization.js
├── mapping.js
├── calculations.js
├── comparisons.js
├── filters.js
├── charts.js
├── tables.js
├── validation.js
├── exports.js
├── state.js
└── ui.js
```

---

## 5. Technical Expectations

Preferred technology:

- HTML5
- CSS3
- JavaScript
- SheetJS for Excel
- Papa Parse for CSV
- Apache ECharts
- IndexedDB

Use `localStorage` only for lightweight UI preferences.

Use IndexedDB for:

- Normalized records
- Upload batches
- Upload history
- Rollback metadata
- Application schema version
- Optional cached aggregates

Keep the data-access layer separate from calculations and UI.

---

## 6. Change-Control Rules

For every major change:

- State the affected files.
- State the business rule being implemented.
- Centralize formulas.
- Reuse normalization and mapping functions.
- Avoid duplicating logic across charts.
- Update tests.
- Verify TY and LY results.
- Verify multi-property occupancy.
- Verify filters.
- Verify exports.
- Update `README.md` when the workflow changes.
- Update `PROJECT_CONTEXT.md` when approved business logic changes.

Do not silently change formulas, mappings, inventory, or field definitions.

---

## 7. Upload and Data-Persistence Requirements

The dashboard must support:

- Excel and CSV upload
- Worksheet selection
- Field mapping
- Import preview
- New-record detection
- Matching-record updates
- Duplicate prevention
- Invalid-record detection
- Unmapped-value detection
- Upload confirmation
- IndexedDB persistence
- Upload history
- Rollback of latest batch
- Full database export
- JSON backup and restore
- Reset database with strong confirmation

The dashboard header must show:

- Latest Business Date
- Data coverage period
- Total stored rows
- Last upload timestamp
- Current selected property

---

## 8. Calculation Standards

All calculation functions must be centralized.

Recommended calculation functions include:

```text
calculateArrivalRooms()
calculateDepartureRooms()
calculateRoomNightsSold()
calculateArrivalShare()
calculateDepartureShare()
calculateRoomNightShare()
calculateAvailableRoomNights()
calculateRoomTypeOccupancy()
calculateWeightedArrivalTime()
calculateWeightedDepartureTime()
calculatePeakArrivalGroup()
calculatePeakDepartureGroup()
calculateOccupancyCombination()
calculateLastYearPeriod()
calculateVariance()
calculatePercentagePointVariance()
```

Every calculation must:

- Use the correct date basis.
- Respect active filters.
- Exclude invalid records.
- Handle missing values.
- Handle zero denominators.
- Return `N/A` rather than Infinity or NaN.

---

## 9. Filter Standards

Primary filters:

- Property
- Room Type Group
- SEGGRP Group
- Month

Advanced filters:

- Market Code
- Account Manager Group
- Reservation Status
- Nationality
- Occupancy Combination
- Week
- Date range

Required behaviour:

- Multi-select
- Search
- Select All
- Clear
- Reset Filters
- Active-filter chips
- Persistent filter state
- Property-aware Room Type options
- Latest month default
- Single-property default
- Include Unmapped switch

---

## 10. Visual Standards

Use Flora branding:

- Royal Purple: `#523956`
- Ivory: `#F9F5F2`
- Pearl: `#F2E9E0`
- Violet: `#AB96BA`
- White: `#FFFFFF`
- Dark charcoal text

Typography:

```css
font-family: "Flora", "Roboto", "Arial", sans-serif;
```

Visual rules:

- Professional hospitality analytics style
- Clear hierarchy
- Balanced spacing
- Minimal unnecessary white space
- Accessible contrast
- Consistent card dimensions
- No 3D charts
- Avoid excessive gradients
- Prefer sorted horizontal bars
- Prevent label overlap
- Use tooltips when labels cannot fit
- Use whole numbers for counts
- Use one decimal place for percentages
- Use `pp` for percentage-point variance
- Show `No Data` when applicable

---

## 11. Dashboard Tabs

The project must contain:

1. Executive Overview
2. Room Type Statistics
3. Guest Occupancy Combinations
4. Arrival Patterns
5. Departure Patterns
6. Room Number Statistics
7. Data Quality and Upload History

Do not remove a tab without explicit approval.

---

## 12. Testing Requirements

Run the acceptance tests defined in `PROJECT_CONTEXT.md`.

At minimum verify:

- Duplicate prevention
- Daily append
- Matching-record update
- Rollback
- Arrival Rooms logic
- Departure Rooms logic
- Daily occupancy
- Multi-day occupancy
- Multi-property occupancy
- Dynamic adult-child combinations
- Last-year date shift
- Unmapped-value handling
- Current-month denominator
- Filter consistency
- Blank versus zero
- Invalid time handling

Document results in `README.md`.

---

## 13. Completion Rules

Do not call the project complete when it contains:

- Placeholder data
- Static KPI values
- Non-working buttons
- Incomplete upload logic
- Missing LY comparisons
- Broken exports
- Broken drill-downs
- Inconsistent filters
- Incorrect occupancy denominators
- Overlapping labels
- Unhandled unmapped values
- Unverified rollback

The final dashboard must be operational, maintainable, and ready for ongoing daily use.
