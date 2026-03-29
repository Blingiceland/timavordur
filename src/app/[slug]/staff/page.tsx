"use client";

import { useState, useEffect, useCallback } from "react";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { useParams } from "next/navigation";

// ── i18n ───────────────────────────────────────────────────────────────────
const T = {
  is: {
    loading: "Hleður...", notFound: "Fyrirtæki ekki fundið", linkNotExist: "Hlekkurinn",
    linkSuffix: "er ekki til.", signIn: "Skráðu þig inn með Google", signInBtn: "Innskrá með Google",
    signInSub: "til að klukka inn og út", signOut: "Útskrá",
    pendingTitle: "Skráning móttekin!", pendingMsg: "Við munum láta þig vita þegar stjórnandi samþykkir þig.",
    rejectedTitle: "Skráning hafnað", rejectedMsg: "Hafðu samband við stjórnanda.",
    punchIn: "KLUKKA INN", punchOut: "KLUKKA ÚT", punching: "...",
    todayHours: "Í dag", periodHours: "Þetta tímabil", shifts: "Vaktir",
    registerTitle: "Nýskráning", registerSub: "Fylltu út upplýsingarnar til að ljúka skráningu",
    submitReg: "Senda skráningu", submitting: "Sendir...",
    fullName: "Fullt nafn", fullNamePh: "Jón Jónsson",
    ssn: "Kennitala", ssnPh: "1234567890",
    phone: "Símanúmer", phonePh: "8001234",
    address: "Heimilisfang", addressPh: "Laugavegur 1, 101 Reykjavík",
    bankName: "Banki", bankNamePh: "Íslandsbanki",
    bankAccount: "Reikningsnúmer", bankAccountPh: "0111-26-123456",
    union: "Stéttarfélag", unionPh: "VR",
    pension: "Lífeyrissjóður", pensionPh: "Gildi lífeyrissjóður",
    workPermit: "Ertu með vinnuleyfi?", workPermitYes: "Já", workPermitNo: "Nei",
    workPermitExpiry: "Vinnuleyfi gildir til", workPermitExpiryPh: "2027-12-31",
    jobTitle: "Starfsheiti", jobTitlePh: "Barþjónn",
    employmentType: "Ráðningarstig", fullTime: "Fullt starf", partTime: "Hlutastarfa",
    required: "* skyldulegt", langChoose: "Veldu tungumál",
    timesheets: "Tímaskráningar",
  },
  en: {
    loading: "Loading...", notFound: "Company not found", linkNotExist: "The link",
    linkSuffix: "does not exist.", signIn: "Sign in with Google", signInBtn: "Sign in with Google",
    signInSub: "to clock in and out", signOut: "Sign out",
    pendingTitle: "Registration received!", pendingMsg: "We'll notify you when a manager approves your account.",
    rejectedTitle: "Registration rejected", rejectedMsg: "Please contact your manager.",
    punchIn: "CLOCK IN", punchOut: "CLOCK OUT", punching: "...",
    todayHours: "Today", periodHours: "This period", shifts: "Shifts",
    registerTitle: "Registration", registerSub: "Fill in your details to complete registration",
    submitReg: "Submit registration", submitting: "Submitting...",
    fullName: "Full name", fullNamePh: "John Smith",
    ssn: "ID number", ssnPh: "1234567890",
    phone: "Phone number", phonePh: "+354 800 1234",
    address: "Address", addressPh: "1 Main Street, Reykjavík",
    bankName: "Bank name", bankNamePh: "Íslandsbanki",
    bankAccount: "Account number", bankAccountPh: "0111-26-123456",
    union: "Union", unionPh: "VR",
    pension: "Pension fund", pensionPh: "Gildi Pension Fund",
    workPermit: "Do you have a work permit?", workPermitYes: "Yes", workPermitNo: "No",
    workPermitExpiry: "Work permit valid until", workPermitExpiryPh: "2027-12-31",
    jobTitle: "Job title", jobTitlePh: "Bartender",
    employmentType: "Employment type", fullTime: "Full-time", partTime: "Part-time",
    required: "* required", langChoose: "Choose language",
    timesheets: "Timesheets",
  },
};

type Lang = "is" | "en";
type FieldLevel = "required" | "optional" | "hidden";

interface RegFields { [key: string]: FieldLevel; }
interface CompanyInfo {
  name: string; slug: string;
  registrationFields: RegFields;
  requireApproval: boolean;
}
interface StaffStatus {
  isRegistered: boolean; status: string | null;
  isPunchedIn: boolean; todayHours: number; periodHours: number;
  shifts: number; name: string; companyName: string;
  registrationFields?: RegFields;
}

const DEFAULT_FIELDS: RegFields = {
  name: "required", ssn: "optional", phone: "optional", address: "optional",
  bankName: "optional", bankAccount: "optional", union: "optional",
  pension: "optional", workPermit: "optional", workPermitExpiry: "optional",
  jobTitle: "optional", employmentType: "optional",
};

export default function StaffPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [lang, setLang] = useState<Lang | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [companyExists, setCompanyExists] = useState<boolean | null>(null);
  const [status, setStatus] = useState<StaffStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [punching, setPunching] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [showRegForm, setShowRegForm] = useState(false);
  const [regForm, setRegForm] = useState<Record<string, string>>({ name: "", ssn: "", phone: "", address: "", bankName: "", bankAccount: "", union: "", pension: "", workPermit: "", workPermitExpiry: "", jobTitle: "", employmentType: "" });
  const [regSubmitting, setRegSubmitting] = useState(false);

  const t = T[lang || "is"];

  // Load lang from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`tv_lang_${slug}`) as Lang | null;
    if (saved) setLang(saved);
  }, [slug]);

  const chooseLang = (l: Lang) => {
    setLang(l);
    localStorage.setItem(`tv_lang_${slug}`, l);
  };

  // Load company info
  useEffect(() => {
    fetch(`/api/${slug}/company`)
      .then(r => r.json())
      .then(d => {
        if (d.name) { setCompany(d); setCompanyExists(true); }
        else setCompanyExists(false);
      })
      .catch(() => setCompanyExists(false));
  }, [slug]);

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
  }, []);

  // Fetch staff status
  const fetchStatus = useCallback(async () => {
    if (!user) return;
    setStatusLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/staff/punch`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setStatus(data);
      // Pre-fill name in reg form
      if (!data.isRegistered) {
        setRegForm(f => ({ ...f, name: user.displayName || "" }));
        setShowRegForm(true);
      }
    } catch { console.error("fetch status failed"); }
    finally { setStatusLoading(false); }
  }, [user, slug]);

  useEffect(() => { if (user) fetchStatus(); }, [user, fetchStatus]);

  const handleSignIn = async () => {
    try { await signInWithPopup(auth, googleProvider); }
    catch (err) { console.error(err); }
  };

  const handlePunch = async () => {
    if (!user || !status) return;
    setPunching(true); setMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/staff/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: status.name || user.displayName }),
      });
      const data = await res.json();
      if (res.ok) {
        const isPunchIn = data.type === "in";
        setMessage({ text: isPunchIn ? (lang === "en" ? `✅ Clocked in at ${data.time}` : `✅ Klukkaðir inn ${data.time}`) : (lang === "en" ? `👋 Clocked out at ${data.time}` : `👋 Klukkaðir út ${data.time}`), type: "success" });
        await fetchStatus();
      } else {
        const errMsg = data.error === "ip_restricted"
          ? (lang === "en" ? "❌ You must be on the company WiFi to clock in" : "❌ Þú verður að vera á Wi-Fi vinnustaðarins til að klukka")
          : (lang === "en" ? data.error || "Error" : data.error || "Villa");
        setMessage({ text: errMsg, type: "error" });
      }
    } catch { setMessage({ text: lang === "en" ? "Network error — try again" : "Netvillla — reyndu aftur", type: "error" }); }
    finally { setPunching(false); setTimeout(() => setMessage(null), 5000); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setRegSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/staff/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...regForm, language: lang, workPermit: regForm.workPermit === "yes" }),
      });
      const data = await res.json();
      if (res.ok) { setShowRegForm(false); await fetchStatus(); }
      else setMessage({ text: data.error || "Villa", type: "error" });
    } catch { setMessage({ text: "Netvillla", type: "error" }); }
    finally { setRegSubmitting(false); }
  };

  const fields: RegFields = status?.registrationFields || company?.registrationFields || DEFAULT_FIELDS;

  const fld = (key: string) => fields[key] || "optional";
  const show = (key: string) => fld(key) !== "hidden";
  const req = (key: string) => fld(key) === "required";

  // ── Renders ───────────────────────────────────────────────────────────────

  if (companyExists === false) return (
    <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "4rem", marginBottom: "16px" }}>🔍</div>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>{t.notFound}</h1>
        <p className="text-secondary">{t.linkNotExist} <strong>/{slug}/staff</strong> {t.linkSuffix}</p>
      </div>
    </div>
  );

  if (companyExists === null || authLoading) return (
    <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ textAlign: "center", color: "var(--text-muted)" }}>{T.is.loading}</div>
    </div>
  );

  // Language chooser — show if not chosen yet
  if (!lang) return (
    <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", flexDirection: "column", gap: "32px" }}>
      <div className="navbar__logo" style={{ fontSize: "1.4rem" }}>⏱ Tíma<span>vörður</span></div>
      {company?.name && <div className="text-secondary" style={{ fontSize: "1rem" }}>{company.name}</div>}
      <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>Veldu tungumál / Choose language</p>
      <div style={{ display: "flex", gap: "24px" }}>
        {([["is", "🇮🇸", "Íslenska"], ["en", "🇬🇧", "English"]] as const).map(([code, flag, label]) => (
          <button key={code} onClick={() => chooseLang(code as Lang)}
            className="card"
            style={{ padding: "32px 40px", cursor: "pointer", textAlign: "center", border: "1px solid var(--border)", transition: "all 0.2s", fontSize: "1rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--brand)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <span style={{ fontSize: "3.5rem" }}>{flag}</span>
            <span style={{ fontWeight: 600 }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  // Navbar
  const Navbar = () => (
    <nav className="navbar">
      <div className="container navbar__inner">
        <div className="navbar__logo">
          ⏱ Tíma<span>vörður</span>
          {company?.name && <span className="text-secondary" style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.9rem", marginLeft: "8px" }}>· {company.name}</span>}
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button className="btn btn--ghost btn--sm" onClick={() => { setLang(null); localStorage.removeItem(`tv_lang_${slug}`); }}
            style={{ fontSize: "1.2rem", padding: "4px 8px" }}>
            {lang === "is" ? "🇮🇸" : "🇬🇧"}
          </button>
          {user && <button className="btn btn--ghost btn--sm" onClick={() => signOut(auth)}>{t.signOut}</button>}
        </div>
      </div>
    </nav>
  );

  // Not signed in
  if (!user) return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <Navbar />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)" }}>
        <div className="card" style={{ maxWidth: "400px", width: "100%", padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "16px" }}>⏱</div>
          <h2 style={{ fontSize: "1.4rem", marginBottom: "8px" }}>{t.signIn}</h2>
          <p className="text-secondary" style={{ fontSize: "0.9rem", marginBottom: "32px" }}>{t.signInSub}</p>
          <button onClick={handleSignIn} className="btn btn--primary" style={{ width: "100%", justifyContent: "center", gap: "12px", fontSize: "1rem" }}>
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            {t.signInBtn}
          </button>
        </div>
      </div>
    </div>
  );

  // Registration form
  if (showRegForm && status && !status.isRegistered) return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <Navbar />
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 24px" }}>
        {user.photoURL && <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <img src={user.photoURL} alt="" style={{ width: 56, height: 56, borderRadius: "50%", border: "2px solid var(--border)" }} />
          <div style={{ fontWeight: 600, marginTop: "8px" }}>{user.displayName}</div>
          <div className="text-secondary" style={{ fontSize: "0.85rem" }}>{user.email}</div>
        </div>}
        <div className="card card--brand" style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "1.3rem", marginBottom: "4px" }}>{t.registerTitle}</h1>
          <p className="text-secondary" style={{ fontSize: "0.88rem" }}>{t.registerSub}</p>
        </div>
        {message && <div style={{ background: "rgba(255,77,106,0.1)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: "var(--radius-md)", padding: "12px 16px", color: "var(--danger)", marginBottom: "16px", fontSize: "0.9rem" }}>⚠️ {message.text}</div>}
        <form onSubmit={handleRegister} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {show("name") && <div className="form-group">
            <label className="form-label">{t.fullName} {req("name") && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{t.required}</span>}</label>
            <input className="form-input" placeholder={t.fullNamePh} value={regForm.name} onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))} required={req("name")} />
          </div>}
          {show("ssn") && <div className="form-group">
            <label className="form-label">{t.ssn} {req("ssn") && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{t.required}</span>}</label>
            <input className="form-input" placeholder={t.ssnPh} value={regForm.ssn} onChange={e => setRegForm(f => ({ ...f, ssn: e.target.value }))} required={req("ssn")} pattern="[0-9]{10}" maxLength={10} />
          </div>}
          {show("phone") && <div className="form-group">
            <label className="form-label">{t.phone} {req("phone") && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{t.required}</span>}</label>
            <input className="form-input" placeholder={t.phonePh} value={regForm.phone} onChange={e => setRegForm(f => ({ ...f, phone: e.target.value }))} required={req("phone")} />
          </div>}
          {show("address") && <div className="form-group">
            <label className="form-label">{t.address} {req("address") && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{t.required}</span>}</label>
            <input className="form-input" placeholder={t.addressPh} value={regForm.address} onChange={e => setRegForm(f => ({ ...f, address: e.target.value }))} required={req("address")} />
          </div>}
          {(show("bankName") || show("bankAccount")) && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {show("bankName") && <div className="form-group">
              <label className="form-label">{t.bankName} {req("bankName") && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{t.required}</span>}</label>
              <input className="form-input" placeholder={t.bankNamePh} value={regForm.bankName} onChange={e => setRegForm(f => ({ ...f, bankName: e.target.value }))} required={req("bankName")} />
            </div>}
            {show("bankAccount") && <div className="form-group">
              <label className="form-label">{t.bankAccount} {req("bankAccount") && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{t.required}</span>}</label>
              <input className="form-input" placeholder={t.bankAccountPh} value={regForm.bankAccount} onChange={e => setRegForm(f => ({ ...f, bankAccount: e.target.value }))} required={req("bankAccount")} />
            </div>}
          </div>}
          {show("union") && <div className="form-group">
            <label className="form-label">{t.union} {req("union") && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{t.required}</span>}</label>
            <input className="form-input" placeholder={t.unionPh} value={regForm.union} onChange={e => setRegForm(f => ({ ...f, union: e.target.value }))} required={req("union")} />
          </div>}
          {show("pension") && <div className="form-group">
            <label className="form-label">{t.pension} {req("pension") && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{t.required}</span>}</label>
            <input className="form-input" placeholder={t.pensionPh} value={regForm.pension} onChange={e => setRegForm(f => ({ ...f, pension: e.target.value }))} required={req("pension")} />
          </div>}
          {show("workPermit") && <div className="form-group">
            <label className="form-label">{t.workPermit}</label>
            <div style={{ display: "flex", gap: "12px" }}>
              {[["yes", t.workPermitYes], ["no", t.workPermitNo]].map(([val, label]) => (
                <label key={val} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "10px 16px", borderRadius: "var(--radius-md)", border: `1px solid ${regForm.workPermit === val ? "var(--brand)" : "var(--border)"}`, background: regForm.workPermit === val ? "var(--brand-glow)" : "transparent", transition: "all 0.15s" }}>
                  <input type="radio" name="workPermit" value={val} checked={regForm.workPermit === val} onChange={e => setRegForm(f => ({ ...f, workPermit: e.target.value }))} style={{ display: "none" }} />
                  {label}
                </label>
              ))}
            </div>
          </div>}
          {show("workPermitExpiry") && regForm.workPermit === "yes" && <div className="form-group">
            <label className="form-label">{t.workPermitExpiry}</label>
            <input type="date" className="form-input" value={regForm.workPermitExpiry} onChange={e => setRegForm(f => ({ ...f, workPermitExpiry: e.target.value }))} required={req("workPermitExpiry")} />
          </div>}
          {show("jobTitle") && <div className="form-group">
            <label className="form-label">{t.jobTitle} {req("jobTitle") && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{t.required}</span>}</label>
            <input className="form-input" placeholder={t.jobTitlePh} value={regForm.jobTitle} onChange={e => setRegForm(f => ({ ...f, jobTitle: e.target.value }))} required={req("jobTitle")} />
          </div>}
          {show("employmentType") && <div className="form-group">
            <label className="form-label">{t.employmentType}</label>
            <div style={{ display: "flex", gap: "12px" }}>
              {[["full-time", t.fullTime], ["part-time", t.partTime]].map(([val, label]) => (
                <label key={val} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "10px 16px", borderRadius: "var(--radius-md)", border: `1px solid ${regForm.employmentType === val ? "var(--brand)" : "var(--border)"}`, background: regForm.employmentType === val ? "var(--brand-glow)" : "transparent", transition: "all 0.15s", flex: 1, justifyContent: "center" }}>
                  <input type="radio" name="employmentType" value={val} checked={regForm.employmentType === val} onChange={e => setRegForm(f => ({ ...f, employmentType: e.target.value }))} style={{ display: "none" }} />
                  {label}
                </label>
              ))}
            </div>
          </div>}
          <button type="submit" className="btn btn--primary" style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "1rem" }} disabled={regSubmitting}>
            {regSubmitting ? t.submitting : t.submitReg}
          </button>
        </form>
      </div>
    </div>
  );

  // Pending approval
  if (status?.status === "pending") return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <Navbar />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)" }}>
        <div className="card" style={{ maxWidth: "420px", width: "100%", padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "16px" }}>⏳</div>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "8px" }}>{t.pendingTitle}</h2>
          <p className="text-secondary" style={{ fontSize: "0.9rem", marginBottom: "24px" }}>{t.pendingMsg}</p>
          <button className="btn btn--ghost btn--sm" onClick={() => signOut(auth)}>{t.signOut}</button>
        </div>
      </div>
    </div>
  );

  // Rejected
  if (status?.status === "rejected") return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <Navbar />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)" }}>
        <div className="card" style={{ maxWidth: "420px", width: "100%", padding: "48px", textAlign: "center" }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "16px" }}>❌</div>
          <h2 style={{ fontSize: "1.3rem", marginBottom: "8px" }}>{t.rejectedTitle}</h2>
          <p className="text-secondary" style={{ fontSize: "0.9rem", marginBottom: "24px" }}>{t.rejectedMsg}</p>
          <button className="btn btn--ghost btn--sm" onClick={() => signOut(auth)}>{t.signOut}</button>
        </div>
      </div>
    </div>
  );

  // Main clock page
  const now = new Date();
  const dateStr = now.toLocaleDateString(lang === "en" ? "en-GB" : "is-IS", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <Navbar />
      <div style={{ minHeight: "calc(100vh - 64px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", gap: "32px" }}>
        {/* User info */}
        <div style={{ textAlign: "center" }}>
          {user.photoURL && <img src={user.photoURL} alt="" style={{ width: 64, height: 64, borderRadius: "50%", marginBottom: "12px", border: "2px solid var(--border)" }} />}
          <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{status?.name || user.displayName}</div>
          <div className="text-secondary" style={{ fontSize: "0.85rem" }}>{dateStr}</div>
        </div>

        {/* Message */}
        {message && (
          <div style={{ background: message.type === "success" ? "var(--accent-glow)" : "rgba(255,77,106,0.1)", border: `1px solid ${message.type === "success" ? "rgba(0,212,170,0.3)" : "rgba(255,77,106,0.3)"}`, borderRadius: "var(--radius-md)", padding: "12px 28px", color: message.type === "success" ? "var(--accent)" : "var(--danger)", fontSize: "1rem", fontWeight: 500 }}>
            {message.text}
          </div>
        )}

        {/* Punch button */}
        {statusLoading ? (
          <div className="text-muted">{t.loading}</div>
        ) : (
          <button onClick={handlePunch} disabled={punching} className={`punch-btn ${status?.isPunchedIn ? "punch-btn--out" : ""}`}>
            <span style={{ fontSize: "1.8rem" }}>{status?.isPunchedIn ? "⏹" : "▶"}</span>
            <span>{punching ? t.punching : status?.isPunchedIn ? t.punchOut : t.punchIn}</span>
          </button>
        )}

        {/* Stats */}
        {status?.isRegistered && (
          <div style={{ display: "flex", gap: "40px" }}>
            {[
              [status.periodHours.toFixed(1) + "h", t.periodHours, "var(--accent)"],
              [status.todayHours.toFixed(1) + "h", t.todayHours, "var(--text-primary)"],
              [String(status.shifts), t.shifts, "var(--brand-light)"],
            ].map(([val, label, color]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.8rem", color, fontWeight: 700 }}>{val}</div>
                <div className="text-muted" style={{ fontSize: "0.82rem" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Timesheets link */}
        {status?.isRegistered && (
          <a href={`/${slug}/staff/timesheets`} className="btn btn--secondary btn--sm">{t.timesheets}</a>
        )}
      </div>
    </div>
  );
}
