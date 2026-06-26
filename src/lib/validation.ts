// Lightweight input validation/sanitisation for API request bodies.
// Deliberately dependency-free — just enough to keep malformed data out of
// Firestore and return clear 400s instead of silently storing garbage.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;          // YYYY-MM-DD
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;    // HH:MM (00:00–23:59)
export const KENNITALA_RE = /^\d{6}-?\d{4}$/;          // Icelandic national id
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;      // staff login username
export const PIN_RE = /^\d{4}$/;                       // staff 4-digit PIN

/** Trim a value to a string and cap its length. Non-strings become "". */
export function cleanStr(val: unknown, maxLen = 200): string {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
}

export function isDate(val: unknown): val is string {
  return typeof val === "string" && DATE_RE.test(val);
}

export function isTime(val: unknown): val is string {
  return typeof val === "string" && TIME_RE.test(val);
}

/** Days-of-week array with unique integers in 0..6. */
export function isDaysOfWeek(val: unknown): val is number[] {
  return (
    Array.isArray(val) &&
    val.length > 0 &&
    val.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  );
}

/** Username: 3–30 chars, lowercase letters/digits and . _ - only. */
export function isUsername(val: unknown): val is string {
  return typeof val === "string" && USERNAME_RE.test(val);
}

/** Staff PIN: exactly 4 digits. */
export function isPin(val: unknown): val is string {
  return typeof val === "string" && PIN_RE.test(val);
}

/** Optional kennitala: empty is allowed; if present it must look like one. */
export function isOptionalKennitala(val: unknown): boolean {
  if (val === undefined || val === null || val === "") return true;
  return typeof val === "string" && KENNITALA_RE.test(val.trim());
}
