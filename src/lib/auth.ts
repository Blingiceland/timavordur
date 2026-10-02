// Shared authentication & authorization. Every company-scoped API route goes
// through verifyCompanyRole (approved members) or verifyCompanyMember (routes
// that must also serve unregistered/pending users, e.g. the portal status).
//
// Authority comes ONLY from the staff document's role inside the company.
// Company.adminEmails is an owner-invite list used once, at first sign-in.

import { NextRequest } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminDb, adminAuth } from "./firebase-admin";
import type { Company, Role } from "./types";
import { MAX_PIN_ROLE, ROLE_LEVEL, atLeast, isRole } from "./staff-policy";

export { ROLE_LEVEL, atLeast };

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export async function verifyToken(req: NextRequest): Promise<DecodedIdToken | null> {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return await adminAuth.verifyIdToken(header.slice(7));
  } catch {
    return null;
  }
}

export async function verifySuperAdmin(req: NextRequest): Promise<DecodedIdToken | null> {
  const decoded = await verifyToken(req);
  if (!decoded || decoded.tv_pin) return null;
  try {
    const userDoc = await adminDb.collection("tv_users").doc(decoded.uid).get();
    return userDoc.data()?.role === "superadmin" ? decoded : null;
  } catch {
    return null;
  }
}

export function companyFromDoc(id: string, d: FirebaseFirestore.DocumentData): Company {
  return {
    id,
    groupId: typeof d.groupId === "string" && d.groupId ? d.groupId : id,
    name: d.name,
    slug: d.slug,
    adminEmails: (d.adminEmails || []) as string[],
    active: d.active === true,
    createdAt: d.createdAt,
    kennitala: d.kennitala,
    registrationFields: d.registrationFields || {},
    requireApproval: d.requireApproval !== false,
    ipRestriction: d.ipRestriction || { enabled: false, allowedIPs: [] },
    businessType: d.businessType === "restaurant" ? "restaurant" : "bar",
    wageCategories: d.wageCategories || [],
  };
}

/** Resolve an ACTIVE company by slug. */
export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  if (!SLUG_RE.test(slug)) return null;
  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).where("active", "==", true).limit(2).get();
  if (snap.size !== 1) return null; // missing, or an ambiguous duplicate slug
  const status = snap.docs[0].data().status;
  if (status === "suspended" || status === "pending_review") return null; // closed, or not yet approved: no access at all
  return companyFromDoc(snap.docs[0].id, snap.docs[0].data());
}

export type StaffDoc = FirebaseFirestore.DocumentData & { uid: string };

export interface CompanyAccess {
  decoded: DecodedIdToken;
  company: Company;
  role: Role; // effective role (PIN accounts capped)
  staff: StaffDoc;
  isPinSession: boolean;
}
export type AccessError = { error: string; status: number };

export function isAccessError<T>(x: T | AccessError): x is AccessError {
  return typeof (x as AccessError)?.status === "number" && typeof (x as AccessError)?.error === "string";
}

export const staffRef = (companyId: string, uid: string) =>
  adminDb.collection("tv_companies").doc(companyId).collection("staff").doc(uid);

/**
 * PIN sessions are Firebase custom tokens with claims { tv_pin, tv_group, tv_pin_ver }.
 * They are valid only inside their own company GROUP (the companies that share
 * staff logins) and only while the group-level account's pinVersion is unchanged
 * (PIN reset or account removal bumps/deletes it → immediate revocation).
 */
export function pinSessionError(
  decoded: DecodedIdToken,
  company: Company,
  staff: FirebaseFirestore.DocumentData,
  pinAccount: FirebaseFirestore.DocumentData | null
): string | null {
  const isPinAccount = staff.authType === "password" || decoded.uid.startsWith("pw_");
  if (!isPinAccount && !decoded.tv_pin) return null;
  if (!decoded.tv_pin) return "pin_session_required";
  if (decoded.tv_group !== company.groupId) return "wrong_tenant";
  if (!pinAccount) return "session_revoked";
  if ((decoded.tv_pin_ver ?? -1) !== (pinAccount.pinVersion ?? 0)) return "session_revoked";
  return null;
}

export function effectiveRole(staff: FirebaseFirestore.DocumentData, pinSession = false): Role {
  const role: Role = isRole(staff.role) ? staff.role : "staff";
  if ((pinSession || staff.authType === "password") && ROLE_LEVEL[role] > ROLE_LEVEL[MAX_PIN_ROLE]) return MAX_PIN_ROLE;
  return role;
}

export interface MemberLookup {
  decoded: DecodedIdToken;
  company: Company;
  staff: StaffDoc | null;
}

/** Signed-in user + active company + (possibly missing) staff doc. No status/role requirement. */
export async function verifyCompanyMember(req: NextRequest, slug: string): Promise<MemberLookup | AccessError> {
  const decoded = await verifyToken(req);
  if (!decoded) return { error: "unauthorized", status: 401 };
  const company = await getCompanyBySlug(slug);
  if (!company) {
    const blocked = await blockedStatus(slug);
    return blocked ? { error: blocked, status: 403 } : { error: "company_not_found", status: 404 };
  }
  if (decoded.tv_pin && decoded.tv_group !== company.groupId) return { error: "wrong_tenant", status: 403 };
  const [doc, pinDoc] = await Promise.all([
    staffRef(company.id, decoded.uid).get(),
    decoded.tv_pin || decoded.uid.startsWith("pw_")
      ? adminDb.collection("tv_groups").doc(company.groupId).collection("pinAccounts").doc(decoded.uid).get()
      : Promise.resolve(null),
  ]);
  if (decoded.tv_pin) {
    // A PIN session must still match its group account even where it has no membership.
    const err = pinSessionError(decoded, company, { authType: "password" }, pinDoc?.exists ? pinDoc.data()! : null);
    if (err) return { error: err, status: err === "wrong_tenant" ? 403 : 401 };
  }
  if (!doc.exists) return { decoded, company, staff: null };
  const staff = { ...doc.data(), uid: doc.id } as StaffDoc;
  const pinErr = pinSessionError(decoded, company, staff, pinDoc?.exists ? pinDoc.data()! : null);
  if (pinErr) return { error: pinErr, status: 401 };
  return { decoded, company, staff };
}

/**
 * Caller must be an APPROVED member of the company with at least `minRole`.
 * A missing status is NOT treated as approved — legacy documents are migrated
 * explicitly (scripts/migrate-2026-10.mjs).
 */
export async function verifyCompanyRole(req: NextRequest, slug: string, minRole: Role = "staff"): Promise<CompanyAccess | AccessError> {
  const m = await verifyCompanyMember(req, slug);
  if (isAccessError(m)) return m;
  if (!m.staff) return { error: "not_registered", status: 403 };
  const status = m.staff.status;
  if (status !== "approved") return { error: typeof status === "string" ? status : "status_missing", status: 403 };
  const role = effectiveRole(m.staff, !!m.decoded.tv_pin);
  if (!atLeast(role, minRole)) return { error: "forbidden", status: 403 };
  return { decoded: m.decoded, company: m.company, role, staff: m.staff, isPinSession: !!m.decoded.tv_pin };
}

/** Count approved owners (for last-owner protection). */
export async function approvedOwnerCount(companyId: string, tx?: FirebaseFirestore.Transaction): Promise<number> {
  const q = adminDb.collection("tv_companies").doc(companyId).collection("staff")
    .where("role", "==", "owner").where("status", "==", "approved");
  const snap = tx ? await tx.get(q) : await q.get();
  return snap.size;
}

/** Why an existing company is not accessible: closed, or awaiting the operator's approval. */
export async function blockedStatus(slug: string): Promise<"company_suspended" | "company_pending" | null> {
  if (!SLUG_RE.test(slug)) return null;
  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).limit(1).get();
  if (snap.empty) return null;
  const status = snap.docs[0].data().status;
  return status === "suspended" ? "company_suspended" : status === "pending_review" ? "company_pending" : null;
}
