/**
 * Google Sheets adapter. Uses a service account (server-side only) and the
 * Sheets REST API v4. The spreadsheet must be private and shared with the
 * service-account e-mail as Editor. No OAuth consent screen is involved.
 */
import { SignJWT, importPKCS8 } from "jose";
import { ENQUIRY_COLUMNS, ACTIVITY_COLUMNS, RATE_COLUMNS, SHEET_TABS } from "./mapping";
import type { SyncEntity } from "./outbox";

interface TokenCache { token: string; expiresAt: number }
let cache: TokenCache | null = null;

async function accessToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now() + 60_000) return cache.token;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account credentials are not configured");
  const pk = await importPKCS8(key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(email)
    .setSubject(email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(pk);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cache.token;
}

async function api(path: string, init: RequestInit = {}) {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured");
  const token = await accessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Sheets API ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const cellValue = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v);

async function ensureTab(tab: string, headers: string[]) {
  const meta = (await api("?fields=sheets.properties.title")) as { sheets: { properties: { title: string } }[] };
  if (!meta.sheets.some((s) => s.properties.title === tab)) {
    await api(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab } } }] }) });
  }
  const first = (await api(`/values/${encodeURIComponent(tab)}!A1:ZZ1`)) as { values?: string[][] };
  if (!first.values || first.values[0]?.[0] !== headers[0]) {
    await api(`/values/${encodeURIComponent(tab)}!A1?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) });
  }
}

async function findRowByKey(tab: string, key: string): Promise<number | null> {
  const data = (await api(`/values/${encodeURIComponent(tab)}!A:A`)) as { values?: string[][] };
  const idx = (data.values ?? []).findIndex((r, i) => i > 0 && r[0] === key);
  return idx === -1 ? null : idx + 1; // 1-based row number
}

export async function googleSheetsWrite(entity: SyncEntity, operation: string, payload: Record<string, unknown>) {
  const tab = SHEET_TABS[entity];
  const columns = entity === "enquiry" ? ENQUIRY_COLUMNS : entity === "activity" ? ACTIVITY_COLUMNS : RATE_COLUMNS;
  await ensureTab(tab, columns.map((c) => c.header));
  const row = columns.map((c) => cellValue(c.pick(payload)));
  if (entity === "enquiry") {
    const key = String(payload.enquiryRef);
    const existing = await findRowByKey(tab, key);
    if (existing) {
      await api(`/values/${encodeURIComponent(tab)}!A${existing}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [row] }) });
      return;
    }
  }
  void operation;
  await api(`/values/${encodeURIComponent(tab)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [row] }) });
}

export async function googleSheetsHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const meta = (await api("?fields=properties.title")) as { properties: { title: string } };
    return { ok: true, detail: `Connected to "${meta.properties.title}"` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
