import { describe, it, expect } from "vitest";
import { isCompanyKennitala, isKennitala, isValidSlug, normaliseKennitala, slugify } from "./onboarding";

describe("kennitala", () => {
  it("accepts valid person and company numbers (check digit, century)", () => {
    expect(isKennitala("010190-2319")).toBe(true);
    expect(isKennitala("0101902319")).toBe(true);
    expect(isKennitala("5501692829")).toBe(true); // company (day + 40)
    expect(isCompanyKennitala("550169-2829")).toBe(true);
    expect(isCompanyKennitala("0101902319")).toBe(false);
  });
  it("rejects wrong check digit, bad century, impossible dates and junk", () => {
    expect(isKennitala("0101902339")).toBe(false); // check digit
    expect(isKennitala("0101902311")).toBe(false); // century 1 (check digit ok)
    expect(isKennitala("3213902349")).toBe(false);
    expect(isKennitala("12345")).toBe(false);
    expect(isKennitala(null)).toBe(false);
    expect(normaliseKennitala(" 010190-2349 ")).toBe("0101902349");
  });
});

describe("slug", () => {
  it("turns Icelandic names into url-safe slugs", () => {
    expect(slugify("Kaffi Þórs & Co.")).toBe("kaffi-thors-co");
    expect(slugify("Ægir Brugghús")).toBe("aegir-brugghus");
    expect(slugify("  Röð ÖLstofa  ")).toBe("rod-olstofa");
    expect(slugify("Pablo Discobar")).toBe("pablo-discobar");
    expect(slugify("a".repeat(60)).length).toBeLessThanOrEqual(40);
  });
  it("rejects reserved and malformed slugs", () => {
    for (const s of ["api", "superadmin", "byrja", "demo", "-a", "a-", "A", "x", "æ"]) expect(isValidSlug(s)).toBe(false);
    expect(isValidSlug("kaffi-thors")).toBe(true);
  });
});
