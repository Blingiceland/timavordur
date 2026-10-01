import { NextRequest } from "next/server";
import { isAccessError, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf } from "@/lib/audit";
import { isPeriodKey, periodContaining } from "@/lib/payroll/punches";
import { accessFail, fail, handle, json } from "@/lib/server/http";
import { lockBlockers, readPeriod, setPeriodStatus } from "@/lib/server/payroll-service";
import { isEnum, readJsonObject } from "@/lib/validation";

// GET  /api/[slug]/payroll?period=YYYY-MM — period status, totals and blockers (admin+)
// POST /api/[slug]/payroll { period, action: review | unreview | lock } (admin+)
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("payroll GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const key = new URL(req.url).searchParams.get("period") || periodContaining(Date.now()).key;
    if (!isPeriodKey(key)) return fail("invalid_period", 400);
    const view = await readPeriod(access.company, key);
    return json({
      key, status: view.status, fromSnapshot: view.fromSnapshot, reviewedBy: view.reviewedBy ?? null, lockedBy: view.lockedBy ?? null, lockedAt: view.lockedAt ?? null,
      periodEnded: Date.now() >= view.period.end,
      employees: view.employees.map((e) => ({
        uid: e.uid, name: e.name, status: e.calc.status, hours: e.calc.totals.hours, grossCents: e.calc.totals.grossCents,
        costCents: e.calc.cost?.totalCents ?? null, issues: e.calc.issues, rateVersions: e.calc.rateVersions,
      })),
      blockers: view.status === "locked" ? [] : lockBlockers(view.employees),
      totalGrossCents: view.employees.reduce((s, e) => s + e.calc.totals.grossCents, 0),
    });
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("payroll POST", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const body = await readJsonObject(req);
    if (!body || !isPeriodKey(body.period) || !isEnum(body.action, ["review", "unreview", "lock"] as const)) return fail("period_and_action_required", 400);
    const res = await setPeriodStatus(access.company, body.period, body.action, { uid: access.decoded.uid, role: access.role }, requestIdOf(req));
    return json(res);
  });
}
