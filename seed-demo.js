/**
 * seed-demo.js — býr til sýningar-fyrirtæki "demo" með mock-gögnum.
 *
 * Notkun:  node seed-demo.js
 * Þarf:    service-account-key.json í verkefnisrótinni.
 *
 * Eftir keyrslu: timon.bling.is/demo  (skráðu inn sem t.d.  jon / 1234)
 * Hreinsa síðar: node seed-demo.js --clear
 */
const admin = require("firebase-admin");
const { scryptSync, randomBytes } = require("crypto");
const serviceAccount = require("./service-account-key.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const SLUG = "demo";
const PIN = "1234";
const ADMIN_EMAIL = "jon@dillon.is"; // má stýra demo-inu með Google líka

// scrypt — sama og src/lib/password.ts
function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return { passwordHash: hash, passwordSalt: salt };
}

const STAFF = [
  { username: "jon",   name: "Jón Bjarnason",        role: "admin",   hourlyRate: 2100, jobTitle: "Vaktstjóri" },
  { username: "anna",  name: "Anna Sigurðardóttir",  role: "staff",   hourlyRate: 2200, jobTitle: "Barþjónn" },
  { username: "klara", name: "Klara Ólafsdóttir",    role: "staff",   hourlyRate: 2050, jobTitle: "Þjónn" },
  { username: "mihai", name: "Mihai Popescu",        role: "staff",   hourlyRate: 1980, jobTitle: "Eldhús" },
];

function ymd(d) { return d.toISOString().slice(0, 10); }
function hhmm(d) { return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; }
function periodStart() {
  const n = new Date(); let y = n.getUTCFullYear(), m = n.getUTCMonth();
  if (n.getUTCDate() < 25) m--;
  return new Date(Date.UTC(y, m, 25));
}

async function companyRef() {
  const snap = await db.collection("tv_companies").where("slug", "==", SLUG).limit(1).get();
  if (!snap.empty) return snap.docs[0].ref;
  return db.collection("tv_companies").add({
    name: "Demo Bistró", slug: SLUG, kennitala: "000000-0000",
    adminEmails: [ADMIN_EMAIL], active: true, requireApproval: false,
    registrationFields: {}, ipRestriction: { enabled: false, allowedIPs: [] },
    createdAt: new Date().toISOString().slice(0, 10),
  }).then(r => r);
}

async function clear(cref) {
  for (const sub of ["staff", "punchRecords", "shifts", "shiftTemplates", "swapRequests"]) {
    const s = await cref.collection(sub).get();
    const b = db.batch(); s.docs.forEach(d => b.delete(d.ref)); await b.commit();
  }
  console.log("🗑  Demo-gögn hreinsuð.");
}

// in/out punch pairs over the current pay period — varied day/evening/weekend times
function buildPunches(staffIndex) {
  const start = periodStart();
  const today = new Date();
  const out = [];
  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    // each person works ~4 days/week on a rotating pattern
    if ((d.getUTCDate() + staffIndex) % 7 >= 4) continue;
    const weekend = dow === 0 || dow === 6;
    const startH = weekend ? 16 : (staffIndex % 2 === 0 ? 11 : 17);
    const lenH = weekend ? 8 : 7;
    const inT = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), startH, 0));
    const outT = new Date(inT.getTime() + lenH * 3600000);
    out.push({ inT, outT });
  }
  return out;
}

// upcoming single shifts (this week + next) for the schedule grid
function buildShifts(staffIndex) {
  const out = [];
  const base = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    if ((d.getUTCDate() + staffIndex) % 7 >= 4) continue;
    const weekend = [0, 6].includes(d.getUTCDay());
    const startTime = weekend ? "16:00" : (staffIndex % 2 === 0 ? "11:00" : "17:00");
    const endTime = weekend ? "00:00" : (staffIndex % 2 === 0 ? "18:00" : "23:00");
    out.push({ date: ymd(d), startTime, endTime });
  }
  return out;
}

(async () => {
  const cref = await companyRef();
  const cid = cref.id;
  const wantClear = process.argv.includes("--clear");
  await clear(cref);
  if (wantClear) { console.log("Búið."); process.exit(0); }

  console.log(`\n🏢 Demo Bistró (${SLUG}) — bý til ${STAFF.length} starfsmenn...`);
  for (let i = 0; i < STAFF.length; i++) {
    const s = STAFF[i];
    const uid = `demo_${s.username}`;
    await cref.collection("staff").doc(uid).set({
      uid, username: s.username, authType: "password", ...hashPin(PIN),
      name: s.name, role: s.role, status: "approved", language: "is",
      jobTitle: s.jobTitle, employmentType: "full-time",
      payType: "hourly", hourlyRate: s.hourlyRate, collectiveAgreement: "efling_sa",
      addedAt: admin.firestore.FieldValue.serverTimestamp(), registeredSelf: false,
    });

    // punches (timesheets)
    const batch = db.batch();
    for (const p of buildPunches(i)) {
      const inRef = cref.collection("punchRecords").doc();
      batch.set(inRef, { uid, name: s.name, type: "in", timestamp: p.inT, date: ymd(p.inT), displayTime: hhmm(p.inT) });
      const outRef = cref.collection("punchRecords").doc();
      batch.set(outRef, { uid, name: s.name, type: "out", timestamp: p.outT, date: ymd(p.outT), displayTime: hhmm(p.outT) });
    }
    // upcoming shifts (schedule)
    for (const sh of buildShifts(i)) {
      const ref = cref.collection("shifts").doc();
      batch.set(ref, { uid, name: s.name, date: sh.date, startTime: sh.startTime, endTime: sh.endTime, status: "scheduled", source: "single", wageEstimate: 0, totalHours: 0 });
    }
    await batch.commit();
    console.log(`  ✅ ${s.name}  (${s.username} / ${PIN})  · ${s.role}`);
  }

  console.log(`\n🎉 Tilbúið!  →  timon.bling.is/${SLUG}`);
  console.log(`   Prófaðu:  notendanafn  jon  ·  PIN  ${PIN}   (vaktstjóri)`);
  console.log(`   Hreinsa:  node seed-demo.js --clear\n`);
  process.exit(0);
})().catch(e => { console.error("Villa:", e.message); process.exit(1); });
