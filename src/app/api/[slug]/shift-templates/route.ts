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
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as { id: string; name: string };
}

// GET /api/[slug]/shift-templates
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const meDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    if (!meDoc.exists) return NextResponse.json({ error: "not_registered" }, { status: 403 });
    const snap = await adminDb.collection("tv_companies").doc(company.id).collection("shiftTemplates")
      .where("active", "==", true).get();
    const templates = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String((a as Record<string,unknown>).name || "").localeCompare(String((b as Record<string,unknown>).name || "")));
    return NextResponse.json({ templates });
  } catch (err) { console.error(err); return NextResponse.json({ error: "Server error" }, { status: 500 }); }
}

// POST /api/[slug]/shift-templates — create template (manager+)
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const meDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    if (!meDoc.exists || !["manager", "admin", "owner"].includes(meDoc.data()?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { uid, daysOfWeek, startTime, endTime, label, activeFrom, activeTo } = body;
    if (!uid || !daysOfWeek?.length || !startTime || !endTime) {
      return NextResponse.json({ error: "uid, daysOfWeek, startTime, endTime required" }, { status: 400 });
    }

    const staffDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(uid).get();
    const staff = staffDoc.data() || {};
    const hourlyRate = (staff.hourlyRate as number) || 0;
    const agreement = (staff.collectiveAgreement as "efling_sa" | "custom") || "efling_sa";

    // Estimate wage for one typical shift (use today's date as reference)
    const today = new Date().toISOString().slice(0, 10);
    const startISO = `${today}T${startTime}:00Z`;
    const endISO = endTime > startTime ? `${today}T${endTime}:00Z` : `${today}T${endTime}:00Z`;
    const wage = calculateWage(new Date(startISO), new Date(endISO), hourlyRate, agreement);

    const ref = await adminDb.collection("tv_companies").doc(company.id).collection("shiftTemplates").add({
      uid, name: staff.name || "",
      daysOfWeek, startTime, endTime,
      label: label || "",
      hourlyRate, agreement,
      wageEstimate: Math.round(wage.totalWage),
      totalHours: Math.round(wage.totalHours * 100) / 100,
      active: true,
      activeFrom: activeFrom || null,
      activeTo: activeTo || null,
      createdBy: decoded.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: ref.id });
  } catch (err) { console.error(err); return NextResponse.json({ error: "Server error" }, { status: 500 }); }
}

// DELETE /api/[slug]/shift-templates — deactivate template
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const meDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    if (!meDoc.exists || !["manager", "admin", "owner"].includes(meDoc.data()?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { templateId } = await req.json();
    if (!templateId) return NextResponse.json({ error: "templateId required" }, { status: 400 });
    await adminDb.collection("tv_companies").doc(company.id).collection("shiftTemplates").doc(templateId).update({ active: false });
    return NextResponse.json({ ok: true });
  } catch (err) { console.error(err); return NextResponse.json({ error: "Server error" }, { status: 500 }); }
}
