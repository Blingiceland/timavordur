import { describe, it, expect } from "vitest";
import { buildTimesheetCsv, shiftsFromLines, TIMESHEET_COLUMNS } from "./timesheet-csv";
import { calculateEmployeePeriod } from "./calculate";
import { periodFromKey } from "./punches";
import type { EmploymentTerms } from "./terms";

const terms: EmploymentTerms = {
  id: "t", uid: "u", effectiveFrom: "2026-01-01", recordedAt: "2026-01-01T00:00:00Z", recordedBy: "x", reason: "x", status: "active",
  agreementId: "efling_sa_hotel", workingArrangement: "shift", payType: "hourly", employmentPercentage: 100, wageClass: 6,
  managementRole: false, birthDate: "1990-01-01", employerStartDate: "2024-01-01", priorIndustryMonths: null, experienceVerifiedOn: null,
  stepOverride: null, personalDayRate: null, monthlySalary: null, fixedAdditions: [], orlofOverrideBp: null,
};

const calc = (punches: { id: string; type: "in" | "out"; at: number }[], now = Date.parse("2026-06-01T00:00:00Z")) =>
  calculateEmployeePeriod({ uid: "u", period: periodFromKey("2026-04"), terms: [terms], businessType: "bar", now, mode: "actual", punches });

describe("timesheet CSV export", () => {
  const c = calc([
    // Monday 16–23: several premium windows, one shift
    { id: "a", type: "in", at: Date.parse("2026-04-27T16:00:00Z") }, { id: "b", type: "out", at: Date.parse("2026-04-27T23:00:00Z") },
    // Friday night across midnight into Saturday
    { id: "c", type: "in", at: Date.parse("2026-05-01T20:00:00Z") }, { id: "d", type: "out", at: Date.parse("2026-05-02T03:30:00Z") },
  ]);

  it("rebuilds one row per shift from the pay lines, hours equal the calculation", () => {
    expect(c.lines.length).toBeGreaterThan(2); // premium windows split the shifts
    const shifts = shiftsFromLines(c.lines);
    expect(shifts.map((s) => [s.date, s.start.slice(11, 16), s.end.slice(11, 16), s.durationMs / 3_600_000])).toEqual([
      ["2026-04-27", "16:00", "23:00", 7],
      ["2026-05-01", "20:00", "03:30", 7.5],
    ]);
    expect(shifts.reduce((s, x) => s + x.durationMs, 0)).toBe(c.totals.durationMs);
  });

  it("has BOM, Icelandic header, weekday, decimal comma and a total row", () => {
    const csv = buildTimesheetCsv([{ uid: "u", name: "=Þórður", kennitala: "0101902349", calc: c }]);
    expect(csv.startsWith("﻿")).toBe(true);
    const rows = csv.slice(1).trim().split("\r\n");
    expect(rows[0]).toBe(TIMESHEET_COLUMNS.join(";"));
    expect(rows).toHaveLength(1 + 2 + 1);
    expect(rows[1]).toBe("'=Þórður;0101902349;2026-04-27;mánudagur;16:00;23:00;7,00;");
    expect(rows[2]).toBe("'=Þórður;0101902349;2026-05-01;föstudagur;20:00;03:30;7,50;");
    expect(rows[3]).toBe("'=Þórður;0101902349;SAMTALS;;;;14,50;2 vaktir");
  });

  it("marks a shift that is still running", () => {
    const live = calc([{ id: "a", type: "in", at: Date.parse("2026-05-10T18:00:00Z") }], Date.parse("2026-05-10T20:00:00Z"));
    const csv = buildTimesheetCsv([{ uid: "u", name: "Anna", kennitala: "", calc: live }]);
    expect(csv).toContain("Vakt í gangi (áætlun)");
  });
});
