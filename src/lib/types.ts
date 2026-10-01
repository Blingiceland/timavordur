// Shared domain types for Timavörður.
// Centralised here so route handlers and React pages reference one source of truth
// instead of re-declaring these inline (and drifting out of sync).

import type { BusinessType } from "./payroll/engine";
import type { PayType } from "./payroll/terms";

export type { BusinessType, PayType };

/** LEGACY: company-level rate templates from before dated terms (read only by the migration). */
export interface WageCategory {
  id: string;
  name: string;
  description: string;
  dayRate: number;
}

// ── Roles & status ───────────────────────────────────────────────────────────
export type Role = "staff" | "manager" | "admin" | "owner";
export type Status = "pending" | "approved" | "rejected";

/** How a registration field is treated for a company. */
export type FieldLevel = "required" | "optional" | "hidden";

// ── Company (tv_companies/{id}) ──────────────────────────────────────────────
export interface IpRestriction {
  enabled: boolean;
  allowedIPs: string[];
}

export interface Company {
  id: string;
  /** Companies with the same groupId share staff logins (username + PIN). Defaults to the company id. */
  groupId: string;
  name: string;
  slug: string;
  adminEmails: string[];
  active: boolean;
  createdAt?: string;
  kennitala?: string;
  registrationFields: Record<string, FieldLevel>;
  requireApproval: boolean;
  ipRestriction: IpRestriction;
  businessType?: BusinessType;          // "bar" | "restaurant" — gates the 55% night premium
  /** LEGACY, no longer used for pay — see employmentTerms. */
  wageCategories?: WageCategory[];
  /** Only populated by the superadmin company-list endpoint. */
  staffCount?: number;
}

// ── Staff (tv_companies/{id}/staff/{uid}) ────────────────────────────────────
export interface Staff {
  uid: string;
  email: string;
  name: string;
  role: Role;
  status: Status;
  language: "is" | "en";
  registeredSelf?: boolean;
  // personal details
  ssn?: string;
  phone?: string;
  address?: string;
  // bank
  bankName?: string;
  bankAccount?: string;
  // employment
  union?: string;
  pension?: string;
  workPermit?: boolean | null;
  workPermitExpiry?: string;
  jobTitle?: string;
  employmentType?: string;
  // LEGACY pay fields (pre-2026-10). Pay now comes only from dated employmentTerms;
  // the migration copies these into terms.legacy and never uses them for pay.
  payType?: string;
  hourlyRate?: number;
  monthlyRate?: number;
  collectiveAgreement?: string;
  // auth
  authType?: "google" | "password";
  pinVersion?: number;
}

// ── Punch records (tv_companies/{id}/punchRecords/{auto}) ────────────────────
export interface PunchRecord {
  uid: string;
  name: string;
  email: string;
  type: "in" | "out";
  date: string;        // YYYY-MM-DD
  displayTime: string; // HH:MM (24h)
  source?: "clock" | "correction";
  idempotencyKey?: string;
}

// ── Shifts & templates ───────────────────────────────────────────────────────
export interface Shift {
  uid: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  notes?: string;
  status?: string;
  source?: string;
}

export interface ShiftTemplate {
  uid: string;
  name: string;
  daysOfWeek: number[]; // 0=Sun … 6=Sat
  startTime: string;
  endTime: string;
  label?: string;
  active: boolean;
  activeFrom?: string;
  activeTo?: string;
}
