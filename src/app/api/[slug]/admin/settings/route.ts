import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

async function getCompany(slug: string) {
  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).where("active", "==", true).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as { name: string; adminEmails?: string[]; registrationFields?: object; ipRestriction?: object }) };
}

async function verifyAdmin(req: NextRequest, slug: string) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(auth.split(" ")[1]);
    const company = await getCompany(slug);
    if (!company || !(company.adminEmails || []).includes(decoded.email || "")) return null;
    return { decoded, company };
  } catch { return null; }
}

// GET /api/[slug]/admin/settings — get company settings
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await verifyAdmin(req, slug);
  if (!result) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = result.company as Record<string, unknown>;
  return NextResponse.json({
    registrationFields: c.registrationFields || {},
    ipRestriction: c.ipRestriction || { enabled: false, allowedIPs: [] },
    businessType: c.businessType === "restaurant" ? "restaurant" : "bar",
    wageCategories: c.wageCategories || [],
  });
}

// PATCH /api/[slug]/admin/settings — update company settings
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await verifyAdmin(req, slug);
  if (!result) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { company } = result;

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.registrationFields !== undefined) updates.registrationFields = body.registrationFields;
  if (body.ipRestriction !== undefined) updates.ipRestriction = body.ipRestriction;
  if (body.requireApproval !== undefined) updates.requireApproval = body.requireApproval;
  if (body.businessType === "bar" || body.businessType === "restaurant") updates.businessType = body.businessType;
  if (Array.isArray(body.wageCategories)) {
    // sanitise each category
    updates.wageCategories = body.wageCategories
      .filter((c: unknown) => c && typeof c === "object")
      .map((c: Record<string, unknown>) => ({
        id: String(c.id || "").slice(0, 40),
        name: String(c.name || "").slice(0, 80),
        description: String(c.description || "").slice(0, 200),
        dayRate: Math.max(0, Math.round(Number(c.dayRate) || 0)),
      }))
      .filter((c: { id: string }) => c.id);
  }

  await adminDb.collection("tv_companies").doc(company.id).update(updates);
  return NextResponse.json({ ok: true });
}
