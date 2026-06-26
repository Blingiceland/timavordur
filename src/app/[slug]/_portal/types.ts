// View-model types for the company portal page (client-side shapes returned by
// /api/[slug]/portal). Domain enums are reused from the shared lib types.
import type { Role, Status, FieldLevel } from "@/lib/types";

export type { Role, Status, FieldLevel };
export type Lang = "is" | "en";
export type Tab = "clock" | "team" | "staff" | "settings" | "swaps";

// ── Shift swaps ──────────────────────────────────────────────────────────────
export interface SwapShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  source?: string;
  templateId?: string;
}

export interface SwapRequest {
  id: string;
  type: "cover" | "swap";
  status: "pending" | "accepted" | "approved" | "rejected" | "cancelled";
  fromUid: string;
  fromName: string;
  fromShift: SwapShift;
  toUid?: string;
  toName?: string;
  toShift?: SwapShift;
  claimedByUid?: string;
  claimedByName?: string;
}

export interface TeamMember {
  uid: string;
  name: string;
  email: string;
  username?: string;
  authType?: string;       // "password" for username/password staff
  password?: string;       // transient: only set in add/edit forms, never returned by the API
  role: Role;
  status: Status;
  isPunchedIn: boolean;
  todayHours: number;
  ssn?: string;
  phone?: string;
  address?: string;
  bankName?: string;
  bankAccount?: string;
  union?: string;
  pension?: string;
  workPermit?: boolean | null;
  workPermitExpiry?: string;
  jobTitle?: string;
  employmentType?: string;
  addedAt?: string;
}

export interface PortalShift {
  id: string;
  uid: string;
  name?: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  endTime: string;    // HH:MM
  notes?: string;
  source?: string;    // "single" | "template"
  templateId?: string;
}

export interface PortalData {
  registered: boolean;
  status?: Status;
  role?: Role;
  name?: string;
  companyName?: string;
  isPunchedIn?: boolean;
  todayHours?: number;
  periodHours?: number;
  shifts?: number;
  team?: TeamMember[];
  staffList?: TeamMember[];
  registrationFields?: Record<string, FieldLevel>;
  requireApproval?: boolean;
}
