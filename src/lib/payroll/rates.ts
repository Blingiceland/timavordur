// Rate resolution: (employment terms in force, agreement version in force) on a
// date → the hourly rates that apply. Contract minimum and personal pay are kept
// apart so the UI and exports can show both.

import { AGREEMENT_VERSIONS, versionForDate, type AgreementVersion, type Step, type WageClass } from "./agreements";
import { divRoundHalfUp, fractionOfMonthly, hourlyFromMonthly, krToCents, withPremium } from "./money";
import type { Issue } from "./issues";
import { stepOnDate, termsForDate, type EmploymentTerms } from "./terms";

export interface ResolvedRates {
  date: string;
  terms: EmploymentTerms;
  version: AgreementVersion;
  wageClass: WageClass;
  step: Step;
  stepBasis: string;
  /** Contract minimum monthly wage incl. management premium (kr). */
  minimumMonthly: number;
  minimumDayCents: number;
  /** Rate basis actually used. */
  basis: "minimum" | "personal";
  dayCents: number;
  overtimeCents: number;
  premiumCents: (pct: number) => number;
  issues: Issue[];
}

export type RateResolution =
  | { ok: true; rates: ResolvedRates }
  | { ok: false; issues: Issue[]; terms: EmploymentTerms | null };

export function resolveRates(
  termsHistory: EmploymentTerms[],
  date: string,
  versions: AgreementVersion[] = AGREEMENT_VERSIONS
): RateResolution {
  const terms = termsForDate(termsHistory, date);
  if (!terms) return { ok: false, terms: null, issues: [{ code: "missing_terms", severity: "blocker", date }] };

  const issues: Issue[] = [];
  if (terms.status === "needs_review") issues.push({ code: "terms_needs_review", severity: "blocker", date });
  if (terms.agreementId !== "efling_sa_hotel") {
    return { ok: false, terms, issues: [...issues, { code: "unsupported_agreement", severity: "blocker", date }] };
  }
  if (!terms.wageClass) {
    return { ok: false, terms, issues: [...issues, { code: "missing_wage_class", severity: "blocker", date }] };
  }
  if (!terms.workingArrangement) issues.push({ code: "missing_working_arrangement", severity: "blocker", date });

  const lookup = versionForDate(date, versions, terms.agreementId);
  if (!lookup.ok) return { ok: false, terms, issues: [...issues, { code: "no_rate_version", severity: "blocker", date }] };
  const version = lookup.version;
  if (version.status !== "verified") issues.push({ code: "unverified_rate_version", severity: "blocker", date, detail: version.version });

  const stepRes = stepOnDate(terms, date);
  issues.push(...stepRes.issues);

  const tableMonthly = version.monthly[terms.wageClass][stepRes.step];
  const minimumMonthly = terms.managementRole
    ? divRoundHalfUp(tableMonthly * (100 + version.rules.managementPct), 100)
    : tableMonthly;
  const minimumDayCents = hourlyFromMonthly(minimumMonthly, version.rules.dayDivisor);
  const minimumOtCents = fractionOfMonthly(minimumMonthly, version.rules.overtimePerMillion, 1_000_000);

  let basis: "minimum" | "personal" = "minimum";
  let dayCents = minimumDayCents;
  let overtimeCents = minimumOtCents;

  // Personal agreed pay, expressed as a full-time day rate.
  let personalDayCents: number | null = null;
  if (terms.payType === "monthly" && terms.monthlySalary && terms.employmentPercentage) {
    const fteMonthlyCents = divRoundHalfUp(krToCents(terms.monthlySalary) * 100, terms.employmentPercentage);
    personalDayCents = divRoundHalfUp(fteMonthlyCents, version.rules.dayDivisor);
  } else if (terms.personalDayRate) {
    personalDayCents = krToCents(terms.personalDayRate);
  }
  if (personalDayCents !== null) {
    if (personalDayCents >= minimumDayCents) {
      basis = "personal";
      dayCents = personalDayCents;
      // Overtime is 1,0385% of the monthly wage; the personal monthly equivalent is day rate × 172.
      overtimeCents = Math.max(
        minimumOtCents,
        divRoundHalfUp(personalDayCents * version.rules.dayDivisor * version.rules.overtimePerMillion, 1_000_000)
      );
    } else {
      issues.push({ code: "personal_below_minimum", severity: "blocker", date });
    }
  }

  return {
    ok: true,
    rates: {
      date,
      terms,
      version,
      wageClass: terms.wageClass,
      step: stepRes.step,
      stepBasis: stepRes.basis,
      minimumMonthly,
      minimumDayCents,
      basis,
      dayCents,
      overtimeCents,
      premiumCents: (pct: number) => withPremium(dayCents, pct),
      issues,
    },
  };
}
