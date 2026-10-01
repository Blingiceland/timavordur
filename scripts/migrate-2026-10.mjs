#!/usr/bin/env node
// Migration 2026-10 runner. DRY-RUN BY DEFAULT.
//
//   Dry run (report only):
//     node scripts/migrate-2026-10.mjs --project <id> [--company <companyId>] --report report.json
//   Apply (writes a backup first):
//     node scripts/migrate-2026-10.mjs --project <id> --apply --backup backup.json --report report.json
//   Roll back an applied run:
//     node scripts/migrate-2026-10.mjs --project <id> --rollback backup.json
//
// Credentials: FIRESTORE_EMULATOR_HOST (+ GCLOUD_PROJECT=demo-…) for tests, or
// GOOGLE_APPLICATION_CREDENTIALS / service-account-key.json for a real project.
// --project must match the credential's project. Running --apply against the
// production project additionally requires --confirm-backup-restored-on <YYYY-MM-DD>
// (date a Firestore backup was verified by restoring it into a separate database).

import fs from "fs";
import path from "path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { planCompany, DELETE } from "./migration/plan-2026-10.mjs";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

const project = opt("project");
if (!project) { console.error("--project is required"); process.exit(2); }
const PRODUCTION = process.env.PRODUCTION_FIREBASE_PROJECT_ID || "timavordur";

let app;
if (process.env.FIRESTORE_EMULATOR_HOST) {
  if (!project.startsWith("demo-")) { console.error("Emulator runs must use a demo- project"); process.exit(2); }
  app = initializeApp({ projectId: project });
} else {
  const keyFile = path.join(process.cwd(), "service-account-key.json");
  if (fs.existsSync(keyFile)) {
    const sa = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    if (sa.project_id !== project) { console.error(`Credential project ${sa.project_id} ≠ --project ${project}`); process.exit(2); }
    app = initializeApp({ credential: cert(sa), projectId: project });
  } else {
    app = initializeApp({ credential: applicationDefault(), projectId: project });
  }
}
const db = getFirestore(app);

async function snapshotCompany(companyId) {
  const cref = db.collection("tv_companies").doc(companyId);
  const company = await cref.get();
  const groupId = company.data()?.groupId || companyId;
  const gref = db.collection("tv_groups").doc(groupId);
  const [staff, terms, usernames, pins] = await Promise.all([
    cref.collection("staff").get(), cref.collection("employmentTerms").get(), gref.collection("usernames").get(), gref.collection("pinAccounts").get(),
  ]);
  return {
    companyId,
    company: company.data() || {},
    staff: staff.docs.map((d) => ({ id: d.id, data: d.data() })),
    termsUids: [...new Set(terms.docs.map((d) => d.data().uid))],
    usernameIndex: Object.fromEntries(usernames.docs.map((d) => [d.id, d.data().uid])),
    groupPinAccounts: Object.fromEntries(pins.docs.map((d) => [d.id, true])),
  };
}

async function main() {
  if (opt("rollback")) return rollback(opt("rollback"));
  const apply = flag("apply");
  if (apply && !opt("backup")) { console.error("--apply requires --backup <file>"); process.exit(2); }
  if (apply && project === PRODUCTION && !opt("confirm-backup-restored-on")) {
    console.error("Refusing to modify production without --confirm-backup-restored-on <YYYY-MM-DD>."); process.exit(2);
  }

  const companyIds = opt("company") ? [opt("company")] : (await db.collection("tv_companies").get()).docs.map((d) => d.id);
  const all = [];
  for (const id of companyIds) all.push(planCompany(await snapshotCompany(id)));
  const ops = all.flatMap((p) => p.ops);
  const report = { migration: "2026-10", project, mode: apply ? "apply" : "dry-run", at: new Date().toISOString(), operations: ops.length, companies: all.map((p) => p.report) };

  if (opt("report")) fs.writeFileSync(opt("report"), JSON.stringify(report, null, 2));
  for (const r of report.companies) {
    console.log(`\n[${r.companyId}] status set: ${r.statusSet.length}, PIN roles capped: ${r.pinRoleCapped.length}, username conflicts: ${r.usernameConflicts.length}, terms created: ${r.termsCreated.length}`);
    for (const p of r.placementReview) console.log(`  - ${p.name || p.uid}: flokkur ${p.candidateClass ?? "?"}, ${p.payType}, eldri taxti ${p.legacyRate ?? "-"} → ${p.notes.join(" ")}`);
  }
  console.log(`\n${ops.length} operation(s). ${apply ? "Applying…" : "Dry run — nothing written."}`);
  if (!apply || ops.length === 0) return;

  // Backup of every document the operations touch (current state), written before any change.
  const backup = { migration: "2026-10", project, at: new Date().toISOString(), docs: [] };
  for (const op of ops) {
    const snap = await db.doc(op.path).get();
    if (op.kind === "create" && snap.exists) throw new Error(`Refusing: ${op.path} already exists`);
    // Only what the migration changes: created docs (to delete) and the prior values of updated fields.
    backup.docs.push({ path: op.path, op: op.kind, before: op.kind === "update" ? op.before : null });
  }
  fs.writeFileSync(opt("backup"), JSON.stringify(backup, null, 2), { mode: 0o600 });
  console.log(`Backup written to ${opt("backup")} (contains personal data — store securely, delete when no longer needed).`);

  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 400)) {
      const ref = db.doc(op.path);
      if (op.kind === "create") {
        const data = { ...op.data };
        if (data.recordedAt === "__SERVER_TIME__") data.recordedAt = FieldValue.serverTimestamp();
        batch.create(ref, data); // fails if it already exists — never overwrites
      } else {
        const data = Object.fromEntries(Object.entries(op.data).map(([k, v]) => [k, v === DELETE ? FieldValue.delete() : v]));
        batch.update(ref, data);
      }
    }
    await batch.commit();
  }
  console.log("Applied. Run again (dry run) to confirm 0 operations remain.");
}

async function rollback(file) {
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  if (backup.project !== project) { console.error("Backup is for a different project"); process.exit(2); }
  for (const d of backup.docs) {
    const ref = db.doc(d.path);
    if (d.op === "create") { await ref.delete(); continue; }
    const restore = { migration: FieldValue.delete() };
    for (const [k, v] of Object.entries(d.before)) restore[k] = v === "__ABSENT__" ? FieldValue.delete() : v;
    await ref.update(restore);
  }
  console.log(`Rolled back ${backup.docs.length} document(s) from ${file}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
