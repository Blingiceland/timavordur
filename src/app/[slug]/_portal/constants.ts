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
export const EMPTY_STAFF: Partial<TeamMember> = { name: "", ssn: "", phone: "", address: "", bankName: "", bankAccount: "", union: "", pension: "", jobTitle: "", employmentType: "", role: "staff" };
export const REG_FIELDS_DEFAULTS: Record<string, FieldLevel> = { name: "required", ssn: "optional", phone: "optional", address: "optional", bankName: "optional", bankAccount: "optional", union: "optional", pension: "optional", jobTitle: "optional", workPermit: "optional", workPermitExpiry: "optional", employmentType: "optional" };
export const ALL_REG_FIELD_KEYS = ["name", "ssn", "phone", "address", "bankName", "bankAccount", "union", "pension", "workPermit", "workPermitExpiry", "jobTitle", "employmentType"];
export const ALL_REG_FIELD_LABELS: Record<string, [string, string]> = { name: ["Fullt nafn", "Full name"], ssn: ["Kennitala", "ID number"], phone: ["Símanúmer", "Phone"], address: ["Heimilisfang", "Address"], bankName: ["Banki", "Bank"], bankAccount: ["Reikningsnúmer", "Account no."], union: ["Stéttarfélag", "Union"], pension: ["Lífeyrissjóður", "Pension fund"], workPermit: ["Vinnuleyfi", "Work permit"], workPermitExpiry: ["Vinnuleyfi gildir til", "Permit expiry"], jobTitle: ["Starfsheiti", "Job title"], employmentType: ["Ráðningarstig", "Employment type"] };

// ── Server error codes → readable text ──────────────────────────────────────
const ERRORS: Record<string, [string, string]> = {
  invalid_credentials: ["Rangt notendanafn eða PIN", "Wrong username or PIN"],
  too_many_attempts: ["Of margar tilraunir — reyndu aftur síðar", "Too many attempts — try again later"],
  username_taken: ["Notendanafn er þegar í notkun", "Username already taken"],
  invalid_username: ["Ógilt notendanafn (3–30 stafir: a–z, 0–9, . _ -)", "Invalid username (3–30: a–z, 0–9, . _ -)"],
  pin_must_be_4_digits: ["PIN verður að vera 4 tölustafir", "PIN must be 4 digits"],
  ip_restricted: ["Stimplun aðeins leyfð á neti vinnustaðarins", "Punching is only allowed on the workplace network"],
  ip_restriction_misconfigured: ["Netlokun er virk en ekki rétt stillt — hafðu samband við eiganda", "Network restriction is on but misconfigured — contact the owner"],
  client_ip_unknown: ["Ekki tókst að staðfesta netið — stimplun hafnað", "Could not verify your network — punch refused"],
  already_punched_in: ["Þú ert þegar stimplaður inn", "You are already clocked in"],
  not_punched_in: ["Þú ert ekki stimplaður inn", "You are not clocked in"],
  punched_in_elsewhere: ["Þú ert stimplaður inn á hinum staðnum — stimplaðu þig út þar fyrst", "You are clocked in at the other workplace — clock out there first"],
  pin_too_simple: ["Of einfalt PIN (t.d. 1234, 0000, ártal) — veldu annað", "PIN too simple (e.g. 1234, 0000, a year) — choose another"],
  not_admin_in_company: ["Þú hefur ekki stjórnandaréttindi á þeim stað", "You are not an admin at that workplace"],
  invalid_companies: ["Ógilt val á starfsstað", "Invalid workplace selection"],
  invalid_email: ["Ógilt netfang", "Invalid e-mail address"],
  email_required_for_generated_pin: ["Settu inn netfang eða PIN", "Enter an e-mail address or a PIN"],
  not_approved: ["Starfsmaður er ekki samþykktur", "The employee is not approved"],
  concurrent_request: ["Önnur stimplun var í vinnslu — ýttu aftur", "Another punch was in progress — press again"],
  forbidden: ["Þú hefur ekki heimild til þessa", "You are not allowed to do this"],
  server_error: ["Villa á þjóni — ekkert var vistað. Reyndu aftur.", "Server error — nothing was saved. Try again."],
  owner_required: ["Aðeins eigandi getur þetta", "Only the owner can do this"],
  owner_required_for_role: ["Aðeins eigandi getur úthlutað stjórnandahlutverki", "Only the owner can grant admin roles"],
  owner_required_for_target: ["Aðeins eigandi getur breytt stjórnanda", "Only the owner can change an admin"],
  pin_account_role_limit: ["PIN-aðgangur getur ekki fengið stjórnandaréttindi", "PIN accounts cannot hold admin rights"],
  last_owner: ["Ekki má fjarlægja síðasta eiganda", "The last owner cannot be removed"],
  session_revoked: ["Innskráning útrunnin — skráðu þig inn aftur", "Session revoked — please sign in again"],
  wrong_tenant: ["Aðgangur tilheyrir öðru fyrirtæki", "This account belongs to another company"],
  status_missing: ["Aðgangur bíður staðfestingar stjórnanda", "Account awaits confirmation"],
  punches_changed_since_request: ["Stimplanir breyttust eftir að beiðnin var send — skoðaðu aftur", "Punches changed since the request — please re-check"],
  shift_changed_since_request: ["Vaktin breyttist eftir að beiðnin var send", "The shift changed since the request"],
  period_locked: ["Tímabilið er læst — notaðu leiðréttingarfærslu í launavinnslu", "Period is locked — use a payroll adjustment"],
  future_time: ["Tími má ekki vera í framtíð", "Time cannot be in the future"],
  already_resolved: ["Beiðnin hefur þegar verið afgreidd", "Already resolved"],
  not_your_shift: ["Þetta er ekki þín vakt", "Not your shift"],
  cannot_approve_own: ["Þú getur ekki samþykkt eigin beiðni", "You cannot approve your own request"],
};

export function errText(code: unknown, lang: Lang, retryAfter?: number): string {
  if (typeof code !== "string") return "";
  const e = ERRORS[code];
  const base = e ? e[lang === "is" ? 0 : 1] : code.startsWith("field_not_allowed") || code.includes(":") ? `${lang === "is" ? "Ógilt gildi" : "Invalid value"}: ${code}` : code;
  if (code === "too_many_attempts" && retryAfter) return `${base} (${Math.ceil(retryAfter / 60)} ${lang === "is" ? "mín." : "min"})`;
  return base;
}

const PROFILE_KEYS = ["name", "email", "phone", "address", "ssn", "bankName", "bankAccount", "union", "pension", "workPermit", "workPermitExpiry", "jobTitle", "employmentType", "language"] as const;

/** Only the allow-listed profile fields (the server rejects anything else). */
export function profilePayload(form: Partial<TeamMember>, includeUsername: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of PROFILE_KEYS) {
    const v = (form as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  if (includeUsername && form.username) out.username = form.username;
  return out;
}
