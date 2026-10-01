import { NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { requestIdOf } from "@/lib/audit";
import { loginUrlFor, PRODUCT_HOST } from "@/lib/branded-hosts";
import { getClientIp } from "@/lib/ip";
import { sendMail } from "@/lib/mail";
import { isKennitala, isValidSlug, normaliseKennitala } from "@/lib/onboarding";
import { POLICIES, lockedFor, recordAttempt } from "@/lib/rate-limit";
import { createCompany } from "@/lib/server/company-create";
import { fail, handle, json } from "@/lib/server/http";
import { cleanStr, isEnum, readJsonObject } from "@/lib/validation";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// POST /api/onboarding/company — a bar/restaurant owner creates their company.
// Requires a Google sign-in with a verified e-mail. The company is active at
// once and the signed-in user is its owner. The superadmin is notified.
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

    const portal = loginUrlFor(slug);
    const notify = process.env.SUPERADMIN_NOTIFY_EMAIL;
    await Promise.all([
      notify
        ? sendMail({
            to: notify,
            subject: `Nýr staður í Tímaverði: ${name}`,
            text: `${name} (kt. ${kennitala}) skráði sig.\nEigandi: ${ownerName} <${email}>${phone ? `, sími ${phone}` : ""}\nSlóð: ${portal}\nSuperadmin: https://${PRODUCT_HOST}/superadmin`,
            html: `<p><b>${esc(name)}</b> (kt. ${esc(kennitala)}) skráði sig.</p><p>Eigandi: ${esc(ownerName)} &lt;${esc(email)}&gt;${phone ? `, sími ${esc(phone)}` : ""}</p><p><a href="${esc(portal)}">${esc(portal)}</a> · <a href="https://${PRODUCT_HOST}/superadmin">Superadmin</a></p>`,
          })
        : Promise.resolve(null),
      sendMail({
        to: email,
        subject: `Velkomin í Tímavörð — ${name}`,
        text: [
          `Hæ ${ownerName},`, "", `${name} er komið í Tímavörð. Slóðin ykkar er:`, portal, "",
          "Fyrstu skref:",
          "1. Skráðu þig inn með Google á slóðinni hér að ofan.",
          "2. Stillingar: tegund reksturs og stimplun aðeins á Wi-Fi staðarins.",
          "3. Hengdu upp QR-kóðann (á forsíðunni þinni) svo starfsfólk skrái sig.",
          "4. Samþykktu starfsfólk — það fær PIN í pósti.",
          "5. Skráðu kjör hvers og eins og búðu til fyrsta vaktaplanið.",
        ].join("\n"),
        html: `<p>Hæ ${esc(ownerName)},</p><p><b>${esc(name)}</b> er komið í Tímavörð. Slóðin ykkar er <a href="${esc(portal)}">${esc(portal)}</a>.</p>
<ol><li>Skráðu þig inn með Google á slóðinni.</li><li>Stillingar: tegund reksturs og stimplun aðeins á Wi-Fi staðarins.</li><li>Hengdu upp QR-kóðann svo starfsfólk skrái sig.</li><li>Samþykktu starfsfólk — það fær PIN í pósti.</li><li>Skráðu kjör hvers og eins og búðu til fyrsta vaktaplanið.</li></ol>`,
      }),
    ]);
    return json({ ok: true, slug: created.slug, url: portal });
  });
}
