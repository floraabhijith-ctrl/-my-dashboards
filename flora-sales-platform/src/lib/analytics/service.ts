/**
 * Management intelligence. Aggregates are computed in memory over the set of
 * enquiries the requesting user is authorised to see, after applying filters.
 * Definitions:
 *  - Conversion % = Confirmed / (Confirmed + Lost + Cancelled + Active) on the filtered set
 *    (i.e. confirmed share of all enquiries in scope). Win rate = Confirmed / (Confirmed + Lost).
 *  - Pipeline revenue = potentialRevenue of ACTIVE enquiries (never Confirmed/Lost/Cancelled).
 *  - Confirmed revenue = potentialRevenue of Confirmed enquiries (at the approved/effective rate).
 *  - Enquiry month is based on createdAt (Asia/Dubai); stay month on arrivalDate. They are never mixed.
 *  - Each enquiry is counted once; rate revisions never add rows.
 */
import { and, eq, desc, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { enquiries, properties, users, activities, rateApprovals, CLOSED_STATUSES, ENQUIRY_STATUSES, type EnquiryStatus } from "../db/schema";
import type { CurrentUser } from "../auth/session";
import type { ListFilters } from "../validation/enquiry";
import { buildFilterWhere, type EnquiryWithRefs } from "../enquiries/service";
import { getSettings, type AppSettings } from "../settings";
import { monthKey, todayInTz, daysSince, addDaysToDateOnly } from "../dates";
import { rateBand, stayDurationBand } from "../commercial";
import { visibleEnquiriesWhere } from "../authz";

export type AnalyticsRow = EnquiryWithRefs;

const isActive = (s: string) => !CLOSED_STATUSES.includes(s as EnquiryStatus);

export async function loadScopedEnquiries(user: CurrentUser, f: ListFilters): Promise<{ rows: AnalyticsRow[]; settings: AppSettings; includeDemo: boolean }> {
  const db = getDb();
  const settings = await getSettings();
  const includeDemo = f.includeDemo ? f.includeDemo === "true" : settings.includeDemoData;
  const where = buildFilterWhere(user, f, includeDemo);
  const rows = await db
    .select({ e: enquiries, propertyName: properties.name, propertyCode: properties.code, ownerName: users.name })
    .from(enquiries)
    .innerJoin(properties, eq(enquiries.propertyId, properties.id))
    .innerJoin(users, eq(enquiries.ownerId, users.id))
    .where(where);
  let mapped = rows.map((r) => ({ ...r.e, propertyName: r.propertyName, propertyCode: r.propertyCode, ownerName: r.ownerName }));
  if (f.rateBand) mapped = mapped.filter((r) => rateBand(r.nightlyEquivalentRate) === f.rateBand);
  if (f.stayDuration) mapped = mapped.filter((r) => stayDurationBand(r.nights) === f.stayDuration);
  return { rows: mapped, settings, includeDemo };
}

export function computeKpis(rows: AnalyticsRow[], settings: AppSettings, at: Date = new Date()) {
  const today = todayInTz(undefined, at);
  const active = rows.filter((r) => isActive(r.status));
  const confirmed = rows.filter((r) => r.status === "Confirmed");
  const lost = rows.filter((r) => r.status === "Lost");
  const cancelled = rows.filter((r) => r.status === "Cancelled");
  const sum = (xs: AnalyticsRow[], k: keyof AnalyticsRow) => xs.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);
  const closedDecided = confirmed.length + lost.length;
  return {
    totalEnquiries: rows.length,
    newEnquiries: rows.filter((r) => r.status === "New Enquiry").length,
    activeEnquiries: active.length,
    qualified: rows.filter((r) => ["Qualified", "Quotation Sent", "Negotiation", "Awaiting Client", "Awaiting Internal Approval"].includes(r.status)).length,
    quotationsSent: rows.filter((r) => ["Quotation Sent", "Negotiation", "Awaiting Client", "Awaiting Internal Approval", "Confirmed"].includes(r.status)).length,
    negotiations: rows.filter((r) => r.status === "Negotiation").length,
    awaitingClient: rows.filter((r) => r.status === "Awaiting Client").length,
    awaitingApproval: rows.filter((r) => r.status === "Awaiting Internal Approval").length,
    confirmed: confirmed.length,
    lost: lost.length,
    cancelled: cancelled.length,
    conversionBps: rows.length ? Math.round((confirmed.length / rows.length) * 10000) : 0,
    winRateBps: closedDecided ? Math.round((confirmed.length / closedDecided) * 10000) : 0,
    pipelineRevenue: sum(active, "potentialRevenue"),
    weightedPipeline: sum(active, "expectedBookingValue"),
    confirmedRevenue: sum(confirmed, "potentialRevenue"),
    lostRevenue: sum(lost, "potentialRevenue"),
    pipelineRoomNights: sum(active, "totalRoomNights"),
    confirmedRoomNights: sum(confirmed, "totalRoomNights"),
    overdueFollowUps: active.filter((r) => r.nextFollowUpAt && r.nextFollowUpAt < today).length,
    dueToday: active.filter((r) => r.nextFollowUpAt === today).length,
    highValueActive: active.filter((r) => r.potentialRevenue >= settings.highValueThresholdAed * 100).length,
  };
}

function groupBy<T, K extends string>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}

function summarise(rows: AnalyticsRow[]) {
  const confirmed = rows.filter((r) => r.status === "Confirmed");
  const active = rows.filter((r) => isActive(r.status));
  const lost = rows.filter((r) => r.status === "Lost");
  return {
    enquiries: rows.length,
    active: active.length,
    quotations: rows.filter((r) => ["Quotation Sent", "Negotiation", "Awaiting Client", "Awaiting Internal Approval", "Confirmed"].includes(r.status)).length,
    confirmed: confirmed.length,
    lost: lost.length,
    conversionBps: rows.length ? Math.round((confirmed.length / rows.length) * 10000) : 0,
    pipelineRevenue: active.reduce((a, r) => a + r.potentialRevenue, 0),
    confirmedRevenue: confirmed.reduce((a, r) => a + r.potentialRevenue, 0),
    roomNights: rows.reduce((a, r) => a + r.totalRoomNights, 0),
    confirmedRoomNights: confirmed.reduce((a, r) => a + r.totalRoomNights, 0),
    shortStay: rows.filter((r) => r.stayType === "Short Stay").length,
    longStay: rows.filter((r) => r.stayType === "Long Stay").length,
  };
}

export function monthlyTrends(rows: AnalyticsRow[]) {
  const byMonth = groupBy(rows, (r) => monthKey(r.createdAt));
  const months = [...byMonth.keys()].sort();
  const series = months.map((m) => {
    const xs = byMonth.get(m)!;
    const bySource = groupBy(xs, (r) => r.source);
    const byProperty = groupBy(xs, (r) => r.propertyCode);
    return {
      month: m,
      ...summarise(xs),
      bySource: Object.fromEntries([...bySource].map(([k, v]) => [k, v.length])),
      byProperty: Object.fromEntries([...byProperty].map(([k, v]) => [k, v.length])),
    };
  });
  // YoY: same month previous year, when present
  const byKey = new Map(series.map((s) => [s.month, s]));
  const yoy = series.map((s) => {
    const prev = byKey.get(`${Number(s.month.slice(0, 4)) - 1}${s.month.slice(4)}`);
    return { month: s.month, current: s.enquiries, previousYear: prev?.enquiries ?? null };
  });
  return { series, yoy };
}

export function bySource(rows: AnalyticsRow[]) {
  return [...groupBy(rows, (r) => r.source)].map(([source, xs]) => ({ source, ...summarise(xs) })).sort((a, b) => b.enquiries - a.enquiries);
}

export function byProperty(rows: AnalyticsRow[]) {
  return [...groupBy(rows, (r) => r.propertyId)]
    .map(([propertyId, xs]) => ({ propertyId, propertyName: xs[0].propertyName, propertyCode: xs[0].propertyCode, ...summarise(xs) }))
    .sort((a, b) => a.propertyName.localeCompare(b.propertyName));
}

export function bySegment(rows: AnalyticsRow[]) {
  return [...groupBy(rows, (r) => r.enquiryType)].map(([segment, xs]) => ({ segment, ...summarise(xs) })).sort((a, b) => b.enquiries - a.enquiries);
}

export async function salespersonPerformance(rows: AnalyticsRow[], at: Date = new Date()) {
  const db = getDb();
  const today = todayInTz(undefined, at);
  const ownerIds = [...new Set(rows.map((r) => r.ownerId))];
  const followUps = ownerIds.length
    ? await db.select({ userId: activities.userId, enquiryId: activities.enquiryId }).from(activities).where(and(eq(activities.type, "FOLLOW_UP"), inArray(activities.userId, ownerIds)))
    : [];
  const enquiryIds = new Set(rows.map((r) => r.id));
  const fuCount = new Map<string, number>();
  for (const f of followUps) if (enquiryIds.has(f.enquiryId)) fuCount.set(f.userId, (fuCount.get(f.userId) ?? 0) + 1);
  return [...groupBy(rows, (r) => r.ownerId)]
    .map(([ownerId, xs]) => {
      const active = xs.filter((r) => isActive(r.status));
      const props = [...new Set(xs.map((r) => r.propertyCode))].join(", ");
      return {
        ownerId,
        ownerName: xs[0].ownerName,
        properties: props,
        ...summarise(xs),
        followUpsCompleted: fuCount.get(ownerId) ?? 0,
        overdueFollowUps: active.filter((r) => r.nextFollowUpAt && r.nextFollowUpAt < today).length,
      };
    })
    .sort((a, b) => b.confirmedRevenue - a.confirmedRevenue || b.enquiries - a.enquiries);
}

export function funnel(rows: AnalyticsRow[]) {
  const order: EnquiryStatus[] = ["New Enquiry", "Contacted", "Qualified", "Quotation Sent", "Negotiation", "Awaiting Client", "Awaiting Internal Approval", "Confirmed"];
  const rank = new Map(order.map((s, i) => [s, i]));
  const stages = order.map((stage) => ({
    stage,
    current: rows.filter((r) => r.status === stage).length,
    // "Reached" counts enquiries at or beyond this stage (Lost/Cancelled count as reached up to Qualified only if they were later stages - unknown, so they are counted as closed separately)
    reached: rows.filter((r) => (rank.get(r.status as EnquiryStatus) ?? -1) >= (rank.get(stage) ?? 0)).length,
    revenue: rows.filter((r) => r.status === stage).reduce((a, r) => a + r.potentialRevenue, 0),
  }));
  return {
    stages,
    closed: {
      confirmed: rows.filter((r) => r.status === "Confirmed").length,
      lost: rows.filter((r) => r.status === "Lost").length,
      cancelled: rows.filter((r) => r.status === "Cancelled").length,
    },
    statusMix: ENQUIRY_STATUSES.map((s) => ({ status: s, count: rows.filter((r) => r.status === s).length })),
  };
}

export function negotiationAnalysis(rows: AnalyticsRow[], settings: AppSettings) {
  const withRates = rows.filter((r) => r.proposedRate !== null);
  const threshold = settings.approvalDiscountThresholdPct * 100;
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    averages: {
      requested: avg(rows.map((r) => nightlyFor(r, "requestedRate")).filter((v): v is number => v !== null)),
      proposed: avg(rows.map((r) => nightlyFor(r, "proposedRate")).filter((v): v is number => v !== null)),
      revised: avg(rows.map((r) => nightlyFor(r, "revisedRate")).filter((v): v is number => v !== null)),
      approved: avg(rows.map((r) => nightlyFor(r, "approvedRate")).filter((v): v is number => v !== null)),
      discountBps: avg(withRates.filter((r) => r.discountBps !== null).map((r) => r.discountBps!)),
    },
    attention: rows
      .filter((r) => isActive(r.status) && ((r.discountBps ?? 0) > threshold || r.status === "Awaiting Internal Approval" || r.potentialRevenue >= settings.highValueThresholdAed * 100))
      .map(slim)
      .sort((a, b) => (b.discountBps ?? 0) - (a.discountBps ?? 0)),
    pendingApprovalCases: rows.filter((r) => r.status === "Awaiting Internal Approval").length,
    rows: rows.filter((r) => r.requestedRate !== null || r.proposedRate !== null).map(slim),
  };
}

export function followUpMonitoring(rows: AnalyticsRow[], settings: AppSettings, at: Date = new Date()) {
  const today = todayInTz(undefined, at);
  const active = rows.filter((r) => isActive(r.status));
  const inactiveFor = (days: number) => active.filter((r) => daysSince(r.lastActivityAt, undefined, at) >= days);
  return {
    dueToday: active.filter((r) => r.nextFollowUpAt === today).map(slim),
    overdue: active.filter((r) => r.nextFollowUpAt && r.nextFollowUpAt < today).map(slim),
    dueThisWeek: active.filter((r) => r.nextFollowUpAt && r.nextFollowUpAt > today && r.nextFollowUpAt <= addDaysToDateOnly(today, 7)).map(slim),
    inactiveWarning: inactiveFor(settings.inactivityWarningDays).map(slim),
    inactiveCritical: inactiveFor(settings.inactivityCriticalDays).map(slim),
    quotationsAwaiting: active.filter((r) => ["Quotation Sent", "Awaiting Client"].includes(r.status) && daysSince(r.lastActivityAt, undefined, at) >= settings.quotationAwaitingDays).map(slim),
    highValueStale: active.filter((r) => r.potentialRevenue >= settings.highValueThresholdAed * 100 && daysSince(r.lastActivityAt, undefined, at) >= settings.inactivityWarningDays).map(slim),
    thresholds: { warningDays: settings.inactivityWarningDays, criticalDays: settings.inactivityCriticalDays, highValueAed: settings.highValueThresholdAed, quotationDays: settings.quotationAwaitingDays },
  };
}

/** Forward outlook by STAY month (arrivalDate), active pipeline vs confirmed. */
export function forwardOutlook(rows: AnalyticsRow[]) {
  const future = rows.filter((r) => isActive(r.status) || r.status === "Confirmed");
  const byMonth = groupBy(future, (r) => r.arrivalDate.slice(0, 7));
  return [...byMonth.keys()]
    .sort()
    .map((m) => {
      const xs = byMonth.get(m)!;
      const conf = xs.filter((r) => r.status === "Confirmed");
      const pipe = xs.filter((r) => isActive(r.status));
      return {
        stayMonth: m,
        confirmedRoomNights: conf.reduce((a, r) => a + r.totalRoomNights, 0),
        pipelineRoomNights: pipe.reduce((a, r) => a + r.totalRoomNights, 0),
        confirmedRevenue: conf.reduce((a, r) => a + r.potentialRevenue, 0),
        pipelineRevenue: pipe.reduce((a, r) => a + r.potentialRevenue, 0),
        weightedPipelineRevenue: pipe.reduce((a, r) => a + r.expectedBookingValue, 0),
        enquiries: xs.length,
        byProperty: Object.fromEntries([...groupBy(xs, (r) => r.propertyCode)].map(([k, v]) => [k, { roomNights: v.reduce((a, r) => a + r.totalRoomNights, 0), revenue: v.reduce((a, r) => a + r.potentialRevenue, 0) }])),
      };
    });
}

function slim(r: AnalyticsRow) {
  return {
    id: r.id,
    enquiryRef: r.enquiryRef,
    companyName: r.companyName,
    contactPerson: r.contactPerson,
    propertyName: r.propertyName,
    propertyCode: r.propertyCode,
    ownerName: r.ownerName,
    ownerId: r.ownerId,
    status: r.status,
    priority: r.priority,
    arrivalDate: r.arrivalDate,
    departureDate: r.departureDate,
    rooms: r.rooms,
    nights: r.nights,
    rateBasis: r.rateBasis,
    requestedRate: r.requestedRate,
    proposedRate: r.proposedRate,
    revisedRate: r.revisedRate,
    approvedRate: r.approvedRate,
    rateVariance: r.rateVariance,
    discountBps: r.discountBps,
    nightlyEquivalentRate: r.nightlyEquivalentRate,
    potentialRevenue: r.potentialRevenue,
    expectedBookingValue: r.expectedBookingValue,
    probability: r.probability,
    nextFollowUpAt: r.nextFollowUpAt,
    lastFollowUpAt: r.lastFollowUpAt,
    lastActivityAt: r.lastActivityAt,
    createdAt: r.createdAt,
    isDemo: r.isDemo,
    nextAction: r.nextAction,
    latestClientResponse: r.latestClientResponse,
  };
}

/** Nightly-equivalent value of a given rate field (fils), for cross-basis comparison. */
export function nightlyFor(r: AnalyticsRow, field: "requestedRate" | "proposedRate" | "revisedRate" | "approvedRate"): number | null {
  const v = r[field];
  if (v === null) return null;
  const rn = r.rooms * r.nights;
  if (rn <= 0) return null;
  if (r.rateBasis === "Per Room Per Night") return v;
  if (r.rateBasis === "Monthly Package") return Math.round(v / 30);
  return Math.round(v / rn);
}

export async function buildDashboard(user: CurrentUser, f: ListFilters, at: Date = new Date()) {
  const { rows, settings, includeDemo } = await loadScopedEnquiries(user, f);
  const db = getDb();
  const pendingApprovals = await db
    .select({ id: rateApprovals.id, enquiryId: rateApprovals.enquiryId })
    .from(rateApprovals)
    .innerJoin(enquiries, eq(rateApprovals.enquiryId, enquiries.id))
    .where(and(eq(rateApprovals.status, "PENDING"), visibleEnquiriesWhere(user)));
  return {
    generatedAt: at.toISOString(),
    includeDemo,
    demoCount: rows.filter((r) => r.isDemo).length,
    kpis: computeKpis(rows, settings, at),
    trends: monthlyTrends(rows),
    bySource: bySource(rows),
    byProperty: byProperty(rows),
    bySegment: bySegment(rows),
    salespeople: await salespersonPerformance(rows, at),
    funnel: funnel(rows),
    negotiation: { ...negotiationAnalysis(rows, settings), pendingApprovals: pendingApprovals.length },
    followUps: followUpMonitoring(rows, settings, at),
    outlook: forwardOutlook(rows),
    stayMix: {
      shortStay: rows.filter((r) => r.stayType === "Short Stay").length,
      longStay: rows.filter((r) => r.stayType === "Long Stay").length,
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof buildDashboard>>;

/** Lightweight personal workspace KPIs for a salesperson. */
export async function workspaceSummary(user: CurrentUser, at: Date = new Date()) {
  const { rows, settings } = await loadScopedEnquiries(user, { page: 1, pageSize: 10000 } as ListFilters);
  const kpis = computeKpis(rows, settings, at);
  const today = todayInTz(undefined, at);
  const upcoming = rows
    .filter((r) => isActive(r.status) && r.nextFollowUpAt && r.nextFollowUpAt <= addDaysToDateOnly(today, 7))
    .sort((a, b) => (a.nextFollowUpAt! < b.nextFollowUpAt! ? -1 : 1))
    .slice(0, 10)
    .map(slim);
  const recent = [...rows].sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1)).slice(0, 8).map(slim);
  return { kpis, upcoming, recent, trends: monthlyTrends(rows), funnel: funnel(rows), byProperty: byProperty(rows), today };
}

export async function recentActivityFeed(user: CurrentUser, limit = 20) {
  const db = getDb();
  const rows = await db
    .select({ a: activities, userName: users.name, enquiryRef: enquiries.enquiryRef, companyName: enquiries.companyName, enquiryId: enquiries.id })
    .from(activities)
    .innerJoin(enquiries, eq(activities.enquiryId, enquiries.id))
    .innerJoin(users, eq(activities.userId, users.id))
    .where(visibleEnquiriesWhere(user))
    .orderBy(desc(activities.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r.a, userName: r.userName, enquiryRef: r.enquiryRef, companyName: r.companyName, enquiryId: r.enquiryId }));
}

