# Deployment guide

## 1. Prerequisites

- Node.js 20+ locally; a Vercel account; a GitHub repository containing this folder.
- Production database: Turso account (free tier is sufficient to start) — or Postgres (see §7).
- Optional: Google Workspace or Microsoft 365 tenant for the reporting mirror and e-mail.

## 2. Local development

```bash
cd flora-sales-platform
npm install
cp .env.example .env.local
# set AUTH_SECRET (openssl rand -base64 48), ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:seed:demo      # or npm run db:seed for reference data only
npm run dev
```

Run `npm test` and `npm run build` before deploying.

## 3. Production database (Turso)

```bash
npm i -g @tursodatabase/cli   # or: curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
turso db create flora-sales --location dxb   # closest region
turso db show flora-sales --url               # -> libsql://flora-sales-<org>.turso.io
turso db tokens create flora-sales            # -> DATABASE_AUTH_TOKEN
```

Apply migrations and seed from your machine (one-off):

```bash
DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run db:seed
```

`db:seed` is idempotent: it creates the three Flora properties and the administrator if missing. Do **not** run `db:seed:demo` against production unless you want fictional records (they are flagged and can be hidden, but it is cleaner to keep production real).

## 4. Vercel

1. Import the GitHub repository in Vercel. Set **Root Directory** to `flora-sales-platform`.
2. Framework preset: Next.js. Build command `npm run build`. Node 20.
3. Environment variables (Project → Settings → Environment Variables), from `.env.example`:

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_URL` | ✓ | `https://<your-domain>` — used in e-mail links |
| `AUTH_SECRET` | ✓ | long random string |
| `APP_TIMEZONE` | | default `Asia/Dubai` |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | ✓ | from Turso |
| `CRON_SECRET` | ✓ | Vercel sends it automatically to cron routes |
| `SYNC_PROVIDER` | ✓ | `none`, `google-sheets` or `microsoft-lists` |
| `GOOGLE_*` or `MS_*` | if sync enabled | see §5 / §6 |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_*` | for e-mail | see §8 |

4. Deploy. `vercel.json` registers two cron jobs: `/api/cron/alerts` daily at 04:00 UTC (08:00 Dubai) and `/api/cron/sync` every 15 minutes. (Hobby plans limit cron frequency; adjust the schedule if required.)
5. Verify: open `https://<domain>/api/health` → `{"ok":true}`; sign in as the administrator; change the temporary password; create real users in **User Management**.

## 5. Google Workspace mirror (Option A)

1. Google Cloud Console → create a project → enable **Google Sheets API**.
2. IAM → Service Accounts → create `flora-sales-sync` → Keys → create JSON key.
3. Create a **private** Google Sheet in the company Drive (do not use "anyone with the link"). Share it with the service-account e-mail as **Editor**.
4. Set `SYNC_PROVIDER=google-sheets`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (the `private_key` field, keep `\n` escapes) and `GOOGLE_SHEETS_SPREADSHEET_ID` (from the sheet URL).
5. Redeploy. Settings → *Central storage sync* shows "Connected to <sheet title>". Click **Run now** to flush pending rows. Tabs and headers are created automatically.

Access to the sheet should be limited to management; it contains confidential rates. The application never reads from it.

## 6. Microsoft 365 mirror (Option B)

1. Entra ID → App registrations → New registration `Flora Sales Sync` (single tenant). Note Tenant ID and Client ID; create a client secret.
2. API permissions → Microsoft Graph → **Application** → `Sites.Selected` (preferred) or `Sites.ReadWrite.All`; grant admin consent. With `Sites.Selected`, grant the app `write` on the target site via Graph (`POST /sites/{siteId}/permissions`).
3. Create a private SharePoint site (or use an existing restricted one) and three lists named e.g. *Sales Enquiries*, *Sales Activities*, *Sales Rate Revisions* with the columns in docs/DATA_SCHEMA.md.
4. Get IDs: `GET https://graph.microsoft.com/v1.0/sites/{hostname}:/sites/{sitePath}` → `MS_SITE_ID`; `GET /sites/{siteId}/lists` → the three list IDs.
5. Set `SYNC_PROVIDER=microsoft-lists`, `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SITE_ID`, `MS_LIST_ID_ENQUIRIES`, `MS_LIST_ID_ACTIVITIES`, `MS_LIST_ID_RATES`. Redeploy and verify in Settings.

Entra ID single sign-on for users is a separate, optional step not included in this release (see docs/SECURITY.md).

## 7. Postgres instead of Turso (optional)

Change `src/lib/db/schema.ts` imports from `drizzle-orm/sqlite-core` to `drizzle-orm/pg-core` (`text`/`integer`/`blob` → `text`/`integer`/`bytea`, booleans to `boolean`), switch `src/lib/db/client.ts` to `drizzle-orm/node-postgres` or `@neondatabase/serverless`, set `dialect: "postgresql"` in `drizzle.config.ts`, delete `drizzle/` and run `npm run db:generate`. The services and tests are dialect-agnostic.

## 8. E-mail

Set `EMAIL_PROVIDER=smtp` and:

- **Google Workspace**: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=<mailbox>`, `SMTP_PASS=<App Password>` (2-step verification required), or configure the Google SMTP relay.
- **Microsoft 365**: `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_USER=<mailbox>`, `SMTP_PASS=<password>` with SMTP AUTH enabled on the mailbox.

`EMAIL_FROM` must be an address the mailbox is allowed to send as. While `EMAIL_PROVIDER=console`, notifications are still created in-app and the e-mail is written to the server log.

## 9. Operations checklist

- Rotate `AUTH_SECRET`, `CRON_SECRET`, SMTP and sync credentials periodically; rotating `AUTH_SECRET` does not log users out (sessions are DB-backed) but is good hygiene.
- Monitor Settings → sync outbox for `FAILED` rows (the oldest error is shown).
- Backups: see docs/SECURITY.md.
- Custom domain: add in Vercel and update `APP_URL`.
