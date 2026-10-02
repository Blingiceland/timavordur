import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { requestIdOf } from "@/lib/audit";
import { getClientIp } from "@/lib/ip";
import { isKennitala, isValidSlug, normaliseKennitala } from "@/lib/onboarding";
import { POLICIES, lockedFor, recordAttempt } from "@/lib/rate-limit";
import { createCompany } from "@/lib/server/company-create";
import { mailOperatorNewVenue, mailOwnerReceived } from "@/lib/server/onboarding-mail";
import { fail, handle, json } from "@/lib/server/http";
import { cleanStr, isEnum, readJsonObject } from "@/lib/validation";

// POST /api/onboarding/company — a bar/restaurant owner creates their company.
// Requires a Google sign-in with a verified e-mail. The signed-in user is its
// owner; the company waits for the operator's approval (superadmin) before
// anyone can use it. Operator and owner are e-mailed.
export async function POST(req: NextRequest) {
  return handle("onboarding/company", {}, async () => {
    const decoded = await verifyToken(req);
    if (!decoded) return fail("unauthorized", 401);
    const email = (decoded.email || "").toLowerCase();
    if (decoded.tv_pin || decoded.firebase?.sign_in_provider !== "google.com" || decoded.email_verified !== true || !email) {
      return fail("google_account_required", 403);
    }

    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const name = cleanStr(body.name, 80);
    const slug = typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "";
    const kennitala = normaliseKennitala(body.kennitala);
    const phone = cleanStr(body.phone, 30);
    const ownerName = cleanStr(body.ownerName, 120) || decoded.name || email;
    if (name.length < 2) return fail("name_required", 400);
    if (!isValidSlug(slug)) return fail("invalid_slug", 400);
    if (!kennitala || !isKennitala(kennitala)) return fail("invalid_kennitala", 400);
    if (!isEnum(body.businessType, ["bar", "restaurant"] as const)) return fail("businessType_required", 400);
    if (body.acceptTerms !== true || body.authorized !== true) return fail("terms_required", 400);

    const ip = getClientIp(req.headers);
    const keys = [
      { key: `company-signup:user:${decoded.uid}`, policy: POLICIES.companySignupUser },
      ...(ip ? [{ key: `company-signup:ip:${ip}`, policy: POLICIES.companySignupIp }] : []),
    ];
    const locked = await lockedFor(keys.map((k) => k.key));
    if (locked > 0) {
      const retryAfter = Math.ceil(locked / 1000);
      return json({ error: "too_many_attempts", retryAfter }, 429, { "Retry-After": String(retryAfter) });
    }
    await recordAttempt(keys);

    const created = await createCompany({
      name, slug, kennitala, businessType: body.businessType, source: "self",
      owner: { uid: decoded.uid, email, name: ownerName }, contactPhone: phone,
      createdBy: decoded.uid, requestId: requestIdOf(req),
    });

    const venue = { name, slug: created.slug, kennitala, ownerName, ownerEmail: email, phone };
    await Promise.all([mailOperatorNewVenue(venue), mailOwnerReceived(venue)]);
    return json({ ok: true, slug: created.slug, status: "pending_review" });
  });
}
