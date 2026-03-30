import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { calculateWage } from "@/lib/wage-calculator";

async function verifyToken(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try { return await adminAuth.verifyIdToken(auth.split(" ")[1]); } catch { return null; }
}

async function getCompany(slug: string) {
  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).where("active", "==", true).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as { id: string; name: string; slug: string };
}

// GET /api/[slug]/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const meDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    if (!meDoc.exists) return NextResponse.json({ error: "not_registered" }, { status: 403 });
    const me = meDoc.data()!;
    const myRole = me.role as string || "staff";
    const isManager = ["manager", "admin", "owner"].includes(myRole);

    const url = new URL(req.url);
    const from = url.searchParams.get("from") || new Date().toISOString().slice(0, 10);
    const to = url.searchParams.get("to") || from;

    let query = adminDb.collection("tv_companies").doc(company.id).collection("shifts")
      .where("date", ">=", from)
      .where("date", "<=", to)
      .orderBy("date", "asc");

    // Staff only see their own shifts
    if (!isManager) {
      query = query.where("uid", "==", decoded.uid) as typeof query;
    }

    const snap = await query.get();
    const shifts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ shifts, myRole });
  } catch (err) {
    console.error("[schedule GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/[slug]/schedule — create shift (manager+)
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const meDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    if (!meDoc.exists || !["manager", "admin", "owner"].includes(meDoc.data()?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { uid, date, startTime, endTime, notes } = body;
    if (!uid || !date || !startTime || !endTime) {
      return NextResponse.json({ error: "uid, date, startTime, endTime required" }, { status: 400 });
    }

    // Fetch staff for name + wage rate
    const staffDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(uid).get();
    const staff = staffDoc.data() || {};
    const hourlyRate = (staff.hourlyRate as number) || 0;
    const agreement = (staff.collectiveAgreement as "efling_sa" | "custom") || "efling_sa";

    // Calculate wage estimate
    const startISO = `${date}T${startTime}:00Z`;
    const endISO = endTime <= startTime
      ? `${addOneDay(date)}T${endTime}:00Z`   // crosses midnight
      : `${date}T${endTime}:00Z`;
    const punchIn = new Date(startISO);
    const punchOut = new Date(endISO);
    const wage = calculateWage(punchIn, punchOut, hourlyRate, agreement);

    const ref = await adminDb.collection("tv_companies").doc(company.id).collection("shifts").add({
      uid,
      name: staff.name || "",
      date,
      startTime,
      endTime,
      crossesMidnight: endTime <= startTime,
      notes: notes || "",
      status: "scheduled",
      wageEstimate: Math.round(wage.totalWage),
      totalHours: Math.round(wage.totalHours * 100) / 100,
      effectiveMultiplier: wage.effectiveMultiplier,
      hourlyRate,
      agreement,
      createdBy: decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id });
  } catch (err) {
    console.error("[schedule POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/[slug]/schedule — delete shift (manager+)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const meDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    if (!meDoc.exists || !["manager", "admin", "owner"].includes(meDoc.data()?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { shiftId } = await req.json();
    if (!shiftId) return NextResponse.json({ error: "shiftId required" }, { status: 400 });

    await adminDb.collection("tv_companies").doc(company.id).collection("shifts").doc(shiftId).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[schedule DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
