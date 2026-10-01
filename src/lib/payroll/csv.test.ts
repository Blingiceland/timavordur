import { describe, it, expect } from "vitest";
import { buildPayrollCsv, csvText, CSV_COLUMNS } from "./csv";
import { calculateEmployeePeriod } from "./calculate";
import { periodFromKey } from "./punches";
import { parseTermsInput } from "./terms-input";
import type { EmploymentTerms } from "./terms";

const terms: EmploymentTerms = {
  id: "t", uid: "u", effectiveFrom: "2026-01-01", recordedAt: "2026-01-01T00:00:00Z", recordedBy: "x", reason: "x", status: "active",
  agreementId: "efling_sa_hotel", workingArrangement: "shift", payType: "hourly", employmentPercentage: 100, wageClass: 6,
  managementRole: false, birthDate: "1990-01-01", employerStartDate: "2024-01-01", priorIndustryMonths: null, experienceVerifiedOn: null,
  stepOverride: null, personalDayRate: null, monthlySalary: null, fixedAdditions: [], orlofOverrideBp: null,
};

describe("CSV export", () => {
  it("neutralises formula injection in text cells", () => {
    expect(csvText("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvText("+1")).toBe("'+1");
    expect(csvText("@cmd")).toBe("'@cmd");
    expect(csvText("-2")).toBe("'-2");
    expect(csvText("Þórður Ægisson")).toBe("Þórður Ægisson");
  });

  it("has BOM, header, one row per line + total, and totals equal the calculation", () => {
    const calc = calculateEmployeePeriod({
      uid: "u", period: periodFromKey("2026-04"), terms: [terms], businessType: "bar", now: Date.parse("2026-06-01T00:00:00Z"), mode: "actual",
      punches: [
        { id: "a", type: "in", at: Date.parse("2026-04-27T16:00:00Z") }, { id: "b", type: "out", at: Date.parse("2026-04-27T23:00:00Z") },
        { id: "c", type: "in", at: Date.parse("2026-05-02T02:00:00Z") }, { id: "d", type: "out", at: Date.parse("2026-05-02T09:00:00Z") },
      ],
    });
    const csv = buildPayrollCsv("2026-04", "locked", [{ uid: "u", name: "=Anna; \"Jóns\"", kennitala: "0101902349", calc }]);
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = csv.slice(1).trim().split("\r\n");
    expect(rows[0]).toBe(CSV_COLUMNS.join(";"));
    expect(rows).toHaveLength(1 + calc.lines.length + 1);
    expect(rows[1]).toContain(`"'=Anna; ""Jóns"""`);
    const amountIdx = CSV_COLUMNS.indexOf("fjarhaed_kr");
    // Parse amounts back (quoted cells contain ; so use a tiny CSV splitter)
    const split = (r: string) => r.match(/("([^"]|"")*"|[^;]*)(;|$)/g)!.map((c) => c.replace(/;$/, ""));
    const lineSum = rows.slice(1, -1).reduce((s, r) => s + Math.round(Number(split(r)[amountIdx].replace(",", ".")) * 100), 0);
    const total = Math.round(Number(split(rows[rows.length - 1])[amountIdx].replace(",", ".")) * 100);
    expect(lineSum).toBe(calc.totals.grossCents);
    expect(total).toBe(calc.totals.grossCents);
  });
});

describe("terms input validation", () => {
  const good = { uid: "u1", effectiveFrom: "2026-10-01", reason: "Ráðningarsamningur", workingArrangement: "shift", payType: "hourly", employmentPercentage: 80, wageClass: 6 };
  it("accepts a valid record", () => expect(parseTermsInput(good).ok).toBe(true));
  it("rejects unknown fields, bad enums, monthly without salary, experience without verification date", () => {
    const bad = parseTermsInput({ ...good, role: "owner", wageClass: 9, payType: "monthly", priorIndustryMonths: 24 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join(" ")).toContain("unknown_fields:role");
      expect(bad.errors.join(" ")).toContain("wageClass");
      expect(bad.errors.join(" ")).toContain("monthlySalary:required_for_monthly");
      expect(bad.errors.join(" ")).toContain("experienceVerifiedOn");
    }
  });
  it("refuses the unimplemented averaged pay type", () => {
    expect(parseTermsInput({ ...good, payType: "averaged" }).ok).toBe(false);
  });
});
