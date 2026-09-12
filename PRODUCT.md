# Product

<!-- impeccable:product-schema 1 -->

<!--
Written by `/impeccable init` from repository evidence only. The interview probe
was declined and the user asked to proceed, so facts not verifiable in the code
are marked (inferred) or (open). Re-run `/impeccable init` to confirm them.
-->

## Platform

web

## Users

Primary user (inferred): the commercial/revenue analyst at Flora Hotels who
receives the monthly PMS statistics export and turns it into the month-end
performance review. They open the page, upload the file, read the variance, and
export the PDF.

Audience for the output (inferred): hotel management — GM, DOSM, revenue
managers — plus the five named account managers tracked by the Account Manager
tab (Arun Anand Raja, Sadik P. C., Nadia Waqas, Christzelle Mirasol, Muhammad
Awais Arshad).

Whether management opens the page themselves or only receives the exported PDF
is (open) — it decides how much the interface must explain itself to a
first-time viewer versus a daily operator.

## Product Purpose

Turn one monthly PMS statistics export into a month-over-month performance
picture across three Dubai properties, without an analyst rebuilding pivot
tables by hand. Success is a review meeting where every variance question —
which property, which market segment, which account manager, which account —
is already answered on screen.

## Positioning

The domain model is hardcoded to this estate, and that is the point: property
room counts, the market-group vocabulary, and the tracked account-manager roster
are built in, so an upload becomes a finished review rather than a spreadsheet
that still needs configuring. A generic BI tool would need all of that set up
per report.

## Operating Context

- Monthly cadence, driven by a PMS statistics export in Excel or CSV.
- One file carries at least two periods; the page sorts periods and compares the
  latest against the one before it. A single-period file renders with no
  comparison.
- Column headers vary between exports, so a mapping layer normalizes them
  (`business date` / `date`, `nights` / `room nights`, `mkt group` / `mktgroup`,
  and so on).
- Output leaves as a PDF via the print stylesheet and html2pdf, which hides
  filters, buttons, tabs and the upload splash and forces all tab panels visible.

## Capabilities and Constraints

Confirmed from the code:

- Single self-contained file, `Flora_Hotels_Dashboard.html` (~830 lines). No
  build step, no package manifest, no server. Libraries load from CDNs: SheetJS,
  Chart.js + datalabels, html2pdf.
- Parsing is entirely client-side; no network call sends the uploaded data
  anywhere.
- Three properties with fixed room counts: Flora Creek (FCHDXB, 180), Flora Al
  Barsha (FAHDXB, 186), Flora Inn (FIHDXB, 227).
- Metrics: room nights, revenue in AED, OCC%, ADR. Occupancy is
  `nights / (rooms x days in period)`.
- OCC variance is reported in percentage points, not growth percent — a
  deliberate correction noted in the source. Revenue variance shows AED and
  percent together.
- Eight tabs: Executive Summary, Property Comparison, Daily Performance, MKT
  Group Variance, Segment Comparison, Account Managers, LEI/LEGRP, Top 10
  Accounts.
- Six global filters (period, property, MKT group, account manager, country,
  account) plus a second filter row scoped to Top 10.
- Market-group vocabulary: COR, CORPL, LEI, LEGRP, CGRP, AIR. The Account
  Manager tab is scoped to COR, CORPL, AIR, CGRP.

Constraints treated as binding until told otherwise (inferred):

- Stays one file that opens by double-click, with no install step.
- Uploaded PMS data never leaves the browser.
- PDF export is a real deliverable and must not regress.

Open:

- Whether the wider Flora estate (FGHDXB, FPHDXB appear in the user's other
  Flora workflows) will need to appear here.
- Whether this repository will host the other Flora dashboards — the repository
  name is plural, and separate Repeat Guest and Room Type / Arrival & Departure
  dashboards exist in the user's workflows — or stay a single-dashboard repo.
  This decides whether a shared design system is worth extracting.
- Whether comparison should ever be against last year or budget rather than only
  the previous period.

## Brand Commitments

Flora Hotels, Dubai. The incumbent palette is Royal Purple and Pearl —
`#523956` accent, `#AB96BA` violet, `#F2E9E0` pearl, `#F9F5F2` ivory — with a
per-property color identity (Creek `#523956`, Al Barsha `#AB96BA`, Inn
`#7B5E8A`) used consistently across cards, headers and charts. Typeface is
Roboto. Currency is always AED.

The same Royal Purple / Pearl palette governs the user's other Flora
deliverables, so it is a house standard rather than one page's styling.

## Evidence on Hand

- `Flora_Hotels_Dashboard.html` — the shipped dashboard and the authority on the
  current visual system and data model.
- `README.md` is empty.
- No sample or fixture export is committed, so the exact PMS column set,
  realistic row counts, and edge cases (missing revenue, blank account manager,
  unmapped MKT group) cannot be verified from this repository. Do not invent
  them: any work that needs real data should ask for a sample file.
- No occupancy, revenue, or performance figures are recorded here. Nothing in
  future work may state Flora's actual numbers as fact.

## Product Principles

1. **The upload is the whole setup.** Anything that asks the user to configure
   what the file already implies is a defect.
2. **Variance is the message.** Direction and magnitude against the comparison
   period outrank absolute values in every view.
3. **Property identity is load-bearing.** Creek, Al Barsha and Inn keep their
   colors everywhere, so a reader locates a property before reading a label.
4. **Print is a first-class output, not an afterthought.** Every new view must
   survive the PDF export.
5. **The data stays on the machine it was opened on.**

## Accessibility & Inclusion

No product-specific requirement has been established (open). Two facts worth
recording for later work: the page currently encodes property and
positive/negative variance largely through color, and it carries no explicit
contrast or keyboard commitment.
