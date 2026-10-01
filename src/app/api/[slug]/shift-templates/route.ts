import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAccessError, staffRef, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { accessFail, fail, handle, json } from "@/lib/server/http";
import { templatesCol } from "@/lib/server/refs";
import { cleanStr, isDate, isDaysOfWeek, isDocId, isTime, readJsonObject } from "@/lib/validation";

type Ctx = { params: Promise<{ slug: string }> };

// GET — active templates. No pay data is stored on templates any more; costs are
// computed per dated shift by the schedule API (manager+ only).
export async function GET(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("shift-templates GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const snap = await templatesCol(access.company.id).where("active", "==", true).get();
    const templates = snap.docs
      .map((d) => {
        const t = d.data();
        return { id: d.id, uid: t.uid, name: t.name || "", daysOfWeek: t.daysOfWeek, startTime: t.startTime, endTime: t.endTime, label: t.label || "", active: true, activeFrom: t.activeFrom ?? null, activeTo: t.activeTo ?? null };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "is"));
    return json({ templates });
  });
}

// POST — create template (manager+). endTime <= startTime means it ends the next day.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("shift-templates POST", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "manager");
    if (isAccessError(access)) return accessFail(access);
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const { uid, daysOfWeek, startTime, endTime, activeFrom, activeTo } = body;
    if (!isDocId(uid) || !isDaysOfWeek(daysOfWeek) || !isTime(startTime) || !isTime(endTime)) return fail("invalid_template", 400);
    if (startTime === endTime) return fail("zero_length_shift", 400);
    if ((activeFrom && !isDate(activeFrom)) || (activeTo && !isDate(activeTo))) return fail("invalid_date", 400);
    if (activeFrom && activeTo && (activeTo as string) < (activeFrom as string)) return fail("invalid_range", 400);
    const target = await staffRef(access.company.id, uid).get();
    if (!target.exists || target.data()!.status !== "approved") return fail("staff_not_found", 404);

    const doc = {
      uid, name: target.data()!.name || "", daysOfWeek, startTime, endTime, crossesMidnight: endTime <= startTime,
      label: cleanStr(body.label, 80), active: true, activeFrom: activeFrom || null, activeTo: activeTo || null,
      createdBy: access.decoded.uid, createdAt: FieldValue.serverTimestamp(),
    };
    const ref = await templatesCol(access.company.id).add(doc);
    await writeAudit({ companyId: access.company.id, actorUid: access.decoded.uid, actorRole: access.role, action: "template.create", targetType: "shiftTemplate", targetId: ref.id, after: doc, requestId: requestIdOf(req) });
    return json({ id: ref.id });
  });
}

// DELETE — deactivate template (manager+)
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("shift-templates DELETE", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "manager");
    if (isAccessError(access)) return accessFail(access);
    const body = await readJsonObject(req);
    if (!body || !isDocId(body.templateId)) return fail("templateId_required", 400);
    const ref = templatesCol(access.company.id).doc(body.templateId);
    const snap = await ref.get();
    if (!snap.exists) return fail("not_found", 404);
    await ref.update({ active: false, deactivatedBy: access.decoded.uid, deactivatedAt: FieldValue.serverTimestamp() });
    await writeAudit({ companyId: access.company.id, actorUid: access.decoded.uid, actorRole: access.role, action: "template.deactivate", targetType: "shiftTemplate", targetId: ref.id, requestId: requestIdOf(req) });
    return json({ ok: true });
  });
}
