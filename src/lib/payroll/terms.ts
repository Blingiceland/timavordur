// Dated employment terms (ráðningarkjör) — the payroll-relevant facts about an
// employee, separate from their application role. Records are immutable: a
// change is a NEW record with its own effectiveFrom; the latest recorded record
// with effectiveFrom <= date wins. History is therefore never rewritten.

import type { AgreementId, Step, WageClass } from "./agreements";
import type { Issue } from "./issues";

export type WorkingArrangement = "shift" | "casual" | "day";
export type PayType = "hourly" | "monthly" | "averaged";

export interface FixedAddition {
  label: string;
  monthlyAmount: number; // kr per month
}

export interface EmploymentTerms {
  id: string;
  uid: string;
  effectiveFrom: string; // YYYY-MM-DD (00:00 UTC)
  recordedAt: string; // ISO server time
  recordedBy: string;
  reason: string;
  status: "active" | "needs_review" | "void";
  agreementId: AgreementId | "custom";
  workingArrangement: WorkingArrangement | null;
  payType: PayType;
  employmentPercentage: number | null; // 1–100
  wageClass: WageClass | null;
  /** gr. 1.2.4 — ráðinn til stjórnunarstarfa skv. skriflegum ráðningarsamningi (ekki app-hlutverk). */
  managementRole: boolean;
  birthDate: string | null;
  employerStartDate: string | null;
  /** Staðfest fyrri starfsreynsla í starfsgrein, mánuðir (gr. 1.5). */
  priorIndustryMonths: number | null;
  experienceVerifiedOn: string | null;
  stepOverride: { step: Step; reason: string } | null;
  /** Persónulegur umsaminn dagvinnutaxti, kr/klst (yfirborgun). */
  personalDayRate: number | null;
  /** Umsamin mánaðarlaun fyrir starfshlutfallið (payType = monthly). */
  monthlySalary: number | null;
  fixedAdditions: FixedAddition[];
  /** Persónulegt orlofshlutfall ef betra en samningur (punktar, 1017 = 10,17%). */
  orlofOverrideBp: number | null;
  /** Varðveitt eldri gildi úr migration — aldrei notuð í útreikning. */
  legacy?: Record<string, unknown> | null;
}

/** Terms in force on a date: latest effectiveFrom <= date; ties → latest recordedAt. Void records never apply. */
export function termsForDate(records: EmploymentTerms[], date: string): EmploymentTerms | null {
  let best: EmploymentTerms | null = null;
  for (const r of records) {
    if (r.status === "void" || r.effectiveFrom > date) continue;
    if (
      !best ||
      r.effectiveFrom > best.effectiveFrom ||
      (r.effectiveFrom === best.effectiveFrom && r.recordedAt > best.recordedAt)
    ) {
      best = r;
    }
  }
  return best;
}

// ── Date helpers (calendar arithmetic on YYYY-MM-DD, UTC) ─────────────────────
const parts = (d: string) => d.split("-").map(Number) as [number, number, number];

/** Whole months elapsed from `from` to `to` (anniversary-based). */
export function fullMonthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return Math.max(0, months);
}

export function ageOn(birthDate: string, date: string): number {
  return Math.floor(fullMonthsBetween(birthDate, date) / 12);
}

/** First day of the month after `d`. */
export function firstOfNextMonth(d: string): string {
  const [y, m] = parts(d);
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

const STEP_RANK: Record<Step, number> = { start: 0, y1: 1, y3: 2, y5: 3 };

export interface StepResult {
  step: Step;
  basis: string;
  issues: Issue[];
}

/**
 * Seniority step on a date (gr. 1.5, 1.2.3):
 *  - 1 / 3 ár: starfsreynsla í starfsgrein (staðfest fyrri reynsla gildir frá næstu
 *    mánaðamótum eftir staðfestingu + tími hjá núverandi atvinnurekanda);
 *  - 22 ára aldur jafngildir eins árs starfi;
 *  - 5 ár: hjá sama atvinnurekanda.
 * A manual override may only RAISE the step.
 */
export function stepOnDate(t: EmploymentTerms, date: string): StepResult {
  const issues: Issue[] = [];
  if (!t.employerStartDate) {
    issues.push({ code: "missing_employer_start_date", severity: "blocker", date });
  }
  const companyMonths = t.employerStartDate ? fullMonthsBetween(t.employerStartDate, date) : 0;
  let priorMonths = 0;
  if (t.priorIndustryMonths && t.priorIndustryMonths > 0 && t.experienceVerifiedOn) {
    if (date >= firstOfNextMonth(t.experienceVerifiedOn)) priorMonths = t.priorIndustryMonths;
  }
  let industryMonths = priorMonths + companyMonths;
  const reasons: string[] = [];
  if (industryMonths < 12) {
    if (!t.birthDate) {
      // The age-22 rule could lift this employee to the 1-year step.
      issues.push({ code: "missing_birth_date", severity: "blocker", date });
    } else if (ageOn(t.birthDate, date) >= 22) {
      industryMonths = 12;
      reasons.push("22 ára regla");
    }
  }

  let step: Step = "start";
  if (companyMonths >= 60) step = "y5";
  else if (industryMonths >= 36) step = "y3";
  else if (industryMonths >= 12) step = "y1";
  reasons.unshift(`starfsgrein ${industryMonths} mán., fyrirtæki ${companyMonths} mán.`);

  if (t.stepOverride) {
    if (STEP_RANK[t.stepOverride.step] >= STEP_RANK[step]) {
      step = t.stepOverride.step;
      reasons.push(`handvirkt: ${t.stepOverride.reason}`);
    } else {
      issues.push({ code: "override_below_entitlement", severity: "warning", date });
    }
  }
  return { step, basis: reasons.join("; "), issues };
}

/**
 * Orlofslaun in basis points (gr. 6.1). The rate for work done on `date` follows
 * the entitlement at the start of the holiday-accrual year (1 May) containing it:
 * a threshold reached during the year applies from the next 1 May.
 *   10,17% grunnur · 10,64% ef 22 ára og 6 mán. hjá fyrirtæki
 *   12,07% eftir 5 ár hjá fyrirtæki · 13,04% eftir 10 ár.
 */
export function orlofBasisPoints(t: EmploymentTerms, date: string): { bp: number; issues: Issue[] } {
  const [y, m] = parts(date);
  const yearStart = `${m >= 5 ? y : y - 1}-05-01`;
  const issues: Issue[] = [];
  let bp = 1017;
  if (!t.employerStartDate) {
    issues.push({ code: "missing_employer_start_date", severity: "blocker", date });
  } else {
    const months = fullMonthsBetween(t.employerStartDate, yearStart);
    if (months >= 120) bp = 1304;
    else if (months >= 60) bp = 1207;
    else if (months >= 6) {
      if (!t.birthDate) issues.push({ code: "missing_birth_date", severity: "blocker", date });
      else if (ageOn(t.birthDate, yearStart) >= 22) bp = 1064;
    }
  }
  if (t.orlofOverrideBp && t.orlofOverrideBp > bp) bp = t.orlofOverrideBp;
  return { bp, issues };
}
