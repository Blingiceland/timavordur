import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

async function getCompany(slug: string) {
  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).where("active", "==", true).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as { name: string; adminEmails?: string[] }) };
}

async function verifyToken(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try { return await adminAuth.verifyIdToken(auth.split(" ")[1]); } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!(company.adminEmails || []).includes(decoded.email || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const staffSnap = await adminDb.collection("tv_companies").doc(company.id).collection("staff").get();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const staffList = await Promise.all(staffSnap.docs.map(async (doc) => {
      const s = doc.data();
      const lastPunch = await adminDb.collection("tv_companies").doc(company.id).collection("punchRecords")
        .where("uid", "==", doc.id).orderBy("timestamp", "desc").limit(1).get();
      const isPunchedIn = !lastPunch.empty && lastPunch.docs[0].data().type === "in";

      const todayPunches = await adminDb.collection("tv_companies").doc(company.id).collection("punchRecords")
        .where("uid", "==", doc.id).where("timestamp", ">=", Timestamp.fromDate(todayStart)).orderBy("timestamp", "asc").get();

      let todayHours = 0; let lastIn: Date | null = null;
      for (const p of todayPunches.docs) {
        const d = p.data(); const ts = d.timestamp.toDate();
        if (d.type === "in") lastIn = ts;
        else if (d.type === "out" && lastIn) { todayHours += (ts.getTime() - lastIn.getTime()) / 3600000; lastIn = null; }
      }
      return { uid: doc.id, name: s.name, email: s.email, isPunchedIn, todayHours };
    }));

    return NextResponse.json({ companyName: company.name, isAdmin: true, staffList });
  } catch (err) {
    console.error("[admin GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(company.adminEmails || []).includes(decoded.email || "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { email, name } = await req.json();
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    let uid: string;
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      uid = userRecord.uid;
    } catch {
      return NextResponse.json({ error: "Notandi með þetta netfang er ekki til" }, { status: 404 });
    }

    await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(uid).set({
      name: name || email.split("@")[0], email, role: "staff", active: true, addedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, uid });
  } catch (err) {
    console.error("[admin POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
