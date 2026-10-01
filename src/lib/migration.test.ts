import { describe, it, expect } from "vitest";
import { planCompany, birthDateFromKennitala } from "../../scripts/migration/plan-2026-10.mjs";

type Doc = Record<string, unknown>;
interface Op { kind: "create" | "update"; path: string; data: Doc; before?: Doc }

const company = { wageCategories: [{ id: "fl6-0", dayRate: 2764 }, { id: "fl7-5", dayRate: 3100 }] };
const staff = [
  { id: "g1", data: { name: "Eigandi", role: "owner", status: "approved", email: "o@x.is" } },
  { id: "g2", data: { name: "Gamall", addedAt: "2026-02-01", email: "g@x.is", payType: "hourly", hourlyRate: 3200 } }, // no status, no category
  { id: "g3", data: { name: "Óljós" } }, // no status, no provenance
  { id: "pw_a", data: { name: "Anna", username: "anna", authType: "password", role: "owner", status: "approved", wageCategoryId: "fl6-0", ssn: "010190-2349", passwordHash: "h", passwordSalt: "s" } },
  { id: "pw_b", data: { name: "Bjarki", username: "bjarki", authType: "password", role: "staff", status: "approved", wageCategoryId: "fl7-5", payType: "monthly", monthlyRate: 520000 } },
  { id: "pw_c", data: { name: "Tvö", username: "bjarki", authType: "password", status: "approved" } },
];

type Snap = { company: Doc; staff: { id: string; data: Doc }[]; termsUids: string[]; usernameIndex: Record<string, string>; groupPinAccounts: Record<string, boolean> };
function apply(snap: Snap, ops: Op[]) {
  for (const op of ops) {
    const parts = op.path.split("/");
    if (parts.length === 2) snap.company = { ...snap.company, ...op.data };
    else if (parts[0] === "tv_groups" && parts[2] === "usernames") snap.usernameIndex[parts[3]] = op.data.uid as string;
    else if (parts[0] === "tv_groups" && parts[2] === "pinAccounts") snap.groupPinAccounts[parts[3]] = true;
    else if (parts[2] === "staff") {
      const s = snap.staff.find((x) => x.id === parts[3])!;
      const next = { ...s.data, ...op.data };
      for (const [k, v] of Object.entries(next)) if (v === "__DELETE__") delete next[k];
      s.data = next;
    } else if (parts[2] === "employmentTerms") snap.termsUids.push(op.data.uid as string);
  }
}

describe("migration 2026-10 plan", () => {
  const fresh = () => ({ companyId: "c", company: { ...company } as Doc, staff: structuredClone(staff), termsUids: [] as string[], usernameIndex: {} as Record<string, string>, groupPinAccounts: {} as Record<string, boolean> });

  it("sets explicit status, never implying approval for unknown provenance", () => {
    const { report } = planCompany(fresh());
    const st = Object.fromEntries(report.statusSet.map((s: { uid: string; status: string }) => [s.uid, s.status]));
    expect(st).toEqual({ g2: "approved", g3: "pending" });
  });

  it("caps PIN owner/admin to manager and moves the credential to the group account", () => {
    const { ops, report } = planCompany(fresh());
    expect(report.pinRoleCapped.map((r: { uid: string }) => r.uid)).toEqual(["pw_a"]);
    const upd = (ops as Op[]).filter((o) => o.path.endsWith("/staff/pw_a"));
    expect(upd[0].data).toMatchObject({ role: "manager" });
    expect(upd[0].before).toMatchObject({ role: "owner" });
    const acct = (ops as Op[]).find((o) => o.path === "tv_groups/c/pinAccounts/pw_a")!;
    expect(acct.data).toMatchObject({ username: "anna", passwordHash: "h", passwordSalt: "s", pinVersion: 0 });
    expect(upd[1].data).toEqual({ passwordHash: "__DELETE__", passwordSalt: "__DELETE__", pinVersion: "__DELETE__" });
    expect((ops as Op[]).find((o) => o.path === "tv_companies/c")!.data).toEqual({ groupId: "c" });
  });

  it("reports duplicate usernames instead of indexing either", () => {
    const { ops, report } = planCompany(fresh());
    expect(report.usernameConflicts).toEqual([{ username: "bjarki", uids: ["pw_b", "pw_c"] }]);
    expect((ops as Op[]).filter((o) => o.path.includes("/usernames/")).map((o) => o.path)).toEqual(["tv_groups/c/usernames/anna"]);
  });

  it("creates needs_review terms, preserves legacy values and never lowers overpay", () => {
    const { ops } = planCompany(fresh());
    const t = (uid: string) => (ops as Op[]).find((o) => o.path.endsWith(`/employmentTerms/migr202610_${uid}`))!.data;
    expect(t("g2")).toMatchObject({ status: "needs_review", wageClass: null, personalDayRate: 3200, legacy: { hourlyRate: 3200 } });
    expect(t("pw_a")).toMatchObject({ wageClass: 6, personalDayRate: null, birthDate: "1990-01-01", legacy: { categoryDayRate: 2764 } });
    expect(t("pw_b")).toMatchObject({ wageClass: 7, payType: "monthly", monthlySalary: 520000 });
    expect(t("g1")).toMatchObject({ employerStartDate: null, workingArrangement: null });
  });

  it("is idempotent: applying the plan and planning again gives zero operations", () => {
    const snap = fresh();
    const first = planCompany(snap);
    expect(first.ops.length).toBeGreaterThan(0);
    apply(snap as Snap, first.ops as Op[]);
    expect(planCompany(snap).ops).toEqual([]);
  });

  it("reads birth dates from valid kennitölur only", () => {
    expect(birthDateFromKennitala("010190-2349")).toBe("1990-01-01");
    expect(birthDateFromKennitala("3112059990")).toBe("2005-12-31");
    expect(birthDateFromKennitala("5501692469")).toBeNull(); // company id (day + 40)
    expect(birthDateFromKennitala("")).toBeNull();
  });
});
