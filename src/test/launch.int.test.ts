import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import * as portal from "@/app/api/[slug]/portal/route";
import * as terms from "@/app/api/[slug]/terms/route";
import * as exportRoute from "@/app/api/[slug]/admin/export/route";
import * as close from "@/app/api/[slug]/admin/close/route";
import * as superCompany from "@/app/api/superadmin/company/route";
import { call, googleUser, resetEmulator, seedCompany, seedPunch, seedStaff } from "./emulator";

const A = "compA";
let owner: { uid: string; token: string };
let admin: { uid: string; token: string };
let staff: { uid: string; token: string };

beforeEach(async () => {
  await resetEmulator();
  await seedCompany(A, "alpha", { kennitala: "5501692829" });
  await adminDb.doc("tv_slugs/alpha").set({ companyId: A });
  await adminDb.doc("tv_kennitolur/5501692829").set({ companyId: A });
  owner = await googleUser("owner@a.is"); admin = await googleUser("admin@a.is"); staff = await googleUser("staff@a.is");
  await seedStaff(A, owner.uid, { role: "owner", email: "owner@a.is", authType: "google" });
  await seedStaff(A, admin.uid, { role: "admin", email: "admin@a.is", authType: "google" });
  await seedStaff(A, staff.uid, { role: "staff", email: "staff@a.is", authType: "google" });
});

const superDelete = (token: string, body: unknown) =>
  superCompany.DELETE(new NextRequest("http://localhost/api/superadmin/company", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const superPatch = (token: string, body: unknown) =>
  superCompany.PATCH(new NextRequest("http://localhost/api/superadmin/company", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
async function superadmin() {
  const su = await googleUser("su@x.is");
  await adminDb.doc(`tv_users/${su.uid}`).set({ role: "superadmin" });
  return su;
}

describe("custom terms (outside a supported agreement)", () => {
  const customRates = { eveningPct: 50, nightWeekendPct: 60, barNightPct: 70, helgidagurPct: 80, storhatidPct: 100, overtimePct: 100 };
  const body = (over: Record<string, unknown> = {}) => ({
    uid: staff.uid, effectiveFrom: "2026-09-25", reason: "VR-samningur", agreementId: "custom", workingArrangement: "shift",
    payType: "hourly", employmentPercentage: 100, personalDayRate: 3150, customRates, ...over,
  });

  it("are recorded without a wage class and explained as custom", async () => {
    const r = await call(terms.POST, { slug: "alpha", method: "POST", token: admin.token, body: body() });
    expect(r.status).toBe(200);
    const g = await call(terms.GET, { slug: "alpha", token: admin.token, query: `uid=${staff.uid}&date=2026-10-01` });
    expect(g.body.current).toMatchObject({ ok: true, version: "custom", dayCents: 315000, overtimeCents: 630000, orlofBp: 1017 });
    expect((g.body.current as { issues: string[] }).issues).toEqual([]);
  });

  it("require a rate and every premium; premiums are refused on agreement terms", async () => {
    const noRates = await call(terms.POST, { slug: "alpha", method: "POST", token: admin.token, body: body({ customRates: null }) });
    expect(noRates.body.errors).toContain("customRates:required");
    const noRate = await call(terms.POST, { slug: "alpha", method: "POST", token: admin.token, body: body({ personalDayRate: null }) });
    expect(noRate.body.errors).toContain("personalDayRate:required_for_custom");
    const partial = await call(terms.POST, { slug: "alpha", method: "POST", token: admin.token, body: body({ customRates: { eveningPct: 50 } }) });
    expect(partial.body.errors).toContain("customRates:0-300");
    const efling = await call(terms.POST, { slug: "alpha", method: "POST", token: admin.token, body: body({ agreementId: "efling_sa_hotel", wageClass: 6 }) });
    expect(efling.body.errors).toContain("customRates:custom_only");
  });

  it("an agreement step taken from a payslip needs no start date", async () => {
    const r = await call(terms.POST, {
      slug: "alpha", method: "POST", token: admin.token,
      body: { uid: staff.uid, effectiveFrom: "2026-09-25", reason: "Skv. launaseðli sept. 2026", workingArrangement: "shift", payType: "hourly", employmentPercentage: 100, wageClass: 6, birthDate: "1999-06-10", stepOverride: { step: "y1", reason: "skv. launaseðli sept. 2026" }, orlofOverrideBp: 1017 },
    });
    expect(r.status).toBe(200);
    const g = await call(terms.GET, { slug: "alpha", token: admin.token, query: `uid=${staff.uid}&date=2026-10-01` });
    expect(g.body.current).toMatchObject({ ok: true, step: "y1", dayCents: 282988 });
    expect((g.body.current as { issues: string[] }).issues).not.toContain("missing_employer_start_date");
  });
});

describe("data export", () => {
  it("owner downloads everything; PIN hashes are never included; others are refused", async () => {
    await adminDb.doc(`tv_companies/${A}/staff/${staff.uid}`).update({ passwordHash: "secret-hash", passwordSalt: "salt" });
    await seedPunch(A, staff.uid, "in", "2026-09-30T18:00:00Z");
    const r = await call(exportRoute.GET, { slug: "alpha", token: owner.token });
    expect(r.status).toBe(200);
    expect(r.body.format).toBe("timavordur-export");
    expect((r.body.collections as Record<string, unknown[]>).staff).toHaveLength(3);
    expect((r.body.collections as Record<string, unknown[]>).punchRecords).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toContain("secret-hash");
    expect(JSON.stringify(r.body)).not.toContain("passwordSalt");
    expect((await call(exportRoute.GET, { slug: "alpha", token: admin.token })).status).toBe(403);
    expect((await call(exportRoute.GET, { slug: "alpha", token: staff.token })).status).toBe(403);
    const audit = await adminDb.collection(`tv_companies/${A}/auditLog`).where("action", "==", "company.export").get();
    expect(audit.size).toBe(1);
  });
});

describe("closing and permanent deletion", () => {
  it("owner closes with confirmation; access stops; deletion waits for the retention date", async () => {
    process.env.SUPERADMIN_NOTIFY_EMAIL = "jon@x.is";
    expect((await call(close.POST, { slug: "alpha", method: "POST", token: owner.token, body: { confirmSlug: "wrong" } })).status).toBe(400);
    expect((await call(close.POST, { slug: "alpha", method: "POST", token: admin.token, body: { confirmSlug: "alpha" } })).status).toBe(403);
    const r = await call(close.POST, { slug: "alpha", method: "POST", token: owner.token, body: { confirmSlug: "alpha" } });
    expect(r.status).toBe(200);
    expect((r.body.deleteAfter as string) > new Date().toISOString().slice(0, 10)).toBe(true);
    expect((await call(portal.GET, { slug: "alpha", token: owner.token })).body.error).toBe("company_suspended");
    const mails = (await adminDb.collection("tv_test_mail").get()).docs.map((d) => d.data().to);
    expect(mails).toEqual(expect.arrayContaining(["jon@x.is", "owner@a.is"]));

    const su = await superadmin();
    expect((await superDelete(su.token, { slug: "alpha", confirmSlug: "alpha" })).status).toBe(409); // retention period
    // Reopening cancels the request.
    expect((await superPatch(su.token, { slug: "alpha", suspend: false })).status).toBe(200);
    expect((await adminDb.doc(`tv_companies/${A}`).get()).data()!.deleteAfter).toBeUndefined();
    delete process.env.SUPERADMIN_NOTIFY_EMAIL;
  });

  it("after the retention date the superadmin deletes everything; shared logins survive", async () => {
    // A second workplace in the same group; one person works at both.
    await adminDb.doc(`tv_companies/${A}`).update({ groupId: A });
    await seedCompany("compB", "beta", { groupId: A });
    const both = "pw_both", onlyA = "pw_only";
    for (const [uid, username] of [[both, "both"], [onlyA, "only"]]) {
      await adminDb.doc(`tv_groups/${A}/pinAccounts/${uid}`).set({ uid, username, passwordHash: "h", passwordSalt: "s", pinVersion: 0 });
      await adminDb.doc(`tv_groups/${A}/usernames/${username}`).set({ uid });
      await seedStaff(A, uid, { username, authType: "password" });
    }
    await seedStaff("compB", both, { username: "both", authType: "password" });
    await seedPunch(A, both, "in", "2026-09-30T18:00:00Z");

    const su = await superadmin();
    expect((await superDelete(su.token, { slug: "alpha", confirmSlug: "alpha" })).status).toBe(409); // not closed
    await adminDb.doc(`tv_companies/${A}`).update({ status: "suspended", deleteAfter: "2026-01-01" });
    expect((await superDelete(su.token, { slug: "alpha", confirmSlug: "nope" })).status).toBe(400);
    const r = await superDelete(su.token, { slug: "alpha", confirmSlug: "alpha" });
    expect(r.status).toBe(200);
    expect((await r.json()).removedLogins).toBe(1);

    expect((await adminDb.doc(`tv_companies/${A}`).get()).exists).toBe(false);
    expect((await adminDb.collection(`tv_companies/${A}/staff`).get()).size).toBe(0);
    expect((await adminDb.collection(`tv_companies/${A}/punchRecords`).get()).size).toBe(0);
    expect((await adminDb.doc("tv_slugs/alpha").get()).exists).toBe(false);
    expect((await adminDb.doc("tv_kennitolur/5501692829").get()).exists).toBe(false);
    expect((await adminDb.doc(`tv_groups/${A}/pinAccounts/${both}`).get()).exists).toBe(true);
    expect((await adminDb.doc(`tv_groups/${A}/pinAccounts/${onlyA}`).get()).exists).toBe(false);
    expect((await adminDb.doc(`tv_groups/${A}/usernames/only`).get()).exists).toBe(false);
    expect((await adminDb.doc(`tv_companies/compB/staff/${both}`).get()).exists).toBe(true);
    expect((await adminDb.doc(`tv_deletions/${A}`).get()).data()).toMatchObject({ slug: "alpha", removedLogins: 1 });
  });
});
