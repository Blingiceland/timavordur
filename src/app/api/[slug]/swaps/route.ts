import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyCompanyRole, isAccessError, atLeast } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

// Shift swapping: staff arrange a "cover" (give a shift away) or a direct "swap"
// (exchange two shifts); a manager always approves before anything is applied.

interface ShiftSnapshot {
  id: string;
  date: string;        // YYYY-MM-DD
  startTime: string;
  endTime: string;
  notes?: string;
  source?: string;     // "single" | "template"
  templateId?: string;
}

const swapsCol = (companyId: string) =>
  adminDb.collection("tv_companies").doc(companyId).collection("swapRequests");
const shiftsCol = (companyId: string) =>
  adminDb.collection("tv_companies").doc(companyId).collection("shifts");

async function staffName(companyId: string, uid: string): Promise<string> {
  const d = await adminDb.collection("tv_companies").doc(companyId).collection("staff").doc(uid).get();
  return (d.data()?.name as string) || "";
}

// Move one shift from `fromUid` to `toUid`. Concrete (single) shifts are simply
// reassigned; template-generated shifts are materialised into a single shift for
// the new owner plus a cancelled override that hides the original owner's instance.
async function reassignShift(companyId: string, shift: ShiftSnapshot, fromUid: string, fromName: string, toUid: string, toName: string) {
  if (shift.source === "single") {
    await shiftsCol(companyId).doc(shift.id).update({ uid: toUid, name: toName, updatedAt: new Date().toISOString() });
    return;
  }
  // template expansion → materialise
  await shiftsCol(companyId).add({
    uid: toUid, name: toName, date: shift.date, startTime: shift.startTime, endTime: shift.endTime,
    notes: shift.notes || "", status: "scheduled", source: "single", wageEstimate: 0, totalHours: 0,
    fromSwap: true, createdAt: FieldValue.serverTimestamp(),
  });
  await shiftsCol(companyId).add({
    uid: fromUid, name: fromName, date: shift.date, startTime: shift.startTime, endTime: shift.endTime,
    status: "cancelled", source: "single", fromSwap: true, createdAt: FieldValue.serverTimestamp(),
  });
}

// ── GET — requests visible to the caller ─────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await verifyCompanyRole(req, slug);
  if (isAccessError(access)) return NextResponse.json({ error: access.error }, { status: access.status });
  const { company, decoded, role } = access;
  const isManager = atLeast(role, "manager");

  try {
    const snap = await swapsCol(company.id).where("status", "in", ["pending", "accepted"]).get();
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Record<string, unknown>[];
    const visible = all.filter(r => {
      if (isManager) return true;                                   // managers see everything (incl. approvals)
      if (r.type === "cover" && r.status === "pending") return true; // open covers anyone can take
      return [r.fromUid, r.toUid, r.claimedByUid].includes(decoded.uid);
    });
    return NextResponse.json({ requests: visible, myRole: role });
  } catch (err) {
    console.error("[swaps GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── POST — create a cover or swap request (the caller is the requester) ───────
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await verifyCompanyRole(req, slug);
  if (isAccessError(access)) return NextResponse.json({ error: access.error }, { status: access.status });
  const { company, decoded } = access;

  try {
    const body = await req.json();
    const type = body.type === "swap" ? "swap" : body.type === "cover" ? "cover" : null;
    const fromShift = body.fromShift as ShiftSnapshot | undefined;
    if (!type || !fromShift?.id || !fromShift.date) {
      return NextResponse.json({ error: "type og fromShift krafist" }, { status: 400 });
    }

    const fromName = await staffName(company.id, decoded.uid) || decoded.name || "";
    const base = {
      type, status: "pending" as const,
      fromUid: decoded.uid, fromName, fromShift,
      createdAt: FieldValue.serverTimestamp(),
    };

    if (type === "swap") {
      const toUid = typeof body.toUid === "string" ? body.toUid : "";
      const toShift = body.toShift as ShiftSnapshot | undefined;
      if (!toUid || !toShift?.id) return NextResponse.json({ error: "toUid og toShift krafist fyrir skipti" }, { status: 400 });
      if (toUid === decoded.uid) return NextResponse.json({ error: "Ekki hægt að skipta við sjálfan sig" }, { status: 400 });
      const toName = await staffName(company.id, toUid);
      const ref = await swapsCol(company.id).add({ ...base, toUid, toName, toShift });
      return NextResponse.json({ id: ref.id });
    }

    // cover
    const ref = await swapsCol(company.id).add(base);
    return NextResponse.json({ id: ref.id });
  } catch (err) {
    console.error("[swaps POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── PATCH — claim / accept / cancel / reject / approve / decline ──────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await verifyCompanyRole(req, slug);
  if (isAccessError(access)) return NextResponse.json({ error: access.error }, { status: access.status });
  const { company, decoded, role } = access;
  const isManager = atLeast(role, "manager");

  try {
    const { id, action } = await req.json();
    if (!id || !action) return NextResponse.json({ error: "id og action krafist" }, { status: 400 });

    const ref = swapsCol(company.id).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: "Beiðni fannst ekki" }, { status: 404 });
    const r = doc.data() as Record<string, unknown>;
    const myUid = decoded.uid;
    const myName = (await staffName(company.id, myUid)) || decoded.name || "";

    switch (action) {
      case "claim": { // staff B takes an open cover
        if (r.type !== "cover" || r.status !== "pending") return NextResponse.json({ error: "Vakt ekki laus" }, { status: 409 });
        if (r.fromUid === myUid) return NextResponse.json({ error: "Þú býður þessa vakt" }, { status: 400 });
        await ref.update({ status: "accepted", claimedByUid: myUid, claimedByName: myName, claimedAt: new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }
      case "accept": { // staff B accepts a direct swap addressed to them
        if (r.type !== "swap" || r.status !== "pending") return NextResponse.json({ error: "Ekki hægt að samþykkja" }, { status: 409 });
        if (r.toUid !== myUid) return NextResponse.json({ error: "Ekki þín beiðni" }, { status: 403 });
        await ref.update({ status: "accepted", acceptedAt: new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }
      case "reject": { // target declines
        const target = r.toUid === myUid;
        if (!target && !isManager) return NextResponse.json({ error: "Ekki heimilt" }, { status: 403 });
        await ref.update({ status: "rejected", resolvedBy: myUid, resolvedAt: new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }
      case "cancel": { // requester withdraws
        if (r.fromUid !== myUid) return NextResponse.json({ error: "Aðeins sá sem stofnaði getur hætt við" }, { status: 403 });
        await ref.update({ status: "cancelled", resolvedAt: new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }
      case "decline": { // manager rejects
        if (!isManager) return NextResponse.json({ error: "Aðeins yfirmaður" }, { status: 403 });
        await ref.update({ status: "rejected", resolvedBy: myUid, resolvedAt: new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }
      case "approve": { // manager approves → apply
        if (!isManager) return NextResponse.json({ error: "Aðeins yfirmaður" }, { status: 403 });
        if (r.status !== "accepted") return NextResponse.json({ error: "Beiðni er ekki tilbúin til samþykkis" }, { status: 409 });
        const fromShift = r.fromShift as ShiftSnapshot;
        const fromUid = r.fromUid as string;
        const fromName = r.fromName as string;

        if (r.type === "cover") {
          const toUid = r.claimedByUid as string;
          const toName = r.claimedByName as string;
          await reassignShift(company.id, fromShift, fromUid, fromName, toUid, toName);
        } else {
          const toUid = r.toUid as string;
          const toName = r.toName as string;
          const toShift = r.toShift as ShiftSnapshot;
          await reassignShift(company.id, fromShift, fromUid, fromName, toUid, toName);
          await reassignShift(company.id, toShift, toUid, toName, fromUid, fromName);
        }
        await ref.update({ status: "approved", approvedBy: myUid, approvedAt: new Date().toISOString() });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Óþekkt aðgerð" }, { status: 400 });
    }
  } catch (err) {
    console.error("[swaps PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
