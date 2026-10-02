"use client";
import type { Role, Lang, TeamMember } from "./types";
import { ROLES } from "./constants";

// Shared staff PROFILE form for the edit/add modals. Pay terms are deliberately
// not here: they are recorded with an effective date on the terms page, so the
// history is kept and roles never mix with pay.
export function StaffFormFields({ form, onChange, lang, isOwner, pinAccount = false, slug, uid }: {
  form: Partial<TeamMember>; onChange: (v: Partial<TeamMember>) => void; lang: Lang; isOwner: boolean;
  pinAccount?: boolean; slug?: string; uid?: string;
}) {
  const fields: [keyof TeamMember, string, string, string][] = [
    ["name", "Fullt nafn", "Full name", "Jón Jónsson"],
    ["email", "Netfang", "E-mail", "nafn@dæmi.is"],
    ["ssn", "Kennitala", "ID number", "1234567890"],
    ["phone", "Símanúmer", "Phone", "8001234"],
    ["address", "Heimilisfang", "Address", "Laugavegur 1"],
    ["bankName", "Banki", "Bank", "Íslandsbanki"],
    ["bankAccount", "Reikningsnúmer", "Account no.", "0111-26-123456"],
    ["union", "Stéttarfélag", "Union", "Efling"],
    ["pension", "Lífeyrissjóður", "Pension", "Gildi"],
    ["jobTitle", "Starfsheiti", "Job title", "Barþjónn"],
  ];
  // PIN (4-digit) accounts can never be admin/owner.
  const roleOptions = ROLES.filter(r => !pinAccount || r.key === "staff" || r.key === "manager");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {fields.map(([key, is, en, ph]) => (
        <div key={key} className="form-group">
          <label className="form-label" htmlFor={`sf-${key}`}>{lang === "is" ? is : en}</label>
          <input id={`sf-${key}`} className="form-input" placeholder={ph} value={String(form[key] || "")} onChange={e => onChange({ ...form, [key]: e.target.value })} />
        </div>
      ))}
      {isOwner && (
        <div className="form-group">
          <label className="form-label" htmlFor="sf-role">{lang === "is" ? "Aðgangshlutverk í kerfinu" : "Application role"}</label>
          <select id="sf-role" className="form-input" value={form.role || "staff"} onChange={e => onChange({ ...form, role: e.target.value as Role })}>
            {roleOptions.map(r => <option key={r.key} value={r.key}>{lang === "is" ? r.labelIs : r.labelEn}</option>)}
          </select>
          <div className="text-muted" style={{ fontSize: "0.78rem", marginTop: 3 }}>
            {lang === "is" ? "Hlutverk ræður aðgangi, ekki launum. Stjórnunarálag (gr. 1.2.4) er skráð í ráðningarkjörum." : "Role controls access, not pay. The management premium (1.2.4) is recorded in employment terms."}
          </div>
        </div>
      )}
      <div className="form-group">
        <label className="form-label" htmlFor="sf-et">{lang === "is" ? "Ráðningarstig (upplýsingar)" : "Employment type (info)"}</label>
        <select id="sf-et" className="form-input" value={form.employmentType || ""} onChange={e => onChange({ ...form, employmentType: e.target.value })}>
          <option value="">{lang === "is" ? "Veldu..." : "Choose..."}</option>
          <option value="full-time">{lang === "is" ? "Fullt starf" : "Full-time"}</option>
          <option value="part-time">{lang === "is" ? "Hlutastarf" : "Part-time"}</option>
        </select>
      </div>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, fontSize: "0.85rem" }} className="text-secondary">
        💰 {lang === "is" ? "Launakjör (launaflokkur, þrep, vinnufyrirkomulag, starfshlutfall, persónuleg kjör) eru skráð með gildisdegi." : "Pay terms (class, step, arrangement, percentage, personal pay) are recorded with an effective date."}{" "}
        {slug && uid && <a href={`/${slug}/rates?uid=${uid}`}>{lang === "is" ? "Opna kjör →" : "Open terms →"}</a>}
      </div>
    </div>
  );
}
