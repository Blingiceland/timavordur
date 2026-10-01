#!/usr/bin/env node
// Wipe all staff/operational data but KEEP the companies and the superadmin(s).
// DRY-RUN BY DEFAULT — prints exactly what would be deleted.
//
//   node scripts/reset-staff-data.mjs --project <id>
//   node scripts/reset-staff-data.mjs --project <id> --apply --backup wipe-backup.json --confirm EYDA-<id>
//   --keep-superadmin <email>[,<email>]  keep ONLY these superadmins (others are removed too)
//
// Kept:    tv_companies/{id} documents (name, slug, kennitala, adminEmails, settings),
//          tv_users docs with role "superadmin", their Firebase Auth users.
// Deleted: every subcollection of every company (staff, punches, shifts, swaps,
//          corrections, terms, payroll, audit log, …), tv_groups (shared logins),
//          tv_ratelimits, tv_errors, other tv_users docs, all other Auth users.
// The backup (JSON, every deleted document incl. subcollections) is written and
// verified BEFORE anything is deleted. It contains personal data — keep it safe.

import fs from "fs";
import path from "path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const project = opt("project");
if (!project) { console.error("--project is required"); process.exit(2); }

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
const auth = getAuth(app);

const ser = (v) => {
  if (v instanceof Timestamp) return { __ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(ser);
  if (v && typeof v === "object" && typeof v.path === "string" && typeof v.id === "string" && v.firestore) return { __ref: v.path };
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)]));
  return v;
};

/** All documents under a collection, recursively (for backup and counting). */
async function dumpCollection(col, out) {
  const snap = await col.get();
  for (const d of snap.docs) {
    out.push({ path: d.ref.path, data: ser(d.data()) });
    for (const sub of await d.ref.listCollections()) await dumpCollection(sub, out);
  }
  // Documents that exist only as parents of subcollections
  for (const ref of await col.listDocuments()) {
    if (!snap.docs.some((d) => d.id === ref.id)) for (const sub of await ref.listCollections()) await dumpCollection(sub, out);
  }
}

async function plan() {
  const companies = (await db.collection("tv_companies").get()).docs;
  const users = (await db.collection("tv_users").get()).docs;
  const keep = (opt("keep-superadmin") || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const allSupers = users.filter((u) => u.data().role === "superadmin");
  const superUids = allSupers
    .filter((u) => keep.length === 0 || keep.includes(String(u.data().email || "").toLowerCase()))
    .map((u) => u.id);
  const targets = []; // collection refs to delete recursively
  const report = {
    project, companies: [],
    superadmins: superUids.map((uid) => ({ uid, email: users.find((u) => u.id === uid).data().email ?? null })),
    superadminsRemoved: allSupers.filter((u) => !superUids.includes(u.id)).map((u) => u.data().email ?? u.id),
  };

  for (const c of companies) {
    const subs = await c.ref.listCollections();
    const counts = {};
    for (const s of subs) { counts[s.id] = (await s.count().get()).data().count; targets.push(s); }
    report.companies.push({ id: c.id, name: c.data().name, slug: c.data().slug, adminEmails: c.data().adminEmails || [], groupId: c.data().groupId || null, delete: counts });
  }
  for (const name of ["tv_groups", "tv_ratelimits", "tv_errors"]) {
    const col = db.collection(name);
    const n = (await col.count().get()).data().count;
    const parents = (await col.listDocuments()).length;
    if (n || parents) targets.push(col);
    report[name] = Math.max(n, parents);
  }
  const otherUsers = users.filter((u) => !superUids.includes(u.id));
  report.tv_users_deleted = otherUsers.length;

  const authUsers = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    authUsers.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  const authDelete = authUsers.filter((u) => !superUids.includes(u.uid));
  report.authUsersDeleted = authDelete.length;
  report.authUsersKept = authUsers.filter((u) => superUids.includes(u.uid)).map((u) => u.email || u.uid);
  return { targets, otherUsers, authDelete, report, superUids };
}

async function main() {
  const { targets, otherUsers, authDelete, report, superUids } = await plan();
  console.log(JSON.stringify(report, null, 2));
  if (superUids.length === 0) { console.error("\nNo superadmin found — refusing (you would lose all access)."); process.exit(2); }
  const noOwnerInvite = report.companies.filter((c) => c.adminEmails.length === 0);
  if (noOwnerInvite.length) console.warn(`\n⚠ No adminEmails (owner invite) for: ${noOwnerInvite.map((c) => c.slug).join(", ")} — add one in /superadmin or nobody can become owner.`);

  if (!flag("apply")) { console.log("\nDry run — nothing deleted."); return; }
  if (opt("confirm") !== `EYDA-${project}`) { console.error(`\n--apply requires --confirm EYDA-${project}`); process.exit(2); }
  const backupFile = opt("backup");
  if (!backupFile) { console.error("--apply requires --backup <file>"); process.exit(2); }

  // 1. Backup everything that will be deleted, then verify the file.
  const docs = [];
  for (const col of targets) await dumpCollection(col, docs);
  for (const u of otherUsers) docs.push({ path: u.ref.path, data: ser(u.data()) });
  const backup = {
    kind: "reset-staff-data", project, at: new Date().toISOString(), report, docs,
    authUsers: authDelete.map((u) => ({ uid: u.uid, email: u.email ?? null, displayName: u.displayName ?? null, providers: u.providerData.map((p) => p.providerId) })),
  };
  fs.writeFileSync(backupFile, JSON.stringify(backup), { mode: 0o600 });
  const check = JSON.parse(fs.readFileSync(backupFile, "utf8"));
  if (check.docs.length !== docs.length) { console.error("Backup verification failed — nothing deleted."); process.exit(1); }
  console.log(`\nBackup: ${docs.length} documents, ${authDelete.length} auth users → ${backupFile}`);

  // 2. Delete.
  for (const col of targets) await db.recursiveDelete(col);
  for (const u of otherUsers) await u.ref.delete();
  for (let i = 0; i < authDelete.length; i += 1000) {
    const res = await auth.deleteUsers(authDelete.slice(i, i + 1000).map((u) => u.uid));
    if (res.failureCount) console.warn(`${res.failureCount} auth user(s) could not be deleted`, res.errors.slice(0, 3));
  }

  // 3. One record per company that the reset happened (the old audit log is in the backup).
  for (const c of report.companies) {
    await db.collection("tv_companies").doc(c.id).collection("auditLog").add({
      companyId: c.id, actorUid: "script", actorRole: "superadmin", action: "data.reset", targetType: "company", targetId: c.id,
      before: { deleted: c.delete }, after: null, reason: "Hreinsun fyrir útgáfu (scripts/reset-staff-data.mjs)", requestId: `reset-${backup.at}`, versions: {}, at: new Date(),
    });
  }
  const after = await plan();
  console.log(`\nDone. Remaining staff docs: ${after.report.companies.reduce((s, c) => s + (c.delete.staff ?? 0), 0)}, auth users kept: ${after.report.authUsersKept.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
