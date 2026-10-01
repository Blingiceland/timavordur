// Who may do what to which staff account. One pure policy used by every route
// that creates, changes, resets or removes a staff member.

import type { Role } from "./types";

export const ROLES: readonly Role[] = ["staff", "manager", "admin", "owner"] as const;
export const ROLE_LEVEL: Record<Role, number> = { staff: 1, manager: 2, admin: 3, owner: 4 };
export const atLeast = (role: Role, min: Role) => (ROLE_LEVEL[role] || 0) >= ROLE_LEVEL[min];
export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** PIN (4-digit) accounts can never hold admin/owner rights. */
export const MAX_PIN_ROLE: Role = "manager";
export const PROTECTED_ROLES: readonly Role[] = ["admin", "owner"];

export type StaffAction = "create" | "update" | "reset_pin" | "set_role" | "approve" | "reject" | "delete";

export interface Actor {
  uid: string;
  role: Role;
}
export interface Target {
  uid: string;
  role: Role;
  status: string;
  authType?: string;
}

export type Decision = { ok: true } | { ok: false; status: number; error: string };
const deny = (status: number, error: string): Decision => ({ ok: false, status, error });

/**
 * @param approvedOwnerCount number of approved owners in the company (for last-owner protection)
 * @param newRole the role being assigned (create / set_role)
 */
export function decideStaffAction(
  actor: Actor,
  action: StaffAction,
  target: Target | null,
  opts: { newRole?: Role; approvedOwnerCount: number; newIsPin?: boolean }
): Decision {
  if (!atLeast(actor.role, "admin")) return deny(403, "forbidden");
  const isOwner = actor.role === "owner";

  if (action === "create") {
    const role = opts.newRole ?? "staff";
    if (!isOwner && PROTECTED_ROLES.includes(role)) return deny(403, "owner_required_for_role");
    if (opts.newIsPin && ROLE_LEVEL[role] > ROLE_LEVEL[MAX_PIN_ROLE]) return deny(400, "pin_account_role_limit");
    return { ok: true };
  }

  if (!target) return deny(404, "not_found");
  const targetProtected = PROTECTED_ROLES.includes(target.role);
  if (targetProtected && !isOwner) return deny(403, "owner_required_for_target");

  const isLastOwner = target.role === "owner" && target.status === "approved" && opts.approvedOwnerCount <= 1;

  switch (action) {
    case "set_role": {
      if (!isOwner) return deny(403, "owner_required");
      const role = opts.newRole;
      if (!role) return deny(400, "invalid_role");
      if (target.authType === "password" && ROLE_LEVEL[role] > ROLE_LEVEL[MAX_PIN_ROLE]) return deny(400, "pin_account_role_limit");
      if (isLastOwner && role !== "owner") return deny(409, "last_owner");
      return { ok: true };
    }
    case "delete":
    case "reject":
      if (isLastOwner) return deny(409, "last_owner");
      if (target.uid === actor.uid && action === "reject") return deny(400, "cannot_reject_self");
      return { ok: true };
    case "reset_pin":
      if (target.authType !== "password" && !target.uid.startsWith("pw_")) return deny(400, "not_pin_account");
      return { ok: true };
    case "approve":
    case "update":
      return { ok: true };
  }
}
