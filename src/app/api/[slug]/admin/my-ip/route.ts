import { NextRequest } from "next/server";
import { isAccessError, verifyCompanyRole } from "@/lib/auth";
import { getClientIp, parseIp } from "@/lib/ip";
import { accessFail, handle, json } from "@/lib/server/http";

// GET /api/[slug]/admin/my-ip — the address the server sees for the caller
// (from the trusted proxy header). Used by "use the network I'm on now".
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("admin/my-ip", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "owner");
    if (isAccessError(access)) return accessFail(access);
    const ip = getClientIp(req.headers);
    const parsed = parseIp(ip);
    return json({ ip, version: parsed?.version ?? null });
  });
}
