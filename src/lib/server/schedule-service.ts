// Schedule expansion shared by the schedule API, swaps and the 2027 preview.
// A shift with endTime <= startTime ends on the NEXT day. Each dated shift is
// priced on its own date and rates (never a stored estimate from creation day).

import { calculateEmployeePeriod } from "../payroll/calculate";
import type { BusinessType } from "../payroll/engine";
import type { EmploymentTerms } from "../payroll/terms";
import { HttpError } from "./http";
import { shiftsCol, templatesCol } from "./refs";

export interface ScheduledShift {
  id: string; // single shift doc id, or tmpl_{templateId}_{date}
  source: "single" | "template";
  templateId?: string;
  uid: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  status: string;
}

export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** [startMs, endMs) of a dated shift; overnight shifts end the next day. */
export function shiftInterval(s: { date: string; startTime: string; endTime: string }): [number, number] {
  const start = Date.parse(`${s.date}T${s.startTime}:00Z`);
  const endDate = s.endTime <= s.startTime ? addDays(s.date, 1) : s.date;
  return [start, Date.parse(`${endDate}T${s.endTime}:00Z`)];
}

interface TemplateDoc {
  id: string;
  uid: string;
  name?: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  label?: string;
  active?: boolean;
  activeFrom?: string | null;
  activeTo?: string | null;
}

export function expandTemplates(templates: TemplateDoc[], singles: ScheduledShift[], from: string, to: string): ScheduledShift[] {
  const taken = new Set(singles.map((s) => `${s.uid}_${s.date}`)); // single (incl. cancelled) overrides template
  const out: ScheduledShift[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    for (const t of templates) {
      if (t.active === false || !t.daysOfWeek?.includes(dow)) continue;
      if (t.activeFrom && d < t.activeFrom) continue;
      if (t.activeTo && d > t.activeTo) continue;
      if (taken.has(`${t.uid}_${d}`)) continue;
      out.push({
        id: `tmpl_${t.id}_${d}`, source: "template", templateId: t.id, uid: t.uid, name: t.name || "",
        date: d, startTime: t.startTime, endTime: t.endTime, notes: t.label || "", status: "scheduled",
      });
    }
  }
  return out;
}

const toSingle = (id: string, d: FirebaseFirestore.DocumentData): ScheduledShift => ({
  id, source: "single", uid: d.uid, name: d.name || "", date: d.date, startTime: d.startTime, endTime: d.endTime,
  notes: d.notes || "", status: d.status || "scheduled",
});

/** All scheduled (non-cancelled) shifts in [from, to] inclusive, sorted. */
export async function loadSchedule(companyId: string, from: string, to: string): Promise<ScheduledShift[]> {
  const [singleSnap, tmplSnap] = await Promise.all([
    shiftsCol(companyId).where("date", ">=", from).where("date", "<=", to).get(),
    templatesCol(companyId).where("active", "==", true).get(),
  ]);
  const singles = singleSnap.docs.map((d) => toSingle(d.id, d.data()));
  const templates = tmplSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as TemplateDoc);
  const all = [...singles.filter((s) => s.status !== "cancelled"), ...expandTemplates(templates, singles, from, to)];
  return all.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name));
}

/**
 * Resolve a shift id on the server (inside a transaction when given) — the
 * client's description of a shift is never trusted.
 */
export async function resolveShift(companyId: string, id: string, tx?: FirebaseFirestore.Transaction): Promise<ScheduledShift> {
  const get = <T>(ref: FirebaseFirestore.DocumentReference<T>) => (tx ? tx.get(ref) : ref.get());
  const m = /^tmpl_([A-Za-z0-9_-]+)_(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!m) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new HttpError(400, "invalid_shift_id");
    const snap = await get(shiftsCol(companyId).doc(id));
    if (!snap.exists) throw new HttpError(404, "shift_not_found");
    const s = toSingle(snap.id, snap.data()!);
    if (s.status === "cancelled") throw new HttpError(409, "shift_cancelled");
    return s;
  }
  const [, templateId, date] = m;
  const tSnap = await get(templatesCol(companyId).doc(templateId));
  if (!tSnap.exists) throw new HttpError(404, "shift_not_found");
  const t = { id: tSnap.id, ...tSnap.data() } as TemplateDoc;
  const overrideQ = shiftsCol(companyId).where("uid", "==", t.uid).where("date", "==", date);
  const overrides = tx ? await tx.get(overrideQ) : await overrideQ.get();
  const expanded = expandTemplates([t], overrides.docs.map((d) => toSingle(d.id, d.data())), date, date);
  if (expanded.length !== 1) throw new HttpError(409, "shift_not_found");
  return expanded[0];
}

/** Same shift as when the request was made (for swap approval). */
export const sameShift = (a: ScheduledShift, b: ScheduledShift) =>
  a.id === b.id && a.uid === b.uid && a.date === b.date && a.startTime === b.startTime && a.endTime === b.endTime;

/** Cost estimate for one dated shift with the terms and rates in force on that date. */
export function estimateShift(s: ScheduledShift, terms: EmploymentTerms[], businessType: BusinessType) {
  const [start, end] = shiftInterval(s);
  const DAY = 86_400_000;
  const r = calculateEmployeePeriod({
    uid: s.uid,
    period: {
      key: "shift", start: Math.floor(start / DAY) * DAY, end: Math.ceil(end / DAY) * DAY + DAY,
      startDate: s.date, endDateInclusive: s.date,
    },
    terms, businessType, now: Date.now(), mode: "planned", intervalsOnly: true,
    planned: [{ sourceId: s.id, start, end, punchIds: [], estimate: true }],
  });
  return {
    hours: r.totals.hours,
    grossCents: r.lines.some((l) => l.amountCents === null) ? null : r.totals.grossCents,
    status: r.status,
    draftRates: r.lines.some((l) => l.versionStatus === "draft"),
    issues: [...new Set(r.issues.filter((i) => i.severity === "blocker").map((i) => i.code))],
  };
}
