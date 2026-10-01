import { beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { adminDb } from "@/lib/firebase-admin";
import { resetEmulator, seedCompany } from "./emulator";

const run = (...args: string[]) =>
  execFileSync(process.execPath, ["scripts/migrate-2026-10.mjs", "--project", "demo-timavordur", ...args], {
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST },
    encoding: "utf8",
  });
const opsOf = (out: string) => Number(/(\d+) operation\(s\)/.exec(out)![1]);

describe("migration 2026-10 runner (emulator)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tv-migr-"));
  const backup = path.join(dir, "backup.json");
  const report = path.join(dir, "report.json");

  beforeEach(async () => {
    await resetEmulator();
    await seedCompany("c1", "alpha", { wageCategories: [{ id: "fl6-0", dayRate: 3000 }] });
    const staff = adminDb.collection("tv_companies").doc("c1").collection("staff");
    await staff.doc("legacy").set({ name: "Legacy", addedAt: "2026-02-01", role: "staff", wageCategoryId: "fl6-0", hourlyRate: 2500, createdTs: new Date("2026-02-01T00:00:00Z") });
    await staff.doc("pw_x").set({ name: "X", username: "x", authType: "password", role: "admin", status: "approved", passwordHash: "hh", passwordSalt: "ss", pinVersion: 3 });
  });

  it("dry-run writes nothing; apply is idempotent; rollback restores exactly", async () => {
    const dry = run("--report", report);
    expect(opsOf(dry)).toBeGreaterThan(0);
    expect((await adminDb.collection("tv_companies").doc("c1").collection("employmentTerms").get()).size).toBe(0);
    const rep = JSON.parse(fs.readFileSync(report, "utf8"));
    expect(rep.mode).toBe("dry-run");
    expect(rep.companies[0].placementReview.length).toBe(2);

    expect(() => run("--apply")).toThrow(); // backup file is mandatory
    run("--apply", "--backup", backup);
    const staff = adminDb.collection("tv_companies").doc("c1").collection("staff");
    expect((await staff.doc("legacy").get()).data()).toMatchObject({ status: "approved", hourlyRate: 2500 });
    const px = (await staff.doc("pw_x").get()).data()!;
    expect(px.role).toBe("manager");
    expect(px.passwordHash).toBeUndefined(); // credential moved to the group account
    expect((await adminDb.doc("tv_groups/c1/pinAccounts/pw_x").get()).data()).toMatchObject({ username: "x", passwordHash: "hh", pinVersion: 3 });
    expect((await adminDb.doc("tv_groups/c1/usernames/x").get()).data()).toEqual({ uid: "pw_x", migration: "2026-10" });
    expect((await adminDb.doc("tv_companies/c1").get()).data()!.groupId).toBe("c1");
    const terms = await adminDb.collection("tv_companies").doc("c1").collection("employmentTerms").doc("migr202610_legacy").get();
    expect(terms.data()).toMatchObject({ status: "needs_review", personalDayRate: 3000, legacy: { hourlyRate: 2500, categoryDayRate: 3000 } });

    expect(opsOf(run())).toBe(0); // second run changes nothing

    run("--rollback", backup);
    const legacy = (await staff.doc("legacy").get()).data()!;
    expect(legacy.status).toBeUndefined();
    expect(legacy.migration).toBeUndefined();
    expect(legacy.createdTs.toDate().toISOString()).toBe("2026-02-01T00:00:00.000Z"); // timestamps untouched
    expect((await staff.doc("pw_x").get()).data()).toMatchObject({ role: "admin", passwordHash: "hh", pinVersion: 3 });
    expect((await adminDb.collection("tv_companies").doc("c1").collection("employmentTerms").get()).size).toBe(0);
    expect((await adminDb.collection("tv_groups").doc("c1").collection("usernames").get()).size).toBe(0);
    expect((await adminDb.collection("tv_groups").doc("c1").collection("pinAccounts").get()).size).toBe(0);
    expect((await adminDb.doc("tv_companies/c1").get()).data()!.groupId).toBeUndefined();
  });
});
