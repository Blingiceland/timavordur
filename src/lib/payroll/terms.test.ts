import { describe, it, expect } from "vitest";
import { employerCost } from "./cost";
import { orlofBasisPoints, stepOnDate, termsForDate, type EmploymentTerms } from "./terms";

const t = (over: Partial<EmploymentTerms> = {}): EmploymentTerms => ({
  id: "t", uid: "u", effectiveFrom: "2020-01-01", recordedAt: "2020-01-01T00:00:00Z", recordedBy: "x", reason: "x",
  status: "active", agreementId: "efling_sa_hotel", workingArrangement: "shift", payType: "hourly",
  employmentPercentage: 100, wageClass: 6, managementRole: false, birthDate: "2006-06-15", employerStartDate: "2025-10-01",
  priorIndustryMonths: null, experienceVerifiedOn: null, stepOverride: null, personalDayRate: null,
  monthlySalary: null, fixedAdditions: [], orlofOverrideBp: null, ...over,
});

describe("termsForDate — immutable history", () => {
  it("latest effectiveFrom <= date wins; a later correction with the same date supersedes", () => {
    const a = t({ id: "a", effectiveFrom: "2026-01-01", recordedAt: "2026-01-01T00:00:00Z" });
    const b = t({ id: "b", effectiveFrom: "2026-03-01", recordedAt: "2026-02-20T00:00:00Z" });
    const bFix = t({ id: "bFix", effectiveFrom: "2026-03-01", recordedAt: "2026-03-05T00:00:00Z" });
    const v = t({ id: "v", effectiveFrom: "2026-03-10", recordedAt: "2026-03-10T00:00:00Z", status: "void" });
    expect(termsForDate([a, b, bFix, v], "2026-02-28")?.id).toBe("a");
    expect(termsForDate([a, b, bFix, v], "2026-03-15")?.id).toBe("bFix");
    expect(termsForDate([a], "2025-12-31")).toBeNull();
  });
});

describe("stepOnDate — gr. 1.5 / 1.2.3", () => {
  it("starts at byrjun and moves to 1 ár on the anniversary", () => {
    expect(stepOnDate(t(), "2026-09-30").step).toBe("start");
    expect(stepOnDate(t(), "2026-10-01").step).toBe("y1");
  });
  it("22 years of age counts as one year in the trade", () => {
    expect(stepOnDate(t({ birthDate: "2000-01-01" }), "2025-10-02").step).toBe("y1");
  });
  it("verified prior experience applies from the first of the next month", () => {
    const x = t({ priorIndustryMonths: 36, experienceVerifiedOn: "2026-02-10" });
    expect(stepOnDate(x, "2026-02-28").step).toBe("start");
    expect(stepOnDate(x, "2026-03-01").step).toBe("y3");
  });
  it("5 ár requires five years with the same employer", () => {
    expect(stepOnDate(t({ employerStartDate: "2021-04-01", birthDate: "1990-01-01" }), "2026-04-01").step).toBe("y5");
    expect(stepOnDate(t({ employerStartDate: "2021-04-02", birthDate: "1990-01-01" }), "2026-04-01").step).toBe("y3");
  });
  it("manual override may raise but never lower", () => {
    expect(stepOnDate(t({ stepOverride: { step: "y3", reason: "samningur" } }), "2026-01-01").step).toBe("y3");
    const low = stepOnDate(t({ employerStartDate: "2019-01-01", stepOverride: { step: "start", reason: "x" } }), "2026-01-01");
    expect(low.step).toBe("y5");
    expect(low.issues.map((i) => i.code)).toContain("override_below_entitlement");
  });
  it("missing start date / birth date are blockers, not guesses", () => {
    const r = stepOnDate(t({ employerStartDate: null, birthDate: null }), "2026-01-01");
    expect(r.issues.map((i) => i.code).sort()).toEqual(["missing_birth_date", "missing_employer_start_date"]);
  });
});

describe("orlofBasisPoints — gr. 6.1", () => {
  it("10,17% base", () => expect(orlofBasisPoints(t(), "2026-03-01").bp).toBe(1017));
  it("10,64% once 22 and 6 months at the company, from the next 1 May", () => {
    const x = t({ birthDate: "1990-01-01", employerStartDate: "2025-10-01" });
    expect(orlofBasisPoints(x, "2026-04-30").bp).toBe(1017);
    expect(orlofBasisPoints(x, "2026-05-01").bp).toBe(1064);
  });
  it("12,07% after 5 years, 13,04% after 10", () => {
    expect(orlofBasisPoints(t({ employerStartDate: "2020-05-01" }), "2026-05-01").bp).toBe(1207);
    expect(orlofBasisPoints(t({ employerStartDate: "2015-05-01" }), "2026-05-01").bp).toBe(1304);
  });
  it("a better personal rate is kept", () => {
    expect(orlofBasisPoints(t({ orlofOverrideBp: 1304 }), "2026-03-01").bp).toBe(1304);
  });
});

describe("employerCost — tryggingagjald base includes employer pension", () => {
  it("100 000 kr gross (10,17% orlof) → tryggingagjald 7 800 kr, not 6 996", () => {
    const c = employerCost([{ date: "2026-03-01", amountCents: 10_000_000, orlofEligible: true, orlofBp: 1017 }], 2026);
    expect(c.orlofCents).toBe(1_017_000);
    expect(c.employerPensionCents).toBe(1_266_955); // 11,5% of 110 170
    expect(Math.round(c.tryggingagjaldCents / 100)).toBe(7800);
    expect(c.rateStatus).toBe("verified");
  });
  it("2027 rates are marked unverified", () => {
    expect(employerCost([], 2027).rateStatus).toBe("unverified");
  });
});
