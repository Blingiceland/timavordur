import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { atLeast, isAccessError, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { periodContaining } from "@/lib/payroll/punches";
import { accessFail, fail, handle, HttpError, json } from "@/lib/server/http";
import { assertNotLocked } from "@/lib/server/payroll-service";
import { correctionsCol, punchCol, punchStateRef } from "@/lib/server/refs";
import { addDays } from "@/lib/server/schedule-service";
import { cleanStr, isDate, isDocId, isEnum, isTime, readJsonObject } from "@/lib/validation";

type Ctx = { params: Promise<{ slug: string }> };
const DAY = 86_400_000;

/** Proposed punch instants; an out time not after the in time is the next day. */
function correctionInstants(date: string, inTime: string | null, outTime: string | null) {
  const inAt = inTime ? Date.parse(`${date}T${inTime}:00Z`) : null;
  const outDate = inTime && outTime && outTime <= inTime ? addDays(date, 1) : date;
  const outAt = outTime ? Date.parse(`${outDate}T${outTime}:00Z`) : null;
  return { inAt, outAt };
}

/** Hash of the employee's punches around the correction — detects changes since submission. */
async function punchFingerprint(companyId: string, uid: string, from: number, to: number, tx?: FirebaseFirestore.Transaction) {
  const q = punchCol(companyId).where("uid", "==", uid)
    .where("timestamp", ">=", Timestamp.fromMillis(from)).where("timestamp", "<", Timestamp.fromMillis(to)).orderBy("timestamp", "asc");
  const snap = tx ? await tx.get(q) : await q.get();
  const h = createHash("sha256");
  snap.docs.forEach((d) => h.update(`${d.id}:${d.data().type}:${d.data().timestamp.toMillis()};`));
  return h.digest("hex").slice(0, 32);
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("corrections GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role } = access;
    const q = atLeast(role, "manager")
      ? correctionsCol(company.id).where("status", "==", "pending")
      : correctionsCol(company.id).where("status", "==", "pending").where("uid", "==", decoded.uid);
    const snap = await q.get();
    const corrections = snap.docs.map((d) => {
      const c = d.data();
      return { id: d.id, uid: c.uid, name: c.name, date: c.date, inTime: c.inTime, outTime: c.outTime, reason: c.reason, status: c.status };
    }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return json({ corrections, myRole: role });
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("corrections POST", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, staff } = access;
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const date = body.date;
    const inTime = body.inTime ? body.inTime : null;
    const outTime = body.outTime ? body.outTime : null;
    if (!isDate(date)) return fail("invalid_date", 400);
    if (!inTime && !outTime) return fail("time_required", 400);
    if ((inTime && !isTime(inTime)) || (outTime && !isTime(outTime))) return fail("invalid_time", 400);
    const { inAt, outAt } = correctionInstants(date, inTime as string | null, outTime as string | null);
    const now = Date.now();
    if ((inAt ?? 0) > now || (outAt ?? 0) > now) return fail("future_time", 400);
    if (now - (inAt ?? outAt!) > 62 * DAY) return fail("too_old", 400);
    const periods = [inAt, outAt].filter((x): x is number => x !== null).map((t) => periodContaining(t).key);
    await assertNotLocked(company.id, periods);

    const from = Math.min(inAt ?? outAt!, outAt ?? inAt!) - DAY;
    const to = Math.max(inAt ?? outAt!, outAt ?? inAt!) + DAY;
    const fingerprint = await punchFingerprint(company.id, decoded.uid, from, to);
    const ref = await correctionsCol(company.id).add({
      uid: decoded.uid, name: staff.name || decoded.name || "", date, inTime, outTime,
      inAt: inAt ? Timestamp.fromMillis(inAt) : null, outAt: outAt ? Timestamp.fromMillis(outAt) : null,
      windowFrom: from, windowTo: to, fingerprint,
      reason: cleanStr(body.reason, 300), status: "pending", createdAt: FieldValue.serverTimestamp(),
    });
    return json({ id: ref.id });
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("corrections PATCH", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role } = access;
    const body = await readJsonObject(req);
    if (!body || !isDocId(body.id) || !isEnum(body.action, ["approve", "reject", "cancel"] as const)) return fail("id_and_action_required", 400);
    const action = body.action;
    const ref = correctionsCol(company.id).doc(body.id);
    const requestId = requestIdOf(req);

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, "not_found");
      const c = snap.data()!;
      if (c.status !== "pending") throw new HttpError(409, "already_resolved");
      const nowIso = new Date().toISOString();

      if (action === "cancel") {
        if (c.uid !== decoded.uid) throw new HttpError(403, "only_requester");
        tx.update(ref, { status: "cancelled", resolvedAt: nowIso });
        return;
      }
      if (!atLeast(role, "manager")) throw new HttpError(403, "manager_required");
      if (c.uid === decoded.uid && role !== "owner") throw new HttpError(403, "cannot_approve_own");
      if (action === "reject") {
        tx.update(ref, { status: "rejected", resolvedBy: decoded.uid, resolvedAt: nowIso });
        writeAudit({ companyId: company.id, actorUid: decoded.uid, actorRole: role, action: "punch.correction.reject", targetType: "correction", targetId: ref.id, before: c, requestId }, tx);
        return;
      }

      // approve — every read first, then writes.
      const inAt: number | null = c.inAt?.toMillis?.() ?? null;
      const outAt: number | null = c.outAt?.toMillis?.() ?? null;
      const fp = await punchFingerprint(company.id, c.uid, c.windowFrom, c.windowTo, tx);
      if (fp !== c.fingerprint) throw new HttpError(409, "punches_changed_since_request");
      await assertNotLocked(company.id, [inAt, outAt].filter((x): x is number => x !== null).map((t) => periodContaining(t).key), tx);
      const stateRef = punchStateRef(company.id, c.uid);
      const state = await tx.get(stateRef);

      const created: Record<string, unknown>[] = [];
      for (const [type, at, time] of [["in", inAt, c.inTime], ["out", outAt, c.outTime]] as const) {
        if (at === null) continue;
        const pRef = punchCol(company.id).doc(`corr_${ref.id}_${type}`);
        const doc = {
          uid: c.uid, name: c.name, type, timestamp: Timestamp.fromMillis(at), date: new Date(at).toISOString().slice(0, 10),
          displayTime: time, source: "correction", correctionId: ref.id, correctedBy: decoded.uid,
        };
        tx.create(pRef, doc); // fails if it already exists → no duplicate punches
        created.push({ id: pRef.id, ...doc, timestamp: new Date(at).toISOString() });
      }
      // Keep the live punch state consistent if the correction is the latest punch.
      const lastAt = state.data()?.lastAt?.toMillis?.() ?? -1;
      const latest = [...created].sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))[0];
      if (latest && Date.parse(String(latest.timestamp)) > lastAt) {
        const ts = Timestamp.fromMillis(Date.parse(String(latest.timestamp)));
        tx.set(stateRef, { open: latest.type === "in", lastPunchId: latest.id, lastAt: ts, openSince: latest.type === "in" ? ts : null });
      }
      tx.update(ref, { status: "approved", resolvedBy: decoded.uid, resolvedAt: nowIso });
      writeAudit({ companyId: company.id, actorUid: decoded.uid, actorRole: role, action: "punch.correction.approve", targetType: "correction", targetId: ref.id, reason: c.reason, before: c, after: { punches: created }, requestId }, tx);
    });
    return json({ ok: true });
  });
}
