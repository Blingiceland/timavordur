import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

async function getCompany(slug: string) {
  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).where("active", "==", true).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as { name: string; adminEmails?: string[] }) };
}

async function verifyToken(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try { return await adminAuth.verifyIdToken(auth.split(" ")[1]); } catch { return null; }
}

// PATCH /api/[slug]/admin/staff — approve/reject/update a staff member
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await getCompany(slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(company.adminEmails || []).includes(decoded.email || "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { uid, action, updates } = await req.json();
  if (!uid) return NextResponse.json({ error: "uid vantar" }, { status: 400 });

  const staffRef = adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(uid);

  if (action === "approve") {
    await staffRef.update({ status: "approved", approvedAt: new Date().toISOString(), approvedBy: decoded.email });
    return NextResponse.json({ ok: true, status: "approved" });
  }
  if (action === "reject") {
    await staffRef.update({ status: "rejected", rejectedAt: new Date().toISOString(), rejectedBy: decoded.email });
    return NextResponse.json({ ok: true, status: "rejected" });
  }
  if (action === "update" && updates) {
    await staffRef.update({ ...updates, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }
  if (action === "delete") {
    await staffRef.delete();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Óþekkt aðgerð" }, { status: 400 });
}

// POST /api/[slug]/admin/staff — manually add a staff member
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const company = await getCompany(slug);
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(company.adminEmails || []).includes(decoded.email || "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { email, name } = body;
  if (!email) return NextResponse.json({ error: "Email vantar" }, { status: 400 });

  let uid: string;
  try {
    const userRecord = await adminAuth.getUserByEmail(email);
    uid = userRecord.uid;
  } catch {
    return NextResponse.json({ error: "Notandi með þetta netfang er ekki til í Firebase. Notandinn þarf fyrst að skrá sig inn með Google." }, { status: 404 });
  }

  const staffRef = adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(uid);
  await staffRef.set({
    uid, email, name: name || email.split("@")[0],
    status: "approved", // manually added = auto-approved
    language: "is",
    ssn: body.ssn || "", phone: body.phone || "", address: body.address || "",
    bankName: body.bankName || "", bankAccount: body.bankAccount || "",
    union: body.union || "", pension: body.pension || "",
    workPermit: body.workPermit ?? null, workPermitExpiry: body.workPermitExpiry || "",
    jobTitle: body.jobTitle || "", employmentType: body.employmentType || "",
    addedAt: new Date().toISOString(), addedBy: decoded.email, registeredSelf: false,
  }, { merge: true });

  return NextResponse.json({ success: true, uid });
}
