import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { atLeast, isAccessError, staffRef, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { resolveRates } from "@/lib/payroll/rates";
import { parseTermsInput } from "@/lib/payroll/terms-input";
import { orlofBasisPoints, termsForDate } from "@/lib/payroll/terms";
import { accessFail, fail, handle, HttpError, json } from "@/lib/server/http";
import { staffCol, termsCol } from "@/lib/server/refs";
import { loadTermsByUid, termsFromDoc } from "@/lib/server/terms-store";
import { isDate, isDocId, readJsonObject } from "@/lib/validation";

type Ctx = { params: Promise<{ slug: string }> };
const today = () => new Date().toISOString().slice(0, 10);

/** What the rate engine would use on a date — shown to the employee and the admin. */
function explain(history: ReturnType<typeof termsFromDoc>[], date: string) {
  const r = resolveRates(history, date);
  if (!r.ok) return { date, ok: false, issues: r.issues.map((i) => i.code) };
  const x = r.rates;
  const orlof = orlofBasisPoints(x.terms, date);
  return {
    date, ok: true, termsId: x.terms.id, version: x.version.version, versionStatus: x.version.status,
    wageClass: x.wageClass, step: x.step, stepBasis: x.stepBasis, managementRole: x.terms.managementRole,
    minimumMonthly: x.minimumMonthly, minimumDayCents: x.minimumDayCents, basis: x.basis, dayCents: x.dayCents, overtimeCents: x.overtimeCents,
    orlofBp: orlof.bp, issues: [...x.issues, ...orlof.issues].map((i) => i.code),
  };
}

// GET /api/[slug]/terms?uid=<uid>|all[&date=YYYY-MM-DD]
//   own terms: any approved member; others / "all": admin+.
export async function GET(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("terms GET", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "staff");
    if (isAccessError(access)) return accessFail(access);
    const url = new URL(req.url);
    const uid = url.searchParams.get("uid") || access.decoded.uid;
    const date = url.searchParams.get("date") || today();
    if (!isDate(date)) return fail("invalid_date", 400);
    const isAdmin = atLeast(access.role, "admin");
    if (uid !== access.decoded.uid && !isAdmin) return fail("forbidden", 403);

    if (uid === "all") {
      const [staffSnap, terms] = await Promise.all([staffCol(access.company.id).where("status", "==", "approved").get(), loadTermsByUid(access.company.id)]);
      const next = `${Number(date.slice(0, 4)) + 1}-01-01`;
      const employees = staffSnap.docs.map((d) => {
        const h = terms.get(d.id) ?? [];
        const current = explain(h, date);
        return {
          uid: d.id, name: d.data().name || "", current, nextYear: explain(h, next),
          needsPlacement: !current.ok || current.issues.some((c) => ["terms_needs_review", "missing_wage_class", "missing_employer_start_date", "missing_birth_date", "missing_working_arrangement"].includes(c)),
        };
      }).sort((a, b) => a.name.localeCompare(b.name, "is"));
      return json({ date, employees });
    }
    if (!isDocId(uid)) return fail("invalid_uid", 400);
    const history = (await loadTermsByUid(access.company.id, [uid])).get(uid) ?? [];
    history.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.recordedAt.localeCompare(b.recordedAt));
    const next = `${Number(date.slice(0, 4)) + 1}-01-01`;
    return json({
      uid, date, history: isAdmin ? history : history.map(({ legacy: _l, ...t }) => { void _l; return t; }),
      current: explain(history, date), nextYear: explain(history, next),
      inForce: termsForDate(history, date)?.id ?? null,
    });
  });
}

// POST /api/[slug]/terms — record NEW terms from an effective date (admin+).
// Nothing is overwritten; the previous record stays in the history.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { slug } = await params;
  return handle("terms POST", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "admin");
    if (isAccessError(access)) return accessFail(access);
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    const parsed = parseTermsInput(body);
    if (!parsed.ok) return fail("invalid_terms", 400, { errors: parsed.errors });
    const v = parsed.value;
    const target = staffRef(access.company.id, v.uid);
    const ref = termsCol(access.company.id).doc();

    await adminDb.runTransaction(async (tx) => {
      const staff = await tx.get(target);
      if (!staff.exists) throw new HttpError(404, "staff_not_found");
      const prevSnap = await tx.get(termsCol(access.company.id).where("uid", "==", v.uid));
      const prev = termsForDate(prevSnap.docs.map((d) => termsFromDoc(d.id, d.data())), v.effectiveFrom);
      const doc = { ...v, status: "active", recordedAt: FieldValue.serverTimestamp(), recordedBy: access.decoded.uid, legacy: null };
      tx.set(ref, doc);
      writeAudit({
        companyId: access.company.id, actorUid: access.decoded.uid, actorRole: access.role, action: "terms.create",
        targetType: "employmentTerms", targetId: ref.id, reason: v.reason, before: prev, after: { ...v, id: ref.id }, requestId: requestIdOf(req),
        versions: { supersedes: prev?.id ?? null },
      }, tx);
    });
    return json({ id: ref.id });
  });
}
