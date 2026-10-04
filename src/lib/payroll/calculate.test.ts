import { describe, it, expect } from "vitest";
import { AGREEMENT_VERSIONS, type AgreementVersion } from "./agreements";
import { calculateEmployeePeriod, type CalculationInput } from "./calculate";
import { periodFromKey, type PunchLite } from "./punches";
import type { EmploymentTerms } from "./terms";

// A flat test table: monthly 344 000 kr → exactly 2 000,00 kr/klst (÷172), matching
// the 2 000 kr test rate used for the independent examples in LAUNCH_AUDIT.
const RULES = AGREEMENT_VERSIONS[0].rules;
const FLAT: AgreementVersion = {
  ...AGREEMENT_VERSIONS[0],
  version: "test-flat",
  effectiveFrom: "2020-01-01",
  effectiveTo: null,
  status: "verified",
  monthly: {
    6: { start: 344000, y1: 344000, y3: 344000, y5: 344000 },
    7: { start: 344000, y1: 344000, y3: 344000, y5: 344000 },
  },
  rules: RULES,
};

const baseTerms = (over: Partial<EmploymentTerms> = {}): EmploymentTerms => ({
  id: "t1", uid: "u1", effectiveFrom: "2020-01-01", recordedAt: "2020-01-01T00:00:00Z", recordedBy: "test", reason: "test",
  status: "active", agreementId: "efling_sa_hotel", workingArrangement: "shift", payType: "hourly",
  employmentPercentage: 100, wageClass: 6, managementRole: false,
  birthDate: "1990-01-01", employerStartDate: "2019-01-01", priorIndustryMonths: 0, experienceVerifiedOn: null,
  stepOverride: null, personalDayRate: null, monthlySalary: null, fixedAdditions: [], orlofOverrideBp: null,
  ...over,
});

let seq = 0;
const shift = (inIso: string, outIso: string): PunchLite[] => {
  seq++;
  return [
    { id: `in${seq}`, type: "in", at: Date.parse(inIso) },
    { id: `out${seq}`, type: "out", at: Date.parse(outIso) },
  ];
};

function run(over: Partial<CalculationInput> & { punches?: PunchLite[] }) {
  const periodKey = over.period?.key ?? "2026-03";
  return calculateEmployeePeriod({
    uid: "u1",
    period: periodFromKey(periodKey),
    terms: [baseTerms()],
    businessType: "bar",
    now: Date.parse("2030-01-01T00:00:00Z"),
    mode: "actual",
    versions: [FLAT],
    ...over,
  });
}
const kr = (cents: number) => cents / 100;

describe("LAUNCH_AUDIT independent examples (2 000 kr, regular shift work)", () => {
  const cases: [string, string, string, string, number][] = [
    ["Nýársdagur 12–16 → 90%", "2026-01-01T12:00:00Z", "2026-01-01T16:00:00Z", "2025-12", 15200],
    ["1. maí 12–16 → 45% (not 90%)", "2026-05-01T12:00:00Z", "2026-05-01T16:00:00Z", "2026-04", 11600],
    ["Aðfangadagur 12–16 → 90% from 12:00", "2026-12-24T12:00:00Z", "2026-12-24T16:00:00Z", "2026-11", 15200],
    ["Sunnudagur 06–08 bar → 45% (55% only 00–05)", "2026-03-29T06:00:00Z", "2026-03-29T08:00:00Z", "2026-03", 5800],
    ["Sumardagurinn fyrsti 12–16 → 45%", "2026-04-23T12:00:00Z", "2026-04-23T16:00:00Z", "2026-03", 11600],
    ["Aðfangadagur 06–10 → 45% then 08:00 boundary → dagvinna", "2026-12-24T06:00:00Z", "2026-12-24T10:00:00Z", "2026-11", 9800],
  ];
  for (const [name, i, o, key, expected] of cases) {
    it(name, () => {
      const r = run({ period: periodFromKey(key), punches: shift(i, o) });
      expect(kr(r.totals.grossCents)).toBe(expected);
      expect(r.status).toBe("complete");
    });
  }
});

describe("premium windows (gr. 3.2)", () => {
  it("weekday 17–24 is 33%, 00–08 is 45%", () => {
    const r = run({ punches: shift("2026-03-25T16:00:00Z", "2026-03-26T09:00:00Z") }); // Wed→Thu
    const by = r.totals.byLabel;
    expect(by["Dagvinna"].durationMs).toBe(2 * 3_600_000); // 16–17 and 08–09
    expect(by["Vaktaálag 33% (kvöld)"].durationMs).toBe(7 * 3_600_000);
    expect(by["Vaktaálag 45% (nótt)"].durationMs).toBe(8 * 3_600_000);
  });

  it("bar: Fri 22 → Sat 06 = 2h 33%, 5h 55%, 1h 45%", () => {
    const r = run({ punches: shift("2026-03-27T22:00:00Z", "2026-03-28T06:00:00Z") });
    expect(kr(r.totals.grossCents)).toBe(2 * 2660 + 5 * 3100 + 1 * 2900);
  });

  it("restaurant: the same night has no 55% band", () => {
    const r = run({ businessType: "restaurant", punches: shift("2026-03-27T22:00:00Z", "2026-03-28T06:00:00Z") });
    expect(kr(r.totals.grossCents)).toBe(2 * 2660 + 6 * 2900);
  });

  it("Saturday daytime is 45%", () => {
    const r = run({ punches: shift("2026-03-28T12:00:00Z", "2026-03-28T16:00:00Z") });
    expect(kr(r.totals.grossCents)).toBe(4 * 2900);
  });

  it("Gamlársdagur: 45%→dagvinna→90% from 12:00", () => {
    const r = run({ period: periodFromKey("2026-12"), punches: shift("2026-12-31T07:00:00Z", "2026-12-31T13:00:00Z") });
    // 07–08 45%, 08–12 day, 12–13 90%
    expect(kr(r.totals.grossCents)).toBe(2900 + 4 * 2000 + 3800);
  });
});

describe("dated rate versions and terms", () => {
  it("shift over 31.3/1.4 2026 uses January then April rates", () => {
    const r = calculateEmployeePeriod({
      uid: "u1", period: periodFromKey("2026-03"), terms: [baseTerms({ employerStartDate: "2026-01-01", birthDate: "2008-01-01" })],
      businessType: "bar", now: Date.parse("2030-01-01T00:00:00Z"), mode: "actual",
      punches: shift("2026-03-31T22:00:00Z", "2026-04-01T02:00:00Z"),
    });
    const [a, b] = r.lines;
    expect(a.versionId).toBe("2026-01");
    expect(a.rateCents).toBe(372424); // fl.6 byrjun 33% jan
    expect(b.versionId).toBe("2026-04");
    expect(b.rateCents).toBe(406271); // fl.6 byrjun 45% apr
    expect(r.rateVersions).toEqual(["2026-01", "2026-04"]);
  });

  it("shift over 31.12.2026/1.1.2027 splits at midnight even at the same 90% and flags the 2027 draft", () => {
    const r = calculateEmployeePeriod({
      uid: "u1", period: periodFromKey("2026-12"), terms: [baseTerms({ employerStartDate: "2026-06-01", birthDate: "2008-01-01" })],
      businessType: "bar", now: Date.parse("2030-01-01T00:00:00Z"), mode: "actual",
      punches: shift("2026-12-31T22:00:00Z", "2027-01-01T02:00:00Z"),
    });
    expect(r.lines).toHaveLength(2);
    expect(r.lines.every((l) => l.pct === 90)).toBe(true);
    expect(r.lines[0].versionId).toBe("2026-04");
    expect(r.lines[1].versionId).toBe("2027-01-draft");
    expect(r.lines[1].versionStatus).toBe("draft");
    expect(r.issues.some((i) => i.code === "unverified_rate_version")).toBe(true);
    expect(r.status).toBe("blocked");
  });

  it("terms change at midnight mid-shift: class 6 → 7", () => {
    const t6 = baseTerms({ id: "t6" });
    const t7 = baseTerms({ id: "t7", wageClass: 7, effectiveFrom: "2026-03-26", recordedAt: "2026-03-20T00:00:00Z" });
    const r = calculateEmployeePeriod({
      uid: "u1", period: periodFromKey("2026-03"), terms: [t6, t7], businessType: "bar",
      now: Date.parse("2030-01-01T00:00:00Z"), mode: "actual",
      punches: shift("2026-03-25T22:00:00Z", "2026-03-26T02:00:00Z"),
    });
    expect(r.lines.map((l) => [l.termsId, l.wageClass])).toEqual([["t6", 6], ["t7", 7]]);
  });

  it("adding a later version never changes an earlier calculation", () => {
    const punches = shift("2026-03-25T09:00:00Z", "2026-03-25T19:00:00Z");
    const before = run({ punches });
    const later: AgreementVersion = { ...FLAT, version: "later", effectiveFrom: "2027-06-01", monthly: { 6: { start: 999999, y1: 999999, y3: 999999, y5: 999999 }, 7: { start: 999999, y1: 999999, y3: 999999, y5: 999999 } } };
    const after = run({ punches, versions: [{ ...FLAT, effectiveTo: "2027-06-01" }, later] });
    expect(after.totals.grossCents).toBe(before.totals.grossCents);
    expect(after.lines.map((l) => l.rateCents)).toEqual(before.lines.map((l) => l.rateCents));
  });

  it("no terms → blocker and no amount (never 0 kr presented as pay)", () => {
    const r = run({ terms: [], punches: shift("2026-03-25T09:00:00Z", "2026-03-25T12:00:00Z") });
    expect(r.status).toBe("blocked");
    expect(r.lines[0].amountCents).toBeNull();
    expect(r.issues.map((i) => i.code)).toContain("missing_terms");
  });

  it("date before any rate version → explicit no_rate_version", () => {
    const r = calculateEmployeePeriod({
      uid: "u1", period: periodFromKey("2025-12"), terms: [baseTerms()], businessType: "bar",
      now: Date.parse("2030-01-01T00:00:00Z"), mode: "actual", punches: shift("2025-12-26T09:00:00Z", "2025-12-26T12:00:00Z"),
    });
    expect(r.issues.map((i) => i.code)).toContain("no_rate_version");
    expect(r.lines[0].amountCents).toBeNull();
  });

  it("personal overpay is kept, minimum is still reported", () => {
    const r = run({ terms: [baseTerms({ personalDayRate: 2500 })], punches: shift("2026-03-25T09:00:00Z", "2026-03-25T11:00:00Z") });
    expect(r.lines[0].basis).toBe("personal");
    expect(kr(r.totals.grossCents)).toBe(5000);
  });

  it("personal rate below minimum → minimum used and blocker raised", () => {
    const r = run({ terms: [baseTerms({ personalDayRate: 1500 })], punches: shift("2026-03-25T09:00:00Z", "2026-03-25T11:00:00Z") });
    expect(kr(r.totals.grossCents)).toBe(4000);
    expect(r.issues.map((i) => i.code)).toContain("personal_below_minimum");
  });
});

describe("pay-period boundaries [25th, 25th)", () => {
  it("a shift across 24th/25th is split between periods", () => {
    const punches = shift("2026-04-24T22:00:00Z", "2026-04-25T04:00:00Z"); // Fri → Sat
    const a = run({ period: periodFromKey("2026-03"), punches });
    const b = run({ period: periodFromKey("2026-04"), punches });
    expect(a.totals.durationMs).toBe(2 * 3_600_000);
    expect(b.totals.durationMs).toBe(4 * 3_600_000);
  });

  it("punch at 23:59:59.500 on the last day is inside the period", () => {
    const punches = shift("2026-04-24T20:00:00Z", "2026-04-24T23:59:59.500Z");
    const r = run({ period: periodFromKey("2026-03"), punches });
    expect(r.totals.durationMs).toBe(4 * 3_600_000 - 500);
  });

  it("punch-in before the period start is paired and clipped", () => {
    const punches = shift("2026-03-24T20:00:00Z", "2026-03-25T02:00:00Z");
    const r = run({ period: periodFromKey("2026-03"), punches });
    expect(r.totals.durationMs).toBe(2 * 3_600_000);
    expect(r.issues.filter((i) => i.severity === "blocker")).toEqual([]);
  });

  it("an old open shift does not accrue pay until today", () => {
    const punches: PunchLite[] = [{ id: "x", type: "in", at: Date.parse("2026-03-26T18:00:00Z") }];
    const r = run({ punches, now: Date.parse("2026-04-10T12:00:00Z") });
    expect(r.totals.durationMs).toBe(0);
    expect(r.issues.map((i) => i.code)).toContain("punch_stale_open");
    expect(r.status).toBe("blocked");
  });

  it("a current open shift is shown as a bounded estimate and blocks locking", () => {
    const punches: PunchLite[] = [{ id: "x", type: "in", at: Date.parse("2026-03-26T18:00:00Z") }];
    const r = run({ punches, now: Date.parse("2026-03-26T20:00:00Z") });
    expect(r.totals.durationMs).toBe(2 * 3_600_000);
    expect(r.lines.every((l) => l.estimate)).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("punch_open_estimate");
  });

  it("duplicate punch-in is an anomaly, not a silently merged shift", () => {
    const punches: PunchLite[] = [
      { id: "a", type: "in", at: Date.parse("2026-03-26T10:00:00Z") },
      { id: "b", type: "in", at: Date.parse("2026-03-26T11:00:00Z") },
      { id: "c", type: "out", at: Date.parse("2026-03-26T12:00:00Z") },
    ];
    const r = run({ punches });
    expect(r.issues.find((i) => i.code === "punch_missing_out")?.punchIds).toEqual(["a"]);
    expect(r.totals.durationMs).toBe(3_600_000);
  });
});

describe("weekly overtime (gr. 3.1.4 / 3.2.4) and working arrangements", () => {
  const week = () => [
    ...shift("2026-03-30T08:00:00Z", "2026-03-30T17:00:00Z"),
    ...shift("2026-03-31T08:00:00Z", "2026-03-31T17:00:00Z"),
    ...shift("2026-04-01T08:00:00Z", "2026-04-01T17:00:00Z"),
    ...shift("2026-04-02T08:00:00Z", "2026-04-02T17:00:00Z"), // Skírdagur 45%
    ...shift("2026-04-06T08:00:00Z", "2026-04-06T17:00:00Z"), // next week (annar í páskum)
  ];

  it("hours beyond 40 in a Monday-based week are overtime (1,0385% of monthly)", () => {
    const punches = [
      ...shift("2026-03-30T08:00:00Z", "2026-03-30T17:00:00Z"),
      ...shift("2026-03-31T08:00:00Z", "2026-03-31T17:00:00Z"),
      ...shift("2026-04-01T08:00:00Z", "2026-04-01T17:00:00Z"),
      ...shift("2026-04-03T08:00:00Z", "2026-04-03T09:00:00Z"), // Good Friday
      ...shift("2026-04-04T08:00:00Z", "2026-04-04T21:00:00Z"), // Saturday: 27+1+13 = 41h
    ];
    const r = run({ punches });
    const ot = r.lines.filter((l) => l.overtime);
    expect(ot.reduce((s, l) => s + l.durationMs, 0)).toBe(3_600_000);
    // OT rate 344 000 × 1,0385% = 3 572,44 > weekend premium 2 900 → OT rate applies
    expect(ot[0].rateCents).toBe(357244);
  });

  it("overtime never pays less than the premium that would have applied (stórhátíð 90%)", () => {
    const punches = [
      ...shift("2026-03-30T08:00:00Z", "2026-03-30T20:00:00Z"),
      ...shift("2026-03-31T08:00:00Z", "2026-03-31T20:00:00Z"),
      ...shift("2026-04-01T08:00:00Z", "2026-04-01T20:00:00Z"),
      ...shift("2026-04-03T10:00:00Z", "2026-04-03T16:00:00Z"), // 36h + 6h Good Friday → 2h OT
    ];
    const r = run({ punches });
    const ot = r.lines.filter((l) => l.overtime);
    expect(ot.reduce((s, l) => s + l.durationMs, 0)).toBe(2 * 3_600_000);
    expect(ot[0].rateCents).toBe(Math.max(357244, 380000));
  });

  it("day arrangement: weekday 08–17 is dagvinna, evenings/helgidagar are overtime, stórhátíð is a blocker", () => {
    const terms = [baseTerms({ workingArrangement: "day" })];
    const r = run({ terms, punches: week() });
    const byKind = (k: string) => r.lines.filter((l) => l.kind === k).reduce((s, l) => s + l.durationMs, 0) / 3_600_000;
    expect(byKind("day")).toBe(27);
    expect(byKind("day_overtime")).toBe(18); // Skírdagur + annar í páskum
    const r2 = run({ terms, punches: shift("2026-04-03T10:00:00Z", "2026-04-03T12:00:00Z") });
    expect(r2.issues.map((i) => i.code)).toContain("day_arrangement_storhatid");
    expect(r2.lines[0].amountCents).toBeNull();
  });

  it("monthly pay: salary once, only premium parts for hours, no orlof on salary", () => {
    const terms = [baseTerms({ payType: "monthly", monthlySalary: 344000, employmentPercentage: 100 })];
    const r = run({ terms, punches: shift("2026-03-28T12:00:00Z", "2026-03-28T16:00:00Z") }); // Sat 45%
    const salary = r.lines.find((l) => l.kind === "salary")!;
    expect(kr(salary.amountCents!)).toBe(344000);
    const prem = r.lines.find((l) => l.kind === "weekend")!;
    expect(kr(prem.amountCents!)).toBe(4 * 900);
    expect(salary.orlofEligible).toBe(false);
    expect(r.cost!.orlofCents).toBe(Math.round(360000 * 0.1207)); // only on the premium (5y+ at company → 12,07%)
  });

  it("monthly pay starting mid-period is prorated only as a flagged estimate", () => {
    const terms = [baseTerms({ payType: "monthly", monthlySalary: 344000, employmentPercentage: 100, employerStartDate: "2026-04-09" })];
    const r = run({ terms });
    expect(r.issues.map((i) => i.code)).toContain("monthly_partial_period");
    expect(r.lines[0].estimate).toBe(true);
  });

  it("averaged pay type returns a blocker, not a plausible total", () => {
    const r = run({ terms: [baseTerms({ payType: "averaged" })], punches: shift("2026-03-25T09:00:00Z", "2026-03-25T12:00:00Z") });
    expect(r.status).toBe("blocked");
    expect(r.issues.map((i) => i.code)).toContain("unsupported_pay_type");
    expect(r.totals.grossCents).toBe(0);
  });

  it("rest under 11 h is flagged", () => {
    const r = run({ punches: [...shift("2026-03-25T14:00:00Z", "2026-03-25T23:00:00Z"), ...shift("2026-03-26T06:00:00Z", "2026-03-26T10:00:00Z")] });
    expect(r.issues.map((i) => i.code)).toContain("short_rest");
  });
});

describe("planned mode (2027 preview)", () => {
  it("prices planned shifts with the draft table and never reports complete", () => {
    const r = calculateEmployeePeriod({
      uid: "u1", period: periodFromKey("2027-01"), terms: [baseTerms({ employerStartDate: "2026-06-01", birthDate: "2000-01-01" })],
      businessType: "bar", now: Date.parse("2026-09-30T00:00:00Z"), mode: "planned",
      planned: [{ sourceId: "s1", start: Date.parse("2027-01-26T09:00:00Z"), end: Date.parse("2027-01-26T17:00:00Z"), punchIds: [], estimate: true }],
    });
    expect(r.lines[0].versionId).toBe("2027-01-draft");
    expect(r.status).toBe("blocked");
    expect(r.mode).toBe("planned");
  });
});

describe("custom terms outside a supported agreement", () => {
  const customRates = { eveningPct: 50, nightWeekendPct: 60, barNightPct: 70, helgidagurPct: 80, storhatidPct: 100, overtimePct: 100 };
  const custom = (over: Partial<EmploymentTerms> = {}) =>
    baseTerms({ agreementId: "custom", wageClass: null, employerStartDate: null, birthDate: null, personalDayRate: 3000, customRates, ...over });

  it("prices the same time windows with the employer's own percentages", () => {
    const r = run({ terms: [custom()], punches: [...shift("2026-04-14T15:00:00Z", "2026-04-14T19:00:00Z"), ...shift("2026-04-18T01:00:00Z", "2026-04-18T03:00:00Z")] });
    // Tue: 2 h day + 2 h evening (50%); Sat 01–03 at a bar: 2 h at 70%.
    expect(kr(r.totals.grossCents)).toBe(2 * 3000 + 2 * 4500 + 2 * 5100);
    expect(r.issues.map((i) => i.code)).not.toContain("personal_below_minimum");
    expect(r.issues.map((i) => i.code)).not.toContain("missing_employer_start_date");
    expect(r.lines.every((l) => l.versionId === "custom")).toBe(true);
  });

  it("weekly overtime uses the custom overtime percentage", () => {
    const punches = [13, 14, 15, 16, 17].flatMap((d) => shift(`2026-04-${String(d).padStart(2, "0")}T08:00:00Z`, `2026-04-${String(d).padStart(2, "0")}T17:00:00Z`));
    const r = run({ terms: [custom()], punches });
    // 45 h Mon–Fri day work: 40 h at 3000, 5 h overtime at 6000.
    expect(kr(r.totals.grossCents)).toBe(40 * 3000 + 5 * 6000);
  });

  it("is blocked without pay or premiums", () => {
    const a = run({ terms: [custom({ customRates: null })], punches: shift("2026-04-14T10:00:00Z", "2026-04-14T12:00:00Z") });
    expect(a.issues.map((i) => i.code)).toContain("custom_missing_rates");
    const b = run({ terms: [custom({ personalDayRate: null })], punches: shift("2026-04-14T10:00:00Z", "2026-04-14T12:00:00Z") });
    expect(b.issues.map((i) => i.code)).toContain("custom_missing_pay");
  });
});

describe("documented manual step without an employment start date", () => {
  it("a step override and holiday rate taken from a payslip need no start date", () => {
    const t = baseTerms({ employerStartDate: null, stepOverride: { step: "y1", reason: "skv. launaseðli sept. 2026" }, orlofOverrideBp: 1017 });
    const r = run({ terms: [t], punches: shift("2026-04-14T10:00:00Z", "2026-04-14T12:00:00Z") });
    const codes = r.issues.map((i) => i.code);
    expect(codes).not.toContain("missing_employer_start_date");
    expect(r.lines[0].step).toBe("y1");
  });
  it("without the override the missing start date still blocks", () => {
    const r = run({ terms: [baseTerms({ employerStartDate: null })], punches: shift("2026-04-14T10:00:00Z", "2026-04-14T12:00:00Z") });
    expect(r.issues.map((i) => i.code)).toContain("missing_employer_start_date");
  });
});
