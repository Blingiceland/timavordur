import { describe, expect, it } from "vitest";
import { missingRequired, REGISTRATION_FIELD_KEYS } from "./staff-fields";
import type { FieldLevel } from "./types";

const DILLON: Record<string, FieldLevel> = {
  name: "required", ssn: "required", phone: "required", address: "required", bankName: "hidden", bankAccount: "required",
  union: "required", pension: "required", jobTitle: "hidden", workPermit: "hidden", workPermitExpiry: "hidden", employmentType: "hidden",
};
const complete = {
  role: "staff", name: "Anna", ssn: "010190-2349", phone: "5551234", address: "Laugavegur 1", bankAccount: "0101-26-123456",
  union: "Efling", pension: "Gildi",
};

describe("missingRequired", () => {
  it("lists the required fields a staff member has left empty", () => {
    expect(missingRequired({ role: "staff", name: "Anna", phone: "  " }, DILLON)).toEqual(["ssn", "phone", "address", "bankAccount", "union", "pension"]);
  });
  it("is empty when every required field is filled", () => {
    expect(missingRequired(complete, DILLON)).toEqual([]);
  });
  it("applies to managers too", () => {
    expect(missingRequired({ ...complete, role: "manager", union: "" }, DILLON)).toEqual(["union"]);
  });
  it("never applies to admins and owners", () => {
    expect(missingRequired({ role: "admin", name: "A" }, DILLON)).toEqual([]);
    expect(missingRequired({ role: "owner", name: "O" }, DILLON)).toEqual([]);
  });
  it("treats a missing role as staff", () => {
    expect(missingRequired({ name: "X" }, { name: "required", ssn: "required" })).toEqual(["ssn"]);
  });
  it("ignores optional and hidden fields, and fields the venue has not configured", () => {
    expect(missingRequired({ role: "staff", name: "Anna" }, { name: "required", ssn: "optional", phone: "hidden" })).toEqual([]);
  });
  it("requires a work permit answer, and an expiry only when there is a permit", () => {
    const f: Record<string, FieldLevel> = { name: "required", workPermit: "required", workPermitExpiry: "required" };
    expect(missingRequired({ role: "staff", name: "A" }, f)).toEqual(["workPermit"]);
    expect(missingRequired({ role: "staff", name: "A", workPermit: false }, f)).toEqual([]);
    expect(missingRequired({ role: "staff", name: "A", workPermit: true }, f)).toEqual(["workPermitExpiry"]);
  });
  it("knows exactly the registration fields venues can configure", () => {
    expect(REGISTRATION_FIELD_KEYS).toEqual(["name", "ssn", "phone", "address", "bankName", "bankAccount", "union", "pension", "workPermit", "workPermitExpiry", "jobTitle", "employmentType"]);
  });
});
