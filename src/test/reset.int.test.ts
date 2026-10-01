import { beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { googleUser, resetEmulator, seedCompany, seedPunch, seedStaff } from "./emulator";

const run = (...args: string[]) =>
  execFileSync(process.execPath, ["scripts/reset-staff-data.mjs", "--project", "demo-timavordur", ...args], { env: process.env, encoding: "utf8" });

describe("reset-staff-data (emulator)", () => {
  const backup = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tv-reset-")), "backup.json");
  let su: { uid: string };

  beforeEach(async () => {
    await resetEmulator();
    await seedCompany("d1", "dillon", { groupId: "g", adminEmails: ["jon@x.is"] });
    await seedCompany("p1", "pablo", { groupId: "g", adminEmails: ["jon@x.is"] });
    su = await googleUser("su@x.is");
    await adminDb.doc(`tv_users/${su.uid}`).set({ role: "superadmin", email: "su@x.is" });
    const staffer = await googleUser("staff@x.is");
    await adminDb.doc(`tv_users/${staffer.uid}`).set({ role: "user" });
    await seedStaff("d1", staffer.uid, { role: "owner" });
    await seedStaff("p1", "pw_a", { role: "staff", authType: "password" });
    await adminDb.doc("tv_groups/g/pinAccounts/pw_a").set({ username: "a", passwordHash: "h" });
    await adminDb.doc("tv_groups/g/usernames/a").set({ uid: "pw_a" });
    await seedPunch("d1", staffer.uid, "in", "2026-09-01T10:00:00Z");
    await adminDb.doc("tv_companies/d1/payrollPeriods/2026-08/results/x").set({ grossCents: 1 });
    await adminDb.collection("tv_errors").add({ message: "x" });
  });

  it("dry-run deletes nothing; apply needs confirmation; keeps companies and superadmin only", async () => {
    const dry = run();
    expect(dry).toContain("Dry run");
    expect((await adminDb.collection("tv_companies/d1/staff").get()).size).toBe(1);

    expect(() => run("--apply", "--backup", backup)).toThrow(); // missing --confirm
    expect(() => run("--apply", "--backup", backup, "--confirm", "EYDA-timavordur")).toThrow(); // wrong project
    run("--apply", "--backup", backup, "--confirm", "EYDA-demo-timavordur");

    // kept
    const companies = await adminDb.collection("tv_companies").get();
    expect(companies.docs.map((d) => d.data().slug).sort()).toEqual(["dillon", "pablo"]);
    expect((await adminDb.doc("tv_companies/d1").get()).data()).toMatchObject({ adminEmails: ["jon@x.is"], groupId: "g" });
    expect((await adminDb.doc(`tv_users/${su.uid}`).get()).exists).toBe(true);
    expect((await adminAuth.getUser(su.uid)).email).toBe("su@x.is");
    // gone
    for (const c of ["tv_companies/d1/staff", "tv_companies/p1/staff", "tv_companies/d1/punchRecords", "tv_companies/d1/payrollPeriods", "tv_errors", "tv_groups/g/pinAccounts", "tv_groups/g/usernames"]) {
      expect((await adminDb.collection(c).get()).size, c).toBe(0);
    }
    expect((await adminDb.doc("tv_companies/d1/payrollPeriods/2026-08/results/x").get()).exists).toBe(false);
    expect((await adminDb.collection("tv_users").get()).size).toBe(1);
    expect((await adminAuth.listUsers()).users.map((u) => u.uid)).toEqual([su.uid]);
    // only the reset record remains in each audit log
    expect((await adminDb.collection("tv_companies/d1/auditLog").get()).docs.map((d) => d.data().action)).toEqual(["data.reset"]);
    // backup holds what was deleted
    const b = JSON.parse(fs.readFileSync(backup, "utf8"));
    expect(b.docs.some((d: { path: string }) => d.path === "tv_companies/d1/payrollPeriods/2026-08/results/x")).toBe(true);
    expect(b.docs.some((d: { path: string }) => d.path === "tv_groups/g/pinAccounts/pw_a")).toBe(true);
    expect(b.authUsers.length).toBe(1);
  });

  it("--keep-superadmin keeps only the named superadmin and refuses an unknown one", async () => {
    const other = await googleUser("other@x.is");
    await adminDb.doc(`tv_users/${other.uid}`).set({ role: "superadmin", email: "other@x.is" });
    expect(() => run("--keep-superadmin", "nobody@x.is")).toThrow(); // would leave no superadmin
    run("--apply", "--backup", backup, "--confirm", "EYDA-demo-timavordur", "--keep-superadmin", "su@x.is");
    expect((await adminDb.collection("tv_users").get()).docs.map((d) => d.id)).toEqual([su.uid]);
    expect((await adminAuth.listUsers()).users.map((u) => u.uid)).toEqual([su.uid]);
  });
});
