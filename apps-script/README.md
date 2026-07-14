# Social Media Content Delivery Tracker

A complete, self-contained Google Apps Script web application for tracking social media
content requests from brief through publication — with automated reminders, escalation
emails, an approval workflow, and delivery-performance reporting. Google Sheets is the
permanent database; nothing is stored client-side.

## Files in this project

| File | Purpose |
|---|---|
| `Code.gs` | Backend: data access, workflow logic, reminder engine, setup routine |
| `Index.html` | Web app shell (navigation, view containers, modals) |
| `Styles.html` | Responsive CSS for the whole application |
| `JavaScript.html` | Client-side logic (rendering, filtering, forms, charts) |
| `EmailTemplates.html` | HTML template used to build reminder/escalation emails |
| `appsscript.json` | Project manifest (time zone, scopes, web app config) |

---

## 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it something like **Social Media Content Delivery Tracker**.
3. You do not need to create tabs manually — the setup script (Section 11) creates them
   for you. If you prefer to create them yourself first, see Section 2 for exact names
   and headers.

## 2. Required tabs and headers

The app expects these five tabs. If they don't exist, `setupApplication()` creates them.
If they already exist, it only **adds missing headers to the right** — it never deletes
or reorders existing columns, so it's safe to run again later.

**CONTENT_TRACKER**
`Request ID, Property, Campaign, Platform, Content Type, Content Title, Detailed Brief,
Requester, Requester Email, Assigned To, Assignee Email, Priority, Request Date,
Original Due Date, Revised Due Date, Status, Progress Percentage, Approval Status,
Reference Link, Drive Link, Canva Link, Notes, Draft Link, Published Link, Publication Date,
Latest Update, Blocker, Next Action, Last Updated By, Last Updated Date, Last Reminder Sent,
Reminder Count, Completion Date, Days Overdue, SLA Status, Record Status, Approved By,
Approval Date, Approval Comment, Cancellation Reason, Hold Reason`

**UPDATE_LOG**
`Log ID, Timestamp, Request ID, Update Type, Updated By, Previous Status, New Status,
Previous Progress, New Progress, Comment, Blocker, Next Action, Previous Due Date,
Revised Due Date, Expected Completion Date`

**TEAM**
`Name, Email, Role, Department, Is Social Media Manager, Is Department Head, Active`

**SETTINGS**
`Key, Value, Description` (key/value rows — see Section 8)

**REMINDER_LOG**
`Log ID, Timestamp, Request ID, Reminder Type, Escalation Level, Recipients, Status, Notes`

## 3. Add the Apps Script files

1. In the spreadsheet, open **Extensions → Apps Script**.
2. Delete the placeholder `Code.gs` content (or keep it — the setup script will overwrite
   the functions with the same names).
3. Create each file listed above (`File → New → Script file` for `.gs`,
   `File → New → HTML file` for `.html`) using the **exact names**:
   - `Code.gs`
   - `Index.html`
   - `Styles.html`
   - `JavaScript.html`
   - `EmailTemplates.html`
4. Copy the contents of each file from this project into the matching file in the Apps
   Script editor.
5. Open **Project Settings** (gear icon) and check **"Show appsscript.json manifest file
   in editor"**. Replace its contents with `appsscript.json` from this project.
6. Save the project (`Ctrl+S` / `Cmd+S`).

## 4. Authorize the application

1. In the Apps Script editor, select the function `setupApplication` from the function
   dropdown at the top and click **Run**.
2. Google will prompt you to authorize the script. Click **Review permissions**, choose
   your account, click **Advanced → Go to (project name) (unsafe)** (this warning is
   normal for scripts you wrote yourself), then **Allow**.
3. The script needs access to: Google Sheets (read/write), Gmail (send mail as you via
   `MailApp`), and your basic user info (to resolve your role).

## 5. Configure the Asia/Dubai time zone

This is already set in two places so it's consistent everywhere:

- `appsscript.json` → `"timeZone": "Asia/Dubai"` (governs date formatting and trigger times).
- You can also confirm/change it in the Sheet itself: **File → Settings → Time zone →
  (GMT+04:00) Dubai**.

All due-date math, "today", and reminder scheduling use `Asia/Dubai` explicitly in
`Code.gs` (see `formatDate_`, `checkAndSendReminders`), so it stays correct even if a
user's browser is in a different time zone.

## 6. Run setup and create the daily reminder trigger

After authorizing, `setupApplication()` (Section 4) has already:

- Created any missing sheets and headers.
- Applied dropdown validation for Status, Priority, Approval Status, Record Status.
- Applied date/number formats and frozen header rows.
- Seeded default `SETTINGS` values and a starter `TEAM` row (using your own email as the
  first Administrator).
- Created a **daily time-based trigger** for `checkAndSendReminders`, running at 08:00
  Asia/Dubai time.

To create the trigger by itself at any time (e.g. if you ever delete it), run
`createDailyReminderTrigger` from the function dropdown, or add it manually:
**Triggers (clock icon in the left sidebar) → + Add Trigger** →
Function: `checkAndSendReminders`, Event source: `Time-driven`, Type: `Day timer`,
Time: `8am to 9am`, Time zone: `Asia/Dubai`.

## 7. Deploy the web application

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure:
   - **Execute as:** User accessing the web app
   - **Who has access:** Anyone within your organization (or "Anyone" if you need
     external access — not recommended for this use case)
4. Click **Deploy**, then **Authorize access** if prompted again.
5. Copy the **Web app URL** shown after deployment.
6. Go back to the spreadsheet's `SETTINGS` tab and paste the URL into the **Web App URL**
   row's Value column (or use the in-app **Settings** view). This URL is what reminder
   emails link back to.
7. Share the web app URL with your team.

> Note: `executeAs: USER_ACCESSING` means each signed-in user's own Google identity is
> used to resolve their role from the `TEAM` tab, and Sheets access happens under their
> own account permissions. Make sure everyone who needs access has at least **Viewer**
> access to the underlying spreadsheet (**Share** button in Sheets), or the web app will
> fail to read data for them. If you'd rather have everyone run under one shared service
> identity regardless of their own Sheets access, change `executeAs` to `USER_DEPLOYING`
> in `appsscript.json` and redeploy — in that mode, role resolution still uses the
> viewer's login email via `Session.getActiveUser()`, but data access uses the deploying
> account's permissions.

## 8. Update team members and email addresses

Everything email-related is data-driven — nothing is hard-coded in `Code.gs`.

- **Add/edit team members:** use the in-app **Team Management** view (Administrator
  role only), or edit the `TEAM` tab directly:
  - `Role` must be one of `Administrator`, `Requester`, `Social Media Team`, `Approver`,
    `Viewer`.
  - Set `Is Social Media Manager` to `Yes` for the one person who should receive Level 2
    escalations.
  - Set `Is Department Head` to `Yes` for the one person who should receive Level 3
    escalations.
  - Set `Active` to `No` to revoke access without deleting the row (they fall back to
    Viewer).
- **Fallback escalation emails:** if no one in `TEAM` is flagged as manager/department
  head, the app falls back to the `Social Media Manager Email` / `Department Head Email`
  rows in `SETTINGS`.
- **Default role for unlisted users:** `SETTINGS` → `Default Fallback Role` (defaults to
  `Requester`) — used when a signed-in user's email isn't found in `TEAM` at all.
- **Dropdown lists** (Properties, Campaigns, Platforms, Content Types) are also stored as
  comma-separated values in `SETTINGS` and editable from the in-app **Settings** view.

## 9. Test reminder and escalation workflows

You don't have to wait for the daily 08:00 trigger to test reminders:

1. In the Apps Script editor, run `testReminderRun` (or `checkAndSendReminders`
   directly) from the function dropdown. Check the **Execution log** for a summary.
2. Create a test request in the web app with an **Original Due Date** of today, and
   another with a due date a couple of days in the past (you can also just edit the
   `Original Due Date` cell directly in `CONTENT_TRACKER` for a quick test).
3. Run `checkAndSendReminders` again — you should receive a "Due Today" or "Overdue"
   email at the assignee's address, and a new row in `REMINDER_LOG`.
4. To test escalation, set a due date 2+ days in the past — the requester and the
   flagged Social Media Manager should be copied. Set it 3+ days in the past to also
   copy the Department Head.
5. To test the stale-progress reminder, edit `Last Updated Date` on a row to more than
   48 hours ago and re-run.
6. Reminders will not duplicate within the same day (checked against `REMINDER_LOG`),
   and stop entirely once a request's `Status` is `Published`, `Cancelled`, or `On Hold`.
7. Open the request in the app and check its **Reminder History** tab to confirm the
   log entry, recipient list, and delivery status.

## 10. Redeploy after making changes

Apps Script web apps serve the **deployed** version of your code, not what's currently
saved in the editor. After editing any file:

1. **Deploy → Manage deployments**.
2. Click the pencil (edit) icon on your existing web app deployment.
3. Under **Version**, choose **New version**, add a short description of the change.
4. Click **Deploy**.

The web app URL stays the same across redeployments, so you don't need to re-share it
or update `SETTINGS → Web App URL` again. If you instead create a *new* deployment
(rather than editing the existing one), you'll get a new URL and will need to update
`SETTINGS → Web App URL` and re-share the link.

---

## How the moving parts fit together

- **Roles**: resolved per signed-in user from `TEAM` (matched by email), falling back to
  `SETTINGS → Default Fallback Role` for anyone not listed. The UI hides navigation
  items and action buttons the current role isn't permitted to use; this is a
  presentation-layer convenience, not a hard security boundary — anyone with edit access
  to the spreadsheet can always act directly on the sheet.
- **Request IDs** (`SM-YYYY-0001`) are generated inside a `LockService` critical section
  so two simultaneous submissions can never collide.
- **Every** status/progress/approval/publish/hold/cancel/archive action writes one row to
  `UPDATE_LOG` — history is never overwritten, only appended.
- **SLA Status** and **Days Overdue** are recalculated on every read against the
  effective due date (Revised Due Date if set, else Original Due Date), so they're
  always accurate without needing a background job.
- **checkAndSendReminders** is idempotent per day per reminder type — safe to run
  manually as often as you like while testing without spamming recipients.
