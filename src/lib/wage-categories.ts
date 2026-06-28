// Wage categories (launaflokkar) for the Efling/SA hotel & restaurant agreement.
//
// These are a STARTING TEMPLATE — the actual day rates are editable per company in
// the admin settings (rates rise annually and the official table is authoritative).
// Hourly day rate ≈ monthly wage ÷ 173.33. Figures below derive from the published
// 2026-01-01 wage table and SHOULD BE VERIFIED against the current agreement.

export interface WageCategory {
  id: string;
  name: string;
  description: string;
  dayRate: number; // dagvinnutaxti, kr/klst
}

export const DEFAULT_WAGE_CATEGORIES: WageCategory[] = [
  { id: "fl6-0", name: "Flokkur 6 — byrjandi", description: "Almennt veitinga-/hótelfólk, fyrstu 3 mánuðir", dayRate: 2764 },
  { id: "fl6-1", name: "Flokkur 6 — eftir 1 ár", description: "Almennt veitingafólk, 1 árs starfsreynsla", dayRate: 2791 },
  { id: "fl6-3", name: "Flokkur 6 — eftir 3 ár", description: "Almennt veitingafólk, 3 ára starfsreynsla", dayRate: 2833 },
  { id: "fl6-5", name: "Flokkur 6 — eftir 5 ár", description: "Almennt veitingafólk, 5 ára starfsreynsla", dayRate: 2890 },
  { id: "fl7-0", name: "Flokkur 7 — sérhæfður", description: "Sérhæft starfsfólk / hótelstarfsfólk eftir reynslutíma", dayRate: 2780 },
  { id: "fl7-5", name: "Flokkur 7 — eftir 5 ár", description: "Sérhæft starfsfólk, 5 ára starfsreynsla", dayRate: 2907 },
];

export const findWageCategory = (cats: WageCategory[] | undefined, id: string | undefined) =>
  (cats || []).find(c => c.id === id);
