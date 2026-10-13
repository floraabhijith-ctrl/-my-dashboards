"use client";
import { useEffect, useState } from "react";
import { Building2, Pencil, Plus, RefreshCw, BellRing } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useFetch } from "@/lib/client/hooks";
import { fmtDateTime } from "@/lib/client/format";
import { Alert, Badge, Card, Field, Modal, PageHeader, Spinner } from "@/components/ui";

interface S { longStayThresholdNights: number; inactivityWarningDays: number; inactivityCriticalDays: number; highValueThresholdAed: number; approvalDiscountThresholdPct: number; followUpReminderDaysBefore: number; includeDemoData: boolean; quotationAwaitingDays: number }
interface P { id: string; code: string; name: string; shortName: string; city: string; isActive: boolean; sortOrder: number }
interface Sync { provider: string; counts: Record<string, number>; lastError: { lastError: string | null; createdAt: string } | null; health: { ok: boolean; detail: string } }

export function SettingsAdmin() {
  const { data, loading } = useFetch<{ settings: S }>("/api/admin/settings");
  const [s, setS] = useState<S | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setS(data.settings); }, [data]);

  async function save() {
    if (!s) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("/api/admin/settings", { method: "PATCH", body: s });
      setMsg({ tone: "success", text: "Settings saved." });
    } catch (e) {
      setMsg({ tone: "danger", text: e instanceof ApiError ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }
  const N = (k: keyof S, label: string, hint?: string, step = 1) => (
    <Field label={label} hint={hint}><input className="input" type="number" step={step} value={s ? String(s[k]) : ""} onChange={(e) => s && setS({ ...s, [k]: Number(e.target.value) })} /></Field>
  );

  return (
    <>
      <PageHeader title="Settings" subtitle="Commercial rules, monitoring thresholds, properties, central storage sync and notification jobs." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Commercial rules & monitoring thresholds">
          {loading || !s ? <Spinner /> : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {N("approvalDiscountThresholdPct", "Approval required above discount (%)", "Discount vs initial proposed rate that triggers internal approval", 0.5)}
              {N("highValueThresholdAed", "High-value enquiry threshold (AED)", "Potential revenue at or above this is flagged high value", 1000)}
              {N("longStayThresholdNights", "Long stay from (nights)", "Auto-classification; users may override per enquiry")}
              {N("inactivityWarningDays", "Inactivity warning (days)")}
              {N("inactivityCriticalDays", "Inactivity critical (days)")}
              {N("quotationAwaitingDays", "Quotation awaiting response after (days)")}
              {N("followUpReminderDaysBefore", "Follow-up reminder (days before due)")}
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={s.includeDemoData} onChange={(e) => setS({ ...s, includeDemoData: e.target.checked })} /> Include demonstration (fictional) records in reporting</label>
              <div className="sm:col-span-2 flex items-center gap-3">
                <button className="btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save settings"}</button>
                {msg && <span className={`text-sm ${msg.tone === "success" ? "text-success" : "text-danger"}`}>{msg.text}</span>}
              </div>
            </div>
          )}
        </Card>
        <PropertiesCard />
        <SyncCard />
        <AlertsCard />
      </div>
    </>
  );
}

function PropertiesCard() {
  const { data, reload } = useFetch<{ properties: P[] }>("/api/admin/properties?includeInactive=true");
  const [editing, setEditing] = useState<P | "new" | null>(null);
  const [form, setForm] = useState({ code: "", name: "", shortName: "", city: "Dubai", isActive: true, sortOrder: "0" });
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const open = (p: P | "new") => {
    setEditing(p);
    setErr(null);
    setForm(p === "new" ? { code: "", name: "", shortName: "", city: "Dubai", isActive: true, sortOrder: "0" } : { code: p.code, name: p.name, shortName: p.shortName, city: p.city, isActive: p.isActive, sortOrder: String(p.sortOrder) });
  };
  async function save() {
    setErr(null);
    setFieldErr({});
    try {
      const body = { ...form, sortOrder: Number(form.sortOrder) };
      if (editing === "new") await api("/api/admin/properties", { method: "POST", body });
      else if (editing) await api(`/api/admin/properties/${editing.id}`, { method: "PATCH", body });
      setEditing(null);
      reload();
    } catch (e) {
      if (e instanceof ApiError) { setErr(e.message); setFieldErr(e.fieldErrors()); } else setErr("Failed");
    }
  }
  return (
    <Card title="Properties" actions={<button className="btn-secondary" onClick={() => open("new")}><Plus className="h-4 w-4" /> Add property</button>}>
      <p className="mb-3 text-xs text-muted">Add future hotels here; no code change is needed. The code is used in enquiry references (FH-CODE-YYYY-NNNN).</p>
      <ul className="divide-y divide-line text-sm">
        {(data?.properties ?? []).map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-plum-400" /><div><div className="font-medium">{p.name}</div><div className="text-xs text-muted">{p.code} · {p.shortName} · {p.city}</div></div></div>
            <div className="flex items-center gap-2">{p.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}<button className="btn-ghost p-1.5" onClick={() => open(p)}><Pencil className="h-4 w-4" /></button></div>
          </li>
        ))}
      </ul>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "Add property" : "Edit property"}>
        {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" required error={fieldErr.code} hint="2–6 letters/digits, e.g. FCH"><input className="input uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Short name" required error={fieldErr.shortName}><input className="input" value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })} /></Field>
          <Field label="Full name" required error={fieldErr.name} className="sm:col-span-2"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="City"><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
          <Field label="Sort order"><input className="input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
        </div>
        <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" onClick={save}>Save</button></div>
      </Modal>
    </Card>
  );
}

function SyncCard() {
  const { data, reload, loading } = useFetch<Sync>("/api/admin/sync");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    try {
      const r = await api<{ processed: number; failed: number }>("/api/admin/sync", { method: "POST" });
      setRes(`Processed ${r.processed}, failed ${r.failed}.`);
      reload();
    } catch (e) {
      setRes(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Central storage sync (Google Sheets / Microsoft Lists)" actions={<button className="btn-secondary" disabled={busy || data?.provider === "none"} onClick={run}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Run now</button>}>
      {loading || !data ? <Spinner /> : (
        <div className="space-y-2 text-sm">
          <div>Provider: <Badge tone={data.provider === "none" ? "neutral" : "plum"}>{data.provider}</Badge> <span className="text-xs text-muted">(set with SYNC_PROVIDER in the server environment)</span></div>
          <div className={data.health.ok ? "text-success" : "text-danger"}>{data.health.detail}</div>
          <div className="text-xs text-muted">Outbox: {Object.entries(data.counts).map(([k, v]) => `${k} ${v}`).join(" · ") || "empty"}</div>
          {data.lastError?.lastError && <Alert tone="warning" title={`Oldest failure (${fmtDateTime(data.lastError.createdAt)})`}><span className="break-all">{data.lastError.lastError}</span></Alert>}
          {res && <div className="text-xs">{res}</div>}
          <p className="text-xs text-muted">The database is the source of truth. Every enquiry, activity and rate revision write is queued and mirrored to the configured provider automatically; failed rows are retried every 15 minutes by the scheduled job.</p>
        </div>
      )}
    </Card>
  );
}

function AlertsCard() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    try {
      const r = await api<Record<string, number>>("/api/admin/alerts", { method: "POST" });
      setRes(`Scanned ${r.scanned} active enquiries · ${r.followUpDue} due reminders · ${r.followUpOverdue} overdue · ${r.inactive} inactivity · ${r.highValue} high-value alerts created.`);
    } catch (e) {
      setRes(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Automated alerts" actions={<button className="btn-secondary" disabled={busy} onClick={run}><BellRing className="h-4 w-4" /> Run alert sweep now</button>}>
      <p className="text-sm text-muted">The daily job (04:00 UTC / 08:00 Dubai) creates in-app and e-mail alerts for follow-ups due, overdue follow-ups, inactive enquiries and high-value opportunities. Each alert is keyed so a reminder is sent at most once per enquiry, recipient and day. Lead assignment, approval, confirmed and lost notifications are sent immediately. Demo records never trigger alerts.</p>
      {res && <div className="mt-2 text-xs">{res}</div>}
    </Card>
  );
}
