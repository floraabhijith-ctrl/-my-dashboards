/**
 * Proves that one salesperson cannot reach another salesperson's private leads
 * through direct URLs, modified requests, exports, API calls or attachments,
 * and that role boundaries are enforced on the server.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { freshDb, sampleInput, req, params, type Fixture } from "./helpers";
import { createEnquiry } from "@/lib/enquiries/service";
import { addAttachment } from "@/lib/enquiries/attachments";
import { GET as getEnquiry, PATCH as patchEnquiry, DELETE as deleteEnquiry } from "@/app/api/enquiries/[id]/route";
import { GET as listEnquiries, POST as postEnquiry } from "@/app/api/enquiries/route";
import { GET as exportEnquiries } from "@/app/api/exports/enquiries/route";
import { GET as getAttachment, DELETE as deleteAttachment } from "@/app/api/attachments/[id]/route";
import { POST as postAttachment } from "@/app/api/enquiries/[id]/attachments/route";
import { POST as postFollowUp } from "@/app/api/enquiries/[id]/follow-ups/route";
import { POST as postReassign } from "@/app/api/enquiries/[id]/reassign/route";
import { GET as dashboard } from "@/app/api/analytics/dashboard/route";
import { GET as adminUsers, POST as createUserRoute } from "@/app/api/admin/users/route";
import { PATCH as patchSettings } from "@/app/api/admin/settings/route";
import { GET as cronAlerts } from "@/app/api/cron/alerts/route";
import { POST as duplicates } from "@/app/api/enquiries/duplicates/route";
import { GET as listApprovals } from "@/app/api/approvals/route";
import { PATCH as decideApproval } from "@/app/api/approvals/[id]/route";

let f: Fixture;
let ayeshaEnquiryId: string;
let lenaEnquiryId: string;
let lenaAttachmentId: string;

beforeAll(async () => {
  f = await freshDb();
  ayeshaEnquiryId = (await createEnquiry(f.ayesha, sampleInput(f.props.FCH, { companyName: "Ayesha Private Co" }))).enquiry.id;
  lenaEnquiryId = (await createEnquiry(f.lena, sampleInput(f.props.FIH, { companyName: "Lena Private Co" }))).enquiry.id;
  lenaAttachmentId = (await addAttachment(f.lena, lenaEnquiryId, { name: "quote.pdf", type: "application/pdf", bytes: Buffer.from("%PDF-1.4 secret") })).id;
});

describe("authentication", () => {
  it("rejects unauthenticated API calls", async () => {
    expect((await listEnquiries(req("/api/enquiries", null))).status).toBe(401);
    expect((await getEnquiry(req(`/api/enquiries/${lenaEnquiryId}`, null), params({ id: lenaEnquiryId }))).status).toBe(401);
    expect((await getAttachment(req(`/api/attachments/${lenaAttachmentId}`, null), params({ id: lenaAttachmentId }))).status).toBe(401);
  });

  it("rejects forged or expired session tokens", async () => {
    expect((await listEnquiries(req("/api/enquiries", "not-a-real-token"))).status).toBe(401);
  });
});

describe("salesperson isolation", () => {
  it("list endpoint only returns the caller's own enquiries", async () => {
    const res = await listEnquiries(req("/api/enquiries", f.tokens.ayesha));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.items.map((e: { id: string }) => e.id)).toEqual([ayeshaEnquiryId]);
  });

  it("direct URL to another salesperson's enquiry returns 404 (no existence leak)", async () => {
    const res = await getEnquiry(req(`/api/enquiries/${lenaEnquiryId}`, f.tokens.ayesha), params({ id: lenaEnquiryId }));
    expect(res.status).toBe(404);
  });

  it("filters cannot widen scope (ownerId / propertyId parameters are ignored for scoping)", async () => {
    const res = await listEnquiries(req(`/api/enquiries?ownerId=${f.lena.id}&propertyId=${f.props.FIH}`, f.tokens.ayesha));
    const body = await res.json();
    expect(body.items).toHaveLength(0);
  });

  it("search cannot surface another salesperson's company", async () => {
    const res = await listEnquiries(req(`/api/enquiries?q=Lena%20Private`, f.tokens.ayesha));
    expect((await res.json()).items).toHaveLength(0);
  });

  it("modified PATCH request against another salesperson's enquiry is refused", async () => {
    const res = await patchEnquiry(req(`/api/enquiries/${lenaEnquiryId}`, f.tokens.ayesha, { method: "PATCH", body: sampleInput(f.props.FIH, { companyName: "Hijacked" }) }), params({ id: lenaEnquiryId }));
    expect(res.status).toBe(404);
  });

  it("follow-up cannot be posted on another salesperson's enquiry", async () => {
    const res = await postFollowUp(req(`/api/enquiries/${lenaEnquiryId}/follow-ups`, f.tokens.ayesha, { method: "POST", body: { method: "Email", note: "sneaky" } }), params({ id: lenaEnquiryId }));
    expect(res.status).toBe(404);
  });

  it("attachments of another salesperson cannot be downloaded, uploaded to, or deleted", async () => {
    expect((await getAttachment(req(`/api/attachments/${lenaAttachmentId}`, f.tokens.ayesha), params({ id: lenaAttachmentId }))).status).toBe(404);
    expect((await deleteAttachment(req(`/api/attachments/${lenaAttachmentId}`, f.tokens.ayesha, { method: "DELETE" }), params({ id: lenaAttachmentId }))).status).toBe(404);
    const form = new FormData();
    form.append("file", new File([Buffer.from("x")], "x.pdf", { type: "application/pdf" }));
    expect((await postAttachment(req(`/api/enquiries/${lenaEnquiryId}/attachments`, f.tokens.ayesha, { method: "POST", form }), params({ id: lenaEnquiryId }))).status).toBe(404);
    // Owner can download
    const ok = await getAttachment(req(`/api/attachments/${lenaAttachmentId}`, f.tokens.lena), params({ id: lenaAttachmentId }));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("%PDF");
  });

  it("duplicate check only searches the caller's own scope", async () => {
    const res = await duplicates(req("/api/enquiries/duplicates", f.tokens.ayesha, { method: "POST", body: { companyName: "Lena Private", propertyId: f.props.FIH, arrivalDate: sampleInput(f.props.FIH).arrivalDate } }));
    expect((await res.json()).duplicates).toHaveLength(0);
  });

  it("salesperson cannot assign an enquiry to someone else on creation", async () => {
    const res = await postEnquiry(req("/api/enquiries", f.tokens.ayesha, { method: "POST", body: { ...sampleInput(f.props.FCH), ownerId: f.lena.id } }));
    expect(res.status).toBe(403);
  });

  it("salesperson cannot reassign, export, or delete", async () => {
    expect((await postReassign(req(`/api/enquiries/${ayeshaEnquiryId}/reassign`, f.tokens.ayesha, { method: "POST", body: { ownerId: f.ravi.id } }), params({ id: ayeshaEnquiryId }))).status).toBe(403);
    expect((await exportEnquiries(req("/api/exports/enquiries", f.tokens.ayesha))).status).toBe(403);
    expect((await deleteEnquiry(req(`/api/enquiries/${ayeshaEnquiryId}`, f.tokens.ayesha, { method: "DELETE" }), params({ id: ayeshaEnquiryId }))).status).toBe(403);
  });

  it("salesperson cannot change the assigned owner through the update payload", async () => {
    const detail = await (await getEnquiry(req(`/api/enquiries/${ayeshaEnquiryId}`, f.tokens.ayesha), params({ id: ayeshaEnquiryId }))).json();
    const res = await patchEnquiry(req(`/api/enquiries/${ayeshaEnquiryId}`, f.tokens.ayesha, { method: "PATCH", body: { ...sampleInput(f.props.FCH), ownerId: f.ravi.id, version: detail.enquiry.version } }), params({ id: ayeshaEnquiryId }));
    expect(res.status).toBe(403);
  });

  it("dashboard analytics are scoped to the caller", async () => {
    const res = await dashboard(req("/api/analytics/dashboard", f.tokens.ayesha));
    const body = await res.json();
    expect(body.kpis.totalEnquiries).toBe(1);
    expect(body.salespeople.map((s: { ownerId: string }) => s.ownerId)).toEqual([f.ayesha.id]);
  });
});

describe("manager scope", () => {
  it("manager sees team + assigned property enquiries but not other teams", async () => {
    const res = await listEnquiries(req("/api/enquiries", f.tokens.mc));
    const ids = (await res.json()).items.map((e: { id: string }) => e.id);
    expect(ids).toContain(ayeshaEnquiryId);
    expect(ids).not.toContain(lenaEnquiryId);
    expect((await getEnquiry(req(`/api/enquiries/${lenaEnquiryId}`, f.tokens.mc), params({ id: lenaEnquiryId }))).status).toBe(404);
  });

  it("manager can reassign within their team only", async () => {
    const ok = await postReassign(req(`/api/enquiries/${ayeshaEnquiryId}/reassign`, f.tokens.mc, { method: "POST", body: { ownerId: f.ravi.id } }), params({ id: ayeshaEnquiryId }));
    expect(ok.status).toBe(200);
    const bad = await postReassign(req(`/api/enquiries/${ayeshaEnquiryId}/reassign`, f.tokens.mc, { method: "POST", body: { ownerId: f.lena.id } }), params({ id: ayeshaEnquiryId }));
    expect(bad.status).toBe(403);
    // Ayesha no longer sees it, Ravi does
    expect((await getEnquiry(req(`/api/enquiries/${ayeshaEnquiryId}`, f.tokens.ayesha), params({ id: ayeshaEnquiryId }))).status).toBe(404);
    expect((await getEnquiry(req(`/api/enquiries/${ayeshaEnquiryId}`, f.tokens.ravi), params({ id: ayeshaEnquiryId }))).status).toBe(200);
  });

  it("export is limited to the manager's scope", async () => {
    const res = await exportEnquiries(req("/api/exports/enquiries", f.tokens.mc));
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("Ayesha Private Co");
    expect(csv).not.toContain("Lena Private Co");
  });

  it("manager cannot access administration endpoints", async () => {
    expect((await createUserRoute(req("/api/admin/users", f.tokens.mc, { method: "POST", body: { email: "x@test", name: "X Y", role: "ADMIN" } }))).status).toBe(403);
    expect((await patchSettings(req("/api/admin/settings", f.tokens.mc, { method: "PATCH", body: { approvalDiscountThresholdPct: 0 } }))).status).toBe(403);
    expect((await adminUsers(req("/api/admin/users", f.tokens.ayesha))).status).toBe(403);
  });

  it("manager cannot approve beyond their authority limit", async () => {
    // Ravi (team of Manager Creek, limit 15%) creates an enquiry with 20% discount -> auto approval request
    const { enquiry } = await createEnquiry(f.ravi, sampleInput(f.props.FCH, { companyName: "Big Discount Co", proposedRate: 500, revisedRate: 400 }));
    expect(enquiry.status).toBe("Awaiting Internal Approval");
    const list = await (await listApprovals(req("/api/approvals?status=PENDING", f.tokens.mc))).json();
    const pending = list.approvals.find((a: { enquiryId: string }) => a.enquiryId === enquiry.id);
    expect(pending.canDecide).toBe(false);
    const res = await decideApproval(req(`/api/approvals/${pending.id}`, f.tokens.mc, { method: "PATCH", body: { decision: "APPROVED" } }), params({ id: pending.id }));
    expect(res.status).toBe(403);
    // Other team's manager cannot even see it
    const other = await (await listApprovals(req("/api/approvals?status=PENDING", f.tokens.mi))).json();
    expect(other.approvals.find((a: { id: string }) => a.id === pending.id)).toBeUndefined();
    // Admin can
    const ok = await decideApproval(req(`/api/approvals/${pending.id}`, f.tokens.admin, { method: "PATCH", body: { decision: "APPROVED", note: "Strategic account" } }), params({ id: pending.id }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).enquiry.approvedRate).toBe(40000);
  });
});

describe("cron and admin endpoints", () => {
  it("cron endpoints require the shared secret", async () => {
    expect((await cronAlerts(req("/api/cron/alerts", null))).status).toBe(401);
    const ok = await cronAlerts(new Request("http://localhost/api/cron/alerts", { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(ok.status).toBe(200);
  });

  it("admin sees everything", async () => {
    const res = await listEnquiries(req("/api/enquiries", f.tokens.admin));
    const ids = (await res.json()).items.map((e: { id: string }) => e.id);
    expect(ids).toContain(ayeshaEnquiryId);
    expect(ids).toContain(lenaEnquiryId);
  });
});
