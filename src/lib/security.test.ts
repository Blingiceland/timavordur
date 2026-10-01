import { describe, it, expect } from "vitest";
import { checkIpRestriction, getClientIp, ipInCidr, normaliseAllowList, parseCidr, parseIp } from "./ip";
import { POLICIES, isLocked, registerAttempt, type RateState } from "./rate-limit";
import { decideStaffAction } from "./staff-policy";
import { isDate, isDateRange, isKr, isIdempotencyKey } from "./validation";
import { sanitizeProfile } from "./staff-fields";
import { redact } from "./audit";

describe("IP / CIDR", () => {
  const inR = (ip: string, cidr: string) => ipInCidr(parseIp(ip)!, parseCidr(cidr)!);
  it("IPv4 exact and CIDR", () => {
    expect(inR("203.0.113.7", "203.0.113.7")).toBe(true);
    expect(inR("203.0.113.8", "203.0.113.7")).toBe(false);
    expect(inR("203.0.113.200", "203.0.113.0/24")).toBe(true);
    expect(inR("203.0.114.1", "203.0.113.0/24")).toBe(false);
    expect(inR("10.1.2.3", "10.0.0.0/8")).toBe(true);
  });
  it("old string-prefix bug: 203.0.113 must not match 203.0.11.x or 203.0.1130", () => {
    expect(parseIp("203.0.1130.1")).toBeNull();
    expect(inR("203.0.11.5", "203.0.113.0/24")).toBe(false);
  });
  it("IPv6 incl. compression and mapped IPv4", () => {
    expect(inR("2001:db8::1", "2001:db8::/32")).toBe(true);
    expect(inR("2001:db9::1", "2001:db8::/32")).toBe(false);
    expect(inR("::ffff:203.0.113.9", "203.0.113.0/24")).toBe(true);
    expect(inR("2001:db8:0:0:0:0:0:1", "2001:db8::1/128")).toBe(true);
    expect(inR("fe80::1%eth0", "fe80::/10")).toBe(true);
  });
  it("rejects malformed input", () => {
    for (const bad of ["", "1.2.3", "256.1.1.1", "01.2.3.4", "1:2:3", "2001:db8:::1", "abc"]) expect(parseIp(bad)).toBeNull();
    expect(parseCidr("10.0.0.0/33")).toBeNull();
    expect(normaliseAllowList(["10.0.0.0/8", "nope"])).toBeNull();
  });
  it("restriction fails closed when enabled but empty, invalid or client unknown", () => {
    expect(checkIpRestriction({ enabled: true, allowedIPs: [] }, "1.2.3.4")).toEqual({ allowed: false, reason: "ip_restriction_misconfigured" });
    expect(checkIpRestriction({ enabled: true, allowedIPs: ["x"] }, "1.2.3.4")).toEqual({ allowed: false, reason: "ip_restriction_misconfigured" });
    expect(checkIpRestriction({ enabled: true, allowedIPs: ["1.2.3.0/24"] }, null)).toEqual({ allowed: false, reason: "client_ip_unknown" });
    expect(checkIpRestriction({ enabled: true, allowedIPs: ["1.2.3.0/24"] }, "1.2.3.9")).toEqual({ allowed: true });
    expect(checkIpRestriction({ enabled: false, allowedIPs: [] }, null)).toEqual({ allowed: true });
  });
  it("client IP comes only from the configured trusted source", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 1.1.1.1", "x-real-ip": "7.7.7.7" });
    expect(getClientIp(h, "none")).toBeNull();
    expect(getClientIp(h, "vercel")).toBe("6.6.6.6");
    expect(getClientIp(h, "x-real-ip")).toBe("7.7.7.7");
    expect(getClientIp(new Headers({ "x-forwarded-for": "garbage" }), "vercel")).toBeNull();
  });
});

describe("rate limiting", () => {
  const p = POLICIES.loginUser;
  it("locks after max failures and doubles the lock each time", () => {
    let s: RateState | null = null;
    const t0 = 1_000_000;
    for (let i = 0; i < p.max - 1; i++) s = registerAttempt(s, t0 + i, p);
    expect(isLocked(s, t0 + 10)).toBe(0);
    s = registerAttempt(s, t0 + 10, p);
    expect(isLocked(s, t0 + 11)).toBeGreaterThan(p.lockMs - 100);
    const t1 = t0 + 10 + p.lockMs + 1;
    for (let i = 0; i < p.max; i++) s = registerAttempt(s, t1 + i, p);
    expect(isLocked(s, t1 + p.max)).toBeGreaterThan(2 * p.lockMs - 100);
  });
  it("window resets the counter", () => {
    let s = registerAttempt(null, 0, p);
    s = registerAttempt(s, p.windowMs + 1, p);
    expect(s.count).toBe(1);
  });
  it("lock is capped", () => {
    let s: RateState | null = null;
    let t = 0;
    for (let round = 0; round < 12; round++) { for (let i = 0; i < p.max; i++) s = registerAttempt(s, t++, p); t += p.maxLockMs + 1; }
    expect(s!.lockedUntil - (t - p.maxLockMs - 1)).toBeLessThanOrEqual(p.maxLockMs);
  });
});

describe("staff policy", () => {
  const owner = { uid: "o", role: "owner" as const };
  const admin = { uid: "a", role: "admin" as const };
  const manager = { uid: "m", role: "manager" as const };
  const t = (role: "staff" | "manager" | "admin" | "owner", extra = {}) => ({ uid: "t", role, status: "approved", ...extra });

  it("only admin+ may manage staff", () => {
    expect(decideStaffAction(manager, "update", t("staff"), { approvedOwnerCount: 1 }).ok).toBe(false);
  });
  it("admin cannot create an owner/admin or touch one", () => {
    expect(decideStaffAction(admin, "create", null, { newRole: "owner", approvedOwnerCount: 1 })).toMatchObject({ ok: false, status: 403 });
    expect(decideStaffAction(admin, "create", null, { newRole: "admin", approvedOwnerCount: 1 })).toMatchObject({ ok: false });
    for (const a of ["update", "reset_pin", "delete", "reject"] as const) {
      expect(decideStaffAction(admin, a, t("owner", { authType: "password" }), { approvedOwnerCount: 2 })).toMatchObject({ ok: false, status: 403 });
    }
    expect(decideStaffAction(admin, "set_role", t("staff"), { newRole: "manager", approvedOwnerCount: 1 })).toMatchObject({ ok: false });
  });
  it("PIN accounts are capped at manager", () => {
    expect(decideStaffAction(owner, "create", null, { newRole: "admin", approvedOwnerCount: 1, newIsPin: true })).toMatchObject({ ok: false, error: "pin_account_role_limit" });
    expect(decideStaffAction(owner, "set_role", t("staff", { authType: "password" }), { newRole: "owner", approvedOwnerCount: 1 })).toMatchObject({ ok: false });
    expect(decideStaffAction(owner, "create", null, { newRole: "manager", approvedOwnerCount: 1, newIsPin: true }).ok).toBe(true);
  });
  it("the last owner cannot be demoted, deleted or rejected", () => {
    for (const a of ["delete", "reject"] as const) expect(decideStaffAction(owner, a, t("owner"), { approvedOwnerCount: 1 })).toMatchObject({ ok: false, status: 409 });
    expect(decideStaffAction(owner, "set_role", t("owner"), { newRole: "admin", approvedOwnerCount: 1 })).toMatchObject({ ok: false, error: "last_owner" });
    expect(decideStaffAction(owner, "set_role", t("owner"), { newRole: "admin", approvedOwnerCount: 2 }).ok).toBe(true);
  });
});

describe("validation and allow-lists", () => {
  it("dates must exist on the calendar", () => {
    expect(isDate("2026-02-28")).toBe(true);
    expect(isDate("2026-02-30")).toBe(false);
    expect(isDate("2026-13-01")).toBe(false);
    expect(isDateRange("2026-01-01", "2026-03-10", 62)).toBe(false);
  });
  it("money and keys", () => {
    expect(isKr(2801.87)).toBe(true);
    expect(isKr(2801.875)).toBe(false);
    expect(isKr(Number.NaN)).toBe(false);
    expect(isKr(-1)).toBe(false);
    expect(isIdempotencyKey("abc")).toBe(false);
    expect(isIdempotencyKey("a1b2c3d4e5f6")).toBe(true);
  });
  it("profile updates reject role/status/pay/auth injection", () => {
    for (const k of ["role", "status", "passwordHash", "pinVersion", "hourlyRate", "payType", "wageCategoryId", "authType"]) {
      expect(sanitizeProfile({ [k]: "owner" })).toMatchObject({ ok: false });
    }
    expect(sanitizeProfile({ name: "Anna", ssn: "010190-1234" })).toMatchObject({ ok: true });
    expect(sanitizeProfile({ ssn: "abc" })).toMatchObject({ ok: false });
  });
  it("audit redaction removes secrets", () => {
    expect(redact({ name: "a", passwordHash: "x", passwordSalt: "y", nested: { token: "t", pinVersion: 2 } })).toEqual({ name: "a", nested: { pinVersion: 2 } });
  });
});
