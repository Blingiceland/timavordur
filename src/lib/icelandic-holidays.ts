// Icelandic public holidays calculator
// Easter-based holidays use the Anonymous Gregorian algorithm

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

export interface HolidayInfo {
  date: string; // YYYY-MM-DD
  nameIs: string;
  nameEn: string;
}

export function getIcelandicHolidays(year: number): HolidayInfo[] {
  const easter = getEasterDate(year);
  return [
    { date: `${year}-01-01`, nameIs: "Nýársdagur", nameEn: "New Year's Day" },
    { date: toDateStr(addDays(easter, -3)), nameIs: "Skírdagur", nameEn: "Maundy Thursday" },
    { date: toDateStr(addDays(easter, -2)), nameIs: "Föstudagurinn langi", nameEn: "Good Friday" },
    { date: toDateStr(easter), nameIs: "Páskadagur", nameEn: "Easter Sunday" },
    { date: toDateStr(addDays(easter, 1)), nameIs: "Annar í páskum", nameEn: "Easter Monday" },
    { date: `${year}-05-01`, nameIs: "Verkalýðsdagurinn", nameEn: "Labour Day" },
    { date: toDateStr(addDays(easter, 39)), nameIs: "Uppstigningardagur", nameEn: "Ascension Day" },
    { date: toDateStr(addDays(easter, 49)), nameIs: "Hvítasunnudagur", nameEn: "Whit Sunday" },
    { date: toDateStr(addDays(easter, 50)), nameIs: "Annar í hvítasunnu", nameEn: "Whit Monday" },
    { date: `${year}-06-17`, nameIs: "Þjóðhátíðardagurinn", nameEn: "National Day" },
    { date: toDateStr(getFirstMondayOfAugust(year)), nameIs: "Frídagur verslunarmanna", nameEn: "Commerce Day" },
    { date: `${year}-12-25`, nameIs: "Jóladagur", nameEn: "Christmas Day" },
    { date: `${year}-12-26`, nameIs: "Annar í jólum", nameEn: "Boxing Day" },
  ];
}

export function getHolidaySet(year: number): Set<string> {
  return new Set(getIcelandicHolidays(year).map(h => h.date));
}

export function getHolidayName(dateStr: string, lang: "is" | "en" = "is"): string | null {
  const year = parseInt(dateStr.slice(0, 4));
  const holidays = getIcelandicHolidays(year);
  const h = holidays.find(x => x.date === dateStr);
  return h ? (lang === "is" ? h.nameIs : h.nameEn) : null;
}
