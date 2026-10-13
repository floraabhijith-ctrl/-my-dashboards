/**
 * Flora Hospitality - Sales Enquiry Platform
 * Source-of-truth relational schema (SQLite / libSQL via Drizzle ORM).
 *
 * Conventions
 *  - All timestamps are stored as ISO-8601 UTC strings. Display conversion to
 *    Asia/Dubai happens in the presentation layer only.
 *  - Money is stored as integer fils (1 AED = 100 fils) to avoid floating point
 *    drift. Percentages are stored as basis points (10000 = 100.00 %).
 *  - Dates without a time component (arrival/departure/follow-up dates) are
 *    stored as `YYYY-MM-DD` strings.
 *  - Soft deletion is used for enquiries so audit history is never orphaned.
 */
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  blob,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Enumerations (kept as const arrays so they can be shared with zod + UI)
// ---------------------------------------------------------------------------
export const USER_ROLES = ["SALES_EXECUTIVE", "SALES_MANAGER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ENQUIRY_SOURCES = [
  "Email",
  "Telephone",
  "WhatsApp",
  "Website",
  "Walk-in",
  "Referral",
  "Corporate Visit",
  "Other",
] as const;

export const ENQUIRY_TYPES = ["Corporate", "Travel Agent", "Group", "Long Stay", "Direct", "Other"] as const;
export const PRIORITIES = ["Low", "Medium", "High"] as const;
export const ACCOUNT_TYPES = ["New", "Existing"] as const;
export const STAY_TYPES = ["Short Stay", "Long Stay"] as const;
export const MEAL_PLANS = ["Room Only", "Bed & Breakfast", "Half Board", "Full Board", "All Inclusive"] as const;
export const RATE_BASES = ["Per Room Per Night", "Monthly Package", "Total Package"] as const;
export const TAX_INCLUSIONS = ["Inclusive of taxes", "Exclusive of taxes"] as const;
export const FOLLOW_UP_METHODS = ["Email", "Telephone", "WhatsApp", "Meeting", "Site Visit", "Other"] as const;

export const ENQUIRY_STATUSES = [
  "New Enquiry",
  "Contacted",
  "Qualified",
  "Quotation Sent",
  "Negotiation",
  "Awaiting Client",
  "Awaiting Internal Approval",
  "Confirmed",
  "Lost",
  "Cancelled",
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];
export const CLOSED_STATUSES: readonly EnquiryStatus[] = ["Confirmed", "Lost", "Cancelled"];
export const ACTIVE_STATUSES: readonly EnquiryStatus[] = ENQUIRY_STATUSES.filter(
  (s) => !CLOSED_STATUSES.includes(s),
);

export const ACTIVITY_TYPES = [
  "CREATED",
  "FIELD_CHANGE",
  "STATUS_CHANGE",
  "RATE_REVISION",
  "FOLLOW_UP",
  "NOTE",
  "QUOTATION",
  "APPROVAL_REQUESTED",
  "APPROVAL_DECIDED",
  "REASSIGNED",
  "ATTACHMENT_ADDED",
  "ATTACHMENT_REMOVED",
  "DELETED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const RATE_FIELDS = ["requestedRate", "proposedRate", "revisedRate", "approvedRate"] as const;
export type RateField = (typeof RATE_FIELDS)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"] as const;

export const NOTIFICATION_TYPES = [
  "LEAD_ASSIGNED",
  "FOLLOW_UP_DUE",
  "FOLLOW_UP_OVERDUE",
  "RATE_APPROVAL_REQUESTED",
  "RATE_APPROVAL_DECIDED",
  "ENQUIRY_INACTIVE",
  "HIGH_VALUE_ATTENTION",
  "BOOKING_CONFIRMED",
  "OPPORTUNITY_LOST",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const SYNC_PROVIDERS = ["none", "google-sheets", "microsoft-lists"] as const;

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------
const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const properties = sqliteTable(
  "properties",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(), // e.g. FCH, FIH, FAB - used inside enquiry refs
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    city: text("city").notNull().default("Dubai"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(nowIso),
    updatedAt: text("updated_at").notNull().default(nowIso),
  },
  (t) => [uniqueIndex("properties_code_idx").on(t.code)],
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull(),
    /** Direct line manager (used to resolve a Sales Manager's team). */
    managerId: text("manager_id"),
    /** Manager approval authority: max discount vs initial proposed rate (basis points). */
    approvalLimitBps: integer("approval_limit_bps").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
    notifyByEmail: integer("notify_by_email", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: text("last_login_at"),
    createdAt: text("created_at").notNull().default(nowIso),
    updatedAt: text("updated_at").notNull().default(nowIso),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_manager_idx").on(t.managerId)],
);

/** Property assignments for managers (scope) and executives (default property). */
export const userProperties = sqliteTable(
  "user_properties",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    propertyId: text("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.propertyId] })],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the opaque cookie token; the raw token never touches the DB. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull().default(nowIso),
    lastSeenAt: text("last_seen_at").notNull().default(nowIso),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const enquiryCounters = sqliteTable("enquiry_counters", {
  key: text("key").primaryKey(), // `${propertyCode}-${year}`
  value: integer("value").notNull().default(0),
});

export const enquiries = sqliteTable(
  "enquiries",
  {
    id: text("id").primaryKey(),
    enquiryRef: text("enquiry_ref").notNull(), // FH-FCH-2026-0001
    propertyId: text("property_id")
      .notNull()
      .references(() => properties.id),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),

    // A. Enquiry information
    source: text("source", { enum: ENQUIRY_SOURCES }).notNull(),
    enquiryType: text("enquiry_type", { enum: ENQUIRY_TYPES }).notNull(),
    priority: text("priority", { enum: PRIORITIES }).notNull().default("Medium"),

    // B. Client / company
    companyName: text("company_name").notNull(),
    contactPerson: text("contact_person").notNull(),
    email: text("email"),
    phone: text("phone"),
    country: text("country"),
    accountType: text("account_type", { enum: ACCOUNT_TYPES }).notNull().default("New"),
    clientRemarks: text("client_remarks"),

    // C. Accommodation
    arrivalDate: text("arrival_date").notNull(), // YYYY-MM-DD
    departureDate: text("departure_date").notNull(),
    nights: integer("nights").notNull(),
    rooms: integer("rooms").notNull(),
    roomCategory: text("room_category"),
    guests: integer("guests"),
    mealPlan: text("meal_plan", { enum: MEAL_PLANS }),
    additionalRequirements: text("additional_requirements"),
    stayType: text("stay_type", { enum: STAY_TYPES }).notNull(),

    // D. Commercial (fils)
    requestedRate: integer("requested_rate"),
    proposedRate: integer("proposed_rate"),
    revisedRate: integer("revised_rate"),
    approvedRate: integer("approved_rate"),
    rateBasis: text("rate_basis", { enum: RATE_BASES }).notNull().default("Per Room Per Night"),
    taxInclusion: text("tax_inclusion", { enum: TAX_INCLUSIONS }).notNull().default("Inclusive of taxes"),
    /** Variance between client requested rate and hotel initial proposed (fils, requested - proposed). */
    rateVariance: integer("rate_variance"),
    /** Discount of the current effective rate versus the initial proposed rate (basis points). */
    discountBps: integer("discount_bps"),
    totalRoomNights: integer("total_room_nights").notNull(),
    /** Revenue at the current effective rate, normalised for the rate basis (fils). */
    potentialRevenue: integer("potential_revenue").notNull().default(0),
    /** Probability-weighted revenue (fils). */
    expectedBookingValue: integer("expected_booking_value").notNull().default(0),
    probability: integer("probability").notNull().default(50), // 0-100
    /** Nightly-equivalent effective rate for cross-basis comparison (fils). */
    nightlyEquivalentRate: integer("nightly_equivalent_rate"),

    // E. Status
    status: text("status", { enum: ENQUIRY_STATUSES }).notNull().default("New Enquiry"),
    confirmedAt: text("confirmed_at"),
    closedAt: text("closed_at"),
    lostReason: text("lost_reason"),

    // F. Follow-up
    lastFollowUpAt: text("last_follow_up_at"),
    nextFollowUpAt: text("next_follow_up_at"), // YYYY-MM-DD
    followUpMethod: text("follow_up_method", { enum: FOLLOW_UP_METHODS }),
    latestClientResponse: text("latest_client_response"),
    nextAction: text("next_action"),
    salesNotes: text("sales_notes"),
    delayReason: text("delay_reason"),

    // System
    lastActivityAt: text("last_activity_at").notNull().default(nowIso),
    version: integer("version").notNull().default(1),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    idempotencyKey: text("idempotency_key"),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull().default(nowIso),
    updatedAt: text("updated_at").notNull().default(nowIso),
  },
  (t) => [
    uniqueIndex("enquiries_ref_idx").on(t.enquiryRef),
    uniqueIndex("enquiries_idempotency_idx").on(t.idempotencyKey),
    index("enquiries_owner_idx").on(t.ownerId),
    index("enquiries_property_idx").on(t.propertyId),
    index("enquiries_status_idx").on(t.status),
    index("enquiries_arrival_idx").on(t.arrivalDate),
    index("enquiries_next_follow_up_idx").on(t.nextFollowUpAt),
    index("enquiries_created_idx").on(t.createdAt),
  ],
);

export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    type: text("type", { enum: ACTIVITY_TYPES }).notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    clientFeedback: text("client_feedback"),
    nextAction: text("next_action"),
    followUpMethod: text("follow_up_method"),
    /** Structured payload (field diffs, quotation details, approval references). JSON string. */
    data: text("data"),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (t) => [index("activities_enquiry_idx").on(t.enquiryId), index("activities_created_idx").on(t.createdAt)],
);

export const rateRevisions = sqliteTable(
  "rate_revisions",
  {
    id: text("id").primaryKey(),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    field: text("field", { enum: RATE_FIELDS }).notNull(),
    previousValue: integer("previous_value"),
    newValue: integer("new_value"),
    rateBasis: text("rate_basis", { enum: RATE_BASES }).notNull(),
    reason: text("reason"),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (t) => [index("rate_revisions_enquiry_idx").on(t.enquiryId)],
);

export const rateApprovals = sqliteTable(
  "rate_approvals",
  {
    id: text("id").primaryKey(),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id, { onDelete: "cascade" }),
    requestedById: text("requested_by_id")
      .notNull()
      .references(() => users.id),
    requestedRate: integer("requested_rate").notNull(),
    rateBasis: text("rate_basis", { enum: RATE_BASES }).notNull(),
    referenceRate: integer("reference_rate"), // initial proposed rate at request time
    discountBps: integer("discount_bps").notNull().default(0),
    reason: text("reason"),
    status: text("status", { enum: APPROVAL_STATUSES }).notNull().default("PENDING"),
    decidedById: text("decided_by_id").references(() => users.id),
    decidedAt: text("decided_at"),
    decisionNote: text("decision_note"),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (t) => [index("rate_approvals_enquiry_idx").on(t.enquiryId), index("rate_approvals_status_idx").on(t.status)],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id, { onDelete: "cascade" }),
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    kind: text("kind").notNull().default("Supporting Document"), // Quotation | Contract | Supporting Document
    content: blob("content", { mode: "buffer" }).notNull(),
    sha256: text("sha256").notNull(),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (t) => [index("attachments_enquiry_idx").on(t.enquiryId)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id"),
    action: text("action").notNull(), // e.g. enquiry.update, enquiry.reassign, user.create
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: text("before"), // JSON
    after: text("after"), // JSON
    ipAddress: text("ip_address"),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    enquiryId: text("enquiry_id").references(() => enquiries.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Stable key preventing repeated reminders (e.g. FOLLOW_UP_OVERDUE:<enquiry>:<date>). */
    dedupeKey: text("dedupe_key").notNull(),
    emailStatus: text("email_status").notNull().default("PENDING"), // PENDING | SENT | SKIPPED | FAILED
    emailError: text("email_error"),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull().default(nowIso),
  },
  (t) => [uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey), index("notifications_user_idx").on(t.userId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
  updatedById: text("updated_by_id"),
  updatedAt: text("updated_at").notNull().default(nowIso),
});

/** Transactional outbox mirroring writes to Google Sheets / Microsoft Lists. */
export const syncOutbox = sqliteTable(
  "sync_outbox",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(), // enquiry | activity | rate_revision
    entityId: text("entity_id").notNull(),
    operation: text("operation").notNull(), // upsert | append | delete
    payload: text("payload").notNull(), // JSON snapshot at write time
    status: text("status").notNull().default("PENDING"), // PENDING | DONE | FAILED
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    provider: text("provider"),
    createdAt: text("created_at").notNull().default(nowIso),
    processedAt: text("processed_at"),
  },
  (t) => [index("sync_outbox_status_idx").on(t.status)],
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type Property = typeof properties.$inferSelect;
export type User = typeof users.$inferSelect;
export type Enquiry = typeof enquiries.$inferSelect;
export type NewEnquiry = typeof enquiries.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type RateRevision = typeof rateRevisions.$inferSelect;
export type RateApproval = typeof rateApprovals.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type SyncOutboxRow = typeof syncOutbox.$inferSelect;
