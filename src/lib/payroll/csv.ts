// Payroll CSV export. Format (documented in docs/PAYROLL_EXPORT.md):
//   UTF-8 with BOM, ";" separator, CRLF, decimal comma, one row per pay line
//   plus one TOTAL row per employee. Text cells that could be read as a
//   spreadsheet formula (= + - @ tab CR) are prefixed with an apostrophe.

import type { EmployeeCalculation } from "./calculate";

export const CSV_COLUMNS = [
  "timabil", "stada_uppgjors", "starfsmadur_id", "nafn", "kennitala", "dagsetning", "upphaf", "lok",
  "vinnulidur", "tegund", "alag_pct", "yfirvinna", "klst", "taxti_kr", "fjarhaed_kr",
  "taxtautgafa", "taxtastada", "kjaraskra_id", "launaflokkur", "threp", "grunnur", "aaetlun", "uppruni", "reiknivel",
] as const;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvText(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (FORMULA_START.test(s)) s = `'${s}`;
  if (/[";\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Number with decimal comma; numbers we generate are never formula-escaped. */
export function csvNumber(n: number | null, decimals: number): string {
  if (n === null || !Number.isFinite(n)) return "";
  return n.toFixed(decimals).replace(".", ",");
}

export interface CsvEmployee {
  uid: string;
  name: string;
  kennitala: string;
  calc: EmployeeCalculation;
}

export function buildPayrollCsv(periodKey: string, periodStatus: string, employees: CsvEmployee[]): string {
  const rows: string[] = [CSV_COLUMNS.join(";")];
  for (const e of employees) {
    for (const l of e.calc.lines) {
      rows.push([
        csvText(periodKey), csvText(periodStatus), csvText(e.uid), csvText(e.name), csvText(e.kennitala),
        csvText(l.date), csvText(l.start), csvText(l.end), csvText(l.labelIs), csvText(l.kind),
        csvNumber(l.pct, 0), l.overtime ? "1" : "0", csvNumber(l.durationMs / 3_600_000, 4),
        csvNumber(l.rateCents === null ? null : l.rateCents / 100, 2), csvNumber(l.amountCents === null ? null : l.amountCents / 100, 2),
        csvText(l.versionId), csvText(l.versionStatus), csvText(l.termsId), csvText(l.wageClass), csvText(l.step), csvText(l.basis),
        l.estimate ? "1" : "0", csvText([l.sourceId, ...l.punchIds].join("|")), csvText(e.calc.engineVersion),
      ].join(";"));
    }
    rows.push([
      csvText(periodKey), csvText(periodStatus), csvText(e.uid), csvText(e.name), csvText(e.kennitala),
      "", "", "", "SAMTALS", "total", "", "", csvNumber(e.calc.totals.durationMs / 3_600_000, 4), "",
      csvNumber(e.calc.totals.grossCents / 100, 2), csvText(e.calc.rateVersions.join("|")), "", csvText(e.calc.termsIds.join("|")),
      "", "", "", "", "", csvText(e.calc.engineVersion),
    ].join(";"));
  }
  return "﻿" + rows.join("\r\n") + "\r\n";
}
