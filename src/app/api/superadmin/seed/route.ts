import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

// POST /api/superadmin/seed
// Eitt skipti notað til að stilla fyrsta superadmin
// Verður eytt á eftir!
export async function POST(req: NextRequest) {
  // Öryggislykill til að koma í veg fyrir óleyfilega notkun
  const { secret, email, name } = await req.json();

  const SETUP_SECRET = process.env.SETUP_SECRET || "timavordur-setup-2024";

  if (secret !== SETUP_SECRET) {
    return NextResponse.json({ error: "Leynileg" }, { status: 403 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email vantar" }, { status: 400 });
  }

  try {
    // Finna uid úr Firebase Auth
    const userRecord = await adminAuth.getUserByEmail(email);
    const uid = userRecord.uid;

    // Setja superadmin role í Firestore
    await adminDb.collection("tv_users").doc(uid).set(
      {
        uid,
        email,
        name: name || userRecord.displayName || email,
        role: "superadmin",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      message: `✅ ${email} er nú superadmin!`,
      uid,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Óþekkt villa";
    // If user not found in Firebase Auth
    if (message.includes("no user record")) {
      return NextResponse.json(
        {
          error: "Notandinn hefur ekki skráð sig inn með Google enn. Skráðu þig inn á timavordur.vercel.app fyrst.",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
