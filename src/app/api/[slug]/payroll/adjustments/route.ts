import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { isAccessError, staffRef, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { isPeriodKey } from "@/lib/payroll/punches";
import { accessFail, fail, handle, HttpError, json } from "@/lib/server/http";
import { adjustmentsCol, periodsCol } from "@/lib/server/refs";
import { cleanStr, isDocId, isEnum, isNumberIn, readJsonObject } from "@/lib/validation";

// Corrections to a LOCKED period are booked as separate adjustment records into
// a later, open period. Created by admin+, approved by a different admin or the owner.
type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("adjustments GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const snap = await adjustmentsCol(access.company.id).orderBy("createdAt", "desc").limit(200).get();
    return json({ adjustments: snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.().toISOString() ?? null })) });
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("adjustments POST", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const b = await readJsonObject(req);
    if (!b) return fail("invalid_body", 400);
    const description = cleanStr(b.description, 200);
    if (!isDocId(b.uid) || !isPeriodKey(b.originalPeriodKey) || !isPeriodKey(b.targetPeriodKey)) return fail("invalid_reference", 400);
    if (!isNumberIn(b.amountKr, -10_000_000, 10_000_000) || b.amountKr === 0 || Math.round(b.amountKr * 100) !== b.amountKr * 100) return fail("invalid_amount", 400);
    if (description.length < 3) return fail("description_required", 400);
    if (b.targetPeriodKey <= b.originalPeriodKey) return fail("target_must_be_later", 400);
    const [orig, target, staff] = await Promise.all([
      periodsCol(access.company.id).doc(b.originalPeriodKey).get(),
      periodsCol(access.company.id).doc(b.targetPeriodKey).get(),
      staffRef(access.company.id, b.uid).get(),
    ]);
    if (orig.data()?.status !== "locked") return fail("original_not_locked", 409);
    if (target.data()?.status === "locked") return fail("target_locked", 409);
    if (!staff.exists) return fail("staff_not_found", 404);
    const doc = {
      uid: b.uid, originalPeriodKey: b.originalPeriodKey, targetPeriodKey: b.targetPeriodKey,
      amountCents: Math.round(b.amountKr * 100), description, orlofEligible: b.orlofEligible !== false,
      status: "pending", createdBy: access.decoded.uid, createdAt: FieldValue.serverTimestamp(),
    };
    const ref = await adjustmentsCol(access.company.id).add(doc);
    await writeAudit({ companyId: access.company.id, actorUid: access.decoded.uid, actorRole: access.role, action: "payroll.adjustment.create", targetType: "adjustment", targetId: ref.id, after: doc, requestId: requestIdOf(req) });
    return json({ id: ref.id });
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("adjustments PATCH", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const b = await readJsonObject(req);
    if (!b || !isDocId(b.id) || !isEnum(b.action, ["approve", "reject"] as const)) return fail("id_and_action_required", 400);
    const ref = adjustmentsCol(access.company.id).doc(b.id);
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, "not_found");
      const a = snap.data()!;
      if (a.status !== "pending") throw new HttpError(409, "already_resolved");
      if (a.createdBy === access.decoded.uid && access.role !== "owner") throw new HttpError(409, "second_person_required");
      const target = await tx.get(periodsCol(access.company.id).doc(a.targetPeriodKey));
      if (target.data()?.status === "locked") throw new HttpError(409, "target_locked");
      const status = b.action === "approve" ? "approved" : "rejected";
      tx.update(ref, { status, resolvedBy: access.decoded.uid, resolvedAt: FieldValue.serverTimestamp() });
      writeAudit({ companyId: access.company.id, actorUid: access.decoded.uid, actorRole: access.role, action: `payroll.adjustment.${b.action}`, targetType: "adjustment", targetId: ref.id, before: a, after: { status }, requestId: requestIdOf(req) }, tx);
    });
    return json({ ok: true });
  });
}
