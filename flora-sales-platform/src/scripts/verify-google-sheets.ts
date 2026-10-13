/**
 * Verifies the Google Sheets mirror end to end using the server credentials:
 *   1. exchanges the service-account key for a token,
 *   2. reads the spreadsheet title,
 *   3. creates the Enquiries / Activities / RateRevisions tabs with headers if missing,
 *   4. freezes the header row on each tab.
 *
 *   npm run google:verify
 */
import { loadEnv } from "./env";
loadEnv();
import { SignJWT, importPKCS8 } from "jose";
import { ENQUIRY_COLUMNS, ACTIVITY_COLUMNS, RATE_COLUMNS, SHEET_TABS } from "../lib/sync/mapping";

async function main() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const missing = [["GOOGLE_SERVICE_ACCOUNT_EMAIL", email], ["GOOGLE_PRIVATE_KEY", key], ["GOOGLE_SHEETS_SPREADSHEET_ID", id]].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  if (!key.includes("BEGIN PRIVATE KEY")) throw new Error("GOOGLE_PRIVATE_KEY does not look like a PEM private key (paste the private_key value from the JSON file).");

  const pk = await importPKCS8(key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(email!).setSubject(email!)
    .setAudience("https://oauth2.googleapis.com/token").setIssuedAt(now).setExpirationTime(now + 3600).sign(pk);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  const token = ((await tokenRes.json()) as { access_token: string }).access_token;
  console.log("✓ Service account token obtained for", email);

  const api = async (path: string, init: RequestInit = {}) => {
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
    if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${r.status} ${await r.text()}`);
    return r.json();
  };
  const meta = (await api("?fields=properties.title,sheets.properties(sheetId,title,gridProperties)")) as { properties: { title: string }; sheets: { properties: { sheetId: number; title: string } }[] };
  console.log(`✓ Spreadsheet reachable: "${meta.properties.title}"`);

  const wanted: [string, string[]][] = [
    [SHEET_TABS.enquiry, ENQUIRY_COLUMNS.map((c) => c.header)],
    [SHEET_TABS.activity, ACTIVITY_COLUMNS.map((c) => c.header)],
    [SHEET_TABS.rate_revision, RATE_COLUMNS.map((c) => c.header)],
  ];
  for (const [tab, headers] of wanted) {
    let sheet = meta.sheets.find((s) => s.properties.title === tab);
    if (!sheet) {
      const r = (await api(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] }) })) as { replies: { addSheet: { properties: { sheetId: number; title: string } } }[] };
      sheet = { properties: r.replies[0].addSheet.properties };
      console.log(`✓ Created tab "${tab}"`);
    }
    await api(`/values/${encodeURIComponent(tab)}!A1?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) });
    await api(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId: sheet.properties.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } }] }) });
    console.log(`✓ Headers written and frozen on "${tab}" (${headers.length} columns)`);
  }
  // Remove the default empty "Sheet1" if it is still there and unused.
  const def = meta.sheets.find((s) => /^Sheet1$/i.test(s.properties.title));
  if (def && meta.sheets.length >= 3) {
    const vals = (await api(`/values/${encodeURIComponent(def.properties.title)}!A1:B2`)) as { values?: string[][] };
    if (!vals.values) {
      await api(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: def.properties.sheetId } }] }) });
      console.log(`✓ Removed empty default tab "${def.properties.title}"`);
    }
  }
  console.log("\nGoogle Sheets mirror is ready. Set SYNC_PROVIDER=google-sheets and redeploy.");
}

main().then(() => process.exit(0)).catch((e) => { console.error("✗", e instanceof Error ? e.message : e); process.exit(1); });
