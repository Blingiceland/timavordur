import { describe, it, expect } from "vitest";
import { getIcelandicHolidays, getHolidayMap, getHolidayName } from "./icelandic-holidays";

// Classification per SA/Efling agreement gr. 2.3.1 (stórhátíðardagar, 90%) and
// gr. 2.3.2 (aðrir frídagar, 45%). Easter dates are independent facts:
// 2026-04-05 and 2027-03-28.

describe("Icelandic holidays — 2026", () => {
  const map = getHolidayMap(2026);

  it("Nýársdagur is a stórhátíðardagur (90%), not a 45% day", () => {
    expect(map.get("2026-01-01")?.type).toBe("storhatid");
  });

  it("1. maí is a 45% frídagur, not a stórhátíð", () => {
    expect(map.get("2026-05-01")?.type).toBe("helgidagur");
  });

  it("includes Sumardagurinn fyrsti (first Thursday after 18 April)", () => {
    expect(map.get("2026-04-23")?.nameIs).toBe("Sumardagurinn fyrsti");
    expect(map.get("2026-04-23")?.type).toBe("helgidagur");
  });

  it("Aðfangadagur and Gamlársdagur become stórhátíð from 12:00", () => {
    for (const d of ["2026-12-24", "2026-12-31"]) {
      expect(map.get(d)?.type).toBe("storhatid_from_noon");
      expect(map.get(d)?.fromHour).toBe(12);
    }
  });

  it("Easter-derived days", () => {
    expect(map.get("2026-04-02")?.type).toBe("helgidagur"); // Skírdagur
    expect(map.get("2026-04-03")?.type).toBe("storhatid"); // Föstudagurinn langi
    expect(map.get("2026-04-05")?.type).toBe("storhatid"); // Páskadagur
    expect(map.get("2026-04-06")?.type).toBe("helgidagur"); // Annar í páskum
    expect(map.get("2026-05-14")?.type).toBe("helgidagur"); // Uppstigningardagur
    expect(map.get("2026-05-24")?.type).toBe("storhatid"); // Hvítasunnudagur
    expect(map.get("2026-05-25")?.type).toBe("helgidagur"); // Annar í hvítasunnu
  });

  it("fixed and other days", () => {
    expect(map.get("2026-06-17")?.type).toBe("storhatid");
    expect(map.get("2026-08-03")?.type).toBe("helgidagur"); // fyrsti mánudagur í ágúst
    expect(map.get("2026-12-25")?.type).toBe("storhatid");
    expect(map.get("2026-12-26")?.type).toBe("helgidagur");
  });

  it("8 stórhátíðardagar and 8 aðrir frídagar", () => {
    const all = getIcelandicHolidays(2026);
    expect(all.filter((h) => h.type !== "helgidagur")).toHaveLength(8);
    expect(all.filter((h) => h.type === "helgidagur")).toHaveLength(8);
  });

  it("returns a localized name (or null)", () => {
    expect(getHolidayName("2026-12-25", "is")).toBe("Jóladagur");
    expect(getHolidayName("2026-12-25", "en")).toBe("Christmas Day");
    expect(getHolidayName("2026-07-15")).toBeNull();
  });
});

describe("Icelandic holidays — 2027 calendar", () => {
  const map = getHolidayMap(2027);
  const expected: [string, string, string][] = [
    ["2027-01-01", "Nýársdagur", "storhatid"],
    ["2027-03-25", "Skírdagur", "helgidagur"],
    ["2027-03-26", "Föstudagurinn langi", "storhatid"],
    ["2027-03-28", "Páskadagur", "storhatid"],
    ["2027-03-29", "Annar í páskum", "helgidagur"],
    ["2027-04-22", "Sumardagurinn fyrsti", "helgidagur"],
    ["2027-05-01", "Verkalýðsdagurinn", "helgidagur"],
    ["2027-05-06", "Uppstigningardagur", "helgidagur"],
    ["2027-05-16", "Hvítasunnudagur", "storhatid"],
    ["2027-05-17", "Annar í hvítasunnu", "helgidagur"],
    ["2027-06-17", "Þjóðhátíðardagurinn", "storhatid"],
    ["2027-08-02", "Frídagur verslunarmanna", "helgidagur"],
    ["2027-12-24", "Aðfangadagur", "storhatid_from_noon"],
    ["2027-12-25", "Jóladagur", "storhatid"],
    ["2027-12-26", "Annar í jólum", "helgidagur"],
    ["2027-12-31", "Gamlársdagur", "storhatid_from_noon"],
  ];
  for (const [date, name, type] of expected) {
    it(`${date} ${name}`, () => {
      expect(map.get(date)?.nameIs).toBe(name);
      expect(map.get(date)?.type).toBe(type);
    });
  }
  it("has exactly these 16 days", () => {
    expect(getIcelandicHolidays(2027).map((h) => h.date).sort()).toEqual(expected.map((e) => e[0]).sort());
  });
});
