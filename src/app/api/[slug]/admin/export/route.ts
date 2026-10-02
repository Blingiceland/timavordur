import { NextRequest } from "next/server";
import { isAccessError, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { exportStream } from "@/lib/server/company-data";
import { accessFail, handle } from "@/lib/server/http";
import { companyRef } from "@/lib/server/refs";

// GET /api/[slug]/admin/export — owner only. Every record the company has, as
// one JSON file (staff, punches, schedule, terms, payroll, audit log). PIN
// hashes are never included.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("admin/export GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "owner");
    if (isAccessError(access)) return accessFail(access);
    const id = access.company.id;
    const company = (await companyRef(id).get()).data() ?? {};
    await writeAudit({ companyId: id, actorUid: access.decoded.uid, actorRole: access.role, action: "company.export", targetType: "company", targetId: id, requestId: requestIdOf(req) });
    const day = new Date().toISOString().slice(0, 10);
    return new Response(exportStream(id, company), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="timavordur-${slug}-${day}.json"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
