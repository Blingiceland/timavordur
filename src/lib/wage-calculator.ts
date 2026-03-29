// Wage calculator for Icelandic collective agreements (Efling/SA)
// Auto-splits shifts across wage band boundaries

import { getHolidayMap, HolidayInfo } from "./icelandic-holidays";

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
  wage: number;
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
  effectiveMultiplier: number;
  segments: WageSegment[];
  breakdown: WageBreakdown;   // hours per category
  wageBreakdown: WageBreakdown; // wage (kr) per category
}

// ── Efling/SA rate for a specific UTC moment ──────────────────────────────────
function getEflingSARate(date: Date, holidayMap: Map<string, HolidayInfo>): RateInfo {
  const dateStr = date.toISOString().slice(0, 10);
  const holiday = holidayMap.get(dateStr);
  const dow = date.getUTCDay(); // 0=Sun, 6=Sat
  const hour = date.getUTCHours();

  // Full stórhátíðardagur → ×1.90 all day
  if (holiday?.type === "storhatid") {
    return { multiplier: 1.90, labelIs: `Stórhátíðaálag (${holiday.nameIs})`, labelEn: `Holiday rate (${holiday.nameEn})`, category: "storhatid" };
  }

  // Half stórhátíð (e.g. Aðfangadagur, Gamlársdagur) → ×1.90 from storhatidFromHour
  if (holiday?.type === "half-storhatid" && hour >= (holiday.storhatidFromHour ?? 16)) {
    return { multiplier: 1.90, labelIs: `Stórhátíðaálag (${holiday.nameIs})`, labelEn: `Holiday rate (${holiday.nameEn})`, category: "storhatid" };
  }

  // Helgarfrídagur (e.g. Nýársdagur, Skírdagur) → ×1.45
  if (holiday?.type === "helgarfridagur") {
    return { multiplier: 1.45, labelIs: `Helgarálag (${holiday.nameIs})`, labelEn: `Holiday rate (${holiday.nameEn})`, category: "helgarvinna" };
  }

  // Saturday — næturalag until 08:00, then helgarálag
  if (dow === 6) {
    if (hour < 8) return { multiplier: 1.55, labelIs: "Næturalag (fösudagsn.)", labelEn: "Night rate (Fri–Sat)", category: "naetuvinna" };
    return { multiplier: 1.45, labelIs: "Helgarálag", labelEn: "Weekend rate", category: "helgarvinna" };
  }

  // Sunday — næturalag until 08:00, then helgarálag
  if (dow === 0) {
    if (hour < 8) return { multiplier: 1.55, labelIs: "Næturalag (laugardagsn.)", labelEn: "Night rate (Sat–Sun)", category: "naetuvinna" };
    return { multiplier: 1.45, labelIs: "Helgarálag", labelEn: "Weekend rate", category: "helgarvinna" };
  }

  // Mon–Fri (non-holiday)
  if (hour < 17) return { multiplier: 1.00, labelIs: "Dagvinna", labelEn: "Day rate", category: "dagvinna" };
  return { multiplier: 1.33, labelIs: "Kvöldvinna", labelEn: "Evening rate", category: "kvoldvinna" };
}

// Next UTC boundary where the rate might change
function getNextBoundary(date: Date, holidayMap: Map<string, HolidayInfo>): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const dow = date.getUTCDay();
  const dateStr = date.toISOString().slice(0, 10);
  const holiday = holidayMap.get(dateStr);

  const midnight = new Date(Date.UTC(year, month, day + 1, 0, 0, 0));

  // Full stórhátíð — no intraday boundary
  if (holiday?.type === "storhatid") return midnight;

  // Half stórhátíð — boundary at storhatidFromHour
  if (holiday?.type === "half-storhatid") {
    const fromHour = holiday.storhatidFromHour ?? 16;
    if (hour < fromHour) return new Date(Date.UTC(year, month, day, fromHour, 0, 0));
    return midnight;
  }

  // Helgarfrídagur — no intraday boundary
  if (holiday?.type === "helgarfridagur") return midnight;

  // Sat/Sun — boundary at 08:00
  if (dow === 6 || dow === 0) {
    if (hour < 8) return new Date(Date.UTC(year, month, day, 8, 0, 0));
    return midnight;
  }

  // Mon–Fri — boundary at 17:00
  if (hour < 17) return new Date(Date.UTC(year, month, day, 17, 0, 0));
  return midnight;
}

// Build combined holiday map across potentially multiple years
function buildHolidayMap(from: Date, to: Date): Map<string, HolidayInfo> {
  const map = new Map<string, HolidayInfo>();
  for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) {
    getHolidayMap(y).forEach((v, k) => map.set(k, v));
  }
  return map;
}

export function calculateWage(
  punchIn: Date,
  punchOut: Date,
  hourlyRate = 0,
  agreement: CollectiveAgreement = "efling_sa"
): WageCalculation {
  const empty: WageCalculation = {
    totalHours: 0, totalWage: 0, effectiveMultiplier: 1, segments: [],
    breakdown: { dagvinna: 0, kvoldvinna: 0, helgarvinna: 0, naetuvinna: 0, storhatid: 0 },
    wageBreakdown: { dagvinna: 0, kvoldvinna: 0, helgarvinna: 0, naetuvinna: 0, storhatid: 0 },
  };
  if (punchOut <= punchIn) return empty;

  const holidayMap = buildHolidayMap(punchIn, punchOut);
  const segments: WageSegment[] = [];
  let current = new Date(punchIn);

  while (current < punchOut) {
    const rateInfo = agreement === "efling_sa"
      ? getEflingSARate(current, holidayMap)
      : { multiplier: 1.00, labelIs: "Dagvinna", labelEn: "Day rate", category: "dagvinna" as const };

    const boundary = getNextBoundary(current, holidayMap);
    const segEnd = boundary < punchOut ? boundary : new Date(punchOut);
    const hours = (segEnd.getTime() - current.getTime()) / 3600000;
    const wage = hours * hourlyRate * rateInfo.multiplier;

    // Merge adjacent segments with same multiplier
    const last = segments[segments.length - 1];
    if (last && last.multiplier === rateInfo.multiplier && last.labelIs === rateInfo.labelIs) {
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

  const sumH = (cat: RateInfo["category"]) => segments.filter(s => s.category === cat).reduce((a, x) => a + x.hours, 0);
  const sumW = (cat: RateInfo["category"]) => segments.filter(s => s.category === cat).reduce((a, x) => a + x.wage, 0);

  const breakdown: WageBreakdown = { dagvinna: sumH("dagvinna"), kvoldvinna: sumH("kvoldvinna"), helgarvinna: sumH("helgarvinna"), naetuvinna: sumH("naetuvinna"), storhatid: sumH("storhatid") };
  const wageBreakdown: WageBreakdown = { dagvinna: sumW("dagvinna"), kvoldvinna: sumW("kvoldvinna"), helgarvinna: sumW("helgarvinna"), naetuvinna: sumW("naetuvinna"), storhatid: sumW("storhatid") };

  return { totalHours, totalWage, effectiveMultiplier: Math.round(effectiveMultiplier * 1000) / 1000, segments, breakdown, wageBreakdown };
}

// Employer total cost = brúttólaun + lífeyrir + tryggingagjald
export function calculateEmployerCost(brutto: number, employerPension = 0.115, socialTax = 0.0635): number {
  return Math.round(brutto * (1 + employerPension + socialTax));
}

export const COLLECTIVE_AGREEMENTS: { key: CollectiveAgreement; nameIs: string; nameEn: string }[] = [
  { key: "efling_sa", nameIs: "Efling / SA — Veitingastaðir", nameEn: "Efling / SA — Restaurants" },
  { key: "custom", nameIs: "Sérstakur samningur", nameEn: "Custom agreement" },
];
