import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifySuperAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

// PATCH /api/superadmin/company — add/remove an adminEmail from a company.
// Auth: superadmin Firebase token only.
export async function PATCH(req: NextRequest) {
  if (!(await verifySuperAdmin(req))) {
    return NextResponse.json({ error: "Ekki superadmin" }, { status: 403 });
  }

  const { slug, addEmail, removEmail } = await req.json();
  if (!slug) return NextResponse.json({ error: "Slug vantar" }, { status: 400 });

  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).limit(1).get();
  if (snap.empty) return NextResponse.json({ error: "Fyrirtæki ekki fundið" }, { status: 404 });

  const docRef = snap.docs[0].ref;
  const currentData = snap.docs[0].data();

  if (addEmail) {
    if (typeof addEmail !== "string" || !addEmail.includes("@")) {
      return NextResponse.json({ error: "Ógilt netfang" }, { status: 400 });
    }
    await docRef.update({ adminEmails: FieldValue.arrayUnion(addEmail) });
  }
  if (removEmail) {
    await docRef.update({ adminEmails: FieldValue.arrayRemove(removEmail) });
  }

  const updated = await docRef.get();
  return NextResponse.json({
    ok: true,
    adminEmails: updated.data()?.adminEmails,
    previousAdminEmails: currentData.adminEmails,
  });
}
