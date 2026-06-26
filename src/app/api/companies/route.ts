import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifySuperAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";
import type { Company } from "@/lib/types";

// Slug must be a short, url-safe, lowercase identifier (used as /[slug] path).
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

// GET /api/companies — list all companies (superadmin only)
export async function GET(req: NextRequest) {
  if (!(await verifySuperAdmin(req))) {
    return NextResponse.json({ error: "Ekki superadmin" }, { status: 403 });
  }
  try {
    const snap = await adminDb
      .collection("tv_companies")
      .orderBy("createdAt", "desc")
      .get();

    const companies: Partial<Company>[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
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
        kennitala: data.kennitala || "",
        staffCount: staffSnap.data().count,
      } as Partial<Company> & { staffCount: number });
    }

    return NextResponse.json({ companies });
  } catch (err) {
    console.error("[companies GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/companies — create new company (superadmin only)
export async function POST(req: NextRequest) {
  if (!(await verifySuperAdmin(req))) {
    return NextResponse.json({ error: "Ekki superadmin" }, { status: 403 });
  }
  try {
    const { name, slug, adminEmail, kennitala } = await req.json();

    if (!name || !slug || !adminEmail) {
      return NextResponse.json({ error: "Vantar nafn, slug eða admin-netfang" }, { status: 400 });
    }
    if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
      return NextResponse.json(
        { error: "Slug má aðeins innihalda lágstafi, tölur og bandstrik (2–40 stafir)" },
        { status: 400 }
      );
    }
    if (typeof adminEmail !== "string" || !adminEmail.includes("@")) {
      return NextResponse.json({ error: "Ógilt admin-netfang" }, { status: 400 });
    }

    // Slug must be unique
    const existing = await adminDb
      .collection("tv_companies")
      .where("slug", "==", slug)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ error: "Slug er þegar í notkun" }, { status: 409 });
    }

    const createdAt = new Date().toISOString().slice(0, 10);
    const docRef = await adminDb.collection("tv_companies").add({
      name,
      slug,
      kennitala: kennitala || "",
      adminEmails: [adminEmail],
      active: true,
      requireApproval: true,
      registrationFields: {},
      ipRestriction: { enabled: false, allowedIPs: [] },
      createdAt,
      createdTimestamp: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      id: docRef.id,
      name,
      slug,
      kennitala: kennitala || "",
      adminEmails: [adminEmail],
      active: true,
      createdAt,
      staffCount: 0,
    });
  } catch (err) {
    console.error("[companies POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
