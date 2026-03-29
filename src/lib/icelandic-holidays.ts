// Icelandic public holidays calculator — Efling/SA wage rules
// Three types:
//   "storhatid"      — ×1.90 all day
//   "helgarfridagur" — ×1.45 all day (like weekend)
//   "half-storhatid" — regular rate until storhatidFromHour, then ×1.90

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getFirstMondayOfAugust(year: number): Date {
  const d = new Date(Date.UTC(year, 7, 1));
  const dow = d.getUTCDay();
  const daysUntilMonday = dow === 1 ? 0 : (8 - dow) % 7;
  return new Date(Date.UTC(year, 7, 1 + daysUntilMonday));
}

export type HolidayType = "storhatid" | "helgarfridagur" | "half-storhatid";

export interface HolidayInfo {
  date: string;           // YYYY-MM-DD
  nameIs: string;
  nameEn: string;
  type: HolidayType;
  storhatidFromHour?: number; // Only for "half-storhatid" — hour (UTC+0 base) when ×1.90 kicks in
}

export function getIcelandicHolidays(year: number): HolidayInfo[] {
  const easter = getEasterDate(year);
  return [
    // ── Half stórhátíðir (regular rate until storhatidFromHour, then ×1.90) ──
    // Note: Aðfangadagur and Gamlársdagur are NOT public holidays — only special after 16:00
    // We store hour 16 in UTC+0; callers should convert if needed (Iceland = UTC/UTC+0 in winter)
    { date: `${year}-12-24`, nameIs: "Aðfangadagur", nameEn: "Christmas Eve", type: "half-storhatid", storhatidFromHour: 16 },
    { date: `${year}-12-31`, nameIs: "Gamlársdagur", nameEn: "New Year's Eve", type: "half-storhatid", storhatidFromHour: 16 },

    // ── Stórhátíðir (×1.90 allur dagurinn) ───────────────────────────────────
    { date: toDateStr(addDays(easter, -2)), nameIs: "Föstudagurinn langi", nameEn: "Good Friday", type: "storhatid" },
    { date: toDateStr(easter),             nameIs: "Páskadagur",           nameEn: "Easter Sunday", type: "storhatid" },
    { date: toDateStr(addDays(easter, 49)),nameIs: "Hvítasunnudagur",      nameEn: "Whit Sunday", type: "storhatid" },
    { date: `${year}-05-01`,               nameIs: "Verkalýðsdagurinn",    nameEn: "Labour Day", type: "storhatid" },
    { date: `${year}-06-17`,               nameIs: "Þjóðhátíðardagurinn",  nameEn: "National Day", type: "storhatid" },
    { date: `${year}-12-25`,               nameIs: "Jóladagur",            nameEn: "Christmas Day", type: "storhatid" },

    // ── Helgarfrídagar (×1.45 — eins og helgar) ───────────────────────────────
    { date: `${year}-01-01`,               nameIs: "Nýársdagur",           nameEn: "New Year's Day", type: "helgarfridagur" },
    { date: toDateStr(addDays(easter, -3)),nameIs: "Skírdagur",            nameEn: "Maundy Thursday", type: "helgarfridagur" },
    { date: toDateStr(addDays(easter, 1)), nameIs: "Annar í páskum",       nameEn: "Easter Monday", type: "helgarfridagur" },
    { date: toDateStr(addDays(easter, 39)),nameIs: "Uppstigningardagur",   nameEn: "Ascension Day", type: "helgarfridagur" },
    { date: toDateStr(addDays(easter, 50)),nameIs: "Annar í hvítasunnu",   nameEn: "Whit Monday", type: "helgarfridagur" },
    { date: toDateStr(getFirstMondayOfAugust(year)), nameIs: "Frídagur verslunarmanna", nameEn: "Commerce Day", type: "helgarfridagur" },
    { date: `${year}-12-26`,               nameIs: "Annar í jólum",        nameEn: "Boxing Day", type: "helgarfridagur" },
  ];
}

// Returns a Map<dateStr, HolidayInfo> for fast lookups
export function getHolidayMap(year: number): Map<string, HolidayInfo> {
  const map = new Map<string, HolidayInfo>();
  getIcelandicHolidays(year).forEach(h => map.set(h.date, h));
  return map;
}

// Returns just the Set of all holiday date strings (for quick membership test)
export function getHolidaySet(year: number): Set<string> {
  return new Set(getIcelandicHolidays(year).map(h => h.date));
}

export function getHolidayName(dateStr: string, lang: "is" | "en" = "is"): string | null {
  const year = parseInt(dateStr.slice(0, 4));
  const h = getIcelandicHolidays(year).find(x => x.date === dateStr);
  return h ? (lang === "is" ? h.nameIs : h.nameEn) : null;
}
