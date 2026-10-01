import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { atLeast, isAccessError, staffRef, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { accessFail, fail, handle, HttpError, json } from "@/lib/server/http";
import { shiftsCol, swapsCol } from "@/lib/server/refs";
import { resolveShift, sameShift, type ScheduledShift } from "@/lib/server/schedule-service";
import { isEnum, readJsonObject } from "@/lib/validation";

// Shift swapping: a "cover" (give a shift away) or a "swap" (exchange two
// shifts). A manager always approves. Shifts are resolved on the server; the
// client's description of a shift is never stored or trusted.

type Ctx = { params: Promise<{ slug: string }> };
const today = () => new Date().toISOString().slice(0, 10);

const shiftIdOf = (v: unknown): string | null => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id;
  return null;
};

/** Write the reassignment of one shift inside a transaction. */
function reassign(tx: FirebaseFirestore.Transaction, companyId: string, s: ScheduledShift, toUid: string, toName: string) {
  if (s.source === "single") {
    tx.update(shiftsCol(companyId).doc(s.id), { uid: toUid, name: toName, updatedAt: new Date().toISOString(), fromSwap: true });
    return;
  }
  const base = { date: s.date, startTime: s.startTime, endTime: s.endTime, source: "single", fromSwap: true, createdAt: FieldValue.serverTimestamp() };
  tx.set(shiftsCol(companyId).doc(), { ...base, uid: toUid, name: toName, notes: s.notes, status: "scheduled" });
  tx.set(shiftsCol(companyId).doc(), { ...base, uid: s.uid, name: s.name, status: "cancelled" });
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("swaps GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role } = access;
    const isManager = atLeast(role, "manager");
    const snap = await swapsCol(company.id).where("status", "in", ["pending", "accepted"]).get();
    const requests = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string })
      .filter((r) => isManager || (r.type === "cover" && r.status === "pending") || [r.fromUid, r.toUid, r.claimedByUid].includes(decoded.uid));
    return json({ requests, myRole: role });
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("swaps POST", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, staff } = access;
    const body = await readJsonObject(req);
    if (!body || !isEnum(body.type, ["cover", "swap"] as const)) return fail("type_required", 400);
    const fromId = shiftIdOf(body.fromShiftId ?? body.fromShift);
    if (!fromId) return fail("fromShift_required", 400);

    const fromShift = await resolveShift(company.id, fromId);
    if (fromShift.uid !== decoded.uid) return fail("not_your_shift", 403);
    if (fromShift.date < today()) return fail("shift_in_past", 409);

    const base = { type: body.type, status: "pending", fromUid: decoded.uid, fromName: staff.name || "", fromShift, createdAt: FieldValue.serverTimestamp() };
    if (body.type === "cover") {
      const ref = await swapsCol(company.id).add(base);
      return json({ id: ref.id });
    }
    const toId = shiftIdOf(body.toShiftId ?? body.toShift);
    if (!toId) return fail("toShift_required", 400);
    const toShift = await resolveShift(company.id, toId);
    if (toShift.uid === decoded.uid) return fail("cannot_swap_with_self", 400);
    if (typeof body.toUid === "string" && body.toUid !== toShift.uid) return fail("toUid_mismatch", 400);
    if (toShift.date < today()) return fail("shift_in_past", 409);
    const target = await staffRef(company.id, toShift.uid).get();
    if (!target.exists || target.data()!.status !== "approved") return fail("staff_not_found", 404);
    const ref = await swapsCol(company.id).add({ ...base, toUid: toShift.uid, toName: target.data()!.name || "", toShift });
    return json({ id: ref.id });
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("swaps PATCH", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role, staff } = access;
    const isManager = atLeast(role, "manager");
    const body = await readJsonObject(req);
    const actions = ["claim", "accept", "reject", "cancel", "decline", "approve"] as const;
    if (!body || typeof body.id !== "string" || !isEnum(body.action, actions)) return fail("id_and_action_required", 400);
    const action = body.action;
    const ref = swapsCol(company.id).doc(body.id);
    const requestId = requestIdOf(req);
    const nowIso = () => new Date().toISOString();

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, "not_found");
      const r = snap.data()!;
      const open = r.status === "pending" || r.status === "accepted";
      if (!open) throw new HttpError(409, "already_resolved");

      switch (action) {
        case "claim":
          if (r.type !== "cover" || r.status !== "pending") throw new HttpError(409, "not_available");
          if (r.fromUid === decoded.uid) throw new HttpError(400, "own_shift");
          tx.update(ref, { status: "accepted", claimedByUid: decoded.uid, claimedByName: staff.name || "", claimedAt: nowIso() });
          return;
        case "accept":
          if (r.type !== "swap" || r.status !== "pending") throw new HttpError(409, "not_acceptable");
          if (r.toUid !== decoded.uid) throw new HttpError(403, "not_addressed_to_you");
          tx.update(ref, { status: "accepted", acceptedAt: nowIso() });
          return;
        case "reject":
          if (r.toUid !== decoded.uid && !isManager) throw new HttpError(403, "forbidden");
          tx.update(ref, { status: "rejected", resolvedBy: decoded.uid, resolvedAt: nowIso() });
          return;
        case "cancel":
          if (r.fromUid !== decoded.uid) throw new HttpError(403, "only_requester");
          tx.update(ref, { status: "cancelled", resolvedAt: nowIso() });
          return;
        case "decline":
          if (!isManager) throw new HttpError(403, "manager_required");
          tx.update(ref, { status: "rejected", resolvedBy: decoded.uid, resolvedAt: nowIso() });
          writeAudit({ companyId: company.id, actorUid: decoded.uid, actorRole: role, action: "swap.decline", targetType: "swapRequest", targetId: ref.id, before: r, requestId }, tx);
          return;
        case "approve": {
          if (!isManager) throw new HttpError(403, "manager_required");
          if (r.status !== "accepted") throw new HttpError(409, "not_ready");
          // Re-resolve the shifts now and require they are unchanged since the request.
          const from = await resolveShift(company.id, r.fromShift.id, tx);
          if (!sameShift(from, r.fromShift)) throw new HttpError(409, "shift_changed_since_request");
          const takerUid: string = r.type === "cover" ? r.claimedByUid : r.toUid;
          const taker = await tx.get(staffRef(company.id, takerUid));
          if (!taker.exists || taker.data()!.status !== "approved") throw new HttpError(409, "staff_not_available");
          let to: ScheduledShift | null = null;
          if (r.type === "swap") {
            to = await resolveShift(company.id, r.toShift.id, tx);
            if (!sameShift(to, r.toShift)) throw new HttpError(409, "shift_changed_since_request");
          }
          const takerName = taker.data()!.name || "";
          reassign(tx, company.id, from, takerUid, takerName);
          if (to) reassign(tx, company.id, to, r.fromUid, r.fromName);
          tx.update(ref, { status: "approved", approvedBy: decoded.uid, approvedAt: nowIso() });
          writeAudit({ companyId: company.id, actorUid: decoded.uid, actorRole: role, action: "swap.approve", targetType: "swapRequest", targetId: ref.id, before: r, after: { from, to, takerUid }, requestId }, tx);
          return;
        }
      }
    });
    return json({ ok: true });
  });
}
