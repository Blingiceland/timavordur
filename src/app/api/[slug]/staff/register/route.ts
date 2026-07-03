import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { cleanStr, isOptionalKennitala } from "@/lib/validation";
import { reportApiError } from "@/lib/report-error";

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

    const name = cleanStr(body.name) || decoded.name || decoded.email || "";
    if (!name) return NextResponse.json({ error: "Nafn vantar" }, { status: 400 });
    if (!isOptionalKennitala(body.ssn)) {
      return NextResponse.json({ error: "Ógild kennitala" }, { status: 400 });
    }

    await staffRef.set({
      uid: decoded.uid,
      email: decoded.email || "",
      name,
      status: requireApproval ? "pending" : "approved",
      language: body.language === "en" ? "en" : "is",
      // Personal details
      ssn: cleanStr(body.ssn, 11),
      phone: cleanStr(body.phone, 30),
      address: cleanStr(body.address),
      // Bank
      bankName: cleanStr(body.bankName, 80),
      bankAccount: cleanStr(body.bankAccount, 30),
      // Employment
      union: cleanStr(body.union, 80),
      pension: cleanStr(body.pension, 80),
      workPermit: typeof body.workPermit === "boolean" ? body.workPermit : null,
      workPermitExpiry: cleanStr(body.workPermitExpiry, 20),
      jobTitle: cleanStr(body.jobTitle, 80),
      employmentType: cleanStr(body.employmentType, 40),
      // Meta
      registeredAt: FieldValue.serverTimestamp(),
      registeredSelf: true,
    });

    return NextResponse.json({
      ok: true,
      status: requireApproval ? "pending" : "approved",
    });
  } catch (err) {
    await reportApiError("staff/register POST", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
