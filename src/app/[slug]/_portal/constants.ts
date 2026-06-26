// Static config, translations and helpers for the company portal page.
import type { Role, FieldLevel, Lang, TeamMember } from "./types";

export const ROLES: { key: Role; labelIs: string; labelEn: string; color: string }[] = [
  { key: "staff", labelIs: "Starfsmaður", labelEn: "Staff", color: "var(--text-secondary)" },
  { key: "manager", labelIs: "Vaktstjóri", labelEn: "Manager", color: "var(--brand-light)" },
  { key: "admin", labelIs: "Stjórnandi", labelEn: "Admin", color: "var(--accent)" },
  { key: "owner", labelIs: "Eigandi", labelEn: "Owner", color: "#f0a500" },
];

const LEVEL: Record<Role, number> = { staff: 1, manager: 2, admin: 3, owner: 4 };

export const roleLabel = (r: Role, lang: Lang) =>
  ROLES.find((x) => x.key === r)?.[lang === "is" ? "labelIs" : "labelEn"] || r;
export const roleColor = (r: Role) =>
  ROLES.find((x) => x.key === r)?.color || "var(--text-secondary)";
export const atLeast = (role: Role, min: Role) => LEVEL[role] >= LEVEL[min];

export const ALL_REG_FIELDS = [
  { key: "name", is: "Fullt nafn", en: "Full name", ph_is: "Jón Jónsson", ph_en: "John Smith" },
  { key: "ssn", is: "Kennitala", en: "ID number", ph_is: "1234567890", ph_en: "1234567890", pattern: "[0-9]{10}", maxLength: 10 },
  { key: "phone", is: "Símanúmer", en: "Phone", ph_is: "8001234", ph_en: "+354 800 1234" },
  { key: "address", is: "Heimilisfang", en: "Address", ph_is: "Laugavegur 1, 101 Reykjavík", ph_en: "1 Main St, Reykjavík" },
  { key: "bankName", is: "Banki", en: "Bank", ph_is: "Íslandsbanki", ph_en: "Íslandsbanki" },
  { key: "bankAccount", is: "Reikningsnúmer", en: "Account no.", ph_is: "0111-26-123456", ph_en: "0111-26-123456" },
  { key: "union", is: "Stéttarfélag", en: "Union", ph_is: "VR", ph_en: "VR" },
  { key: "pension", is: "Lífeyrissjóður", en: "Pension fund", ph_is: "Gildi", ph_en: "Gildi" },
  { key: "jobTitle", is: "Starfsheiti", en: "Job title", ph_is: "Barþjónn", ph_en: "Bartender" },
];

export const T = {
  is: { loading: "Hleður...", signIn: "Innskrá með Google", signOut: "Útskrá", langBtn: "🇮🇸", punchIn: "KLUKKA INN", punchOut: "KLUKKA ÚT", today: "Í dag", period: "Þetta tímabil", shifts: "Vaktir", pending: "Skráning í bið", pendingMsg: "Stjórnandi þarf að samþykkja þig.", rejected: "Skráningu hafnað", rejectedMsg: "Hafðu samband við stjórnanda.", tabClock: "Klukka", tabTeam: "Lið", tabStaff: "Starfsmenn", tabSettings: "Stillingar", regTitle: "Nýskráning", regBtn: "Senda", required: "skyldulegt", statusIn: "● Inni", statusOut: "○ Úti", approve: "✓ Samþykkja", reject: "✕ Hafna", edit: "Breyta", delete: "Eyða", addStaff: "+ Bæta við", saveRole: "Vista hlutverk", role: "Hlutverk", save: "Vista", saving: "Vista...", saved: "✅ Vistað!" },
  en: { loading: "Loading...", signIn: "Sign in with Google", signOut: "Sign out", langBtn: "🇬🇧", punchIn: "CLOCK IN", punchOut: "CLOCK OUT", today: "Today", period: "This period", shifts: "Shifts", pending: "Registration pending", pendingMsg: "Waiting for manager approval.", rejected: "Registration rejected", rejectedMsg: "Please contact your manager.", tabClock: "Clock", tabTeam: "Team", tabStaff: "Staff", tabSettings: "Settings", regTitle: "Registration", regBtn: "Submit", required: "required", statusIn: "● In", statusOut: "○ Out", approve: "✓ Approve", reject: "✕ Reject", edit: "Edit", delete: "Delete", addStaff: "+ Add staff", saveRole: "Save role", role: "Role", save: "Save", saving: "Saving...", saved: "✅ Saved!" },
};

export const EMPTY_REG: Record<string, string> = { name: "", ssn: "", phone: "", address: "", bankName: "", bankAccount: "", union: "", pension: "", jobTitle: "", workPermit: "", workPermitExpiry: "", employmentType: "" };
export const EMPTY_STAFF: Partial<TeamMember> = { name: "", email: "", ssn: "", phone: "", address: "", bankName: "", bankAccount: "", union: "", pension: "", jobTitle: "", employmentType: "", role: "staff" };
export const REG_FIELDS_DEFAULTS: Record<string, FieldLevel> = { name: "required", ssn: "optional", phone: "optional", address: "optional", bankName: "optional", bankAccount: "optional", union: "optional", pension: "optional", jobTitle: "optional", workPermit: "optional", workPermitExpiry: "optional", employmentType: "optional" };
export const ALL_REG_FIELD_KEYS = ["name", "ssn", "phone", "address", "bankName", "bankAccount", "union", "pension", "workPermit", "workPermitExpiry", "jobTitle", "employmentType"];
export const ALL_REG_FIELD_LABELS: Record<string, [string, string]> = { name: ["Fullt nafn", "Full name"], ssn: ["Kennitala", "ID number"], phone: ["Símanúmer", "Phone"], address: ["Heimilisfang", "Address"], bankName: ["Banki", "Bank"], bankAccount: ["Reikningsnúmer", "Account no."], union: ["Stéttarfélag", "Union"], pension: ["Lífeyrissjóður", "Pension fund"], workPermit: ["Vinnuleyfi", "Work permit"], workPermitExpiry: ["Vinnuleyfi gildir til", "Permit expiry"], jobTitle: ["Starfsheiti", "Job title"], employmentType: ["Ráðningarstig", "Employment type"] };
