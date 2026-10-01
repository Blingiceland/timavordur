import { NextRequest } from "next/server";
import { atLeast, isAccessError, verifyCompanyRole } from "@/lib/auth";
import { isPeriodKey, periodContaining } from "@/lib/payroll/punches";
import { accessFail, fail, handle, json } from "@/lib/server/http";
import { readPeriod } from "@/lib/server/payroll-service";
import { isDocId } from "@/lib/validation";

// GET /api/[slug]/timesheets?period=YYYY-MM&uid=all|<uid>
// period = month in which the 25th–24th period STARTS. Everyone may see their
// own; other people's pay requires admin+. Locked periods come from the stored
// snapshot and are never recalculated.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("timesheets GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role } = access;
    const url = new URL(req.url);
    const key = url.searchParams.get("period") || periodContaining(Date.now()).key;
    if (!isPeriodKey(key)) return fail("invalid_period", 400);
    const uidParam = url.searchParams.get("uid") || decoded.uid;
    const canSeeOthers = atLeast(role, "admin");
    if (uidParam !== decoded.uid && !canSeeOthers) return fail("forbidden", 403);
    if (uidParam !== "all" && !isDocId(uidParam)) return fail("invalid_uid", 400);

    const view = await readPeriod(company, key, { uids: uidParam === "all" ? undefined : [uidParam] });
    const summaries = view.employees.map((e) => ({
      uid: e.uid, name: e.name,
      status: e.calc.status, mode: e.calc.mode, engineVersion: e.calc.engineVersion,
      totalHours: e.calc.totals.hours, grossCents: e.calc.totals.grossCents, byLabel: e.calc.totals.byLabel,
      lines: e.calc.lines, issues: e.calc.issues, rateVersions: e.calc.rateVersions,
      cost: canSeeOthers ? e.calc.cost : null,
    }));
    return json({
      period: { key: view.key, start: new Date(view.period.start).toISOString(), endExclusive: new Date(view.period.end).toISOString(), endDateInclusive: view.period.endDateInclusive },
      periodStatus: view.status, fromSnapshot: view.fromSnapshot, lockedAt: view.lockedAt ?? null,
      companyName: company.name, summaries,
      totalGrossCents: summaries.reduce((s, x) => s + x.grossCents, 0),
      totalCostCents: canSeeOthers ? summaries.reduce((s, x) => s + (x.cost?.totalCents ?? 0), 0) : null,
    });
  });
}
