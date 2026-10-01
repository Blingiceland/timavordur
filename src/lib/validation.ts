// Input validation/sanitisation for API request bodies. Dependency-free.
// Every check returns a boolean or a cleaned value; routes turn failures into 400s.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // HH:MM (00:00–23:59)
export const KENNITALA_RE = /^\d{6}-?\d{4}$/;
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
export const PIN_RE = /^\d{4}$/;
export const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function cleanStr(val: unknown, maxLen = 200): string {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
}

/** A real calendar date in YYYY-MM-DD form between 1900 and 2100 (rejects 2026-02-30). */
export function isDate(val: unknown): val is string {
  if (typeof val !== "string" || !DATE_RE.test(val)) return false;
  const [y, m, d] = val.split("-").map(Number);
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isTime(val: unknown): val is string {
  return typeof val === "string" && TIME_RE.test(val);
}

export function isDaysOfWeek(val: unknown): val is number[] {
  return (
    Array.isArray(val) &&
    val.length > 0 &&
    val.length <= 7 &&
    new Set(val).size === val.length &&
    val.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  );
}

export function isUsername(val: unknown): val is string {
  return typeof val === "string" && USERNAME_RE.test(val);
}

export function isPin(val: unknown): val is string {
  return typeof val === "string" && PIN_RE.test(val);
}

export function isOptionalKennitala(val: unknown): boolean {
  if (val === undefined || val === null || val === "") return true;
  return typeof val === "string" && KENNITALA_RE.test(val.trim());
}

export function isEnum<T extends string>(val: unknown, allowed: readonly T[]): val is T {
  return typeof val === "string" && (allowed as readonly string[]).includes(val);
}

/** Finite number within [min, max]. */
export function isNumberIn(val: unknown, min: number, max: number): val is number {
  return typeof val === "number" && Number.isFinite(val) && val >= min && val <= max;
}

/** Money in kr with at most two decimals, within [0, max]. */
export function isKr(val: unknown, max = 10_000_000): val is number {
  return isNumberIn(val, 0, max) && Math.abs(Math.round(val * 100) - val * 100) < 1e-6;
}

export function isDocId(val: unknown): val is string {
  return typeof val === "string" && DOC_ID_RE.test(val);
}

export function isIdempotencyKey(val: unknown): val is string {
  return typeof val === "string" && IDEMPOTENCY_RE.test(val);
}

/** Inclusive number of days from `from` to `to` (both valid dates); negative if reversed. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Validate a date range with a maximum span. */
export function isDateRange(from: unknown, to: unknown, maxDays: number): boolean {
  if (!isDate(from) || !isDate(to)) return false;
  const d = daysBetween(from, to);
  return d >= 0 && d <= maxDays;
}

/** Reject any key outside the allow-list. Returns the offending keys. */
export function unknownKeys(obj: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(obj).filter((k) => !allowed.includes(k));
}

/** Safely parse a JSON body; null on malformed input or a non-object. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
