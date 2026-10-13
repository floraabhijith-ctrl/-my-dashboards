# Architecture

## 1. Storage decision: database as source of truth, spreadsheet/list as automatic reporting mirror

The brief asks for every enquiry to be stored automatically in a centrally managed Google Sheet or Microsoft 365 list, and
for the management dashboard to reflect updates without manual imports. It also requires safe concurrent editing, audit
history, attachments, unique IDs, duplicate prevention and server-enforced permissions.

A spreadsheet or SharePoint list **cannot safely be the primary transactional store** for this workload:

| Requirement | Google Sheets / Microsoft Lists as primary store | Database as primary store |
| --- | --- | --- |
| Concurrent edits by several salespeople | Row-level races; no optimistic locking; Sheets API quotas (per-minute write limits) | Row versioning (`version` column) rejects stale writes with HTTP 409 |
| Unique, sequential enquiry IDs | No atomic counters | Atomic counter table per property and year |
| Audit history, rate revisions, activity timeline | Would require several loosely-coupled tabs with no referential integrity | Foreign keys, cascading history tables, immutable audit log |
| Attachments | Separate Drive/SharePoint ACL management | Stored with the record, served only through authorised API |
| Permissions | Sheet is either shared or not; cannot hide one salesperson's rows from another | Enforced per request in `authz.ts` |
| Latency for dashboards | Full-sheet reads on every page | Indexed queries |

**Decision:** the relational database is the single source of truth. Every write to an enquiry, activity or rate revision
also inserts a row in a transactional **outbox** (`sync_outbox`). After the HTTP response is sent (`next/server` `after`),
and again every 15 minutes via Vercel Cron, the outbox is drained to the configured provider:

- `SYNC_PROVIDER=google-sheets` → upsert by Enquiry Ref into a private spreadsheet (tabs *Enquiries*, *Activities*, *RateRevisions*) via a service account.
- `SYNC_PROVIDER=microsoft-lists` → upsert into three Microsoft Lists on a private SharePoint site via Graph (client credentials).
- `SYNC_PROVIDER=none` → no mirror.

This satisfies "automatically stored in a centrally managed Google Sheets or Microsoft 365 data source" while the
management dashboard reads the database directly, so there is never a manual import and no duplicate independent records:
the mirror is write-only from the application and keyed on Enquiry Ref, so it is always a faithful projection.

Only one provider should be active in production. Running both would create two projections that could drift if one
fails; the outbox retries per row, but there is no cross-provider reconciliation.

### Database engine

- Development: SQLite file (`file:./data/flora.db`), zero set-up.
- Production on Vercel: **Turso (libSQL)** — a hosted, durable SQLite-compatible database with point-in-time restore,
  reachable over HTTPS from serverless functions. Same schema, same migrations.
- Alternative: Postgres (Neon / Vercel Postgres). Drizzle ORM is used throughout; migrating requires changing the schema
  dialect from `sqlite-core` to `pg-core` and regenerating migrations. No application logic depends on SQLite features.

## 2. Module breakdown

```
src/
  app/                      Next.js App Router
    login/                  Sign-in
    (app)/                  Authenticated shell (server-side session check + sidebar)
      dashboard             My Dashboard (salesperson workspace)
      enquiries/new         Registration form
      enquiries             My Enquiries (scoped list, filters)
      enquiries/[id]        Detail, timeline, rates, documents, actions
      enquiries/[id]/edit   Edit form (optimistic concurrency)
      calendar              Follow-up calendar
      performance           My Performance
      management/*          Executive Dashboard, All Enquiries, Salesperson, Property, Pipeline, Negotiation, Follow-up Monitoring, Reports
      admin/*               User Management, Settings (properties, thresholds, sync, alerts)
      account/password      Change password
    api/                    Route handlers (all authorised server-side)
  lib/
    db/schema.ts            Drizzle schema (single source for DB, validation enums and UI)
    db/client.ts            libSQL client singleton (test override via setDb)
    auth/                   Password hashing, DB-backed sessions, current-user resolution
    authz.ts                Role/scope rules used by every service
    validation/enquiry.ts   zod schemas (form, follow-up, quotation, approvals, list filters)
    commercial.ts           Deterministic rate / revenue / discount calculations (pure, unit-tested)
    enquiries/service.ts    Domain service: create/update/list/detail, follow-ups, quotations, approvals, reassign, delete
    enquiries/attachments.ts
    analytics/service.ts    KPI, trend, funnel, negotiation, follow-up monitoring and forward outlook aggregation
    notifications/          In-app + e-mail notifications with dedupe keys; scheduled alert sweep
    sync/                   Outbox, Google Sheets adapter, Microsoft Lists adapter, column mapping, processor
    admin/                  Users and properties administration
    settings.ts             Administrator-configurable thresholds
    audit.ts                Immutable audit log writer
  components/               UI (Flora brand tokens in app/globals.css)
  scripts/                  migrate.ts, seed.ts
tests/                      Vitest: security.test.ts, workflow.test.ts, commercial.test.ts
drizzle/                    SQL migrations
```

## 3. Request flow (write)

1. Client component posts JSON to a route handler (`/api/enquiries`, `/api/enquiries/:id`, …).
2. `requireUser` resolves the session cookie against the `sessions` table (SHA-256 of the token; 12-hour TTL).
3. zod validates the payload (422 with field-level messages on failure).
4. The domain service re-checks authorisation against the stored record (never trusting client-supplied owner/property),
   checks the `version` (409 on conflict), recalculates all commercial fields, writes the record, the activity row(s),
   rate revisions, audit entry, notifications and outbox rows.
5. The handler schedules `processOutbox()` to run after the response.
6. The UI redirects to the detail page and re-fetches from the server — success is only shown after persistence.

## 4. Roles and scope

| Capability | Sales Executive | Sales Manager | Administrator |
| --- | --- | --- | --- |
| Register enquiry | Own only | Self or team member | Anyone |
| View / edit enquiry | Own only | Own + direct team + assigned properties | All |
| Reassign | ✗ | Within team | Anyone |
| Approve rates | ✗ | Up to personal authority limit (% discount) | Unlimited |
| Export CSV | ✗ | Scoped | All |
| Delete (soft) | ✗ | ✗ | ✓ |
| Users / properties / settings | ✗ | ✗ | ✓ |

See docs/SECURITY.md for enforcement details.

## 5. Milestones (as delivered)

| Milestone | Deliverable | Where |
| --- | --- | --- |
| 1 Architecture & data model | This document, schema, roles, routes | docs/, `src/lib/db/schema.ts`, `src/lib/authz.ts` |
| 2 Authentication & sales interface | Login, workspace, registration form, list, detail, calendar, performance | `src/app/(app)/*`, `src/components/*` |
| 3 Central storage integration | Outbox + Google Sheets / Microsoft Lists adapters, health check, retry job | `src/lib/sync/*`, `/api/cron/sync`, Settings page |
| 4 Management dashboard | 8 modules, 11 filters, drilldowns, CSV export | `src/components/management/*`, `src/lib/analytics/service.ts` |
| 5 Follow-up & commercial workflows | Timeline, rate revisions, approvals with authority limits, reminders, alerts | `src/lib/enquiries/service.ts`, `src/lib/notifications/*` |
| 6 Validation & deployment | 42 automated tests, production build, deployment guide, env template | `tests/*`, `docs/DEPLOYMENT.md`, `vercel.json` |
