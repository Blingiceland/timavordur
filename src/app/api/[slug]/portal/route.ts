import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { approvedOwnerCount, effectiveRole, isAccessError, staffRef, verifyCompanyMember, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { checkIpRestriction, getClientIp } from "@/lib/ip";
import { hashPassword } from "@/lib/password";
import { isWeakPin } from "@/lib/pin-policy";
import { pairPunches, periodContaining } from "@/lib/payroll/punches";
import { groupCompanies, groupUsernameRef, pinAccountRef } from "@/lib/server/group";
import { accessFail, fail, handle, HttpError, json } from "@/lib/server/http";
import { loadPunches } from "@/lib/server/payroll-service";
import { recordPunch } from "@/lib/server/punch-service";
import { companyRef, punchStateRef, staffCol } from "@/lib/server/refs";
import { decideStaffAction, isRole, atLeast } from "@/lib/staff-policy";
import { PROFILE_FIELDS, sanitizeProfile } from "@/lib/staff-fields";
import type { Company, Role } from "@/lib/types";
import { cleanStr, isDocId, isEnum, isIdempotencyKey, isPin, isUsername, readJsonObject } from "@/lib/validation";

type Ctx = { params: Promise<{ slug: string }> };

const toIso = (v: unknown): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === "function" ? t.toDate().toISOString() : "";
};

const DAY = 86_400_000;

/** The caller's membership at every workplace of the group (for the location choice). */
async function memberships(group: Company[], uid: string, clientIp: string | null) {
  return Promise.all(group.map(async (c) => {
    const [s, st] = await Promise.all([staffRef(c.id, uid).get(), punchStateRef(c.id, uid).get()]);
    if (!s.exists) return null;
    return {
      slug: c.slug, name: c.name, status: typeof s.data()!.status === "string" ? s.data()!.status : "status_missing",
      role: effectiveRole(s.data()!), isPunchedIn: st.exists ? !!st.data()!.open : false,
      // true/false when the workplace restricts by network; null when it does not
      onNetwork: c.ipRestriction?.enabled ? checkIpRestriction(c.ipRestriction, clientIp).allowed : null,
    };
  })).then((x) => x.filter((m): m is NonNullable<typeof m> => m !== null));
}

// ── GET — status and role-appropriate data ───────────────────────────────────
export async function GET(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("portal GET", { slug }, async () => {
    const m = await verifyCompanyMember(req, slug);
    if (isAccessError(m)) return accessFail(m);
    const { decoded, company } = m;
    let staff = m.staff;

    // Owner invite: an address on company.adminEmails becomes the owner on its
    // first verified Google sign-in. After that, authority lives only in staff.role.
    if (!staff) {
      const email = (decoded.email || "").toLowerCase();
      const invited =
        !!email && decoded.email_verified === true && decoded.firebase?.sign_in_provider === "google.com" && !decoded.tv_pin &&
        company.adminEmails.some((e) => e.toLowerCase() === email);
      if (invited) {
        const ref = staffRef(company.id, decoded.uid);
        await adminDb.runTransaction(async (tx) => {
          if ((await tx.get(ref)).exists) return;
          const doc = {
            uid: decoded.uid, email, name: decoded.name || email, role: "owner", status: "approved",
            addedAt: FieldValue.serverTimestamp(), registeredSelf: false, language: "is", authType: "google",
          };
          tx.set(ref, doc);
          writeAudit({ companyId: company.id, actorUid: decoded.uid, actorRole: "owner", action: "staff.owner_invite_claimed", targetType: "staff", targetId: decoded.uid, after: doc, requestId: requestIdOf(req) }, tx);
        });
        const snap = await ref.get();
        staff = { ...snap.data(), uid: snap.id };
      }
    }

    const group = await groupCompanies(company.groupId);
    const clientIp = getClientIp(req.headers);
    const mine = await memberships(group, decoded.uid, clientIp);
    const groupList = group.map((c) => ({ slug: c.slug, name: c.name }));

    if (!staff) {
      return json({
        registered: false, status: null, companyName: company.name, registrationFields: company.registrationFields,
        requireApproval: company.requireApproval, groupCompanies: groupList, memberships: mine, isPinSession: !!decoded.tv_pin,
      });
    }
    const role = effectiveRole(staff);
    const status = typeof staff.status === "string" ? staff.status : "status_missing";
    if (status !== "approved") return json({ registered: true, status, role, name: staff.name, companyName: company.name, memberships: mine, groupCompanies: groupList });

    const now = Date.now();
    const period = periodContaining(now);
    const todayStart = Math.floor(now / DAY) * DAY;
    const punches = await loadPunches(company.id, period.start - DAY, now + 60_000);
    const hoursIn = (uid: string, from: number) => {
      const res = pairPunches(punches.get(uid) ?? [], now);
      let ms = 0; let shifts = 0;
      for (const s of res.shifts) {
        const a = Math.max(s.start, from); const b = Math.min(s.end, now);
        if (b > a) { ms += b - a; if (s.start >= from) shifts++; }
      }
      return { hours: ms / 3_600_000, shifts };
    };
    const here = mine.find((x) => x.slug === company.slug);
    const today = hoursIn(decoded.uid, todayStart);
    const per = hoursIn(decoded.uid, period.start);
    const base = {
      registered: true, status: "approved", role, name: staff.name, companyName: company.name, isPinSession: !!decoded.tv_pin,
      isPunchedIn: here?.isPunchedIn ?? false, todayHours: today.hours, periodHours: per.hours, shifts: per.shifts, periodKey: period.key,
      memberships: mine, groupCompanies: groupList,
    };
    if (!atLeast(role, "manager")) return json(base);

    const [staffSnap, statesSnap] = await Promise.all([staffCol(company.id).get(), companyRef(company.id).collection("punchState").get()]);
    const openByUid = new Map(statesSnap.docs.map((d) => [d.id, !!d.data().open]));
    const team = staffSnap.docs.filter((d) => d.id !== decoded.uid).map((d) => {
      const s = d.data();
      const st = typeof s.status === "string" ? s.status : "status_missing";
      return {
        uid: d.id, name: s.name, email: s.email || "", role: effectiveRole(s), status: st,
        isPunchedIn: st === "approved" ? openByUid.get(d.id) ?? false : false,
        todayHours: st === "approved" ? hoursIn(d.id, todayStart).hours : 0,
      };
    });
    if (!atLeast(role, "admin")) return json({ ...base, team });

    // Which workplaces each person belongs to, and where the caller may manage staff.
    const otherSnaps = await Promise.all(group.map((c) => (c.id === company.id ? Promise.resolve(staffSnap) : staffCol(c.id).get())));
    const companiesByUid = new Map<string, string[]>();
    group.forEach((c, i) => otherSnaps[i].docs.forEach((d) => companiesByUid.set(d.id, [...(companiesByUid.get(d.id) ?? []), c.slug])));
    const manageable = group.filter((c, i) => {
      const me = otherSnaps[i].docs.find((d) => d.id === decoded.uid)?.data();
      return !!me && me.status === "approved" && atLeast(effectiveRole(me), "admin");
    }).map((c) => c.slug);

    const staffList = staffSnap.docs.map((d) => {
      const s = d.data();
      return {
        uid: d.id, name: s.name, email: s.email || "", username: s.username || "", authType: s.authType || "",
        role: isRole(s.role) ? s.role : "staff", status: typeof s.status === "string" ? s.status : "status_missing",
        ssn: s.ssn || "", phone: s.phone || "", address: s.address || "", bankName: s.bankName || "", bankAccount: s.bankAccount || "",
        union: s.union || "", pension: s.pension || "", workPermit: s.workPermit ?? null, workPermitExpiry: s.workPermitExpiry || "",
        jobTitle: s.jobTitle || "", employmentType: s.employmentType || "", language: s.language || "is",
        addedAt: toIso(s.addedAt || s.registeredAt), companies: companiesByUid.get(d.id) ?? [company.slug],
      };
    });
    return json({
      ...base, team, staffList, manageableCompanies: manageable, registrationFields: company.registrationFields,
      requireApproval: company.requireApproval, ipRestriction: company.ipRestriction, businessType: company.businessType,
    });
  });
}

// ── POST — punch in/out at THIS workplace (the single punch path) ─────────────
export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("portal POST", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, staff } = access;
    const body = await readJsonObject(req);
    if (!body || !isEnum(body.action, ["in", "out"] as const)) return fail("action_required", 400);
    if (!isIdempotencyKey(body.idempotencyKey)) return fail("idempotency_key_required", 400);

    const clientIp = getClientIp(req.headers);
    const ipCheck = checkIpRestriction(company.ipRestriction, clientIp);
    if (!ipCheck.allowed) return fail(ipCheck.reason, 403);

    const group = await groupCompanies(company.groupId);
    const result = await recordPunch({
      companyId: company.id, uid: decoded.uid, name: staff.name || decoded.name || "", email: staff.email || decoded.email || "",
      action: body.action, idempotencyKey: body.idempotencyKey, clientIp,
      otherCompanyIds: group.map((c) => c.id).filter((id) => id !== company.id),
    });
    return json({ ...result, companySlug: company.slug, companyName: company.name });
  });
}

/** Copy profile fields of an existing membership into a new workplace. */
const profileOf = (s: FirebaseFirestore.DocumentData) =>
  Object.fromEntries(PROFILE_FIELDS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]));

// ── PATCH — staff management (admin+, owner for protected roles) ──────────────
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("portal PATCH", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role: myRole } = access;
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const { uid, action } = body;
    if (!isDocId(uid)) return fail("uid_required", 400);
    const actions = ["approve", "reject", "update", "reset-pin", "set-role", "delete", "set-companies"] as const;
    if (!isEnum(action, actions)) return fail("unknown_action", 400);
    const requestId = requestIdOf(req);
    const ref = staffRef(company.id, uid);
    const g = company.groupId;

    if (action === "set-companies") return setCompanies(req, company, decoded.uid, uid, body.companies, requestId);

    // Validate payloads before the transaction.
    let profile: Record<string, unknown> | null = null;
    let newUsername: string | null = null;
    if (action === "update") {
      const updates = body.updates;
      if (!updates || typeof updates !== "object" || Array.isArray(updates)) return fail("updates_required", 400);
      const u = { ...(updates as Record<string, unknown>) };
      if (u.username !== undefined) {
        newUsername = typeof u.username === "string" ? u.username.trim().toLowerCase() : "";
        delete u.username;
        if (newUsername === "") newUsername = null;
        else if (!isUsername(newUsername)) return fail("invalid_username", 400);
      }
      const p = sanitizeProfile(u);
      if (!p.ok) return fail(p.error, 400);
      profile = p.value;
    }
    if (action === "reset-pin") {
      if (!isPin(body.pin)) return fail("pin_must_be_4_digits", 400);
      if (isWeakPin(body.pin)) return fail("pin_too_simple", 400);
    }
    if (action === "set-role" && !isRole(body.role)) return fail("invalid_role", 400);

    const group = action === "delete" ? await groupCompanies(g) : [];
    let revoke = false;
    const result = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpError(404, "not_found");
      const target = snap.data()!;
      const owners = await approvedOwnerCount(company.id, tx);
      const policyAction = action === "reset-pin" ? "reset_pin" : action === "set-role" ? "set_role" : action;
      const decision = decideStaffAction({ uid: decoded.uid, role: myRole }, policyAction, {
        uid, role: isRole(target.role) ? target.role : "staff", status: String(target.status ?? ""), authType: target.authType,
      }, { newRole: body.role as Role | undefined, approvedOwnerCount: owners });
      if (!decision.ok) throw new HttpError(decision.status, decision.error);

      const isPinPerson = target.authType === "password" || uid.startsWith("pw_");
      const acctRef = pinAccountRef(g, uid);
      const acct = isPinPerson ? await tx.get(acctRef) : null;

      let unameRef: FirebaseFirestore.DocumentReference | null = null;
      if (newUsername && newUsername !== target.username) {
        unameRef = groupUsernameRef(g, newUsername);
        if ((await tx.get(unameRef)).exists) throw new HttpError(409, "username_taken");
      }
      // Other memberships (for deletion: keep the shared account if any remain).
      const others = action === "delete"
        ? (await Promise.all(group.filter((c) => c.id !== company.id).map((c) => tx.get(staffRef(c.id, uid))))).filter((d) => d.exists)
        : [];

      const now = new Date().toISOString();
      let changes: Record<string, unknown> = {};
      switch (action) {
        case "approve": changes = { status: "approved", approvedAt: now, approvedBy: decoded.uid }; break;
        case "reject": changes = { status: "rejected", rejectedAt: now, rejectedBy: decoded.uid }; break;
        case "set-role": changes = { role: body.role, roleChangedAt: now, roleChangedBy: decoded.uid }; break;
        case "update": changes = { ...profile, ...(newUsername ? { username: newUsername } : {}), updatedAt: now, updatedBy: decoded.uid }; break;
        case "reset-pin": {
          if (!acct?.exists) throw new HttpError(400, "not_pin_account");
          const { hash, salt } = hashPassword(body.pin as string);
          tx.update(acctRef, { passwordHash: hash, passwordSalt: salt, pinVersion: (acct.data()!.pinVersion ?? 0) + 1, pinResetAt: now, pinResetBy: decoded.uid });
          changes = { pinResetAt: now, pinResetBy: decoded.uid };
          revoke = true;
          break;
        }
        case "delete": break;
      }
      if (action === "delete") {
        tx.delete(ref);
        if (others.length === 0 && acct?.exists) {
          // Last workplace: remove the shared login as well.
          tx.delete(acctRef);
          if (acct.data()!.username) tx.delete(groupUsernameRef(g, acct.data()!.username));
          revoke = true;
        }
      } else {
        tx.update(ref, changes);
        if (unameRef) {
          tx.set(unameRef, { uid });
          if (target.username) tx.delete(groupUsernameRef(g, target.username));
          if (acct?.exists) tx.update(acctRef, { username: newUsername });
        }
      }
      writeAudit({
        companyId: company.id, actorUid: decoded.uid, actorRole: myRole, action: `staff.${action}`, targetType: "staff", targetId: uid,
        reason: cleanStr(body.reason, 300), before: target, after: action === "delete" ? null : { ...target, ...changes }, requestId,
      }, tx);
      return { ok: true, status: changes.status, role: changes.role };
    });
    if (revoke && uid.startsWith("pw_")) await adminAuth.revokeRefreshTokens(uid).catch(() => undefined);
    return json(result);
  });
}

/**
 * Set the workplaces (companies in the group) a person belongs to. The caller
 * must be admin+ in every company where membership is added or removed.
 */
async function setCompanies(req: NextRequest, company: Company, actorUid: string, uid: string, wanted: unknown, requestId: string) {
  if (!Array.isArray(wanted) || wanted.length === 0 || !wanted.every((s) => typeof s === "string")) return fail("companies_required", 400);
  const group = await groupCompanies(company.groupId);
  if (!wanted.every((s) => group.some((c) => c.slug === s))) return fail("invalid_companies", 400);

  await adminDb.runTransaction(async (tx) => {
    const targetDocs = await Promise.all(group.map((c) => tx.get(staffRef(c.id, uid))));
    const actorDocs = await Promise.all(group.map((c) => tx.get(staffRef(c.id, actorUid))));
    const ownerCounts = await Promise.all(group.map((c) => approvedOwnerCount(c.id, tx)));
    const source = targetDocs.find((d) => d.exists)?.data();
    if (!targetDocs[group.findIndex((c) => c.id === company.id)]?.exists || !source) throw new HttpError(404, "not_found");

    const ops: (() => void)[] = [];
    group.forEach((c, i) => {
      const isIn = targetDocs[i].exists;
      const shouldBe = (wanted as string[]).includes(c.slug);
      if (isIn === shouldBe) return;
      const me = actorDocs[i].data();
      if (!me || me.status !== "approved" || !atLeast(effectiveRole(me), "admin")) throw new HttpError(403, "not_admin_in_company", { company: c.slug });
      if (shouldBe) {
        const doc = {
          ...profileOf(source), uid, name: source.name, username: source.username ?? null, authType: source.authType ?? null,
          email: source.email ?? "", role: "staff", status: "approved", registeredSelf: false,
          addedAt: FieldValue.serverTimestamp(), addedBy: actorUid,
        };
        ops.push(() => {
          tx.set(staffRef(c.id, uid), doc);
          writeAudit({ companyId: c.id, actorUid, actorRole: effectiveRole(me), action: "staff.add_workplace", targetType: "staff", targetId: uid, after: doc, requestId }, tx);
        });
      } else {
        const t = targetDocs[i].data()!;
        const d = decideStaffAction({ uid: actorUid, role: effectiveRole(me) }, "delete",
          { uid, role: isRole(t.role) ? t.role : "staff", status: String(t.status ?? ""), authType: t.authType }, { approvedOwnerCount: ownerCounts[i] });
        if (!d.ok) throw new HttpError(d.status, d.error, { company: c.slug });
        ops.push(() => {
          tx.delete(staffRef(c.id, uid));
          writeAudit({ companyId: c.id, actorUid, actorRole: effectiveRole(me), action: "staff.remove_workplace", targetType: "staff", targetId: uid, before: t, requestId }, tx);
        });
      }
    });
    ops.forEach((op) => op());
  });
  return json({ ok: true, companies: wanted });
}

// ── PUT — create a username/PIN account (admin+) ─────────────────────────────
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("portal PUT", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const { company, decoded, role: myRole } = access;
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const { username: rawU, password, role: rawRole, companies: rawCompanies, ...rest } = body;
    const username = typeof rawU === "string" ? rawU.trim().toLowerCase() : "";
    if (!isUsername(username)) return fail("invalid_username", 400);
    if (!isPin(password)) return fail("pin_must_be_4_digits", 400);
    if (isWeakPin(password)) return fail("pin_too_simple", 400);
    const newRole: Role = rawRole === undefined ? "staff" : isRole(rawRole) ? rawRole : ("__invalid" as Role);
    if (!isRole(newRole)) return fail("invalid_role", 400);
    const p = sanitizeProfile(rest);
    if (!p.ok) return fail(p.error, 400);
    const decision = decideStaffAction({ uid: decoded.uid, role: myRole }, "create", null, { newRole, approvedOwnerCount: 0, newIsPin: true });
    if (!decision.ok) return fail(decision.error, decision.status);

    const group = await groupCompanies(company.groupId);
    const slugs = Array.isArray(rawCompanies) && rawCompanies.length ? rawCompanies : [slug];
    const targets = group.filter((c) => (slugs as unknown[]).includes(c.slug));
    if (targets.length !== new Set(slugs).size) return fail("invalid_companies", 400);

    const uid = "pw_" + randomBytes(12).toString("hex");
    const { hash, salt } = hashPassword(password);
    const g = company.groupId;
    const name = (p.value.name as string) || username;
    await adminDb.runTransaction(async (tx) => {
      const unameRef = groupUsernameRef(g, username);
      if ((await tx.get(unameRef)).exists) throw new HttpError(409, "username_taken");
      const mine = await Promise.all(targets.map((c) => tx.get(staffRef(c.id, decoded.uid))));
      targets.forEach((c, i) => {
        const me = mine[i].data();
        if (!me || me.status !== "approved" || !atLeast(effectiveRole(me), "admin")) throw new HttpError(403, "not_admin_in_company", { company: c.slug });
      });
      tx.set(pinAccountRef(g, uid), { uid, username, name, passwordHash: hash, passwordSalt: salt, pinVersion: 0, createdAt: FieldValue.serverTimestamp() });
      tx.set(unameRef, { uid });
      for (const c of targets) {
        const doc = {
          ...p.value, name, uid, username, authType: "password", role: newRole, status: "approved", registeredSelf: false,
          language: p.value.language ?? "is", addedAt: FieldValue.serverTimestamp(), addedBy: decoded.uid,
        };
        tx.set(staffRef(c.id, uid), doc);
        writeAudit({ companyId: c.id, actorUid: decoded.uid, actorRole: myRole, action: "staff.create", targetType: "staff", targetId: uid, after: doc, requestId: requestIdOf(req) }, tx);
      }
    });
    return json({ ok: true, uid });
  });
}
