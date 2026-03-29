// Wage calculator for Icelandic collective agreements
// Supports auto-splitting shifts across wage band boundaries

import { getHolidaySet } from "./icelandic-holidays";

export type CollectiveAgreement = "efling_sa" | "custom";
export type PayType = "hourly" | "monthly" | "averaged";

export interface RateInfo {
  multiplier: number;
  labelIs: string;
  labelEn: string;
  category: "dagvinna" | "kvoldvinna" | "helgarvinna" | "naetuvinna" | "storhatid";
}

export interface WageSegment {
  start: Date;
  end: Date;
  hours: number;
  multiplier: number;
  labelIs: string;
  labelEn: string;
  category: RateInfo["category"];
  wage: number; // 0 if no hourlyRate
}

export interface WageBreakdown {
  dagvinna: number;
  kvoldvinna: number;
  helgarvinna: number;
  naetuvinna: number;
  storhatid: number;
}

export interface WageCalculation {
  totalHours: number;
  totalWage: number;
  effectiveMultiplier: number; // weighted average
  segments: WageSegment[];
  breakdown: WageBreakdown; // hours per category
  wageBreakdown: WageBreakdown; // wage (kr) per category
}

// ── Efling/SA (veitingastaðir) ────────────────────────────────────────────────
function getEflingSARate(date: Date, holidays: Set<string>): RateInfo {
  const dateStr = date.toISOString().slice(0, 10);
  if (holidays.has(dateStr)) {
    return { multiplier: 1.90, labelIs: "Stórhátíðaálag", labelEn: "Public holiday", category: "storhatid" };
  }
  const dow = date.getUTCDay(); // 0=Sun, 6=Sat
  const hour = date.getUTCHours();

  if (dow === 6) { // Saturday
    if (hour < 8) return { multiplier: 1.55, labelIs: "Næturalag (fösudagsn.)", labelEn: "Night rate (Fri–Sat)", category: "naetuvinna" };
    return { multiplier: 1.45, labelIs: "Helgarálag", labelEn: "Weekend rate", category: "helgarvinna" };
  }
  if (dow === 0) { // Sunday
    if (hour < 8) return { multiplier: 1.55, labelIs: "Næturalag (laugardagsn.)", labelEn: "Night rate (Sat–Sun)", category: "naetuvinna" };
    return { multiplier: 1.45, labelIs: "Helgarálag", labelEn: "Weekend rate", category: "helgarvinna" };
  }
  // Mon–Fri
  if (hour < 17) return { multiplier: 1.00, labelIs: "Dagvinna", labelEn: "Day rate", category: "dagvinna" };
  return { multiplier: 1.33, labelIs: "Kvöldvinna", labelEn: "Evening rate", category: "kvoldvinna" };
}

// Get the next UTC boundary where the multiplier MIGHT change for Efling/SA
function getNextBoundary(current: Date, holidays: Set<string>): Date {
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const day = current.getUTCDate();
  const hour = current.getUTCHours();
  const dow = current.getUTCDay();
  const dateStr = current.toISOString().slice(0, 10);

  const midnight = new Date(Date.UTC(year, month, day + 1, 0, 0, 0));

  if (holidays.has(dateStr)) return midnight; // holidays: no intraday boundary

  if (dow === 6 || dow === 0) {
    if (hour < 8) return new Date(Date.UTC(year, month, day, 8, 0, 0));
    return midnight;
  }
  // Mon–Fri
  if (hour < 17) return new Date(Date.UTC(year, month, day, 17, 0, 0));
  return midnight;
}

export function calculateWage(
  punchIn: Date,
  punchOut: Date,
  hourlyRate = 0,
  agreement: CollectiveAgreement = "efling_sa"
): WageCalculation {
  if (punchOut <= punchIn) {
    return { totalHours: 0, totalWage: 0, effectiveMultiplier: 1, segments: [], breakdown: { dagvinna: 0, kvoldvinna: 0, helgarvinna: 0, naetuvinna: 0, storhatid: 0 }, wageBreakdown: { dagvinna: 0, kvoldvinna: 0, helgarvinna: 0, naetuvinna: 0, storhatid: 0 } };
  }

  // Build holiday set for all years involved
  const holidays = new Set<string>();
  for (let y = punchIn.getUTCFullYear(); y <= punchOut.getUTCFullYear(); y++) {
    getHolidaySet(y).forEach(d => holidays.add(d));
  }

  const segments: WageSegment[] = [];
  let current = new Date(punchIn);

  while (current < punchOut) {
    const rateInfo = agreement === "efling_sa"
      ? getEflingSARate(current, holidays)
      : { multiplier: 1.00, labelIs: "Dagvinna", labelEn: "Day rate", category: "dagvinna" as const };

    const boundary = getNextBoundary(current, holidays);
    const segEnd = boundary < punchOut ? boundary : new Date(punchOut);
    const hours = (segEnd.getTime() - current.getTime()) / 3600000;
    const wage = hours * hourlyRate * rateInfo.multiplier;

    // Merge adjacent segments with same multiplier
    const last = segments[segments.length - 1];
    if (last && last.multiplier === rateInfo.multiplier) {
      last.end = segEnd;
      last.hours += hours;
      last.wage += wage;
    } else {
      segments.push({ start: new Date(current), end: segEnd, hours, multiplier: rateInfo.multiplier, labelIs: rateInfo.labelIs, labelEn: rateInfo.labelEn, category: rateInfo.category, wage });
    }
    current = segEnd;
  }

  const totalHours = segments.reduce((s, x) => s + x.hours, 0);
  const totalWage = segments.reduce((s, x) => s + x.wage, 0);
  const effectiveMultiplier = totalHours > 0 ? segments.reduce((s, x) => s + x.multiplier * x.hours, 0) / totalHours : 1;

  const cats = ["dagvinna", "kvoldvinna", "helgarvinna", "naetuvinna", "storhatid"] as const;
  const sumHours = (cat: typeof cats[number]) => segments.filter(s => s.category === cat).reduce((acc, x) => acc + x.hours, 0);
  const sumWage = (cat: typeof cats[number]) => segments.filter(s => s.category === cat).reduce((acc, x) => acc + x.wage, 0);
  const breakdown: WageBreakdown = { dagvinna: sumHours("dagvinna"), kvoldvinna: sumHours("kvoldvinna"), helgarvinna: sumHours("helgarvinna"), naetuvinna: sumHours("naetuvinna"), storhatid: sumHours("storhatid") };
  const wageBreakdown: WageBreakdown = { dagvinna: sumWage("dagvinna"), kvoldvinna: sumWage("kvoldvinna"), helgarvinna: sumWage("helgarvinna"), naetuvinna: sumWage("naetuvinna"), storhatid: sumWage("storhatid") };

  return { totalHours, totalWage, effectiveMultiplier, segments, breakdown, wageBreakdown };
}

// Employer total cost (brutto + lífeyrir vinnuveitanda + tryggingagjald)
export function calculateEmployerCost(brutto: number, employerPension = 0.115, socialTax = 0.0635): number {
  return brutto * (1 + employerPension + socialTax);
}

// Supported collective agreements (superadmin adds to this list)
export const COLLECTIVE_AGREEMENTS: { key: CollectiveAgreement; nameIs: string; nameEn: string }[] = [
  { key: "efling_sa", nameIs: "Efling / SA — Veitingastaðir", nameEn: "Efling / SA — Restaurants" },
  { key: "custom", nameIs: "Sérstakur samningur", nameEn: "Custom agreement" },
];
