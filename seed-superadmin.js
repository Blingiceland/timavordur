/**
 * seed-superadmin.js
 * 
 * Keyrir EINU SINNI til að stilla Jón sem superadmin í Firestore.
 * 
 * Notkun: node seed-superadmin.js
 */

const admin = require("firebase-admin");
const serviceAccount = require("./service-account-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "timavordur",
});

const db = admin.firestore();

async function seedSuperAdmin() {
  // Netfang superadmin
  const EMAIL = "jonb.steinsson@gmail.com";

  console.log(`\n🔍 Leita að notanda með netfang: ${EMAIL}`);

  // Finna uid í Firebase Auth
  let uid;
  try {
    const userRecord = await admin.auth().getUserByEmail(EMAIL);
    uid = userRecord.uid;
    console.log(`✅ Notandi fundinn: ${userRecord.displayName} (${uid})`);
  } catch (err) {
    console.error(`\n⚠️  Notandinn hefur EKKI skráð sig inn með Google enn.`);
    console.error(`   Farðu á https://timavordur.vercel.app og skráðu þig inn með Google FYRST.`);
    console.error(`   Síðan keyrir þú þetta script aftur.\n`);
    process.exit(1);
  }

  // Búa til/uppfæra tv_users document
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
