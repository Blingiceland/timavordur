// Applying a punch correction: the corrected punches are created and the
// punches they replace are marked superseded — never deleted — so the history
// stays readable and payroll only counts what is current. Used both when a
// manager approves a request and when a manager edits a shift directly. What is
// replaced is decided by planCorrection (pure, in lib/payroll/corrections).

import { Timestamp } from "firebase-admin/firestore";
import { planCorrection } from "../payroll/corrections";
import { periodContaining, shiftsOnDay, type DayShift, type PunchLite } from "../payroll/punches";
import { HttpError } from "./http";
import { assertNotLocked } from "./payroll-service";
import { punchCol, punchStateRef } from "./refs";

const DAY = 86_400_000;

/** The employee's current (not superseded) punches from the day before to two days after. */
export async function loadDayPunches(companyId: string, uid: string, date: string, tx?: FirebaseFirestore.Transaction): Promise<PunchLite[]> {
  const day = Date.parse(`${date}T00:00:00Z`);
  const q = punchCol(companyId).where("uid", "==", uid)
    .where("timestamp", ">=", Timestamp.fromMillis(day - DAY)).where("timestamp", "<", Timestamp.fromMillis(day + 3 * DAY)).orderBy("timestamp", "asc");
  const snap = tx ? await tx.get(q) : await q.get();
  const punches: PunchLite[] = [];
  for (const d of snap.docs) {
    const p = d.data();
    if (p.supersededBy || (p.type !== "in" && p.type !== "out")) continue;
    punches.push({ id: d.id, type: p.type, at: p.timestamp.toMillis() });
  }
  return punches;
}

/** The employee's current recorded shifts on a work day. */
export async function loadDayShifts(companyId: string, uid: string, date: string, span?: { from: number; to: number }): Promise<DayShift[]> {
  return shiftsOnDay(await loadDayPunches(companyId, uid, date), date, span, Date.now());
}

export const dayShiftJson = (s: DayShift) => ({
  punchIds: s.punchIds,
  inAt: s.inAt === null ? null : new Date(s.inAt).toISOString(),
  outAt: s.outAt === null ? null : new Date(s.outAt).toISOString(),
  ...(s.inProgress ? { inProgress: true } : {}),
});

/** A planner refusal as an HTTP error. */
export function planError(error: string): HttpError {
  return new HttpError(error === "correction_overlaps" ? 409 : 400, error);
}

/**
 * Inside a transaction: supersede what the plan replaces, create the corrected
 * punches and bring the live punch state in line. `replaces` is a list of punch
 * ids (whole shifts of that day) or "all" for every shift that day.
 */
export async function applyCorrection(tx: FirebaseFirestore.Transaction, p: {
  companyId: string;
  uid: string;
  name: string;
  correctionId: string;
  date: string;
  inAt: number | null;
  outAt: number | null;
  inTime: string | null;
  outTime: string | null;
  replaces: string[] | "all";
  actorUid: string;
}) {
  // Every read first, then writes.
  const punches = await loadDayPunches(p.companyId, p.uid, p.date, tx);
  const plan = planCorrection({ punches, date: p.date, inAt: p.inAt, outAt: p.outAt, replaces: p.replaces, now: Date.now() });
  if (!plan.ok) throw planError(plan.error);
  const atOf = new Map(punches.map((x) => [x.id, x.at]));
  const times = [p.inAt, p.outAt, ...plan.supersede.map((id) => atOf.get(id)!)].filter((x): x is number => x !== null);
  await assertNotLocked(p.companyId, times.map((t) => periodContaining(t).key), tx);
  const stateRef = punchStateRef(p.companyId, p.uid);
  await tx.get(stateRef); // part of the read set: a concurrent clock punch retries this transaction
  const recent = await tx.get(punchCol(p.companyId).where("uid", "==", p.uid).orderBy("timestamp", "desc").limit(50));

  const nowIso = new Date().toISOString();
  for (const id of plan.supersede) tx.update(punchCol(p.companyId).doc(id), { supersededBy: p.correctionId, supersededAt: nowIso, supersededByUid: p.actorUid });
  const created: { id: string; type: "in" | "out"; at: number; timestamp: string }[] = [];
  for (const [type, at, time] of [["in", p.inAt, p.inTime], ["out", p.outAt, p.outTime]] as const) {
    if (at === null) continue;
    const ref = punchCol(p.companyId).doc(`corr_${p.correctionId}_${type}`);
    tx.create(ref, { // fails if it already exists → no duplicate punches
      uid: p.uid, name: p.name, type, timestamp: Timestamp.fromMillis(at), date: new Date(at).toISOString().slice(0, 10),
      displayTime: time, source: "correction", correctionId: p.correctionId, correctedBy: p.actorUid,
    });
    created.push({ id: ref.id, type, at, timestamp: new Date(at).toISOString() });
  }

  // The live state follows the latest punch that still counts.
  const gone = new Set(plan.supersede);
  const kept = recent.docs.find((d) => !d.data().supersededBy && !gone.has(d.id));
  const candidates = created.map((c) => ({ id: c.id, type: c.type, at: c.at }));
  if (kept) candidates.push({ id: kept.id, type: kept.data().type, at: kept.data().timestamp.toMillis() });
  const latest = candidates.sort((a, b) => b.at - a.at)[0];
  if (latest) {
    const ts = Timestamp.fromMillis(latest.at);
    tx.set(stateRef, { open: latest.type === "in", lastPunchId: latest.id, lastAt: ts, openSince: latest.type === "in" ? ts : null });
  } else {
    tx.set(stateRef, { open: false, lastPunchId: null, lastAt: null, openSince: null });
  }
  return { created, replaced: plan.replaced, replacedIds: plan.supersede };
}
