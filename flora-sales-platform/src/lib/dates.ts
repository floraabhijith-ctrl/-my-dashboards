import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { differenceInCalendarDays, parseISO, isValid } from "date-fns";

export const APP_TZ = process.env.APP_TIMEZONE || "Asia/Dubai";

export const nowIso = () => new Date().toISOString();

/** Today's calendar date (YYYY-MM-DD) in the business timezone. */
export function todayInTz(tz: string = APP_TZ, at: Date = new Date()): string {
  return formatInTimeZone(at, tz, "yyyy-MM-dd");
}

export function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));
}

/** Nights between two YYYY-MM-DD dates (departure - arrival). */
export function nightsBetween(arrival: string, departure: string): number {
  return differenceInCalendarDays(parseISO(departure), parseISO(arrival));
}

export function addDaysToDateOnly(date: string, days: number): string {
  const d = parseISO(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthKey(dateOnlyOrIso: string, tz: string = APP_TZ): string {
  if (isDateOnly(dateOnlyOrIso)) return dateOnlyOrIso.slice(0, 7);
  return formatInTimeZone(new Date(dateOnlyOrIso), tz, "yyyy-MM");
}

export function formatDateTime(iso: string | null | undefined, tz: string = APP_TZ): string {
  if (!iso) return "—";
  return formatInTimeZone(new Date(iso), tz, "dd MMM yyyy, HH:mm");
}

export function formatDate(value: string | null | undefined, tz: string = APP_TZ): string {
  if (!value) return "—";
  if (isDateOnly(value)) return formatInTimeZone(parseISO(value + "T12:00:00Z"), "UTC", "dd MMM yyyy");
  return formatInTimeZone(new Date(value), tz, "dd MMM yyyy");
}

export function daysSince(iso: string, tz: string = APP_TZ, at: Date = new Date()): number {
  const then = toZonedTime(new Date(iso), tz);
  const now = toZonedTime(at, tz);
  return differenceInCalendarDays(now, then);
}

export function daysUntilDateOnly(date: string, tz: string = APP_TZ, at: Date = new Date()): number {
  return differenceInCalendarDays(parseISO(date), parseISO(todayInTz(tz, at)));
}
