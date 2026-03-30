import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { calculateWage, calculateEmployerCost } from "@/lib/wage-calculator";

async function verifyToken(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try { return await adminAuth.verifyIdToken(auth.split(" ")[1]); } catch { return null; }
}

async function getCompany(slug: string) {
  const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).where("active", "==", true).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0].data();
  return { id: snap.docs[0].id, name: d.name as string };
}

// GET /api/[slug]/timesheets?period=YYYY-MM&uid=all|<uid>
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const decoded = await verifyToken(req);
  if (!decoded) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const company = await getCompany(slug);
    if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Verify caller is registered + approved
    const meDoc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(decoded.uid).get();
    if (!meDoc.exists) return NextResponse.json({ error: "not_registered" }, { status: 403 });
    const me = meDoc.data()!;
    const myRole = (me.role || "staff") as string;
    const isManager = ["manager", "admin", "owner"].includes(myRole);

    const url = new URL(req.url);
    const periodParam = url.searchParams.get("period"); // YYYY-MM
    const uidParam = url.searchParams.get("uid") || decoded.uid;

    // Resolve period start/end (25th–24th)
    let periodStart: Date;
    let periodEnd: Date;

    if (periodParam) {
      const [y, m] = periodParam.split("-").map(Number);
      periodStart = new Date(Date.UTC(y, m - 1, 25));
      periodEnd = new Date(Date.UTC(y, m, 24, 23, 59, 59));
    } else {
      // Default: current period
      const now = new Date();
      const d = now.getUTCDate();
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth();
      if (d >= 25) {
        periodStart = new Date(Date.UTC(y, m, 25));
        periodEnd = new Date(Date.UTC(y, m + 1, 24, 23, 59, 59));
      } else {
        periodStart = new Date(Date.UTC(y, m - 1, 25));
        periodEnd = new Date(Date.UTC(y, m, 24, 23, 59, 59));
      }
    }

    // Determine which UIDs to fetch
    let uids: string[];
    if (uidParam === "all" && isManager) {
      const staffSnap = await adminDb.collection("tv_companies").doc(company.id).collection("staff").where("status", "==", "approved").get();
      uids = staffSnap.docs.map(d => d.id);
    } else {
      // Staff can only see themselves
      if (uidParam !== decoded.uid && !isManager) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      uids = [uidParam];
    }

    // Fetch staff info for pay rates
    const staffCache = new Map<string, Record<string, unknown>>();
    await Promise.all(uids.map(async uid => {
      const doc = await adminDb.collection("tv_companies").doc(company.id).collection("staff").doc(uid).get();
      if (doc.exists) staffCache.set(uid, doc.data() as Record<string, unknown>);
    }));

    // Fetch all punch records for the period
    const punchSnap = await adminDb.collection("tv_companies").doc(company.id)
      .collection("punchRecords")
      .where("timestamp", ">=", Timestamp.fromDate(periodStart))
      .where("timestamp", "<=", Timestamp.fromDate(periodEnd))
      .orderBy("timestamp", "asc")
      .get();

    // Group punch records by uid → build shifts (pair in/out)
    const recordsByUid = new Map<string, { type: string; timestamp: Date; displayTime: string; wageData?: Record<string, unknown> }[]>();
    for (const doc of punchSnap.docs) {
      const d = doc.data();
      if (!uids.includes(d.uid)) continue;
      if (!recordsByUid.has(d.uid)) recordsByUid.set(d.uid, []);
      recordsByUid.get(d.uid)!.push({
        type: d.type,
        timestamp: d.timestamp.toDate(),
        displayTime: d.displayTime || "",
        wageData: d.wageData || undefined,
      });
    }

    // Build summaries per uid
    const EMPLOYER_PENSION = 0.115;
    const SOCIAL_TAX = 0.0635;

    const summaries = await Promise.all(uids.map(async uid => {
      const staff = staffCache.get(uid);
      if (!staff) return null;

      const records = recordsByUid.get(uid) || [];
      const payType = (staff.payType as string) || "hourly";
      const hourlyRate = (staff.hourlyRate as number) || 0;
      const monthlyRate = (staff.monthlyRate as number) || 0;
      const agreement = ((staff.collectiveAgreement as string) || "efling_sa") as "efling_sa" | "custom";

      // Build shifts from in/out pairs — include wage segments for display
      interface Segment { labelIs: string; labelEn: string; hours: number; multiplier: number; wage: number; category: string; }
      interface Shift { date: string; inTime: Date; outTime: Date | null; hours: number; wage: number; segments: Segment[]; open: boolean; }
      const shifts: Shift[] = [];
      let pendingIn: { timestamp: Date } | null = null;

      for (const r of records) {
        if (r.type === "in") {
          pendingIn = { timestamp: r.timestamp };
        } else if (r.type === "out" && pendingIn) {
          const wage = calculateWage(pendingIn.timestamp, r.timestamp, hourlyRate, agreement);
          shifts.push({
            date: pendingIn.timestamp.toISOString().slice(0, 10),
            inTime: pendingIn.timestamp, outTime: r.timestamp,
            hours: wage.totalHours, wage: wage.totalWage,
            segments: wage.segments.map(seg => ({ labelIs: seg.labelIs, labelEn: seg.labelEn, hours: Math.round(seg.hours * 100) / 100, multiplier: seg.multiplier, wage: Math.round(seg.wage), category: seg.category })),
            open: false,
          });
          pendingIn = null;
        }
      }
      if (pendingIn) {
        const now = new Date();
        const wage = calculateWage(pendingIn.timestamp, now, hourlyRate, agreement);
        shifts.push({
          date: pendingIn.timestamp.toISOString().slice(0, 10),
          inTime: pendingIn.timestamp, outTime: null,
          hours: wage.totalHours, wage: wage.totalWage,
          segments: wage.segments.map(seg => ({ labelIs: seg.labelIs, labelEn: seg.labelEn, hours: Math.round(seg.hours * 100) / 100, multiplier: seg.multiplier, wage: Math.round(seg.wage), category: seg.category })),
          open: true,
        });
      }

      const totalHours = shifts.reduce((s, x) => s + x.hours, 0);
      let bruttoWage = 0;
      if (payType === "hourly") bruttoWage = shifts.reduce((s, x) => s + x.wage, 0);
      else if (payType === "monthly") bruttoWage = monthlyRate;
      else bruttoWage = monthlyRate || shifts.reduce((s, x) => s + x.wage, 0);

      const orlofsRate = (staff.orlofsRate as number) || 0.1017;
      const cost = calculateEmployerCost(bruttoWage, EMPLOYER_PENSION, SOCIAL_TAX, orlofsRate);

      return {
        uid, name: staff.name as string, email: staff.email as string,
        payType, hourlyRate, monthlyRate, agreement,
        totalHours: Math.round(totalHours * 100) / 100,
        bruttoWage: Math.round(bruttoWage),
        employerCost: cost.total,
        costBreakdown: {
          brutto: cost.brutto,
          orlof: cost.orlof,
          orlofsRate: cost.orlofsRate,
          gjaldskyldBase: cost.gjaldskyldBase,
          employerPension: cost.employerPension,
          socialTax: cost.socialTax,
          total: cost.total,
        },
        shifts: shifts.map(s => ({
          date: s.date,
          inTime: s.inTime.toISOString(),
          outTime: s.outTime?.toISOString() || null,
          hours: Math.round(s.hours * 100) / 100,
          wage: Math.round(s.wage),
          segments: s.segments,
          open: s.open,
        })),
      };

    }));

    const validSummaries = summaries.filter(Boolean);
    const totalEmployerCost = validSummaries.reduce((s, x) => s + (x?.employerCost || 0), 0);

    return NextResponse.json({
      period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
      companyName: company.name,
      summaries: validSummaries,
      totalEmployerCost,
    });

  } catch (err) {
    console.error("[timesheets GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
