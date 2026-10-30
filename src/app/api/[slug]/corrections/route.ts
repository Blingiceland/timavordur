import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { atLeast, isAccessError, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { periodContaining } from "@/lib/payroll/punches";
import { applyCorrection, dayShiftJson, loadDayShifts } from "@/lib/server/correction-service";
import { accessFail, fail, handle, HttpError, json } from "@/lib/server/http";
import { assertNotLocked } from "@/lib/server/payroll-service";
import { correctionsCol, punchCol, staffCol } from "@/lib/server/refs";
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
  // A superseded punch changes the hash; requests filed before this marker existed keep theirs.
  snap.docs.forEach((d) => h.update(`${d.id}:${d.data().type}:${d.data().timestamp.toMillis()}${d.data().supersededBy ? ":x" : ""};`));
  return h.digest("hex").slice(0, 32);
}

/** Punch ids chosen to be replaced: a list, or "all" of the day's shifts when not given. */
function readReplaces(v: unknown): string[] | "all" | null {
  if (v === undefined) return "all";
  if (!Array.isArray(v) || v.length > 50 || !v.every(isDocId)) return null;
  return v as string[];
}

const spanOf = (inAt: number | null, outAt: number | null) =>
  inAt === null && outAt === null ? undefined : { from: Math.min(inAt ?? outAt!, outAt ?? inAt!), to: Math.max(inAt ?? outAt!, outAt ?? inAt!) };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("corrections GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role } = access;
    const url = new URL(req.url);

    // One employee's recorded shifts on a day (what a correction for it replaces).
    const date = url.searchParams.get("date");
    if (date !== null) {
      const uid = url.searchParams.get("uid") || decoded.uid;
      if (!isDate(date)) return fail("invalid_date", 400);
      if (!isDocId(uid)) return fail("invalid_uid", 400);
      if (uid !== decoded.uid && !atLeast(role, "manager")) return fail("manager_required", 403);
      const shifts = await loadDayShifts(company.id, uid, date);
      return json({ shifts: shifts.map(dayShiftJson) });
    }

    const q = atLeast(role, "manager")
      ? correctionsCol(company.id).where("status", "==", "pending")
      : correctionsCol(company.id).where("status", "==", "pending").where("uid", "==", decoded.uid);
    const snap = await q.get();
    const corrections = await Promise.all(snap.docs.map(async (d) => {
      const c = d.data();
      const span = spanOf(c.inAt?.toMillis?.() ?? null, c.outAt?.toMillis?.() ?? null);
      const replaces = isDate(c.date) && isDocId(c.uid) ? (await loadDayShifts(company.id, c.uid, c.date, span)).map(dayShiftJson) : [];
      return { id: d.id, uid: c.uid, name: c.name, date: c.date, inTime: c.inTime, outTime: c.outTime, reason: c.reason, status: c.status, replaces };
    }));
    corrections.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return json({ corrections, myRole: role });
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("corrections POST", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role, staff } = access;
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);

    // A manager may correct another employee's shift directly; their own goes through approval (the owner's does not).
    if (body.uid !== undefined && !isDocId(body.uid)) return fail("invalid_uid", 400);
    const uid = (body.uid as string | undefined) ?? decoded.uid;
    if (uid !== decoded.uid && !atLeast(role, "manager")) return fail("manager_required", 403);
    const direct = body.uid !== undefined && atLeast(role, "manager") && (uid !== decoded.uid || role === "owner");
    const replaces = readReplaces(body.replaces);
    if (replaces === null) return fail("invalid_replaces", 400);

    const date = body.date;
    const inTime = body.inTime ? body.inTime : null;
    const outTime = body.outTime ? body.outTime : null;
    if (!isDate(date)) return fail("invalid_date", 400);
    // No times = remove the chosen shifts, which only a direct edit can do.
    const removal = !inTime && !outTime;
    if (removal && !(direct && replaces !== "all" && replaces.length > 0)) return fail("time_required", 400);
    if ((inTime && !isTime(inTime)) || (outTime && !isTime(outTime))) return fail("invalid_time", 400);
    const { inAt, outAt } = correctionInstants(date, inTime as string | null, outTime as string | null);
    const now = Date.now();
    if ((inAt ?? 0) > now || (outAt ?? 0) > now) return fail("future_time", 400);
    if (now - (inAt ?? outAt ?? Date.parse(`${date}T00:00:00Z`)) > 62 * DAY) return fail("too_old", 400);
    const periods = [inAt, outAt].filter((x): x is number => x !== null).map((t) => periodContaining(t).key);
    await assertNotLocked(company.id, periods);

    let name = staff.name || decoded.name || "";
    if (uid !== decoded.uid) {
      const target = await staffCol(company.id).doc(uid).get();
      if (!target.exists) return fail("staff_not_found", 404);
      name = target.data()!.name || "";
    }
    const reason = cleanStr(body.reason, 300);

    if (direct) {
      const ref = correctionsCol(company.id).doc();
      await adminDb.runTransaction(async (tx) => {
        const res = await applyCorrection(tx, {
          companyId: company.id, uid, name, correctionId: ref.id, date, inAt, outAt,
          inTime: inTime as string | null, outTime: outTime as string | null, replaces, actorUid: decoded.uid,
        });
        const nowIso = new Date().toISOString();
        const doc = {
          uid, name, date, inTime, outTime, inAt: inAt ? Timestamp.fromMillis(inAt) : null, outAt: outAt ? Timestamp.fromMillis(outAt) : null,
          reason, status: "approved", direct: true, replaced: res.replacedIds,
          createdBy: decoded.uid, createdAt: FieldValue.serverTimestamp(), resolvedBy: decoded.uid, resolvedAt: nowIso,
        };
        tx.create(ref, doc);
        writeAudit({
          companyId: company.id, actorUid: decoded.uid, actorRole: role, action: "punch.correction.direct", targetType: "correction", targetId: ref.id, reason,
          before: { uid, date, shifts: res.replaced.map(dayShiftJson) }, after: { punches: res.created }, requestId: requestIdOf(req),
        }, tx);
      });
      return json({ id: ref.id, applied: true });
    }

    const from = Math.min(inAt ?? outAt!, outAt ?? inAt!) - DAY;
    const to = Math.max(inAt ?? outAt!, outAt ?? inAt!) + DAY;
    const fingerprint = await punchFingerprint(company.id, uid, from, to);
    const ref = await correctionsCol(company.id).add({
      uid, name, date, inTime, outTime,
      inAt: inAt ? Timestamp.fromMillis(inAt) : null, outAt: outAt ? Timestamp.fromMillis(outAt) : null,
      windowFrom: from, windowTo: to, fingerprint,
      reason, status: "pending", createdAt: FieldValue.serverTimestamp(),
    });
    return json({ id: ref.id, applied: false });
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
    const replaces = readReplaces(body.replaces);
    if (replaces === null) return fail("invalid_replaces", 400);
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
      const fp = await punchFingerprint(company.id, c.uid, c.windowFrom, c.windowTo, tx);
      if (fp !== c.fingerprint) throw new HttpError(409, "punches_changed_since_request");
      const res = await applyCorrection(tx, {
        companyId: company.id, uid: c.uid, name: c.name, correctionId: ref.id, date: c.date,
        inAt: c.inAt?.toMillis?.() ?? null, outAt: c.outAt?.toMillis?.() ?? null, inTime: c.inTime ?? null, outTime: c.outTime ?? null,
        replaces, actorUid: decoded.uid,
      });
      tx.update(ref, { status: "approved", resolvedBy: decoded.uid, resolvedAt: nowIso, replaced: res.replacedIds });
      writeAudit({
        companyId: company.id, actorUid: decoded.uid, actorRole: role, action: "punch.correction.approve", targetType: "correction", targetId: ref.id, reason: c.reason,
        before: { ...c, shifts: res.replaced.map(dayShiftJson) }, after: { punches: res.created }, requestId,
      }, tx);
    });
    return json({ ok: true });
  });
}
