import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

async function verifySuperAdmin(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.split(" ")[1]);
    const userDoc = await adminDb.collection("tv_users").doc(decoded.uid).get();
    if (userDoc.data()?.role !== "superadmin") return null;
    return decoded;
  } catch { return null; }
}

// PATCH /api/superadmin/company — add adminEmail to a company
export async function PATCH(req: NextRequest) {
  const decoded = await verifySuperAdmin(req);
  if (!decoded) return NextResponse.json({ error: "Ekki superadmin" }, { status: 403 });

  const { slug, addEmail, removEmail } = await req.json();
  if (!slug) return NextResponse.json({ error: "Slug vantar" }, { status: 400 });

  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).limit(1).get();
  if (snap.empty) return NextResponse.json({ error: "Fyrirtæki ekki fundið" }, { status: 404 });

  const docRef = snap.docs[0].ref;

  if (addEmail) {
    await docRef.update({ adminEmails: FieldValue.arrayUnion(addEmail) });
  }
  if (removEmail) {
    await docRef.update({ adminEmails: FieldValue.arrayRemove(removEmail) });
  }

  const updated = await docRef.get();
  return NextResponse.json({ ok: true, adminEmails: updated.data()?.adminEmails });
}
