// Timesheet CSV export: one row per worked shift (date, in, out, hours) plus
// one total row per employee. Meant to be opened in Excel, so headers are
// plain Icelandic; same encoding as the payroll CSV (BOM, ";", CRLF, decimal
// comma, formula-escaped text). Shifts are rebuilt from the pay lines, so the
// hours always equal the payroll calculation (clipped at the period edges).

import { csvNumber, csvText } from "./csv";
import type { EmployeeResult } from "../server/payroll-service";

export const TIMESHEET_COLUMNS = ["Nafn", "Kennitala", "Dagsetning", "Vikudagur", "Inn", "Út", "Klst", "Athugasemd"] as const;

const WEEKDAYS = ["sunnudagur", "mánudagur", "þriðjudagur", "miðvikudagur", "fimmtudagur", "föstudagur", "laugardagur"];

export interface TimesheetShift {
  date: string;
  start: string;
  end: string;
  durationMs: number;
  open: boolean;
}

/** Worked shifts of one employee, in time order (salary/adjustment lines are skipped). */
export function shiftsFromLines(lines: EmployeeResult["calc"]["lines"]): TimesheetShift[] {
  const byShift = new Map<string, TimesheetShift>();
  for (const l of lines) {
    if (l.durationMs <= 0) continue;
    const s = byShift.get(l.sourceId);
    if (!s) {
      byShift.set(l.sourceId, { date: l.date, start: l.start, end: l.end, durationMs: l.durationMs, open: l.estimate });
    } else {
      if (l.start < s.start) { s.start = l.start; s.date = l.date; }
      if (l.end > s.end) s.end = l.end;
      s.durationMs += l.durationMs;
      s.open ||= l.estimate;
    }
  }
  return [...byShift.values()].sort((a, b) => a.start.localeCompare(b.start));
}

// ISO times are UTC, which is Icelandic time.
const hhmm = (iso: string) => iso.slice(11, 16);
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

export function buildTimesheetCsv(employees: EmployeeResult[]): string {
  const rows: string[] = [TIMESHEET_COLUMNS.join(";")];
  for (const e of employees) {
    const shifts = shiftsFromLines(e.calc.lines);
    for (const s of shifts) {
      rows.push([
        csvText(e.name), csvText(e.kennitala), csvText(s.date), csvText(weekday(s.date)),
        csvText(hhmm(s.start)), csvText(hhmm(s.end)), csvNumber(s.durationMs / 3_600_000, 2),
        csvText(s.open ? "Vakt í gangi (áætlun)" : ""),
      ].join(";"));
    }
    const total = shifts.reduce((sum, s) => sum + s.durationMs, 0);
    rows.push([
      csvText(e.name), csvText(e.kennitala), "SAMTALS", "", "", "", csvNumber(total / 3_600_000, 2),
      csvText(`${shifts.length} vaktir`),
    ].join(";"));
  }
  return "﻿" + rows.join("\r\n") + "\r\n";
}
