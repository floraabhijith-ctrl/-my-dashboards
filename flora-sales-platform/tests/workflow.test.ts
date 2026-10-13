/**
 * Functional workflow: register -> reopen -> update rate / follow-up -> management visibility,
 * with history preserved, concurrency protection and duplicate prevention.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { freshDb, sampleInput, req, params, type Fixture } from "./helpers";
import { POST as postEnquiry, GET as listEnquiries } from "@/app/api/enquiries/route";
import { GET as getEnquiry, PATCH as patchEnquiry } from "@/app/api/enquiries/[id]/route";
import { POST as postFollowUp } from "@/app/api/enquiries/[id]/follow-ups/route";
import { POST as postQuotation } from "@/app/api/enquiries/[id]/quotations/route";
import { GET as dashboard } from "@/app/api/analytics/dashboard/route";
import { GET as notifications } from "@/app/api/notifications/route";
import { runAlertSweep } from "@/lib/notifications/alerts";
import { addDaysToDateOnly, todayInTz } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { enquiries, syncOutbox } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { enqueueSync } from "@/lib/sync/outbox";

let f: Fixture;

beforeAll(async () => {
  f = await freshDb();
});

describe("enquiry lifecycle", () => {
  let id: string;
  let version: number;

  it("salesperson registers an enquiry with a generated reference and calculated fields", async () => {
    const res = await postEnquiry(req("/api/enquiries", f.tokens.ayesha, { method: "POST", body: { ...sampleInput(f.props.FCH), idempotencyKey: "k-1" } }));
    expect(res.status).toBe(201);
    const { enquiry } = await res.json();
    id = enquiry.id;
    version = enquiry.version;
    expect(enquiry.enquiryRef).toMatch(/^FH-FCH-\d{4}-0001$/);
    expect(enquiry.nights).toBe(5);
    expect(enquiry.totalRoomNights).toBe(20);
    expect(enquiry.potentialRevenue).toBe(500 * 4 * 5 * 100);
    expect(enquiry.expectedBookingValue).toBe(enquiry.potentialRevenue / 2);
    expect(enquiry.stayType).toBe("Short Stay");
    expect(enquiry.ownerId).toBe(f.ayesha.id);
  });

  it("re-submitting with the same idempotency key does not create a duplicate", async () => {
    const res = await postEnquiry(req("/api/enquiries", f.tokens.ayesha, { method: "POST", body: { ...sampleInput(f.props.FCH), idempotencyKey: "k-1" } }));
    expect(res.status).toBe(200);
    expect((await res.json()).replayed).toBe(true);
    const list = await (await listEnquiries(req("/api/enquiries", f.tokens.ayesha))).json();
    expect(list.total).toBe(1);
  });

  it("validation rejects bad input with helpful messages", async () => {
    const res = await postEnquiry(req("/api/enquiries", f.tokens.ayesha, { method: "POST", body: { ...sampleInput(f.props.FCH), departureDate: sampleInput(f.props.FCH).arrivalDate, companyName: "" } }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.details.some((d: { path: string }) => d.path === "departureDate")).toBe(true);
    expect(body.details.some((d: { path: string }) => d.path === "companyName")).toBe(true);
  });

  it("closing as Lost requires a reason", async () => {
    const res = await patchEnquiry(req(`/api/enquiries/${id}`, f.tokens.ayesha, { method: "PATCH", body: { ...sampleInput(f.props.FCH), status: "Lost", version } }), params({ id }));
    expect(res.status).toBe(422);
  });

  it("reopening and revising the rate preserves history and bumps the version", async () => {
    const res = await patchEnquiry(req(`/api/enquiries/${id}`, f.tokens.ayesha, { method: "PATCH", body: { ...sampleInput(f.props.FCH), revisedRate: 460, status: "Negotiation", rateChangeReason: "Volume discount", version } }), params({ id }));
    expect(res.status).toBe(200);
    const { enquiry } = await res.json();
    expect(enquiry.version).toBe(version + 1);
    expect(enquiry.revisedRate).toBe(46000);
    expect(enquiry.discountBps).toBe(800);
    expect(enquiry.potentialRevenue).toBe(460 * 20 * 100);
    version = enquiry.version;
    const detail = await (await getEnquiry(req(`/api/enquiries/${id}`, f.tokens.ayesha), params({ id }))).json();
    expect(detail.rateRevisions.map((r: { field: string; newValue: number }) => [r.field, r.newValue])).toEqual([
      ["requestedRate", 40000],
      ["proposedRate", 50000],
      ["revisedRate", 46000],
    ]);
    expect(detail.activities.some((a: { type: string }) => a.type === "STATUS_CHANGE")).toBe(true);
    expect(detail.activities.some((a: { type: string }) => a.type === "RATE_REVISION")).toBe(true);
  });

  it("stale version is rejected (safe concurrent editing)", async () => {
    const res = await patchEnquiry(req(`/api/enquiries/${id}`, f.tokens.ayesha, { method: "PATCH", body: { ...sampleInput(f.props.FCH), version: version - 1 } }), params({ id }));
    expect(res.status).toBe(409);
  });

  it("follow-up entries update next follow-up and create timeline rows", async () => {
    const next = addDaysToDateOnly(todayInTz(), 3);
    const res = await postFollowUp(req(`/api/enquiries/${id}/follow-ups`, f.tokens.ayesha, { method: "POST", body: { method: "Telephone", note: "Spoke to client", clientResponse: "Considering", nextAction: "Call Thursday", nextFollowUpAt: next, newStatus: "Awaiting Client" } }), params({ id }));
    expect(res.status).toBe(201);
    const { enquiry } = await res.json();
    expect(enquiry.status).toBe("Awaiting Client");
    expect(enquiry.nextFollowUpAt).toBe(next);
    expect(enquiry.lastFollowUpAt).toBe(todayInTz());
    const detail = await (await getEnquiry(req(`/api/enquiries/${id}`, f.tokens.ayesha), params({ id }))).json();
    expect(detail.activities.filter((a: { type: string }) => a.type === "FOLLOW_UP")).toHaveLength(1);
  });

  it("quotation records the hotel's offer as a revision", async () => {
    const res = await postQuotation(req(`/api/enquiries/${id}/quotations`, f.tokens.ayesha, { method: "POST", body: { quotedRate: 455, reference: "Q-1" } }), params({ id }));
    expect(res.status).toBe(201);
    const detail = await (await getEnquiry(req(`/api/enquiries/${id}`, f.tokens.ayesha), params({ id }))).json();
    expect(detail.enquiry.revisedRate).toBe(45500);
    expect(detail.activities.some((a: { type: string }) => a.type === "QUOTATION")).toBe(true);
  });

  it("management dashboard reflects the salesperson's change without any import", async () => {
    const res = await dashboard(req("/api/analytics/dashboard", f.tokens.admin));
    const body = await res.json();
    expect(body.kpis.totalEnquiries).toBe(1);
    expect(body.kpis.pipelineRevenue).toBe(455 * 20 * 100);
    expect(body.byProperty[0].propertyCode).toBe("FCH");
    expect(body.outlook[0].pipelineRoomNights).toBe(20);
    expect(body.salespeople[0].ownerId).toBe(f.ayesha.id);
    const mgr = await (await dashboard(req("/api/analytics/dashboard", f.tokens.mc))).json();
    expect(mgr.kpis.totalEnquiries).toBe(1);
  });

  it("confirming records revenue as confirmed and notifies management once", async () => {
    const detail = await (await getEnquiry(req(`/api/enquiries/${id}`, f.tokens.ayesha), params({ id }))).json();
    const res = await patchEnquiry(req(`/api/enquiries/${id}`, f.tokens.ayesha, { method: "PATCH", body: { ...sampleInput(f.props.FCH), revisedRate: 455, status: "Confirmed", probability: 100, version: detail.enquiry.version } }), params({ id }));
    expect(res.status).toBe(200);
    const body = await (await dashboard(req("/api/analytics/dashboard", f.tokens.admin))).json();
    expect(body.kpis.confirmed).toBe(1);
    expect(body.kpis.confirmedRevenue).toBe(455 * 20 * 100);
    expect(body.kpis.pipelineRevenue).toBe(0);
    const n = await (await notifications(req("/api/notifications", f.tokens.mc))).json();
    expect(n.notifications.filter((x: { type: string }) => x.type === "BOOKING_CONFIRMED")).toHaveLength(1);
  });
});

describe("alerts", () => {
  it("overdue reminders are generated once per day per recipient", async () => {
    const past = addDaysToDateOnly(todayInTz(), -2);
    const res = await postEnquiry(req("/api/enquiries", f.tokens.lena, { method: "POST", body: { ...sampleInput(f.props.FIH, { nextFollowUpAt: past }) } }));
    expect(res.status).toBe(201);
    const first = await runAlertSweep();
    expect(first.followUpOverdue).toBeGreaterThanOrEqual(1);
    const second = await runAlertSweep();
    expect(second.followUpOverdue).toBe(0);
    const n = await (await notifications(req("/api/notifications", f.tokens.lena))).json();
    expect(n.notifications.filter((x: { type: string }) => x.type === "FOLLOW_UP_OVERDUE")).toHaveLength(1);
  });

  it("demo-flagged records never trigger alerts", async () => {
    const db = getDb();
    const past = addDaysToDateOnly(todayInTz(), -10);
    const res = await postEnquiry(req("/api/enquiries", f.tokens.lena, { method: "POST", body: { ...sampleInput(f.props.FIH, { companyName: "Demo Co", nextFollowUpAt: past }) } }));
    const { enquiry } = await res.json();
    await db.update(enquiries).set({ isDemo: true }).where(eq(enquiries.id, enquiry.id));
    await runAlertSweep();
    const n = await (await notifications(req("/api/notifications", f.tokens.lena))).json();
    expect(n.notifications.some((x: { enquiryId: string }) => x.enquiryId === enquiry.id)).toBe(false);
  });
});

describe("sync outbox", () => {
  it("records mirror writes only when a provider is configured", async () => {
    const db = getDb();
    await enqueueSync("enquiry", "x", "upsert", { a: 1 });
    expect((await db.select().from(syncOutbox)).length).toBe(0);
    process.env.SYNC_PROVIDER = "google-sheets";
    await enqueueSync("enquiry", "x", "upsert", { a: 1 });
    process.env.SYNC_PROVIDER = "none";
    expect((await db.select().from(syncOutbox)).length).toBe(1);
  });
});
