// Validation of a new employment-terms record submitted by an admin/owner.
// Pure; returns either the clean record fields or a list of field errors.

import { STEPS, WAGE_CLASSES } from "./agreements";
import type { EmploymentTerms } from "./terms";
import { cleanStr, isDate, isEnum, isKr, isNumberIn, unknownKeys } from "../validation";

export const TERMS_INPUT_KEYS = [
  "uid", "effectiveFrom", "reason", "agreementId", "workingArrangement", "payType", "employmentPercentage",
  "wageClass", "managementRole", "birthDate", "employerStartDate", "priorIndustryMonths", "experienceVerifiedOn",
  "stepOverride", "personalDayRate", "monthlySalary", "fixedAdditions", "orlofOverrideBp", "customRates",
] as const;

const CUSTOM_RATE_KEYS = ["eveningPct", "nightWeekendPct", "barNightPct", "helgidagurPct", "storhatidPct", "overtimePct"] as const;

export type TermsInput = Omit<EmploymentTerms, "id" | "recordedAt" | "recordedBy" | "status" | "legacy">;

export function parseTermsInput(body: Record<string, unknown>): { ok: true; value: TermsInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const extra = unknownKeys(body, TERMS_INPUT_KEYS);
  if (extra.length) errors.push(`unknown_fields:${extra.join(",")}`);

  const optDate = (k: string): string | null => {
    const v = body[k];
    if (v === null || v === undefined || v === "") return null;
    if (!isDate(v)) { errors.push(`${k}:invalid_date`); return null; }
    return v;
  };

  const uid = typeof body.uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(body.uid) ? body.uid : (errors.push("uid:required"), "");
  const effectiveFrom = isDate(body.effectiveFrom) ? body.effectiveFrom : (errors.push("effectiveFrom:invalid_date"), "");
  const reason = cleanStr(body.reason, 300);
  if (reason.length < 3) errors.push("reason:required");
  const agreementId = body.agreementId ?? "efling_sa_hotel";
  if (agreementId !== "efling_sa_hotel" && agreementId !== "custom") errors.push("agreementId:unsupported");
  const custom = agreementId === "custom";
  const workingArrangement = isEnum(body.workingArrangement, ["shift", "casual", "day"] as const) ? body.workingArrangement : (errors.push("workingArrangement:required"), null);
  const payType = isEnum(body.payType, ["hourly", "monthly"] as const) ? body.payType : (errors.push("payType:invalid"), "hourly" as const);
  const employmentPercentage = isNumberIn(body.employmentPercentage, 1, 100) ? body.employmentPercentage : (errors.push("employmentPercentage:1-100"), null);
  // Custom terms have no agreement table, so no wage class.
  const wageClass = custom ? null : WAGE_CLASSES.find((c) => c === body.wageClass) ?? (errors.push("wageClass:6_or_7"), null);
  if (body.managementRole !== undefined && typeof body.managementRole !== "boolean") errors.push("managementRole:boolean");
  const birthDate = optDate("birthDate");
  const employerStartDate = optDate("employerStartDate");
  const experienceVerifiedOn = optDate("experienceVerifiedOn");

  let priorIndustryMonths: number | null = null;
  if (body.priorIndustryMonths !== null && body.priorIndustryMonths !== undefined && body.priorIndustryMonths !== "") {
    if (!isNumberIn(body.priorIndustryMonths, 0, 600) || !Number.isInteger(body.priorIndustryMonths)) errors.push("priorIndustryMonths:0-600");
    else priorIndustryMonths = body.priorIndustryMonths;
  }
  if (priorIndustryMonths && !experienceVerifiedOn) errors.push("experienceVerifiedOn:required_with_prior_experience");

  let stepOverride: TermsInput["stepOverride"] = null;
  if (body.stepOverride) {
    const so = body.stepOverride as Record<string, unknown>;
    const r = cleanStr(so.reason, 300);
    if (!isEnum(so.step, STEPS) || r.length < 3) errors.push("stepOverride:invalid");
    else stepOverride = { step: so.step, reason: r };
  }

  let personalDayRate: number | null = null;
  if (body.personalDayRate !== null && body.personalDayRate !== undefined && body.personalDayRate !== "") {
    if (!isKr(body.personalDayRate, 100_000) || body.personalDayRate <= 0) errors.push("personalDayRate:invalid");
    else if (payType !== "hourly") errors.push("personalDayRate:hourly_only");
    else personalDayRate = body.personalDayRate;
  }
  let monthlySalary: number | null = null;
  if (body.monthlySalary !== null && body.monthlySalary !== undefined && body.monthlySalary !== "") {
    if (!isKr(body.monthlySalary, 10_000_000) || body.monthlySalary <= 0) errors.push("monthlySalary:invalid");
    else monthlySalary = body.monthlySalary;
  }
  if (payType === "monthly" && monthlySalary === null) errors.push("monthlySalary:required_for_monthly");

  const fixedAdditions: TermsInput["fixedAdditions"] = [];
  if (body.fixedAdditions !== undefined && body.fixedAdditions !== null) {
    if (!Array.isArray(body.fixedAdditions) || body.fixedAdditions.length > 10) errors.push("fixedAdditions:invalid");
    else for (const fa of body.fixedAdditions as Record<string, unknown>[]) {
      const label = cleanStr(fa?.label, 80);
      if (!label || !isKr(fa?.monthlyAmount, 5_000_000) || (fa.monthlyAmount as number) <= 0) errors.push("fixedAdditions:item_invalid");
      else fixedAdditions.push({ label, monthlyAmount: fa.monthlyAmount as number });
    }
  }
  let orlofOverrideBp: number | null = null;
  if (body.orlofOverrideBp !== null && body.orlofOverrideBp !== undefined && body.orlofOverrideBp !== "") {
    if (!Number.isInteger(body.orlofOverrideBp) || !isNumberIn(body.orlofOverrideBp, 1017, 2000)) errors.push("orlofOverrideBp:1017-2000");
    else orlofOverrideBp = body.orlofOverrideBp as number;
  }
  if (birthDate && effectiveFrom && birthDate > effectiveFrom) errors.push("birthDate:after_effective");

  let customRates: TermsInput["customRates"] = null;
  if (custom) {
    const c = body.customRates as Record<string, unknown> | null | undefined;
    if (!c || typeof c !== "object" || Array.isArray(c)) errors.push("customRates:required");
    else if (CUSTOM_RATE_KEYS.some((k) => !isNumberIn(c[k], 0, 300))) errors.push("customRates:0-300");
    else customRates = {
      eveningPct: c.eveningPct as number, nightWeekendPct: c.nightWeekendPct as number, barNightPct: c.barNightPct as number,
      helgidagurPct: c.helgidagurPct as number, storhatidPct: c.storhatidPct as number, overtimePct: c.overtimePct as number,
    };
    if (payType === "hourly" && personalDayRate === null) errors.push("personalDayRate:required_for_custom");
    if (body.managementRole === true) errors.push("managementRole:not_for_custom");
  } else if (body.customRates !== undefined && body.customRates !== null) {
    errors.push("customRates:custom_only");
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      uid, effectiveFrom, reason, agreementId: custom ? "custom" : "efling_sa_hotel", workingArrangement, payType,
      employmentPercentage, wageClass, managementRole: body.managementRole === true, birthDate, employerStartDate,
      priorIndustryMonths, experienceVerifiedOn, stepOverride, personalDayRate, monthlySalary, fixedAdditions, orlofOverrideBp,
      customRates,
    },
  };
}
