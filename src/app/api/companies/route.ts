import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export interface Company {
  id: string;
  name: string;
  slug: string;
  adminEmails: string[];
  active: boolean;
  createdAt: string;
  staffCount?: number;
}

// GET /api/companies — list all companies
export async function GET() {
  try {
    const snap = await adminDb
      .collection("tv_companies")
      .orderBy("createdAt", "desc")
      .get();

    const companies: Company[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      // Count staff
      const staffSnap = await adminDb
        .collection("tv_companies")
        .doc(doc.id)
        .collection("staff")
        .count()
        .get();

      companies.push({
        id: doc.id,
        name: data.name,
        slug: data.slug,
        adminEmails: data.adminEmails || [],
        active: data.active ?? true,
        createdAt: data.createdAt,
        staffCount: staffSnap.data().count,
      });
    }

    return NextResponse.json({ companies });
  } catch (err) {
    console.error("[companies GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/companies — create new company
export async function POST(req: NextRequest) {
  try {
    const { name, slug, adminEmail } = await req.json();

    if (!name || !slug || !adminEmail) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Check slug is unique
    const existing = await adminDb
      .collection("tv_companies")
      .where("slug", "==", slug)
      .get();

    if (!existing.empty) {
      return NextResponse.json(
        { error: "Slug er þegar í notkun" },
        { status: 409 }
      );
    }

    const docRef = await adminDb.collection("tv_companies").add({
      name,
      slug,
      adminEmails: [adminEmail],
      active: true,
      createdAt: new Date().toISOString().slice(0, 10),
      createdTimestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      id: docRef.id,
      name,
      slug,
      adminEmails: [adminEmail],
      active: true,
      createdAt: new Date().toISOString().slice(0, 10),
      staffCount: 0,
    });
  } catch (err) {
    console.error("[companies POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
