# Data schema and metric definitions

Source: `src/lib/db/schema.ts` (Drizzle ORM). Migrations: `drizzle/*.sql`.

## Conventions

- **Timestamps** are ISO-8601 UTC strings (`created_at`, `updated_at`, `last_activity_at`, …). Display converts to Asia/Dubai.
- **Calendar dates** (arrival, departure, follow-up dates) are `YYYY-MM-DD` strings with no timezone.
- **Money** is stored as integer **fils** (AED × 100). The UI and exports show AED.
- **Percentages** are stored as **basis points** (10 000 = 100.00 %).
- Enquiries are **soft-deleted** (`deleted_at`) so history and audit remain intact.

## Tables

| Table | Purpose | Key columns |
| --- | --- | --- |
| `properties` | Hotels (admin-managed) | `code` (used in Enquiry Ref), `name`, `short_name`, `is_active`, `sort_order` |
| `users` | Logins and roles | `email` (unique), `password_hash` (bcrypt), `role` (SALES_EXECUTIVE / SALES_MANAGER / ADMIN), `manager_id` (team), `approval_limit_bps`, `is_active`, `must_change_password`, `notify_by_email` |
| `user_properties` | Property scope per user | `(user_id, property_id)` |
| `sessions` | Server sessions | `id` = SHA-256(token), `expires_at`, `ip_address`, `user_agent` |
| `enquiry_counters` | Sequential IDs per property/year | `key` = `CODE-YYYY`, `value` |
| `enquiries` | The enquiry record (sections A–F of the form plus calculated fields) | see below |
| `activities` | Chronological timeline per enquiry | `type`, `from_status`, `to_status`, `note`, `client_feedback`, `next_action`, `follow_up_method`, `data` (JSON) |
| `rate_revisions` | Every change to any of the four rate fields | `field`, `previous_value`, `new_value`, `rate_basis`, `reason` |
| `rate_approvals` | Internal approval requests and decisions | `requested_rate`, `reference_rate`, `discount_bps`, `status`, `decided_by_id`, `decision_note` |
| `attachments` | Quotations and supporting documents (≤ 5 MB, allow-listed MIME types) | `file_name`, `mime_type`, `size_bytes`, `content` (blob), `sha256` |
| `audit_logs` | Immutable log of sensitive actions | `action`, `entity_type`, `entity_id`, `before`, `after`, `ip_address` |
| `notifications` | In-app and e-mail notifications | `type`, `dedupe_key` (unique), `email_status`, `read_at` |
| `settings` | Administrator-configurable thresholds (JSON) | `key = 'app'` |
| `sync_outbox` | Pending mirror writes to Google Sheets / Microsoft Lists | `entity_type`, `operation`, `payload`, `status`, `attempts`, `last_error` |

### `enquiries` columns by form section

| Section | Columns |
| --- | --- |
| A Enquiry information | `enquiry_ref` (FH-CODE-YYYY-NNNN), `created_at`, `updated_at`, `owner_id` (assigned salesperson), `created_by_id`, `property_id`, `source`, `enquiry_type`, `priority` |
| B Client | `company_name`, `contact_person`, `email`, `phone`, `country`, `account_type` (New/Existing), `client_remarks` |
| C Accommodation | `arrival_date`, `departure_date`, `nights` (calculated), `rooms`, `room_category`, `guests`, `meal_plan`, `additional_requirements`, `stay_type` (Short/Long, auto-classified, overridable) |
| D Commercial | `requested_rate`, `proposed_rate`, `revised_rate`, `approved_rate`, `rate_basis`, `tax_inclusion`, `rate_variance`, `discount_bps`, `total_room_nights`, `potential_revenue`, `expected_booking_value`, `probability`, `nightly_equivalent_rate` |
| E Status | `status`, `confirmed_at`, `closed_at`, `lost_reason` (mandatory when Lost) |
| F Follow-up | `last_follow_up_at`, `next_follow_up_at`, `follow_up_method`, `latest_client_response`, `next_action`, `sales_notes`, `delay_reason` |
| System | `last_activity_at`, `version` (optimistic concurrency), `is_demo`, `idempotency_key` (duplicate-submit guard), `deleted_at` |

## Commercial definitions (`src/lib/commercial.ts`)

All four rate fields on an enquiry share one **rate basis**; a monthly package price is never treated as a nightly rate.

| Term | Definition |
| --- | --- |
| Nights | `departure − arrival` in calendar days |
| Total room nights | `rooms × nights` |
| Effective rate | `approved ?? revised ?? proposed ?? requested` |
| Effective hotel rate | `approved ?? revised ?? proposed` (excludes the client's ask) |
| Revenue for a rate | Per Room Per Night: `rate × rooms × nights` · Monthly Package: `rate × rooms × nights ÷ 30` · Total Package: `rate` |
| Potential room revenue | revenue at the effective rate |
| Expected booking value | `potential revenue × probability` |
| Nightly equivalent | `potential revenue ÷ (rooms × nights)` — used for rate bands and cross-basis averages |
| Rate variance | `requested − proposed` (negative = client asked for less) |
| Discount % | `(proposed − effective hotel rate) ÷ proposed` |
| Approval trigger | Discount % above the administrator threshold (default 10 %) with no approved rate yet |
| Stay type | Long Stay when nights ≥ threshold (default 28) |
| Rate bands | Nightly equivalent in AED: <200, 200–349, 350–499, 500–749, 750+ |
| Stay duration bands | 1–3, 4–7, 8–27, 28+ nights |

## Reporting definitions (`src/lib/analytics/service.ts`)

| Metric | Definition |
| --- | --- |
| Active | status not in Confirmed / Lost / Cancelled |
| Qualified opportunities | Qualified, Quotation Sent, Negotiation, Awaiting Client, Awaiting Internal Approval |
| Quotations sent | enquiries that reached Quotation Sent or later (incl. Confirmed) |
| Lead conversion % | Confirmed ÷ all enquiries in scope |
| Win rate % | Confirmed ÷ (Confirmed + Lost) |
| Active pipeline revenue | Σ potential revenue of active enquiries |
| Weighted pipeline | Σ expected booking value of active enquiries |
| Confirmed revenue | Σ potential revenue of Confirmed enquiries (at the approved/effective rate) |
| Enquiry month | `created_at` in Asia/Dubai |
| Stay month | `arrival_date` — never mixed with enquiry month |
| Overdue follow-up | active and `next_follow_up_at < today` (Dubai) |
| Inactive N days | active and `today − last_activity_at ≥ N` |
| High value | potential revenue ≥ administrator threshold (default AED 50 000) |

Each enquiry is counted once; rate revisions and quotations never add rows, so revisions and multi-step negotiations are not double-counted.

## Google Sheets mapping (`src/lib/sync/mapping.ts`)

Spreadsheet: private, shared only with the service account. Tabs are created automatically with headers.

**Enquiries** (upsert keyed on column A *Enquiry Ref*):

Enquiry Ref · Enquiry ID · Created At (UTC) · Updated At (UTC) · Property · Property Code · Salesperson · Source · Enquiry Type · Priority · Company · Contact · Email · Phone · Country · Account Type · Arrival · Departure · Nights · Rooms · Room Category · Guests · Meal Plan · Stay Type · Rate Basis · Tax · Requested Rate (AED) · Proposed Rate (AED) · Revised Rate (AED) · Approved Rate (AED) · Discount % · Total Room Nights · Potential Revenue (AED) · Probability % · Expected Value (AED) · Status · Last Follow-up · Next Follow-up · Follow-up Method · Latest Client Response · Next Action · Notes · Delay Reason · Lost Reason · Confirmed At (UTC) · Deleted At (UTC) · Demo Record

**Activities** (append-only): Activity ID · Enquiry ID · Timestamp (UTC) · User ID · Type · From Status · To Status · Note · Client Feedback · Next Action · Method · Data (JSON)

**RateRevisions** (append-only): Revision ID · Enquiry ID · Timestamp (UTC) · User ID · Field · Previous (AED) · New (AED) · Rate Basis · Reason

## Microsoft Lists mapping

Three lists on a private SharePoint site. Create the columns below (internal names must match). `Title` holds the key.

| List | Columns (type) |
| --- | --- |
| Enquiries | Title (= Enquiry Ref), EnquiryId, CreatedAtUtc, UpdatedAtUtc, Property, PropertyCode, Salesperson, Source, EnquiryType, Priority, Company, Contact, Email, Phone, Country, AccountType, Arrival, Departure, Nights (Number), Rooms (Number), RoomCategory, Guests (Number), MealPlan, StayType, RateBasis, TaxInclusion, RequestedRate (Number), ProposedRate (Number), RevisedRate (Number), ApprovedRate (Number), DiscountPct (Number), TotalRoomNights (Number), PotentialRevenue (Number), Probability (Number), ExpectedValue (Number), Status, LastFollowUp, NextFollowUp, FollowUpMethod, LatestClientResponse (multi-line), NextAction, Notes (multi-line), DelayReason, LostReason, ConfirmedAtUtc, DeletedAtUtc, IsDemo |
| Activities | Title (= Activity ID), EnquiryId, TimestampUtc, UserId, ActivityType, FromStatus, ToStatus, Note (multi-line), ClientFeedback (multi-line), NextAction, Method, DataJson (multi-line) |
| RateRevisions | Title (= Revision ID), EnquiryId, TimestampUtc, UserId, RateField, PreviousValue (Number), NewValue (Number), RateBasis, Reason |

Text columns not listed as Number/multi-line are single-line text. Upsert for Enquiries uses `$filter=fields/Title eq '<ref>'`; index the Title column for large lists.
