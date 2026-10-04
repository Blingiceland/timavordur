"use client";
import { useState } from "react";
import type { User } from "firebase/auth";
import { ALL_REG_FIELDS, ALL_REG_FIELD_LABELS, errText } from "./constants";

// Shown to a member whose profile lacks fields the workplace requires — the same
// fields a Google registration asks for. Punching keeps working meanwhile; the
// rest of the portal opens once the server has accepted the missing fields.
export function CompleteProfile({ user, slug, lang, missing, onSaved }: {
  user: User; slug: string; lang: "is" | "en"; missing: string[]; onSaved: () => Promise<void> | void;
}) {
  const is = lang !== "en";
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const label = (k: string) => ALL_REG_FIELD_LABELS[k]?.[is ? 0 : 1] ?? k;
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const textFields = ALL_REG_FIELDS.filter((f) => missing.includes(f.key));
  const askPermit = missing.includes("workPermit");
  const askExpiry = missing.includes("workPermitExpiry") && (!askPermit || form.workPermit === "yes");
  const askType = missing.includes("employmentType");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const body: Record<string, unknown> = {};
    for (const f of textFields) body[f.key] = (form[f.key] ?? "").trim();
    if (askPermit) body.workPermit = form.workPermit === "yes";
    if (askExpiry) body.workPermitExpiry = form.workPermitExpiry ?? "";
    if (askType) body.employmentType = form.employmentType ?? "";
    try {
      const res = await fetch(`/api/${slug}/staff/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { await onSaved(); return; }
      const fields = Array.isArray(d.fields) ? `: ${d.fields.map(label).join(", ")}` : "";
      setErr(`${errText(d.error, lang) || (is ? "Villa" : "Error")}${fields}`);
    } catch {
      setErr(is ? "Netvilla — reyndu aftur" : "Network error — try again");
    } finally { setBusy(false); }
  };

  const choice = (k: string, options: [string, string][]) => (
    <div style={{ display: "flex", gap: 10 }}>
      {options.map(([v, l]) => (
        <label key={v} style={{ flex: 1, textAlign: "center", cursor: "pointer", padding: "10px", borderRadius: "var(--radius-md)", border: `1px solid ${form[k] === v ? "var(--brand)" : "var(--border)"}`, background: form[k] === v ? "var(--brand-glow)" : "transparent" }}>
          <input type="radio" name={k} value={v} checked={form[k] === v} onChange={(e) => set(k, e.target.value)} required style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />{l}
        </label>
      ))}
    </div>
  );

  return (
    <section id="ljuka-skraningu" className="card" aria-labelledby="ljuka-title" style={{ width: "100%", maxWidth: 440, padding: "20px", border: "1px solid #f0a500" }}>
      <h2 id="ljuka-title" style={{ fontSize: "1.05rem", marginBottom: 6 }}>📝 {is ? "Ljúktu skráningunni" : "Complete your registration"}</h2>
      <p className="text-secondary" style={{ fontSize: "0.85rem", marginBottom: 14 }}>
        {is
          ? "Vinnustaðurinn þarf þessar upplýsingar fyrir launavinnslu. Þú getur stimplað þig inn og út á meðan; annað opnast þegar þú hefur vistað."
          : "Your workplace needs this for payroll. You can clock in and out meanwhile; everything else opens once you have saved."}
      </p>
      {err && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.88rem", marginBottom: 12 }}>{err}</div>}
      <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {textFields.map((f) => (
          <div key={f.key} className="form-group">
            <label className="form-label" htmlFor={`cp-${f.key}`}>{is ? f.is : f.en}</label>
            <input id={`cp-${f.key}`} className="form-input" placeholder={is ? f.ph_is : f.ph_en} value={form[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)} required pattern={f.pattern} maxLength={f.maxLength} />
          </div>
        ))}
        {askPermit && <div className="form-group"><span className="form-label">{label("workPermit")}</span>{choice("workPermit", [["yes", is ? "Já" : "Yes"], ["no", is ? "Nei" : "No"]])}</div>}
        {askExpiry && (
          <div className="form-group">
            <label className="form-label" htmlFor="cp-workPermitExpiry">{label("workPermitExpiry")}</label>
            <input id="cp-workPermitExpiry" type="date" className="form-input" value={form.workPermitExpiry ?? ""} onChange={(e) => set("workPermitExpiry", e.target.value)} required />
          </div>
        )}
        {askType && <div className="form-group"><span className="form-label">{label("employmentType")}</span>{choice("employmentType", [["full-time", is ? "Fullt starf" : "Full-time"], ["part-time", is ? "Hlutastarf" : "Part-time"]])}</div>}
        <button type="submit" className="btn btn--primary" disabled={busy} style={{ justifyContent: "center", padding: "12px" }}>
          {busy ? (is ? "Vista..." : "Saving...") : (is ? "Vista" : "Save")}
        </button>
      </form>
    </section>
  );
}
