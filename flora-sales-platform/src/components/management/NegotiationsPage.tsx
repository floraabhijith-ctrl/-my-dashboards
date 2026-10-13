"use client";
import { useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/client/api";
import { useFetch } from "@/lib/client/hooks";
import type { ApprovalRow, EnquiryRow } from "@/lib/client/types";
import { aed, pct, fmtDateTime } from "@/lib/client/format";
import { Alert, Card, Empty, Kpi, Modal, Field, StatusBadge } from "@/components/ui";
import { DashboardFrame } from "./useDashboard";
import { SlimTable } from "./SlimTable";

type PendingApproval = ApprovalRow & { enquiry: EnquiryRow & { propertyName: string; ownerName: string } };

export function NegotiationsPage() {
  const { data: approvals, reload } = useFetch<{ approvals: PendingApproval[] }>("/api/approvals?status=PENDING");
  const [decide, setDecide] = useState<{ a: PendingApproval; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!decide) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/approvals/${decide.a.id}`, { method: "PATCH", body: { decision: decide.decision, note: note || null } });
      setDecide(null);
      setNote("");
      reload();
      window.location.reload();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card title={`Pending rate approvals (${approvals?.approvals.length ?? 0})`} className="mb-4">
        {!approvals ? null : approvals.approvals.length === 0 ? <Empty title="No approvals pending." /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Enquiry</th><th>Company</th><th>Property</th><th>Salesperson</th><th className="text-right">Proposed</th><th className="text-right">Requested</th><th className="text-right">Discount</th><th>Basis</th><th>Reason</th><th>Requested by</th><th>Action</th></tr></thead>
              <tbody>
                {approvals.approvals.map((a) => (
                  <tr key={a.id}>
                    <td><Link className="font-medium text-plum-600 hover:underline" href={`/enquiries/${a.enquiryId}`}>{a.enquiry.enquiryRef}</Link></td>
                    <td>{a.enquiry.companyName}</td><td>{a.enquiry.propertyName}</td><td>{a.enquiry.ownerName}</td>
                    <td className="text-right tabular-nums">{aed(a.referenceRate)}</td><td className="text-right tabular-nums font-medium">{aed(a.requestedRate)}</td><td className="text-right tabular-nums text-danger">{pct(a.discountBps)}</td><td>{a.rateBasis}</td>
                    <td className="max-w-[220px] whitespace-normal text-xs">{a.reason}</td><td className="text-xs">{a.requestedByName}<br /><span className="text-muted">{fmtDateTime(a.createdAt)}</span></td>
                    <td>{a.canDecide ? <div className="flex gap-1"><button className="btn-primary px-2 py-1 text-xs" onClick={() => setDecide({ a, decision: "APPROVED" })}>Approve</button><button className="btn-danger px-2 py-1 text-xs" onClick={() => setDecide({ a, decision: "REJECTED" })}>Reject</button></div> : <span className="text-xs text-muted">Exceeds your authority</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <DashboardFrame title="Negotiation Tracker" subtitle="Requested vs proposed vs revised vs approved rates, discount depth and the cases that need management intervention.">
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="Avg requested (nightly eq.)" value={aed(d.negotiation.averages.requested)} />
              <Kpi label="Avg proposed" value={aed(d.negotiation.averages.proposed)} />
              <Kpi label="Avg revised" value={aed(d.negotiation.averages.revised)} />
              <Kpi label="Avg approved" value={aed(d.negotiation.averages.approved)} />
              <Kpi label="Avg discount vs proposed" value={pct(d.negotiation.averages.discountBps)} />
              <Kpi label="Awaiting approval" value={d.negotiation.pendingApprovalCases} tone={d.negotiation.pendingApprovalCases ? "warning" : "default"} />
            </div>
            <Card title="Requires management intervention" >
              <p className="mb-3 text-xs text-muted">Active enquiries discounted beyond the approval threshold, awaiting internal approval, or above the high-value threshold.</p>
              <SlimTable rows={d.negotiation.attention} cols={["ref", "company", "property", "owner", "status", "requested", "proposed", "revised", "approved", "discount", "potential", "lastActivity"]} empty="No cases need intervention." />
            </Card>
            <Card title="All negotiations in scope">
              <SlimTable rows={d.negotiation.rows} cols={["ref", "company", "property", "owner", "status", "rooms", "nights", "requested", "proposed", "revised", "approved", "variance", "discount", "nightly", "potential"]} />
            </Card>
          </>
        )}
      </DashboardFrame>
      <Modal open={Boolean(decide)} onClose={() => setDecide(null)} title={decide?.decision === "APPROVED" ? "Approve rate" : "Reject rate"}>
        {decide && (
          <>
            {err && <div className="mb-3"><Alert tone="danger">{err}</Alert></div>}
            <p className="text-sm">{decide.a.enquiry.enquiryRef} · {decide.a.enquiry.companyName} · <StatusBadge status={decide.a.enquiry.status} /></p>
            <p className="mt-1 text-sm">Requested <strong>{aed(decide.a.requestedRate)}</strong> ({decide.a.rateBasis}), discount <strong>{pct(decide.a.discountBps)}</strong> vs proposed {aed(decide.a.referenceRate)}.</p>
            <div className="mt-3"><Field label={decide.decision === "APPROVED" ? "Approval note (optional)" : "Reason for rejection"} required={decide.decision === "REJECTED"}><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field></div>
            <div className="mt-4 flex justify-end gap-2"><button className="btn-secondary" onClick={() => setDecide(null)}>Cancel</button><button className={decide.decision === "APPROVED" ? "btn-primary" : "btn-danger"} disabled={busy || (decide.decision === "REJECTED" && !note.trim())} onClick={submit}>{busy ? "Saving…" : decide.decision === "APPROVED" ? "Approve" : "Reject"}</button></div>
          </>
        )}
      </Modal>
    </>
  );
}
