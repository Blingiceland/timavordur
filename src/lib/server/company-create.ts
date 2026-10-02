// Creating a company — shared by superadmin (/api/companies) and self-service
// sign-up (/api/onboarding/company). One transaction: slug and kennitala are
// reserved through index documents so two simultaneous sign-ups cannot get the
// same address, and a self-registered owner gets their staff membership at once.

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { writeAudit } from "../audit";
import { DPA_VERSION, PRIVACY_VERSION, TERMS_VERSION } from "../legal";
import { isValidSlug, normaliseKennitala } from "../onboarding";
import { HttpError } from "./http";

export interface CreateCompanyInput {
  name: string;
  slug: string;
  kennitala: string | null;
  businessType: "bar" | "restaurant";
  source: "superadmin" | "self";
  /** Owner invite (superadmin) — becomes owner at first verified Google sign-in. */
  adminEmail?: string;
  /** Self sign-up: the signed-in Google user becomes owner immediately. */
  owner?: { uid: string; email: string; name: string };
  contactPhone?: string;
  /** Join an existing company's group (shared staff logins). */
  groupId?: string | null;
  createdBy: string;
  requestId: string;
}

export async function createCompany(input: CreateCompanyInput): Promise<{ id: string; slug: string; groupId: string }> {
  if (!isValidSlug(input.slug)) throw new HttpError(400, "invalid_slug");
  const kt = input.kennitala ? normaliseKennitala(input.kennitala) : null;
  const ref = adminDb.collection("tv_companies").doc();
  const slugRef = adminDb.collection("tv_slugs").doc(input.slug);
  const ktRef = kt ? adminDb.collection("tv_kennitolur").doc(kt) : null;
  const groupId = input.groupId || ref.id;

  await adminDb.runTransaction(async (tx) => {
    // Index docs + legacy companies created before the indexes existed.
    const [slugIdx, legacySlug, ktIdx, legacyKt] = await Promise.all([
      tx.get(slugRef),
      tx.get(adminDb.collection("tv_companies").where("slug", "==", input.slug).limit(1)),
      ktRef ? tx.get(ktRef) : Promise.resolve(null),
      kt ? tx.get(adminDb.collection("tv_companies").where("kennitala", "==", kt).limit(1)) : Promise.resolve(null),
    ]);
    if (slugIdx.exists || !legacySlug.empty) throw new HttpError(409, "slug_taken");
    if (ktIdx?.exists || (legacyKt && !legacyKt.empty)) throw new HttpError(409, "kennitala_registered");

    const now = new Date();
    const doc = {
      name: input.name,
      slug: input.slug,
      kennitala: kt ?? "",
      groupId,
      active: true,
      status: "active",
      plan: "free",
      source: input.source,
      createdBy: input.createdBy,
      adminEmails: input.adminEmail ? [input.adminEmail.trim().toLowerCase()] : input.owner ? [input.owner.email.toLowerCase()] : [],
      contactPhone: input.contactPhone ?? "",
      requireApproval: true,
      registrationFields: {},
      ipRestriction: { enabled: false, allowedIPs: [] },
      businessType: input.businessType,
      onboarding: { dismissed: false, businessTypeConfirmed: input.source === "self" },
      ...(input.source === "self" ? { termsVersion: TERMS_VERSION, dpaVersion: DPA_VERSION, privacyVersion: PRIVACY_VERSION, termsAcceptedAt: now, termsAcceptedBy: input.createdBy } : {}),
      createdAt: now.toISOString().slice(0, 10),
      createdTimestamp: FieldValue.serverTimestamp(),
    };
    tx.create(slugRef, { companyId: ref.id });
    if (ktRef) tx.create(ktRef, { companyId: ref.id });
    tx.set(ref, doc);
    if (input.owner) {
      tx.set(ref.collection("staff").doc(input.owner.uid), {
        uid: input.owner.uid, email: input.owner.email.toLowerCase(), name: input.owner.name, role: "owner", status: "approved",
        authType: "google", registeredSelf: false, language: "is", addedAt: FieldValue.serverTimestamp(),
      });
    }
    writeAudit({
      companyId: ref.id, actorUid: input.createdBy, actorRole: input.source === "self" ? "owner" : "superadmin",
      action: input.source === "self" ? "company.created_self" : "company.created", targetType: "company", targetId: ref.id,
      after: doc, requestId: input.requestId,
    }, tx);
  });
  return { id: ref.id, slug: input.slug, groupId };
}
