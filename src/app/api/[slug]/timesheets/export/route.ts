import { NextRequest } from "next/server";
import { atLeast, isAccessError, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { isPeriodKey } from "@/lib/payroll/punches";
import { buildTimesheetCsv } from "@/lib/payroll/timesheet-csv";
import { accessFail, fail, handle } from "@/lib/server/http";
import { readPeriod } from "@/lib/server/payroll-service";
import { isDocId } from "@/lib/validation";

const ASCII: Record<string, string> = { þ: "th", Þ: "Th", ð: "d", Ð: "D", æ: "ae", Æ: "Ae", ö: "o", Ö: "O" };
const asciiName = (s: string) =>
  s.replace(/[þÞðÐæÆöÖ]/g, (c) => ASCII[c]).normalize("NFD").replace(/[^A-Za-z0-9]+/g, "");

// GET /api/[slug]/timesheets/export?period=YYYY-MM&uid=all|<uid>
// Shift-level CSV (date, in, out, hours) for Excel. Same access as timesheets:
// everyone may export their own; other people's (or all) requires admin+.
// Not a payroll document: an unlocked period is marked _DROG in the file name.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("timesheets export", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role } = access;
    const url = new URL(req.url);
    const key = url.searchParams.get("period");
    if (!isPeriodKey(key)) return fail("invalid_period", 400);
    const uidParam = url.searchParams.get("uid") || decoded.uid;
    if (uidParam !== decoded.uid && !atLeast(role, "admin")) return fail("forbidden", 403);
    if (uidParam !== "all" && !isDocId(uidParam)) return fail("invalid_uid", 400);

    const view = await readPeriod(company, key, { uids: uidParam === "all" ? undefined : [uidParam] });
    const csv = buildTimesheetCsv(view.employees);
    await writeAudit({
      companyId: company.id, actorUid: decoded.uid, actorRole: role, action: "timesheet.export",
      targetType: "payrollPeriod", targetId: key, after: { status: view.status, uid: uidParam, employees: view.employees.length }, requestId: requestIdOf(req),
    });
    const who = uidParam === "all" ? "" : `_${asciiName(view.employees[0]?.name || "starfsmadur")}`;
    const name = `timaskyrsla_${company.slug}_${key}${who}${view.status === "locked" ? "" : "_DROG"}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
