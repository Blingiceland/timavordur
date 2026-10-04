import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { isAccessError, staffRef, verifyCompanyMember } from "@/lib/auth";
import { groupCompanies, groupUsernameRef, pinAccountRef } from "@/lib/server/group";
import { accessFail, fail, handle, HttpError, json } from "@/lib/server/http";
import { issuePin } from "@/lib/server/pin-issue";
import { missingRequired, REGISTRATION_FIELD_KEYS, sanitizeProfile } from "@/lib/staff-fields";
import { isUsername, readJsonObject } from "@/lib/validation";

// POST /api/[slug]/staff/register — the ONLY self-registration: a Google account.
// The person chooses a username and workplaces. A group login (username + PIN,
// PIN still empty) is created; when an admin approves, the PIN is generated and
// e-mailed to the Google address. Only profile fields are accepted; role,
// status and pay can never be set here.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("staff/register", { slug }, async () => {
    const m = await verifyCompanyMember(req, slug);
    if (isAccessError(m)) return accessFail(m);
    const { decoded, company } = m;
    if (decoded.tv_pin || decoded.firebase?.sign_in_provider !== "google.com") return fail("google_account_required", 403);
    if (decoded.email_verified !== true || !decoded.email) return fail("verified_email_required", 403);
    if (m.staff) return json({ status: m.staff.status ?? "status_missing" });

    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const { email: _ignored, companies: wantedRaw, username: rawUsername, ...fields } = body;
    void _ignored;
    const username = typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";
    if (!isUsername(username)) return fail("invalid_username", 400);
    const group = await groupCompanies(company.groupId);
    const wanted = Array.isArray(wantedRaw) && wantedRaw.length ? wantedRaw : [slug];
    const targets = group.filter((c) => (wanted as unknown[]).includes(c.slug));
    if (targets.length !== new Set(wanted).size) return fail("invalid_companies", 400);
    const p = sanitizeProfile(fields);
    if (!p.ok) return fail(p.error, 400);
    const email = decoded.email.toLowerCase();
    const name = (p.value.name as string) || decoded.name || email;
    // Every chosen workplace's required fields, checked here and not only in the form.
    const missing = REGISTRATION_FIELD_KEYS.filter((k) =>
      targets.some((c) => missingRequired({ ...p.value, name, role: "staff" }, c.registrationFields).includes(k)));
    if (missing.length) return fail("missing_required", 400, { fields: missing });
    const statuses: Record<string, string> = {};
    const uid = decoded.uid;

    await adminDb.runTransaction(async (tx) => {
      const unameRef = groupUsernameRef(company.groupId, username);
      const [taken, acct, existing] = await Promise.all([
        tx.get(unameRef),
        tx.get(pinAccountRef(company.groupId, uid)),
        Promise.all(targets.map((c) => tx.get(staffRef(c.id, uid)))),
      ]);
      if (taken.exists && taken.data()!.uid !== uid) throw new HttpError(409, "username_taken");
      if (!acct.exists) {
        tx.set(pinAccountRef(company.groupId, uid), {
          uid, username, name, email, passwordHash: null, passwordSalt: null, pinVersion: 0, createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(unameRef, { uid });
      }
      targets.forEach((c, i) => {
        if (existing[i].exists) return;
        const status = c.requireApproval ? "pending" : "approved";
        statuses[c.slug] = status;
        tx.set(staffRef(c.id, uid), {
          ...p.value, uid, email, name, username, role: "staff", status, authType: "google",
          language: p.value.language ?? "is", registeredAt: FieldValue.serverTimestamp(), registeredSelf: true,
        });
      });
    });

    // Workplaces without approval: send the PIN right away.
    const approvedNow = targets.filter((c) => statuses[c.slug] === "approved");
    let pinEmailed = false;
    if (approvedNow.length) {
      const r = await issuePin({
        groupId: company.groupId, uid, reset: false, actorUid: "self-registration", loginSlug: approvedNow[0].slug,
        origin: new URL(req.url).origin, workplaceNames: approvedNow.map((c) => c.name),
      });
      pinEmailed = r.emailed;
    }
    return json({ ok: true, status: statuses[slug] ?? Object.values(statuses)[0] ?? null, statuses, pinEmailed });
  });
}
