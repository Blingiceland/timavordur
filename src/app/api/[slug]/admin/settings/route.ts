import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { isAccessError, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { normaliseAllowList } from "@/lib/ip";
import { accessFail, fail, handle, json } from "@/lib/server/http";
import { companyRef } from "@/lib/server/refs";
import { REGISTRATION_FIELD_KEYS } from "@/lib/staff-fields";
import { isEnum, readJsonObject, unknownKeys } from "@/lib/validation";

const FIELD_KEYS: readonly string[] = REGISTRATION_FIELD_KEYS;
const LEVELS = ["required", "optional", "hidden"] as const;

// GET — admin+ can read; PATCH — owner only (same as the Settings tab).
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("admin/settings GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const c = access.company;
    return json({ registrationFields: c.registrationFields, ipRestriction: c.ipRestriction, requireApproval: c.requireApproval, businessType: c.businessType });
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("admin/settings PATCH", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "owner");
    if (isAccessError(access)) return accessFail(access);
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const extra = unknownKeys(body, ["registrationFields", "ipRestriction", "requireApproval", "businessType", "onboardingDismissed"]);
    if (extra.length) return fail(`field_not_allowed:${extra.join(",")}`, 400);

    const updates: Record<string, unknown> = {};
    if (body.registrationFields !== undefined) {
      const rf = body.registrationFields as Record<string, unknown>;
      if (!rf || typeof rf !== "object" || Array.isArray(rf)) return fail("registrationFields:invalid", 400);
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(rf)) {
        if (!FIELD_KEYS.includes(k) || !isEnum(v, LEVELS)) return fail(`registrationFields:${k}`, 400);
        clean[k] = v;
      }
      updates.registrationFields = clean;
    }
    if (body.ipRestriction !== undefined) {
      const ipr = body.ipRestriction as Record<string, unknown>;
      if (!ipr || typeof ipr.enabled !== "boolean") return fail("ipRestriction:invalid", 400);
      const list = normaliseAllowList(ipr.allowedIPs ?? []);
      if (!list) return fail("ipRestriction:invalid_address", 400);
      if (ipr.enabled && list.length === 0) return fail("ipRestriction:empty_list", 400);
      updates.ipRestriction = { enabled: ipr.enabled, allowedIPs: list };
    }
    if (body.requireApproval !== undefined) {
      if (typeof body.requireApproval !== "boolean") return fail("requireApproval:boolean", 400);
      updates.requireApproval = body.requireApproval;
    }
    if (body.businessType !== undefined) {
      if (!isEnum(body.businessType, ["bar", "restaurant"] as const)) return fail("businessType:invalid", 400);
      updates.businessType = body.businessType;
      updates["onboarding.businessTypeConfirmed"] = true;
    }
    if (body.onboardingDismissed !== undefined) {
      if (typeof body.onboardingDismissed !== "boolean") return fail("onboardingDismissed:boolean", 400);
      updates["onboarding.dismissed"] = body.onboardingDismissed;
    }
    if (Object.keys(updates).length === 0) return fail("no_changes", 400);

    const ref = companyRef(access.company.id);
    await adminDb.runTransaction(async (tx) => {
      const before = (await tx.get(ref)).data() ?? {};
      tx.update(ref, updates);
      writeAudit({
        companyId: access.company.id, actorUid: access.decoded.uid, actorRole: access.role, action: "company.settings",
        targetType: "company", targetId: access.company.id,
        before: Object.fromEntries(Object.keys(updates).map((k) => [k, k.startsWith("onboarding.") ? (before.onboarding ?? {})[k.slice(11)] ?? null : before[k] ?? null])), after: updates, requestId: requestIdOf(req),
      }, tx);
    });
    return json({ ok: true, ...updates });
  });
}
