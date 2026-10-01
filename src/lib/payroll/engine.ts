// Time classification for the SA/Efling hotel & restaurant agreement.
//
// A worked interval is cut at every instant where anything might change —
// 00/05/08/12/17 each day (premium windows, bar night end, noon on 24/31 Dec),
// midnight (date, holiday, rate version, terms), and any extra boundaries the
// caller supplies (pay-period edges) — and each piece is classified on its own.
// Weekly overtime is then applied chronologically per Monday-based week.

import { getHoliday } from "../icelandic-holidays";
import type { AgreementRules } from "./agreements";
import type { WorkingArrangement } from "./terms";

export type BusinessType = "bar" | "restaurant";

export type SliceKind =
  | "day" // dagvinna
  | "evening" // 33% mán.–fös. 17–24
  | "night" // 45% 00–08
  | "weekend" // 45% lau./sun.
  | "bar_night" // 55% 00–05 aðfararnótt lau./sun. (krár/skemmtistaðir)
  | "helgidagur" // 45% gr. 3.2.2
  | "storhatid" // 90% gr. 3.2.3
  | "day_overtime" // dagvinnufólk utan dagvinnutímabils / helgar / frídagar → yfirvinna
  | "unsupported_storhatid"; // dagvinnufólk á stórhátíð — gr. 1.7.2/1.7.3 þarfnast staðfestingar

export interface Classification {
  kind: SliceKind;
  pct: number; // premium on the day rate (0 for day / overtime kinds)
  holiday?: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SPLIT_HOURS = [0, 5, 8, 12, 17];

export function classify(
  ms: number,
  arrangement: WorkingArrangement,
  businessType: BusinessType,
  rules: AgreementRules
): Classification {
  const d = new Date(ms);
  const date = d.toISOString().slice(0, 10);
  const hour = d.getUTCHours();
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const weekend = dow === 0 || dow === 6;
  const h = getHoliday(date);
  const isStorhatid = h?.type === "storhatid" || (h?.type === "storhatid_from_noon" && hour >= (h.fromHour ?? 12));
  const isHelgidagur = h?.type === "helgidagur";

  if (arrangement === "day") {
    if (isStorhatid) return { kind: "unsupported_storhatid", pct: 0, holiday: h!.nameIs };
    const inDayWindow = !weekend && !isHelgidagur && hour >= rules.dayStartHour && hour < rules.dayEndHour;
    if (inDayWindow) return { kind: "day", pct: 0 };
    return { kind: "day_overtime", pct: 0, holiday: isHelgidagur ? h!.nameIs : undefined };
  }

  // Shift / casual work (gr. 3.2, 2.2.3). The highest applicable premium applies.
  const candidates: Classification[] = [{ kind: "day", pct: 0 }];
  if (isStorhatid) candidates.push({ kind: "storhatid", pct: rules.storhatidPct, holiday: h!.nameIs });
  if (isHelgidagur) candidates.push({ kind: "helgidagur", pct: rules.helgidagurPct, holiday: h!.nameIs });
  if (businessType === "bar" && weekend && hour < rules.barNightEndHour) candidates.push({ kind: "bar_night", pct: rules.barNightPct });
  if (hour < rules.dayStartHour) candidates.push({ kind: "night", pct: rules.nightWeekendPct });
  if (weekend) candidates.push({ kind: "weekend", pct: rules.nightWeekendPct });
  if (!weekend && hour >= rules.dayEndHour) candidates.push({ kind: "evening", pct: rules.eveningPct });

  // Max by pct; among equals keep the earliest pushed (holiday labels first).
  return candidates.reduce((best, c) => (c.pct > best.pct || (c.pct === best.pct && best.kind === "day") ? c : best));
}

export interface Slice extends Classification {
  start: number;
  end: number;
  /** Set by applyWeeklyOvertime. */
  overtime: boolean;
  sourceId: string;
  punchIds: string[];
  estimate: boolean;
}

/** All rule boundaries strictly inside (start, end). */
export function boundaries(start: number, end: number, extra: number[] = []): number[] {
  const set = new Set<number>();
  for (let day = Math.floor(start / DAY) * DAY; day < end; day += DAY) {
    for (const hh of SPLIT_HOURS) {
      const t = day + hh * HOUR;
      if (t > start && t < end) set.add(t);
    }
  }
  for (const t of extra) if (t > start && t < end) set.add(t);
  return [...set].sort((a, b) => a - b);
}

export interface WorkInterval {
  sourceId: string;
  start: number;
  end: number;
  punchIds: string[];
  estimate: boolean;
}

export function sliceInterval(
  iv: WorkInterval,
  arrangementAt: (ms: number) => WorkingArrangement,
  businessType: BusinessType,
  rulesAt: (ms: number) => AgreementRules,
  extraBoundaries: number[] = []
): Slice[] {
  if (!(iv.end > iv.start)) return [];
  const cuts = [iv.start, ...boundaries(iv.start, iv.end, extraBoundaries), iv.end];
  const out: Slice[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const s = cuts[i];
    const c = classify(s, arrangementAt(s), businessType, rulesAt(s));
    out.push({ ...c, start: s, end: cuts[i + 1], overtime: false, sourceId: iv.sourceId, punchIds: iv.punchIds, estimate: iv.estimate });
  }
  return out;
}

/** Monday 00:00 UTC of the week containing ms. */
export function weekStart(ms: number): number {
  const day = Math.floor(ms / DAY) * DAY;
  const dow = new Date(day).getUTCDay();
  return day - ((dow + 6) % 7) * DAY;
}

/**
 * Hours beyond `thresholdHours` in a Monday-based week become overtime, in
 * chronological order. A slice straddling the threshold is split.
 * Input must be sorted by start and non-overlapping.
 */
export function applyWeeklyOvertime(slices: Slice[], thresholdHours: number): Slice[] {
  const limit = thresholdHours * HOUR;
  const worked = new Map<number, number>();
  const out: Slice[] = [];
  for (const s of slices) {
    const wk = weekStart(s.start);
    const before = worked.get(wk) ?? 0;
    const len = s.end - s.start;
    worked.set(wk, before + len);
    if (before >= limit) {
      out.push({ ...s, overtime: true });
    } else if (before + len > limit) {
      const cut = s.start + (limit - before);
      out.push({ ...s, end: cut });
      out.push({ ...s, start: cut, overtime: true });
    } else {
      out.push(s);
    }
  }
  return out;
}
