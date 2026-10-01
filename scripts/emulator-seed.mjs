#!/usr/bin/env node
// Seeds SYNTHETIC data into the Firebase EMULATOR for manual/browser testing.
// Refuses to run without FIRESTORE_EMULATOR_HOST and a demo- project.
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { scryptSync, randomBytes } from "crypto";

const project = process.env.GCLOUD_PROJECT || "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !project.startsWith("demo-")) {
  console.error("Emulator only (FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-…)"); process.exit(2);
}
const db = getFirestore(initializeApp({ projectId: project }));
const c = db.collection("tv_companies").doc("demo");
const base = { active: true, adminEmails: ["eigandi@demo.test"], requireApproval: true, registrationFields: {}, ipRestriction: { enabled: false, allowedIPs: [] }, businessType: "bar", groupId: "demo-grp" };
await c.set({ ...base, name: "Prófunarbar", slug: "demo" });
// A second employer (own kennitala) sharing staff logins with "demo".
const c2 = db.collection("tv_companies").doc("demo-pablo");
await c2.set({ ...base, name: "Prófun Pablo", slug: "demo-pablo" });
const g = db.collection("tv_groups").doc("demo-grp");
const pin = (p) => { const salt = randomBytes(16).toString("hex"); return { passwordHash: scryptSync(p, salt, 64).toString("hex"), passwordSalt: salt }; };
const staff = [
  ["pw_anna", "anna", "Anna Prófun", "staff", "approved"],
  ["pw_bjorn", "bjorn", "Björn Vaktstjóri", "manager", "approved"],
  ["pw_nyr", "nyr", "Nýr Starfsmaður", "staff", "pending"],
];
for (const [uid, username, name, role, status] of staff) {
  await g.collection("pinAccounts").doc(uid).set({ uid, username, name, pinVersion: 0, ...pin("4826") });
  await g.collection("usernames").doc(username).set({ uid });
  await c.collection("staff").doc(uid).set({ uid, username, name, role, status, authType: "password", language: "is" });
}
// Anna works at both places.
await c2.collection("staff").doc("pw_anna").set({ uid: "pw_anna", username: "anna", name: "Anna Prófun", role: "staff", status: "approved", authType: "password", language: "is" });
for (const uid of ["pw_anna", "pw_bjorn"]) {
  await c.collection("employmentTerms").doc(`seed_${uid}`).set({
    uid, effectiveFrom: "2026-01-01", recordedAt: Timestamp.now(), recordedBy: "seed", reason: "Prófunargögn", status: "active",
    agreementId: "efling_sa_hotel", workingArrangement: "shift", payType: "hourly", employmentPercentage: 100, wageClass: uid === "pw_bjorn" ? 7 : 6,
    managementRole: false, birthDate: "1998-05-05", employerStartDate: "2025-03-01", priorIndustryMonths: null, experienceVerifiedOn: null,
    stepOverride: null, personalDayRate: null, monthlySalary: null, fixedAdditions: [], orlofOverrideBp: null, legacy: null,
  });
}
// Punches in the last ended period (25th–24th) and a schedule for January 2027.
const now = new Date(); let y = now.getUTCFullYear(), m = now.getUTCMonth();
if (now.getUTCDate() < 25) m -= 1; m -= 1; const start = Date.UTC(y, m, 25);
const P = (d, h) => Timestamp.fromMillis(start + d * 86400000 + h * 3600000);
const pairs = [[1, 17, 1, 23], [3, 20, 4, 3], [6, 12, 6, 18], [9, 17, 10, 1]];
let n = 0;
for (const [d1, h1, d2, h2] of pairs) {
  await c.collection("punchRecords").doc(`seed_in_${n}`).set({ uid: "pw_anna", name: "Anna Prófun", type: "in", timestamp: P(d1, h1), source: "clock" });
  await c.collection("punchRecords").doc(`seed_out_${n++}`).set({ uid: "pw_anna", name: "Anna Prófun", type: "out", timestamp: P(d2, h2), source: "clock" });
}
for (const d of ["2027-01-26", "2027-01-29", "2027-01-30", "2027-02-02"]) {
  await c.collection("shifts").add({ uid: "pw_anna", name: "Anna Prófun", date: d, startTime: "18:00", endTime: "02:00", status: "scheduled" });
}
const future = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
await c.collection("shifts").add({ uid: "pw_anna", name: "Anna Prófun", date: future, startTime: "17:00", endTime: "23:00", status: "scheduled" });
console.log("Seeded 'demo' + 'demo-pablo' (group demo-grp). PIN 4826: anna (both), bjorn, nyr[pending]; owner invite eigandi@demo.test");
