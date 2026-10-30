import { describe, it, expect } from "vitest";
import { outAfterOpenShift, planCorrection } from "./corrections";
import type { PunchLite } from "./punches";

const at = (iso: string) => Date.parse(iso);
const p = (id: string, type: "in" | "out", iso: string): PunchLite => ({ id, type, at: at(iso) });
const NOW = at("2026-10-20T12:00:00Z");
const plan = (punches: PunchLite[], inIso: string | null, outIso: string | null, replaces: string[] | "all" = "all", now = NOW) =>
  planCorrection({ punches, date: "2026-10-10", inAt: inIso ? at(inIso) : null, outAt: outIso ? at(outIso) : null, replaces, now });

describe("planCorrection — which punches a correction supersedes", () => {
  it("with both times, the day's shift is replaced", () => {
    const punches = [p("a", "in", "2026-10-10T18:02:00Z"), p("b", "out", "2026-10-10T22:58:00Z")];
    expect(plan(punches, "2026-10-10T18:00:00Z", "2026-10-10T23:00:00Z")).toMatchObject({ ok: true, supersede: ["a", "b"] });
  });

  it("an out time alone completes a forgotten clock-out and keeps the punch-in", () => {
    const punches = [p("a", "in", "2026-10-10T20:00:00Z"), p("z", "in", "2026-10-12T18:00:00Z"), p("y", "out", "2026-10-12T23:00:00Z")];
    expect(plan(punches, null, "2026-10-10T23:30:00Z")).toMatchObject({ ok: true, supersede: [] });
  });

  it("an in time alone replaces the recorded punch-in and keeps the punch-out", () => {
    const punches = [p("a", "in", "2026-10-10T19:00:00Z"), p("b", "out", "2026-10-10T23:00:00Z")];
    expect(plan(punches, "2026-10-10T17:00:00Z", null)).toMatchObject({ ok: true, supersede: ["a"] });
  });

  it("the shift being worked right now is not replaced unless chosen", () => {
    const punches = [p("a", "in", "2026-10-10T08:00:00Z"), p("b", "out", "2026-10-10T12:00:00Z"), p("c", "in", "2026-10-10T17:00:00Z")];
    const now = at("2026-10-10T19:00:00Z");
    expect(plan(punches, "2026-10-10T08:00:00Z", "2026-10-10T12:30:00Z", "all", now)).toMatchObject({ ok: true, supersede: ["a", "b"] });
    expect(plan(punches, "2026-10-10T16:30:00Z", null, ["c"], now)).toMatchObject({ ok: true, supersede: ["c"] });
  });

  it("new punches may not interleave with a shift that is kept", () => {
    // Fri 20:00 – Sat 03:00 is kept; the correction adds Sat 01:00–05:00.
    const punches = [p("a", "in", "2026-10-09T20:00:00Z"), p("b", "out", "2026-10-10T03:00:00Z")];
    expect(plan(punches, "2026-10-10T01:00:00Z", "2026-10-10T05:00:00Z", [])).toEqual({ ok: false, error: "correction_overlaps" });
    // …nor sit inside one.
    const long = [p("a", "in", "2026-10-10T18:00:00Z"), p("b", "out", "2026-10-11T02:00:00Z")];
    expect(plan(long, "2026-10-10T20:00:00Z", "2026-10-10T22:00:00Z", [])).toEqual({ ok: false, error: "correction_overlaps" });
  });

  it("an out time alone with nothing to close is refused", () => {
    expect(plan([], null, "2026-10-10T23:30:00Z")).toEqual({ ok: false, error: "correction_overlaps" });
  });

  it("only whole shifts of that day can be chosen", () => {
    const punches = [p("a", "in", "2026-10-10T18:00:00Z"), p("b", "out", "2026-10-10T23:00:00Z"), p("x", "in", "2026-10-08T18:00:00Z"), p("y", "out", "2026-10-08T23:00:00Z")];
    expect(plan(punches, "2026-10-10T18:00:00Z", "2026-10-10T22:00:00Z", ["x"])).toEqual({ ok: false, error: "replace_not_on_day" });
    expect(plan(punches, "2026-10-10T18:00:00Z", "2026-10-10T22:00:00Z", ["a"])).toEqual({ ok: false, error: "replace_partial_shift" });
  });

  it("no times removes the chosen shifts whole", () => {
    const punches = [p("a", "in", "2026-10-10T18:00:00Z"), p("b", "out", "2026-10-10T23:00:00Z")];
    expect(plan(punches, null, null, ["a", "b"])).toMatchObject({ ok: true, supersede: ["a", "b"] });
  });
});

describe("outAfterOpenShift — an out time alone for a night shift", () => {
  const night = [p("a", "in", "2026-10-10T20:00:00Z")];
  it("an out time before the open shift's start is the next morning", () => {
    expect(outAfterOpenShift(night, "2026-10-10", at("2026-10-10T02:30:00Z"))).toBe(at("2026-10-11T02:30:00Z"));
  });
  it("an out time after the start stays on the day", () => {
    expect(outAfterOpenShift(night, "2026-10-10", at("2026-10-10T23:30:00Z"))).toBe(at("2026-10-10T23:30:00Z"));
  });
  it("without an open shift that day nothing changes", () => {
    expect(outAfterOpenShift([], "2026-10-10", at("2026-10-10T02:30:00Z"))).toBe(at("2026-10-10T02:30:00Z"));
  });
});
