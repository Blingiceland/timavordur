// Pure helpers for company self-onboarding (shared by client and server).

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Paths that are app routes or could be confused with them. */
export const RESERVED_SLUGS = new Set([
  "api", "admin", "superadmin", "byrja", "hafa-samband", "contact", "demo", "skilmalar", "vinnslusamningur", "personuvernd",
  "www", "app", "static", "_next", "login", "innskraning", "signup", "skraning", "timavordur", "timon",
  "help", "hjalp", "about", "um", "verd", "pricing", "favicon.ico", "robots.txt", "sitemap.xml",
]);

const MAP: Record<string, string> = {
  þ: "th", æ: "ae", ð: "d", ö: "o", á: "a", é: "e", í: "i", ó: "o", ú: "u", ý: "y",
  ä: "a", ü: "u", ø: "o", å: "a",
};

/** "Kaffi Þórs & Co." → "kaffi-thors-co" */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .split("")
    .map((c) => MAP[c] ?? c)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s;
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length >= 2 && !RESERVED_SLUGS.has(slug);
}

/** Digits only, or null. */
export function normaliseKennitala(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = v.replace(/[\s-]/g, "");
  return /^\d{10}$/.test(d) ? d : null;
}

/**
 * Icelandic kennitala with a valid check digit (mod 11, weights 3 2 7 6 5 4 3 2)
 * and century digit 8, 9 or 0. Companies have day + 40 (41–71).
 */
export function isKennitala(v: unknown): boolean {
  const k = normaliseKennitala(v);
  if (!k) return false;
  const d = k.split("").map(Number);
  const w = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = w.reduce((s, x, i) => s + x * d[i], 0);
  const r = sum % 11;
  const check = r === 0 ? 0 : 11 - r;
  if (check === 10 || check !== d[8]) return false;
  if (![0, 8, 9].includes(d[9])) return false;
  const day = d[0] * 10 + d[1];
  const month = d[2] * 10 + d[3];
  const realDay = day > 40 ? day - 40 : day;
  return realDay >= 1 && realDay <= 31 && month >= 1 && month <= 12;
}

export function isCompanyKennitala(v: unknown): boolean {
  const k = normaliseKennitala(v);
  return !!k && isKennitala(k) && Number(k.slice(0, 2)) > 40;
}
