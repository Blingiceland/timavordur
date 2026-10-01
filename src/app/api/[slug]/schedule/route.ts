import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { atLeast, isAccessError, staffRef, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { accessFail, fail, handle, json } from "@/lib/server/http";
import { shiftsCol } from "@/lib/server/refs";
import { estimateShift, loadSchedule } from "@/lib/server/schedule-service";
import { loadTermsByUid } from "@/lib/server/terms-store";
import { cleanStr, isDate, isDateRange, isDocId, isTime, readJsonObject } from "@/lib/validation";

type Ctx = { params: Promise<{ slug: string }> };
const MAX_RANGE_DAYS = 62;

// GET /api/[slug]/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
// Every approved member sees the plan (names/times). Pay estimates are only
// returned to manager+ — or, for a regular employee, on their OWN shifts.
export async function GET(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("schedule GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role } = access;
    const url = new URL(req.url);
    const from = url.searchParams.get("from") || new Date().toISOString().slice(0, 10);
    const to = url.searchParams.get("to") || from;
    if (!isDateRange(from, to, MAX_RANGE_DAYS)) return fail("invalid_range", 400);

    const shifts = await loadSchedule(company.id, from, to);
    const isManager = atLeast(role, "manager");
    const terms = await loadTermsByUid(company.id, isManager ? undefined : [decoded.uid]);
    const out = shifts.map((s) => {
      const base = { id: s.id, source: s.source, templateId: s.templateId, uid: s.uid, name: s.name, date: s.date, startTime: s.startTime, endTime: s.endTime, notes: s.notes, status: s.status };
      if (!isManager && s.uid !== decoded.uid) return base;
      return { ...base, estimate: estimateShift(s, terms.get(s.uid) ?? [], company.businessType ?? "bar") };
    });
    return json({ shifts: out, myRole: role });
  });
}

// POST — create a single shift (manager+)
export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("schedule POST", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "manager");
    if (isAccessError(access)) return accessFail(access);
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const { uid, date, startTime, endTime } = body;
    if (!isDocId(uid) || !isDate(date) || !isTime(startTime) || !isTime(endTime)) return fail("invalid_shift", 400);
    if (startTime === endTime) return fail("zero_length_shift", 400);
    const target = await staffRef(access.company.id, uid).get();
    if (!target.exists || target.data()!.status !== "approved") return fail("staff_not_found", 404);

    const doc = {
      uid, name: target.data()!.name || "", date, startTime, endTime, crossesMidnight: endTime <= startTime,
      notes: cleanStr(body.notes, 200), status: "scheduled", createdBy: access.decoded.uid, createdAt: FieldValue.serverTimestamp(),
    };
    const ref = await shiftsCol(access.company.id).add(doc);
    await writeAudit({ companyId: access.company.id, actorUid: access.decoded.uid, actorRole: access.role, action: "schedule.create", targetType: "shift", targetId: ref.id, after: doc, requestId: requestIdOf(req) });
    return json({ id: ref.id });
  });
}

// DELETE — delete a single shift (manager+)
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("schedule DELETE", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "manager");
    if (isAccessError(access)) return accessFail(access);
    const body = await readJsonObject(req);
    if (!body || !isDocId(body.shiftId)) return fail("shiftId_required", 400);
    const ref = shiftsCol(access.company.id).doc(body.shiftId);
    const snap = await ref.get();
    if (!snap.exists) return fail("not_found", 404);
    await ref.delete();
    await writeAudit({ companyId: access.company.id, actorUid: access.decoded.uid, actorRole: access.role, action: "schedule.delete", targetType: "shift", targetId: ref.id, before: snap.data(), requestId: requestIdOf(req) });
    return json({ ok: true });
  });
}
