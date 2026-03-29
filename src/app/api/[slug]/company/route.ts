import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const snap = await adminDb
      .collection("tv_companies")
      .where("slug", "==", slug)
      .where("active", "==", true)
      .limit(1)
      .get();

    if (snap.empty) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = snap.docs[0].data();
    return NextResponse.json({
      id: snap.docs[0].id,
      name: data.name,
      slug: data.slug,
      registrationFields: data.registrationFields || {},
      requireApproval: data.requireApproval !== false,
    });
  } catch (err) {
    console.error("[company GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
