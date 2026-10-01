// Employer payroll cost for a calculated period. The result is named
// "launakostnaður (skilgreindir liðir)" — it lists exactly which items are
// included and which are NOT, instead of claiming a complete total cost.

import { percentOf } from "./money";

export interface CostRates {
  year: number;
  status: "verified" | "unverified";
  /** basis points */
  employerPensionBp: number; // mótframlag í lífeyrissjóð
  sjukrasjodurBp: number;
  orlofsheimilasjodurBp: number;
  starfsmenntasjodurBp: number;
  virkBp: number; // starfsendurhæfingarsjóður
  tryggingagjaldBp: number;
  sources: string[];
  notes: string[];
}

const COST_2026: CostRates = {
  year: 2026,
  status: "verified",
  employerPensionBp: 1150,
  sjukrasjodurBp: 100,
  orlofsheimilasjodurBp: 25,
  starfsmenntasjodurBp: 30,
  virkBp: 10,
  tryggingagjaldBp: 635,
  sources: [
    "Tryggingagjald 6,35% 2026 — https://www.skatturinn.is/atvinnurekstur/skattar-og-gjold/tryggingagjald (skoðað 2026-09-30)",
    "Stofn tryggingagjalds nær til mótframlags í lífeyrissjóð — https://www.skatturinn.is/atvinnurekstur/framtal-og-alagning/launamidar-og-launaframtal/",
    "Lífeyrir 11,5%, sjúkrasjóður 1%, orlofsheimilasjóður 0,25%, starfsmenntasjóður 0,3% — kjarasamningur SA/Eflingar 11. kafli",
  ],
  notes: ["Virk 0,10% (lög 60/2012) ekki borið saman við birta heimild í þessari lotu."],
};

const COST_2027: CostRates = {
  ...COST_2026,
  year: 2027,
  status: "unverified",
  sources: [...COST_2026.sources],
  notes: ["Tryggingagjald 2027 ekki birt við skoðun — 2026-hlutfall notað sem forsenda.", ...COST_2026.notes],
};

export const COST_RATES: CostRates[] = [COST_2026, COST_2027];

export function costRatesForYear(year: number): CostRates | null {
  return COST_RATES.find((c) => c.year === year) ?? null;
}

export interface CostInputLine {
  date: string;
  amountCents: number;
  /** Orlof is paid on top of this line (hourly pay, and non-salary lines of monthly staff). */
  orlofEligible: boolean;
  orlofBp: number;
}

export interface EmployerCost {
  grossCents: number;
  orlofCents: number;
  wageBaseCents: number; // gross + orlof
  employerPensionCents: number;
  unionFundsCents: number;
  tryggingagjaldBaseCents: number; // wage base + employer pension
  tryggingagjaldCents: number;
  totalCents: number;
  rateStatus: "verified" | "unverified";
  included: string[];
  excluded: string[];
}

export const COST_EXCLUDED = [
  "Desemberuppbót og orlofsuppbót (gr. 1.4) — greiddar sérstaklega",
  "Vetrarfrí vaktavinnufólks (gr. 3.4)",
  "Veikindaréttur og útkall (gr. 1.8, 9. kafli)",
  "Frítökuréttur vegna skertrar hvíldar (gr. 2.4)",
  "Viðbótarlífeyrissparnaður (2%) og aðrir persónulegir liðir",
];

export function employerCost(lines: CostInputLine[], year: number): EmployerCost {
  const rates = costRatesForYear(year) ?? { ...COST_2027, year, status: "unverified" as const };
  const grossCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const orlofCents = lines.reduce((s, l) => s + (l.orlofEligible && l.amountCents > 0 ? percentOf(l.amountCents, l.orlofBp) : 0), 0);
  const wageBaseCents = grossCents + orlofCents;
  const nonNeg = Math.max(0, wageBaseCents);
  const employerPensionCents = percentOf(nonNeg, rates.employerPensionBp);
  const unionFundsCents =
    percentOf(nonNeg, rates.sjukrasjodurBp) +
    percentOf(nonNeg, rates.orlofsheimilasjodurBp) +
    percentOf(nonNeg, rates.starfsmenntasjodurBp) +
    percentOf(nonNeg, rates.virkBp);
  const tryggingagjaldBaseCents = nonNeg + employerPensionCents;
  const tryggingagjaldCents = percentOf(tryggingagjaldBaseCents, rates.tryggingagjaldBp);
  return {
    grossCents,
    orlofCents,
    wageBaseCents,
    employerPensionCents,
    unionFundsCents,
    tryggingagjaldBaseCents,
    tryggingagjaldCents,
    totalCents: wageBaseCents + employerPensionCents + unionFundsCents + tryggingagjaldCents,
    rateStatus: rates.status,
    included: [
      "Laun samkvæmt útreikningi",
      "Orlofslaun (ekki á föst mánaðarlaun — mánaðarlaunafólk fær greitt orlof)",
      "Mótframlag í lífeyrissjóð",
      "Sjúkra-, orlofsheimila-, starfsmennta- og starfsendurhæfingarsjóðir",
      "Tryggingagjald af launum, orlofi og mótframlagi",
    ],
    excluded: COST_EXCLUDED,
  };
}
