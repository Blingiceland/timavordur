import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { getCompanyBySlug } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { isUsername, isPin, cleanStr } from "@/lib/validation";
import { FieldValue } from "firebase-admin/firestore";
import { reportApiError } from "@/lib/report-error";

// POST /api/[slug]/staff/signup — self sign-up with a chosen username + 4-digit PIN.
// New accounts are "pending" until an admin approves (unless the company has turned
// approval off). Returns a custom token so the client can sign straight in and see
// their status. No prior auth required.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  let body: { username?: unknown; pin?: unknown; password?: unknown; name?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Ógild beiðni" }, { status: 400 }); }

  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const pin = typeof body.pin === "string" ? body.pin : (typeof body.password === "string" ? body.password : "");
  const name = cleanStr(body.name);

  if (!name) return NextResponse.json({ error: "Nafn vantar" }, { status: 400 });
  if (!isUsername(username)) return NextResponse.json({ error: "Ógilt notendanafn (3–30 stafir: a–z, 0–9, . _ -)" }, { status: 400 });
  if (!isPin(pin)) return NextResponse.json({ error: "PIN verður að vera 4 tölustafir" }, { status: 400 });

  try {
    const company = await getCompanyBySlug(slug);
    if (!company) return NextResponse.json({ error: "Fyrirtæki fannst ekki" }, { status: 404 });

    const staffCol = adminDb.collection("tv_companies").doc(company.id).collection("staff");
    const dup = await staffCol.where("username", "==", username).limit(1).get();
    if (!dup.empty) return NextResponse.json({ error: "Notendanafn er þegar í notkun" }, { status: 409 });

    const { hash, salt } = hashPassword(pin);
    const uid = "pw_" + randomBytes(12).toString("hex");
    const status = company.requireApproval ? "pending" : "approved";

    await staffCol.doc(uid).set({
      uid, username, authType: "password", passwordHash: hash, passwordSalt: salt,
      name, role: "staff", status,
      registeredSelf: true, language: "is",
      registeredAt: FieldValue.serverTimestamp(),
    });

    const token = await adminAuth.createCustomToken(uid);
    return NextResponse.json({ ok: true, status, token });
  } catch (err) {
    await reportApiError("staff/signup", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
