// Allow-listed staff PROFILE fields. Roles, status, auth data and pay terms are
// deliberately absent: they have their own actions (set-role, approve/reject,
// reset-pin, dated employment terms).

import { cleanStr, isDate, isEnum, isOptionalKennitala } from "./validation";

export const PROFILE_FIELDS = [
  "name", "email", "phone", "address", "ssn", "bankName", "bankAccount", "union", "pension",
  "workPermit", "workPermitExpiry", "jobTitle", "employmentType", "language",
] as const;

const MAX: Record<string, number> = {
  name: 120, email: 200, phone: 30, address: 200, ssn: 11, bankName: 80, bankAccount: 30, union: 80, pension: 80,
  jobTitle: 80, employmentType: 40,
};

export function sanitizeProfile(input: Record<string, unknown>): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!(PROFILE_FIELDS as readonly string[]).includes(k)) return { ok: false, error: `field_not_allowed:${k}` };
    if (k === "workPermit") {
      if (v !== null && typeof v !== "boolean") return { ok: false, error: "workPermit:boolean" };
      out[k] = v;
    } else if (k === "workPermitExpiry") {
      if (v !== "" && v !== null && !isDate(v)) return { ok: false, error: "workPermitExpiry:invalid_date" };
      out[k] = v || "";
    } else if (k === "language") {
      if (!isEnum(v, ["is", "en"] as const)) return { ok: false, error: "language:invalid" };
      out[k] = v;
    } else if (k === "ssn") {
      if (!isOptionalKennitala(v)) return { ok: false, error: "ssn:invalid" };
      out[k] = cleanStr(v, MAX.ssn);
    } else {
      if (v !== null && v !== undefined && typeof v !== "string") return { ok: false, error: `${k}:string` };
      out[k] = cleanStr(v, MAX[k] ?? 200);
    }
  }
  if ("name" in out && !out.name) return { ok: false, error: "name:required" };
  return { ok: true, value: out };
}
