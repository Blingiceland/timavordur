import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { getCompanyBySlug } from "@/lib/auth";
import { getClientIp } from "@/lib/ip";
import { hashPassword } from "@/lib/password";
import { POLICIES, lockedFor, recordAttempt } from "@/lib/rate-limit";
import { groupCompanies, groupUsernameRef, pinAccountRef } from "@/lib/server/group";
import { fail, handle, HttpError, json } from "@/lib/server/http";
import { staffCol } from "@/lib/server/refs";
import { cleanStr, isPin, isUsername, readJsonObject } from "@/lib/validation";
import { isWeakPin } from "@/lib/pin-policy";

// POST /api/[slug]/staff/signup — self sign-up with username + PIN.
// body.companies: slugs of the workplaces (within this company group) the
// person works at — e.g. ["dillon"], ["pablo"] or both. Always role "staff";
// "pending" in each company unless that company turned approval off.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("staff/signup", { slug }, async () => {
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const pin = typeof body.pin === "string" ? body.pin : "";
    const name = cleanStr(body.name, 120);
    if (!name) return fail("name_required", 400);
    if (!isUsername(username)) return fail("invalid_username", 400);
    if (!isPin(pin)) return fail("pin_must_be_4_digits", 400);
    if (isWeakPin(pin)) return fail("pin_too_simple", 400);

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
    const { hash, salt } = hashPassword(pin);
    const unameRef = groupUsernameRef(company.groupId, username);
    const statuses: Record<string, string> = {};
    await adminDb.runTransaction(async (tx) => {
      if ((await tx.get(unameRef)).exists) throw new HttpError(409, "username_taken");
      tx.set(pinAccountRef(company.groupId, uid), {
        uid, username, name, passwordHash: hash, passwordSalt: salt, pinVersion: 0, createdAt: FieldValue.serverTimestamp(),
      });
      tx.set(unameRef, { uid });
      for (const c of targets) {
        const status = c.requireApproval ? "pending" : "approved";
        statuses[c.slug] = status;
        tx.set(staffCol(c.id).doc(uid), {
          uid, username, authType: "password", name, role: "staff", status, registeredSelf: true,
          language: body.language === "en" ? "en" : "is", registeredAt: FieldValue.serverTimestamp(),
        });
      }
    });

    const token = await adminAuth.createCustomToken(uid, { tv_pin: true, tv_group: company.groupId, tv_pin_ver: 0 });
    return json({ ok: true, status: statuses[slug] ?? Object.values(statuses)[0], statuses, token });
  });
}
