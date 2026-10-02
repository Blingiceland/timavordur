// Persistent rate limiting with lock-out and exponential back-off.
// State lives in Firestore (tv_ratelimits) so it holds across serverless
// instances; the decision logic is a pure function so it can be unit-tested.

import { createHash } from "crypto";
import { adminDb } from "./firebase-admin";

export interface RatePolicy {
  windowMs: number;
  max: number; // attempts allowed per window before a lock
  lockMs: number; // first lock duration
  maxLockMs: number; // lock doubles each time up to this
}

export interface RateState {
  count: number;
  windowStart: number;
  lockedUntil: number;
  lockLevel: number;
}

export const POLICIES = {
  loginUser: { windowMs: 15 * 60_000, max: 5, lockMs: 15 * 60_000, maxLockMs: 24 * 3_600_000 },
  loginIp: { windowMs: 15 * 60_000, max: 30, lockMs: 15 * 60_000, maxLockMs: 6 * 3_600_000 },
  loginCompany: { windowMs: 15 * 60_000, max: 200, lockMs: 5 * 60_000, maxLockMs: 60 * 60_000 },
  // A whole staff on the workplace Wi-Fi shares one public IP — allow an onboarding session.
  signupIp: { windowMs: 60 * 60_000, max: 30, lockMs: 60 * 60_000, maxLockMs: 24 * 3_600_000 },
  signupCompany: { windowMs: 60 * 60_000, max: 60, lockMs: 30 * 60_000, maxLockMs: 6 * 3_600_000 },
  // Company self sign-up: 3 companies per user and 10 per IP a day.
  companySignupUser: { windowMs: 24 * 3_600_000, max: 3, lockMs: 24 * 3_600_000, maxLockMs: 7 * 24 * 3_600_000 },
  companySignupIp: { windowMs: 24 * 3_600_000, max: 10, lockMs: 24 * 3_600_000, maxLockMs: 7 * 24 * 3_600_000 },
} satisfies Record<string, RatePolicy>;

export function isLocked(state: RateState | null, now: number): number {
  return state && state.lockedUntil > now ? state.lockedUntil - now : 0;
}

/** Register one counted attempt (a failure, or any signup). Returns the new state. */
export function registerAttempt(state: RateState | null, now: number, p: RatePolicy): RateState {
  const s: RateState = state ? { ...state } : { count: 0, windowStart: now, lockedUntil: 0, lockLevel: 0 };
  if (now - s.windowStart >= p.windowMs) {
    s.count = 0;
    s.windowStart = now;
    // Decay the back-off level after a quiet window without a lock.
    if (s.lockedUntil <= now - p.windowMs) s.lockLevel = Math.max(0, s.lockLevel - 1);
  }
  s.count += 1;
  if (s.count >= p.max) {
    const lock = Math.min(p.lockMs * 2 ** s.lockLevel, p.maxLockMs);
    s.lockedUntil = now + lock;
    s.lockLevel += 1;
    s.count = 0;
    s.windowStart = now;
  }
  return s;
}

const docFor = (key: string) =>
  adminDb.collection("tv_ratelimits").doc(createHash("sha256").update(key).digest("hex").slice(0, 40));

/** Milliseconds remaining on a lock for any of the keys (0 = not locked). */
export async function lockedFor(keys: string[]): Promise<number> {
  const now = Date.now();
  const snaps = await Promise.all(keys.map((k) => docFor(k).get()));
  return Math.max(0, ...snaps.map((s) => isLocked((s.data() as RateState | undefined) ?? null, now)));
}

/** Atomically count an attempt against every key; returns the longest resulting lock. */
export async function recordAttempt(entries: { key: string; policy: RatePolicy }[]): Promise<number> {
  const now = Date.now();
  return adminDb.runTransaction(async (tx) => {
    const refs = entries.map((e) => docFor(e.key));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    let longest = 0;
    entries.forEach((e, i) => {
      const next = registerAttempt((snaps[i].data() as RateState | undefined) ?? null, now, e.policy);
      longest = Math.max(longest, isLocked(next, now));
      tx.set(refs[i], { ...next, expiresAt: new Date(now + e.policy.maxLockMs + e.policy.windowMs) });
    });
    return longest;
  });
}

export async function resetKey(key: string): Promise<void> {
  await docFor(key).delete();
}
