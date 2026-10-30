import { describe, it, expect } from "vitest";
import { shiftsOnDay, type PunchLite } from "./punches";

const at = (iso: string) => Date.parse(iso);
const p = (id: string, type: "in" | "out", iso: string): PunchLite => ({ id, type, at: at(iso) });

describe("shiftsOnDay — the recorded shifts a correction for a work day replaces", () => {
  it("a forgotten clock-out is the day's shift, without an out time", () => {
    const punches = [p("a", "in", "2026-10-10T20:00:00Z"), p("b", "in", "2026-10-12T18:00:00Z"), p("c", "out", "2026-10-13T02:00:00Z")];
    expect(shiftsOnDay(punches, "2026-10-10")).toEqual([{ punchIds: ["a"], inAt: at("2026-10-10T20:00:00Z"), outAt: null }]);
  });

  it("a day recorded twice (clock and correction) yields every punch of that day", () => {
    const punches = [
      p("s1", "in", "2026-10-10T17:02:00Z"), p("s2", "out", "2026-10-10T23:58:00Z"),
      p("c1", "in", "2026-10-10T17:00:00Z"), p("c2", "out", "2026-10-11T00:10:00Z"),
    ];
    expect(shiftsOnDay(punches, "2026-10-10")).toEqual([
      { punchIds: ["c1"], inAt: at("2026-10-10T17:00:00Z"), outAt: null },
      { punchIds: ["s1", "s2"], inAt: at("2026-10-10T17:02:00Z"), outAt: at("2026-10-10T23:58:00Z") },
      { punchIds: ["c2"], inAt: null, outAt: at("2026-10-11T00:10:00Z") },
    ]);
  });

  it("a night shift belongs to the day it started, not the day it ended", () => {
    const punches = [p("a", "in", "2026-10-10T20:00:00Z"), p("b", "out", "2026-10-11T03:00:00Z")];
    expect(shiftsOnDay(punches, "2026-10-10").map((s) => s.punchIds)).toEqual([["a", "b"]]);
    expect(shiftsOnDay(punches, "2026-10-11")).toEqual([]);
  });

  it("a lone clock-out before noon belongs to the night before; after noon to that day", () => {
    const night = [p("x", "out", "2026-10-11T03:00:00Z")];
    expect(shiftsOnDay(night, "2026-10-10").map((s) => s.punchIds)).toEqual([["x"]]);
    expect(shiftsOnDay(night, "2026-10-11")).toEqual([]);
    const day = [p("y", "out", "2026-10-11T17:00:00Z")];
    expect(shiftsOnDay(day, "2026-10-11").map((s) => s.punchIds)).toEqual([["y"]]);
  });

  it("anything overlapping the corrected times is included even if it is anchored to another day", () => {
    const punches = [p("x", "out", "2026-10-11T11:00:00Z")]; // before noon → the night of the 10th
    expect(shiftsOnDay(punches, "2026-10-11")).toEqual([]);
    const span = { from: at("2026-10-11T06:00:00Z"), to: at("2026-10-11T11:00:00Z") };
    expect(shiftsOnDay(punches, "2026-10-11", span).map((s) => s.punchIds)).toEqual([["x"]]);
  });

  it("a shift longer than 16 hours is listed once", () => {
    const punches = [p("a", "in", "2026-10-10T08:00:00Z"), p("b", "out", "2026-10-11T02:00:00Z")];
    expect(shiftsOnDay(punches, "2026-10-10").map((s) => s.punchIds)).toEqual([["a", "b"]]);
  });

  it("with the current time, a punch-in still within 16 hours is the shift being worked now", () => {
    const punches = [p("a", "in", "2026-10-10T20:00:00Z")];
    expect(shiftsOnDay(punches, "2026-10-10", undefined, at("2026-10-10T23:00:00Z"))).toEqual([{ punchIds: ["a"], inAt: at("2026-10-10T20:00:00Z"), outAt: null, inProgress: true }]);
    expect(shiftsOnDay(punches, "2026-10-10", undefined, at("2026-10-11T13:00:00Z"))).toEqual([{ punchIds: ["a"], inAt: at("2026-10-10T20:00:00Z"), outAt: null }]);
  });

  it("other days' shifts are left alone", () => {
    const punches = [p("a", "in", "2026-10-09T17:00:00Z"), p("b", "out", "2026-10-09T23:00:00Z"), p("c", "in", "2026-10-11T17:00:00Z"), p("d", "out", "2026-10-11T23:00:00Z")];
    expect(shiftsOnDay(punches, "2026-10-10", { from: at("2026-10-10T17:00:00Z"), to: at("2026-10-10T23:00:00Z") })).toEqual([]);
  });
});
