import { formatInTimeZone } from "date-fns-tz";
import { parseISO } from "date-fns";

export const TZ = "Asia/Dubai";

export const aed = (fils: number | null | undefined, compact = false): string => {
  if (fils === null || fils === undefined) return "—";
  const v = fils / 100;
  if (compact) {
    if (Math.abs(v) >= 1_000_000) return `AED ${(v / 1_000_000).toFixed(2)}M`;
    if (Math.abs(v) >= 10_000) return `AED ${(v / 1_000).toFixed(1)}K`;
  }
  return `AED ${v.toLocaleString("en-AE", { maximumFractionDigits: 0 })}`;
};
export const pct = (bps: number | null | undefined, digits = 1) => (bps === null || bps === undefined ? "—" : `${(bps / 100).toFixed(digits)}%`);
export const num = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-AE"));

export const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return formatInTimeZone(parseISO(`${v}T12:00:00Z`), "UTC", "dd MMM yyyy");
  return formatInTimeZone(new Date(v), TZ, "dd MMM yyyy");
};
export const fmtDateTime = (v: string | null | undefined) => (v ? formatInTimeZone(new Date(v), TZ, "dd MMM yyyy, HH:mm") : "—");
export const fmtMonth = (ym: string) => formatInTimeZone(parseISO(`${ym}-01T12:00:00Z`), "UTC", "MMM yyyy");
export const todayDubai = () => formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
export const monthDubai = () => formatInTimeZone(new Date(), TZ, "yyyy-MM");
