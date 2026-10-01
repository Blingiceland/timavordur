import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { isAccessError, staffRef, verifyCompanyMember } from "@/lib/auth";
import { groupCompanies } from "@/lib/server/group";
import { accessFail, fail, handle, json } from "@/lib/server/http";
import { sanitizeProfile } from "@/lib/staff-fields";
import { readJsonObject } from "@/lib/validation";

// POST /api/[slug]/staff/register — Google-account self-registration. Creates a
// "staff" member (pending unless approval is off). Only profile fields are
// accepted; role/status/pay can never be set here.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("staff/register", { slug }, async () => {
    const m = await verifyCompanyMember(req, slug);
    if (isAccessError(m)) return accessFail(m);
    const { decoded, company } = m;
    if (decoded.tv_pin) return fail("pin_accounts_use_signup", 400);
    if (m.staff) return json({ status: m.staff.status ?? "status_missing" });

    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const { email: _ignored, companies: wantedRaw, ...fields } = body;
    void _ignored;
    const group = await groupCompanies(company.groupId);
    const wanted = Array.isArray(wantedRaw) && wantedRaw.length ? wantedRaw : [slug];
    const targets = group.filter((c) => (wanted as unknown[]).includes(c.slug));
    if (targets.length !== new Set(wanted).size) return fail("invalid_companies", 400);
    const p = sanitizeProfile(fields);
    if (!p.ok) return fail(p.error, 400);
    const name = (p.value.name as string) || decoded.name || decoded.email || "";
    if (!name) return fail("name_required", 400);
    const statuses: Record<string, string> = {};
    const created = await adminDb.runTransaction(async (tx) => {
      const existing = await Promise.all(targets.map((c) => tx.get(staffRef(c.id, decoded.uid))));
      let n = 0;
      targets.forEach((c, i) => {
        if (existing[i].exists) return;
        const status = c.requireApproval ? "pending" : "approved";
        statuses[c.slug] = status;
        tx.set(staffRef(c.id, decoded.uid), {
          ...p.value, uid: decoded.uid, email: decoded.email || "", name, role: "staff", status, authType: "google",
          language: p.value.language ?? "is", registeredAt: FieldValue.serverTimestamp(), registeredSelf: true,
        });
        n++;
      });
      return n > 0;
    });
    return json({ ok: created, status: statuses[slug] ?? Object.values(statuses)[0] ?? null, statuses });
  });
}
