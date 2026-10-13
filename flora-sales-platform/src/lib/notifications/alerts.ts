/**
 * Scheduled alert generation (run daily by /api/cron/alerts or on demand by an admin).
 * Every alert carries a dedupe key so a reminder is sent at most once per
 * enquiry, recipient and day (or once per lifecycle event).
 */
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { enquiries, users, properties, CLOSED_STATUSES } from "../db/schema";
import { getSettings } from "../settings";
import { todayInTz, addDaysToDateOnly, daysSince } from "../dates";
import { notify } from "./service";
import { formatAed } from "../commercial";

export async function runAlertSweep(at: Date = new Date()) {
  const db = getDb();
  const s = await getSettings();
  const today = todayInTz(undefined, at);
  const dueSoon = addDaysToDateOnly(today, s.followUpReminderDaysBefore);
  const rows = await db
    .select({ e: enquiries, propertyName: properties.shortName, ownerManagerId: users.managerId, ownerActive: users.isActive })
    .from(enquiries)
    .innerJoin(properties, eq(enquiries.propertyId, properties.id))
    .innerJoin(users, eq(enquiries.ownerId, users.id))
    .where(and(isNull(enquiries.deletedAt), notInArray(enquiries.status, [...CLOSED_STATUSES]), eq(enquiries.isDemo, false)));
  const admins = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));
  const counters = { followUpDue: 0, followUpOverdue: 0, inactive: 0, highValue: 0 };

  for (const { e, propertyName, ownerManagerId, ownerActive } of rows) {
    if (!ownerActive) continue;
    const label = `${e.companyName} (${e.enquiryRef}, ${propertyName})`;
    if (e.nextFollowUpAt && e.nextFollowUpAt >= today && e.nextFollowUpAt <= dueSoon) {
      if (await notify({ userId: e.ownerId, type: "FOLLOW_UP_DUE", enquiryId: e.id, title: `Follow-up due ${e.nextFollowUpAt === today ? "today" : e.nextFollowUpAt}: ${label}`, body: `Next action: ${e.nextAction ?? "not recorded"}.`, dedupeKey: `FOLLOW_UP_DUE:${e.id}:${e.nextFollowUpAt}`, link: `/enquiries/${e.id}` })) counters.followUpDue++;
    }
    if (e.nextFollowUpAt && e.nextFollowUpAt < today) {
      const recipients = [e.ownerId, ...(ownerManagerId ? [ownerManagerId] : [])];
      for (const uid of recipients) {
        if (await notify({ userId: uid, type: "FOLLOW_UP_OVERDUE", enquiryId: e.id, title: `Overdue follow-up: ${label}`, body: `Follow-up was due on ${e.nextFollowUpAt}. Next action: ${e.nextAction ?? "not recorded"}.`, dedupeKey: `FOLLOW_UP_OVERDUE:${e.id}:${uid}:${today}`, link: `/enquiries/${e.id}` })) counters.followUpOverdue++;
      }
    }
    const idle = daysSince(e.lastActivityAt, undefined, at);
    if (idle >= s.inactivityCriticalDays) {
      const recipients = [e.ownerId, ...(ownerManagerId ? [ownerManagerId] : [])];
      for (const uid of recipients) {
        if (await notify({ userId: uid, type: "ENQUIRY_INACTIVE", enquiryId: e.id, title: `No activity for ${idle} days: ${label}`, body: `This enquiry (${e.status}) has had no activity since ${e.lastActivityAt.slice(0, 10)}.`, dedupeKey: `ENQUIRY_INACTIVE:${e.id}:${uid}:${e.lastActivityAt}`, link: `/enquiries/${e.id}` })) counters.inactive++;
      }
    } else if (idle >= s.inactivityWarningDays) {
      if (await notify({ userId: e.ownerId, type: "ENQUIRY_INACTIVE", enquiryId: e.id, title: `No activity for ${idle} days: ${label}`, body: `Record a follow-up or update the status to keep this opportunity moving.`, dedupeKey: `ENQUIRY_INACTIVE_WARN:${e.id}:${e.lastActivityAt}`, link: `/enquiries/${e.id}` })) counters.inactive++;
    }
    if (e.potentialRevenue >= s.highValueThresholdAed * 100 && idle >= s.inactivityWarningDays) {
      const recipients = new Set<string>([...(ownerManagerId ? [ownerManagerId] : []), ...admins.map((a) => a.id)]);
      for (const uid of recipients) {
        if (await notify({ userId: uid, type: "HIGH_VALUE_ATTENTION", enquiryId: e.id, title: `High-value opportunity needs attention: ${label}`, body: `${formatAed(e.potentialRevenue)} potential revenue, ${idle} days without activity (status ${e.status}).`, dedupeKey: `HIGH_VALUE_ATTENTION:${e.id}:${uid}:${e.lastActivityAt}`, link: `/enquiries/${e.id}` })) counters.highValue++;
      }
    }
  }
  return { scanned: rows.length, ...counters, ranAt: at.toISOString() };
}
