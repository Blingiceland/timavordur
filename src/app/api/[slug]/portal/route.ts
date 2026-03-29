import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// ── Role system ────────────────────────────────────────────────────────────
export type Role = "staff" | "manager" | "admin" | "owner";
const ROLE_LEVEL: Record<Role, number> = { staff: 1, manager: 2, admin: 3, owner: 4 };
const atLeast = (role: Role, min: Role) => (ROLE_LEVEL[role] || 0) >= ROLE_LEVEL[min];

const toStr = (val: unknown): string => {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === "object" && val !== null && "toDate" in val) return (val as { toDate: () => Date }).toDate().toISOString();
  return String(val);
};

async function getCompany(slug: string) {
  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).where("active", "==", true).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0].data();
  return { id: snap.docs[0].id, name: d.name as string, slug: d.slug as string, adminEmails: (d.adminEmails || []) as string[], registrationFields: d.registrationFields || {}, requireApproval: d.requireApproval !== false, ipRestriction: d.ipRestriction || { enabled: false, allowedIPs: [] } };
}

async function verifyToken(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try { return await adminAuth.verifyIdToken(auth.split(" ")[1]); } catch { return null; }
}

// ── GET — fetch user status and role-appropriate data ──────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const staffRef = adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid);
    let staffDoc = await staffRef.get();

    // ── Auto-create owner if email is in adminEmails and not yet registered ──
    if (!staffDoc.exists && company.adminEmails.includes(decoded.email || "")) {
      await staffRef.set({
        uid: decoded.uid, email: decoded.email || "", name: decoded.name || decoded.email || "",
        role: "owner", status: "approved",
        addedAt: FieldValue.serverTimestamp(), registeredSelf: false, language: "is",
      });
      staffDoc = await staffRef.get();
    }

    // ── Not registered ───────────────────────────────────────────────────────
    if (!staffDoc.exists) {
      return NextResponse.json({
        registered: false, status: null,
        companyName: company.name,
        registrationFields: company.registrationFields,
        requireApproval: company.requireApproval,
      });
    }

    const s = staffDoc.data()!;
    const role = (s.role || "staff") as Role;
    const status = s.status || "approved";

    if (status !== "approved") {
      return NextResponse.json({ registered: true, status, role, name: s.name, companyName: company.name });
    }

    // ── Approved — build punch stats ─────────────────────────────────────────
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() >= 25 ? 25 : 25);
    if (new Date().getDate() < 25) periodStart.setMonth(periodStart.getMonth() - 1);
    periodStart.setHours(0, 0, 0, 0);

    const [lastPunchSnap, todaySnap, periodSnap] = await Promise.all([
      adminDb.collection("tv_companies").doc(company.id).collection("punchRecords").where("uid", "==", decoded.uid).orderBy("timestamp", "desc").limit(1).get(),
      adminDb.collection("tv_companies").doc(company.id).collection("punchRecords").where("uid", "==", decoded.uid).where("timestamp", ">=", Timestamp.fromDate(todayStart)).orderBy("timestamp", "asc").get(),
      adminDb.collection("tv_companies").doc(company.id).collection("punchRecords").where("uid", "==", decoded.uid).where("timestamp", ">=", Timestamp.fromDate(periodStart)).orderBy("timestamp", "asc").get(),
    ]);

    const isPunchedIn = !lastPunchSnap.empty && lastPunchSnap.docs[0].data().type === "in";

    const calcHours = (docs: typeof todaySnap.docs) => {
      let hours = 0; let shifts = 0; let lastIn: Date | null = null;
      for (const d of docs) { const t = d.data(); const ts = t.timestamp.toDate(); if (t.type === "in") { lastIn = ts; shifts++; } else if (t.type === "out" && lastIn) { hours += (ts.getTime() - lastIn.getTime()) / 3600000; lastIn = null; } }
      return { hours, shifts };
    };
    const { hours: todayHours } = calcHours(todaySnap.docs);
    const { hours: periodHours, shifts } = calcHours(periodSnap.docs);

    const base = { registered: true, status: "approved", role, name: s.name, companyName: company.name, isPunchedIn, todayHours, periodHours, shifts };

    // manager+ → get team status
    if (atLeast(role, "manager")) {
      const staffSnap = await adminDb.collection("tv_companies").doc(company.id).collection("staff").get();
      const team = await Promise.all(staffSnap.docs.filter(d => d.id !== decoded.uid).map(async (doc) => {
        const m = doc.data();
        const mStatus = m.status || "approved";
        if (mStatus !== "approved") return { uid: doc.id, name: m.name, email: m.email, role: m.role || "staff", status: mStatus, isPunchedIn: false, todayHours: 0 };
        const [lp, tp] = await Promise.all([
          adminDb.collection("tv_companies").doc(company.id).collection("punchRecords").where("uid", "==", doc.id).orderBy("timestamp", "desc").limit(1).get(),
          adminDb.collection("tv_companies").doc(company.id).collection("punchRecords").where("uid", "==", doc.id).where("timestamp", ">=", Timestamp.fromDate(todayStart)).orderBy("timestamp", "asc").get(),
        ]);
        const mIn = !lp.empty && lp.docs[0].data().type === "in";
        const { hours: mHours } = calcHours(tp.docs);
        return { uid: doc.id, name: m.name, email: m.email, role: m.role || "staff", status: mStatus, isPunchedIn: mIn, todayHours: mHours };
      }));

      // admin+ → full staff details + settings
      if (atLeast(role, "admin")) {
        const fullStaff = await Promise.all(staffSnap.docs.map(async (doc) => {
          const m = doc.data();
          return { uid: doc.id, name: m.name, email: m.email, role: m.role || "staff", status: m.status || "approved", ssn: m.ssn || "", phone: m.phone || "", address: m.address || "", bankName: m.bankName || "", bankAccount: m.bankAccount || "", union: m.union || "", pension: m.pension || "", workPermit: m.workPermit ?? null, workPermitExpiry: m.workPermitExpiry || "", jobTitle: m.jobTitle || "", employmentType: m.employmentType || "", language: m.language || "is", addedAt: toStr(m.addedAt || m.registeredAt) };
        }));
        return NextResponse.json({ ...base, team, staffList: fullStaff, registrationFields: company.registrationFields, requireApproval: company.requireApproval, ipRestriction: company.ipRestriction });
      }

      return NextResponse.json({ ...base, team });
    }

    return NextResponse.json(base);
  } catch (err) {
    console.error("[portal GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── POST — punch in/out ────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const staffDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    if (!staffDoc.exists) return NextResponse.json({ error: "not_registered" }, { status: 403 });
    const s = staffDoc.data()!;
    if ((s.status || "approved") !== "approved") return NextResponse.json({ error: s.status }, { status: 403 });

    // IP restriction check
    if (company.ipRestriction?.enabled && company.ipRestriction.allowedIPs?.length > 0) {
      const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
      const allowed = company.ipRestriction.allowedIPs.some((ip: string) => clientIP.startsWith(ip.split("/")[0].split(".").slice(0, 3).join(".")));
      if (!allowed) return NextResponse.json({ error: "ip_restricted", clientIP }, { status: 403 });
    }

    const lastSnap = await adminDb.collection("tv_companies").doc(company.id).collection("punchRecords").where("uid", "==", decoded.uid).orderBy("timestamp", "desc").limit(1).get();
    const isPunchedIn = !lastSnap.empty && lastSnap.docs[0].data().type === "in";
    const newType = isPunchedIn ? "out" : "in";
    const now = new Date();

    await adminDb.collection("tv_companies").doc(company.id).collection("punchRecords").add({
      uid: decoded.uid, name: s.name || decoded.name || decoded.email || "Unknown",
      email: decoded.email || "", type: newType, timestamp: FieldValue.serverTimestamp(),
      date: now.toISOString().slice(0, 10),
      displayTime: now.toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" }),
    });

    return NextResponse.json({ type: newType, time: now.toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit" }) });
  } catch (err) {
    console.error("[portal POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── PATCH — role management (owner only) + staff approve/reject/update/delete ──
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const myDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    const myRole = (myDoc.data()?.role || "staff") as Role;

    if (!atLeast(myRole, "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { uid, action, updates, role } = await req.json();
    if (!uid) return NextResponse.json({ error: "uid vantar" }, { status: 400 });

    const targetRef = adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(uid);

    if (action === "set-role") {
      if (!atLeast(myRole, "owner")) return NextResponse.json({ error: "Aðeins owner getur sett hlutverkaréttindi" }, { status: 403 });
      if (!["staff", "manager", "admin", "owner"].includes(role)) return NextResponse.json({ error: "Ógilt hlutverk" }, { status: 400 });
      await targetRef.update({ role, updatedAt: new Date().toISOString(), updatedBy: decoded.email });
      return NextResponse.json({ ok: true, role });
    }
    if (action === "approve") { await targetRef.update({ status: "approved", approvedAt: new Date().toISOString(), approvedBy: decoded.email }); return NextResponse.json({ ok: true }); }
    if (action === "reject") { await targetRef.update({ status: "rejected", rejectedAt: new Date().toISOString(), rejectedBy: decoded.email }); return NextResponse.json({ ok: true }); }
    if (action === "update" && updates) { await targetRef.update({ ...updates, updatedAt: new Date().toISOString() }); return NextResponse.json({ ok: true }); }
    if (action === "delete") { await targetRef.delete(); return NextResponse.json({ ok: true }); }

    return NextResponse.json({ error: "Óþekkt aðgerð" }, { status: 400 });
  } catch (err) {
    console.error("[portal PATCH]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── PUT — manually add staff (admin+) ─────────────────────────────────────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const myDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    if (!atLeast((myDoc.data()?.role || "staff") as Role, "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    if (!body.email) return NextResponse.json({ error: "Email vantar" }, { status: 400 });

    let uid: string;
    try { const u = await adminAuth.getUserByEmail(body.email); uid = u.uid; }
    catch { return NextResponse.json({ error: "Notandinn þarf fyrst að skrá sig inn með Google á síðuna." }, { status: 404 }); }

    const staffRole: Role = body.role && ["staff", "manager", "admin", "owner"].includes(body.role) ? body.role : "staff";

    await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(uid).set({
      uid, email: body.email, name: body.name || body.email.split("@")[0],
      role: staffRole, status: "approved",
      ssn: body.ssn || "", phone: body.phone || "", address: body.address || "",
      bankName: body.bankName || "", bankAccount: body.bankAccount || "",
      union: body.union || "", pension: body.pension || "",
      workPermit: body.workPermit ?? null, workPermitExpiry: body.workPermitExpiry || "",
      jobTitle: body.jobTitle || "", employmentType: body.employmentType || "",
      addedAt: FieldValue.serverTimestamp(), addedBy: decoded.email, registeredSelf: false, language: "is",
    }, { merge: true });

    return NextResponse.json({ ok: true, uid });
  } catch (err) {
    console.error("[portal PUT]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
