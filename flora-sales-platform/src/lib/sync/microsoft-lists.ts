/**
 * Microsoft 365 adapter. Uses an Entra ID app registration (client credentials)
 * and Microsoft Graph to upsert items in private SharePoint/Microsoft Lists.
 * Lists must exist with the columns named in mapping.ts (listField).
 */
import { ENQUIRY_COLUMNS, ACTIVITY_COLUMNS, RATE_COLUMNS } from "./mapping";
import type { SyncEntity } from "./outbox";

interface TokenCache { token: string; expiresAt: number }
let cache: TokenCache | null = null;

async function accessToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now() + 60_000) return cache.token;
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env;
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) throw new Error("Microsoft 365 credentials are not configured");
  const res = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Microsoft token request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cache.token;
}

async function graph(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Graph ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

function listId(entity: SyncEntity) {
  const id = { enquiry: process.env.MS_LIST_ID_ENQUIRIES, activity: process.env.MS_LIST_ID_ACTIVITIES, rate_revision: process.env.MS_LIST_ID_RATES }[entity];
  if (!id) throw new Error(`Microsoft list id for ${entity} is not configured`);
  return id;
}

const fieldValue = (v: unknown) => (v === null || v === undefined ? null : typeof v === "object" ? JSON.stringify(v) : v);

export async function microsoftListsWrite(entity: SyncEntity, operation: string, payload: Record<string, unknown>) {
  const site = process.env.MS_SITE_ID;
  if (!site) throw new Error("MS_SITE_ID is not configured");
  const columns = entity === "enquiry" ? ENQUIRY_COLUMNS : entity === "activity" ? ACTIVITY_COLUMNS : RATE_COLUMNS;
  const fields = Object.fromEntries(columns.map((c) => [c.listField, fieldValue(c.pick(payload))]));
  const base = `/sites/${site}/lists/${listId(entity)}/items`;
  if (entity === "enquiry") {
    const key = String(payload.enquiryRef).replace(/'/g, "''");
    const found = (await graph(`${base}?$filter=fields/Title eq '${key}'&$select=id`)) as { value: { id: string }[] };
    if (found.value[0]) {
      await graph(`${base}/${found.value[0].id}/fields`, { method: "PATCH", body: JSON.stringify(fields) });
      return;
    }
  }
  void operation;
  await graph(base, { method: "POST", body: JSON.stringify({ fields }) });
}

export async function microsoftListsHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const site = (await graph(`/sites/${process.env.MS_SITE_ID}?$select=displayName`)) as { displayName: string };
    return { ok: true, detail: `Connected to site "${site.displayName}"` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
