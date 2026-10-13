import { describe, it, expect } from "vitest";
import { computeCommercials, revenueForRate, nightlyEquivalent, discountBps, classifyStay, rateBand, toFils } from "@/lib/commercial";
import { nightsBetween } from "@/lib/dates";
import { toCsv } from "@/lib/csv";

describe("commercial calculations", () => {
  it("computes nights from calendar dates", () => {
    expect(nightsBetween("2026-11-01", "2026-11-05")).toBe(4);
    expect(nightsBetween("2026-12-30", "2027-01-02")).toBe(3);
  });

  it("per-room-per-night revenue = rate x rooms x nights", () => {
    expect(revenueForRate(toFils(500)!, 4, 5, "Per Room Per Night")).toBe(toFils(10000));
  });

  it("monthly package is normalised on a 30-day month and never treated as nightly", () => {
    const monthly = toFils(9000)!; // AED 9,000 per month
    expect(revenueForRate(monthly, 2, 60, "Monthly Package")).toBe(toFils(36000)); // 2 rooms x 2 months
    expect(nightlyEquivalent(monthly, 2, 60, "Monthly Package")).toBe(toFils(300));
    expect(revenueForRate(monthly, 2, 60, "Monthly Package")).not.toBe(revenueForRate(monthly, 2, 60, "Per Room Per Night"));
  });

  it("total package is the total for the whole requirement", () => {
    expect(revenueForRate(toFils(25000)!, 10, 3, "Total Package")).toBe(toFils(25000));
    expect(nightlyEquivalent(toFils(30000)!, 10, 3, "Total Package")).toBe(toFils(1000));
  });

  it("uses approved > revised > proposed > requested as the effective rate", () => {
    const base = { rooms: 2, nights: 3, rateBasis: "Per Room Per Night" as const, probability: 50, requestedRate: toFils(300), proposedRate: toFils(500), revisedRate: null, approvedRate: null };
    expect(computeCommercials(base).effectiveRate).toBe(toFils(500));
    expect(computeCommercials({ ...base, revisedRate: toFils(450) }).effectiveRate).toBe(toFils(450));
    expect(computeCommercials({ ...base, revisedRate: toFils(450), approvedRate: toFils(420) }).effectiveRate).toBe(toFils(420));
    expect(computeCommercials({ ...base, proposedRate: null }).effectiveRate).toBe(toFils(300));
  });

  it("discount and variance definitions", () => {
    expect(discountBps(toFils(500), toFils(450))).toBe(1000); // 10.00%
    expect(discountBps(null, toFils(450))).toBeNull();
    const out = computeCommercials({ rooms: 1, nights: 1, rateBasis: "Per Room Per Night", probability: 40, requestedRate: toFils(400), proposedRate: toFils(500), revisedRate: toFils(450), approvedRate: null });
    expect(out.rateVariance).toBe(toFils(-100));
    expect(out.discountBps).toBe(1000);
    expect(out.potentialRevenue).toBe(toFils(450));
    expect(out.expectedBookingValue).toBe(toFils(180));
  });

  it("classifies stay type and rate bands", () => {
    expect(classifyStay(27, 28)).toBe("Short Stay");
    expect(classifyStay(28, 28)).toBe("Long Stay");
    expect(rateBand(toFils(199))).toBe("<200");
    expect(rateBand(toFils(350))).toBe("350-499");
    expect(rateBand(toFils(900))).toBe("750+");
  });

  it("CSV export escapes quotes and neutralises formula injection", () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'say "hi"' }], [{ key: "a", label: "A" }, { key: "b", label: "B" }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"say ""hi"""`);
  });
});
