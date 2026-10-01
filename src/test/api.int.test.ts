import { beforeEach, describe, expect, it } from "vitest";
import { adminDb } from "@/lib/firebase-admin";
import * as portal from "@/app/api/[slug]/portal/route";
import * as login from "@/app/api/[slug]/staff/login/route";
import * as signup from "@/app/api/[slug]/staff/signup/route";
import * as register from "@/app/api/[slug]/staff/register/route";
import * as schedule from "@/app/api/[slug]/schedule/route";
import * as templates from "@/app/api/[slug]/shift-templates/route";
import * as timesheets from "@/app/api/[slug]/timesheets/route";
import * as settings from "@/app/api/[slug]/admin/settings/route";
import * as corrections from "@/app/api/[slug]/corrections/route";
import * as swaps from "@/app/api/[slug]/swaps/route";
import * as payroll from "@/app/api/[slug]/payroll/route";
import * as exportRoute from "@/app/api/[slug]/payroll/export/route";
import * as preview from "@/app/api/[slug]/payroll/preview/route";
import * as terms from "@/app/api/[slug]/terms/route";
import * as superCompany from "@/app/api/superadmin/company/route";
import { periodContaining, periodFromKey, shiftPeriodKey } from "@/lib/payroll/punches";
import { call, exchangeCustomToken, googleUser, key, resetEmulator, seedCompany, seedPunch, seedStaff, seedTerms } from "./emulator";

const A = "compA", B = "compB";
// The most recent pay period that has already ended, and dates inside it.
const LAST = shiftPeriodKey(periodContaining(Date.now()).key, -1);
const P = periodFromKey(LAST);
const dayIn = (n: number) => new Date(P.start + n * 86_400_000).toISOString().slice(0, 10);
const recent = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
let owner: { uid: string; token: string };
let admin: { uid: string; token: string };
let manager: { uid: string; token: string };
let staff: { uid: string; token: string };
let outsider: { uid: string; token: string };

async function pinAccount(slug: string, companyId: string, username: string, pin = "4826", role = "staff", groupId = companyId) {
  const { hashPassword } = await import("@/lib/password");
  const { hash, salt } = hashPassword(pin);
  const uid = `pw_${username}`;
  await adminDb.doc(`tv_groups/${groupId}/pinAccounts/${uid}`).set({ uid, username, name: username, passwordHash: hash, passwordSalt: salt, pinVersion: 0 });
  await adminDb.doc(`tv_groups/${groupId}/usernames/${username}`).set({ uid });
  await seedStaff(companyId, uid, { username, authType: "password", role });
  const r = await call(login.POST, { slug, method: "POST", body: { username, password: pin } });
  return { uid, token: await exchangeCustomToken(r.body.token as string) };
}

beforeEach(async () => {
  await resetEmulator();
  await seedCompany(A, "alpha");
  await seedCompany(B, "beta");
  owner = await googleUser("owner@a.is"); admin = await googleUser("admin@a.is"); manager = await googleUser("mgr@a.is");
  staff = await googleUser("staff@a.is"); outsider = await googleUser("b@b.is");
  await seedStaff(A, owner.uid, { role: "owner", email: "owner@a.is", authType: "google" });
  await seedStaff(A, admin.uid, { role: "admin", email: "admin@a.is", authType: "google" });
  await seedStaff(A, manager.uid, { role: "manager", email: "mgr@a.is", authType: "google" });
  await seedStaff(A, staff.uid, { role: "staff", email: "staff@a.is", authType: "google" });
  await seedStaff(B, outsider.uid, { role: "owner", email: "b@b.is", authType: "google" });
});

describe("tenant isolation and membership status", () => {
  it("a member of B gets no data from A", async () => {
    for (const [h, path] of [[schedule.GET, "schedule"], [timesheets.GET, "timesheets"], [templates.GET, "shift-templates"], [terms.GET, "terms"]] as const) {
      const r = await call(h, { slug: "alpha", path, token: outsider.token, query: "from=2026-03-01&to=2026-03-02" });
      expect(r.status, path).toBe(403);
      expect(r.body.error).toBe("not_registered");
    }
  });
  it("a PIN session from A is refused on B even with a same-uid doc", async () => {
    const pin = await pinAccount("alpha", A, "anna");
    await seedStaff(B, pin.uid, { role: "owner", authType: "password" });
    const r = await call(schedule.GET, { slug: "beta", path: "schedule", token: pin.token });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("wrong_tenant");
  });
  it("pending, rejected and status-less members are refused everywhere", async () => {
    for (const status of ["pending", "rejected", undefined]) {
      await adminDb.collection("tv_companies").doc(A).collection("staff").doc(staff.uid).set({ uid: staff.uid, role: "staff", ...(status ? { status } : {}) });
      const r1 = await call(schedule.GET, { slug: "alpha", path: "schedule", token: staff.token });
      const r2 = await call(portal.POST, { slug: "alpha", method: "POST", token: staff.token, body: { action: "in", idempotencyKey: key() } });
      expect(r1.status).toBe(403); expect(r2.status).toBe(403);
      expect(r1.body.error).toBe(status ?? "status_missing");
    }
  });
});

describe("role management", () => {
  it("rejects role injection through a profile update", async () => {
    const r = await call(portal.PATCH, { slug: "alpha", method: "PATCH", token: admin.token, body: { uid: staff.uid, action: "update", updates: { name: "X", role: "owner" } } });
    expect(r.status).toBe(400);
    const doc = await adminDb.collection("tv_companies").doc(A).collection("staff").doc(staff.uid).get();
    expect(doc.data()!.role).toBe("staff");
  });
  it("admin cannot create an owner or change roles; owner can", async () => {
    const put = await call(portal.PUT, { slug: "alpha", method: "PUT", token: admin.token, body: { username: "boss", password: "4826", role: "owner" } });
    expect(put.status).toBe(403);
    const sr = await call(portal.PATCH, { slug: "alpha", method: "PATCH", token: admin.token, body: { uid: staff.uid, action: "set-role", role: "manager" } });
    expect(sr.status).toBe(403);
    const ok = await call(portal.PATCH, { slug: "alpha", method: "PATCH", token: owner.token, body: { uid: staff.uid, action: "set-role", role: "manager" } });
    expect(ok.status).toBe(200);
  });
  it("admin cannot reset the PIN of, or delete, an owner/admin", async () => {
    const r1 = await call(portal.PATCH, { slug: "alpha", method: "PATCH", token: admin.token, body: { uid: owner.uid, action: "delete" } });
    const r2 = await call(portal.PATCH, { slug: "alpha", method: "PATCH", token: admin.token, body: { uid: owner.uid, action: "reset-pin", pin: "4826" } });
    expect(r1.status).toBe(403); expect(r2.status).toBe(403);
  });
  it("protects the last owner", async () => {
    const demote = await call(portal.PATCH, { slug: "alpha", method: "PATCH", token: owner.token, body: { uid: owner.uid, action: "set-role", role: "admin" } });
    const del = await call(portal.PATCH, { slug: "alpha", method: "PATCH", token: owner.token, body: { uid: owner.uid, action: "delete" } });
    expect(demote.status).toBe(409); expect(del.status).toBe(409);
  });
  it("a PIN account can never be given admin rights, and a stored admin role is capped", async () => {
    const pin = await pinAccount("alpha", A, "bjorn");
    const r = await call(portal.PATCH, { slug: "alpha", method: "PATCH", token: owner.token, body: { uid: pin.uid, action: "set-role", role: "admin" } });
    expect(r.status).toBe(400);
    await adminDb.collection("tv_companies").doc(A).collection("staff").doc(pin.uid).update({ role: "owner" }); // legacy data
    const s = await call(settings.PATCH, { slug: "alpha", method: "PATCH", token: pin.token, body: { businessType: "restaurant" } });
    expect(s.status).toBe(403);
  });
  it("settings are owner-only and validate the IP list", async () => {
    expect((await call(settings.PATCH, { slug: "alpha", method: "PATCH", token: admin.token, body: { businessType: "restaurant" } })).status).toBe(403);
    expect((await call(settings.PATCH, { slug: "alpha", method: "PATCH", token: owner.token, body: { ipRestriction: { enabled: true, allowedIPs: ["1.2.3"] } } })).status).toBe(400);
    expect((await call(settings.PATCH, { slug: "alpha", method: "PATCH", token: owner.token, body: { ipRestriction: { enabled: true, allowedIPs: [] } } })).status).toBe(400);
    expect((await call(settings.PATCH, { slug: "alpha", method: "PATCH", token: owner.token, body: { wageCategories: [] } })).status).toBe(400);
  });
  it("owner invite: verified Google email on adminEmails becomes owner once; removal demotes", async () => {
    await adminDb.collection("tv_companies").doc(A).update({ adminEmails: ["new@a.is"] });
    const nu = await googleUser("new@a.is");
    const r = await call(portal.GET, { slug: "alpha", token: nu.token });
    expect(r.body.role).toBe("owner");
    await adminDb.collection("tv_users").doc("su").set({ role: "superadmin" });
    // superadmin token: a google user whose uid we map
    const su = await googleUser("su@x.is");
    await adminDb.collection("tv_users").doc(su.uid).set({ role: "superadmin" });
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/superadmin/company", { method: "PATCH", headers: { Authorization: `Bearer ${su.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ slug: "alpha", removEmail: "new@a.is" }) });
    const res = await superCompany.PATCH(req);
    expect(res.status).toBe(200);
    const doc = await adminDb.collection("tv_companies").doc(A).collection("staff").doc(nu.uid).get();
    expect(doc.data()!.role).toBe("staff");
  });
});

describe("PIN login", () => {
  it("rate-limits failed attempts persistently and refuses even the right PIN while locked", async () => {
    await pinAccount("alpha", A, "gudrun", "4831");
    for (let i = 0; i < 4; i++) expect((await call(login.POST, { slug: "alpha", method: "POST", body: { username: "gudrun", password: "0000" } })).status).toBe(401);
    expect((await call(login.POST, { slug: "alpha", method: "POST", body: { username: "gudrun", password: "0000" } })).status).toBe(429);
    const right = await call(login.POST, { slug: "alpha", method: "POST", body: { username: "gudrun", password: "4831" } });
    expect(right.status).toBe(429);
    expect(right.headers.get("Retry-After")).toBeTruthy();
  });
  it("PIN reset revokes existing sessions", async () => {
    const pin = await pinAccount("alpha", A, "helgi", "5917");
    expect((await call(schedule.GET, { slug: "alpha", path: "schedule", token: pin.token })).status).toBe(200);
    expect((await call(portal.PATCH, { slug: "alpha", method: "PATCH", token: admin.token, body: { uid: pin.uid, action: "reset-pin", pin: "6284" } })).status).toBe(200);
    const after = await call(schedule.GET, { slug: "alpha", path: "schedule", token: pin.token });
    expect(after.status).toBe(401);
    expect(["session_revoked", "unauthorized"]).toContain(after.body.error);
  });
  it("bumping pinVersion alone invalidates the session (no refresh-token revocation needed)", async () => {
    const pin = await pinAccount("alpha", A, "ingi", "5917");
    await adminDb.doc(`tv_groups/${A}/pinAccounts/${pin.uid}`).update({ pinVersion: 1 });
    const r = await call(schedule.GET, { slug: "alpha", path: "schedule", token: pin.token });
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("session_revoked");
  });
  it("signup is always staff + pending and usernames are unique under concurrency", async () => {
    const rs = await Promise.all([1, 2, 3].map(() => call(signup.POST, { slug: "alpha", method: "POST", body: { username: "sama", pin: "4826", name: "Sama", role: "owner" } })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    const docs = await adminDb.collection("tv_companies").doc(A).collection("staff").where("username", "==", "sama").get();
    expect(docs.size).toBe(1);
    expect(docs.docs[0].data()).toMatchObject({ role: "staff", status: "pending" });
  });
  it("Google self-registration cannot set role or status", async () => {
    const g = await googleUser("reg@a.is");
    const r = await call(register.POST, { slug: "alpha", method: "POST", token: g.token, body: { name: "Reg", role: "owner" } });
    expect(r.status).toBe(400);
  });
});

describe("wage data is filtered on the server", () => {
  it("staff see no pay estimates for colleagues; managers do; templates carry no rates", async () => {
    await seedTerms(A, staff.uid); await seedTerms(A, manager.uid);
    await adminDb.collection("tv_companies").doc(A).collection("shifts").add({ uid: manager.uid, name: "m", date: "2026-03-26", startTime: "18:00", endTime: "02:00", status: "scheduled" });
    await adminDb.collection("tv_companies").doc(A).collection("shifts").add({ uid: staff.uid, name: "s", date: "2026-03-26", startTime: "10:00", endTime: "14:00", status: "scheduled" });
    await adminDb.collection("tv_companies").doc(A).collection("shiftTemplates").add({ uid: manager.uid, name: "m", daysOfWeek: [1], startTime: "08:00", endTime: "16:00", active: true, hourlyRate: 9999, wageEstimate: 1 });
    const s = await call(schedule.GET, { slug: "alpha", path: "schedule", token: staff.token, query: "from=2026-03-26&to=2026-03-26" });
    const shifts = s.body.shifts as Record<string, unknown>[];
    expect(shifts.find((x) => x.uid === manager.uid)!.estimate).toBeUndefined();
    expect(shifts.find((x) => x.uid === staff.uid)!.estimate).toBeDefined();
    const m = await call(schedule.GET, { slug: "alpha", path: "schedule", token: manager.token, query: "from=2026-03-26&to=2026-03-26" });
    expect((m.body.shifts as Record<string, unknown>[]).every((x) => x.estimate)).toBe(true);
    const t = await call(templates.GET, { slug: "alpha", path: "shift-templates", token: staff.token });
    expect(t.text).not.toContain("9999");
    expect(t.text).not.toContain("hourlyRate");
  });
  it("staff cannot read colleagues' timesheets or terms; managers cannot read pay either", async () => {
    expect((await call(timesheets.GET, { slug: "alpha", path: "timesheets", token: staff.token, query: "uid=all" })).status).toBe(403);
    expect((await call(timesheets.GET, { slug: "alpha", path: "timesheets", token: manager.token, query: `uid=${staff.uid}` })).status).toBe(403);
    expect((await call(terms.GET, { slug: "alpha", path: "terms", token: staff.token, query: `uid=${manager.uid}` })).status).toBe(403);
  });
});

describe("punching", () => {
  it("concurrent punches with different keys create exactly one punch", async () => {
    const rs = await Promise.all(Array.from({ length: 5 }, () => call(portal.POST, { slug: "alpha", method: "POST", token: staff.token, body: { action: "in", idempotencyKey: key() } })));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(4); // already_punched_in or concurrent_request
    const n = await adminDb.collection("tv_companies").doc(A).collection("punchRecords").where("uid", "==", staff.uid).get();
    expect(n.size).toBe(1);
  });
  it("a resent request (same key) returns the first result and never flips direction", async () => {
    const k = key();
    const a = await call(portal.POST, { slug: "alpha", method: "POST", token: staff.token, body: { action: "in", idempotencyKey: k } });
    const b = await call(portal.POST, { slug: "alpha", method: "POST", token: staff.token, body: { action: "in", idempotencyKey: k } });
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(b.body.punchId).toBe(a.body.punchId);
    expect(b.body.replay).toBe(true);
    const out = await call(portal.POST, { slug: "alpha", method: "POST", token: staff.token, body: { action: "in", idempotencyKey: key() } });
    expect(out.status).toBe(409);
    expect(out.body.error).toBe("already_punched_in");
  });
  it("requires an explicit action", async () => {
    expect((await call(portal.POST, { slug: "alpha", method: "POST", token: staff.token, body: {} })).status).toBe(400);
  });
  it("IP restriction: allowed CIDR passes, other address and unknown address are refused", async () => {
    await adminDb.collection("tv_companies").doc(A).update({ ipRestriction: { enabled: true, allowedIPs: ["203.0.113.0/24", "2001:db8::/32"] } });
    const bad = await call(portal.POST, { slug: "alpha", method: "POST", token: staff.token, headers: { "x-forwarded-for": "203.0.11.5" }, body: { action: "in", idempotencyKey: key() } });
    expect(bad.status).toBe(403); expect(bad.body.error).toBe("ip_restricted");
    const none = await call(portal.POST, { slug: "alpha", method: "POST", token: staff.token, body: { action: "in", idempotencyKey: key() } });
    expect(none.body.error).toBe("client_ip_unknown");
    const v6 = await call(portal.POST, { slug: "alpha", method: "POST", token: staff.token, headers: { "x-forwarded-for": "2001:db8::42" }, body: { action: "in", idempotencyKey: key() } });
    expect(v6.status).toBe(200);
  });
});

describe("corrections and swaps", () => {
  it("two simultaneous approvals create the punches once", async () => {
    const c = await call(corrections.POST, { slug: "alpha", method: "POST", token: staff.token, body: { date: recent, inTime: "18:00", outTime: "23:00", reason: "gleymdi" } });
    expect(c.status).toBe(200);
    const rs = await Promise.all([owner, manager].map((u) => call(corrections.PATCH, { slug: "alpha", method: "PATCH", token: u.token, body: { id: c.body.id, action: "approve" } })));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    const n = await adminDb.collection("tv_companies").doc(A).collection("punchRecords").where("uid", "==", staff.uid).get();
    expect(n.size).toBe(2);
  });
  it("approval is refused when the punches changed after the request", async () => {
    const c = await call(corrections.POST, { slug: "alpha", method: "POST", token: staff.token, body: { date: recent, outTime: "23:00", reason: "x" } });
    await seedPunch(A, staff.uid, "in", `${recent}T17:00:00Z`);
    const r = await call(corrections.PATCH, { slug: "alpha", method: "PATCH", token: manager.token, body: { id: c.body.id, action: "approve" } });
    expect(r.status).toBe(409); expect(r.body.error).toBe("punches_changed_since_request");
  });
  it("swap requests use server-side shifts and ownership", async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const mine = await adminDb.collection("tv_companies").doc(A).collection("shifts").add({ uid: staff.uid, name: "s", date: future, startTime: "10:00", endTime: "14:00", status: "scheduled" });
    const theirs = await adminDb.collection("tv_companies").doc(A).collection("shifts").add({ uid: manager.uid, name: "m", date: future, startTime: "16:00", endTime: "20:00", status: "scheduled" });
    const steal = await call(swaps.POST, { slug: "alpha", method: "POST", token: staff.token, body: { type: "cover", fromShift: { id: theirs.id, uid: staff.uid, date: future, startTime: "00:00", endTime: "01:00" } } });
    expect(steal.status).toBe(403);
    const cover = await call(swaps.POST, { slug: "alpha", method: "POST", token: staff.token, body: { type: "cover", fromShiftId: mine.id } });
    expect(cover.status).toBe(200);
    expect((await call(swaps.PATCH, { slug: "alpha", method: "PATCH", token: admin.token, body: { id: cover.body.id, action: "claim" } })).status).toBe(200);
    // shift changed after the request → approval refused
    await mine.update({ startTime: "11:00" });
    const r = await call(swaps.PATCH, { slug: "alpha", method: "PATCH", token: owner.token, body: { id: cover.body.id, action: "approve" } });
    expect(r.status).toBe(409);
    await mine.update({ startTime: "10:00" });
    const rs = await Promise.all([owner, manager].map((u) => call(swaps.PATCH, { slug: "alpha", method: "PATCH", token: u.token, body: { id: cover.body.id, action: "approve" } })));
    expect(rs.map((x) => x.status).sort()).toEqual([200, 409]);
    expect((await mine.get()).data()!.uid).toBe(admin.uid);
  });
});

describe("payroll history, locking and export", () => {
  it("a locked period is served from its snapshot and does not change when terms change; CSV totals match", async () => {
    await seedTerms(A, staff.uid);
    await seedPunch(A, staff.uid, "in", `${dayIn(2)}T22:00:00Z`);
    await seedPunch(A, staff.uid, "out", `${dayIn(3)}T06:00:00Z`);
    const before = await call(timesheets.GET, { slug: "alpha", path: "timesheets", token: admin.token, query: `period=${LAST}&uid=${staff.uid}` });
    const gross = (before.body.summaries as { grossCents: number }[])[0].grossCents;
    expect(gross).toBeGreaterThan(0);

    expect((await call(payroll.POST, { slug: "alpha", method: "POST", token: admin.token, body: { period: LAST, action: "lock" } })).body.error).toBe("review_required");
    expect((await call(payroll.POST, { slug: "alpha", method: "POST", token: admin.token, body: { period: LAST, action: "review" } })).status).toBe(200);
    expect((await call(payroll.POST, { slug: "alpha", method: "POST", token: admin.token, body: { period: LAST, action: "lock" } })).body.error).toBe("second_person_required");
    const lock = await call(payroll.POST, { slug: "alpha", method: "POST", token: owner.token, body: { period: LAST, action: "lock" } });
    expect(lock.status).toBe(200);

    // New, better terms effective in the locked period: the locked result must not change.
    await seedTerms(A, staff.uid, { effectiveFrom: dayIn(0), recordedAt: new Date(), wageClass: 7, personalDayRate: 5000 });
    const after = await call(timesheets.GET, { slug: "alpha", path: "timesheets", token: admin.token, query: `period=${LAST}&uid=${staff.uid}` });
    expect(after.body.fromSnapshot).toBe(true);
    expect((after.body.summaries as { grossCents: number }[])[0].grossCents).toBe(gross);

    const csv = await call(exportRoute.GET, { slug: "alpha", path: "payroll/export", token: admin.token, query: `period=${LAST}` });
    expect(csv.status).toBe(200);
    const total = csv.text.split("\r\n").find((l) => l.includes(";SAMTALS;") && l.includes(staff.uid))!;
    expect(total).toContain((gross / 100).toFixed(2).replace(".", ","));

    // Corrections into a locked period are refused.
    const corr = await call(corrections.POST, { slug: "alpha", method: "POST", token: staff.token, body: { date: dayIn(5), inTime: "10:00", outTime: "12:00", reason: "x" } });
    expect(corr.status).toBe(409); expect(corr.body.error).toBe("period_locked");
  });
  it("blockers prevent locking (missing terms, open old shift)", async () => {
    await seedPunch(A, staff.uid, "in", `${dayIn(2)}T22:00:00Z`);
    await call(payroll.POST, { slug: "alpha", method: "POST", token: owner.token, body: { period: LAST, action: "review" } });
    const r = await call(payroll.POST, { slug: "alpha", method: "POST", token: owner.token, body: { period: LAST, action: "lock" } });
    expect(r.status).toBe(409);
    const codes = (r.body.blockers as { code: string }[]).map((b) => b.code);
    expect(codes).toContain("punch_stale_open");
  });
  it("draft CSV export is labelled draft; locked export requires a lock", async () => {
    expect((await call(exportRoute.GET, { slug: "alpha", path: "payroll/export", token: admin.token, query: `period=${LAST}` })).status).toBe(409);
    const d = await call(exportRoute.GET, { slug: "alpha", path: "payroll/export", token: admin.token, query: `period=${LAST}&draft=1` });
    expect(d.status).toBe(200);
    expect(d.headers.get("Content-Disposition")).toContain("_DROG");
  });
  it("2027 preview uses the schedule, marks draft rates and writes nothing", async () => {
    await seedTerms(A, staff.uid);
    await adminDb.collection("tv_companies").doc(A).collection("shifts").add({ uid: staff.uid, name: "s", date: "2027-01-26", startTime: "18:00", endTime: "02:00", status: "scheduled" });
    const r = await call(preview.GET, { slug: "alpha", path: "payroll/preview", token: admin.token, query: "period=2027-01" });
    expect(r.status).toBe(200);
    expect(r.body.usesDraftRates).toBe(true);
    const periods = await adminDb.collection("tv_companies").doc(A).collection("payrollPeriods").get();
    expect(periods.size).toBe(0);
    expect((await call(preview.GET, { slug: "alpha", path: "payroll/preview", token: manager.token, query: "period=2027-01" })).status).toBe(403);
  });
  it("terms are append-only and validated", async () => {
    const bad = await call(terms.POST, { slug: "alpha", method: "POST", token: admin.token, body: { uid: staff.uid, effectiveFrom: "2026-02-30", reason: "x" } });
    expect(bad.status).toBe(400);
    const ok = await call(terms.POST, { slug: "alpha", method: "POST", token: admin.token, body: { uid: staff.uid, effectiveFrom: "2026-10-01", reason: "Samningur", workingArrangement: "shift", payType: "hourly", employmentPercentage: 60, wageClass: 7, birthDate: "1995-05-05", employerStartDate: "2025-05-01" } });
    expect(ok.status).toBe(200);
    expect((await call(terms.POST, { slug: "alpha", method: "POST", token: manager.token, body: {} })).status).toBe(403);
    const audit = await adminDb.collection("tv_companies").doc(A).collection("auditLog").where("action", "==", "terms.create").get();
    expect(audit.size).toBe(1);
  });
});


describe("two workplaces with separate kennitala sharing logins (Dillon + Pablo)", () => {
  const D = "d1", Pb = "p1", G = "grp";
  let jon: { uid: string; token: string };
  let dOnlyAdmin: { uid: string; token: string };
  beforeEach(async () => {
    await seedCompany(D, "dillon", { groupId: G });
    await seedCompany(Pb, "pablo", { groupId: G, requireApproval: false });
    jon = await googleUser("jon@x.is");
    dOnlyAdmin = await googleUser("dadmin@x.is");
    await seedStaff(D, jon.uid, { role: "owner", authType: "google" });
    await seedStaff(Pb, jon.uid, { role: "owner", authType: "google" });
    await seedStaff(D, dOnlyAdmin.uid, { role: "admin", authType: "google" });
  });

  it("sign-up for both workplaces creates one login and a membership at each", async () => {
    const r = await call(signup.POST, { slug: "dillon", method: "POST", body: { username: "lara", pin: "4826", name: "Lára", companies: ["dillon", "pablo"] } });
    expect(r.status).toBe(200);
    expect(r.body.statuses).toEqual({ dillon: "pending", pablo: "approved" });
    const uid = (await adminDb.doc(`tv_groups/${G}/usernames/lara`).get()).data()!.uid;
    expect((await adminDb.doc(`tv_companies/${D}/staff/${uid}`).get()).data()).toMatchObject({ status: "pending", role: "staff" });
    expect((await adminDb.doc(`tv_companies/${Pb}/staff/${uid}`).get()).exists).toBe(true);
    expect((await adminDb.doc(`tv_companies/${D}/staff/${uid}`).get()).data()!.passwordHash).toBeUndefined();
    const bad = await call(signup.POST, { slug: "dillon", method: "POST", body: { username: "xxx2", pin: "4826", name: "X", companies: ["alpha"] } });
    expect(bad.body.error).toBe("invalid_companies"); // a company outside the group
    expect((await call(signup.POST, { slug: "dillon", method: "POST", body: { username: "xxx3", pin: "1234", name: "X" } })).body.error).toBe("pin_too_simple");
  });

  it("one login works at both; punching in at one blocks the other; the portal shows where", async () => {
    const s = await call(signup.POST, { slug: "pablo", method: "POST", body: { username: "lara", pin: "4826", name: "Lára", companies: ["dillon", "pablo"] } });
    const token = await exchangeCustomToken(s.body.token as string);
    const uid = (await adminDb.doc(`tv_groups/${G}/usernames/lara`).get()).data()!.uid as string;
    await call(portal.PATCH, { slug: "dillon", method: "PATCH", token: jon.token, body: { uid, action: "approve" } });
    // login through the other workplace's address gives the same account
    const l = await call(login.POST, { slug: "dillon", method: "POST", body: { username: "lara", password: "4826" } });
    expect(l.status).toBe(200);
    const g = await call(portal.GET, { slug: "dillon", token });
    expect((g.body.memberships as { slug: string }[]).map((m) => m.slug).sort()).toEqual(["dillon", "pablo"]);
    expect((await call(portal.POST, { slug: "dillon", method: "POST", token, body: { action: "in", idempotencyKey: key() } })).status).toBe(200);
    const other = await call(portal.POST, { slug: "pablo", method: "POST", token, body: { action: "in", idempotencyKey: key() } });
    expect(other.status).toBe(409);
    expect(other.body.error).toBe("punched_in_elsewhere");
    const g2 = await call(portal.GET, { slug: "pablo", token });
    expect((g2.body.memberships as { slug: string; isPunchedIn: boolean }[]).find((m) => m.slug === "dillon")!.isPunchedIn).toBe(true);
    expect((await call(portal.POST, { slug: "dillon", method: "POST", token, body: { action: "out", idempotencyKey: key() } })).status).toBe(200);
    expect((await call(portal.POST, { slug: "pablo", method: "POST", token, body: { action: "in", idempotencyKey: key() } })).status).toBe(200);
    // punches land in the chosen company only
    expect((await adminDb.collection(`tv_companies/${Pb}/punchRecords`).get()).size).toBe(1);
    expect((await adminDb.collection(`tv_companies/${D}/punchRecords`).get()).size).toBe(2);
  });

  it("a group login is useless in a company outside the group", async () => {
    const s = await call(signup.POST, { slug: "dillon", method: "POST", body: { username: "lara", pin: "4826", name: "Lára" } });
    const token = await exchangeCustomToken(s.body.token as string);
    const r = await call(schedule.GET, { slug: "alpha", path: "schedule", token });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe("wrong_tenant");
  });

  it("workplaces can be changed only by an admin of each affected workplace", async () => {
    const pin = await pinAccount("dillon", D, "siggi", "4826", "staff", G);
    const denied = await call(portal.PATCH, { slug: "dillon", method: "PATCH", token: dOnlyAdmin.token, body: { uid: pin.uid, action: "set-companies", companies: ["dillon", "pablo"] } });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe("not_admin_in_company");
    const ok = await call(portal.PATCH, { slug: "dillon", method: "PATCH", token: jon.token, body: { uid: pin.uid, action: "set-companies", companies: ["dillon", "pablo"] } });
    expect(ok.status).toBe(200);
    expect((await adminDb.doc(`tv_companies/${Pb}/staff/${pin.uid}`).get()).data()).toMatchObject({ status: "approved", role: "staff", authType: "password" });
    const list = await call(portal.GET, { slug: "dillon", token: jon.token });
    expect((list.body.staffList as { uid: string; companies: string[] }[]).find((x) => x.uid === pin.uid)!.companies.sort()).toEqual(["dillon", "pablo"]);
    expect((await call(portal.PATCH, { slug: "dillon", method: "PATCH", token: jon.token, body: { uid: pin.uid, action: "set-companies", companies: [] } })).status).toBe(400);
    // remove from Dillon only: the shared login stays (still at Pablo)
    expect((await call(portal.PATCH, { slug: "dillon", method: "PATCH", token: jon.token, body: { uid: pin.uid, action: "delete" } })).status).toBe(200);
    expect((await adminDb.doc(`tv_groups/${G}/pinAccounts/${pin.uid}`).get()).exists).toBe(true);
    expect((await call(login.POST, { slug: "pablo", method: "POST", body: { username: "siggi", password: "4826" } })).status).toBe(200);
    // removing the last workplace removes the login too
    expect((await call(portal.PATCH, { slug: "pablo", method: "PATCH", token: jon.token, body: { uid: pin.uid, action: "delete" } })).status).toBe(200);
    expect((await adminDb.doc(`tv_groups/${G}/pinAccounts/${pin.uid}`).get()).exists).toBe(false);
    expect((await adminDb.doc(`tv_groups/${G}/usernames/siggi`).get()).exists).toBe(false);
  });

  it("an admin of one workplace cannot remove someone from the other", async () => {
    await adminDb.doc(`tv_companies/${Pb}/staff/${jon.uid}`).delete();
    await seedStaff(Pb, dOnlyAdmin.uid, { role: "owner", authType: "google" });
    const r = await call(portal.PATCH, { slug: "dillon", method: "PATCH", token: jon.token, body: { uid: dOnlyAdmin.uid, action: "set-companies", companies: ["dillon"] } });
    expect(r.status).toBe(403);
  });
});
