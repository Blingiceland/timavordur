import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifyCompanyRole, isAccessError, atLeast } from "@/lib/auth";
import { isDate, isTime, cleanStr } from "@/lib/validation";
import { FieldValue } from "firebase-admin/firestore";

// Punch corrections: a staff member who forgot to clock in/out submits a request
// (date + proposed in/out time + reason); a manager/owner approves, which creates
// the missing punch record(s).

const correctionsCol = (companyId: string) =>
  adminDb.collection("tv_companies").doc(companyId).collection("punchCorrections");
const punchCol = (companyId: string) =>
  adminDb.collection("tv_companies").doc(companyId).collection("punchRecords");

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── GET — corrections visible to the caller ──────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await verifyCompanyRole(req, slug);
  if (isAccessError(access)) return NextResponse.json({ error: access.error }, { status: access.status });
  const { company, decoded, role } = access;
  const isManager = atLeast(role, "manager");

  try {
    const snap = await correctionsCol(company.id).where("status", "==", "pending").get();
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Record<string, unknown>[];
    const visible = isManager ? all : all.filter(c => c.uid === decoded.uid);
    // newest first
    visible.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return NextResponse.json({ corrections: visible, myRole: role });
  } catch (err) {
    console.error("[corrections GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── POST — submit a correction (the caller is the staff member) ───────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await verifyCompanyRole(req, slug);
  if (isAccessError(access)) return NextResponse.json({ error: access.error }, { status: access.status });
  const { company, decoded } = access;

  try {
    const body = await req.json();
    const date = body.date;
    const inTime = body.inTime || "";
    const outTime = body.outTime || "";
    const reason = cleanStr(body.reason, 300);

    if (!isDate(date)) return NextResponse.json({ error: "Ógild dagsetning" }, { status: 400 });
    if (!inTime && !outTime) return NextResponse.json({ error: "Sláðu inn a.m.k. inn- eða út-tíma" }, { status: 400 });
    if (inTime && !isTime(inTime)) return NextResponse.json({ error: "Ógildur inn-tími (HH:MM)" }, { status: 400 });
    if (outTime && !isTime(outTime)) return NextResponse.json({ error: "Ógildur út-tími (HH:MM)" }, { status: 400 });

    const staffDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    const name = (staffDoc.data()?.name as string) || decoded.name || "";

    const ref = await correctionsCol(company.id).add({
      uid: decoded.uid, name, date,
      inTime: inTime || null, outTime: outTime || null,
      reason, status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: ref.id });
  } catch (err) {
    console.error("[corrections POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── PATCH — approve / reject / cancel ────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await verifyCompanyRole(req, slug);
  if (isAccessError(access)) return NextResponse.json({ error: access.error }, { status: access.status });
  const { company, decoded, role } = access;
  const isManager = atLeast(role, "manager");

  try {
    const { id, action } = await req.json();
    if (!id || !action) return NextResponse.json({ error: "id og action krafist" }, { status: 400 });

    const ref = correctionsCol(company.id).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: "Beiðni fannst ekki" }, { status: 404 });
    const c = doc.data() as Record<string, unknown>;
    if (c.status !== "pending") return NextResponse.json({ error: "Beiðni þegar afgreidd" }, { status: 409 });

    if (action === "cancel") {
      if (c.uid !== decoded.uid) return NextResponse.json({ error: "Aðeins sá sem stofnaði getur hætt við" }, { status: 403 });
      await ref.update({ status: "cancelled", resolvedAt: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }

    if (!isManager) return NextResponse.json({ error: "Aðeins vaktstjóri/eigandi" }, { status: 403 });

    if (action === "reject") {
      await ref.update({ status: "rejected", resolvedBy: decoded.uid, resolvedAt: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }

    if (action === "approve") {
      const date = c.date as string;
      const inTime = c.inTime as string | null;
      const outTime = c.outTime as string | null;
      const uid = c.uid as string;
      const name = c.name as string;

      if (inTime) {
        const ts = new Date(`${date}T${inTime}:00Z`);
        await punchCol(company.id).add({
          uid, name, type: "in", timestamp: ts, date,
          displayTime: inTime, correction: true, correctedBy: decoded.uid,
        });
      }
      if (outTime) {
        // if the out time is not after the in time, it belongs to the next day
        const outDate = inTime && outTime <= inTime ? addOneDay(date) : date;
        const ts = new Date(`${outDate}T${outTime}:00Z`);
        await punchCol(company.id).add({
          uid, name, type: "out", timestamp: ts, date: outDate,
          displayTime: outTime, correction: true, correctedBy: decoded.uid,
        });
      }
      await ref.update({ status: "approved", resolvedBy: decoded.uid, resolvedAt: new Date().toISOString() });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Óþekkt aðgerð" }, { status: 400 });
  } catch (err) {
    console.error("[corrections PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
