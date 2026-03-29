import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";

// POST /api/superadmin/auth — verify token and check superadmin role
export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    // Verify the Firebase ID token
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email;

    // Check if user has superadmin role in Firestore
    const userDoc = await adminDb.collection("tv_users").doc(uid).get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: "Notandi ekki skráður" }, { status: 403 });
    }

    const userData = userDoc.data();
    if (userData?.role !== "superadmin") {
      return NextResponse.json({ error: "Ekki superadmin" }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      uid,
      email,
      name: userData.name || decoded.name,
    });
  } catch (err) {
    console.error("[superadmin/auth]", err);
    return NextResponse.json({ error: "Auth villa" }, { status: 401 });
  }
}
