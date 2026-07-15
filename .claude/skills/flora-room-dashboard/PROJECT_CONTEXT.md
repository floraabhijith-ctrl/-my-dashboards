# PROJECT_CONTEXT.md  
## Flora Room Type, Arrival & Departure Intelligence Dashboard

## 1. Project Overview

**Project name:** Flora Room Type, Arrival & Departure Intelligence  
**Project type:** Responsive interactive HTML analytics dashboard  
**Primary purpose:** Analyse hotel room types, arrival patterns, departure patterns, occupancy combinations, room-number activity, physical occupancy, and year-on-year performance.

The dashboard must work as a continuing operational system rather than a one-time report.

The user must be able to upload new operational data daily. Each new upload must be added to the existing database without deleting history or creating duplicates.

---

## 2. Main Business Questions

The dashboard must answer:

1. What is the performance and share of each Room Type Group?
2. What are the occupancy patterns for each Room Type Group?
3. How many Arrival Rooms occur for every Adults and Children combination?
4. Which room numbers receive the highest number of arrivals?
5. What are the main arrival-time patterns?
6. What are the main departure-time patterns?
7. What is the peak arrival time by month and week?
8. What is the peak departure time by month and week?
9. How does every metric compare with the corresponding period last year?
10. Are there unmapped, invalid, missing, duplicate, or inconsistent records?

---

## 3. Supported Source Fields

The upload process should support:

- Business Date
- Room Nights
- Reservation Status
- Room Number
- E-mail
- Phone Number
- Booked Room Type
- Arrival Date
- Arrival Rooms
- Arrival Time
- Departure Date
- Departure Rooms
- Departure Time
- Guest Name
- Revenue
- Adults
- Children
- VIP Status
- Market Code
- Market Group
- Period
- Resort
- COMP/TVL
- Source
- Default Key
- Account Manager
- Rate Code
- Confirmation Number
- Nationality Description

### Common aliases

| Standard field | Possible source names |
|---|---|
| Property | Resort, RESORT, Property |
| Booked Room Type | Booked Room Type, Room Type |
| Market Group | Market Group, Market G, Mkt Group |
| Market Code | Market Code, Market C, Mkt Code |
| Confirmation Number | Confirmation, Confirmation Number |
| Account Manager | Account Manager, Acct Manager |
| Room Nights | Room Nights, Room Ngt |
| Arrival Rooms | Arrival Rooms, Arr Rooms |
| Departure Rooms | Departure Rooms, Dep Rooms |
| Arrival Date | Arrival Date, Arr Date |
| Departure Date | Departure Date, Dep Date |
| Arrival Time | Arrival Time, Arr Time |
| Departure Time | Departure Time, Dep Time |

Ambiguous fields must be confirmed through a mapping screen.

The following fields must remain text:

- Property
- Room Number
- Confirmation Number
- Phone Number
- Rate Code
- Booked Room Type
- Market Code

---

## 4. Date Basis

Use the correct date field for each section:

| Analysis | Date basis |
|---|---|
| Room Nights and Occupancy | Business Date |
| Arrival analysis | Arrival Date |
| Departure analysis | Departure Date |
| Upload coverage | Business Date |

The global Month filter must apply to the correct field in each section.

Use Dubai local time.

---

## 5. Record-Key and Daily Upload Logic

### Primary normalized key

```text
Property
+ Business Date
+ Confirmation Number
+ Room Number
+ Booked Room Type
+ Arrival Date
+ Departure Date
```

### Fallback key

When Confirmation Number is blank:

```text
Property
+ Business Date
+ Guest Name
+ Phone Number
+ Room Number
+ Arrival Date
+ Departure Date
```

Before key construction:

- Trim spaces.
- Normalize dates to `YYYY-MM-DD`.
- Normalize codes to uppercase.
- Preserve Room Number as text.
- Normalize phone number for matching.
- Convert null-like values to an empty normalized token.

### Import outcome

- New key: append.
- Existing key with changed values: update.
- Existing identical record: duplicate; do not add.
- Same reservation under a different Business Date: keep as a separate record.
- Never remove historical records during a normal upload.

Store:

- Source filename
- Source worksheet
- Source row number
- Batch ID
- Import timestamp
- Update timestamp

### Upload preview

Show:

- File name
- Worksheet
- Total rows
- Valid rows
- Invalid rows
- New records
- Updated records
- Exact duplicates
- Unmapped room types
- Unmapped market groups
- Unmapped account managers
- Invalid Property–Room Type combinations
- Minimum Business Date
- Maximum Business Date
- Properties found

### Required database functions

- Upload Excel
- Upload CSV
- Append new rows
- Update matching rows
- Prevent duplicates
- Persist in IndexedDB
- View upload history
- Roll back latest batch
- Export full database
- Export JSON backup
- Restore JSON backup
- Reset database with confirmation

---

## 6. Standardized SEGGRP Grouping

Create:

```text
SEGGRP Group
```

| Source Market Group | SEGGRP Group |
|---|---|
| AIR | AIR |
| CGRP | CORP |
| COR | CORP |
| CORPL | LSY |
| DIR | DRT |
| LEGRP | TRVL |
| LEI | TRVL |
| MGT | MGT |
| HOU | MGT |
| COMP | MGT |
| FLRW | WEB |
| OTA | OTA |

Rules:

- Trim spaces.
- Collapse repeated spaces.
- Convert to uppercase.
- Match case-insensitively.
- Unknown values become `UNMAPPED`.
- Exclude `UNMAPPED` from production visuals by default.
- Show `UNMAPPED` in Data Quality.
- Apply this grouping to filters, charts, tables, tooltips, drill-downs, comparisons, and exports.

---

## 7. Account Manager Grouping

Create:

```text
Account Manager Group
```

| Group | Source names |
|---|---|
| ARUN | Arun Anand Raja; Arun Raja |
| ASHIF | Ashif Saleem |
| AWAIS | Muhammad Awais Arshad |
| CHRISTZELLE | Christzelle Mirasol |
| IRISH | Irish Malaya |
| MGT | CONFIG CONFIG; names beginning with `Group Companies Group Co` |
| NADIA | Nadia Waqas |
| SADIK | Sadik P C; Sadik P. C. |
| UNASSIGNED | Jennifer Atienza; Mandeep Singh; Moustafa Safwat; Noushad Abdul Rahim; Opera Supervisor; Remon Yamani; Salwa Zedan; names beginning with `Salwa Zedan Aly Prod. - Sta`; Sinoj Baskaran; Belraj A. Gopi; Kavitha Ranidas; Manoj Chandran; NA; Sreejith Nair; Vimal K. Balachandran; Wajira Pradeep |

Rules:

- Trim spaces.
- Collapse repeated spaces.
- Match case-insensitively.
- Do not show source-name variations separately.
- Unknown names become `UNMAPPED`, not `UNASSIGNED`.
- Apply grouping everywhere, including exports.

---

## 8. Room Type Grouping

Create:

```text
Room Type Group
```

### BASE

```text
STCR, STPC, OBCR, OBPV, OBPC, OBPP,
SUPK, SUPT, PRMK, PRMT, CLAK, CLAT,
DLXK, DLXT, OBR, PRM, STR, SUP, CLA, DLX
```

### SUI

```text
EXSUK, EXSUT, SUI
```

### CON

```text
CONCK, CONPT, CON, CONK, CONT
```

### 2BHK CREEK

```text
TBCR, CPCV
```

### 2BHK CHILD

```text
TBCB, TBPCB, TBR
```

### 2BHK MAID

```text
TBPV, TBPP
```

Rules:

- Trim spaces.
- Convert codes to uppercase.
- Remove duplicate mapping entries.
- Unknown codes become `UNMAPPED`.
- Exclude `UNMAPPED` from production visuals by default.
- Apply Room Type Group consistently to filters, calculations, charts, tables, tooltips, drill-downs, comparisons, and exports.

---

## 9. Physical Room Inventory

Inventory must be matched using both:

```text
Property + Room Type Group
```

### FCHDXB

| Room Type Group | Physical Rooms |
|---|---:|
| BASE | 144 |
| 2BHK CREEK | 12 |
| 2BHK CHILD | 12 |
| 2BHK MAID | 12 |
| Total | 180 |

### FAHDXB

| Room Type Group | Physical Rooms |
|---|---:|
| BASE | 149 |
| SUI | 12 |
| CON | 24 |
| Total | 185 |

### FIHDXB

| Room Type Group | Physical Rooms |
|---|---:|
| BASE | 155 |
| SUI | 12 |
| CON | 60 |
| Total | 227 |

Rules:

- Do not use a Room Type inventory for a property where it is not configured.
- Do not apply FCHDXB 2BHK inventory to FAHDXB or FIHDXB.
- Do not apply SUI or CON inventory to FCHDXB.
- Invalid combinations must show `N/A`.
- Invalid combinations must appear in Data Quality.
- When multiple properties are selected, calculate each valid combination separately, then sum sold room nights and available room nights.
- Never average occupancy percentages.

---

## 10. Standardized Time Groups

Use the same groups for Arrival Time and Departure Time:

| Time Group | Range |
|---|---|
| 12:00 AM–5:59 AM | 00:00–05:59 |
| 6:00 AM–8:59 AM | 06:00–08:59 |
| 9:00 AM–11:59 AM | 09:00–11:59 |
| 12:00 PM–1:59 PM | 12:00–13:59 |
| 2:00 PM–5:59 PM | 14:00–17:59 |
| 6:00 PM–9:59 PM | 18:00–21:59 |
| 10:00 PM–11:59 PM | 22:00–23:59 |
| Unknown / Invalid Time | Missing or invalid |

Accept:

- Excel time fractions
- Excel date-time values
- `HH:mm`
- `HH:mm:ss`
- `h:mm AM/PM`
- Text-formatted times

Invalid time values must:

- Appear in Data Quality.
- Be grouped as Unknown.
- Never be selected as the peak group.

---

## 11. Dynamic Occupancy Combination

Create:

```text
Occupancy Combination
```

Generate it dynamically from:

- Adults
- Children

Examples:

- `1 Adult`
- `2 Adults`
- `2 Adults + 1 Child`
- `2 Adults + 2 Children`
- `3 Adults + 4 Children`

Do not hard-code only selected examples.

Validation:

- Missing Adults
- Missing Children
- Negative values
- Zero Adults and zero Children
- Invalid numeric values

All occupancy-combination metrics use:

```text
SUM(Arrival Rooms)
```

---

## 12. Core Metrics

### Arrival Rooms

```text
SUM(valid Arrival Rooms)
```

### Departure Rooms

```text
SUM(valid Departure Rooms)
```

### Room Nights Sold

```text
SUM(valid Room Nights)
```

### Arrival Share %

```text
Room Type Arrival Rooms
÷ Total Arrival Rooms under the same filters
× 100
```

### Departure Share %

```text
Room Type Departure Rooms
÷ Total Departure Rooms under the same filters
× 100
```

### Room Night Share %

```text
Room Type Room Nights Sold
÷ Total Room Nights Sold under the same filters
× 100
```

### Daily Room Type Occupancy %

```text
Room Nights Sold
÷ Physical Rooms
× 100
```

Example:

```text
10 ÷ 12 × 100 = 83.33%
```

### Available Room-Nights

```text
Physical Rooms
× Number of Included Calendar Dates
```

### Multi-Day Occupancy %

```text
Room Type Room Nights Sold
÷ Available Room-Nights
× 100
```

Example:

```text
100 ÷ (12 × 10) × 100 = 83.33%
```

### Combined Multi-Property Occupancy

```text
SUM(Room Nights Sold)
÷ SUM(Available Room-Nights)
× 100
```

Never use:

```text
AVERAGE(Property Occupancy %)
```

### Weighted Average Arrival Time

```text
SUM(Arrival Time Minutes × Arrival Rooms)
÷ SUM(Arrival Rooms with valid Arrival Time)
```

### Weighted Average Departure Time

```text
SUM(Departure Time Minutes × Departure Rooms)
÷ SUM(Departure Rooms with valid Departure Time)
```

### Peak Arrival Time Group

The valid Arrival Time Group with the highest:

```text
SUM(Arrival Rooms)
```

### Peak Departure Time Group

The valid Departure Time Group with the highest:

```text
SUM(Departure Rooms)
```

Ties must show all tied peak groups.

### Occupancy Combination Arrival Rooms

```text
SUM(Arrival Rooms)
for the selected Adults + Children combination
```

### Occupancy Combination Share %

```text
Combination Arrival Rooms
÷ Total Arrival Rooms for selected Room Type
× 100
```

---

## 13. Occupancy Date-Spine Rules

Occupancy denominators must use a complete calendar date spine.

Rules:

- Include dates with zero records.
- Do not count only dates present in the uploaded file.
- Current month stops at the latest loaded Business Date.
- Future dates are excluded.
- Completed historical months use all dates in the selected period.
- Each valid Property–Room Type combination gets its own denominator.
- Sum denominators before calculating multi-property occupancy.

If Room Nights is unavailable:

- Show `Room Nights Sold unavailable`.
- Do not estimate occupancy from arrivals.
- Display a Data Quality warning.

If occupancy exceeds 100%:

- Do not cap it.
- Flag it.
- Allow the user to inspect the supporting records.

---

## 14. Last-Year Comparison

Shift the selected period back one calendar year.

Examples:

```text
1–15 July 2026 → 1–15 July 2025
July 2026 → July 2025
Selected 2026 week → Same dates in 2025
```

Apply the same filters to TY and LY.

### Count variance

```text
TY − LY
```

### Variance %

```text
(TY − LY) ÷ LY × 100
```

When LY equals zero:

```text
Variance % = N/A
```

### Percentage-point variance

For occupancy and shares:

```text
TY % − LY %
```

Display as:

```text
+4.2 pp
```

Comparison modes:

- Current vs Last Year
- Current only
- Last Year only

Do not display missing LY data as zero.

---

## 15. Global Filters

Primary:

- Property
- Room Type Group
- SEGGRP Group
- Month

Advanced:

- Market Code
- Account Manager Group
- Reservation Status
- Nationality
- Occupancy Combination
- Week
- Date range

Requirements:

- Multi-selection
- Search
- Select All
- Clear
- Reset
- Active chips
- Persistent state
- Property-aware Room Type options
- One property selected by default
- Latest available month selected by default
- Include Unmapped switch, off by default

---

## 16. Dashboard Tabs

### Tab 1 — Executive Overview

KPI cards:

- Total Arrival Rooms
- Total Departure Rooms
- Total Room Nights Sold
- Overall Room Type Occupancy %
- Peak Arrival Time Group
- Peak Departure Time Group
- Most Used Room Type
- Most Common Adult–Child Combination
- Data Quality Warning Count

Visuals:

- Room Type Arrival Share
- Room Type Departure Share
- Room Type Occupancy %
- Arrival and Departure Trend

All must include last-year comparisons.

### Tab 2 — Room Type Statistics

Metric selector:

- Arrival Rooms
- Departure Rooms
- Room Nights Sold
- Share %
- Occupancy %

Performance table:

- Property
- Room Type Group
- Physical Rooms
- Arrival Rooms TY
- Arrival Rooms LY
- Arrival Variance
- Departure Rooms TY
- Departure Rooms LY
- Departure Variance
- Room Nights Sold TY
- Room Nights Sold LY
- Room Night Share %
- Available Room-Nights
- Occupancy % TY
- Occupancy % LY
- Occupancy pp Variance

Visuals:

- Room Type Share Chart
- Room Type Occupancy Trend
- Property × Room Type Matrix

### Tab 3 — Guest Occupancy Combinations

Visuals:

- Adults × Children Heatmap
- Occupancy Combination Ranking
- Room Type Combination Explorer
- Monthly Combination Trend

Use Arrival Rooms as the metric.

### Tab 4 — Arrival Patterns

Use:

- Arrival Date
- Arrival Time
- Arrival Rooms

Visuals:

- Arrival Time Distribution
- Peak Arrival Time by Month
- Peak Arrival Time by Week
- Arrival Pattern by Room Type
- Arrival Pattern by SEGGRP
- Arrival Detail Table

### Tab 5 — Departure Patterns

Use:

- Departure Date
- Departure Time
- Departure Rooms

Visuals:

- Departure Time Distribution
- Peak Departure Time by Month
- Peak Departure Time by Week
- Departure Pattern by Room Type
- Departure Pattern by SEGGRP
- Departure Detail Table

### Tab 6 — Room Number Statistics

Use Arrival Rooms.

Visuals:

- Most Frequently Used Room Numbers
- Room Number × Month Heatmap
- Room Number Detail Table
- Room Number Drill-Down

Do not infer floor number without an approved reference.

### Tab 7 — Data Quality and Upload History

Validation categories:

- Duplicate records
- Unmapped Room Type Codes
- Unmapped Market Groups
- Unmapped Account Managers
- Invalid Property–Room Type combinations
- Missing Business Dates
- Invalid Arrival Dates
- Invalid Departure Dates
- Invalid Arrival Times
- Invalid Departure Times
- Missing Arrival Rooms
- Missing Departure Rooms
- Missing Room Numbers
- Missing Confirmation Numbers
- Negative values
- Occupancy above 100%
- Zero Adults and zero Children
- Room Nights unavailable

Upload-history columns:

- Import timestamp
- File name
- Worksheet
- Date coverage
- Rows received
- Rows appended
- Rows updated
- Duplicates
- Invalid rows
- Unmapped rows
- Rollback status

---

## 17. Interactions

Required:

- Click Room Type Group to filter related visuals.
- Click time group to filter detail records.
- Click heatmap cell to filter Adults and Children.
- Click Room Number to open drill-down.
- Tooltips show TY, LY, variance, and share.
- Provide View Records actions.
- Provide Clear Selection.
- Preserve filters across tabs.
- Apply active filters to exports.

---

## 18. Exports

Provide:

- Filtered summary CSV
- Filtered detail CSV
- Full database CSV
- Data Quality export
- Upload-history export
- JSON backup
- JSON restore
- Print view
- Chart PNG export where supported

Standardized export fields:

- Property
- Room Type Group
- SEGGRP Group
- Account Manager Group
- Arrival Time Group
- Departure Time Group
- Occupancy Combination

---

## 19. Flora Design

Colours:

- Royal Purple: `#523956`
- Ivory: `#F9F5F2`
- Pearl: `#F2E9E0`
- Violet: `#AB96BA`
- White: `#FFFFFF`
- Dark charcoal text

Font:

```css
"Flora", "Roboto", "Arial", sans-serif
```

Design requirements:

- Professional hospitality analytics style
- Clear hierarchy
- Balanced spacing
- Consistent cards
- Accessible contrast
- Minimal unnecessary white space
- No 3D charts
- Avoid excessive gradients
- Prevent label overlap
- Whole numbers for counts
- One decimal place for percentages
- `pp` for percentage-point differences
- `No Data` for empty states

---

## 20. Acceptance Tests

1. Uploading the same file twice does not double the database.
2. Uploading a new Business Date appends new records.
3. Matching records update correctly.
4. Latest import can be rolled back.
5. Arrival values `1, 2, 3` produce total `6`.
6. Departure values `1, 1, 2` produce total `4`.
7. FCHDXB 2BHK CREEK with 10 Room Nights on one date produces `83.33%`.
8. 100 Room Nights over 10 dates with 12 physical rooms produces `83.33%`.
9. Multi-property occupancy uses combined sold divided by combined available.
10. Dynamic Adults and Children combinations use Arrival Rooms.
11. `1–15 July 2026` compares with `1–15 July 2025`.
12. Unmapped values appear in Data Quality and remain excluded by default.
13. If latest Business Date is 15 July, occupancy denominator uses 1–15 July.
14. Filters update cards, charts, tables, drill-downs, tooltips, and exports.
15. Blank and zero remain different.
16. Invalid time cannot become a peak time group.
17. Invalid Property–Room Type combinations are excluded.
18. Occupancy above 100% is shown and flagged rather than capped.

---

## 21. Carry-Forward Development Sequence

1. Audit current files.
2. Validate data structure.
3. Implement normalization.
4. Implement mappings.
5. Implement inventory reference.
6. Implement IndexedDB schema.
7. Implement upload preview.
8. Implement append, update, deduplicate, and rollback.
9. Implement calculation engine.
10. Implement TY and LY period engine.
11. Implement filters and state.
12. Implement tabs and visuals.
13. Implement drill-downs.
14. Implement exports.
15. Apply Flora styling.
16. Run acceptance tests.
17. Update README.
18. Keep this context synchronized with approved logic.

---

## 22. Final Project Rule

When the code and this file conflict:

1. Determine whether the code is outdated.
2. Determine whether a newer approved user instruction changed the logic.
3. Do not silently allow the code and documented business rules to diverge.
4. Update this file only when the user approves a new rule.
