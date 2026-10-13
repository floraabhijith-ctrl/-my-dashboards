/**
 * Enquiry domain service. All reads/writes are authorised here, calculations are
 * deterministic (see commercial.ts), every change produces activity history,
 * rate revisions, audit entries and a sync-outbox record.
 */
import { and, asc, desc, eq, gte, inArray, like, lte, ne, or, sql, isNotNull, type SQL } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  enquiries,
  activities,
  rateRevisions,
  rateApprovals,
  enquiryCounters,
  properties,
  users,
  attachments,
  CLOSED_STATUSES,
  RATE_FIELDS,
  type Enquiry,
  type EnquiryStatus,
  type RateField,
} from "../db/schema";
import { newId } from "../ids";
import { nowIso, nightsBetween, todayInTz, addDaysToDateOnly } from "../dates";
import { computeCommercials, classifyStay, toFils, rateBand, stayDurationBand, type RateBasis } from "../commercial";
import { getSettings } from "../settings";
import { writeAudit } from "../audit";
import { enqueueSync } from "../sync/outbox";
import { notify } from "../notifications/service";
import {
  AuthzError,
  canAssignOwner,
  canDeleteEnquiry,
  canEditEnquiry,
  canReassign,
  canViewEnquiry,
  canViewPropertyScope,
  visibleEnquiriesWhere,
  isManagement,
} from "../authz";
import type { CurrentUser } from "../auth/session";
import type { EnquiryInput, FollowUpInput, ListFilters } from "../validation/enquiry";
import { HttpError } from "../http";

export interface EnquiryWithRefs extends Enquiry {
  propertyName: string;
  propertyCode: string;
  ownerName: string;
}

const baseSelect = {
  propertyName: properties.name,
  propertyCode: properties.code,
  ownerName: users.name,
};

// ---------------------------------------------------------------------------
// Reference generation
// ---------------------------------------------------------------------------
async function nextEnquiryRef(propertyCode: string): Promise<string> {
  const db = getDb();
  const year = todayInTz().slice(0, 4);
  const key = `${propertyCode}-${year}`;
  // Atomic increment via upsert; libSQL serialises writes so the read-back is consistent.
  await db
    .insert(enquiryCounters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: enquiryCounters.key, set: { value: sql`${enquiryCounters.value} + 1` } });
  const row = await db.query.enquiryCounters.findFirst({ where: eq(enquiryCounters.key, key) });
  return `FH-${propertyCode}-${year}-${String(row!.value).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// Snapshot for sync + audit
// ---------------------------------------------------------------------------
export function enquirySnapshot(e: EnquiryWithRefs) {
  const { ...rest } = e;
  return rest;
}

async function loadWithRefs(id: string): Promise<EnquiryWithRefs | null> {
  const db = getDb();
  const rows = await db
    .select({ e: enquiries, ...baseSelect })
    .from(enquiries)
    .innerJoin(properties, eq(enquiries.propertyId, properties.id))
    .innerJoin(users, eq(enquiries.ownerId, users.id))
    .where(eq(enquiries.id, id))
    .limit(1);
  if (!rows[0]) return null;
  return { ...rows[0].e, propertyName: rows[0].propertyName, propertyCode: rows[0].propertyCode, ownerName: rows[0].ownerName };
}

async function addActivity(a: {
  enquiryId: string;
  userId: string;
  type: (typeof activities.$inferInsert)["type"];
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  clientFeedback?: string | null;
  nextAction?: string | null;
  followUpMethod?: string | null;
  data?: unknown;
}) {
  const db = getDb();
  const id = newId();
  const row = {
    id,
    enquiryId: a.enquiryId,
    userId: a.userId,
    type: a.type,
    fromStatus: a.fromStatus ?? null,
    toStatus: a.toStatus ?? null,
    note: a.note ?? null,
    clientFeedback: a.clientFeedback ?? null,
    nextAction: a.nextAction ?? null,
    followUpMethod: a.followUpMethod ?? null,
    data: a.data === undefined ? null : JSON.stringify(a.data),
    createdAt: nowIso(),
  };
  await db.insert(activities).values(row);
  await enqueueSync("activity", id, "append", row);
  return id;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createEnquiry(user: CurrentUser, input: EnquiryInput, meta: { ip?: string | null } = {}) {
  const db = getDb();
  const s = await getSettings();

  // Idempotent replay: return the existing record instead of creating a duplicate.
  if (input.idempotencyKey) {
    const existing = await db.query.enquiries.findFirst({ where: eq(enquiries.idempotencyKey, input.idempotencyKey) });
    if (existing) {
      const full = await loadWithRefs(existing.id);
      return { enquiry: full!, replayed: true };
    }
  }

  const property = await db.query.properties.findFirst({ where: and(eq(properties.id, input.propertyId), eq(properties.isActive, true)) });
  if (!property) throw new HttpError(422, "Selected property is not available");
  if (!canViewPropertyScope(user, property.id)) throw new AuthzError("You are not authorised for this property");

  const ownerId = input.ownerId ?? user.id;
  if (!canAssignOwner(user, ownerId)) throw new AuthzError("You cannot assign enquiries to that user");
  const owner = await db.query.users.findFirst({ where: and(eq(users.id, ownerId), eq(users.isActive, true)) });
  if (!owner) throw new HttpError(422, "Assigned salesperson is not active");

  const nights = nightsBetween(input.arrivalDate, input.departureDate);
  const rates = {
    requestedRate: toFils(input.requestedRate),
    proposedRate: toFils(input.proposedRate),
    revisedRate: toFils(input.revisedRate),
    approvedRate: null as number | null,
  };
  const calc = computeCommercials({ rooms: input.rooms, nights, rateBasis: input.rateBasis, probability: input.probability, ...rates });
  const status = input.status;
  const now = nowIso();
  const id = newId();
  const enquiryRef = await nextEnquiryRef(property.code);

  const values: typeof enquiries.$inferInsert = {
    id,
    enquiryRef,
    propertyId: property.id,
    ownerId,
    createdById: user.id,
    source: input.source,
    enquiryType: input.enquiryType,
    priority: input.priority,
    companyName: input.companyName,
    contactPerson: input.contactPerson,
    email: input.email || null,
    phone: input.phone,
    country: input.country,
    accountType: input.accountType,
    clientRemarks: input.clientRemarks,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    nights,
    rooms: input.rooms,
    roomCategory: input.roomCategory,
    guests: input.guests ?? null,
    mealPlan: input.mealPlan ?? null,
    additionalRequirements: input.additionalRequirements,
    stayType: input.stayType ?? classifyStay(nights, s.longStayThresholdNights),
    ...rates,
    rateBasis: input.rateBasis,
    taxInclusion: input.taxInclusion,
    rateVariance: calc.rateVariance,
    discountBps: calc.discountBps,
    totalRoomNights: calc.totalRoomNights,
    potentialRevenue: calc.potentialRevenue,
    expectedBookingValue: calc.expectedBookingValue,
    probability: input.probability,
    nightlyEquivalentRate: calc.nightlyEquivalentRate,
    status,
    confirmedAt: status === "Confirmed" ? now : null,
    closedAt: CLOSED_STATUSES.includes(status) ? now : null,
    lostReason: status === "Lost" ? input.lostReason : null,
    lastFollowUpAt: input.lastFollowUpAt || null,
    nextFollowUpAt: input.nextFollowUpAt || null,
    followUpMethod: input.followUpMethod || null,
    latestClientResponse: input.latestClientResponse,
    nextAction: input.nextAction,
    salesNotes: input.salesNotes,
    delayReason: input.delayReason,
    lastActivityAt: now,
    version: 1,
    idempotencyKey: input.idempotencyKey ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(enquiries).values(values);

  await addActivity({ enquiryId: id, userId: user.id, type: "CREATED", toStatus: status, note: `Enquiry ${enquiryRef} registered`, nextAction: input.nextAction });
  for (const f of RATE_FIELDS) {
    const v = rates[f];
    if (v !== null) {
      await db.insert(rateRevisions).values({
        id: newId(),
        enquiryId: id,
        userId: user.id,
        field: f,
        previousValue: null,
        newValue: v,
        rateBasis: input.rateBasis,
        reason: input.rateChangeReason ?? "Initial registration",
        createdAt: now,
      });
    }
  }

  const full = (await loadWithRefs(id))!;
  await writeAudit({ userId: user.id, action: "enquiry.create", entityType: "enquiry", entityId: id, after: full, ip: meta.ip });
  await enqueueSync("enquiry", id, "upsert", full);

  if (ownerId !== user.id) {
    await notify({
      userId: ownerId,
      type: "LEAD_ASSIGNED",
      enquiryId: id,
      title: `New lead assigned: ${full.companyName} (${enquiryRef})`,
      body: `${user.name} assigned enquiry ${enquiryRef} for ${full.propertyName} to you.`,
      dedupeKey: `LEAD_ASSIGNED:${id}:${ownerId}:${now}`,
      link: `/enquiries/${id}`,
    });
  }
  await maybeRaiseApproval(user, full, s.approvalDiscountThresholdPct, input.rateChangeReason ?? null);
  return { enquiry: (await loadWithRefs(id))!, replayed: false };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
const TRACKED_FIELDS: (keyof Enquiry)[] = [
  "propertyId", "source", "enquiryType", "priority", "companyName", "contactPerson", "email", "phone", "country",
  "accountType", "clientRemarks", "arrivalDate", "departureDate", "rooms", "roomCategory", "guests", "mealPlan",
  "additionalRequirements", "stayType", "rateBasis", "taxInclusion", "probability", "lastFollowUpAt", "nextFollowUpAt",
  "followUpMethod", "latestClientResponse", "nextAction", "salesNotes", "delayReason", "lostReason",
];

export async function updateEnquiry(user: CurrentUser, id: string, input: EnquiryInput, meta: { ip?: string | null } = {}) {
  const db = getDb();
  const s = await getSettings();
  const before = await loadWithRefs(id);
  if (!before || before.deletedAt) throw new HttpError(404, "Enquiry not found");
  if (!canViewEnquiry(user, before)) throw new HttpError(404, "Enquiry not found"); // do not leak existence
  if (!canEditEnquiry(user, before)) throw new AuthzError();
  if (input.version !== undefined && input.version !== before.version) {
    throw new HttpError(409, "This enquiry was updated by someone else. Reload to see the latest version before saving.", {
      currentVersion: before.version,
      updatedAt: before.updatedAt,
    });
  }
  if (input.ownerId && input.ownerId !== before.ownerId) {
    throw new AuthzError("Use the reassign action to change the assigned salesperson");
  }
  if (input.propertyId !== before.propertyId) {
    const property = await db.query.properties.findFirst({ where: and(eq(properties.id, input.propertyId), eq(properties.isActive, true)) });
    if (!property) throw new HttpError(422, "Selected property is not available");
    if (!canViewPropertyScope(user, property.id)) throw new AuthzError("You are not authorised for this property");
  }

  const nights = nightsBetween(input.arrivalDate, input.departureDate);
  const rates = {
    requestedRate: toFils(input.requestedRate),
    proposedRate: toFils(input.proposedRate),
    revisedRate: toFils(input.revisedRate),
    approvedRate: before.approvedRate, // only changed via approval workflow
  };
  const calc = computeCommercials({ rooms: input.rooms, nights, rateBasis: input.rateBasis, probability: input.probability, ...rates });
  const now = nowIso();
  const statusChanged = input.status !== before.status;
  const nextStatus: EnquiryStatus = input.status;

  const patch: Partial<typeof enquiries.$inferInsert> = {
    propertyId: input.propertyId,
    source: input.source,
    enquiryType: input.enquiryType,
    priority: input.priority,
    companyName: input.companyName,
    contactPerson: input.contactPerson,
    email: input.email || null,
    phone: input.phone,
    country: input.country,
    accountType: input.accountType,
    clientRemarks: input.clientRemarks,
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    nights,
    rooms: input.rooms,
    roomCategory: input.roomCategory,
    guests: input.guests ?? null,
    mealPlan: input.mealPlan ?? null,
    additionalRequirements: input.additionalRequirements,
    stayType: input.stayType ?? classifyStay(nights, s.longStayThresholdNights),
    requestedRate: rates.requestedRate,
    proposedRate: rates.proposedRate,
    revisedRate: rates.revisedRate,
    rateBasis: input.rateBasis,
    taxInclusion: input.taxInclusion,
    rateVariance: calc.rateVariance,
    discountBps: calc.discountBps,
    totalRoomNights: calc.totalRoomNights,
    potentialRevenue: calc.potentialRevenue,
    expectedBookingValue: calc.expectedBookingValue,
    probability: input.probability,
    nightlyEquivalentRate: calc.nightlyEquivalentRate,
    status: nextStatus,
    lostReason: nextStatus === "Lost" ? input.lostReason : null,
    lastFollowUpAt: input.lastFollowUpAt || null,
    nextFollowUpAt: input.nextFollowUpAt || null,
    followUpMethod: input.followUpMethod || null,
    latestClientResponse: input.latestClientResponse,
    nextAction: input.nextAction,
    salesNotes: input.salesNotes,
    delayReason: input.delayReason,
    lastActivityAt: now,
    updatedAt: now,
    version: before.version + 1,
  };
  if (statusChanged) {
    patch.confirmedAt = nextStatus === "Confirmed" ? now : null;
    patch.closedAt = CLOSED_STATUSES.includes(nextStatus) ? now : null;
  }

  const result = await db
    .update(enquiries)
    .set(patch)
    .where(and(eq(enquiries.id, id), eq(enquiries.version, before.version)));
  if (result.rowsAffected === 0) {
    throw new HttpError(409, "This enquiry was updated by someone else. Reload to see the latest version before saving.");
  }

  // Field diffs
  const diffs: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of TRACKED_FIELDS) {
    const a = before[f] ?? null;
    const b = (patch as Record<string, unknown>)[f] ?? null;
    if (a !== b && f !== "lostReason") diffs[f] = { from: a, to: b };
  }
  if (Object.keys(diffs).length) {
    await addActivity({ enquiryId: id, userId: user.id, type: "FIELD_CHANGE", note: `${Object.keys(diffs).length} field(s) updated`, data: diffs });
  }
  // Rate revisions (historical values preserved)
  for (const f of RATE_FIELDS) {
    if (f === "approvedRate") continue;
    const prev = before[f] ?? null;
    const next = rates[f as RateField] ?? null;
    if (prev !== next) {
      const rev = {
        id: newId(),
        enquiryId: id,
        userId: user.id,
        field: f,
        previousValue: prev,
        newValue: next,
        rateBasis: input.rateBasis,
        reason: input.rateChangeReason ?? null,
        createdAt: now,
      };
      await db.insert(rateRevisions).values(rev);
      await enqueueSync("rate_revision", rev.id, "append", rev);
      await addActivity({
        enquiryId: id,
        userId: user.id,
        type: "RATE_REVISION",
        note: `${labelForRateField(f)} changed from ${fmt(prev)} to ${fmt(next)} (${input.rateBasis})`,
        data: { field: f, from: prev, to: next, reason: input.rateChangeReason ?? null },
      });
    }
  }
  if (statusChanged) {
    await addActivity({
      enquiryId: id,
      userId: user.id,
      type: "STATUS_CHANGE",
      fromStatus: before.status,
      toStatus: nextStatus,
      note: nextStatus === "Lost" ? `Lost: ${input.lostReason}` : null,
      nextAction: input.nextAction,
    });
    await notifyStatusChange(user, { ...before, companyName: input.companyName, enquiryRef: before.enquiryRef, id }, nextStatus, input.lostReason ?? null);
  }

  const after = (await loadWithRefs(id))!;
  await writeAudit({ userId: user.id, action: "enquiry.update", entityType: "enquiry", entityId: id, before: diffs, after: { version: after.version, status: after.status }, ip: meta.ip });
  await enqueueSync("enquiry", id, "upsert", after);
  await maybeRaiseApproval(user, after, s.approvalDiscountThresholdPct, input.rateChangeReason ?? null);
  return (await loadWithRefs(id))!;
}

const fmt = (fils: number | null) => (fils === null ? "—" : `AED ${(fils / 100).toLocaleString("en-AE")}`);
const labelForRateField = (f: RateField) =>
  ({ requestedRate: "Client requested rate", proposedRate: "Initial proposed rate", revisedRate: "Revised rate", approvedRate: "Approved rate" })[f];

async function notifyStatusChange(actor: CurrentUser, e: Pick<EnquiryWithRefs, "id" | "ownerId" | "companyName" | "enquiryRef">, status: EnquiryStatus, lostReason: string | null) {
  const db = getDb();
  if (status !== "Confirmed" && status !== "Lost") return;
  const owner = await db.query.users.findFirst({ where: eq(users.id, e.ownerId) });
  const recipients = new Set<string>([e.ownerId]);
  if (owner?.managerId) recipients.add(owner.managerId);
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));
  admins.forEach((a) => recipients.add(a.id));
  for (const uid of recipients) {
    await notify({
      userId: uid,
      type: status === "Confirmed" ? "BOOKING_CONFIRMED" : "OPPORTUNITY_LOST",
      enquiryId: e.id,
      title: status === "Confirmed" ? `Booking confirmed: ${e.companyName} (${e.enquiryRef})` : `Opportunity lost: ${e.companyName} (${e.enquiryRef})`,
      body: status === "Confirmed" ? `${actor.name} marked ${e.enquiryRef} as Confirmed.` : `${actor.name} closed ${e.enquiryRef} as Lost. Reason: ${lostReason ?? "not stated"}.`,
      dedupeKey: `${status.toUpperCase()}:${e.id}:${uid}`,
      link: `/enquiries/${e.id}`,
    });
  }
}

/**
 * If the effective hotel rate is discounted beyond the configured threshold and no
 * pending/approved decision covers it, raise an approval request automatically.
 */
async function maybeRaiseApproval(user: CurrentUser, e: EnquiryWithRefs, thresholdPct: number, reason: string | null) {
  const db = getDb();
  if (e.discountBps === null || e.discountBps <= thresholdPct * 100) return;
  if (e.approvedRate !== null) return; // already approved rate in place
  const effective = e.revisedRate ?? e.proposedRate;
  if (effective === null) return;
  const open = await db.query.rateApprovals.findFirst({
    where: and(eq(rateApprovals.enquiryId, e.id), eq(rateApprovals.status, "PENDING")),
  });
  if (open && open.requestedRate === effective) return;
  if (open) {
    await db.update(rateApprovals).set({ status: "WITHDRAWN", decidedAt: nowIso(), decisionNote: "Superseded by a new rate" }).where(eq(rateApprovals.id, open.id));
  }
  await requestApproval(user, e.id, { requestedRate: effective / 100, reason: reason ?? `Discount of ${(e.discountBps / 100).toFixed(1)}% exceeds the ${thresholdPct}% threshold` }, { auto: true });
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------
export async function requestApproval(user: CurrentUser, enquiryId: string, input: { requestedRate: number; reason: string }, opts: { auto?: boolean } = {}) {
  const db = getDb();
  const e = await loadWithRefs(enquiryId);
  if (!e || e.deletedAt || !canViewEnquiry(user, e)) throw new HttpError(404, "Enquiry not found");
  const requested = toFils(input.requestedRate)!;
  const reference = e.proposedRate;
  const disc = reference && reference > 0 ? Math.round(((reference - requested) / reference) * 10000) : 0;
  const now = nowIso();
  const id = newId();
  await db.insert(rateApprovals).values({
    id,
    enquiryId,
    requestedById: user.id,
    requestedRate: requested,
    rateBasis: e.rateBasis as RateBasis,
    referenceRate: reference,
    discountBps: disc,
    reason: input.reason,
    status: "PENDING",
    createdAt: now,
  });
  if (e.status !== "Awaiting Internal Approval" && !CLOSED_STATUSES.includes(e.status)) {
    await db.update(enquiries).set({ status: "Awaiting Internal Approval", lastActivityAt: now, updatedAt: now, version: e.version + 1 }).where(eq(enquiries.id, enquiryId));
    await addActivity({ enquiryId, userId: user.id, type: "STATUS_CHANGE", fromStatus: e.status, toStatus: "Awaiting Internal Approval", note: opts.auto ? "Automatically raised: discount exceeds approval threshold" : null });
  }
  await addActivity({ enquiryId, userId: user.id, type: "APPROVAL_REQUESTED", note: `Approval requested for ${fmt(requested)} (${e.rateBasis}), discount ${(disc / 100).toFixed(1)}%: ${input.reason}`, data: { approvalId: id, requestedRate: requested, discountBps: disc } });
  await writeAudit({ userId: user.id, action: "approval.request", entityType: "rate_approval", entityId: id, after: { enquiryId, requested, disc } });

  // Notify approvers: owner's manager + admins
  const owner = await db.query.users.findFirst({ where: eq(users.id, e.ownerId) });
  const recipients = new Set<string>();
  if (owner?.managerId) recipients.add(owner.managerId);
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));
  admins.forEach((a) => recipients.add(a.id));
  for (const uid of recipients) {
    await notify({
      userId: uid,
      type: "RATE_APPROVAL_REQUESTED",
      enquiryId,
      title: `Rate approval requested: ${e.companyName} (${e.enquiryRef})`,
      body: `${user.name} requests approval of ${fmt(requested)} (${e.rateBasis}) - discount ${(disc / 100).toFixed(1)}% vs the initial proposed rate.`,
      dedupeKey: `RATE_APPROVAL_REQUESTED:${id}:${uid}`,
      link: `/management/negotiations`,
    });
  }
  const after = (await loadWithRefs(enquiryId))!;
  await enqueueSync("enquiry", enquiryId, "upsert", after);
  return { approvalId: id, enquiry: after };
}

export async function decideApproval(user: CurrentUser, approvalId: string, decision: "APPROVED" | "REJECTED", note: string | null) {
  const db = getDb();
  const approval = await db.query.rateApprovals.findFirst({ where: eq(rateApprovals.id, approvalId) });
  if (!approval) throw new HttpError(404, "Approval request not found");
  const e = await loadWithRefs(approval.enquiryId);
  if (!e || !canViewEnquiry(user, e)) throw new HttpError(404, "Approval request not found");
  if (!isManagement(user)) throw new AuthzError();
  if (user.role === "SALES_MANAGER" && approval.discountBps > user.approvalLimitBps) {
    throw new AuthzError(`This discount (${(approval.discountBps / 100).toFixed(1)}%) exceeds your approval authority (${(user.approvalLimitBps / 100).toFixed(1)}%).`);
  }
  if (approval.status !== "PENDING") throw new HttpError(409, "This request has already been decided");
  const now = nowIso();
  await db.update(rateApprovals).set({ status: decision, decidedById: user.id, decidedAt: now, decisionNote: note }).where(eq(rateApprovals.id, approvalId));

  const patch: Partial<typeof enquiries.$inferInsert> = { lastActivityAt: now, updatedAt: now, version: e.version + 1 };
  let newStatus: EnquiryStatus = e.status;
  if (decision === "APPROVED") {
    const calc = computeCommercials({
      rooms: e.rooms,
      nights: e.nights,
      rateBasis: e.rateBasis as RateBasis,
      probability: e.probability,
      requestedRate: e.requestedRate,
      proposedRate: e.proposedRate,
      revisedRate: e.revisedRate,
      approvedRate: approval.requestedRate,
    });
    Object.assign(patch, {
      approvedRate: approval.requestedRate,
      discountBps: calc.discountBps,
      potentialRevenue: calc.potentialRevenue,
      expectedBookingValue: calc.expectedBookingValue,
      nightlyEquivalentRate: calc.nightlyEquivalentRate,
    });
    await db.insert(rateRevisions).values({
      id: newId(), enquiryId: e.id, userId: user.id, field: "approvedRate", previousValue: e.approvedRate, newValue: approval.requestedRate, rateBasis: e.rateBasis as RateBasis, reason: note ?? "Approved", createdAt: now,
    });
    if (e.status === "Awaiting Internal Approval") newStatus = "Negotiation";
  } else if (e.status === "Awaiting Internal Approval") {
    newStatus = "Negotiation";
  }
  if (newStatus !== e.status) {
    patch.status = newStatus;
    await addActivity({ enquiryId: e.id, userId: user.id, type: "STATUS_CHANGE", fromStatus: e.status, toStatus: newStatus, note: `After approval decision (${decision.toLowerCase()})` });
  }
  await db.update(enquiries).set(patch).where(eq(enquiries.id, e.id));
  await addActivity({ enquiryId: e.id, userId: user.id, type: "APPROVAL_DECIDED", note: `${decision === "APPROVED" ? "Approved" : "Rejected"} ${fmt(approval.requestedRate)}${note ? `: ${note}` : ""}`, data: { approvalId, decision } });
  await writeAudit({ userId: user.id, action: `approval.${decision.toLowerCase()}`, entityType: "rate_approval", entityId: approvalId, before: approval, after: { decision, note } });
  await notify({
    userId: approval.requestedById,
    type: "RATE_APPROVAL_DECIDED",
    enquiryId: e.id,
    title: `Rate ${decision === "APPROVED" ? "approved" : "rejected"}: ${e.companyName} (${e.enquiryRef})`,
    body: `${user.name} ${decision.toLowerCase()} ${fmt(approval.requestedRate)} (${e.rateBasis}).${note ? ` Note: ${note}` : ""}`,
    dedupeKey: `RATE_APPROVAL_DECIDED:${approvalId}`,
    link: `/enquiries/${e.id}`,
  });
  const after = (await loadWithRefs(e.id))!;
  await enqueueSync("enquiry", e.id, "upsert", after);
  return after;
}

export async function listApprovals(user: CurrentUser, status?: string) {
  const db = getDb();
  const rows = await db
    .select({ a: rateApprovals, e: enquiries, propertyName: properties.name, propertyCode: properties.code, ownerName: users.name })
    .from(rateApprovals)
    .innerJoin(enquiries, eq(rateApprovals.enquiryId, enquiries.id))
    .innerJoin(properties, eq(enquiries.propertyId, properties.id))
    .innerJoin(users, eq(enquiries.ownerId, users.id))
    .where(and(visibleEnquiriesWhere(user), status ? eq(rateApprovals.status, status as "PENDING") : undefined))
    .orderBy(desc(rateApprovals.createdAt));
  const requesterIds = [...new Set(rows.map((r) => r.a.requestedById))];
  const requesters = requesterIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, requesterIds)) : [];
  const nameOf = new Map(requesters.map((r) => [r.id, r.name]));
  return rows.map((r) => ({
    ...r.a,
    requestedByName: nameOf.get(r.a.requestedById) ?? "—",
    enquiry: { ...r.e, propertyName: r.propertyName, propertyCode: r.propertyCode, ownerName: r.ownerName },
    canDecide: user.role === "ADMIN" || (user.role === "SALES_MANAGER" && r.a.discountBps <= user.approvalLimitBps),
  }));
}

// ---------------------------------------------------------------------------
// Follow-ups, quotations, notes
// ---------------------------------------------------------------------------
export async function addFollowUp(user: CurrentUser, id: string, input: FollowUpInput) {
  const db = getDb();
  const e = await loadWithRefs(id);
  if (!e || e.deletedAt || !canViewEnquiry(user, e)) throw new HttpError(404, "Enquiry not found");
  if (!canEditEnquiry(user, e)) throw new AuthzError();
  const now = nowIso();
  const today = todayInTz();
  const newStatus = input.newStatus && input.newStatus !== e.status ? input.newStatus : null;
  if (newStatus === "Lost" && !input.lostReason) throw new HttpError(422, "Lost business reason is mandatory when closing as Lost");

  const patch: Partial<typeof enquiries.$inferInsert> = {
    lastFollowUpAt: today,
    nextFollowUpAt: input.nextFollowUpAt || null,
    followUpMethod: input.method,
    latestClientResponse: input.clientResponse ?? e.latestClientResponse,
    nextAction: input.nextAction ?? e.nextAction,
    lastActivityAt: now,
    updatedAt: now,
    version: e.version + 1,
  };
  if (newStatus) {
    patch.status = newStatus;
    patch.confirmedAt = newStatus === "Confirmed" ? now : null;
    patch.closedAt = CLOSED_STATUSES.includes(newStatus) ? now : null;
    patch.lostReason = newStatus === "Lost" ? input.lostReason : null;
  }
  await db.update(enquiries).set(patch).where(eq(enquiries.id, id));
  await addActivity({
    enquiryId: id,
    userId: user.id,
    type: "FOLLOW_UP",
    note: input.note,
    clientFeedback: input.clientResponse,
    nextAction: input.nextAction,
    followUpMethod: input.method,
    fromStatus: newStatus ? e.status : null,
    toStatus: newStatus,
    data: { nextFollowUpAt: input.nextFollowUpAt || null },
  });
  if (newStatus) {
    await addActivity({ enquiryId: id, userId: user.id, type: "STATUS_CHANGE", fromStatus: e.status, toStatus: newStatus, note: newStatus === "Lost" ? `Lost: ${input.lostReason}` : null });
    await notifyStatusChange(user, e, newStatus, input.lostReason ?? null);
  }
  const after = (await loadWithRefs(id))!;
  await writeAudit({ userId: user.id, action: "enquiry.follow_up", entityType: "enquiry", entityId: id, after: { method: input.method, nextFollowUpAt: input.nextFollowUpAt, newStatus } });
  await enqueueSync("enquiry", id, "upsert", after);
  return after;
}

export async function addQuotation(user: CurrentUser, id: string, input: { note?: string | null; quotedRate: number | null; rateBasis?: RateBasis; validUntil?: string | null; reference?: string | null }) {
  const db = getDb();
  const e = await loadWithRefs(id);
  if (!e || e.deletedAt || !canViewEnquiry(user, e)) throw new HttpError(404, "Enquiry not found");
  if (!canEditEnquiry(user, e)) throw new AuthzError();
  const now = nowIso();
  const quoted = toFils(input.quotedRate);
  const patch: Partial<typeof enquiries.$inferInsert> = { lastActivityAt: now, updatedAt: now, version: e.version + 1 };
  if (!CLOSED_STATUSES.includes(e.status) && e.status !== "Awaiting Internal Approval") patch.status = "Quotation Sent";
  if (quoted !== null) {
    // Quotation updates the hotel's current offer: initial proposed if none, otherwise revised.
    const field: RateField = e.proposedRate === null ? "proposedRate" : "revisedRate";
    const prev = e[field];
    if (prev !== quoted) {
      await db.insert(rateRevisions).values({ id: newId(), enquiryId: id, userId: user.id, field, previousValue: prev, newValue: quoted, rateBasis: e.rateBasis as RateBasis, reason: `Quotation${input.reference ? ` ${input.reference}` : ""}`, createdAt: now });
      const next = { requestedRate: e.requestedRate, proposedRate: e.proposedRate, revisedRate: e.revisedRate, approvedRate: e.approvedRate, [field]: quoted };
      const calc = computeCommercials({ rooms: e.rooms, nights: e.nights, rateBasis: e.rateBasis as RateBasis, probability: e.probability, ...next });
      Object.assign(patch, { [field]: quoted, discountBps: calc.discountBps, rateVariance: calc.rateVariance, potentialRevenue: calc.potentialRevenue, expectedBookingValue: calc.expectedBookingValue, nightlyEquivalentRate: calc.nightlyEquivalentRate });
    }
  }
  await db.update(enquiries).set(patch).where(eq(enquiries.id, id));
  if (patch.status && patch.status !== e.status) {
    await addActivity({ enquiryId: id, userId: user.id, type: "STATUS_CHANGE", fromStatus: e.status, toStatus: patch.status });
  }
  await addActivity({ enquiryId: id, userId: user.id, type: "QUOTATION", note: input.note ?? `Quotation sent${quoted !== null ? ` at ${fmt(quoted)} (${e.rateBasis})` : ""}`, data: { quotedRate: quoted, validUntil: input.validUntil || null, reference: input.reference ?? null } });
  const after = (await loadWithRefs(id))!;
  await enqueueSync("enquiry", id, "upsert", after);
  const s = await getSettings();
  await maybeRaiseApproval(user, after, s.approvalDiscountThresholdPct, input.note ?? null);
  return (await loadWithRefs(id))!;
}

export async function addNote(user: CurrentUser, id: string, note: string) {
  const e = await loadWithRefs(id);
  if (!e || e.deletedAt || !canViewEnquiry(user, e)) throw new HttpError(404, "Enquiry not found");
  const now = nowIso();
  await getDb().update(enquiries).set({ lastActivityAt: now, updatedAt: now }).where(eq(enquiries.id, id));
  await addActivity({ enquiryId: id, userId: user.id, type: "NOTE", note });
  return (await loadWithRefs(id))!;
}

// ---------------------------------------------------------------------------
// Reassign / delete
// ---------------------------------------------------------------------------
export async function reassignEnquiry(user: CurrentUser, id: string, newOwnerId: string, note: string | null, meta: { ip?: string | null } = {}) {
  const db = getDb();
  const e = await loadWithRefs(id);
  if (!e || e.deletedAt || !canViewEnquiry(user, e)) throw new HttpError(404, "Enquiry not found");
  if (!canReassign(user)) throw new AuthzError("Only managers can reassign enquiries");
  if (!canAssignOwner(user, newOwnerId)) throw new AuthzError("You cannot assign enquiries to that user");
  const target = await db.query.users.findFirst({ where: and(eq(users.id, newOwnerId), eq(users.isActive, true)) });
  if (!target) throw new HttpError(422, "Target salesperson is not active");
  if (newOwnerId === e.ownerId) return e;
  const now = nowIso();
  await db.update(enquiries).set({ ownerId: newOwnerId, lastActivityAt: now, updatedAt: now, version: e.version + 1 }).where(eq(enquiries.id, id));
  await addActivity({ enquiryId: id, userId: user.id, type: "REASSIGNED", note: `Reassigned from ${e.ownerName} to ${target.name}${note ? `: ${note}` : ""}`, data: { from: e.ownerId, to: newOwnerId } });
  await writeAudit({ userId: user.id, action: "enquiry.reassign", entityType: "enquiry", entityId: id, before: { ownerId: e.ownerId }, after: { ownerId: newOwnerId }, ip: meta.ip });
  await notify({ userId: newOwnerId, type: "LEAD_ASSIGNED", enquiryId: id, title: `Lead assigned to you: ${e.companyName} (${e.enquiryRef})`, body: `${user.name} reassigned enquiry ${e.enquiryRef} (${e.propertyName}) to you.`, dedupeKey: `LEAD_ASSIGNED:${id}:${newOwnerId}:${now}`, link: `/enquiries/${id}` });
  const after = (await loadWithRefs(id))!;
  await enqueueSync("enquiry", id, "upsert", after);
  return after;
}

export async function deleteEnquiry(user: CurrentUser, id: string, reason: string | null, meta: { ip?: string | null } = {}) {
  const e = await loadWithRefs(id);
  if (!e || e.deletedAt) throw new HttpError(404, "Enquiry not found");
  if (!canDeleteEnquiry(user)) throw new AuthzError("Only administrators can delete enquiries");
  const now = nowIso();
  await getDb().update(enquiries).set({ deletedAt: now, updatedAt: now, version: e.version + 1 }).where(eq(enquiries.id, id));
  await addActivity({ enquiryId: id, userId: user.id, type: "DELETED", note: reason });
  await writeAudit({ userId: user.id, action: "enquiry.delete", entityType: "enquiry", entityId: id, before: e, after: { deletedAt: now, reason }, ip: meta.ip });
  await enqueueSync("enquiry", id, "delete", { ...e, deletedAt: now });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export async function getEnquiryDetail(user: CurrentUser, id: string) {
  const db = getDb();
  const e = await loadWithRefs(id);
  if (!e || !canViewEnquiry(user, e)) throw new HttpError(404, "Enquiry not found");
  const [acts, revs, approvals, files] = await Promise.all([
    db.select({ a: activities, userName: users.name }).from(activities).innerJoin(users, eq(activities.userId, users.id)).where(eq(activities.enquiryId, id)).orderBy(desc(activities.createdAt)),
    db.select({ r: rateRevisions, userName: users.name }).from(rateRevisions).innerJoin(users, eq(rateRevisions.userId, users.id)).where(eq(rateRevisions.enquiryId, id)).orderBy(asc(rateRevisions.createdAt)),
    db.select({ ap: rateApprovals, requestedByName: users.name }).from(rateApprovals).innerJoin(users, eq(rateApprovals.requestedById, users.id)).where(eq(rateApprovals.enquiryId, id)).orderBy(desc(rateApprovals.createdAt)),
    db.select({ id: attachments.id, fileName: attachments.fileName, mimeType: attachments.mimeType, sizeBytes: attachments.sizeBytes, kind: attachments.kind, createdAt: attachments.createdAt, uploadedByName: users.name }).from(attachments).innerJoin(users, eq(attachments.uploadedById, users.id)).where(eq(attachments.enquiryId, id)).orderBy(desc(attachments.createdAt)),
  ]);
  return {
    enquiry: e,
    activities: acts.map((x) => ({ ...x.a, userName: x.userName, data: x.a.data ? JSON.parse(x.a.data) : null })),
    rateRevisions: revs.map((x) => ({ ...x.r, userName: x.userName })),
    approvals: approvals.map((x) => ({ ...x.ap, requestedByName: x.requestedByName })),
    attachments: files,
    permissions: {
      canEdit: canEditEnquiry(user, e),
      canReassign: canReassign(user),
      canDelete: canDeleteEnquiry(user),
      canDecideApprovals: isManagement(user),
    },
  };
}

export function buildFilterWhere(user: CurrentUser, f: ListFilters, includeDemo: boolean): SQL {
  const parts: (SQL | undefined)[] = [visibleEnquiriesWhere(user)];
  if (!includeDemo) parts.push(eq(enquiries.isDemo, false));
  if (f.q) {
    const q = `%${f.q.toLowerCase()}%`;
    parts.push(or(like(sql`lower(${enquiries.companyName})`, q), like(sql`lower(${enquiries.contactPerson})`, q), like(sql`lower(${enquiries.enquiryRef})`, q), like(sql`lower(${enquiries.email})`, q)));
  }
  if (f.company) parts.push(like(sql`lower(${enquiries.companyName})`, `%${f.company.toLowerCase()}%`));
  if (f.enquiryMonth) parts.push(like(enquiries.createdAt, `${f.enquiryMonth}%`));
  if (f.stayMonth) parts.push(like(enquiries.arrivalDate, `${f.stayMonth}%`));
  if (f.from) parts.push(gte(enquiries.createdAt, `${f.from}T00:00:00.000Z`));
  if (f.to) parts.push(lte(enquiries.createdAt, `${f.to}T23:59:59.999Z`));
  if (f.arrivalFrom) parts.push(gte(enquiries.arrivalDate, f.arrivalFrom));
  if (f.arrivalTo) parts.push(lte(enquiries.arrivalDate, f.arrivalTo));
  if (f.propertyId) parts.push(eq(enquiries.propertyId, f.propertyId));
  if (f.ownerId) parts.push(eq(enquiries.ownerId, f.ownerId));
  if (f.enquiryType) parts.push(eq(enquiries.enquiryType, f.enquiryType));
  if (f.source) parts.push(eq(enquiries.source, f.source));
  if (f.stayType) parts.push(eq(enquiries.stayType, f.stayType));
  if (f.status) {
    const tokens = f.status.split(",").map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 1 && tokens[0] === "__active") parts.push(sql`${enquiries.status} NOT IN ('Confirmed','Lost','Cancelled')`);
    else if (tokens.length) parts.push(inArray(enquiries.status, tokens as EnquiryStatus[]));
  }
  if (f.followUpDue) {
    const today = todayInTz();
    const active = sql`${enquiries.status} NOT IN ('Confirmed','Lost','Cancelled')`;
    if (f.followUpDue === "today") parts.push(and(active, eq(enquiries.nextFollowUpAt, today)));
    if (f.followUpDue === "overdue") parts.push(and(active, isNotNull(enquiries.nextFollowUpAt), sql`${enquiries.nextFollowUpAt} < ${today}`));
    if (f.followUpDue === "week") parts.push(and(active, gte(enquiries.nextFollowUpAt, today), lte(enquiries.nextFollowUpAt, addDaysToDateOnly(today, 7))));
    if (f.followUpDue === "any") parts.push(and(active, isNotNull(enquiries.nextFollowUpAt)));
  }
  return and(...parts.filter(Boolean))!;
}

export async function listEnquiries(user: CurrentUser, f: ListFilters) {
  const db = getDb();
  const s = await getSettings();
  const includeDemo = f.includeDemo ? f.includeDemo === "true" : s.includeDemoData;
  const where = buildFilterWhere(user, f, includeDemo);
  const sortMap: Record<string, SQL> = {
    createdAt: desc(enquiries.createdAt),
    "-createdAt": asc(enquiries.createdAt),
    arrivalDate: asc(enquiries.arrivalDate),
    "-arrivalDate": desc(enquiries.arrivalDate),
    nextFollowUpAt: asc(enquiries.nextFollowUpAt),
    potentialRevenue: desc(enquiries.potentialRevenue),
    companyName: asc(enquiries.companyName),
    lastActivityAt: desc(enquiries.lastActivityAt),
  };
  const orderBy = sortMap[f.sort ?? "createdAt"] ?? desc(enquiries.createdAt);
  let rows = await db
    .select({ e: enquiries, ...baseSelect })
    .from(enquiries)
    .innerJoin(properties, eq(enquiries.propertyId, properties.id))
    .innerJoin(users, eq(enquiries.ownerId, users.id))
    .where(where)
    .orderBy(orderBy);
  // Post filters on derived bands (small result sets, computed in memory)
  if (f.rateBand) rows = rows.filter((r) => rateBand(r.e.nightlyEquivalentRate) === f.rateBand);
  if (f.stayDuration) rows = rows.filter((r) => stayDurationBand(r.e.nights) === f.stayDuration);
  const total = rows.length;
  const start = (f.page - 1) * f.pageSize;
  const page = rows.slice(start, start + f.pageSize);
  return {
    items: page.map((r) => ({ ...r.e, propertyName: r.propertyName, propertyCode: r.propertyCode, ownerName: r.ownerName })),
    total,
    page: f.page,
    pageSize: f.pageSize,
    includeDemo,
  };
}

/** Potential duplicates visible to the user: same company + property with overlapping/near arrival dates. */
export async function findDuplicates(user: CurrentUser, input: { companyName: string; propertyId: string; arrivalDate: string; excludeId?: string }) {
  const db = getDb();
  const from = addDaysToDateOnly(input.arrivalDate, -14);
  const to = addDaysToDateOnly(input.arrivalDate, 14);
  const rows = await db
    .select({ e: enquiries, ...baseSelect })
    .from(enquiries)
    .innerJoin(properties, eq(enquiries.propertyId, properties.id))
    .innerJoin(users, eq(enquiries.ownerId, users.id))
    .where(
      and(
        visibleEnquiriesWhere(user),
        eq(enquiries.propertyId, input.propertyId),
        like(sql`lower(${enquiries.companyName})`, `%${input.companyName.toLowerCase().trim()}%`),
        gte(enquiries.arrivalDate, from),
        lte(enquiries.arrivalDate, to),
        input.excludeId ? ne(enquiries.id, input.excludeId) : undefined,
      ),
    )
    .limit(5);
  return rows.map((r) => ({ id: r.e.id, enquiryRef: r.e.enquiryRef, companyName: r.e.companyName, arrivalDate: r.e.arrivalDate, status: r.e.status, ownerName: r.ownerName, propertyName: r.propertyName }));
}

export { loadWithRefs as loadEnquiry };
