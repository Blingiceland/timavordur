import { NextRequest } from "next/server";
import { isAccessError, verifyCompanyRole } from "@/lib/auth";
import { calculateEmployeePeriod } from "@/lib/payroll/calculate";
import { isPeriodKey, periodFromKey } from "@/lib/payroll/punches";
import { accessFail, fail, handle, json } from "@/lib/server/http";
import { staffCol } from "@/lib/server/refs";
import { loadSchedule, shiftInterval } from "@/lib/server/schedule-service";
import { loadTermsByUid } from "@/lib/server/terms-store";

// GET /api/[slug]/payroll/preview?period=YYYY-MM (admin+)
// Estimated cost from the SCHEDULE (planned shifts), not punches. Read-only:
// creates no payroll records. Draft rate tables are labelled as such.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("payroll preview", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const key = new URL(req.url).searchParams.get("period");
    if (!isPeriodKey(key)) return fail("invalid_period", 400);
    const period = periodFromKey(key);
    const company = access.company;

    const [shifts, terms, staffSnap] = await Promise.all([
      loadSchedule(company.id, period.startDate, period.endDateInclusive),
      loadTermsByUid(company.id),
      staffCol(company.id).where("status", "==", "approved").get(),
    ]);
    const now = Date.now();
    const employees = staffSnap.docs.map((d) => {
      const planned = shifts.filter((s) => s.uid === d.id).map((s) => {
        const [start, end] = shiftInterval(s);
        return { sourceId: s.id, start, end, punchIds: [], estimate: true };
      });
      const calc = calculateEmployeePeriod({
        uid: d.id, period, terms: terms.get(d.id) ?? [], businessType: company.businessType ?? "bar", now, mode: "planned", planned,
      });
      return {
        uid: d.id, name: d.data().name || "", plannedShifts: planned.length, hours: calc.totals.hours,
        grossCents: calc.lines.some((l) => l.amountCents === null) ? null : calc.totals.grossCents,
        costCents: calc.cost?.totalCents ?? null, costRateStatus: calc.cost?.rateStatus ?? null,
        rateVersions: calc.rateVersions, draftRates: calc.lines.some((l) => l.versionStatus === "draft"),
        issues: [...new Set(calc.issues.filter((i) => i.severity === "blocker").map((i) => i.code))],
      };
    }).sort((a, b) => a.name.localeCompare(b.name, "is"));

    return json({
      period: { key, startDate: period.startDate, endDateInclusive: period.endDateInclusive },
      kind: "estimate_from_schedule",
      employees,
      totalGrossCents: employees.reduce((s, e) => s + (e.grossCents ?? 0), 0),
      totalCostCents: employees.reduce((s, e) => s + (e.costCents ?? 0), 0),
      incomplete: employees.some((e) => e.grossCents === null),
      usesDraftRates: employees.some((e) => e.draftRates),
    });
  });
}
