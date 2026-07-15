---
name: flora-room-dashboard
description: Build, audit, enhance, and validate the Flora Room Type, Arrival & Departure Intelligence HTML dashboard. Use for daily Excel or CSV upload workflows, IndexedDB persistence, deduplication, hotel room-type occupancy, arrival and departure analysis, adult-child occupancy combinations, last-year comparisons, data-quality validation, Flora styling, dashboard debugging, and project handover.
---

# Flora Room Type Dashboard Skill

Use this skill when creating, reviewing, enhancing, debugging, or handing over the **Flora Room Type, Arrival & Departure Intelligence** dashboard.

## Required references

Read these supporting files before making material changes:

- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — authoritative business logic, formulas, mappings, inventory, dashboard requirements, and acceptance tests.
- [PROJECT_INSTRUCTIONS.md](PROJECT_INSTRUCTIONS.md) — implementation method, change-control rules, technical expectations, and completion standards.
- [CHAT_UPDATE_PROMPT.md](CHAT_UPDATE_PROMPT.md) — reusable prompt template for continuing the project in a new chat.

Treat `PROJECT_CONTEXT.md` as the source of truth for calculations. Treat `PROJECT_INSTRUCTIONS.md` as the source of truth for implementation and testing.

## Work sequence

1. Audit the attached project before coding.
2. Identify its architecture, upload workflow, data storage, calculations, filters, charts, exports, and known gaps.
3. State the files that will change.
4. Preserve working functionality unless a newer approved requirement replaces it.
5. Centralize normalization, mappings, inventory, calculations, comparisons, validation, and exports.
6. Implement the requested change.
7. Run the applicable acceptance tests from `PROJECT_CONTEXT.md`.
8. Update `README.md` when the workflow or implementation changes.
9. Update project reference files only when approved business logic changes.

## Non-negotiable calculation rules

- Arrivals = `SUM(Arrival Rooms)`.
- Departures = `SUM(Departure Rooms)`.
- Room Nights Sold = `SUM(Room Nights)`.
- Room Type Occupancy = Room Nights Sold divided by valid available room-nights.
- Never calculate occupancy from arrivals.
- Never substitute reservation row count for Arrival Rooms, Departure Rooms, or Room Nights.
- Never average property occupancy percentages.
- For multiple properties, sum sold room nights and available room-nights first, then calculate occupancy.
- Current-month occupancy ends at the latest loaded Business Date.
- Exclude future dates from occupancy denominators.
- Use a complete calendar date spine, including dates with zero records.
- Last-year comparisons use the exact corresponding date period shifted back one calendar year.
- Missing values and numeric zero are different.
- Return `N/A` for invalid or zero denominators; never show Infinity or NaN.
- Do not cap occupancy above 100%; show it and flag it for validation.

## Daily upload requirements

The dashboard must support Excel and CSV uploads that:

- Preview field mappings and import statistics.
- Normalize source fields.
- Append new records.
- Update matching records.
- Prevent exact duplicates.
- Preserve historical records.
- Persist data in IndexedDB.
- Record upload history.
- Support rollback of the latest import.
- Support full-database export, JSON backup, and JSON restore.

Use the normalized record-key and fallback-key rules in `PROJECT_CONTEXT.md`.

## Standardized calculated fields

Apply these fields consistently to filters, charts, cards, tables, labels, tooltips, drill-downs, comparisons, and exports:

- `Room Type Group`
- `SEGGRP Group`
- `Account Manager Group`
- `Arrival Time Group`
- `Departure Time Group`
- `Occupancy Combination`

Use the exact mappings in `PROJECT_CONTEXT.md`.

Unknown mapping values must be classified as `UNMAPPED`, shown in Data Quality, and excluded from production visuals by default.

## Physical inventory

Match inventory by both:

```text
Property + Room Type Group
```

Do not use inventory from one property for another property. Invalid combinations must be excluded from occupancy calculations and shown in Data Quality.

## Date basis

- Room-night and occupancy sections use `Business Date`.
- Arrival sections use `Arrival Date`.
- Departure sections use `Departure Date`.
- Use Dubai local time without UTC shifts that change operational times.

## Required filters

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

All filters must affect KPIs, charts, tables, tooltips, drill-downs, and exports consistently.

## Required dashboard sections

Preserve and implement:

1. Executive Overview
2. Room Type Statistics
3. Guest Occupancy Combinations
4. Arrival Patterns
5. Departure Patterns
6. Room Number Statistics
7. Data Quality and Upload History

## Flora design rules

Use:

- Royal Purple `#523956`
- Ivory `#F9F5F2`
- Pearl `#F2E9E0`
- Violet `#AB96BA`
- White `#FFFFFF`
- Dark charcoal text
- Font stack: `"Flora", "Roboto", "Arial", sans-serif`

Maintain a professional hospitality analytics style with accessible contrast, balanced spacing, consistent cards, responsive layouts, non-overlapping labels, clear tooltips, and useful no-data states.

Avoid 3D charts, decorative clutter, unnecessary gradients, and hard-coded values.

## Delivery standard

Do not claim completion when the project contains placeholder charts, static KPIs, inactive controls, incorrect formulas, missing last-year logic, broken filters, incomplete exports, missing validation, or untested upload behaviour.

At delivery, report:

1. Files changed.
2. Business logic applied.
3. Existing functionality preserved.
4. Tests completed and results.
5. Remaining limitations or unresolved issues.
