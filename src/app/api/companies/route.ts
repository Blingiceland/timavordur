import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { verifySuperAdmin } from "@/lib/auth";
import { requestIdOf } from "@/lib/audit";
import { slugify } from "@/lib/onboarding";
import { createCompany } from "@/lib/server/company-create";
import { fail, handle, json } from "@/lib/server/http";
import { readJsonObject } from "@/lib/validation";

// GET /api/companies — all companies with status and activity (superadmin only)
export async function GET(req: NextRequest) {
  return handle("companies GET", {}, async () => {
    if (!(await verifySuperAdmin(req))) return fail("not_superadmin", 403);
    const snap = await adminDb.collection("tv_companies").orderBy("createdAt", "desc").get();
    const companies = await Promise.all(snap.docs.map(async (doc) => {
      const d = doc.data();
      const [staff, last] = await Promise.all([
        doc.ref.collection("staff").count().get(),
        doc.ref.collection("punchRecords").orderBy("timestamp", "desc").limit(1).get(),
      ]);
      return {
        id: doc.id, name: d.name, slug: d.slug, adminEmails: d.adminEmails || [], active: d.active ?? true,
        status: d.status === "suspended" ? "suspended" : "active", source: d.source || "superadmin",
        createdAt: d.createdAt, kennitala: d.kennitala || "", contactPhone: d.contactPhone || "",
        groupId: d.groupId || doc.id, staffCount: staff.data().count, deleteAfter: d.deleteAfter ?? null,
        lastActivity: last.empty ? null : last.docs[0].data().timestamp?.toDate?.().toISOString() ?? null,
      };
    }));
    return json({ companies });
  });
}

// POST /api/companies — create a company with an owner invite (superadmin only)
export async function POST(req: NextRequest) {
  return handle("companies POST", {}, async () => {
    const su = await verifySuperAdmin(req);
    if (!su) return fail("not_superadmin", 403);
    const b = await readJsonObject(req);
    if (!b) return fail("invalid_body", 400);
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
    const slug = typeof b.slug === "string" && b.slug ? b.slug.trim().toLowerCase() : slugify(name);
    const adminEmail = typeof b.adminEmail === "string" ? b.adminEmail.trim().toLowerCase() : "";
    if (!name || !adminEmail.includes("@")) return fail("name_and_admin_email_required", 400);

    let groupId: string | null = null;
    if (typeof b.linkToSlug === "string" && b.linkToSlug) {
      const other = await adminDb.collection("tv_companies").where("slug", "==", b.linkToSlug).limit(1).get();
      if (other.empty) return fail("link_target_not_found", 404);
      groupId = (other.docs[0].data().groupId as string) || other.docs[0].id;
      if (!other.docs[0].data().groupId) await other.docs[0].ref.update({ groupId });
    }
    const created = await createCompany({
      name, slug, kennitala: typeof b.kennitala === "string" && b.kennitala.trim() ? b.kennitala : null,
      businessType: b.businessType === "restaurant" ? "restaurant" : "bar", source: "superadmin",
      adminEmail, groupId, createdBy: su.uid, requestId: requestIdOf(req),
    });
    return json({
      id: created.id, name, slug: created.slug, adminEmails: [adminEmail], active: true, status: "active", source: "superadmin",
      createdAt: new Date().toISOString().slice(0, 10), groupId: created.groupId, staffCount: 0, lastActivity: null,
    });
  });
}
