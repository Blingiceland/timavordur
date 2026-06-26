"use client";
import type { Role, Lang, TeamMember } from "./types";
import { ROLES } from "./constants";

// Shared staff detail/pay form used by both the "edit staff" and "add staff" modals.
export function StaffFormFields({ form, onChange, lang, isOwner }: { form: Partial<TeamMember>; onChange: (v: Partial<TeamMember>) => void; lang: Lang; isOwner: boolean }) {
  const fields: [keyof TeamMember, string, string, string][] = [
    ["name", "Fullt nafn", "Full name", "Jón Jónsson"],
    ["ssn", "Kennitala", "ID number", "1234567890"],
    ["phone", "Símanúmer", "Phone", "8001234"],
    ["address", "Heimilisfang", "Address", "Laugavegur 1"],
    ["bankName", "Banki", "Bank", "Íslandsbanki"],
    ["bankAccount", "Reikningsnúmer", "Account no.", "0111-26-123456"],
    ["union", "Stéttarfélag", "Union", "VR"],
    ["pension", "Lífeyrissjóður", "Pension", "Gildi"],
    ["jobTitle", "Starfsheiti", "Job title", "Barþjónn"],
  ];
  const payType = (form as Record<string, unknown>).payType as string || "hourly";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {fields.map(([key, is, en, ph]) => (
        <div key={key} className="form-group">
          <label className="form-label">{lang === "is" ? is : en}</label>
          <input className="form-input" placeholder={ph} value={String(form[key] || "")} onChange={e => onChange({ ...form, [key]: e.target.value })} />
        </div>
      ))}
      {isOwner && (
        <div className="form-group">
          <label className="form-label">{lang === "is" ? "Hlutverk" : "Role"}</label>
          <select className="form-input" value={form.role || "staff"} onChange={e => onChange({ ...form, role: e.target.value as Role })}>
            {ROLES.map(r => <option key={r.key} value={r.key}>{lang === "is" ? r.labelIs : r.labelEn}</option>)}
          </select>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">{lang === "is" ? "Ráðningarstig" : "Employment type"}</label>
        <select className="form-input" value={form.employmentType || ""} onChange={e => onChange({ ...form, employmentType: e.target.value })}>
          <option value="">{lang === "is" ? "Veldu..." : "Choose..."}</option>
          <option value="full-time">{lang === "is" ? "Fullt starf" : "Full-time"}</option>
          <option value="part-time">{lang === "is" ? "Hlutastarf" : "Part-time"}</option>
        </select>
      </div>

      {/* ── Pay settings ── */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "4px" }}>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
          {lang === "is" ? "💰 Launastillingar" : "💰 Pay settings"}
        </div>
        <div className="form-group" style={{ marginBottom: "10px" }}>
          <label className="form-label">{lang === "is" ? "Launamáti" : "Pay type"}</label>
          <select className="form-input" value={payType} onChange={e => onChange({ ...form, ...{ payType: e.target.value } } as Partial<TeamMember>)}>
            <option value="hourly">{lang === "is" ? "Tímakaup" : "Hourly"}</option>
            <option value="monthly">{lang === "is" ? "Föst mánaðarlaun" : "Fixed monthly"}</option>
            <option value="averaged">{lang === "is" ? "Jafnaðarkaup" : "Averaged pay"}</option>
          </select>
        </div>
        {(payType === "hourly" || payType === "averaged") && (
          <div className="form-group" style={{ marginBottom: "10px" }}>
            <label className="form-label">{lang === "is" ? "Grunnkaup (kr/klst)" : "Base rate (ISK/hr)"}</label>
            <input type="number" className="form-input" placeholder="1800" min={0}
              value={String((form as Record<string, unknown>).hourlyRate || "")}
              onChange={e => onChange({ ...form, ...{ hourlyRate: parseInt(e.target.value) || 0 } } as Partial<TeamMember>)} />
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "3px" }}>
              {lang === "is" ? "Lágmarkskaup Efling/SA 2025: ~1.782 kr/klst" : "Efling/SA minimum 2025: ~ISK 1,782/hr"}
            </div>
          </div>
        )}
        {(payType === "monthly" || payType === "averaged") && (
          <div className="form-group" style={{ marginBottom: "10px" }}>
            <label className="form-label">{lang === "is" ? payType === "monthly" ? "Mánaðarlaun (kr)" : "Jafnaðarkaup (kr/mán)" : payType === "monthly" ? "Monthly salary (ISK)" : "Averaged monthly (ISK)"}</label>
            <input type="number" className="form-input" placeholder="450000" min={0}
              value={String((form as Record<string, unknown>).monthlyRate || "")}
              onChange={e => onChange({ ...form, ...{ monthlyRate: parseInt(e.target.value) || 0 } } as Partial<TeamMember>)} />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">{lang === "is" ? "Kjarasamningur" : "Collective agreement"}</label>
          <select className="form-input" value={String((form as Record<string, unknown>).collectiveAgreement || "efling_sa")} onChange={e => onChange({ ...form, ...{ collectiveAgreement: e.target.value } } as Partial<TeamMember>)}>
            <option value="efling_sa">Efling / SA — {lang === "is" ? "Veitingastaðir" : "Restaurants"}</option>
            <option value="custom">{lang === "is" ? "Sérstakur samningur" : "Custom agreement"}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
