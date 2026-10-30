// What a punch correction does to an employee's recorded punches — pure, so the
// rules are tested without a database. The server applies the plan.

import { pairPunches, shiftsOnDay, type DayShift, type PunchLite } from "./punches";

const DAY = 86_400_000;

export type CorrectionError = "replace_not_on_day" | "replace_partial_shift" | "correction_overlaps";
export type CorrectionPlan =
  | { ok: true; shifts: DayShift[]; replaced: DayShift[]; supersede: string[] }
  | { ok: false; error: CorrectionError };

/** Pairing problems that mean punches interleave: an in without its out, an out without its in. */
function interleaving(punches: PunchLite[], now: number): Set<string> {
  return new Set(pairPunches(punches, now).issues
    .filter((i) => i.code === "punch_missing_out" || i.code === "punch_orphan_out")
    .map((i) => `${i.code}:${(i.punchIds ?? []).join(",")}`));
}

/**
 * Plan a correction for `date`. `punches` are the employee's current (not
 * superseded) punches around that day; `replaces` is the chosen punch ids (whole
 * shifts of the day) or "all" — every shift that day except one being worked now.
 * - Both times: the chosen shifts are superseded.
 * - One time: only the same side of the chosen shifts is superseded, so an out
 *   time completes a forgotten clock-out and an in time moves the start.
 * - No times: the chosen shifts are removed.
 * The result may not leave a new punch without its pair.
 */
export function planCorrection(p: {
  punches: PunchLite[];
  date: string;
  inAt: number | null;
  outAt: number | null;
  replaces: string[] | "all";
  now: number;
}): CorrectionPlan {
  const times = [p.inAt, p.outAt].filter((x): x is number => x !== null);
  const span = times.length ? { from: Math.min(...times), to: Math.max(...times) } : undefined;
  const shifts = shiftsOnDay(p.punches, p.date, span, p.now);

  let replaced: DayShift[];
  if (p.replaces === "all") {
    replaced = shifts.filter((s) => !s.inProgress);
  } else {
    const chosen = new Set(p.replaces);
    const known = new Set(shifts.flatMap((s) => s.punchIds));
    if ([...chosen].some((id) => !known.has(id))) return { ok: false, error: "replace_not_on_day" };
    replaced = shifts.filter((s) => s.punchIds.some((id) => chosen.has(id)));
    if (replaced.some((s) => !s.punchIds.every((id) => chosen.has(id)))) return { ok: false, error: "replace_partial_shift" };
  }

  const side = p.inAt !== null && p.outAt === null ? "in" : p.outAt !== null && p.inAt === null ? "out" : null;
  const typeOf = new Map(p.punches.map((x) => [x.id, x.type]));
  const supersede = replaced.flatMap((s) => s.punchIds).filter((id) => !side || typeOf.get(id) === side);

  const gone = new Set(supersede);
  const after = p.punches.filter((x) => !gone.has(x.id));
  if (p.inAt !== null) after.push({ id: "\u0000new_in", type: "in", at: p.inAt });
  if (p.outAt !== null) after.push({ id: "\u0000new_out", type: "out", at: p.outAt });
  const before = interleaving(p.punches, p.now);
  if ([...interleaving(after, p.now)].some((k) => !before.has(k))) return { ok: false, error: "correction_overlaps" };

  return { ok: true, shifts, replaced, supersede };
}

/**
 * An out time alone ends the day's open shift: if it is not after that shift's
 * start it is the next morning (a night shift that ended after midnight).
 */
export function outAfterOpenShift(punches: PunchLite[], date: string, outAt: number): number {
  const open = shiftsOnDay(punches, date).find((s) => s.inAt !== null && s.outAt === null);
  return open && outAt <= open.inAt! ? outAt + DAY : outAt;
}
