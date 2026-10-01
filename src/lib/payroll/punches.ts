// Punch pairing and pay periods.
//
// Pay periods run from the 25th to the 24th, as half-open UTC intervals
// [start, endExclusive). Punches are fetched with a look-back window, PAIRED
// first and only then clipped to the period, so a shift that starts before the
// period or ends after it is counted exactly for the part inside it.

import type { Issue } from "./issues";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface PunchLite {
  id: string;
  type: "in" | "out";
  at: number; // ms since epoch (server timestamp)
}

export interface PairedShift {
  id: string; // in-punch id
  start: number;
  end: number;
  punchIds: string[];
  /** True while the shift is still in progress (end = now). */
  open: boolean;
}

export interface PairingResult {
  shifts: PairedShift[];
  issues: Issue[];
}

export const MAX_SHIFT_HOURS = 16; // gr. 2.4.2 — vinnulota má í undantekningartilvikum ná 16 klst.

const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function pairPunches(punches: PunchLite[], now: number, maxShiftHours = MAX_SHIFT_HOURS): PairingResult {
  const sorted = [...punches].sort((a, b) => a.at - b.at || (a.type === b.type ? a.id.localeCompare(b.id) : a.type === "in" ? -1 : 1));
  const shifts: PairedShift[] = [];
  const issues: Issue[] = [];
  const maxMs = maxShiftHours * HOUR;
  let openIn: PunchLite | null = null;

  for (const p of sorted) {
    if (p.type === "in") {
      if (openIn) issues.push({ code: "punch_missing_out", severity: "blocker", date: dateOf(openIn.at), punchIds: [openIn.id] });
      openIn = p;
    } else if (!openIn) {
      issues.push({ code: "punch_orphan_out", severity: "blocker", date: dateOf(p.at), punchIds: [p.id] });
    } else {
      if (p.at - openIn.at > maxMs) {
        issues.push({ code: "punch_shift_too_long", severity: "blocker", date: dateOf(openIn.at), punchIds: [openIn.id, p.id] });
      }
      shifts.push({ id: openIn.id, start: openIn.at, end: p.at, punchIds: [openIn.id, p.id], open: false });
      openIn = null;
    }
  }
  if (openIn) {
    if (now - openIn.at > maxMs) {
      issues.push({ code: "punch_stale_open", severity: "blocker", date: dateOf(openIn.at), punchIds: [openIn.id] });
    } else if (now > openIn.at) {
      issues.push({ code: "punch_open_estimate", severity: "blocker", date: dateOf(openIn.at), punchIds: [openIn.id] });
      shifts.push({ id: openIn.id, start: openIn.at, end: now, punchIds: [openIn.id], open: true });
    }
  }
  return { shifts, issues };
}

// ── Pay periods ────────────────────────────────────────────────────────────────
export interface PayPeriod {
  key: string; // YYYY-MM of the month in which the period STARTS (25th)
  start: number;
  end: number; // exclusive
  startDate: string;
  endDateInclusive: string;
}

const PERIOD_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isPeriodKey(v: unknown): v is string {
  return typeof v === "string" && PERIOD_KEY_RE.test(v);
}

export function periodFromKey(key: string): PayPeriod {
  const m = PERIOD_KEY_RE.exec(key);
  if (!m) throw new RangeError(`Invalid period key ${key}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const start = Date.UTC(y, mo, 25);
  const end = Date.UTC(y, mo + 1, 25);
  return { key, start, end, startDate: dateOf(start), endDateInclusive: dateOf(end - DAY) };
}

/** The period containing an instant. */
export function periodContaining(ms: number): PayPeriod {
  const d = new Date(ms);
  let y = d.getUTCFullYear();
  let mo = d.getUTCMonth();
  if (d.getUTCDate() < 25) {
    mo -= 1;
    if (mo < 0) { mo = 11; y -= 1; }
  }
  return periodFromKey(`${y}-${String(mo + 1).padStart(2, "0")}`);
}

export function shiftPeriodKey(key: string, delta: number): string {
  const p = periodFromKey(key);
  const d = new Date(p.start);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 25));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Fetch window for a period: far enough back to pair a shift that started before
 * the period and to know the hours already worked in the week that contains the
 * period start (weekly overtime), plus one day forward for punch-outs.
 */
export function fetchWindow(p: PayPeriod): { from: number; to: number } {
  const weekDay = new Date(p.start).getUTCDay();
  const monday = p.start - ((weekDay + 6) % 7) * DAY;
  return { from: Math.min(monday, p.start) - DAY, to: p.end + DAY };
}

/** Clip [start, end) to [from, to); null if empty. */
export function clip(start: number, end: number, from: number, to: number): [number, number] | null {
  const s = Math.max(start, from);
  const e = Math.min(end, to);
  return e > s ? [s, e] : null;
}
