# CHAT_UPDATE_PROMPT.md  
## Prompt to Paste into Claude Chat

```text
You are continuing the “Flora Room Type, Arrival & Departure Intelligence” HTML dashboard project.

Read the attached files completely before making changes:

1. PROJECT_INSTRUCTIONS.md
2. PROJECT_CONTEXT.md
3. The existing HTML dashboard or project folder
4. Any newly attached Excel, CSV, screenshot, or reference file

Treat PROJECT_CONTEXT.md as the source of truth for business logic, formulas, mappings, inventory, metrics, upload behaviour, dashboard sections, and acceptance tests.

Treat PROJECT_INSTRUCTIONS.md as the source of truth for how the project must be implemented, maintained, tested, and documented.

Your task is to update the existing dashboard without losing any working functionality.

Mandatory rules:

- Audit the existing project before coding.
- Preserve working calculations, filters, uploads, exports, drill-downs, and styling unless a newer approved instruction replaces them.
- Do not hard-code KPI values or chart results.
- Arrival analysis must use SUM(Arrival Rooms).
- Departure analysis must use SUM(Departure Rooms).
- Room Type Occupancy must use SUM(Room Nights) divided by valid Property + Room Type physical inventory across the complete included date spine.
- Never calculate occupancy from arrivals.
- Never use row count as a substitute for Arrival Rooms, Departure Rooms, or Room Nights.
- Never average occupancy percentages across properties.
- Current-month occupancy must stop at the latest loaded Business Date.
- Last-year comparisons must use the exact corresponding date period shifted back one year.
- Daily uploads must append new records, update matching records, prevent duplicates, preserve historical data, persist in IndexedDB, maintain upload history, and support rollback.
- Use the standardized Room Type Group, SEGGRP Group, and Account Manager Group mappings from PROJECT_CONTEXT.md everywhere.
- Keep UNMAPPED values in Data Quality and exclude them from production visuals by default.
- Apply active filters consistently to KPIs, charts, tables, tooltips, drill-downs, and exports.
- Maintain the Flora colour palette, typography, spacing, accessibility, and professional hospitality dashboard style.
- Prevent chart values and labels from overlapping.
- Do not leave placeholder charts, inactive controls, incomplete exports, or static sample results.
- Update README.md whenever the workflow or implementation changes.
- Update PROJECT_CONTEXT.md only when a newer approved business instruction changes the source-of-truth logic.

Start by providing:

A. A concise audit of the existing project.
B. A gap list against PROJECT_CONTEXT.md.
C. The files that will be modified.
D. The implementation sequence.
E. Any blocking ambiguity that would materially affect calculation accuracy.

Then proceed with the implementation without repeatedly asking for confirmation on routine technical decisions.

For the current update, apply the following new requirement:

[PASTE THE NEW CHANGE REQUEST HERE]

After implementation:

1. Summarize the files changed.
2. Explain the business logic applied.
3. Confirm what was preserved.
4. List the tests performed.
5. State any limitation or unresolved issue honestly.
6. Provide the updated project files.
```

---

## Compact Version

```text
Read PROJECT_INSTRUCTIONS.md and PROJECT_CONTEXT.md completely.

Audit the attached Flora Room Type, Arrival & Departure Intelligence dashboard and implement the new request below while preserving all working functionality.

Non-negotiable logic:

- Arrivals = SUM(Arrival Rooms)
- Departures = SUM(Departure Rooms)
- Room Nights Sold = SUM(Room Nights)
- Occupancy = Room Nights Sold ÷ valid available room-nights
- Do not calculate occupancy from arrivals
- Do not average property occupancy percentages
- Current month ends at the latest loaded Business Date
- LY uses the exact corresponding dates shifted back one year
- Daily uploads must append, update, deduplicate, persist, log, and support rollback
- Apply standardized Room Type, SEGGRP, and Account Manager mappings everywhere
- Keep UNMAPPED in Data Quality and exclude it by default
- Apply filters to all visuals, tables, drill-downs, and exports
- Maintain Flora branding
- Do not leave placeholders or non-functional controls

New request:

[PASTE THE NEW CHANGE REQUEST HERE]

First provide a short audit and file-change plan, then implement, test, and return the updated files.
```
