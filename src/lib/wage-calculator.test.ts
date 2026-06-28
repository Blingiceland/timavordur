import { describe, it, expect } from "vitest";
import { calculateWage, calculateEmployerCost } from "./wage-calculator";

// All timestamps are UTC (Iceland = UTC year-round). Rate = hours * rate * multiplier.
// Reference 2026 days (verified with `new Date(...).getUTCDay()`):
//   2026-03-25 Wed · 2026-03-27 Fri · 2026-03-28 Sat · 2026-03-29 Sun
//   2026-04-02 Maundy Thursday (helgarfrídagur) · 2026-04-03 Good Friday (stórhátíð)
const RATE = 2000;
const d = (iso: string) => new Date(iso);

describe("calculateWage — Efling/SA", () => {
  it("dagvinna: weekday 09–12 → ×1.00", () => {
    const w = calculateWage(d("2026-03-25T09:00:00Z"), d("2026-03-25T12:00:00Z"), RATE);
    expect(w.totalHours).toBe(3);
    expect(w.totalWage).toBe(3 * RATE * 1.0);
    expect(w.breakdown.dagvinna).toBe(3);
  });

  it("kvöldvinna: weekday 18–21 → ×1.33", () => {
    const w = calculateWage(d("2026-03-25T18:00:00Z"), d("2026-03-25T21:00:00Z"), RATE);
    expect(w.totalWage).toBe(3 * RATE * 1.33);
    expect(w.breakdown.kvoldvinna).toBe(3);
  });

  it("splits at the 17:00 day/evening boundary", () => {
    const w = calculateWage(d("2026-03-25T16:00:00Z"), d("2026-03-25T18:00:00Z"), RATE);
    expect(w.totalHours).toBe(2);
    expect(w.breakdown.dagvinna).toBe(1);
    expect(w.breakdown.kvoldvinna).toBe(1);
    expect(w.totalWage).toBe(1 * RATE * 1.0 + 1 * RATE * 1.33);
  });

  it("helgarálag: Saturday daytime → ×1.45", () => {
    const w = calculateWage(d("2026-03-28T12:00:00Z"), d("2026-03-28T16:00:00Z"), RATE);
    expect(w.totalWage).toBe(4 * RATE * 1.45);
    expect(w.breakdown.helgarvinna).toBe(4);
  });

  it("næturálag: Sunday 06–08 → ×1.55 (bar, default)", () => {
    const w = calculateWage(d("2026-03-29T06:00:00Z"), d("2026-03-29T08:00:00Z"), RATE);
    expect(w.totalWage).toBe(2 * RATE * 1.55);
    expect(w.breakdown.naetuvinna).toBe(2);
  });

  it("restaurant: weekend night is 45%, not the bar-only 55%", () => {
    const w = calculateWage(d("2026-03-29T06:00:00Z"), d("2026-03-29T08:00:00Z"), RATE, "efling_sa", "restaurant");
    expect(w.totalWage).toBe(2 * RATE * 1.45);
    expect(w.breakdown.helgarvinna).toBe(2);
    expect(w.breakdown.naetuvinna).toBe(0);
  });

  it("helgarfrídagur: Maundy Thursday → ×1.45 all day", () => {
    const w = calculateWage(d("2026-04-02T10:00:00Z"), d("2026-04-02T14:00:00Z"), RATE);
    expect(w.totalWage).toBe(4 * RATE * 1.45);
    expect(w.breakdown.helgarvinna).toBe(4);
  });

  it("stórhátíð: Good Friday → ×1.90 all day", () => {
    const w = calculateWage(d("2026-04-03T12:00:00Z"), d("2026-04-03T16:00:00Z"), RATE);
    expect(w.totalWage).toBe(4 * RATE * 1.9);
    expect(w.breakdown.storhatid).toBe(4);
  });

  it("crosses midnight Fri→Sat: evening ×1.33 then night ×1.55", () => {
    const w = calculateWage(d("2026-03-27T22:00:00Z"), d("2026-03-28T02:00:00Z"), RATE);
    expect(w.totalHours).toBe(4);
    expect(w.breakdown.kvoldvinna).toBe(2);
    expect(w.breakdown.naetuvinna).toBe(2);
    expect(w.totalWage).toBe(2 * RATE * 1.33 + 2 * RATE * 1.55);
  });

  it("half-stórhátíð: Christmas Eve from 16:00 → ×1.90", () => {
    const w = calculateWage(d("2026-12-24T16:00:00Z"), d("2026-12-24T18:00:00Z"), RATE);
    expect(w.totalWage).toBe(2 * RATE * 1.9);
    expect(w.breakdown.storhatid).toBe(2);
  });

  it("returns zeros when punch-out is not after punch-in", () => {
    const w = calculateWage(d("2026-03-25T12:00:00Z"), d("2026-03-25T12:00:00Z"), RATE);
    expect(w.totalHours).toBe(0);
    expect(w.totalWage).toBe(0);
  });
});

describe("calculateEmployerCost", () => {
  it("adds orlof, pension (11.5%) and social tax (6.35%) on the orlof-inclusive base", () => {
    const c = calculateEmployerCost(100_000);
    expect(c.orlof).toBe(Math.round(100_000 * 0.1017)); // 10170
    const base = 100_000 + c.orlof;
    expect(c.employerPension).toBe(Math.round(base * 0.115));
    expect(c.socialTax).toBe(Math.round(base * 0.0635));
    expect(c.total).toBe(100_000 + c.orlof + c.employerPension + c.socialTax);
  });
});
