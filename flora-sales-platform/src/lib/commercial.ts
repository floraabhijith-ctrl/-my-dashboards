/**
 * Deterministic commercial calculations.
 *
 * Definitions (documented in docs/DATA_SCHEMA.md):
 *  - Money values are integer fils (AED x 100). Percentages are basis points.
 *  - Effective rate = approvedRate ?? revisedRate ?? proposedRate ?? requestedRate.
 *  - Rate basis determines how a rate converts to revenue:
 *      Per Room Per Night : rate x rooms x nights
 *      Monthly Package    : rate x rooms x (nights / 30)   (30-day normalisation)
 *      Total Package      : rate (already the total for the whole requirement)
 *  - Nightly equivalent = revenue / (rooms x nights), used for cross-basis comparison.
 *  - Rate variance = requestedRate - proposedRate (negative means client asked for less).
 *  - Discount = (proposedRate - effectiveHotelRate) / proposedRate, where effectiveHotelRate
 *    = approvedRate ?? revisedRate ?? proposedRate. A monthly package is never compared
 *    to a nightly rate: all four rate fields share the enquiry's single rate basis.
 *  - Expected booking value = potential revenue x probability.
 */
import type { RateField } from "./db/schema";

export const MONTH_DAYS = 30;

export type RateBasis = "Per Room Per Night" | "Monthly Package" | "Total Package";

export interface CommercialInput {
  rooms: number;
  nights: number;
  rateBasis: RateBasis;
  requestedRate: number | null;
  proposedRate: number | null;
  revisedRate: number | null;
  approvedRate: number | null;
  probability: number; // 0-100
}

export interface CommercialOutput {
  totalRoomNights: number;
  effectiveRate: number | null;
  effectiveHotelRate: number | null;
  potentialRevenue: number;
  expectedBookingValue: number;
  nightlyEquivalentRate: number | null;
  rateVariance: number | null;
  discountBps: number | null;
}

export const toFils = (aed: number | null | undefined): number | null =>
  aed === null || aed === undefined || Number.isNaN(aed) ? null : Math.round(aed * 100);
export const toAed = (fils: number | null | undefined): number | null =>
  fils === null || fils === undefined ? null : fils / 100;

export function revenueForRate(rate: number, rooms: number, nights: number, basis: RateBasis): number {
  switch (basis) {
    case "Per Room Per Night":
      return Math.round(rate * rooms * nights);
    case "Monthly Package":
      return Math.round((rate * rooms * nights) / MONTH_DAYS);
    case "Total Package":
      return Math.round(rate);
  }
}

export function nightlyEquivalent(rate: number, rooms: number, nights: number, basis: RateBasis): number | null {
  const roomNights = rooms * nights;
  if (roomNights <= 0) return null;
  return Math.round(revenueForRate(rate, rooms, nights, basis) / roomNights);
}

export function effectiveRate(i: Pick<CommercialInput, RateField>): number | null {
  return i.approvedRate ?? i.revisedRate ?? i.proposedRate ?? i.requestedRate ?? null;
}

export function effectiveHotelRate(i: Pick<CommercialInput, RateField>): number | null {
  return i.approvedRate ?? i.revisedRate ?? i.proposedRate ?? null;
}

export function discountBps(proposed: number | null, effectiveHotel: number | null): number | null {
  if (proposed === null || proposed <= 0 || effectiveHotel === null) return null;
  return Math.round(((proposed - effectiveHotel) / proposed) * 10000);
}

export function computeCommercials(i: CommercialInput): CommercialOutput {
  const totalRoomNights = Math.max(0, i.rooms) * Math.max(0, i.nights);
  const eff = effectiveRate(i);
  const effHotel = effectiveHotelRate(i);
  const potentialRevenue = eff === null ? 0 : revenueForRate(eff, i.rooms, i.nights, i.rateBasis);
  const probability = Math.min(100, Math.max(0, i.probability));
  return {
    totalRoomNights,
    effectiveRate: eff,
    effectiveHotelRate: effHotel,
    potentialRevenue,
    expectedBookingValue: Math.round((potentialRevenue * probability) / 100),
    nightlyEquivalentRate: eff === null ? null : nightlyEquivalent(eff, i.rooms, i.nights, i.rateBasis),
    rateVariance: i.requestedRate !== null && i.proposedRate !== null ? i.requestedRate - i.proposedRate : null,
    discountBps: discountBps(i.proposedRate, effHotel),
  };
}

export function classifyStay(nights: number, longStayThresholdNights: number): "Short Stay" | "Long Stay" {
  return nights >= longStayThresholdNights ? "Long Stay" : "Short Stay";
}

export const formatAed = (fils: number | null | undefined, opts: { compact?: boolean } = {}): string => {
  if (fils === null || fils === undefined) return "—";
  const aed = fils / 100;
  if (opts.compact) {
    if (Math.abs(aed) >= 1_000_000) return `AED ${(aed / 1_000_000).toFixed(2)}M`;
    if (Math.abs(aed) >= 1_000) return `AED ${(aed / 1_000).toFixed(1)}K`;
  }
  return `AED ${aed.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};

export const formatPct = (bps: number | null | undefined, digits = 1): string =>
  bps === null || bps === undefined ? "—" : `${(bps / 100).toFixed(digits)}%`;

/** Rate band buckets on nightly-equivalent rate (AED). */
export const RATE_BANDS = [
  { key: "<200", label: "Below AED 200", min: 0, max: 200 },
  { key: "200-349", label: "AED 200–349", min: 200, max: 350 },
  { key: "350-499", label: "AED 350–499", min: 350, max: 500 },
  { key: "500-749", label: "AED 500–749", min: 500, max: 750 },
  { key: "750+", label: "AED 750+", min: 750, max: Infinity },
] as const;

export function rateBand(nightlyEquivalentFils: number | null): string | null {
  if (nightlyEquivalentFils === null) return null;
  const aed = nightlyEquivalentFils / 100;
  return RATE_BANDS.find((b) => aed >= b.min && aed < b.max)?.key ?? null;
}

/** Stay duration buckets on nights. */
export const STAY_DURATION_BANDS = [
  { key: "1-3", label: "1–3 nights", min: 1, max: 3 },
  { key: "4-7", label: "4–7 nights", min: 4, max: 7 },
  { key: "8-27", label: "8–27 nights", min: 8, max: 27 },
  { key: "28+", label: "28+ nights", min: 28, max: Infinity },
] as const;

export function stayDurationBand(nights: number): string {
  return STAY_DURATION_BANDS.find((b) => nights >= b.min && nights <= b.max)?.key ?? "1-3";
}
