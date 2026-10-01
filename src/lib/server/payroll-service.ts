// Payroll periods: compute (always through calculateEmployeePeriod), review,
// lock with a stored snapshot, and read back. A locked period is served from
// its snapshot and never recalculated, so later rate or terms changes cannot
// alter it. Changes after locking go through payrollAdjustments.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { calculateEmployeePeriod, type EmployeeCalculation } from "../payroll/calculate";
import { fetchWindow, periodFromKey, type PayPeriod, type PunchLite } from "../payroll/punches";
import type { Company } from "../types";
import { writeAudit } from "../audit";
import { HttpError } from "./http";
import { adjustmentsCol, periodsCol, punchCol, staffCol } from "./refs";
import { loadTermsByUid } from "./terms-store";

export type PeriodStatus = "draft" | "reviewed" | "locked";

export interface EmployeeResult {
  uid: string;
  name: string;
  kennitala: string;
  calc: EmployeeCalculation;
}

export interface PeriodView {
  key: string;
  status: PeriodStatus;
  period: PayPeriod;
  reviewedBy?: string | null;
  lockedBy?: string | null;
  lockedAt?: string | null;
  employees: EmployeeResult[];
  fromSnapshot: boolean;
}

export async function loadPunches(companyId: string, from: number, to: number, uids?: string[]): Promise<Map<string, PunchLite[]>> {
  const snap = await punchCol(companyId)
    .where("timestamp", ">=", Timestamp.fromMillis(from))
    .where("timestamp", "<", Timestamp.fromMillis(to))
    .orderBy("timestamp", "asc")
    .get();
  const out = new Map<string, PunchLite[]>();
  for (const d of snap.docs) {
    const p = d.data();
    if (uids && !uids.includes(p.uid)) continue;
    if (p.type !== "in" && p.type !== "out") continue;
    if (!out.has(p.uid)) out.set(p.uid, []);
    out.get(p.uid)!.push({ id: d.id, type: p.type, at: p.timestamp.toMillis() });
  }
  return out;
}

async function loadAdjustments(companyId: string, key: string) {
  const snap = await adjustmentsCol(companyId).where("targetPeriodKey", "==", key).where("status", "==", "approved").get();
  const out = new Map<string, { id: string; amountCents: number; description: string; originalPeriodKey: string; orlofEligible: boolean }[]>();
  for (const d of snap.docs) {
    const a = d.data();
    if (!out.has(a.uid)) out.set(a.uid, []);
    out.get(a.uid)!.push({ id: d.id, amountCents: a.amountCents, description: a.description, originalPeriodKey: a.originalPeriodKey, orlofEligible: a.orlofEligible !== false });
  }
  return out;
}

/** Live calculation for a period (no writes). */
export async function computePeriod(company: Company, key: string, opts: { uids?: string[]; now?: number } = {}): Promise<EmployeeResult[]> {
  const period = periodFromKey(key);
  const now = opts.now ?? Date.now();
  const win = fetchWindow(period);
  const [staffSnap, punches, terms, adjustments] = await Promise.all([
    staffCol(company.id).get(),
    loadPunches(company.id, win.from, win.to, opts.uids),
    loadTermsByUid(company.id, opts.uids),
    loadAdjustments(company.id, key),
  ]);
  const results: EmployeeResult[] = [];
  for (const doc of staffSnap.docs) {
    const s = doc.data();
    if (opts.uids && !opts.uids.includes(doc.id)) continue;
    const myPunches = punches.get(doc.id) ?? [];
    const myTerms = terms.get(doc.id) ?? [];
    // Include approved staff, and anyone else who has punches or terms (never silently drop work).
    if (s.status !== "approved" && myPunches.length === 0 && myTerms.length === 0) continue;
    const calc = calculateEmployeePeriod({
      uid: doc.id, period, terms: myTerms, businessType: company.businessType ?? "bar", now, mode: "actual",
      punches: myPunches, adjustments: adjustments.get(doc.id),
    });
    if (s.status !== "approved" && calc.lines.length === 0) continue;
    results.push({ uid: doc.id, name: s.name || "", kennitala: s.ssn || "", calc });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name, "is"));
}

export async function readPeriod(company: Company, key: string, opts: { uids?: string[] } = {}): Promise<PeriodView> {
  const period = periodFromKey(key);
  const ref = periodsCol(company.id).doc(key);
  const snap = await ref.get();
  const d = snap.data();
  const status: PeriodStatus = d?.status === "locked" ? "locked" : d?.status === "reviewed" ? "reviewed" : "draft";
  if (status === "locked") {
    const rs = await ref.collection("results").get();
    const employees = rs.docs
      .map((r) => r.data() as EmployeeResult)
      .filter((e) => !opts.uids || opts.uids.includes(e.uid))
      .sort((a, b) => a.name.localeCompare(b.name, "is"));
    return { key, status, period, reviewedBy: d?.reviewedBy ?? null, lockedBy: d?.lockedBy ?? null, lockedAt: d?.lockedAt?.toDate?.().toISOString() ?? null, employees, fromSnapshot: true };
  }
  const employees = await computePeriod(company, key, opts);
  return { key, status, period, reviewedBy: d?.reviewedBy ?? null, employees, fromSnapshot: false };
}

export function lockBlockers(results: EmployeeResult[]) {
  return results.flatMap((r) =>
    r.calc.issues.filter((i) => i.severity === "blocker").map((i) => ({ uid: r.uid, name: r.name, code: i.code, date: i.date ?? null }))
  );
}

export async function setPeriodStatus(
  company: Company,
  key: string,
  action: "review" | "unreview" | "lock",
  actor: { uid: string; role: string },
  requestId: string,
  now = Date.now()
): Promise<{ status: PeriodStatus; blockers?: ReturnType<typeof lockBlockers> }> {
  const period = periodFromKey(key);
  const ref = periodsCol(company.id).doc(key);

  if (action === "lock") {
    if (now < period.end) throw new HttpError(409, "period_not_ended");
    const results = await computePeriod(company, key, { now });
    const blockers = lockBlockers(results);
    if (blockers.length) throw new HttpError(409, "period_has_blockers", { blockers });
    return adminDb.runTransaction(async (tx) => {
      const cur = await tx.get(ref);
      const st = cur.data()?.status;
      if (st === "locked") throw new HttpError(409, "already_locked");
      if (st !== "reviewed") throw new HttpError(409, "review_required");
      if (cur.data()?.reviewedBy === actor.uid && actor.role !== "owner") throw new HttpError(409, "second_person_required");
      const totals = results.reduce((s, r) => s + r.calc.totals.grossCents, 0);
      for (const r of results) tx.set(ref.collection("results").doc(r.uid), JSON.parse(JSON.stringify(r)));
      tx.set(ref, {
        status: "locked", lockedBy: actor.uid, lockedAt: FieldValue.serverTimestamp(),
        engineVersion: results[0]?.calc.engineVersion ?? null, employeeCount: results.length, grossCents: totals,
        rateVersions: [...new Set(results.flatMap((r) => r.calc.rateVersions))],
      }, { merge: true });
      writeAudit({
        companyId: company.id, actorUid: actor.uid, actorRole: actor.role, action: "payroll.lock", targetType: "payrollPeriod",
        targetId: key, after: { employeeCount: results.length, grossCents: totals }, requestId,
        versions: { engine: results[0]?.calc.engineVersion ?? null },
      }, tx);
      return { status: "locked" as const };
    });
  }

  return adminDb.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const st = cur.data()?.status ?? "draft";
    if (st === "locked") throw new HttpError(409, "already_locked");
    const next: PeriodStatus = action === "review" ? "reviewed" : "draft";
    tx.set(ref, action === "review"
      ? { status: next, reviewedBy: actor.uid, reviewedAt: FieldValue.serverTimestamp() }
      : { status: next, reviewedBy: null, reviewedAt: null }, { merge: true });
    writeAudit({ companyId: company.id, actorUid: actor.uid, actorRole: actor.role, action: `payroll.${action}`, targetType: "payrollPeriod", targetId: key, before: { status: st }, after: { status: next }, requestId }, tx);
    return { status: next };
  });
}

/** Throws if any date falls in a locked period (corrections must become adjustments). */
export async function assertNotLocked(companyId: string, periodKeys: string[], tx?: FirebaseFirestore.Transaction) {
  for (const k of [...new Set(periodKeys)]) {
    const ref = periodsCol(companyId).doc(k);
    const snap = tx ? await tx.get(ref) : await ref.get();
    if (snap.data()?.status === "locked") throw new HttpError(409, "period_locked", { period: k });
  }
}
