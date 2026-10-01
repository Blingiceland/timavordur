// Integer money arithmetic. All amounts are held in aurar (1 kr = 100 aurar) as
// safe integers so that published table rounding (two decimals, half-up) is
// reproduced exactly instead of drifting with binary floating point.

/** Integer division n / d rounded half-up (n >= 0, d > 0, both safe integers). */
export function divRoundHalfUp(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 0 || n < 0) {
    throw new RangeError(`divRoundHalfUp: invalid operands ${n}/${d}`);
  }
  const q = Math.floor(n / d);
  const r = n - q * d;
  return 2 * r >= d ? q + 1 : q;
}

/** Whole krónur → aurar. */
export const krToCents = (kr: number): number => Math.round(kr * 100);

/** Aurar → krónur (number with at most two decimals). */
export const centsToKr = (cents: number): number => cents / 100;

/** Hourly day rate in aurar from a monthly wage in whole kr and a divisor (e.g. 172). */
export function hourlyFromMonthly(monthlyKr: number, divisor: number): number {
  return divRoundHalfUp(monthlyKr * 100, divisor);
}

/** Rate with a whole-percent premium on top, e.g. pct = 33 → ×1,33. */
export function withPremium(rateCents: number, pct: number): number {
  return divRoundHalfUp(rateCents * (100 + pct), 100);
}

/** Overtime hourly rate in aurar as a fraction of monthly wage expressed in basis-of-10 000 (1,0385% → 10385 / 1 000 000). */
export function fractionOfMonthly(monthlyKr: number, numerator: number, denominator: number): number {
  return divRoundHalfUp(monthlyKr * 100 * numerator, denominator);
}

/** Amount in aurar for a duration in milliseconds at an hourly rate in aurar. */
export function amountForDuration(rateCents: number, ms: number): number {
  return divRoundHalfUp(rateCents * ms, 3_600_000);
}

/** Percentage of an amount in aurar, rate given in basis points (10,17% → 1017). */
export function percentOf(cents: number, basisPoints: number): number {
  return divRoundHalfUp(cents * basisPoints, 10_000);
}

/** Format aurar as Icelandic krónur, e.g. 280187 → "2.801,87". */
export function formatKr(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const kr = Math.floor(abs / 100);
  const aur = String(abs % 100).padStart(2, "0");
  const grouped = String(kr).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${grouped},${aur}`;
}
