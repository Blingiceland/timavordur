// Calculation issues. A "blocker" means the number is not a valid final payroll
// figure (period cannot be locked); a "warning" is shown but does not block.

export type IssueCode =
  | "missing_terms"
  | "terms_needs_review"
  | "missing_wage_class"
  | "missing_working_arrangement"
  | "missing_employment_percentage"
  | "missing_employer_start_date"
  | "missing_birth_date"
  | "no_rate_version"
  | "unverified_rate_version"
  | "unverified_cost_rates"
  | "personal_below_minimum"
  | "override_below_entitlement"
  | "unsupported_agreement"
  | "custom_missing_pay"
  | "custom_missing_rates"
  | "unsupported_pay_type"
  | "monthly_missing_salary"
  | "monthly_partial_period"
  | "day_arrangement_storhatid"
  | "punch_missing_out"
  | "punch_orphan_out"
  | "punch_stale_open"
  | "punch_shift_too_long"
  | "punch_open_estimate"
  | "short_rest"
  | "long_day_arrangement";

export interface Issue {
  code: IssueCode;
  severity: "blocker" | "warning";
  /** Optional date or punch reference the issue is about. */
  date?: string;
  punchIds?: string[];
  detail?: string;
}

export const ISSUE_TEXT: Record<IssueCode, { is: string; en: string }> = {
  missing_terms: { is: "Engin ráðningarkjör skráð fyrir dagsetninguna", en: "No employment terms recorded for the date" },
  terms_needs_review: { is: "Ráðningarkjör bíða yfirferðar (flutt úr eldra kerfi)", en: "Employment terms await review (migrated)" },
  missing_wage_class: { is: "Launaflokk vantar", en: "Wage class missing" },
  missing_working_arrangement: { is: "Vinnufyrirkomulag vantar (vakta-, tilfallandi eða dagvinna)", en: "Working arrangement missing" },
  missing_employment_percentage: { is: "Starfshlutfall vantar", en: "Employment percentage missing" },
  missing_employer_start_date: { is: "Upphafsdag ráðningar vantar — ekki hægt að ákvarða þrep/orlof", en: "Employment start date missing — step/holiday rate unknown" },
  missing_birth_date: { is: "Fæðingardag vantar — 22 ára regla og orlofsréttur óviss", en: "Birth date missing — age-22 rule and holiday rate uncertain" },
  no_rate_version: { is: "Enginn taxti gildir á dagsetningunni", en: "No wage table covers the date" },
  unverified_rate_version: { is: "Taxti er óstaðfest drög — áætlun, ekki uppgjör", en: "Wage table is an unverified draft — estimate only" },
  unverified_cost_rates: { is: "Hlutföll launatengdra gjalda ekki staðfest fyrir árið", en: "Payroll cost rates not verified for the year" },
  personal_below_minimum: { is: "Persónulegur taxti undir samningslágmarki — lágmark notað", en: "Personal rate below agreement minimum — minimum used" },
  override_below_entitlement: { is: "Handvirkt þrep lægra en réttindi — hunsað", en: "Manual step below entitlement — ignored" },
  unsupported_agreement: { is: "Kjarasamningur ekki studdur í launavél", en: "Agreement not supported by the engine" },
  custom_missing_pay: { is: "Sérkjör: persónulegan taxta eða mánaðarlaun vantar", en: "Custom terms: personal rate or monthly salary missing" },
  custom_missing_rates: { is: "Sérkjör: álagsprósentur vantar", en: "Custom terms: premium percentages missing" },
  unsupported_pay_type: { is: "Launategund ekki útfærð (averaged)", en: "Pay type not implemented (averaged)" },
  monthly_missing_salary: { is: "Mánaðarlaun vantar", en: "Monthly salary missing" },
  monthly_partial_period: { is: "Mánaðarlaun hluta tímabils — hlutfallsreglu þarf að staðfesta", en: "Partial-period monthly salary — proration rule needs confirmation" },
  day_arrangement_storhatid: { is: "Stórhátíðarvinna dagvinnufólks (gr. 1.7.2/1.7.3) ekki reiknuð sjálfvirkt", en: "Public-holiday work for day staff (1.7.2/1.7.3) not auto-calculated" },
  punch_missing_out: { is: "Útstimplun vantar", en: "Missing punch-out" },
  punch_orphan_out: { is: "Útstimplun án innstimplunar", en: "Punch-out without punch-in" },
  punch_stale_open: { is: "Opin vakt of lengi — ekki reiknuð", en: "Shift left open too long — not counted" },
  punch_shift_too_long: { is: "Vakt lengri en 16 klst.", en: "Shift longer than 16 hours" },
  punch_open_estimate: { is: "Vakt í gangi — áætlun til þessa", en: "Shift in progress — estimate so far" },
  short_rest: { is: "Hvíld undir 11 klst. (gr. 2.4) — frítökuréttur ekki reiknaður", en: "Rest under 11 h (2.4) — time-off right not calculated" },
  long_day_arrangement: { is: "Dagvinna yfir 8 klst. á dag — dagleg yfirvinnuregla ekki útfærð", en: "Day work over 8 h — daily overtime rule not implemented" },
};
