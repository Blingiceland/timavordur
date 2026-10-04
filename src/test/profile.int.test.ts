import { beforeEach, describe, expect, it } from "vitest";
import { adminDb } from "@/lib/firebase-admin";
import * as portal from "@/app/api/[slug]/portal/route";
import * as login from "@/app/api/[slug]/staff/login/route";
import * as register from "@/app/api/[slug]/staff/register/route";
import * as profile from "@/app/api/[slug]/staff/profile/route";
import { call, exchangeCustomToken, googleUser, key, resetEmulator, seedCompany, seedStaff } from "./emulator";

// Same required fields as Dillon and Pablo.
const FIELDS = {
  name: "required", ssn: "required", phone: "required", address: "required", bankName: "hidden", bankAccount: "required",
  union: "required", pension: "required", jobTitle: "hidden", workPermit: "hidden", workPermitExpiry: "hidden", employmentType: "hidden",
};
const FILLED = { ssn: "010190-2349", phone: "5551234", address: "Laugavegur 1", bankAccount: "0101-26-123456", union: "Efling", pension: "Gildi" };
const D = "d1", Pb = "p1", G = "grp";

async function pinAccount(slug: string, companyId: string, username: string, extra: Record<string, unknown> = {}) {
  const { hashPassword } = await import("@/lib/password");
  const { hash, salt } = hashPassword("4826");
  const uid = `pw_${username}`;
  await adminDb.doc(`tv_groups/${G}/pinAccounts/${uid}`).set({ uid, username, name: username, passwordHash: hash, passwordSalt: salt, pinVersion: 0 });
  await adminDb.doc(`tv_groups/${G}/usernames/${username}`).set({ uid });
  await seedStaff(companyId, uid, { username, authType: "password", role: "staff", ...extra });
  const r = await call(login.POST, { slug, method: "POST", body: { username, password: "4826" } });
  return { uid, token: await exchangeCustomToken(r.body.token as string) };
}
const staffDoc = async (companyId: string, uid: string) => (await adminDb.doc(`tv_companies/${companyId}/staff/${uid}`).get()).data()!;
const patch = (token: string, body: unknown, slug = "dillon") => call(profile.PATCH, { slug, method: "PATCH", token, body });

let owner: { uid: string; token: string };

beforeEach(async () => {
  await resetEmulator();
  await seedCompany(D, "dillon", { groupId: G, registrationFields: FIELDS });
  await seedCompany(Pb, "pablo", { groupId: G, registrationFields: FIELDS, requireApproval: false });
  owner = await googleUser("owner@x.is");
  await seedStaff(D, owner.uid, { role: "owner", authType: "google", name: "Eigandi" });
});

describe("required profile fields for everyone, not only Google registrations", () => {
  it("the portal tells a PIN-account member which required fields are missing; owners are exempt", async () => {
    const pin = await pinAccount("dillon", D, "gamli", { name: "Gamli", phone: "5551234" });
    const me = await call(portal.GET, { slug: "dillon", token: pin.token });
    expect(me.status).toBe(200);
    expect(me.body.missingFields).toEqual(["ssn", "address", "bankAccount", "union", "pension"]);
    const own = await call(portal.GET, { slug: "dillon", token: owner.token });
    expect(own.body.missingFields).toEqual([]);
  });

  it("a member can still punch in while the profile is incomplete", async () => {
    const pin = await pinAccount("dillon", D, "gamli", { name: "Gamli" });
    const r = await call(portal.POST, { slug: "dillon", method: "POST", token: pin.token, body: { action: "in", idempotencyKey: key() } });
    expect(r.status).toBe(200);
  });

  it("a member completes their own profile; it is saved at every workplace in the group and audited without values", async () => {
    const pin = await pinAccount("dillon", D, "gamli", { name: "Gamli" });
    await seedStaff(Pb, pin.uid, { username: "gamli", authType: "password", role: "staff", name: "Gamli" });
    const r = await patch(pin.token, FILLED);
    expect(r.status).toBe(200);
    expect(r.body.missingFields).toEqual([]);
    for (const c of [D, Pb]) expect(await staffDoc(c, pin.uid)).toMatchObject({ ...FILLED, role: "staff", status: "approved" });
    const me = await call(portal.GET, { slug: "dillon", token: pin.token });
    expect(me.body.missingFields).toEqual([]);
    const audit = await adminDb.collection(`tv_companies/${D}/auditLog`).where("action", "==", "staff.profile.self_update").get();
    expect(audit.size).toBe(1);
    const entry = JSON.stringify(audit.docs[0].data());
    expect(audit.docs[0].data()).toMatchObject({ actorUid: pin.uid, targetId: pin.uid });
    for (const v of Object.values(FILLED)) expect(entry).not.toContain(v);
  });

  it("a save that still leaves required fields empty is refused and lists them", async () => {
    const pin = await pinAccount("dillon", D, "gamli", { name: "Gamli" });
    const r = await patch(pin.token, { ssn: FILLED.ssn, phone: FILLED.phone });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("missing_required");
    expect(r.body.fields).toEqual(["address", "bankAccount", "union", "pension"]);
    expect((await staffDoc(D, pin.uid)).ssn).toBeUndefined();
  });

  it("only the venue's visible profile fields can be changed — never role, status, e-mail, username or pay", async () => {
    const pin = await pinAccount("dillon", D, "gamli", { name: "Gamli" });
    for (const extra of [{ role: "owner" }, { status: "approved" }, { email: "x@y.is" }, { username: "nyr" }, { hourlyRate: 9999 }, { bankName: "hidden field" }]) {
      const r = await patch(pin.token, { ...FILLED, ...extra });
      expect(r.status, JSON.stringify(extra)).toBe(400);
    }
    expect(await staffDoc(D, pin.uid)).toMatchObject({ role: "staff", username: "gamli" });
    expect((await staffDoc(D, pin.uid)).ssn).toBeUndefined();
  });

  it("validates the kennitala", async () => {
    const pin = await pinAccount("dillon", D, "gamli", { name: "Gamli" });
    const r = await patch(pin.token, { ...FILLED, ssn: "abc" });
    expect(r.status).toBe(400);
  });

  it("needs an approved member of the workplace", async () => {
    expect((await call(profile.PATCH, { slug: "dillon", method: "PATCH", body: FILLED })).status).toBe(401);
    const pending = await pinAccount("dillon", D, "bidur", { name: "Bíður", status: "pending" });
    expect((await patch(pending.token, FILLED)).status).toBe(403);
  });

  it("Google registration enforces the venue's required fields on the server too", async () => {
    const g = await googleUser("ny@x.is");
    const bad = await call(register.POST, { slug: "dillon", method: "POST", token: g.token, body: { username: "nyr", name: "Ný" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("missing_required");
    const ok = await call(register.POST, { slug: "dillon", method: "POST", token: g.token, body: { username: "nyr", name: "Ný", ...FILLED } });
    expect(ok.status).toBe(200);
  });
});
