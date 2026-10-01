import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifySuperAdmin } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";
import type { Company } from "@/lib/types";
import { reportApiError } from "@/lib/report-error";

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
        groupId: data.groupId || doc.id,
        staffCount: staffSnap.data().count,
      } as Partial<Company> & { staffCount: number });
    }

    return NextResponse.json({ companies });
  } catch (err) {
    await reportApiError("companies GET", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/companies — create new company (superadmin only)
export async function POST(req: NextRequest) {
  if (!(await verifySuperAdmin(req))) {
    return NextResponse.json({ error: "Ekki superadmin" }, { status: 403 });
  }
  try {
    const { name, slug, adminEmail, kennitala, linkToSlug } = await req.json();

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

    // Optional: join the group of an existing company (shared staff logins).
    let groupId: string | null = null;
    if (linkToSlug) {
      const other = await adminDb.collection("tv_companies").where("slug", "==", String(linkToSlug)).limit(1).get();
      if (other.empty) return NextResponse.json({ error: "Fyrirtæki til að tengja við fannst ekki" }, { status: 404 });
      groupId = (other.docs[0].data().groupId as string) || other.docs[0].id;
      if (!other.docs[0].data().groupId) await other.docs[0].ref.update({ groupId });
    }

    const createdAt = new Date().toISOString().slice(0, 10);
    const newRef = adminDb.collection("tv_companies").doc();
    await newRef.set({
      groupId: groupId ?? newRef.id,
      name,
      slug,
      kennitala: kennitala || "",
      adminEmails: [adminEmail.trim().toLowerCase()],
      active: true,
      requireApproval: true,
      registrationFields: {},
      ipRestriction: { enabled: false, allowedIPs: [] },
      createdAt,
      createdTimestamp: FieldValue.serverTimestamp(),
    });
    const docRef = newRef;

    return NextResponse.json({
      id: docRef.id,
      groupId: groupId ?? docRef.id,
      name,
      slug,
      kennitala: kennitala || "",
      adminEmails: [adminEmail.trim().toLowerCase()],
      active: true,
      createdAt,
      staffCount: 0,
    });
  } catch (err) {
    await reportApiError("companies POST", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
