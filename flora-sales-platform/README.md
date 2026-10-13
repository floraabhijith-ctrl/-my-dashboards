# Flora Hospitality — Sales Enquiry Management & Commercial Intelligence Platform

A production-oriented, multi-user web application that centralises sales enquiries across
Flora Creek Deluxe Hotel Apartments, Flora Inn Hotel Dubai Airport and Flora Al Barsha Hotel at the Mall
(and any property added later by an administrator), gives each salesperson a private secure workspace,
records every negotiation and follow-up, and provides management with consolidated commercial intelligence.

| Area | Implementation |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Source of truth | Relational database (SQLite / libSQL via Drizzle ORM). Local file in development; Turso (libSQL) in production on Vercel. Postgres is a drop-in alternative (see docs/DEPLOYMENT.md). |
| Central reporting store | Automatic server-side mirror of every enquiry, activity and rate revision to **Google Sheets** (service account) or **Microsoft Lists / SharePoint** (Microsoft Graph), selected with `SYNC_PROVIDER`. |
| Authentication | Individual logins, bcrypt password hashing, database-backed httpOnly session cookies, forced password change on temporary passwords. |
| Authorisation | Enforced server-side on every data operation (`src/lib/authz.ts`), proven by automated tests. |
| Charts | Recharts |
| Notifications | In-app + e-mail (SMTP via Google Workspace or Microsoft 365), deduplicated by key. |
| Scheduled jobs | Vercel Cron: daily alert sweep, 15-minute sync retry. |
| Tests | Vitest: security isolation, workflow integrity, commercial calculations (42 tests). |

## Documentation

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture decision (database + reporting sync vs spreadsheet-only), module breakdown, request flow, milestones |
| [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md) | Database schema, metric and rate definitions, Google Sheets and Microsoft Lists column mappings |
| [docs/SECURITY.md](docs/SECURITY.md) | Authentication and permission architecture, audit trail, test coverage |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel + Turso deployment, Google / Microsoft 365 integration set-up, environment variables, backups |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Salesperson and manager instructions |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | Administrator instructions: users, properties, settings, sync, alerts |
| [.env.example](.env.example) | Environment variable template |

## Quick start (local)

```bash
cd flora-sales-platform
npm install
cp .env.example .env.local          # edit AUTH_SECRET, ADMIN_PASSWORD at minimum
npm run db:seed:demo                # migrates, creates properties, admin + fictional demo users & enquiries
npm run dev                         # http://localhost:3000
```

`npm run db:seed` (without `:demo`) creates only the three properties and the bootstrap administrator and is safe for production.

### Fictional test accounts (created by `db:seed:demo`)

| Role | E-mail | Password | Scope |
| --- | --- | --- | --- |
| Administrator | value of `ADMIN_EMAIL` (default `admin@florahospitality.com`) | value of `ADMIN_PASSWORD` | Everything |
| Sales Manager | manager.creek@demo.flora | Manager!2026 | Team: Ayesha, Ravi · Property: Flora Creek · approval authority 15 % |
| Sales Manager | manager.inn@demo.flora | Manager!2026 | Team: Lena, Tariq · Properties: Flora Inn, Flora Al Barsha · authority 12 % |
| Sales Executive | sales.ayesha@demo.flora | Sales!2026 | Own enquiries only |
| Sales Executive | sales.ravi@demo.flora | Sales!2026 | Own enquiries only |
| Sales Executive | sales.lena@demo.flora | Sales!2026 | Own enquiries only |
| Sales Executive | sales.tariq@demo.flora | Sales!2026 | Own enquiries only |

All demo enquiries are flagged **Demo** in the interface and can be excluded from reporting in Settings. They never trigger alerts.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `npm run build` / `npm start` | Development server / production build / production server |
| `npm run typecheck` | TypeScript check |
| `npm test` | Vitest suite (in-memory database, no external services) |
| `npm run db:generate` | Generate a new SQL migration after editing `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:seed` / `npm run db:seed:demo` | Seed reference data / plus fictional demo data |

## Integration status

Nothing external is "connected" until configured and verified in your own environment:

- **Database**: works out of the box locally (`file:./data/flora.db`). Production requires `DATABASE_URL` + `DATABASE_AUTH_TOKEN` (Turso) — see deployment guide.
- **Google Sheets / Microsoft Lists mirror**: disabled (`SYNC_PROVIDER=none`) until credentials are supplied. The Settings page shows live connection health once configured.
- **E-mail**: `EMAIL_PROVIDER=console` logs messages until SMTP is configured.
- **Deployment**: `vercel.json` and the deployment guide are provided; the project has not been deployed from this repository.
