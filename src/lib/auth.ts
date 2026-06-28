// Shared authentication & authorization helpers.
// Previously verifyToken / verifySuperAdmin / getCompany and the role hierarchy
// were copy-pasted across many route handlers. This is the single source of truth.

import { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb, adminAuth } from "./firebase-admin";
import type { Company, Role } from "./types";

// ── Role hierarchy ───────────────────────────────────────────────────────────
export const ROLE_LEVEL: Record<Role, number> = { staff: 1, manager: 2, admin: 3, owner: 4 };
export const atLeast = (role: Role, min: Role) => (ROLE_LEVEL[role] || 0) >= ROLE_LEVEL[min];

// ── Token verification ───────────────────────────────────────────────────────
/** Verify the Bearer token on a request. Returns the decoded token or null. */
export async function verifyToken(req: NextRequest): Promise<DecodedIdToken | null> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    return await adminAuth.verifyIdToken(auth.split(" ")[1]);
  } catch {
    return null;
  }
}

/** Verify the caller is a platform superadmin (tv_users/{uid}.role === "superadmin"). */
export async function verifySuperAdmin(req: NextRequest): Promise<DecodedIdToken | null> {
  const decoded = await verifyToken(req);
  if (!decoded) return null;
  try {
    const userDoc = await adminDb.collection("tv_users").doc(decoded.uid).get();
    if (userDoc.data()?.role !== "superadmin") return null;
    return decoded;
  } catch {
    return null;
  }
}

// ── Company lookup ───────────────────────────────────────────────────────────
/** Resolve an active company by its slug. Returns null if missing/inactive. */
export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  const snap = await adminDb
    .collection("tv_companies")
    .where("slug", "==", slug)
    .where("active", "==", true)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const d = snap.docs[0].data();
  return {
    id: snap.docs[0].id,
    name: d.name,
    slug: d.slug,
    adminEmails: (d.adminEmails || []) as string[],
    active: d.active ?? true,
    createdAt: d.createdAt,
    kennitala: d.kennitala,
    registrationFields: d.registrationFields || {},
    requireApproval: d.requireApproval !== false,
    ipRestriction: d.ipRestriction || { enabled: false, allowedIPs: [] },
    businessType: d.businessType === "restaurant" ? "restaurant" : "bar",
    wageCategories: d.wageCategories || [],
  };
}

// ── Combined company-scoped access check ─────────────────────────────────────
export interface CompanyAccess {
  decoded: DecodedIdToken;
  company: Company;
  role: Role;
}

export type AccessError = { error: string; status: number };

export function isAccessError(x: CompanyAccess | AccessError): x is AccessError {
  return (x as AccessError).status !== undefined;
}

/**
 * Verify that the caller is an approved member of the company identified by `slug`,
 * and (optionally) holds at least `minRole`. Enforces tenant isolation: a user only
 * gains access through their own staff doc inside this specific company.
 *
 * Returns either a CompanyAccess (decoded + company + role) or an AccessError with a
 * status code the caller can hand straight to NextResponse.json.
 */
export async function verifyCompanyRole(
  req: NextRequest,
  slug: string,
  minRole: Role = "staff"
): Promise<CompanyAccess | AccessError> {
  const decoded = await verifyToken(req);
  if (!decoded) return { error: "Unauthorized", status: 401 };

  const company = await getCompanyBySlug(slug);
  if (!company) return { error: "Company not found", status: 404 };

  const staffDoc = await adminDb
    .collection("tv_companies")
    .doc(company.id)
    .collection("staff")
    .doc(decoded.uid)
    .get();
  if (!staffDoc.exists) return { error: "not_registered", status: 403 };

  const data = staffDoc.data()!;
  if ((data.status || "approved") !== "approved") {
    return { error: data.status || "not_approved", status: 403 };
  }

  const role = (data.role || "staff") as Role;
  if (!atLeast(role, minRole)) return { error: "Forbidden", status: 403 };

  return { decoded, company, role };
}
