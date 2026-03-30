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
    const myRole = (meDoc.data()!.role as string) || "staff";
    const isManager = ["manager", "admin", "owner"].includes(myRole);

    const url = new URL(req.url);
    const from = url.searchParams.get("from") || new Date().toISOString().slice(0, 10);
    const to = url.searchParams.get("to") || from;

    // 1. Fetch single/override shifts for the date range
    let qry = adminDb.collection("tv_companies").doc(company.id).collection("shifts")
      .where("date", ">=", from).where("date", "<=", to).orderBy("date", "asc");
    if (!isManager) qry = qry.where("uid", "==", decoded.uid) as typeof qry;
    const singleSnap = await qry.get();
    const singleShifts = singleSnap.docs.map(d => ({ id: d.id, source: "single" as const, ...d.data() }));

    // 2. Fetch active templates
    const tmplSnap = await adminDb.collection("tv_companies").doc(company.id)
      .collection("shiftTemplates").where("active", "==", true).get();
    const templates = tmplSnap.docs.map(d => ({ id: d.id, ...d.data() })) as {
      id: string; uid: string; name: string; daysOfWeek: number[];
      startTime: string; endTime: string; label: string;
      hourlyRate: number; wageEstimate: number; totalHours: number;
      activeFrom?: string; activeTo?: string;
    }[];

    // 3. Build set of "overridden" slots (uid+date) from singleShifts
    const overriddenKeys = new Set(singleShifts.map(s => {
      const sd = s as Record<string, unknown>;
      return `${sd.uid}_${sd.date}`;
    }));
    const cancelledKeys = new Set(singleShifts
      .filter(s => (s as Record<string, unknown>).status === "cancelled")
      .map(s => { const sd = s as Record<string, unknown>; return `${sd.uid}_${sd.date}`; }));

    // 4. Expand templates across date range
    const templateShifts: Record<string, unknown>[] = [];
    const cur = new Date(from + "T00:00:00Z");
    const end = new Date(to + "T00:00:00Z");
    while (cur <= end) {
      const ymd = cur.toISOString().slice(0, 10);
      const dow = cur.getUTCDay();
      for (const tmpl of templates) {
        if (!tmpl.daysOfWeek.includes(dow)) continue;
        if (tmpl.activeFrom && ymd < tmpl.activeFrom) continue;
        if (tmpl.activeTo && ymd > tmpl.activeTo) continue;
        if (!isManager && tmpl.uid !== decoded.uid) continue;
        const key = `${tmpl.uid}_${ymd}`;
        if (cancelledKeys.has(key)) continue; // explicitly cancelled
        if (overriddenKeys.has(key)) continue; // single shift takes precedence
        templateShifts.push({
          id: `tmpl_${tmpl.id}_${ymd}`,
          templateId: tmpl.id,
          source: "template",
          uid: tmpl.uid, name: tmpl.name,
          date: ymd, startTime: tmpl.startTime, endTime: tmpl.endTime,
          notes: tmpl.label || "",
          status: "scheduled",
          wageEstimate: tmpl.wageEstimate || 0,
          totalHours: tmpl.totalHours || 0,
          hourlyRate: tmpl.hourlyRate || 0,
        });
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }

    // 5. Merge: single shifts + template expansions, sort by date+name
    const allShifts = [
      ...singleShifts.filter(s => (s as Record<string, unknown>).status !== "cancelled"),
      ...templateShifts,
    ].sort((a, b) => {
      const ad = a as Record<string, unknown>; const bd = b as Record<string, unknown>;
      return String(ad.date) < String(bd.date) ? -1 : String(ad.date) > String(bd.date) ? 1 : 0;
    });

    return NextResponse.json({ shifts: allShifts, myRole });
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
