import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

async function verifyToken(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try { return await adminAuth.verifyIdToken(auth.split(" ")[1]); } catch { return null; }
}

// POST /api/[slug]/staff/register — staff self-registration
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const snap = await adminDb.collection("tv_companies")
      .where("slug", "==", slug).where("active", "==", true).limit(1).get();
    if (snap.empty) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const companyId = snap.docs[0].id;
    const companyData = snap.docs[0].data();
    const staffRef = adminDb.collection("tv_companies").doc(companyId).collection("staff").doc(decoded.uid);
    const existing = await staffRef.get();

    // If already registered, return current status
    if (existing.exists) {
      return NextResponse.json({ status: existing.data()?.status || "pending" });
    }

    const body = await req.json();
    const requireApproval = companyData.requireApproval !== false; // default true

    await staffRef.set({
      uid: decoded.uid,
      email: decoded.email || "",
      name: body.name || decoded.displayName || decoded.email || "",
      status: requireApproval ? "pending" : "approved",
      language: body.language || "is",
      // Personal details
      ssn: body.ssn || "",
      phone: body.phone || "",
      address: body.address || "",
      // Bank
      bankName: body.bankName || "",
      bankAccount: body.bankAccount || "",
      // Employment
      union: body.union || "",
      pension: body.pension || "",
      workPermit: body.workPermit ?? null,
      workPermitExpiry: body.workPermitExpiry || "",
      jobTitle: body.jobTitle || "",
      employmentType: body.employmentType || "",
      // Meta
      registeredAt: FieldValue.serverTimestamp(),
      registeredSelf: true,
    });

    return NextResponse.json({
      ok: true,
      status: requireApproval ? "pending" : "approved",
    });
  } catch (err) {
    console.error("[staff/register POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
