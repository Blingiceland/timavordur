// Shared domain types for Timavörður.
// Centralised here so route handlers and React pages reference one source of truth
// instead of re-declaring these inline (and drifting out of sync).

import type { CollectiveAgreement, PayType, WageBreakdown } from "./wage-calculator";

export type { CollectiveAgreement, PayType, WageBreakdown };

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
  name: string;
  slug: string;
  adminEmails: string[];
  active: boolean;
  createdAt?: string;
  kennitala?: string;
  registrationFields: Record<string, FieldLevel>;
  requireApproval: boolean;
  ipRestriction: IpRestriction;
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
  // pay
  payType?: PayType;
  hourlyRate?: number;
  monthlyRate?: number;
  collectiveAgreement?: CollectiveAgreement;
}

// ── Punch records (tv_companies/{id}/punchRecords/{auto}) ────────────────────
export interface WageData {
  totalHours: number;
  totalWage: number;
  effectiveMultiplier: number;
  breakdown: WageBreakdown;
  wageBreakdown: WageBreakdown;
  hourlyRate: number;
  agreement: CollectiveAgreement;
}

export interface PunchRecord {
  uid: string;
  name: string;
  email: string;
  type: "in" | "out";
  date: string;        // YYYY-MM-DD
  displayTime: string; // HH:MM (24h)
  wageData?: WageData;
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
  hourlyRate?: number;
  agreement?: CollectiveAgreement;
}
