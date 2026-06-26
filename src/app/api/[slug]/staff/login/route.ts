import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { getCompanyBySlug } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

// POST /api/[slug]/staff/login — username/password sign-in for staff.
// On success returns a Firebase custom token the client exchanges via
// signInWithCustomToken(). Admins/owners use Google instead.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let body: { username?: unknown; password?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Ógild beiðni" }, { status: 400 }); }

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json({ error: "Notendanafn og lykilorð vantar" }, { status: 400 });
  }

  try {
    const company = await getCompanyBySlug(slug);
    if (!company) return NextResponse.json({ error: "Fyrirtæki fannst ekki" }, { status: 404 });

    const snap = await adminDb
      .collection("tv_companies").doc(company.id).collection("staff")
      .where("username", "==", username).limit(1).get();

    // Same generic message whether the username or the password is wrong.
    const badCreds = NextResponse.json({ error: "Rangt notendanafn eða lykilorð" }, { status: 401 });
    if (snap.empty) return badCreds;

    const s = snap.docs[0].data();
    if (s.authType !== "password" || !s.passwordHash) return badCreds;
    if (!verifyPassword(password, s.passwordHash, s.passwordSalt)) return badCreds;

    if ((s.status || "approved") !== "approved") {
      return NextResponse.json({ error: s.status || "not_approved" }, { status: 403 });
    }

    const token = await adminAuth.createCustomToken(snap.docs[0].id);
    return NextResponse.json({ token });
  } catch (err) {
    console.error("[staff/login]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
