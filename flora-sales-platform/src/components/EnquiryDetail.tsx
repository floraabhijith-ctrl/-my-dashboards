"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, PhoneCall, FileText, MessageSquare, UserRoundCog, ShieldCheck, Paperclip, Trash2, Download } from "lucide-react";
import { api, ApiError } from "@/lib/client/api";
import { useFetch, useMeta } from "@/lib/client/hooks";
import type { EnquiryDetail as Detail, ActivityRow } from "@/lib/client/types";
import { aed, pct, fmtDate, fmtDateTime, num } from "@/lib/client/format";
import { Alert, Badge, Card, Field, Modal, PageHeader, PriorityBadge, Spinner, StatusBadge } from "@/components/ui";

const ACTIVITY_LABEL: Record<string, string> = {
  CREATED: "Enquiry registered", FIELD_CHANGE: "Details updated", STATUS_CHANGE: "Status changed", RATE_REVISION: "Rate revised", FOLLOW_UP: "Follow-up", NOTE: "Note",
  QUOTATION: "Quotation", APPROVAL_REQUESTED: "Approval requested", APPROVAL_DECIDED: "Approval decision", REASSIGNED: "Reassigned", ATTACHMENT_ADDED: "Document attached", ATTACHMENT_REMOVED: "Document removed", DELETED: "Deleted",
};
const FIELD_LABEL: Record<string, string> = {
  propertyId: "Property", source: "Source", enquiryType: "Enquiry type", priority: "Priority", companyName: "Company", contactPerson: "Contact", email: "E-mail", phone: "Phone", country: "Country", accountType: "Account type", clientRemarks: "Client remarks",
  arrivalDate: "Arrival", departureDate: "Departure", rooms: "Rooms", roomCategory: "Room category", guests: "Guests", mealPlan: "Meal plan", additionalRequirements: "Additional requirements", stayType: "Stay type", rateBasis: "Rate basis", taxInclusion: "Tax", probability: "Probability",
  lastFollowUpAt: "Last follow-up", nextFollowUpAt: "Next follow-up", followUpMethod: "Follow-up method", latestClientResponse: "Latest client response", nextAction: "Next action", salesNotes: "Notes", delayReason: "Delay reason",
};

export function EnquiryDetailView({ id, saved, currentRole }: { id: string; saved?: boolean; currentRole: string }) {
  const router = useRouter();
  const { data, error, loading, reload } = useFetch<Detail>(`/api/enquiries/${id}`);
  const [modal, setModal] = useState<null | "followup" | "quotation" | "note" | "reassign" | "approval" | "upload" | "delete">(null);
  const [tab, setTab] = useState<"timeline" | "rates" | "documents">("timeline");

  if (loading && !data) return <Spinner />;
  if (error || !data) return <Alert tone="danger">{error ?? "Enquiry not found."}</Alert>;
  const { enquiry: e, permissions: p, activities, rateRevisions, approvals, attachments } = data;
  const closed = ["Confirmed", "Lost", "Cancelled"].includes(e.status);
  const pending = approvals.filter((a) => a.status === "PENDING");

  return (
    <>
      <PageHeader
        title={`${e.enquiryRef} · ${e.companyName}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={e.status} /> <PriorityBadge priority={e.priority} /> {e.isDemo && <Badge tone="warning">Demo record</Badge>} <span>{e.propertyName}</span> · <span>Assigned to {e.ownerName}</span> · <span>Updated {fmtDateTime(e.updatedAt)}</span></span>}
        actions={
          p.canEdit && (
            <>
              <button className="btn-secondary" onClick={() => setModal("followup")}><PhoneCall className="h-4 w-4" /> Log follow-up</button>
              <button className="btn-secondary" onClick={() => setModal("quotation")}><FileText className="h-4 w-4" /> Quotation</button>
              <button className="btn-secondary" onClick={() => setModal("note")}><MessageSquare className="h-4 w-4" /> Note</button>
              <Link href={`/enquiries/${e.id}/edit`} className="btn-primary"><Pencil className="h-4 w-4" /> Edit</Link>
            </>
          )
        }
      />
      {saved && <div className="mb-4"><Alert tone="success">Enquiry saved. Changes are stored centrally and visible to authorised management reporting.</Alert></div>}
      {pending.length > 0 && (
        <div className="mb-4">
          <Alert tone="warning" title="Awaiting internal approval">
            {pending.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2">
                <span>{aed(a.requestedRate)} ({a.rateBasis}) · discount {pct(a.discountBps)} vs proposed · requested by {a.requestedByName} on {fmtDate(a.createdAt)}{a.reason ? ` · ${a.reason}` : ""}</span>
                {p.canDecideApprovals && <ApprovalButtons approvalId={a.id} onDone={reload} />}
              </div>
            ))}
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Commercial summary" pearl>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
              <Stat label="Rate basis" value={e.rateBasis} />
              <Stat label="Requested" value={aed(e.requestedRate)} />
              <Stat label="Initial proposed" value={aed(e.proposedRate)} />
              <Stat label="Revised" value={aed(e.revisedRate)} />
              <Stat label="Approved" value={aed(e.approvedRate)} tone={e.approvedRate !== null ? "success" : undefined} />
              <Stat label="Variance (req − prop)" value={aed(e.rateVariance)} />
              <Stat label="Discount vs proposed" value={pct(e.discountBps)} />
              <Stat label="Nightly equivalent" value={aed(e.nightlyEquivalentRate)} />
              <Stat label="Room nights" value={num(e.totalRoomNights)} />
              <Stat label="Potential revenue" value={aed(e.potentialRevenue)} strong />
              <Stat label="Probability" value={`${e.probability}%`} />
              <Stat label="Expected value" value={aed(e.expectedBookingValue)} strong />
              <Stat label="Tax" value={e.taxInclusion} />
            </div>
            {!closed && e.status !== "Awaiting Internal Approval" && p.canEdit && (
              <button className="btn-ghost mt-3 text-xs" onClick={() => setModal("approval")}><ShieldCheck className="h-4 w-4" /> Request rate approval</button>
            )}
          </Card>

          <Card title="Requirement">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
              <Stat label="Arrival" value={fmtDate(e.arrivalDate)} />
              <Stat label="Departure" value={fmtDate(e.departureDate)} />
              <Stat label="Nights" value={num(e.nights)} />
              <Stat label="Rooms" value={num(e.rooms)} />
              <Stat label="Room category" value={e.roomCategory ?? "—"} />
              <Stat label="Guests" value={num(e.guests)} />
              <Stat label="Meal plan" value={e.mealPlan ?? "—"} />
              <Stat label="Stay type" value={e.stayType} />
              <Stat label="Additional requirements" value={e.additionalRequirements ?? "—"} wide />
            </div>
          </Card>

          <Card title="Client">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
              <Stat label="Company" value={e.companyName} />
              <Stat label="Contact" value={e.contactPerson} />
              <Stat label="E-mail" value={e.email ?? "—"} />
              <Stat label="Phone" value={e.phone ?? "—"} />
              <Stat label="Country" value={e.country ?? "—"} />
              <Stat label="Account" value={e.accountType} />
              <Stat label="Source" value={e.source} />
              <Stat label="Type" value={e.enquiryType} />
              <Stat label="Client remarks" value={e.clientRemarks ?? "—"} wide />
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex gap-1 border-b border-line">
              {(["timeline", "rates", "documents"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t ? "border-plum-600 text-plum-700 font-medium" : "border-transparent text-muted"}`}>
                  {t === "timeline" ? `Activity timeline (${activities.length})` : t === "rates" ? `Rate history (${rateRevisions.length})` : `Documents (${attachments.length})`}
                </button>
              ))}
            </div>
            {tab === "timeline" && <Timeline items={activities} />}
            {tab === "rates" && (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>When</th><th>By</th><th>Field</th><th className="text-right">From</th><th className="text-right">To</th><th>Basis</th><th>Reason</th></tr></thead>
                  <tbody>
                    {rateRevisions.map((r) => (
                      <tr key={r.id}><td>{fmtDateTime(r.createdAt)}</td><td>{r.userName}</td><td>{({ requestedRate: "Requested", proposedRate: "Proposed", revisedRate: "Revised", approvedRate: "Approved" } as Record<string, string>)[r.field]}</td><td className="text-right tabular-nums">{aed(r.previousValue)}</td><td className="text-right tabular-nums font-medium">{aed(r.newValue)}</td><td>{r.rateBasis}</td><td className="whitespace-normal">{r.reason ?? "—"}</td></tr>
                    ))}
                    {!rateRevisions.length && <tr><td colSpan={7} className="text-center text-muted">No rate history yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "documents" && (
              <div className="space-y-2">
                {p.canEdit && <button className="btn-secondary" onClick={() => setModal("upload")}><Paperclip className="h-4 w-4" /> Attach quotation / document</button>}
                {attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                    <div><div className="font-medium text-plum-700">{a.fileName}</div><div className="text-xs text-muted">{a.kind} · {(a.sizeBytes / 1024).toFixed(0)} KB · {a.uploadedByName} · {fmtDateTime(a.createdAt)}</div></div>
                    <div className="flex gap-1">
                      <a className="btn-ghost p-1.5" href={`/api/attachments/${a.id}`} title="Download"><Download className="h-4 w-4" /></a>
                      {p.canEdit && <button className="btn-ghost p-1.5 text-danger" title="Remove" onClick={async () => { if (confirm("Remove this document?")) { await api(`/api/attachments/${a.id}`, { method: "DELETE" }); reload(); } }}><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </div>
                ))}
                {!attachments.length && <p className="text-sm text-muted">No documents attached.</p>}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Follow-up">
            <div className="space-y-2 text-sm">
              <Stat label="Last follow-up" value={fmtDate(e.lastFollowUpAt)} />
              <Stat label="Next follow-up" value={fmtDate(e.nextFollowUpAt)} />
              <Stat label="Method" value={e.followUpMethod ?? "—"} />
              <Stat label="Next action" value={e.nextAction ?? "—"} />
              <Stat label="Latest client response" value={e.latestClientResponse ?? "—"} />
              <Stat label="Reason for delay" value={e.delayReason ?? "—"} />
              <Stat label="Salesperson notes" value={e.salesNotes ?? "—"} />
              {e.lostReason && <Stat label="Lost reason" value={e.lostReason} tone="danger" />}
            </div>
          </Card>
          {(p.canReassign || p.canDelete) && (
            <Card title="Management actions">
              <div className="flex flex-col gap-2">
                {p.canReassign && <button className="btn-secondary" onClick={() => setModal("reassign")}><UserRoundCog className="h-4 w-4" /> Reassign salesperson</button>}
                {p.canDelete && <button className="btn-danger" onClick={() => setModal("delete")}><Trash2 className="h-4 w-4" /> Delete enquiry</button>}
              </div>
            </Card>
          )}
          <Card title="Record">
            <div className="space-y-2 text-xs text-muted">
              <div>Created {fmtDateTime(e.createdAt)}</div>
              <div>Last activity {fmtDateTime(e.lastActivityAt)}</div>
              <div>Version {e.version}</div>
              {e.confirmedAt && <div>Confirmed {fmtDateTime(e.confirmedAt)}</div>}
            </div>
          </Card>
        </div>
      </div>

      <FollowUpModal open={modal === "followup"} onClose={() => setModal(null)} enquiry={e} onDone={() => { setModal(null); reload(); }} />
      <QuotationModal open={modal === "quotation"} onClose={() => setModal(null)} enquiryId={e.id} rateBasis={e.rateBasis} onDone={() => { setModal(null); reload(); }} />
      <NoteModal open={modal === "note"} onClose={() => setModal(null)} enquiryId={e.id} onDone={() => { setModal(null); reload(); }} />
      <ReassignModal open={modal === "reassign"} onClose={() => setModal(null)} enquiryId={e.id} currentOwnerId={e.ownerId} onDone={() => { setModal(null); reload(); }} />
      <ApprovalRequestModal open={modal === "approval"} onClose={() => setModal(null)} enquiryId={e.id} proposed={e.proposedRate} rateBasis={e.rateBasis} onDone={() => { setModal(null); reload(); }} />
      <UploadModal open={modal === "upload"} onClose={() => setModal(null)} enquiryId={e.id} onDone={() => { setModal(null); setTab("documents"); reload(); }} />
      <DeleteModal open={modal === "delete"} onClose={() => setModal(null)} enquiryId={e.id} onDone={() => router.push(currentRole === "SALES_EXECUTIVE" ? "/enquiries" : "/management/enquiries")} />
    </>
  );
}

function Stat({ label, value, strong = false, wide = false, tone }: { label: string; value: React.ReactNode; strong?: boolean; wide?: boolean; tone?: "success" | "danger" }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3 lg:col-span-4" : ""}>
      <div className="label">{label}</div>
      <div className={`${strong ? "font-semibold text-plum-700" : ""} ${tone === "success" ? "text-success font-medium" : tone === "danger" ? "text-danger" : ""} whitespace-pre-wrap break-words`}>{value}</div>
    </div>
  );
}

function Timeline({ items }: { items: ActivityRow[] }) {
  if (!items.length) return <p className="text-sm text-muted">No activity yet.</p>;
  return (
    <ol className="relative border-l border-line pl-4 space-y-4">
      {items.map((a) => (
        <li key={a.id} className="text-sm">
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-plum-400" />
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted"><span className="font-medium text-plum-700">{ACTIVITY_LABEL[a.type] ?? a.type}</span><span>{fmtDateTime(a.createdAt)}</span><span>· {a.userName}</span>{a.followUpMethod && <span>· {a.followUpMethod}</span>}</div>
          {a.fromStatus && a.toStatus && <div className="mt-1 flex items-center gap-2"><StatusBadge status={a.fromStatus} /><span className="text-xs text-muted">→</span><StatusBadge status={a.toStatus} /></div>}
          {!a.fromStatus && a.toStatus && a.type === "CREATED" && <div className="mt-1"><StatusBadge status={a.toStatus} /></div>}
          {a.note && <div className="mt-1 whitespace-pre-wrap">{a.note}</div>}
          {a.clientFeedback && <div className="mt-1 text-xs"><span className="text-muted">Client feedback:</span> {a.clientFeedback}</div>}
          {a.nextAction && <div className="mt-1 text-xs"><span className="text-muted">Next action:</span> {a.nextAction}</div>}
          {a.type === "FIELD_CHANGE" && a.data && (
            <ul className="mt-1 text-xs text-muted space-y-0.5">
              {Object.entries(a.data as Record<string, { from: unknown; to: unknown }>).map(([k, v]) => (
                <li key={k}><span className="text-ink">{FIELD_LABEL[k] ?? k}</span>: {String(v.from ?? "—")} → <span className="text-ink">{String(v.to ?? "—")}</span></li>
              ))}
            </ul>
          )}
          {a.type === "QUOTATION" && a.data && (
            <div className="mt-1 text-xs text-muted">{(a.data as { reference?: string }).reference ? `Ref ${(a.data as { reference?: string }).reference} · ` : ""}{(a.data as { validUntil?: string }).validUntil ? `valid until ${fmtDate((a.data as { validUntil?: string }).validUntil)}` : ""}</div>
          )}
        </li>
      ))}
    </ol>
  );
}

function ApprovalButtons({ approvalId, onDone }: { approvalId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function decide(decision: "APPROVED" | "REJECTED") {
    const note = prompt(decision === "APPROVED" ? "Approval note (optional)" : "Reason for rejection") ?? "";
    if (decision === "REJECTED" && !note) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/approvals/${approvalId}`, { method: "PATCH", body: { decision, note: note || null } });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="flex items-center gap-2">
      <button className="btn-primary px-3 py-1 text-xs" disabled={busy} onClick={() => decide("APPROVED")}>Approve</button>
      <button className="btn-danger px-3 py-1 text-xs" disabled={busy} onClick={() => decide("REJECTED")}>Reject</button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}

function useSubmit(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    setFieldErrors({});
    try {
      await fn();
      onDone();
    } catch (e) {
      if (e instanceof ApiError) {
        setFieldErrors(e.fieldErrors());
        setErr(e.message);
      } else setErr("Request failed");
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, fieldErrors, run };
}

function FollowUpModal({ open, onClose, enquiry, onDone }: { open: boolean; onClose: () => void; enquiry: Detail["enquiry"]; onDone: () => void }) {
  const meta = useMeta();
  const [f, setF] = useState({ method: "Telephone", note: "", clientResponse: "", nextAction: "", nextFollowUpAt: "", newStatus: "", lostReason: "" });
  const { busy, err, fieldErrors, run } = useSubmit(onDone);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Modal open={open} onClose={onClose} title={`Log follow-up · ${enquiry.enquiryRef}`}>
      {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Method" required><select className="input" value={f.method} onChange={(e) => set("method", e.target.value)}>{(meta?.enums.FOLLOW_UP_METHODS ?? []).map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Update status to" hint="Optional"><select className="input" value={f.newStatus} onChange={(e) => set("newStatus", e.target.value)}><option value="">Keep “{enquiry.status}”</option>{(meta?.enums.ENQUIRY_STATUSES ?? []).filter((s) => s !== "Awaiting Internal Approval").map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="What was discussed" required error={fieldErrors.note} className="sm:col-span-2"><textarea className="input" rows={3} value={f.note} onChange={(e) => set("note", e.target.value)} /></Field>
        <Field label="Client response" className="sm:col-span-2"><input className="input" value={f.clientResponse} onChange={(e) => set("clientResponse", e.target.value)} /></Field>
        <Field label="Next action"><input className="input" value={f.nextAction} onChange={(e) => set("nextAction", e.target.value)} /></Field>
        <Field label="Next follow-up date" error={fieldErrors.nextFollowUpAt}><input className="input" type="date" value={f.nextFollowUpAt} onChange={(e) => set("nextFollowUpAt", e.target.value)} /></Field>
        {f.newStatus === "Lost" && <Field label="Lost business reason" required error={fieldErrors.lostReason} className="sm:col-span-2"><input className="input" value={f.lostReason} onChange={(e) => set("lostReason", e.target.value)} /></Field>}
      </div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => run(() => api(`/api/enquiries/${enquiry.id}/follow-ups`, { method: "POST", body: { ...f, newStatus: f.newStatus || null, nextFollowUpAt: f.nextFollowUpAt || null, clientResponse: f.clientResponse || null, nextAction: f.nextAction || null, lostReason: f.lostReason || null } }))}>{busy ? "Saving…" : "Save follow-up"}</button></div>
    </Modal>
  );
}

function QuotationModal({ open, onClose, enquiryId, rateBasis, onDone }: { open: boolean; onClose: () => void; enquiryId: string; rateBasis: string; onDone: () => void }) {
  const [f, setF] = useState({ quotedRate: "", reference: "", validUntil: "", note: "" });
  const { busy, err, run } = useSubmit(onDone);
  return (
    <Modal open={open} onClose={onClose} title="Record quotation sent">
      {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={`Quoted rate (AED, ${rateBasis})`} hint="Becomes the proposed rate (first quote) or revised rate"><input className="input" type="number" step="0.01" min={0} value={f.quotedRate} onChange={(e) => setF({ ...f, quotedRate: e.target.value })} /></Field>
        <Field label="Quotation reference"><input className="input" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Valid until"><input className="input" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></Field>
        <Field label="Note" className="sm:col-span-2"><textarea className="input" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <p className="mt-2 text-xs text-muted">Status moves to “Quotation Sent” (unless closed or awaiting approval). Attach the quotation file under Documents.</p>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => run(() => api(`/api/enquiries/${enquiryId}/quotations`, { method: "POST", body: { quotedRate: f.quotedRate === "" ? null : Number(f.quotedRate), reference: f.reference || null, validUntil: f.validUntil || null, note: f.note || null } }))}>{busy ? "Saving…" : "Record quotation"}</button></div>
    </Modal>
  );
}

function NoteModal({ open, onClose, enquiryId, onDone }: { open: boolean; onClose: () => void; enquiryId: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const { busy, err, run } = useSubmit(onDone);
  return (
    <Modal open={open} onClose={onClose} title="Add internal note">
      {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
      <textarea className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (visible to management)" />
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !note.trim()} onClick={() => run(() => api(`/api/enquiries/${enquiryId}/notes`, { method: "POST", body: { note } }))}>Save note</button></div>
    </Modal>
  );
}

function ReassignModal({ open, onClose, enquiryId, currentOwnerId, onDone }: { open: boolean; onClose: () => void; enquiryId: string; currentOwnerId: string; onDone: () => void }) {
  const meta = useMeta();
  const [ownerId, setOwnerId] = useState("");
  const [note, setNote] = useState("");
  const { busy, err, run } = useSubmit(onDone);
  return (
    <Modal open={open} onClose={onClose} title="Reassign enquiry">
      {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
      <Field label="New salesperson" required><select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}><option value="">Select…</option>{(meta?.users ?? []).filter((u) => u.id !== currentOwnerId).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <div className="mt-3"><Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !ownerId} onClick={() => run(() => api(`/api/enquiries/${enquiryId}/reassign`, { method: "POST", body: { ownerId, note: note || null } }))}>Reassign</button></div>
    </Modal>
  );
}

function ApprovalRequestModal({ open, onClose, enquiryId, proposed, rateBasis, onDone }: { open: boolean; onClose: () => void; enquiryId: string; proposed: number | null; rateBasis: string; onDone: () => void }) {
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const { busy, err, fieldErrors, run } = useSubmit(onDone);
  const disc = proposed && rate ? ((proposed / 100 - Number(rate)) / (proposed / 100)) * 100 : null;
  return (
    <Modal open={open} onClose={onClose} title="Request rate approval">
      {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
      <Field label={`Rate requiring approval (AED, ${rateBasis})`} required error={fieldErrors.requestedRate} hint={disc !== null ? `Discount ${disc.toFixed(1)}% vs initial proposed ${aed(proposed)}` : undefined}><input className="input" type="number" step="0.01" min={0} value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
      <div className="mt-3"><Field label="Business justification" required error={fieldErrors.reason}><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} onClick={() => run(() => api(`/api/enquiries/${enquiryId}/approvals`, { method: "POST", body: { requestedRate: Number(rate), reason } }))}>Submit for approval</button></div>
    </Modal>
  );
}

function UploadModal({ open, onClose, enquiryId, onDone }: { open: boolean; onClose: () => void; enquiryId: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("Quotation");
  const { busy, err, run } = useSubmit(onDone);
  return (
    <Modal open={open} onClose={onClose} title="Attach document">
      {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
      <Field label="Document type"><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}><option>Quotation</option><option>Contract</option><option>Supporting Document</option></select></Field>
      <div className="mt-3"><Field label="File" hint="PDF, Word, Excel, PNG, JPEG or TXT · max 5 MB"><input className="input" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field></div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !file} onClick={() => run(async () => { const form = new FormData(); form.append("file", file!); form.append("kind", kind); await api(`/api/enquiries/${enquiryId}/attachments`, { method: "POST", form }); })}>{busy ? "Uploading…" : "Upload"}</button></div>
    </Modal>
  );
}

function DeleteModal({ open, onClose, enquiryId, onDone }: { open: boolean; onClose: () => void; enquiryId: string; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const { busy, err, run } = useSubmit(onDone);
  return (
    <Modal open={open} onClose={onClose} title="Delete enquiry">
      {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
      <p className="text-sm">The record is soft-deleted: it disappears from workspaces and reporting but its history and audit trail are preserved.</p>
      <div className="mt-3"><Field label="Reason" required><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
      <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-danger" disabled={busy || !reason.trim()} onClick={() => run(() => api(`/api/enquiries/${enquiryId}`, { method: "DELETE", body: { reason } }))}>Delete</button></div>
    </Modal>
  );
}
