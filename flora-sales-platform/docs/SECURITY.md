# Authentication, permissions and data integrity

## Authentication

- Individual accounts with e-mail + password. Passwords are hashed with bcrypt (12 rounds); strength rules: ≥ 10 characters, upper, lower and digit.
- On login the server issues a random 256-bit token; only its SHA-256 is stored in `sessions` with a 12-hour expiry, IP and user-agent. The cookie is `httpOnly`, `SameSite=Lax`, `Secure` in production.
- Failed logins are rate-limited per e-mail (8 attempts / 10 minutes per instance) and audited.
- Administrator-created users receive a temporary password and must change it at first sign-in. Deactivating a user or resetting a password invalidates all their sessions.
- `middleware.ts` redirects page requests without a session cookie; **real authorisation never relies on it** — every route handler calls `requireUser` and every service re-checks scope against the stored record.
- Optional Microsoft Entra ID SSO is not implemented; the session layer is isolated in `src/lib/auth/session.ts` so an OIDC provider can be added without touching authorisation.

## Authorisation model (`src/lib/authz.ts`)

| Rule | Enforcement |
| --- | --- |
| Executives see only `owner_id = self` | `visibleEnquiriesWhere()` is applied to every list, dashboard, export, duplicate check and approval query; `canViewEnquiry()` to every single-record read |
| Managers see own + direct team (`users.manager_id`) + assigned properties | same predicates |
| Unauthorised single-record access returns **404**, not 403 | prevents existence leaks via guessed URLs |
| Client cannot set `ownerId`, `approvedRate`, `isDemo`, `enquiryRef`, `version` to escalate | owner changes only via `/reassign` (manager+), approved rate only via the approval decision |
| Reassignment limited to the manager's team | `canAssignOwner()` |
| Approval authority | managers decide only when `discount_bps ≤ approval_limit_bps`; admins unlimited |
| Export restricted to management and scoped | `canExport()` + the same visibility predicate; every export is audited |
| Attachments | download/delete authorised through the parent enquiry; executives may delete only their own uploads |
| Administration endpoints | role check runs before the body is even parsed |
| Cron endpoints | bearer `CRON_SECRET` compared in constant time |

## Data integrity

- **Unique IDs**: `FH-<PROPERTY>-<YYYY>-<NNNN>` from an atomic counter; UUID primary keys.
- **Idempotent submission**: the form sends a client-generated `idempotencyKey`; a retry returns the existing record (HTTP 200, `replayed: true`) instead of creating a duplicate.
- **Duplicate detection**: live check on company + property + arrival ± 14 days within the user's scope, surfaced as a warning.
- **Safe concurrent editing**: `version` column; updates with a stale version are rejected (409) and the UI asks the user to reload.
- **History**: every rate change is written to `rate_revisions`; every action to `activities`; sensitive changes (ownership, approvals, deletion, user/settings changes, exports, logins) to `audit_logs` with before/after snapshots.
- **Soft delete** preserves history; only administrators can delete.
- **Validation**: zod on every endpoint with field-level error messages; lost reason mandatory when closing as Lost; departure after arrival; rate basis shared by all rates.
- **Attachments**: size and MIME allow-list, filename sanitised, SHA-256 recorded, served with `nosniff` and `no-store`.
- **CSV export**: formula-injection characters are neutralised.
- **Timestamps**: stored UTC, displayed Asia/Dubai.
- **Secrets**: only read from server environment variables; nothing privileged is bundled client-side (`NEXT_PUBLIC_` is not used for any credential).
- **Security headers**: `X-Frame-Options: DENY`, `nosniff`, referrer policy, permissions policy (`next.config.ts`).

## Automated tests (`npm test`)

`tests/security.test.ts` runs the real route handlers against an in-memory database and proves that a salesperson cannot reach another salesperson's leads through:

- the list endpoint, search, or widened filter parameters;
- a direct URL to the record (404, no existence leak);
- modified PATCH / follow-up / reassign payloads;
- attachment download, upload or deletion;
- the duplicate-check endpoint;
- CSV export (403 for executives; scoped for managers);
- analytics (dashboard KPIs only cover own records);

and that managers cannot cross teams, exceed their approval authority or reach administration endpoints, while cron endpoints require the shared secret.

`tests/workflow.test.ts` proves register → reopen → revise rate → follow-up → quotation → confirm, with history preserved, idempotent re-submission, stale-version rejection, management dashboard reflecting the change, one-time notifications and alert deduplication. `tests/commercial.test.ts` locks the calculation definitions.

## Backup and recovery

- Turso: automatic daily snapshots and point-in-time restore (plan-dependent); additionally run `turso db shell <db> .dump > backup.sql` on a schedule, or use the Turso platform API.
- Self-hosted SQLite: copy `data/flora.db` while the app is stopped, or use `sqlite3 data/flora.db ".backup backup.db"`.
- Postgres: provider snapshots + `pg_dump`.
- The Google Sheet / Microsoft List mirror is an additional human-readable copy of enquiries, activities and rate revisions, not a substitute for database backups (attachments and users are not mirrored).
- Restore procedure: restore the database, redeploy, then run `POST /api/admin/sync` (Settings → Run now) to re-send any outbox rows still pending.
