import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

async function getCompanyId(slug: string): Promise<string | null> {
  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).where("active", "==", true).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
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
    const companyId = await getCompanyId(slug);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const staffDoc = await adminDb.collection("tv_companies").doc(companyId).collection("staff").doc(decoded.uid).get();
    const companyDoc = await adminDb.collection("tv_companies").doc(companyId).get();
    const companyData = companyDoc.data() || {};
    if (!staffDoc.exists) return NextResponse.json({ isRegistered: false, status: null, isPunchedIn: false, todayHours: 0, periodHours: 0, shifts: 0, name: decoded.name || "", companyName: companyData.name || slug, registrationFields: companyData.registrationFields || {} });
    const staffData = staffDoc.data()!;
    const staffStatus = staffData.status || "approved"; // legacy: no status = approved
    if (staffStatus !== "approved") return NextResponse.json({ isRegistered: true, status: staffStatus, isPunchedIn: false, todayHours: 0, periodHours: 0, shifts: 0, name: staffData.name || "", companyName: companyData.name || slug });

    const lastPunchSnap = await adminDb.collection("tv_companies").doc(companyId).collection("punchRecords")
      .where("uid", "==", decoded.uid).orderBy("timestamp", "desc").limit(1).get();
    const isPunchedIn = !lastPunchSnap.empty && lastPunchSnap.docs[0].data().type === "in";

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayPunches = await adminDb.collection("tv_companies").doc(companyId).collection("punchRecords")
      .where("uid", "==", decoded.uid).where("timestamp", ">=", Timestamp.fromDate(todayStart)).orderBy("timestamp", "asc").get();

    let todayHours = 0; let lastIn: Date | null = null;
    for (const doc of todayPunches.docs) {
      const d = doc.data(); const ts = d.timestamp.toDate();
      if (d.type === "in") lastIn = ts;
      else if (d.type === "out" && lastIn) { todayHours += (ts.getTime() - lastIn.getTime()) / 3600000; lastIn = null; }
    }

    const now = new Date();
    const periodStart = new Date(
      now.getDate() >= 25 ? now.getFullYear() : (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()),
      now.getDate() >= 25 ? now.getMonth() : (now.getMonth() - 1 < 0 ? 11 : now.getMonth() - 1), 25
    );
    const periodPunches = await adminDb.collection("tv_companies").doc(companyId).collection("punchRecords")
      .where("uid", "==", decoded.uid).where("timestamp", ">=", Timestamp.fromDate(periodStart)).orderBy("timestamp", "asc").get();

    let periodHours = 0; let pLastIn: Date | null = null; let shifts = 0;
    for (const doc of periodPunches.docs) {
      const d = doc.data(); const ts = d.timestamp.toDate();
      if (d.type === "in") { pLastIn = ts; shifts++; }
      else if (d.type === "out" && pLastIn) { periodHours += (ts.getTime() - pLastIn.getTime()) / 3600000; pLastIn = null; }
    }

    return NextResponse.json({ isRegistered: true, status: "approved", isPunchedIn, todayHours, periodHours, shifts, name: staffData.name || decoded.name || "", companyName: companyData.name || slug });
  } catch (err) {
    console.error("[punch GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const companyId = await getCompanyId(slug);
    if (!companyId) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const staffDoc = await adminDb.collection("tv_companies").doc(companyId).collection("staff").doc(decoded.uid).get();
    if (!staffDoc.exists) return NextResponse.json({ error: "Ekki skráð/ur" }, { status: 403 });
    const staffStatus = staffDoc.data()?.status || "approved";
    if (staffStatus === "pending") return NextResponse.json({ error: "pending" }, { status: 403 });
    if (staffStatus === "rejected") return NextResponse.json({ error: "rejected" }, { status: 403 });

    // IP restriction check
    const companyDoc = await adminDb.collection("tv_companies").doc(companyId).get();
    const ipRestriction = companyDoc.data()?.ipRestriction;
    if (ipRestriction?.enabled && ipRestriction.allowedIPs?.length > 0) {
      const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
      const allowed = ipRestriction.allowedIPs.some((ip: string) => clientIP.startsWith(ip.split("/")[0].split(".").slice(0, 3).join(".")));
      if (!allowed) return NextResponse.json({ error: "ip_restricted", clientIP }, { status: 403 });
    }

    const lastSnap = await adminDb.collection("tv_companies").doc(companyId).collection("punchRecords")
      .where("uid", "==", decoded.uid).orderBy("timestamp", "desc").limit(1).get();
    const isPunchedIn = !lastSnap.empty && lastSnap.docs[0].data().type === "in";
    const newType = isPunchedIn ? "out" : "in";
    const body = await req.json().catch(() => ({}));
    const now = new Date();

    await adminDb.collection("tv_companies").doc(companyId).collection("punchRecords").add({
      uid: decoded.uid, name: body.name || decoded.name || decoded.email || "Unknown",
      email: decoded.email || "", type: newType, timestamp: FieldValue.serverTimestamp(),
      date: now.toISOString().slice(0, 10),
      displayTime: `${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")}`,
    });

    return NextResponse.json({ type: newType, time: `${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")}` });
  } catch (err) {
    console.error("[punch POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
