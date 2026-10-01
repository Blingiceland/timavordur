import { NextRequest } from "next/server";
import { isAccessError, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { buildPayrollCsv } from "@/lib/payroll/csv";
import { isPeriodKey } from "@/lib/payroll/punches";
import { accessFail, fail, handle } from "@/lib/server/http";
import { readPeriod } from "@/lib/server/payroll-service";

// GET /api/[slug]/payroll/export?period=YYYY-MM[&draft=1] (admin+)
// Without draft=1 only a LOCKED period can be exported (from its snapshot).
// A draft export is labelled "draft" in every row and never counts as payroll.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("payroll export", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const url = new URL(req.url);
    const key = url.searchParams.get("period");
    const draft = url.searchParams.get("draft") === "1";
    if (!isPeriodKey(key)) return fail("invalid_period", 400);
    const view = await readPeriod(access.company, key);
    if (view.status !== "locked" && !draft) return fail("period_not_locked", 409);

    const csv = buildPayrollCsv(key, view.status === "locked" ? "locked" : "draft", view.employees);
    await writeAudit({
      companyId: access.company.id, actorUid: access.decoded.uid, actorRole: access.role, action: "payroll.export",
      targetType: "payrollPeriod", targetId: key, after: { status: view.status, employees: view.employees.length }, requestId: requestIdOf(req),
    });
    const name = `timavordur_${access.company.slug}_${key}${view.status === "locked" ? "" : "_DROG"}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
