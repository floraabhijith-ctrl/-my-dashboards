import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { settings } from "./db/schema";
import { nowIso } from "./dates";

export interface AppSettings {
  /** Nights at or above which an enquiry is classified as Long Stay. */
  longStayThresholdNights: number;
  /** Inactivity thresholds (days) used in follow-up monitoring and alerts. */
  inactivityWarningDays: number;
  inactivityCriticalDays: number;
  /** Potential revenue (AED) at or above which an enquiry is "high value". */
  highValueThresholdAed: number;
  /** Discount (percent vs initial proposed rate) above which internal approval is required. */
  approvalDiscountThresholdPct: number;
  /** Days before next follow-up date to send a "due soon" reminder. */
  followUpReminderDaysBefore: number;
  /** Include records flagged as demo data in management reporting. */
  includeDemoData: boolean;
  /** Days with no activity after which a quotation is flagged as awaiting response. */
  quotationAwaitingDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  longStayThresholdNights: 28,
  inactivityWarningDays: 3,
  inactivityCriticalDays: 7,
  highValueThresholdAed: 50000,
  approvalDiscountThresholdPct: 10,
  followUpReminderDaysBefore: 1,
  includeDemoData: true,
  quotationAwaitingDays: 3,
};

const SETTINGS_KEY = "app";

export async function getSettings(): Promise<AppSettings> {
  const db = getDb();
  const row = await db.query.settings.findFirst({ where: eq(settings.key, SETTINGS_KEY) });
  if (!row) return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(patch: Partial<AppSettings>, userId: string): Promise<AppSettings> {
  const db = getDb();
  const current = await getSettings();
  const next = { ...current, ...patch };
  await db
    .insert(settings)
    .values({ key: SETTINGS_KEY, value: JSON.stringify(next), updatedById: userId, updatedAt: nowIso() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(next), updatedById: userId, updatedAt: nowIso() },
    });
  return next;
}
