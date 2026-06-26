import { describe, it, expect } from "vitest";
import { getIcelandicHolidays, getHolidayMap, getHolidayName } from "./icelandic-holidays";

describe("Icelandic holidays — 2026", () => {
  const map = getHolidayMap(2026);

  it("computes Easter-derived holidays (Easter Sunday = 2026-04-05)", () => {
    // Good Friday is Easter − 2 = 2026-04-03, Maundy Thursday = Easter − 3 = 2026-04-02
    expect(map.get("2026-04-03")?.nameIs).toBe("Föstudagurinn langi");
    expect(map.get("2026-04-03")?.type).toBe("storhatid");
    expect(map.get("2026-04-02")?.nameIs).toBe("Skírdagur");
    expect(map.get("2026-04-02")?.type).toBe("helgarfridagur");
    expect(map.get("2026-04-05")?.nameIs).toBe("Páskadagur");
  });

  it("classifies fixed stórhátíðir", () => {
    expect(map.get("2026-05-01")?.type).toBe("storhatid"); // Verkalýðsdagurinn
    expect(map.get("2026-06-17")?.type).toBe("storhatid"); // Þjóðhátíðardagurinn
    expect(map.get("2026-12-25")?.type).toBe("storhatid"); // Jóladagur
  });

  it("classifies helgarfrídaga", () => {
    expect(map.get("2026-01-01")?.type).toBe("helgarfridagur"); // Nýársdagur
    expect(map.get("2026-12-26")?.type).toBe("helgarfridagur"); // Annar í jólum
  });

  it("classifies half-stórhátíðir with a 16:00 cutover", () => {
    expect(map.get("2026-12-24")?.type).toBe("half-storhatid");
    expect(map.get("2026-12-24")?.storhatidFromHour).toBe(16);
    expect(map.get("2026-12-31")?.type).toBe("half-storhatid");
  });

  it("returns a localized holiday name (or null)", () => {
    expect(getHolidayName("2026-12-25", "is")).toBe("Jóladagur");
    expect(getHolidayName("2026-12-25", "en")).toBe("Christmas Day");
    expect(getHolidayName("2026-07-15")).toBeNull();
  });

  it("lists 15 holidays for the year", () => {
    expect(getIcelandicHolidays(2026)).toHaveLength(15);
  });
});
