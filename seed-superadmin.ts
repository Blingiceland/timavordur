import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "fs";
import { join } from "path";

const serviceAccount = JSON.parse(
  readFileSync(join(process.cwd(), "service-account-key.json"), "utf8")
);

const app = initializeApp({
  credential: cert(serviceAccount),
  projectId: "timavordur",
});

const authAdmin = getAuth(app);
const db = getFirestore(app);

const EMAIL = "jonb.steinsson@gmail.com";

async function seedSuperAdmin() {
  console.log(`\n🔍 Leita að notanda: ${EMAIL}`);

  let uid: string;
  try {
    const userRecord = await authAdmin.getUserByEmail(EMAIL);
    uid = userRecord.uid;
    console.log(`✅ Notandi fundinn: ${userRecord.displayName} (${uid})`);
  } catch {
    console.error(`\n⚠️  Notandinn hefur EKKI skráð sig inn með Google inn.`);
    console.error(`   Farðu á https://timavordur.vercel.app og skráðu þig inn með Google FYRST.`);
    console.error(`   Síðan keyrir þú þetta script aftur.\n`);
    process.exit(1);
  }

  await db.collection("tv_users").doc(uid).set(
    {
      uid,
      email: EMAIL,
      name: "Jón Steinsson",
      role: "superadmin",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  console.log(`\n🎉 SUPERADMIN stilltur!`);
  console.log(`   Notandi: ${EMAIL}`);
  console.log(`   UID: ${uid}`);
  console.log(`   Role: superadmin`);
  console.log(`\n👉 Farðu á: https://timavordur.vercel.app/superadmin/login\n`);
  process.exit(0);
}

seedSuperAdmin().catch((err) => {
  console.error("Villa:", err);
  process.exit(1);
});
