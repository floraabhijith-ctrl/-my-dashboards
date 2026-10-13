import { z } from "zod";
import {
  ENQUIRY_SOURCES,
  ENQUIRY_TYPES,
  PRIORITIES,
  ACCOUNT_TYPES,
  STAY_TYPES,
  MEAL_PLANS,
  RATE_BASES,
  TAX_INCLUSIONS,
  FOLLOW_UP_METHODS,
  ENQUIRY_STATUSES,
} from "../db/schema";
import { isDateOnly } from "../dates";

const dateOnly = z.string().refine(isDateOnly, "Must be a valid date (YYYY-MM-DD)");
const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === undefined || v === null || v === "" ? null : v));
/** AED amount entered by the user (converted to fils in the service layer). */
const aed = z.coerce.number().min(0).max(100_000_000).optional().nullable().transform((v) => (v === undefined ? null : v));

export const enquiryInputSchema = z
  .object({
    propertyId: z.string().min(1, "Property is required"),
    ownerId: z.string().min(1).optional(),
    source: z.enum(ENQUIRY_SOURCES),
    enquiryType: z.enum(ENQUIRY_TYPES),
    priority: z.enum(PRIORITIES).default("Medium"),

    companyName: z.string().trim().min(2, "Company name is required").max(200),
    contactPerson: z.string().trim().min(2, "Contact person is required").max(200),
    email: z
      .string()
      .trim()
      .email("Enter a valid e-mail address")
      .max(200)
      .optional()
      .nullable()
      .or(z.literal("")),
    phone: optionalText(50),
    country: optionalText(100),
    accountType: z.enum(ACCOUNT_TYPES).default("New"),
    clientRemarks: optionalText(),

    arrivalDate: dateOnly,
    departureDate: dateOnly,
    rooms: z.coerce.number().int().min(1, "At least one room").max(5000),
    roomCategory: optionalText(100),
    guests: z.coerce.number().int().min(0).max(20000).optional().nullable(),
    mealPlan: z.enum(MEAL_PLANS).optional().nullable(),
    additionalRequirements: optionalText(),
    stayType: z.enum(STAY_TYPES).optional().nullable(),

    requestedRate: aed,
    proposedRate: aed,
    revisedRate: aed,
    rateBasis: z.enum(RATE_BASES).default("Per Room Per Night"),
    taxInclusion: z.enum(TAX_INCLUSIONS).default("Inclusive of taxes"),
    probability: z.coerce.number().int().min(0).max(100).default(50),

    status: z.enum(ENQUIRY_STATUSES).default("New Enquiry"),
    lostReason: optionalText(500),

    lastFollowUpAt: dateOnly.optional().nullable().or(z.literal("")),
    nextFollowUpAt: dateOnly.optional().nullable().or(z.literal("")),
    followUpMethod: z.enum(FOLLOW_UP_METHODS).optional().nullable().or(z.literal("")),
    latestClientResponse: optionalText(),
    nextAction: optionalText(500),
    salesNotes: optionalText(4000),
    delayReason: optionalText(500),

    /** Free-text reason recorded against any rate change (negotiation history). */
    rateChangeReason: optionalText(500),
    /** Client-generated key preventing duplicate submissions. */
    idempotencyKey: z.string().max(100).optional(),
    /** Optimistic concurrency token on update. */
    version: z.coerce.number().int().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.departureDate <= v.arrivalDate) {
      ctx.addIssue({ code: "custom", path: ["departureDate"], message: "Departure must be after arrival" });
    }
    if (v.status === "Lost" && !v.lostReason) {
      ctx.addIssue({ code: "custom", path: ["lostReason"], message: "Lost business reason is mandatory when closing as Lost" });
    }
  });

export type EnquiryInput = z.infer<typeof enquiryInputSchema>;

export const followUpSchema = z.object({
  method: z.enum(FOLLOW_UP_METHODS),
  note: z.string().trim().min(2, "Add a short note").max(4000),
  clientResponse: optionalText(2000),
  nextAction: optionalText(500),
  nextFollowUpAt: dateOnly.optional().nullable().or(z.literal("")),
  newStatus: z.enum(ENQUIRY_STATUSES).optional().nullable(),
  lostReason: optionalText(500),
});
export type FollowUpInput = z.infer<typeof followUpSchema>;

export const quotationSchema = z.object({
  note: z.string().trim().max(2000).optional().nullable(),
  quotedRate: aed,
  rateBasis: z.enum(RATE_BASES).optional(),
  validUntil: dateOnly.optional().nullable().or(z.literal("")),
  reference: optionalText(100),
});

export const reassignSchema = z.object({
  ownerId: z.string().min(1),
  note: optionalText(500),
});

export const approvalRequestSchema = z.object({
  requestedRate: z.coerce.number().min(0.01, "Enter the rate requiring approval"),
  reason: z.string().trim().min(5, "Explain why the exception is needed").max(1000),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: optionalText(1000),
});

export const listFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  enquiryMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  stayMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  arrivalFrom: dateOnly.optional(),
  arrivalTo: dateOnly.optional(),
  propertyId: z.string().optional(),
  ownerId: z.string().optional(),
  company: z.string().trim().max(200).optional(),
  enquiryType: z.enum(ENQUIRY_TYPES).optional(),
  source: z.enum(ENQUIRY_SOURCES).optional(),
  status: z.string().optional(), // comma separated
  stayType: z.enum(STAY_TYPES).optional(),
  stayDuration: z.string().optional(),
  rateBand: z.string().optional(),
  followUpDue: z.enum(["today", "overdue", "week", "any"]).optional(),
  includeDemo: z.enum(["true", "false"]).optional(),
  sort: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type ListFilters = z.infer<typeof listFiltersSchema>;
