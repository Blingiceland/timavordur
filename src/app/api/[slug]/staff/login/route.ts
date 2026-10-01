import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { getCompanyBySlug } from "@/lib/auth";
import { getClientIp } from "@/lib/ip";
import { verifyPassword } from "@/lib/password";
import { POLICIES, lockedFor, recordAttempt, resetKey } from "@/lib/rate-limit";
import { groupUsernameRef, pinAccountRef } from "@/lib/server/group";
import { fail, handle, json } from "@/lib/server/http";
import { readJsonObject } from "@/lib/validation";

// POST /api/[slug]/staff/login — username + 4-digit PIN.
// Accounts are shared by the companies in a group (e.g. Dillon + Pablo), so the
// same login works at every workplace the person belongs to. Persistent
// per-username, per-IP and per-group limits with lock-out/back-off. The custom
// token carries { tv_pin, tv_group, tv_pin_ver }: valid only inside this group
// and only until the PIN is reset.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("staff/login", { slug }, async () => {
    const body = await readJsonObject(req);
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase().slice(0, 30) : "";
    const password = typeof body?.password === "string" ? body.password.slice(0, 64) : "";
    if (!username || !password) return fail("credentials_required", 400);

    const company = await getCompanyBySlug(slug);
    if (!company) return fail("company_not_found", 404);
    const g = company.groupId;

    const ip = getClientIp(req.headers);
    const userKey = `login:user:${g}:${username}`;
    const keys = [
      { key: userKey, policy: POLICIES.loginUser },
      { key: `login:company:${g}`, policy: POLICIES.loginCompany },
      ...(ip ? [{ key: `login:ip:${g}:${ip}`, policy: POLICIES.loginIp }] : []),
    ];
    const locked = await lockedFor(keys.map((k) => k.key));
    if (locked > 0) {
      const retryAfter = Math.ceil(locked / 1000);
      return json({ error: "too_many_attempts", retryAfter }, 429, { "Retry-After": String(retryAfter) });
    }

    const idx = await groupUsernameRef(g, username).get();
    const uid = idx.exists ? (idx.data()!.uid as string) : null;
    const acct = uid ? await pinAccountRef(g, uid).get() : null;
    const a = acct?.exists ? acct.data()! : null;
    const ok = !!a && !!a.passwordHash && verifyPassword(password, a.passwordHash, a.passwordSalt);
    if (!ok) {
      const lock = await recordAttempt(keys);
      if (lock > 0) {
        const retryAfter = Math.ceil(lock / 1000);
        return json({ error: "too_many_attempts", retryAfter }, 429, { "Retry-After": String(retryAfter) });
      }
      return fail("invalid_credentials", 401);
    }
    await resetKey(userKey);

    // Pending/rejected accounts may sign in to see their status; every data route
    // still requires status === "approved" in the company being used.
    const token = await adminAuth.createCustomToken(uid!, { tv_pin: true, tv_group: g, tv_pin_ver: a!.pinVersion ?? 0 });
    return json({ token });
  });
}
