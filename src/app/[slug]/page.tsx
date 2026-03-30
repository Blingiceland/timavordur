"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { useTheme } from "@/lib/theme";

type Role = "staff" | "manager" | "admin" | "owner";
type Status = "pending" | "approved" | "rejected";
type FieldLevel = "required" | "optional" | "hidden";

interface TeamMember { uid: string; name: string; email: string; role: Role; status: Status; isPunchedIn: boolean; todayHours: number; ssn?: string; phone?: string; address?: string; bankName?: string; bankAccount?: string; union?: string; pension?: string; workPermit?: boolean | null; workPermitExpiry?: string; jobTitle?: string; employmentType?: string; addedAt?: string; }
interface PortalData { registered: boolean; status?: Status; role?: Role; name?: string; companyName?: string; isPunchedIn?: boolean; todayHours?: number; periodHours?: number; shifts?: number; team?: TeamMember[]; staffList?: TeamMember[]; registrationFields?: Record<string, FieldLevel>; requireApproval?: boolean; }

const ROLES: { key: Role; labelIs: string; labelEn: string; color: string }[] = [
  { key: "staff", labelIs: "Starfsmaður", labelEn: "Staff", color: "var(--text-secondary)" },
  { key: "manager", labelIs: "Vaktstjóri", labelEn: "Manager", color: "var(--brand-light)" },
  { key: "admin", labelIs: "Stjórnandi", labelEn: "Admin", color: "var(--accent)" },
  { key: "owner", labelIs: "Eigandi", labelEn: "Owner", color: "#f0a500" },
];
const roleLabel = (r: Role, lang: "is" | "en") => ROLES.find(x => x.key === r)?.[lang === "is" ? "labelIs" : "labelEn"] || r;
const roleColor = (r: Role) => ROLES.find(x => x.key === r)?.color || "var(--text-secondary)";
const atLeast = (role: Role, min: Role) => ({ staff: 1, manager: 2, admin: 3, owner: 4 }[role] >= { staff: 1, manager: 2, admin: 3, owner: 4 }[min]);

const ALL_REG_FIELDS = [
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

const T = {
  is: { loading: "Hleður...", signIn: "Innskrá með Google", signOut: "Útskrá", langBtn: "🇮🇸", punchIn: "KLUKKA INN", punchOut: "KLUKKA ÚT", today: "Í dag", period: "Þetta tímabil", shifts: "Vaktir", pending: "Skráning í bið", pendingMsg: "Stjórnandi þarf að samþykkja þig.", rejected: "Skráningu hafnað", rejectedMsg: "Hafðu samband við stjórnanda.", tabClock: "Klukka", tabTeam: "Lið", tabStaff: "Starfsmenn", tabSettings: "Stillingar", regTitle: "Nýskráning", regBtn: "Senda", required: "skyldulegt", statusIn: "● Inni", statusOut: "○ Úti", approve: "✓ Samþykkja", reject: "✕ Hafna", edit: "Breyta", delete: "Eyða", addStaff: "+ Bæta við", saveRole: "Vista hlutverk", role: "Hlutverk", save: "Vista", saving: "Vista...", saved: "✅ Vistað!" },
  en: { loading: "Loading...", signIn: "Sign in with Google", signOut: "Sign out", langBtn: "🇬🇧", punchIn: "CLOCK IN", punchOut: "CLOCK OUT", today: "Today", period: "This period", shifts: "Shifts", pending: "Registration pending", pendingMsg: "Waiting for manager approval.", rejected: "Registration rejected", rejectedMsg: "Please contact your manager.", tabClock: "Clock", tabTeam: "Team", tabStaff: "Staff", tabSettings: "Settings", regTitle: "Registration", regBtn: "Submit", required: "required", statusIn: "● In", statusOut: "○ Out", approve: "✓ Approve", reject: "✕ Reject", edit: "Edit", delete: "Delete", addStaff: "+ Add staff", saveRole: "Save role", role: "Role", save: "Save", saving: "Saving...", saved: "✅ Saved!" },
};

type Lang = "is" | "en";
type Tab = "clock" | "team" | "staff" | "settings";

const EMPTY_REG: Record<string, string> = { name: "", ssn: "", phone: "", address: "", bankName: "", bankAccount: "", union: "", pension: "", jobTitle: "", workPermit: "", workPermitExpiry: "", employmentType: "" };
const EMPTY_STAFF: Partial<TeamMember> = { name: "", email: "", ssn: "", phone: "", address: "", bankName: "", bankAccount: "", union: "", pension: "", jobTitle: "", employmentType: "", role: "staff" };
const REG_FIELDS_DEFAULTS: Record<string, FieldLevel> = { name: "required", ssn: "optional", phone: "optional", address: "optional", bankName: "optional", bankAccount: "optional", union: "optional", pension: "optional", jobTitle: "optional", workPermit: "optional", workPermitExpiry: "optional", employmentType: "optional" };
const ALL_REG_FIELD_KEYS = ["name", "ssn", "phone", "address", "bankName", "bankAccount", "union", "pension", "workPermit", "workPermitExpiry", "jobTitle", "employmentType"];
const ALL_REG_FIELD_LABELS: Record<string, [string, string]> = { name: ["Fullt nafn","Full name"], ssn: ["Kennitala","ID number"], phone: ["Símanúmer","Phone"], address: ["Heimilisfang","Address"], bankName: ["Banki","Bank"], bankAccount: ["Reikningsnúmer","Account no."], union: ["Stéttarfélag","Union"], pension: ["Lífeyrissjóður","Pension fund"], workPermit: ["Vinnuleyfi","Work permit"], workPermitExpiry: ["Vinnuleyfi gildir til","Permit expiry"], jobTitle: ["Starfsheiti","Job title"], employmentType: ["Ráðningarstig","Employment type"] };

export default function CompanyPortal() {
  const { slug } = useParams() as { slug: string };
  const [lang, setLang] = useState<Lang | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [portal, setPortal] = useState<PortalData | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("clock");
  const [punching, setPunching] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  // Registration
  const [regForm, setRegForm] = useState<Record<string, string>>(EMPTY_REG);
  const [regSubmitting, setRegSubmitting] = useState(false);
  // Staff management
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState<Partial<TeamMember>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<Partial<TeamMember>>(EMPTY_STAFF);
  const [saving, setSaving] = useState(false);
  // Settings
  const [regFields, setRegFields] = useState<Record<string, FieldLevel>>(REG_FIELDS_DEFAULTS);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [portalError, setPortalError] = useState("");
  const { theme, toggle: toggleTheme } = useTheme();

  const t = T[lang || "is"];

  useEffect(() => {
    const saved = localStorage.getItem(`tv_lang_${slug}`) as Lang | null;
    if (saved) setLang(saved);
  }, [slug]);

  const chooseLang = (l: Lang) => { setLang(l); localStorage.setItem(`tv_lang_${slug}`, l); };

  useEffect(() => { return onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); }); }, []);

  const fetchPortal = useCallback(async () => {
    if (!user) return;
    setPortalLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/portal`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (res.ok) {
        setPortal(d);
        if (d.registrationFields) setRegFields({ ...REG_FIELDS_DEFAULTS, ...d.registrationFields });
        if (!d.registered) setRegForm(f => ({ ...f, name: user.displayName || "" }));
      } else {
        console.error("[portal GET error]", res.status, d);
        setPortalError(d.error || `Villa ${res.status}`);
      }
    } catch (e) { console.error("[portal fetch crash]", e); setPortalError("Netvillla — reyndu aftur"); } finally { setPortalLoading(false); }
  }, [user, slug]);

  useEffect(() => { if (user) fetchPortal(); }, [user, fetchPortal]);

  const showMsg = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  const doPunch = async () => {
    if (!user) return;
    setPunching(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/portal`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({}) });
      const d = await res.json();
      if (res.ok) { showMsg(d.type === "in" ? (lang === "en" ? `✅ Clocked in at ${d.time}` : `✅ Klukkaðir inn ${d.time}`) : (lang === "en" ? `👋 Clocked out at ${d.time}` : `👋 Klukkaðir út ${d.time}`)); await fetchPortal(); }
      else showMsg(d.error === "ip_restricted" ? (lang === "en" ? "❌ Must be on company WiFi" : "❌ Verður að vera á Wi-Fi vinnustaðarins") : d.error || (lang === "en" ? "Error" : "Villa"), false);
    } catch { showMsg(lang === "en" ? "Network error" : "Netvillla", false); } finally { setPunching(false); }
  };

  const doPortalAction = async (method: string, body: object, successMsg: string) => {
    if (!user) return false;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/portal`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const d = await res.json();
      if (res.ok) { showMsg(successMsg); await fetchPortal(); setEditMember(null); setShowAdd(false); return true; }
      else { showMsg(d.error || (lang === "en" ? "Error" : "Villa"), false); return false; }
    } catch { showMsg(lang === "en" ? "Network error" : "Netvillla", false); return false; }
    finally { setSaving(false); }
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setRegSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/staff/register`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...regForm, language: lang, workPermit: regForm.workPermit === "yes" }) });
      const d = await res.json();
      if (res.ok) await fetchPortal();
      else showMsg(d.error || "Villa", false);
    } catch { showMsg("Netvillla", false); } finally { setRegSubmitting(false); }
  };

  const saveSettings = async () => {
    if (!user) return;
    setSettingsSaving(true);
    try {
      const token = await user.getIdToken();
      await fetch(`/api/${slug}/admin/settings`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ registrationFields: regFields }) });
      setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 3000);
    } catch { /* ignore */ } finally { setSettingsSaving(false); }
  };

  // ─── Language picker ───────────────────────────────────────────────────────
  if (!lang) return (
    <div className="page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "32px" }}>
      <div className="navbar__logo" style={{ fontSize: "1.4rem" }}>⏱ Tíma<span>vörður</span></div>
      {portal?.companyName && <div className="text-secondary">{portal.companyName}</div>}
      <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>Veldu tungumál / Choose language</p>
      <div style={{ display: "flex", gap: "24px" }}>
        {([["is", "🇮🇸", "Íslenska"], ["en", "🇬🇧", "English"]] as const).map(([code, flag, label]) => (
          <button key={code} onClick={() => chooseLang(code)} className="card"
            style={{ padding: "32px 40px", cursor: "pointer", textAlign: "center", border: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", transition: "all 0.2s" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--brand)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
            <span style={{ fontSize: "3.5rem" }}>{flag}</span>
            <span style={{ fontWeight: 600 }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // ─── Loading / auth ────────────────────────────────────────────────────────
  if (authLoading || (user && portalLoading && !portal)) return (
    <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="text-muted">{t.loading}</div>
    </div>
  );

  const Navbar = () => (
    <nav className="navbar">
      <div className="container navbar__inner">
        <div className="navbar__logo">⏱ Tíma<span>vörður</span>
          {portal?.companyName && <span className="text-secondary" style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.9rem", marginLeft: "8px" }}>· {portal.companyName}</span>}
          {portal?.role && portal.role !== "staff" && <span className="badge" style={{ marginLeft: "8px", fontSize: "0.7rem", background: "rgba(255,255,255,0.08)", color: roleColor(portal.role) }}>{roleLabel(portal.role, lang)}</span>}
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          {/* Language flags */}
          <div style={{ display: "flex", gap: "2px", alignItems: "center", background: "var(--bg-surface)", borderRadius: "var(--radius-md)", padding: "3px", border: "1px solid var(--border)" }}>
            {(([["is", "🇮🇸"], ["en", "🇬🇧"]] as const)).map(([code, flag]) => (
              <button key={code} onClick={() => chooseLang(code)}
                style={{ fontSize: "1.25rem", padding: "3px 8px", borderRadius: "var(--radius-sm)", border: lang === code ? "1px solid var(--brand)" : "1px solid transparent", cursor: "pointer", background: lang === code ? "var(--brand-glow)" : "transparent", opacity: lang === code ? 1 : 0.55, transition: "all 0.2s", lineHeight: 1 }}>
                {flag}
              </button>
            ))}
          </div>
          {/* Theme toggle */}
          <button onClick={toggleTheme}
            style={{ display: "flex", alignItems: "center", gap: "5px", padding: "5px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--bg-surface)", cursor: "pointer", fontSize: "0.78rem", color: "var(--text-secondary)", transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}>
            <span style={{ fontSize: "0.95rem" }}>{theme === "dark" ? "☀️" : "🌙"}</span>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}>{lang === "en" ? (theme === "dark" ? "Light" : "Dark") : (theme === "dark" ? "Ljóst" : "Dökkt")}</span>
          </button>
          {user && <button className="btn btn--ghost btn--sm" onClick={() => signOut(auth)}>{t.signOut}</button>}
        </div>
      </div>
    </nav>
  );

  // ─── Not signed in ─────────────────────────────────────────────────────────
  if (!user) return (
    <div className="page" style={{ minHeight: "100vh" }}><Navbar />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)" }}>
        <div className="card" style={{ maxWidth: "400px", width: "100%", padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "16px" }}>⏱</div>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "8px" }}>{portal?.companyName || "Tímavörður"}</h2>
          <p className="text-secondary" style={{ fontSize: "0.9rem", marginBottom: "32px" }}>{lang === "is" ? "Skráðu þig inn til að halda áfram" : "Sign in to continue"}</p>
          <button onClick={() => signInWithPopup(auth, googleProvider)} className="btn btn--primary" style={{ width: "100%", justifyContent: "center", gap: "12px", fontSize: "1rem" }}>
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            {t.signIn}
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Not registered ────────────────────────────────────────────────────────
  if (portal && !portal.registered) {
    const rf = portal.registrationFields || REG_FIELDS_DEFAULTS;
    const show = (k: string) => (rf[k] || "optional") !== "hidden";
    const isReq = (k: string) => rf[k] === "required";
    return (
      <div className="page" style={{ minHeight: "100vh" }}><Navbar />
        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 24px" }}>
          {user.photoURL && <div style={{ textAlign: "center", marginBottom: "24px" }}><img src={user.photoURL} alt="" style={{ width: 56, height: 56, borderRadius: "50%", border: "2px solid var(--border)" }} /><div style={{ fontWeight: 600, marginTop: "8px" }}>{user.displayName}</div><div className="text-secondary" style={{ fontSize: "0.85rem" }}>{user.email}</div></div>}
          <div className="card card--brand" style={{ marginBottom: "24px" }}><h1 style={{ fontSize: "1.3rem" }}>{t.regTitle}</h1></div>
          {msg && <div style={{ background: msg.ok ? "var(--accent-glow)" : "rgba(255,77,106,0.1)", border: `1px solid ${msg.ok ? "rgba(0,212,170,0.3)" : "rgba(255,77,106,0.3)"}`, borderRadius: "var(--radius-md)", padding: "12px 16px", color: msg.ok ? "var(--accent)" : "var(--danger)", marginBottom: "16px" }}>{msg.text}</div>}
          <form onSubmit={doRegister} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {ALL_REG_FIELDS.filter(f => show(f.key)).map(f => (
              <div key={f.key} className="form-group">
                <label className="form-label">{lang === "en" ? f.en : f.is} {isReq(f.key) && <span style={{ color: "var(--danger)", fontSize: "0.78rem" }}>* {t.required}</span>}</label>
                <input className="form-input" placeholder={lang === "en" ? f.ph_en : f.ph_is} value={regForm[f.key] || ""} onChange={e => setRegForm(v => ({ ...v, [f.key]: e.target.value }))} required={isReq(f.key)} pattern={f.pattern} maxLength={f.maxLength} />
              </div>
            ))}
            {show("workPermit") && <div className="form-group">
              <label className="form-label">{lang === "is" ? "Vinnuleyfi?" : "Work permit?"}</label>
              <div style={{ display: "flex", gap: "10px" }}>
                {[["yes", lang === "is" ? "Já" : "Yes"], ["no", lang === "is" ? "Nei" : "No"]].map(([v, l]) => (
                  <label key={v} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "8px 16px", borderRadius: "var(--radius-md)", border: `1px solid ${regForm.workPermit === v ? "var(--brand)" : "var(--border)"}`, background: regForm.workPermit === v ? "var(--brand-glow)" : "transparent", transition: "all 0.15s" }}>
                    <input type="radio" name="wp" value={v} checked={regForm.workPermit === v} onChange={e => setRegForm(f => ({ ...f, workPermit: e.target.value }))} style={{ display: "none" }} />{l}
                  </label>
                ))}
              </div>
            </div>}
            {show("workPermitExpiry") && regForm.workPermit === "yes" && <div className="form-group"><label className="form-label">{lang === "is" ? "Gildir til" : "Valid until"}</label><input type="date" className="form-input" value={regForm.workPermitExpiry} onChange={e => setRegForm(f => ({ ...f, workPermitExpiry: e.target.value }))} /></div>}
            {show("employmentType") && <div className="form-group">
              <label className="form-label">{lang === "is" ? "Ráðningarstig" : "Employment type"}</label>
              <div style={{ display: "flex", gap: "10px" }}>
                {[["full-time", lang === "is" ? "Fullt starf" : "Full-time"], ["part-time", lang === "is" ? "Hlutastarfa" : "Part-time"]].map(([v, l]) => (
                  <label key={v} style={{ flex: 1, textAlign: "center", cursor: "pointer", padding: "10px", borderRadius: "var(--radius-md)", border: `1px solid ${regForm.employmentType === v ? "var(--brand)" : "var(--border)"}`, background: regForm.employmentType === v ? "var(--brand-glow)" : "transparent", transition: "all 0.15s" }}>
                    <input type="radio" name="et" value={v} checked={regForm.employmentType === v} onChange={e => setRegForm(f => ({ ...f, employmentType: e.target.value }))} style={{ display: "none" }} />{l}
                  </label>
                ))}
              </div>
            </div>}
            <button type="submit" className="btn btn--primary" style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "1rem" }} disabled={regSubmitting}>{regSubmitting ? t.saving : t.regBtn}</button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Pending / Rejected ────────────────────────────────────────────────────
  if (portal?.status === "pending" || portal?.status === "rejected") {
    const isPending = portal.status === "pending";
    return (
      <div className="page" style={{ minHeight: "100vh" }}><Navbar />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)" }}>
          <div className="card" style={{ maxWidth: "420px", width: "100%", padding: "48px", textAlign: "center" }}>
            <div style={{ fontSize: "3.5rem", marginBottom: "16px" }}>{isPending ? "⏳" : "❌"}</div>
            <h2 style={{ fontSize: "1.3rem", marginBottom: "8px" }}>{isPending ? t.pending : t.rejected}</h2>
            <p className="text-secondary" style={{ marginBottom: "24px" }}>{isPending ? t.pendingMsg : t.rejectedMsg}</p>
            <button className="btn btn--ghost btn--sm" onClick={() => signOut(auth)}>{t.signOut}</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main portal ───────────────────────────────────────────────────────────
  if (!portal?.role) return (
    <div className="page" style={{ minHeight: "100vh" }}><Navbar />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)" }}>
        <div className="card" style={{ maxWidth: "420px", width: "100%", padding: "40px", textAlign: "center" }}>
          {portalError ? (
            <>
              <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>⚠️</div>
              <h2 style={{ fontSize: "1.1rem", marginBottom: "8px", color: "var(--danger)" }}>Villa</h2>
              <p className="text-secondary" style={{ fontSize: "0.88rem", marginBottom: "20px" }}>{portalError}</p>
              <button className="btn btn--primary" onClick={fetchPortal}>Reyna aftur</button>
            </>
          ) : (
            <div className="text-muted">{t.loading}</div>
          )}
        </div>
      </div>
    </div>
  );
  const role = portal.role;
  const canSeeTeam = atLeast(role, "manager");
  const canManage = atLeast(role, "admin");
  const isOwner = role === "owner";
  const now = new Date();
  const dateStr = now.toLocaleDateString(lang === "en" ? "en-GB" : "is-IS", { weekday: "long", day: "numeric", month: "long" });
  const staffAll = portal.staffList || [];
  const pendingStaff = staffAll.filter(s => s.status === "pending");

  const tabs: { key: Tab; label: string }[] = (
    [
      { key: "clock" as Tab, label: t.tabClock, show: true },
      { key: "team" as Tab, label: t.tabTeam, show: canSeeTeam },
      { key: "staff" as Tab, label: t.tabStaff, show: canManage },
      { key: "settings" as Tab, label: t.tabSettings, show: isOwner },
    ] as { key: Tab; label: string; show: boolean }[]
  ).filter(tb => tb.show).map(({ key, label }) => ({ key, label }));

  return (
    <div className="page" style={{ minHeight: "100vh" }}><Navbar />
      <div className="container" style={{ padding: "32px 24px" }}>
        {/* Message */}
        {msg && <div style={{ background: msg.ok ? "var(--accent-glow)" : "rgba(255,77,106,0.1)", border: `1px solid ${msg.ok ? "rgba(0,212,170,0.3)" : "rgba(255,77,106,0.3)"}`, borderRadius: "var(--radius-md)", padding: "12px 16px", color: msg.ok ? "var(--accent)" : "var(--danger)", marginBottom: "16px", fontSize: "0.9rem" }}>{msg.text}</div>}

        {/* Registration link (admin+) */}
        {canManage && (
          <div className="card card--brand" style={{ marginBottom: "24px", padding: "16px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>🔗 {lang === "is" ? "Skráningarhlekkur" : "Registration link"}</div>
                <code style={{ fontSize: "0.88rem", color: "var(--brand-light)" }}>{typeof window !== "undefined" ? window.location.origin : ""}/<strong>{slug}</strong></code>
              </div>
              <button className="btn btn--primary btn--sm" style={{ whiteSpace: "nowrap" }} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/${slug}`); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>
                {copied ? "✅ Afritað!" : "📋 Afrita"}
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        {tabs.length > 1 && (
          <div style={{ display: "flex", gap: "4px", marginBottom: "24px", background: "var(--bg-surface)", padding: "4px", borderRadius: "var(--radius-md)", width: "fit-content" }}>
            {tabs.map(tb => (
              <button key={tb.key} onClick={() => setTab(tb.key)} className={`btn btn--sm ${tab === tb.key ? "btn--primary" : "btn--ghost"}`}>
                {tb.label}
                {tb.key === "staff" && pendingStaff.length > 0 && <span style={{ marginLeft: "6px", background: tab === tb.key ? "rgba(255,255,255,0.2)" : "var(--border)", borderRadius: "20px", padding: "1px 7px", fontSize: "0.75rem" }}>{pendingStaff.length}</span>}
              </button>
            ))}
          </div>
        )}

        {/* ── CLOCK TAB ──────────────────────────────────────────────────── */}
        {tab === "clock" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "28px", paddingTop: "20px" }}>
            <div style={{ textAlign: "center" }}>
              {user.photoURL && <img src={user.photoURL} alt="" style={{ width: 64, height: 64, borderRadius: "50%", marginBottom: "12px", border: "2px solid var(--border)" }} />}
              <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{portal.name || user.displayName}</div>
              <div className="text-secondary" style={{ fontSize: "0.85rem" }}>{dateStr}</div>
            </div>
            <button onClick={doPunch} disabled={punching} className={`punch-btn ${portal.isPunchedIn ? "punch-btn--out" : ""}`}>
              <span style={{ fontSize: "1.8rem" }}>{portal.isPunchedIn ? "⏹" : "▶"}</span>
              <span>{punching ? "..." : portal.isPunchedIn ? t.punchOut : t.punchIn}</span>
            </button>
            <div style={{ display: "flex", gap: "40px" }}>
              {[[portal.periodHours?.toFixed(1) + "h", t.period, "var(--accent)"], [portal.todayHours?.toFixed(1) + "h", t.today, "var(--text-primary)"], [String(portal.shifts), t.shifts, "var(--brand-light)"]].map(([v, l, c]) => (
                <div key={l} style={{ textAlign: "center" }}><div style={{ fontSize: "1.8rem", color: c, fontWeight: 700 }}>{v}</div><div className="text-muted" style={{ fontSize: "0.82rem" }}>{l}</div></div>
              ))}
            </div>
            <a href={`/${slug}/staff/timesheets`} className="btn btn--secondary btn--sm">{lang === "is" ? "Tímaskráningar" : "Timesheets"}</a>
          </div>
        )}

        {/* ── TEAM TAB ───────────────────────────────────────────────────── */}
        {tab === "team" && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table">
              <thead><tr><th>{lang === "is" ? "Nafn" : "Name"}</th><th>{lang === "is" ? "Hlutverk" : "Role"}</th><th>{lang === "is" ? "Staða" : "Status"}</th><th>{lang === "is" ? "Í dag" : "Today"}</th></tr></thead>
              <tbody>
                {(portal.team || []).filter(m => m.status === "approved").map(m => (
                  <tr key={m.uid}>
                    <td><div style={{ fontWeight: 500 }}>{m.name}</div><div className="text-muted" style={{ fontSize: "0.78rem" }}>{m.email}</div></td>
                    <td><span style={{ color: roleColor(m.role), fontSize: "0.85rem" }}>{roleLabel(m.role, lang)}</span></td>
                    <td><span className={`badge ${m.isPunchedIn ? "badge--success" : ""}`} style={!m.isPunchedIn ? { color: "var(--text-muted)" } : {}}>{m.isPunchedIn ? t.statusIn : t.statusOut}</span></td>
                    <td>{m.todayHours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── STAFF MANAGEMENT TAB ───────────────────────────────────────── */}
        {tab === "staff" && canManage && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
              <p className="text-secondary" style={{ fontSize: "0.9rem" }}>{staffAll.length} {lang === "is" ? "skráð" : "registered"}{pendingStaff.length > 0 && <span style={{ color: "#f0a500", marginLeft: "8px" }}>· {pendingStaff.length} {lang === "is" ? "í bið" : "pending"}</span>}</p>
              <button className="btn btn--primary" onClick={() => { setShowAdd(true); setAddForm(EMPTY_STAFF); }}>{t.addStaff}</button>
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="table">
                <thead><tr><th>{lang === "is" ? "Nafn" : "Name"}</th><th>{lang === "is" ? "Hlutverk" : "Role"}</th><th>{lang === "is" ? "Staða" : "Status"}</th><th></th></tr></thead>
                <tbody>
                  {staffAll.length === 0 ? <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "32px" }}>{lang === "is" ? "Enginn starfsmaður" : "No staff yet"}</td></tr>
                    : staffAll.map(s => (
                      <tr key={s.uid}>
                        <td><div style={{ fontWeight: 500 }}>{s.name}</div><div className="text-muted" style={{ fontSize: "0.78rem" }}>{s.email}</div></td>
                        <td><span style={{ color: roleColor(s.role), fontSize: "0.85rem" }}>{roleLabel(s.role, lang)}</span></td>
                        <td>{s.status === "pending" ? <span className="badge" style={{ background: "rgba(255,180,0,0.15)", color: "#f0a500", border: "1px solid rgba(255,180,0,0.3)" }}>⏳ {lang === "is" ? "Í bið" : "Pending"}</span> : s.status === "rejected" ? <span className="badge badge--danger">✕</span> : <span className="badge badge--success">✓</span>}</td>
                        <td>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            {s.status === "pending" && <>
                              <button className="btn btn--sm" style={{ background: "rgba(0,212,170,0.1)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.3)" }} onClick={() => doPortalAction("PATCH", { uid: s.uid, action: "approve" }, "✅ Samþykkt!")} disabled={saving}>{t.approve}</button>
                              <button className="btn btn--sm" style={{ background: "rgba(255,77,106,0.1)", color: "var(--danger)", border: "1px solid rgba(255,77,106,0.3)" }} onClick={() => doPortalAction("PATCH", { uid: s.uid, action: "reject" }, "Hafnað")} disabled={saving}>{t.reject}</button>
                            </>}
                            <button className="btn btn--secondary btn--sm" onClick={() => { setEditMember(s); setEditForm({ ...s }); }}>{t.edit}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── SETTINGS TAB (owner only) ───────────────────────────────────── */}
        {tab === "settings" && isOwner && (
          <div style={{ maxWidth: "640px" }}>
            <div className="card" style={{ padding: "28px", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "1.05rem", marginBottom: "6px" }}>{lang === "is" ? "Skráningarreitir" : "Registration fields"}</h2>
              <p className="text-secondary" style={{ fontSize: "0.85rem", marginBottom: "20px" }}>{lang === "is" ? "Veldu hvaða upplýsingar starfsmenn fylla út við skráningu" : "Choose which fields staff fill in when registering"}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "0", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
                <div style={{ display: "contents" }}>
                  {["", lang === "is" ? "Skyldugur" : "Required", lang === "is" ? "Valfrjáls" : "Optional", lang === "is" ? "Falinn" : "Hidden"].map((h, i) => (
                    <div key={i} style={{ padding: "8px 12px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i > 0 ? "center" : "left" }}>{h}</div>
                  ))}
                </div>
                {ALL_REG_FIELD_KEYS.map((key, i) => {
                  const cur = regFields[key] || "optional";
                  return (
                    <div key={key} style={{ display: "contents" }}>
                      <div style={{ padding: "10px 12px", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "0.88rem" }}>
                        {ALL_REG_FIELD_LABELS[key]?.[lang === "is" ? 0 : 1]}
                      </div>
                      {(["required", "optional", "hidden"] as FieldLevel[]).map(level => (
                        <div key={level} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <input type="radio" name={`rf-${key}`} checked={cur === level} onChange={() => setRegFields(f => ({ ...f, [key]: level }))} style={{ accentColor: "var(--brand)", width: "16px", height: "16px", cursor: "pointer" }} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "20px" }}>
                <button className="btn btn--primary" onClick={saveSettings} disabled={settingsSaving}>{settingsSaving ? t.saving : t.save}</button>
                {settingsSaved && <span style={{ color: "var(--accent)", fontSize: "0.9rem" }}>{t.saved}</span>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Edit Staff Modal ──────────────────────────────────────────────── */}
      {editMember && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "24px" }} onClick={e => { if (e.target === e.currentTarget) setEditMember(null); }}>
          <div className="card" style={{ maxWidth: "520px", width: "100%", padding: "28px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.1rem" }}>{lang === "is" ? "Breyta" : "Edit"}: {editMember.name}</h2>
              <button className="btn btn--ghost btn--sm" onClick={() => setEditMember(null)}>✕</button>
            </div>
            <StaffFormFields form={editForm} onChange={setEditForm} lang={lang} isOwner={isOwner} />
            <div style={{ display: "flex", gap: "8px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn--primary" style={{ flex: 1, justifyContent: "center" }} disabled={saving} onClick={() => doPortalAction("PATCH", { uid: editMember.uid, action: "update", updates: editForm }, "✅ Vistað!")}>{saving ? t.saving : t.save}</button>
              <button className="btn btn--sm" style={{ background: "rgba(255,77,106,0.1)", color: "var(--danger)", border: "1px solid rgba(255,77,106,0.3)" }} disabled={saving} onClick={() => { if (confirm(`Eyða ${editMember.name}?`)) doPortalAction("PATCH", { uid: editMember.uid, action: "delete" }, "Eytt"); }}>{t.delete}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Staff Modal ───────────────────────────────────────────────── */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "24px" }} onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="card" style={{ maxWidth: "520px", width: "100%", padding: "28px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.1rem" }}>{lang === "is" ? "Bæta við starfsmanni" : "Add staff member"}</h2>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="form-group" style={{ marginBottom: "14px" }}>
              <label className="form-label">Netfang / Email *</label>
              <input className="form-input" placeholder="jon@dillon.is" value={addForm.email || ""} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
            <StaffFormFields form={addForm} onChange={setAddForm} lang={lang} isOwner={isOwner} />
            <button className="btn btn--primary" style={{ width: "100%", justifyContent: "center", marginTop: "16px" }} disabled={saving} onClick={() => doPortalAction("PUT", addForm, "✅ Starfsmaður bætt við!")}>{saving ? t.saving : lang === "is" ? "Bæta við" : "Add"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffFormFields({ form, onChange, lang, isOwner }: { form: Partial<TeamMember>; onChange: (v: Partial<TeamMember>) => void; lang: Lang; isOwner: boolean }) {
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



