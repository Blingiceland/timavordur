// The only way to create a live punch. Explicit action ("in" | "out"), one
// Firestore transaction over the employee's punch-state document, and an
// idempotency record so a retried or double-clicked request returns the first
// result instead of creating a second punch or flipping the direction.

import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { HttpError } from "./http";
import { punchCol, punchIdemRef, punchStateRef } from "./refs";

export type PunchAction = "in" | "out";

export interface PunchResult {
  type: PunchAction;
  time: string; // HH:MM UTC (= Iceland)
  at: string; // ISO
  punchId: string;
  replay: boolean;
}

const hhmm = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
const IDEMPOTENCY_TTL_MS = 7 * 24 * 3_600_000;

/** Current open/closed state, using the state doc or (for legacy data) the latest punch. */
export async function readPunchState(
  companyId: string,
  uid: string,
  tx?: FirebaseFirestore.Transaction
): Promise<{ open: boolean; lastAt: number | null; openSince: number | null }> {
  const ref = punchStateRef(companyId, uid);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (snap.exists) {
    const d = snap.data()!;
    return { open: !!d.open, lastAt: d.lastAt?.toMillis?.() ?? null, openSince: d.openSince?.toMillis?.() ?? null };
  }
  const q = punchCol(companyId).where("uid", "==", uid).orderBy("timestamp", "desc").limit(1);
  const last = tx ? await tx.get(q) : await q.get();
  if (last.empty) return { open: false, lastAt: null, openSince: null };
  const d = last.docs[0].data();
  const at = d.timestamp?.toMillis?.() ?? null;
  return { open: d.type === "in", lastAt: at, openSince: d.type === "in" ? at : null };
}

export async function recordPunch(p: {
  companyId: string;
  uid: string;
  name: string;
  email: string;
  action: PunchAction;
  idempotencyKey: string;
  clientIp: string | null;
  /** Other companies in the same group: a person cannot be punched in at two workplaces. */
  otherCompanyIds?: string[];
  now?: number;
}): Promise<PunchResult> {
  const idemRef = punchIdemRef(p.companyId, p.uid, p.idempotencyKey);
  const stateRef = punchStateRef(p.companyId, p.uid);

  try {
    return await punchTransaction(p, idemRef, stateRef);
  } catch (err) {
    // Heavy contention on the same employee (e.g. a burst of taps) can exhaust the
    // transaction retries. Nothing was written; report a retryable conflict.
    if (!(err instanceof HttpError) && (err as { code?: unknown }).code === 10) throw new HttpError(409, "concurrent_request");
    throw err;
  }
}

function punchTransaction(
  p: Parameters<typeof recordPunch>[0],
  idemRef: FirebaseFirestore.DocumentReference,
  stateRef: FirebaseFirestore.DocumentReference
): Promise<PunchResult> {
  return adminDb.runTransaction(async (tx) => {
    const idem = await tx.get(idemRef);
    if (idem.exists) {
      const prev = idem.data()!;
      if (prev.action !== p.action) throw new HttpError(409, "idempotency_key_reused");
      return { ...(prev.response as PunchResult), replay: true };
    }
    const state = await readPunchState(p.companyId, p.uid, tx);
    if (p.action === "in") {
      for (const other of p.otherCompanyIds ?? []) {
        const s = await tx.get(punchStateRef(other, p.uid));
        if (s.exists && s.data()!.open) throw new HttpError(409, "punched_in_elsewhere", { companyId: other });
      }
    }
    if (p.action === "in" && state.open) throw new HttpError(409, "already_punched_in");
    if (p.action === "out" && !state.open) throw new HttpError(409, "not_punched_in");

    const now = new Date(p.now ?? Date.now());
    if (state.lastAt !== null && now.getTime() <= state.lastAt) throw new HttpError(409, "clock_skew");
    const ts = Timestamp.fromDate(now);
    const ref = punchCol(p.companyId).doc();
    tx.set(ref, {
      uid: p.uid,
      name: p.name,
      email: p.email,
      type: p.action,
      timestamp: ts,
      date: now.toISOString().slice(0, 10),
      displayTime: hhmm(now),
      source: "clock",
      idempotencyKey: p.idempotencyKey,
      clientIp: p.clientIp,
    });
    tx.set(stateRef, {
      open: p.action === "in",
      lastPunchId: ref.id,
      lastAt: ts,
      openSince: p.action === "in" ? ts : null,
    });
    const response: PunchResult = { type: p.action, time: hhmm(now), at: now.toISOString(), punchId: ref.id, replay: false };
    tx.set(idemRef, { action: p.action, response, createdAt: ts, expiresAt: Timestamp.fromMillis(now.getTime() + IDEMPOTENCY_TTL_MS) });
    return response;
  });
}
