# Administrator guide (Commercial Head)

Administrators see every property and salesperson, all management modules and two extra areas: **User Management** and **Settings**.

## User Management
- **New user** — name, work e-mail, role, reporting manager (defines the manager's team), assigned properties, approval authority (managers only, max discount %), e-mail notifications. Leave the password blank to generate a temporary one; share it securely — the user must change it at first sign-in.
- **Edit** — change role, scope or status. Deactivating a user blocks sign-in immediately and ends their sessions; their enquiries remain visible to management and can be reassigned.
- **Reset password** — issues a new temporary password and ends existing sessions.
- You cannot deactivate yourself or remove your own administrator role.

## Settings
- **Commercial rules & thresholds** — approval discount threshold, high-value threshold (AED), long-stay nights, inactivity warning/critical days, quotation-awaiting days, follow-up reminder lead time, and whether fictional demo records are included in reporting.
- **Properties** — add future hotels (code, names, city, order) with no code change; deactivate properties no longer selling. Codes appear in enquiry references.
- **Central storage sync** — shows the configured provider (`SYNC_PROVIDER` environment variable), live connection health, outbox counts and the oldest failure. **Run now** flushes pending rows. Credentials are never entered in the browser; they live in the server environment (see docs/DEPLOYMENT.md).
- **Automated alerts** — runs the alert sweep on demand (it also runs daily at 08:00 Dubai).

## Enquiry governance
- Administrators may **reassign** any enquiry, **approve** any discount, and **delete** (soft delete with reason; history and audit are kept).
- Every sensitive action is written to the audit log (`/api/admin/audit?entityType=enquiry&entityId=<id>` returns the trail for a record; the full log is available to administrators through the same endpoint).
- CSV exports are available on All Enquiries, Executive Dashboard and Reports and are audited.

## Demo data
`npm run db:seed:demo` creates fictional users and enquiries flagged **Demo**. They display a banner and badge in every view and never generate alerts. Hide them from reporting with the Settings toggle, or deactivate the demo users once real users are onboarded.

## Routine operations
| When | What |
| --- | --- |
| Daily | Review Follow-up Monitoring and Negotiation Tracker (pending approvals) |
| Weekly | Check Settings → sync health; review audit entries for reassignments/deletions |
| Monthly | Export Reports for the commercial review; confirm backups are being taken |
| On staff change | Deactivate the user, reassign open enquiries to the successor |
