import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// DEV ONLY — seed mock punch records for testing
// POST /api/[slug]/dev-seed  (admin/owner only)
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {

  const { slug } = await params;
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const decoded = await adminAuth.verifyIdToken(auth.split(" ")[1]);
    const companySnap = await adminDb.collection("tv_companies").where("slug", "==", slug).where("active", "==", true).limit(1).get();
    if (companySnap.empty) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    const companyId = companySnap.docs[0].id;

    // Verify caller is owner
    const meDoc = await adminDb.collection("tv_companies").doc(companyId).collection("staff").doc(decoded.uid).get();
    if (!meDoc.exists || !["admin", "owner"].includes(meDoc.data()?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const MOCK_UID = "mock-anna-001";
    const MOCK_NAME = "Anna Sigurðardóttir";
    const MOCK_EMAIL = "anna.mock@dillon.is";

    // Create mock staff member
    await adminDb.collection("tv_companies").doc(companyId).collection("staff").doc(MOCK_UID).set({
      uid: MOCK_UID, name: MOCK_NAME, email: MOCK_EMAIL,
      role: "staff", status: "approved",
      jobTitle: "Barþjónn", employmentType: "full-time",
      payType: "hourly", hourlyRate: 2000,
      collectiveAgreement: "efling_sa",
      ssn: "010190-1234", phone: "8001234",
      bankName: "Íslandsbanki", bankAccount: "0111-26-111111",
      union: "Efling", pension: "Gildi",
      addedAt: FieldValue.serverTimestamp(), registeredSelf: false, language: "is",
    }, { merge: true });

    // Generate mock punch records for current period (March 25 - April 5)
    // Various shift types: dagvinna, kvöldvinna, helgarvinna, stórhátíð
    const shifts: { in: Date; out: Date }[] = [
      // Þriðjudagur 25. mars — dagvinna (08:00–16:00)
      { in: new Date("2026-03-25T08:00:00Z"), out: new Date("2026-03-25T16:00:00Z") },
      // Þriðjudagur 25. mars — kvöldvakt (18:00–23:00)
      { in: new Date("2026-03-25T18:00:00Z"), out: new Date("2026-03-25T23:00:00Z") },
      // Miðvikudagur 26. mars — dagvinna + kvöldvinna (15:00–22:00)
      { in: new Date("2026-03-26T15:00:00Z"), out: new Date("2026-03-26T22:00:00Z") },
      // Fimmtudagur 27. mars — dagvinna (09:00–17:30)
      { in: new Date("2026-03-27T09:00:00Z"), out: new Date("2026-03-27T17:30:00Z") },
      // Föstudagur 28. mars — kvöldvakt yfir miðnætti
      { in: new Date("2026-03-28T20:00:00Z"), out: new Date("2026-03-29T02:00:00Z") },
      // Laugardagur 29. mars — helgarvakt (12:00–20:00)
      { in: new Date("2026-03-29T12:00:00Z"), out: new Date("2026-03-29T20:00:00Z") },
      // Sunnudagur 30. mars — helgarvakt (11:00–18:00)
      { in: new Date("2026-03-30T11:00:00Z"), out: new Date("2026-03-30T18:00:00Z") },
      // Mánudagur 31. mars — dagvinna (08:00–16:00)
      { in: new Date("2026-03-31T08:00:00Z"), out: new Date("2026-03-31T16:00:00Z") },
      // Þriðjudagur 1. apríl — dagvinna (09:00–17:00)
      { in: new Date("2026-04-01T09:00:00Z"), out: new Date("2026-04-01T17:00:00Z") },
      // Miðvikudagur 2. apríl — kvöldvakt (17:00–23:30)
      { in: new Date("2026-04-02T17:00:00Z"), out: new Date("2026-04-02T23:30:00Z") },
      // Fimmtudagur 3. apríl — Skírdagur (helgarfrídagur ×1.45)
      { in: new Date("2026-04-03T10:00:00Z"), out: new Date("2026-04-03T18:00:00Z") },
      // Föstudagur 4. apríl — Föstudagurinn langi (stórhátíð ×1.90!)
      { in: new Date("2026-04-04T12:00:00Z"), out: new Date("2026-04-04T20:00:00Z") },
    ];

    // Add punch records
    const batch = adminDb.batch();
    for (const shift of shifts) {
      const inRef = adminDb.collection("tv_companies").doc(companyId).collection("punchRecords").doc();
      batch.set(inRef, {
        uid: MOCK_UID, name: MOCK_NAME, email: MOCK_EMAIL,
        type: "in", timestamp: shift.in,
        date: shift.in.toISOString().slice(0, 10),
        displayTime: `${String(shift.in.getUTCHours()).padStart(2,"0")}:${String(shift.in.getUTCMinutes()).padStart(2,"0")}`,
      });
      const outRef = adminDb.collection("tv_companies").doc(companyId).collection("punchRecords").doc();
      batch.set(outRef, {
        uid: MOCK_UID, name: MOCK_NAME, email: MOCK_EMAIL,
        type: "out", timestamp: shift.out,
        date: shift.out.toISOString().slice(0, 10),
        displayTime: `${String(shift.out.getUTCHours()).padStart(2,"0")}:${String(shift.out.getUTCMinutes()).padStart(2,"0")}`,
      });
    }
    await batch.commit();

    return NextResponse.json({ ok: true, message: `Mock starfsmaður "${MOCK_NAME}" búinn til með ${shifts.length} vöktum (þ.m.t. Skírdag og Föstudaginn langa)` });
  } catch (err) {
    console.error("[dev-seed]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await adminAuth.verifyIdToken(auth.split(" ")[1]);
    const companySnap = await adminDb.collection("tv_companies").where("slug", "==", slug).where("active", "==", true).limit(1).get();
    if (companySnap.empty) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const companyId = companySnap.docs[0].id;
    const meDoc = await adminDb.collection("tv_companies").doc(companyId).collection("staff").doc(decoded.uid).get();
    if (!meDoc.exists || !["admin", "owner"].includes(meDoc.data()?.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Delete mock staff
    await adminDb.collection("tv_companies").doc(companyId).collection("staff").doc("mock-anna-001").delete();
    // Delete mock punch records
    const rSnap = await adminDb.collection("tv_companies").doc(companyId).collection("punchRecords").where("uid", "==", "mock-anna-001").get();
    const b2 = adminDb.batch();
    rSnap.docs.forEach(d => b2.delete(d.ref));
    await b2.commit();
    return NextResponse.json({ ok: true, message: "Mock gögn eytt" });
  } catch (err) {
    console.error("[dev-seed DELETE]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
