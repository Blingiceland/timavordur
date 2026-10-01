// Icelandic holidays as defined by the SA/Efling hotel & restaurant agreement
// (þjónustusamningur SA og Eflingar 2024–2028):
//
//   gr. 2.3.1 / 3.2.3 — stórhátíðardagar (90% álag í vaktavinnu):
//     nýársdagur, föstudagurinn langi, páskadagur, hvítasunnudagur, 17. júní,
//     jóladagur, og aðfangadagur og gamlársdagur EFTIR KL. 12:00.
//   gr. 2.3.2 / 3.2.2 — aðrir frídagar / helgidagar (45% álag í vaktavinnu):
//     skírdagur, annar í páskum, sumardagurinn fyrsti, 1. maí, uppstigningardagur,
//     annar í hvítasunnu, fyrsti mánudagur í ágúst, annar í jólum.
//
// All times are UTC; Iceland is UTC+0 year-round (no DST).

export type HolidayType = "storhatid" | "storhatid_from_noon" | "helgidagur";

export interface HolidayInfo {
  date: string; // YYYY-MM-DD
  nameIs: string;
  nameEn: string;
  type: HolidayType;
  /** For storhatid_from_noon: the UTC hour from which the day counts as stórhátíð. */
  fromHour?: number;
}

function getEasterDate(year: number): Date {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
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

const ymd = (date: Date) => date.toISOString().slice(0, 10);

function firstMondayOfAugust(year: number): Date {
  const d = new Date(Date.UTC(year, 7, 1));
  const offset = (8 - d.getUTCDay()) % 7; // days until Monday (0 if already Monday)
  return new Date(Date.UTC(year, 7, 1 + offset));
}

/** Sumardagurinn fyrsti: fyrsti fimmtudagur eftir 18. apríl (19.–25. apríl). */
function firstDayOfSummer(year: number): Date {
  const d = new Date(Date.UTC(year, 3, 19));
  const offset = (4 - d.getUTCDay() + 7) % 7; // days until Thursday
  return new Date(Date.UTC(year, 3, 19 + offset));
}

export function getIcelandicHolidays(year: number): HolidayInfo[] {
  const easter = getEasterDate(year);
  return [
    // ── Stórhátíðardagar (gr. 2.3.1 / 3.2.3) ────────────────────────────────
    { date: `${year}-01-01`, nameIs: "Nýársdagur", nameEn: "New Year's Day", type: "storhatid" },
    { date: ymd(addDays(easter, -2)), nameIs: "Föstudagurinn langi", nameEn: "Good Friday", type: "storhatid" },
    { date: ymd(easter), nameIs: "Páskadagur", nameEn: "Easter Sunday", type: "storhatid" },
    { date: ymd(addDays(easter, 49)), nameIs: "Hvítasunnudagur", nameEn: "Whit Sunday", type: "storhatid" },
    { date: `${year}-06-17`, nameIs: "Þjóðhátíðardagurinn", nameEn: "National Day", type: "storhatid" },
    { date: `${year}-12-24`, nameIs: "Aðfangadagur", nameEn: "Christmas Eve", type: "storhatid_from_noon", fromHour: 12 },
    { date: `${year}-12-25`, nameIs: "Jóladagur", nameEn: "Christmas Day", type: "storhatid" },
    { date: `${year}-12-31`, nameIs: "Gamlársdagur", nameEn: "New Year's Eve", type: "storhatid_from_noon", fromHour: 12 },

    // ── Aðrir frídagar / helgidagar (gr. 2.3.2 / 3.2.2) ──────────────────────
    { date: ymd(addDays(easter, -3)), nameIs: "Skírdagur", nameEn: "Maundy Thursday", type: "helgidagur" },
    { date: ymd(addDays(easter, 1)), nameIs: "Annar í páskum", nameEn: "Easter Monday", type: "helgidagur" },
    { date: ymd(firstDayOfSummer(year)), nameIs: "Sumardagurinn fyrsti", nameEn: "First Day of Summer", type: "helgidagur" },
    { date: `${year}-05-01`, nameIs: "Verkalýðsdagurinn", nameEn: "Labour Day", type: "helgidagur" },
    { date: ymd(addDays(easter, 39)), nameIs: "Uppstigningardagur", nameEn: "Ascension Day", type: "helgidagur" },
    { date: ymd(addDays(easter, 50)), nameIs: "Annar í hvítasunnu", nameEn: "Whit Monday", type: "helgidagur" },
    { date: ymd(firstMondayOfAugust(year)), nameIs: "Frídagur verslunarmanna", nameEn: "Commerce Day", type: "helgidagur" },
    { date: `${year}-12-26`, nameIs: "Annar í jólum", nameEn: "Boxing Day", type: "helgidagur" },
  ];
}

const cache = new Map<number, Map<string, HolidayInfo>>();

/** Map<YYYY-MM-DD, HolidayInfo> for a year (memoised). */
export function getHolidayMap(year: number): Map<string, HolidayInfo> {
  let m = cache.get(year);
  if (!m) {
    m = new Map(getIcelandicHolidays(year).map((h) => [h.date, h]));
    cache.set(year, m);
  }
  return m;
}

export function getHoliday(dateStr: string): HolidayInfo | undefined {
  return getHolidayMap(Number(dateStr.slice(0, 4))).get(dateStr);
}

export function getHolidayName(dateStr: string, lang: "is" | "en" = "is"): string | null {
  const h = getHoliday(dateStr);
  return h ? (lang === "is" ? h.nameIs : h.nameEn) : null;
}
