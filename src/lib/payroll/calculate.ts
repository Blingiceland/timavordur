// Period calculation for one employee — the single entry point every screen,
// export and snapshot uses. Pure: all data (punches or planned shifts, terms,
// clock) is passed in, so results are reproducible and testable.

import { AGREEMENT_VERSIONS, versionForDate, versionBoundaries, type AgreementRules, type AgreementVersion } from "./agreements";
import { employerCost, costRatesForYear, type EmployerCost } from "./cost";
import { applyWeeklyOvertime, sliceInterval, weekStart, type BusinessType, type Slice, type SliceKind, type WorkInterval } from "./engine";
import type { Issue } from "./issues";
import { amountForDuration, divRoundHalfUp, krToCents } from "./money";
import { pairPunches, type PayPeriod, type PunchLite } from "./punches";
import { resolveRates, type RateResolution } from "./rates";
import { orlofBasisPoints, termsForDate, type EmploymentTerms } from "./terms";

export const ENGINE_VERSION = "2026.10.0";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MIN_REST_HOURS = 11;

export type LineKind = SliceKind | "salary" | "fixed_addition" | "adjustment";

export interface PayLine {
  date: string;
  start: string;
  end: string;
  durationMs: number;
  kind: LineKind;
  overtime: boolean;
  pct: number;
  rateCents: number | null;
  amountCents: number | null;
  labelIs: string;
  labelEn: string;
  holiday?: string;
  versionId: string | null;
  versionStatus: "verified" | "draft" | null;
  termsId: string | null;
  wageClass: number | null;
  step: string | null;
  basis: "minimum" | "personal" | null;
  sourceId: string;
  punchIds: string[];
  estimate: boolean;
  orlofEligible: boolean;
  orlofBp: number;
}

export interface EmployeeCalculation {
  engineVersion: string;
  mode: "actual" | "planned";
  uid: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string; // exclusive
  lines: PayLine[];
  issues: Issue[];
  totals: { durationMs: number; hours: number; grossCents: number; byLabel: Record<string, { durationMs: number; amountCents: number }> };
  cost: EmployerCost | null;
  status: "complete" | "estimate" | "blocked";
  rateVersions: string[];
  termsIds: string[];
  sourcePunchIds: string[];
}

export interface CalculationInput {
  uid: string;
  period: PayPeriod;
  terms: EmploymentTerms[];
  businessType: BusinessType;
  now: number;
  mode: "actual" | "planned";
  punches?: PunchLite[];
  planned?: WorkInterval[];
  versions?: AgreementVersion[];
  /** Approved post-lock adjustments booked into this period. */
  adjustments?: { id: string; amountCents: number; description: string; originalPeriodKey: string; orlofEligible: boolean }[];
  /** Price the intervals only (single-shift estimate): no salary, additions or rest checks. */
  intervalsOnly?: boolean;
}

function label(kind: LineKind, overtime: boolean, pct: number): { is: string; en: string } {
  if (overtime || kind === "day_overtime") return { is: "Yfirvinna", en: "Overtime" };
  switch (kind) {
    case "day": return { is: "Dagvinna", en: "Day work" };
    case "evening": return { is: `Vaktaálag ${pct}% (kvöld)`, en: `Shift premium ${pct}% (evening)` };
    case "night": return { is: `Vaktaálag ${pct}% (nótt)`, en: `Shift premium ${pct}% (night)` };
    case "weekend": return { is: `Vaktaálag ${pct}% (helgi)`, en: `Shift premium ${pct}% (weekend)` };
    case "bar_night": return { is: `Vaktaálag ${pct}% (kráarnótt)`, en: `Shift premium ${pct}% (bar night)` };
    case "helgidagur": return { is: `Helgidagaálag ${pct}%`, en: `Public holiday premium ${pct}%` };
    case "storhatid": return { is: `Stórhátíðarálag ${pct}%`, en: `Major holiday premium ${pct}%` };
    case "unsupported_storhatid": return { is: "Stórhátíðarvinna (óreiknað)", en: "Major holiday work (not calculated)" };
    case "salary": return { is: "Mánaðarlaun", en: "Monthly salary" };
    case "fixed_addition": return { is: "Föst viðbót", en: "Fixed addition" };
    case "adjustment": return { is: "Leiðrétting", en: "Adjustment" };
  }
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function dedupeIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.code}|${i.date ?? ""}|${(i.punchIds ?? []).join(",")}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function calculateEmployeePeriod(input: CalculationInput): EmployeeCalculation {
  const versions = input.versions ?? AGREEMENT_VERSIONS;
  const { period, terms } = input;
  const issues: Issue[] = [];

  // 1. Worked intervals.
  let intervals: WorkInterval[];
  if (input.mode === "actual") {
    const paired = pairPunches(input.punches ?? [], input.now);
    issues.push(...paired.issues);
    intervals = paired.shifts.map((s) => ({ sourceId: s.id, start: s.start, end: s.end, punchIds: s.punchIds, estimate: s.open }));
  } else {
    intervals = (input.planned ?? []).map((p) => ({ ...p, estimate: true }));
  }
  intervals.sort((a, b) => a.start - b.start);

  // 2. Slice (with period edges and version changes as extra cuts), from the
  //    Monday of the week containing the period start so weekly overtime is right.
  const otFrom = weekStart(period.start);
  const extra = [period.start, period.end, ...versionBoundaries(otFrom, period.end, versions)];
  const rulesAt = (ms: number): AgreementRules => {
    const v = versionForDate(ymd(ms), versions);
    return v.ok ? v.version.rules : versions[versions.length - 1].rules;
  };
  const arrangementAt = (ms: number) => termsForDate(terms, ymd(ms))?.workingArrangement ?? "shift";
  let slices: Slice[] = [];
  for (const iv of intervals) {
    if (iv.end <= otFrom || iv.start >= period.end) continue;
    const clipped = { ...iv, start: Math.max(iv.start, otFrom) };
    slices.push(...sliceInterval(clipped, arrangementAt, input.businessType, rulesAt, extra));
  }
  slices.sort((a, b) => a.start - b.start);
  const weeklyLimit = versions[0].rules.weeklyHoursBeforeOvertime;
  slices = applyWeeklyOvertime(slices, weeklyLimit).filter((s) => s.start >= period.start && s.end <= period.end);

  // 3. Price every slice with the rates in force on its own date.
  const rateCache = new Map<string, RateResolution>();
  const ratesOn = (date: string) => {
    let r = rateCache.get(date);
    if (!r) { r = resolveRates(terms, date, versions); rateCache.set(date, r); }
    return r;
  };

  const lines: PayLine[] = [];
  for (const s of slices) {
    const date = ymd(s.start);
    const res = ratesOn(date);
    const t = termsForDate(terms, date);
    const durationMs = s.end - s.start;
    const payType = t?.payType ?? "hourly";
    let rateCents: number | null = null;
    let amountCents: number | null = null;
    let kind: LineKind = s.kind;
    let pct = s.pct;

    if (res.ok) {
      issues.push(...res.rates.issues);
      const r = res.rates;
      const isOt = s.overtime || s.kind === "day_overtime";
      if (payType === "averaged") {
        issues.push({ code: "unsupported_pay_type", severity: "blocker", date });
      } else if (s.kind === "unsupported_storhatid") {
        issues.push({ code: "day_arrangement_storhatid", severity: "blocker", date });
      } else if (isOt) {
        // Overtime; for shift/casual work never pay less than the premium that would have applied.
        const premium = s.kind === "day_overtime" ? 0 : r.premiumCents(s.pct);
        rateCents = Math.max(r.overtimeCents, premium);
        amountCents = amountForDuration(rateCents, durationMs);
        kind = s.kind === "day_overtime" ? "day_overtime" : s.kind;
      } else if (payType === "monthly") {
        // Base hours are covered by the monthly salary; only the premium part is paid.
        rateCents = r.premiumCents(s.pct) - r.dayCents;
        amountCents = amountForDuration(rateCents, durationMs);
      } else {
        rateCents = s.pct === 0 ? r.dayCents : r.premiumCents(s.pct);
        amountCents = amountForDuration(rateCents, durationMs);
      }
      if (isOt) pct = 0;
    } else {
      issues.push(...res.issues);
    }

    const orlof = t ? orlofBasisPoints(t, date) : { bp: 1017, issues: [] };
    issues.push(...orlof.issues);
    const lb = label(kind, s.overtime, pct);
    lines.push({
      date,
      start: new Date(s.start).toISOString(),
      end: new Date(s.end).toISOString(),
      durationMs,
      kind,
      overtime: s.overtime || kind === "day_overtime",
      pct,
      rateCents,
      amountCents,
      labelIs: lb.is,
      labelEn: lb.en,
      holiday: s.holiday,
      versionId: res.ok ? res.rates.version.version : null,
      versionStatus: res.ok ? res.rates.version.status : null,
      termsId: t?.id ?? null,
      wageClass: res.ok ? res.rates.wageClass : t?.wageClass ?? null,
      step: res.ok ? res.rates.step : null,
      basis: res.ok ? res.rates.basis : null,
      sourceId: s.sourceId,
      punchIds: s.punchIds,
      estimate: s.estimate,
      orlofEligible: payType !== "monthly" || (rateCents ?? 0) > 0,
      orlofBp: orlof.bp,
    });
  }

  // 4. Merge adjacent pieces that are identical in every priced attribute.
  const merged: PayLine[] = [];
  for (const l of lines) {
    const prev = merged[merged.length - 1];
    if (
      prev && prev.sourceId === l.sourceId && prev.date === l.date && prev.end === l.start &&
      prev.kind === l.kind && prev.overtime === l.overtime && prev.pct === l.pct &&
      prev.rateCents === l.rateCents && prev.versionId === l.versionId && prev.termsId === l.termsId &&
      prev.step === l.step && prev.basis === l.basis && prev.estimate === l.estimate && prev.orlofBp === l.orlofBp
    ) {
      prev.end = l.end;
      prev.durationMs += l.durationMs;
      prev.amountCents = prev.rateCents === null ? null : amountForDuration(prev.rateCents, prev.durationMs);
    } else {
      merged.push({ ...l });
    }
  }

  // 5. Monthly salary and fixed additions for the period.
  const startDate = period.startDate;
  const lastDate = ymd(period.end - DAY);
  const tStart = termsForDate(terms, startDate);
  const changesInside = terms.some((t) => t.status !== "void" && t.effectiveFrom > startDate && t.effectiveFrom <= lastDate);
  const periodDays = Math.round((period.end - period.start) / DAY);
  const baseRes = ratesOn(startDate);
  const salaryLine = (kind: "salary" | "fixed_addition" | "adjustment", amountKr: number, estimate: boolean, name?: string): PayLine => {
    const lb = label(kind, false, 0);
    return {
      date: startDate, start: new Date(period.start).toISOString(), end: new Date(period.end).toISOString(),
      durationMs: 0, kind, overtime: false, pct: 0, rateCents: null, amountCents: krToCents(amountKr),
      labelIs: name ? `${lb.is}: ${name}` : lb.is, labelEn: name ? `${lb.en}: ${name}` : lb.en,
      versionId: baseRes.ok ? baseRes.rates.version.version : null,
      versionStatus: baseRes.ok ? baseRes.rates.version.status : null,
      termsId: tStart?.id ?? null, wageClass: tStart?.wageClass ?? null,
      step: baseRes.ok ? baseRes.rates.step : null, basis: baseRes.ok ? baseRes.rates.basis : null,
      sourceId: `period:${period.key}`, punchIds: [], estimate,
      orlofEligible: tStart?.payType !== "monthly", orlofBp: tStart ? orlofBasisPoints(tStart, startDate).bp : 1017,
    };
  };
  if (input.intervalsOnly) {
    // single-shift estimate: nothing period-level
  } else if (tStart && tStart.status !== "void") {
    const coveredDays = (t: EmploymentTerms | null) => {
      if (!t?.employerStartDate || t.employerStartDate <= startDate) return periodDays;
      return Math.max(0, Math.round((period.end - Date.parse(`${t.employerStartDate}T00:00:00Z`)) / DAY));
    };
    const partial = changesInside || coveredDays(tStart) < periodDays;
    if (tStart.payType === "monthly") {
      if (baseRes.ok) issues.push(...baseRes.rates.issues);
      if (!tStart.monthlySalary) {
        issues.push({ code: "monthly_missing_salary", severity: "blocker", date: startDate });
      } else if (partial) {
        issues.push({ code: "monthly_partial_period", severity: "blocker", date: startDate });
        const prorated = divRoundHalfUp(krToCents(tStart.monthlySalary) * coveredDays(tStart), periodDays) / 100;
        merged.unshift(salaryLine("salary", prorated, true));
      } else {
        merged.unshift(salaryLine("salary", tStart.monthlySalary, false));
      }
    } else if (tStart.payType === "averaged") {
      issues.push({ code: "unsupported_pay_type", severity: "blocker", date: startDate });
    }
    for (const fa of tStart.fixedAdditions ?? []) {
      if (fa.monthlyAmount > 0) merged.push(salaryLine("fixed_addition", fa.monthlyAmount, partial, fa.label));
    }
  } else if (!tStart && intervals.length === 0) {
    // No terms and no work: nothing to pay, nothing to flag.
  }

  for (const adj of input.intervalsOnly ? [] : input.adjustments ?? []) {
    const line = salaryLine("adjustment", 0, false, `${adj.description} (${adj.originalPeriodKey})`);
    line.amountCents = adj.amountCents;
    line.sourceId = `adjustment:${adj.id}`;
    line.orlofEligible = adj.orlofEligible;
    merged.push(line);
  }

  // 6. Rest between shifts (gr. 2.4) — warning only.
  const inPeriod = intervals.filter((iv) => iv.end > period.start && iv.start < period.end);
  for (let i = 1; i < (input.intervalsOnly ? 0 : inPeriod.length); i++) {
    const gap = inPeriod[i].start - inPeriod[i - 1].end;
    if (gap >= 0 && gap < MIN_REST_HOURS * HOUR) issues.push({ code: "short_rest", severity: "warning", date: ymd(inPeriod[i].start) });
  }

  // 7. Totals, cost, status.
  const byLabel: EmployeeCalculation["totals"]["byLabel"] = {};
  let grossCents = 0;
  let durationMs = 0;
  for (const l of merged) {
    grossCents += l.amountCents ?? 0;
    if (l.kind !== "salary" && l.kind !== "fixed_addition" && l.kind !== "adjustment") durationMs += l.durationMs;
    const b = (byLabel[l.labelIs] ??= { durationMs: 0, amountCents: 0 });
    b.durationMs += l.durationMs;
    b.amountCents += l.amountCents ?? 0;
  }
  const costYear = Number(lastDate.slice(0, 4));
  const cr = costRatesForYear(costYear);
  if (!cr || cr.status !== "verified") issues.push({ code: "unverified_cost_rates", severity: "warning", detail: String(costYear) });
  const cost = employerCost(
    merged.map((l) => ({ date: l.date, amountCents: l.amountCents ?? 0, orlofEligible: l.orlofEligible, orlofBp: l.orlofBp })),
    costYear
  );

  const finalIssues = dedupeIssues(issues);
  const blocked = finalIssues.some((i) => i.severity === "blocker");
  const anyEstimate = merged.some((l) => l.estimate) || input.mode === "planned";
  return {
    engineVersion: ENGINE_VERSION,
    mode: input.mode,
    uid: input.uid,
    periodKey: period.key,
    periodStart: new Date(period.start).toISOString(),
    periodEnd: new Date(period.end).toISOString(),
    lines: merged,
    issues: finalIssues,
    totals: { durationMs, hours: Math.round((durationMs / HOUR) * 100) / 100, grossCents, byLabel },
    cost,
    status: blocked ? "blocked" : anyEstimate ? "estimate" : "complete",
    rateVersions: [...new Set(merged.map((l) => l.versionId).filter((v): v is string => !!v))],
    termsIds: [...new Set(merged.map((l) => l.termsId).filter((v): v is string => !!v))],
    sourcePunchIds: [...new Set(merged.flatMap((l) => l.punchIds))],
  };
}
