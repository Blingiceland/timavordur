import { describe, it, expect } from "vitest";
import { AGREEMENT_VERSIONS, versionForDate, STEPS, type WageClass } from "./agreements";
import { hourlyFromMonthly, withPremium, fractionOfMonthly } from "./money";

// Independent fixtures transcribed cell by cell from the published PDFs
// (kafli HÓTEL- OG VEITINGAHÚS). Order per row: byrjun, 1 ár, 3 ár, 5 ár.
// Values in aurar. These are NOT derived from agreements.ts.
type Row = [number, number, number, number];
interface Published { day: Row; ot: Row; p33: Row; p45: Row; p55: Row; p90?: Row }

const PUBLISHED: Record<string, Record<WageClass, Published>> = {
  "2026-01": {
    6: {
      day: [280018, 282818, 287060, 292802],
      ot: [500174, 505175, 512753, 523008],
      p33: [372424, 376148, 381790, 389427],
      p45: [406026, 410086, 416237, 424563],
      p55: [434028, 438368, 444943, 453843],
    },
    7: {
      day: [281642, 284458, 288725, 294499],
      ot: [503074, 508105, 515726, 526041],
      p33: [374584, 378329, 384004, 391684],
      p45: [408381, 412464, 418651, 427024],
      p55: [436545, 440910, 447524, 456473],
      p90: [535120, 540470, 548578, 559548], // gistihús-dálkur, staðfestir 90% námundun
    },
  },
  "2026-04": {
    6: {
      day: [280187, 282988, 287233, 292978],
      ot: [500475, 505479, 513062, 523323],
      p33: [372649, 376374, 382020, 389661],
      p45: [406271, 410333, 416488, 424818],
      p55: [434290, 438631, 445211, 454116],
    },
    7: {
      day: [281812, 284630, 288899, 294677],
      ot: [503378, 508411, 516037, 526357],
      p33: [374810, 378558, 384236, 391920],
      p45: [408627, 412714, 418904, 427282],
      p55: [436809, 441177, 447793, 456749],
      p90: [535443, 540797, 548908, 559886],
    },
  },
};

describe("agreement versions — every published cell", () => {
  for (const [versionId, classes] of Object.entries(PUBLISHED)) {
    const v = AGREEMENT_VERSIONS.find((x) => x.version === versionId)!;
    it(`${versionId} exists and is verified`, () => {
      expect(v).toBeDefined();
      expect(v.status).toBe("verified");
    });
    for (const cls of [6, 7] as WageClass[]) {
      const pub = classes[cls];
      STEPS.forEach((step, i) => {
        it(`${versionId} fl.${cls} ${step}`, () => {
          const monthly = v.monthly[cls][step];
          const day = hourlyFromMonthly(monthly, v.rules.dayDivisor);
          expect(day).toBe(pub.day[i]);
          expect(fractionOfMonthly(monthly, v.rules.overtimePerMillion, 1_000_000)).toBe(pub.ot[i]);
          expect(withPremium(day, v.rules.eveningPct)).toBe(pub.p33[i]);
          expect(withPremium(day, v.rules.nightWeekendPct)).toBe(pub.p45[i]);
          expect(withPremium(day, v.rules.barNightPct)).toBe(pub.p55[i]);
          if (pub.p90) expect(withPremium(day, v.rules.storhatidPct)).toBe(pub.p90[i]);
        });
      });
    }
  }

  it("uses the 172 divisor from gr. 1.6, not 173,33", () => {
    for (const v of AGREEMENT_VERSIONS) expect(v.rules.dayDivisor).toBe(172);
  });
});

describe("versionForDate — dated selection, no system clock", () => {
  it("selects January 2026 before 1 April", () => {
    const r = versionForDate("2026-03-31");
    expect(r.ok && r.version.version).toBe("2026-01");
  });
  it("selects April 2026 from 1 April inclusive", () => {
    const r = versionForDate("2026-04-01");
    expect(r.ok && r.version.version).toBe("2026-04");
  });
  it("selects the 2027 draft from 1 January 2027, marked draft", () => {
    const r = versionForDate("2027-01-01");
    expect(r.ok && r.version.version).toBe("2027-01-draft");
    expect(r.ok && r.version.status).toBe("draft");
  });
  it("returns an explicit error before the first version (never zero or a stale rate)", () => {
    expect(versionForDate("2025-12-31")).toEqual({ ok: false, reason: "no_rate_version" });
  });
  it("versions are contiguous and non-overlapping", () => {
    const sorted = [...AGREEMENT_VERSIONS].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].effectiveFrom).toBe(sorted[i - 1].effectiveTo);
  });
  it("the 2027 draft is at least the April 2026 minimum in every cell", () => {
    const apr = AGREEMENT_VERSIONS.find((v) => v.version === "2026-04")!;
    const d27 = AGREEMENT_VERSIONS.find((v) => v.version === "2027-01-draft")!;
    for (const cls of [6, 7] as WageClass[]) for (const s of STEPS) expect(d27.monthly[cls][s]).toBeGreaterThan(apr.monthly[cls][s]);
  });
});
