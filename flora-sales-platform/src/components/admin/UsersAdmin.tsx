"use client";
import { useState } from "react";
import { UserPlus, Pencil, KeyRound } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useFetch } from "@/lib/client/hooks";
import { fmtDateTime } from "@/lib/client/format";
import { Alert, Badge, Card, Field, Modal, PageHeader, Spinner } from "@/components/ui";

interface U { id: string; email: string; name: string; role: string; managerId: string | null; managerName: string | null; approvalLimitBps: number; isActive: boolean; notifyByEmail: boolean; mustChangePassword: boolean; lastLoginAt: string | null; propertyIds: string[] }
interface P { id: string; code: string; name: string; shortName: string; isActive: boolean }
const ROLES = [["SALES_EXECUTIVE", "Sales Executive"], ["SALES_MANAGER", "Sales Manager"], ["ADMIN", "Commercial Head / Administrator"]];

const blank = { email: "", name: "", role: "SALES_EXECUTIVE", managerId: "", approvalLimitPct: "0", propertyIds: [] as string[], isActive: true, notifyByEmail: true, password: "" };

export function UsersAdmin() {
  const { data, reload, loading } = useFetch<{ users: U[] }>("/api/admin/users?includeInactive=true");
  const { data: props } = useFetch<{ properties: P[] }>("/api/admin/properties?includeInactive=true");
  const [editing, setEditing] = useState<U | null | "new">(null);
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);

  const open = (u: U | "new") => {
    setEditing(u);
    setErr(null);
    setFieldErr({});
    setForm(u === "new" ? blank : { email: u.email, name: u.name, role: u.role, managerId: u.managerId ?? "", approvalLimitPct: String(u.approvalLimitBps / 100), propertyIds: u.propertyIds, isActive: u.isActive, notifyByEmail: u.notifyByEmail, password: "" });
  };

  async function save(resetPassword = false) {
    setBusy(true);
    setErr(null);
    setFieldErr({});
    try {
      const body: Record<string, unknown> = { email: form.email, name: form.name, role: form.role, managerId: form.managerId || null, approvalLimitPct: Number(form.approvalLimitPct), propertyIds: form.propertyIds, isActive: form.isActive, notifyByEmail: form.notifyByEmail };
      if (editing === "new") {
        if (form.password) body.password = form.password;
        const r = await api<{ id: string; temporaryPassword?: string }>("/api/admin/users", { method: "POST", body });
        if (r.temporaryPassword) setTemp({ email: form.email, password: r.temporaryPassword });
      } else if (editing) {
        if (resetPassword) body.password = form.password || "";
        const r = await api<{ temporaryPassword?: string }>(`/api/admin/users/${editing.id}`, { method: "PATCH", body });
        if (r.temporaryPassword) setTemp({ email: form.email, password: r.temporaryPassword });
      }
      setEditing(null);
      reload();
    } catch (e) {
      if (e instanceof ApiError) {
        setErr(e.message);
        setFieldErr(e.fieldErrors());
      } else setErr("Failed");
    } finally {
      setBusy(false);
    }
  }

  const managers = (data?.users ?? []).filter((u) => u.role === "SALES_MANAGER" && u.isActive);
  return (
    <>
      <PageHeader title="User Management" subtitle="Create, deactivate and scope users. Managers see their direct team plus their assigned properties; executives see only their own enquiries." actions={<button className="btn-primary" onClick={() => open("new")}><UserPlus className="h-4 w-4" /> New user</button>} />
      {temp && (
        <div className="mb-4">
          <Alert tone="success" title="Temporary password generated">
            Share securely with <strong>{temp.email}</strong>: <code className="rounded bg-white px-1.5 py-0.5 font-mono">{temp.password}</code>. They must change it at first sign-in. <button className="ml-2 underline" onClick={() => setTemp(null)}>Dismiss</button>
          </Alert>
        </div>
      )}
      {loading && !data ? <Spinner /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>E-mail</th><th>Role</th><th>Manager</th><th>Properties</th><th className="text-right">Approval limit</th><th>Status</th><th>Last login</th><th>Action</th></tr></thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr key={u.id} className={u.isActive ? "" : "opacity-60"}>
                  <td className="font-medium">{u.name}</td><td>{u.email}</td><td>{ROLES.find((r) => r[0] === u.role)?.[1]}</td><td>{u.managerName ?? "—"}</td>
                  <td>{u.propertyIds.map((id) => props?.properties.find((p) => p.id === id)?.code ?? "?").join(", ") || "—"}</td>
                  <td className="text-right tabular-nums">{u.role === "SALES_MANAGER" ? `${(u.approvalLimitBps / 100).toFixed(1)}%` : u.role === "ADMIN" ? "Unlimited" : "—"}</td>
                  <td>{u.isActive ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>} {u.mustChangePassword && <Badge tone="warning">Temp password</Badge>}</td>
                  <td className="text-xs">{fmtDateTime(u.lastLoginAt)}</td>
                  <td><button className="btn-ghost p-1.5" onClick={() => open(u)} title="Edit"><Pencil className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === "new" ? "New user" : "Edit user"} wide>
        {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full name" required error={fieldErr.name}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Work e-mail" required error={fieldErr.email}><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Role" required><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select></Field>
          {form.role !== "ADMIN" && <Field label="Reports to (Sales Manager)" hint="Defines the manager's team"><select className="input" value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}><option value="">—</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
          {form.role === "SALES_MANAGER" && <Field label="Rate approval authority (max discount %)" hint="Discounts above this go to an administrator" error={fieldErr.approvalLimitPct}><input className="input" type="number" min={0} max={100} step="0.5" value={form.approvalLimitPct} onChange={(e) => setForm({ ...form, approvalLimitPct: e.target.value })} /></Field>}
          <Field label="Assigned properties" hint={form.role === "SALES_MANAGER" ? "Manager sees all enquiries at these properties" : "Reference only for executives"} className="sm:col-span-2">
            <div className="flex flex-wrap gap-3">{(props?.properties ?? []).filter((p) => p.isActive).map((p) => <label key={p.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={form.propertyIds.includes(p.id)} onChange={(e) => setForm({ ...form, propertyIds: e.target.checked ? [...form.propertyIds, p.id] : form.propertyIds.filter((x) => x !== p.id) })} /> {p.shortName}</label>)}</div>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active (inactive users cannot sign in)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.notifyByEmail} onChange={(e) => setForm({ ...form, notifyByEmail: e.target.checked })} /> Send e-mail notifications</label>
          <Field label={editing === "new" ? "Initial password" : "New password"} hint="Leave blank to generate a temporary password" error={fieldErr.password} className="sm:col-span-2"><input className="input" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {editing !== "new" && <button className="btn-secondary" disabled={busy} onClick={() => save(true)}><KeyRound className="h-4 w-4" /> Reset password</button>}
          <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={() => save(false)}>{busy ? "Saving…" : "Save user"}</button>
        </div>
      </Modal>
    </>
  );
}
