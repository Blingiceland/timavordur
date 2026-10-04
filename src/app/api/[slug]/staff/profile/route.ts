import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { isAccessError, staffRef, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { groupCompanies } from "@/lib/server/group";
import { accessFail, fail, handle, json } from "@/lib/server/http";
import { missingRequired, REGISTRATION_FIELD_KEYS, sanitizeProfile } from "@/lib/staff-fields";
import { readJsonObject } from "@/lib/validation";

// PATCH /api/[slug]/staff/profile — a member fills in their OWN profile: only the
// registration fields this workplace shows. Role, status, e-mail, username and
// pay can never be set here. The result must hold every required field, and it
// is saved at each workplace in the group where the person is a member.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("staff/profile PATCH", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, staff } = access;
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);

    const editable: readonly string[] = REGISTRATION_FIELD_KEYS.filter((k) => (company.registrationFields[k] ?? "optional") !== "hidden");
    const notAllowed = Object.keys(body).filter((k) => !editable.includes(k));
    if (notAllowed.length) return fail("field_not_allowed", 400, { fields: notAllowed });
    const p = sanitizeProfile(body);
    if (!p.ok) return fail(p.error, 400);
    const missing = missingRequired({ ...staff, ...p.value }, company.registrationFields);
    if (missing.length) return fail("missing_required", 400, { fields: missing });

    const uid = decoded.uid;
    const group = await groupCompanies(company.groupId);
    if (!group.some((c) => c.id === company.id)) group.push(company);
    const requestId = requestIdOf(req);
    const fields = Object.keys(p.value);
    await adminDb.runTransaction(async (tx) => {
      const refs = group.map((c) => staffRef(c.id, uid));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      snaps.forEach((snap, i) => {
        if (!snap.exists) return;
        tx.update(refs[i], p.value);
        // Field names only: the values are personal data.
        writeAudit({
          companyId: group[i].id, actorUid: uid, actorRole: access.role, action: "staff.profile.self_update",
          targetType: "staff", targetId: uid, after: { fields }, requestId,
        }, tx);
      });
    });
    return json({ ok: true, missingFields: [] });
  });
}
