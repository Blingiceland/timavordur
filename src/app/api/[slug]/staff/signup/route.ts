import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { getCompanyBySlug } from "@/lib/auth";
import { getClientIp } from "@/lib/ip";
import { POLICIES, lockedFor, recordAttempt } from "@/lib/rate-limit";
import { groupCompanies, groupUsernameRef, pinAccountRef } from "@/lib/server/group";
import { fail, handle, HttpError, json } from "@/lib/server/http";
import { issuePin } from "@/lib/server/pin-issue";
import { staffCol } from "@/lib/server/refs";
import { cleanStr, isUsername, readJsonObject } from "@/lib/validation";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// POST /api/[slug]/staff/signup — self sign-up with name, username and e-mail.
// body.companies: slugs of the workplaces (within this company group). No PIN
// is chosen: when an admin approves, a PIN is generated and e-mailed. Always role
// "staff". The person cannot sign in until the PIN arrives.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("staff/signup", { slug }, async () => {
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
    const name = cleanStr(body.name, 120);
    if (!name) return fail("name_required", 400);
    if (!isUsername(username)) return fail("invalid_username", 400);
    if (!EMAIL_RE.test(email)) return fail("invalid_email", 400);

    const company = await getCompanyBySlug(slug);
    if (!company) return fail("company_not_found", 404);
    const group = await groupCompanies(company.groupId);
    const wanted = Array.isArray(body.companies) && body.companies.length > 0 ? body.companies : [slug];
    if (!wanted.every((s) => typeof s === "string")) return fail("invalid_companies", 400);
    const targets = group.filter((c) => (wanted as string[]).includes(c.slug));
    if (targets.length !== new Set(wanted).size) return fail("invalid_companies", 400);

    const ip = getClientIp(req.headers);
    const keys = [
      { key: `signup:company:${company.groupId}`, policy: POLICIES.signupCompany },
      ...(ip ? [{ key: `signup:ip:${company.groupId}:${ip}`, policy: POLICIES.signupIp }] : []),
    ];
    const locked = await lockedFor(keys.map((k) => k.key));
    if (locked > 0) {
      const retryAfter = Math.ceil(locked / 1000);
      return json({ error: "too_many_attempts", retryAfter }, 429, { "Retry-After": String(retryAfter) });
    }
    await recordAttempt(keys);

    const uid = "pw_" + randomBytes(12).toString("hex");
    const unameRef = groupUsernameRef(company.groupId, username);
    const statuses: Record<string, string> = {};
    await adminDb.runTransaction(async (tx) => {
      if ((await tx.get(unameRef)).exists) throw new HttpError(409, "username_taken");
      tx.set(pinAccountRef(company.groupId, uid), {
        uid, username, name, email, passwordHash: null, passwordSalt: null, pinVersion: 0, createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(unameRef, { uid });
      for (const c of targets) {
        const status = c.requireApproval ? "pending" : "approved";
        statuses[c.slug] = status;
        tx.set(staffCol(c.id).doc(uid), {
          uid, username, email, authType: "password", name, role: "staff", status, registeredSelf: true,
          language: body.language === "en" ? "en" : "is", registeredAt: FieldValue.serverTimestamp(),
        });
      }
    });

    // Workplaces without approval: send the PIN right away.
    const approvedNow = targets.filter((c) => statuses[c.slug] === "approved");
    let pinEmailed = false;
    if (approvedNow.length) {
      const r = await issuePin({
        groupId: company.groupId, uid, reset: false, actorUid: "self-signup", loginSlug: approvedNow[0].slug,
        origin: new URL(req.url).origin, workplaceNames: approvedNow.map((c) => c.name),
      });
      pinEmailed = r.emailed;
    }
    return json({ ok: true, status: statuses[slug] ?? Object.values(statuses)[0], statuses, pinEmailed });
  });
}
