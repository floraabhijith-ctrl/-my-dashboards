# Google Sheets mirror — set-up runbook (personal Gmail: floraabhijith@gmail.com)

The application writes to the sheet with a **service account** (a robot identity), so no user has to stay signed in and no OAuth consent screen is needed. A personal Gmail account can own the Google Cloud project; no Workspace subscription is required.

## Part A — done (13 Oct 2026)
1. Master spreadsheet **Flora Sales Enquiries (Master)** created in the Drive of floraabhijith@gmail.com, private (owner only).
   - URL: https://docs.google.com/spreadsheets/d/1fOm5pl4ZinOH6F2TiUIVyLC0yqhkpuw3D_fA8pb5N-I/edit
   - `GOOGLE_SHEETS_SPREADSHEET_ID=1fOm5pl4ZinOH6F2TiUIVyLC0yqhkpuw3D_fA8pb5N-I`
   - Tabs **Enquiries** (47 columns), **Activities** (12), **RateRevisions** (9) with the application's header rows written and frozen.
2. Pending: share the spreadsheet with the service account as Editor (step B4).

## Part B — you (about 5 minutes, all in the browser)
1. Open <https://console.cloud.google.com/projectcreate> signed in as floraabhijith@gmail.com. Project name: `flora-sales-platform`. Create.
2. Enable the Sheets API: <https://console.cloud.google.com/apis/library/sheets.googleapis.com> → **Enable** (make sure the new project is selected at the top).
3. Create the service account: <https://console.cloud.google.com/iam-admin/serviceaccounts> → **Create service account** → name `flora-sales-sync` → Create and continue → skip roles → Done.
4. Copy the service-account e-mail (looks like `flora-sales-sync@flora-sales-platform.iam.gserviceaccount.com`) and send it to me in the chat, or share the master spreadsheet with it yourself as **Editor** (uncheck "Notify people").
5. Create a key: open the service account → **Keys** → Add key → Create new key → **JSON** → Create. A file downloads. Keep it private; never commit it to Git.

## Part C — configure the application
From the JSON file take `client_email` and `private_key`:

```
SYNC_PROVIDER=google-sheets
GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email>
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEETS_SPREADSHEET_ID=1fOm5pl4ZinOH6F2TiUIVyLC0yqhkpuw3D_fA8pb5N-I
```

- Locally: put them in `flora-sales-platform/.env.local`, then run `npm run google:verify`. It confirms the token exchange, reaches the sheet, writes the headers and freezes them.
- Vercel: Project → Settings → Environment Variables → add the same four variables (paste the private key as a single line with `\n` escapes, exactly as in the JSON). Redeploy. Settings → *Central storage sync* should show **Connected to "Flora Sales Enquiries (Master)"**; press **Run now** to flush any pending rows.

## Security notes
- Keep the sheet private (no "anyone with the link"). Share it only with management users who need the raw mirror.
- The application never reads from the sheet; edits made in the sheet are not synced back and will be overwritten on the next update of that enquiry row.
- Rotate the key from the service account's **Keys** tab if it is ever exposed, then update the environment variable.
