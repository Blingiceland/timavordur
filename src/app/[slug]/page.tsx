"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, signInWithRedirect, signInWithCustomToken, getRedirectResult, signOut, onAuthStateChanged, User } from "firebase/auth";
import { useTheme } from "@/lib/theme";

import type { FieldLevel, Lang, Tab, TeamMember, PortalData, PortalShift, SwapRequest, SwapShift, BusinessType, Correction } from "./_portal/types";
import {
  roleLabel, roleColor, atLeast, errText, profilePayload,
  ALL_REG_FIELDS, T,
  EMPTY_REG, EMPTY_STAFF, REG_FIELDS_DEFAULTS, ALL_REG_FIELD_KEYS, ALL_REG_FIELD_LABELS,
} from "./_portal/constants";
import { StaffFormFields } from "./_portal/StaffFormFields";
import { OnboardingCard, type OnboardingState } from "./_portal/Onboarding";

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
  // Upcoming shifts (next 3 weeks) — full plan; "my shifts" is derived from this
  const [allShifts, setAllShifts] = useState<PortalShift[]>([]);
  // Shift swaps
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [swapFromId, setSwapFromId] = useState("");
  const [swapMode, setSwapMode] = useState<"cover" | "swap">("cover");
  const [swapToUid, setSwapToUid] = useState("");
  const [swapToId, setSwapToId] = useState("");
  // Punch corrections
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [corrForm, setCorrForm] = useState({ date: "", inTime: "", outTime: "", reason: "" });
  // Staff username/password sign-in
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  // Self sign-up (choose own username + PIN)
  // A PIN shown once to the admin when the e-mail could not be delivered.
  const [pinNotice, setPinNotice] = useState<{ name: string; pin?: string; email?: string | null; emailed: boolean; reason?: string } | null>(null);
  // Workplaces in this company group (e.g. Dillon + Pablo) and the ones chosen at sign-up.
  const [groupList, setGroupList] = useState<{ slug: string; name: string }[]>([]);
  const [chosenCompanies, setChosenCompanies] = useState<string[]>([]);
  // Workplace picked for the next punch-in when the person works at several.
  const [punchSlug, setPunchSlug] = useState<string>("");
  const [editCompanies, setEditCompanies] = useState<string[]>([]);
  const [companyClosed, setCompanyClosed] = useState(false);
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
  const [businessType, setBusinessType] = useState<BusinessType>("bar");
  const [ipEnabled, setIpEnabled] = useState(false);
  const [ipList, setIpList] = useState("");
  const [settingsSaving, setSettingsSaving] = useState<string | null>(null);
  const [settingsResult, setSettingsResult] = useState<{ section: string; ok: boolean; text: string } | null>(null);
  // One idempotency key per intended punch; reused if the request must be retried.
  const pendingPunch = useRef<{ action: "in" | "out"; key: string } | null>(null);
  const [portalError, setPortalError] = useState("");
  const { theme, toggle: toggleTheme } = useTheme();

  const t = T[lang || "is"];

  useEffect(() => {
    const saved = localStorage.getItem(`tv_lang_${slug}`) as Lang | null;
    if (saved) setLang(saved);
  }, [slug]);

  useEffect(() => {
    fetch(`/api/${slug}/company`).then(r => r.json().catch(() => null)).then(d => {
      if (d?.error === "company_suspended") setCompanyClosed(true);
      if (d?.groupCompanies) { setGroupList(d.groupCompanies); setChosenCompanies([slug]); }
    }).catch(() => { /* non-critical */ });
  }, [slug]);

  const chooseLang = (l: Lang) => { setLang(l); localStorage.setItem(`tv_lang_${slug}`, l); };

  const doStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch(`/api/${slug}/staff/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginForm.username, password: loginForm.password }),
      });
      const d = await res.json();
      if (!res.ok) { setLoginError(errText(d.error, lang || "is", d.retryAfter) || (lang === "en" ? "Login failed" : "Innskráning mistókst")); return; }
      await signInWithCustomToken(auth, d.token); // onAuthStateChanged → fetchPortal
    } catch { setLoginError(lang === "en" ? "Network error" : "Netvilla"); }
    finally { setLoggingIn(false); }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
    // Handle Safari redirect sign-in result
    getRedirectResult(auth).catch(() => {/* ignore errors from non-redirect flows */});
    return unsub;
  }, []);


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
        if (d.businessType) setBusinessType(d.businessType);
        if (d.ipRestriction) { setIpEnabled(!!d.ipRestriction.enabled); setIpList((d.ipRestriction.allowedIPs || []).join("\n")); }
        if (!d.registered) setRegForm(f => ({ ...f, name: user.displayName || "" }));
      } else {
        console.error("[portal GET error]", res.status, d);
        setPortalError(errText(d.error, lang || "is") || `Villa ${res.status}`);
      }
    } catch (e) { console.error("[portal fetch crash]", e); setPortalError("Netvillla — reyndu aftur"); } finally { setPortalLoading(false); }
  }, [user, slug, lang]);

  useEffect(() => { if (user) fetchPortal(); }, [user, fetchPortal]);

  // Reset to the clock tab whenever the signed-in user changes. A new user (e.g.
  // staff after an admin signs out) may not have access to the previously selected
  // tab, and single-tab staff have no tab bar to switch back with.
  // Also drop the previous user's portal data so no request runs with a stale status.
  useEffect(() => { setTab("clock"); setPortal(null); setAllShifts([]); setSwaps([]); setCorrections([]); }, [user?.uid]);

  // Fetch the full upcoming schedule (next 3 weeks) — used by the clock tab's
  // "my shifts" and the swaps tab.
  const fetchShifts = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);
      const res = await fetch(`/api/${slug}/schedule?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (res.ok) setAllShifts(d.shifts || []);
    } catch { /* non-critical */ }
  }, [user, slug]);

  const fetchSwaps = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/swaps`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (res.ok) setSwaps(d.requests || []);
    } catch { /* non-critical */ }
  }, [user, slug]);

  const fetchCorrections = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/corrections`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (res.ok) setCorrections(d.corrections || []);
    } catch { /* non-critical */ }
  }, [user, slug]);

  useEffect(() => {
    if (user && portal?.status === "approved") { fetchShifts(); fetchSwaps(); fetchCorrections(); }
  }, [user, portal?.status, fetchShifts, fetchSwaps, fetchCorrections]);

  const showMsg = (text: string, ok = true) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 4000); };

  const approvedPlaces = (portal?.memberships || []).filter(m => m.status === "approved");
  const openPlace = approvedPlaces.find(m => m.isPunchedIn);
  const multiPlace = approvedPlaces.length > 1;

  const doPunch = async () => {
    if (!user || !portal || punching) return;
    const action: "in" | "out" = openPlace ? "out" : "in";
    // Punch out where the shift is open; punch in where the person chose.
    const target = openPlace?.slug ?? (multiPlace ? punchSlug : slug);
    if (!target) { showMsg(lang === "en" ? "Choose where you are working" : "Veldu á hvorum staðnum þú ert", false); return; }
    if (!pendingPunch.current || pendingPunch.current.action !== action) {
      pendingPunch.current = { action, key: crypto.randomUUID().replace(/-/g, "") };
    }
    setPunching(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${target}/portal`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, idempotencyKey: pendingPunch.current.key }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        pendingPunch.current = null;
        const where = multiPlace && d.companyName ? ` — ${d.companyName}` : "";
        showMsg(d.type === "in" ? (lang === "en" ? `✅ Clocked in at ${d.time}${where}` : `✅ Stimplaðir inn kl. ${d.time}${where}`) : (lang === "en" ? `👋 Clocked out at ${d.time}${where}` : `👋 Stimplaðir út kl. ${d.time}${where}`));
        setPunchSlug("");
        await fetchPortal();
      } else {
        // A definite answer from the server: the next press is a new attempt.
        pendingPunch.current = null;
        showMsg(`❌ ${errText(d.error, lang || "is") || (lang === "en" ? "Punch not recorded" : "Stimplun ekki skráð")}`, false);
        if (d.error === "already_punched_in" || d.error === "not_punched_in") await fetchPortal();
      }
    } catch {
      // Unknown outcome: keep the key so a retry cannot create a second punch.
      showMsg(lang === "en" ? "❌ Network error — punch NOT confirmed. Press again to retry." : "❌ Netvilla — stimplun EKKI staðfest. Ýttu aftur til að reyna.", false);
    } finally { setPunching(false); }
  };

  const doPortalAction = async (method: string, body: object, successMsg: string): Promise<Record<string, unknown> | null> => {
    if (!user) return null;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/portal`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const d = await res.json();
      if (res.ok) { if (successMsg) showMsg(successMsg); await fetchPortal(); setEditMember(null); setShowAdd(false); return d as Record<string, unknown>; }
      else { showMsg(errText(d.error, lang || "is") || (lang === "en" ? "Error" : "Villa"), false); return null; }
    } catch { showMsg(lang === "en" ? "Network error" : "Netvillla", false); return null; }
    finally { setSaving(false); }
  };

  // Approve / send PIN / create: report how the PIN was delivered.
  const pinAction = async (method: string, body: object, name: string) => {
    const d = await doPortalAction(method, body, "");
    if (!d) return;
    if (d.pinEmailed === undefined) { showMsg(lang === "is" ? "✅ Samþykkt" : "✅ Approved"); return; }
    setPinNotice({ name, pin: d.pin as string | undefined, email: d.pinEmail as string | null, emailed: !!d.pinEmailed, reason: d.pinReason as string | undefined });
  };

  const doSwapAction = async (id: string, action: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/swaps`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ id, action }) });
      const d = await res.json();
      if (res.ok) { showMsg(lang === "is" ? "✅ Uppfært" : "✅ Updated"); await Promise.all([fetchSwaps(), fetchShifts()]); }
      else showMsg(errText(d.error, lang || "is") || "Villa", false);
    } catch { showMsg(lang === "en" ? "Network error" : "Netvilla", false); }
  };

  const doCorrectionAction = async (id: string, action: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/corrections`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ id, action }) });
      const d = await res.json();
      if (res.ok) { showMsg(lang === "is" ? "✅ Uppfært" : "✅ Updated"); await Promise.all([fetchCorrections(), fetchPortal()]); }
      else showMsg(errText(d.error, lang || "is") || "Villa", false);
    } catch { showMsg(lang === "en" ? "Network error" : "Netvilla", false); }
  };

  const createCorrection = async () => {
    if (!user) return;
    if (!corrForm.date || (!corrForm.inTime && !corrForm.outTime)) { showMsg(lang === "is" ? "Veldu dag og a.m.k. einn tíma" : "Pick a date and at least one time", false); return; }
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/corrections`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(corrForm) });
      const d = await res.json();
      if (res.ok) { showMsg(lang === "is" ? "✅ Beiðni send" : "✅ Request sent"); setCorrForm({ date: "", inTime: "", outTime: "", reason: "" }); await fetchCorrections(); }
      else showMsg(errText(d.error, lang || "is") || "Villa", false);
    } catch { showMsg(lang === "en" ? "Network error" : "Netvilla", false); }
  };

  const createSwap = async () => {
    if (!user) return;
    const fromShift = allShifts.find(s => s.id === swapFromId && s.uid === user.uid);
    if (!fromShift) { showMsg(lang === "is" ? "Veldu vaktina þína" : "Pick your shift", false); return; }
    const body: Record<string, unknown> = { type: swapMode, fromShiftId: fromShift.id };
    if (swapMode === "swap") {
      const toShift = allShifts.find(s => s.id === swapToId && s.uid === swapToUid);
      if (!swapToUid || !toShift) { showMsg(lang === "is" ? "Veldu vakt til að skipta við" : "Pick a shift to swap with", false); return; }
      body.toUid = swapToUid; body.toShiftId = toShift.id;
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/swaps`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const d = await res.json();
      if (res.ok) { showMsg(lang === "is" ? "✅ Beiðni send" : "✅ Request sent"); setSwapFromId(""); setSwapToUid(""); setSwapToId(""); await fetchSwaps(); }
      else showMsg(errText(d.error, lang || "is") || "Villa", false);
    } catch { showMsg(lang === "en" ? "Network error" : "Netvilla", false); }
  };

  const doRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setRegSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/staff/register`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...regForm, language: lang, workPermit: regForm.workPermit === "yes", companies: chosenCompanies.length ? chosenCompanies : [slug] }) });
      const d = await res.json();
      if (res.ok) await fetchPortal();
      else showMsg(errText(d.error, lang || "is") || "Villa", false);
    } catch { showMsg("Netvillla", false); } finally { setRegSubmitting(false); }
  };

  // Saves one settings section. "Saved" is shown ONLY after the server accepted
  // the change; on 4xx/5xx or network failure the edits stay in the form.
  const saveSettings = async (section: "business" | "fields" | "network", override?: object) => {
    if (!user) return;
    const payload = override ?? (
      section === "business" ? { businessType } :
      section === "fields" ? { registrationFields: regFields } :
      { ipRestriction: { enabled: ipEnabled, allowedIPs: ipList.split(/[\s,]+/).map(x => x.trim()).filter(Boolean) } });
    setSettingsSaving(section); setSettingsResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/admin/settings`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setSettingsResult({ section, ok: true, text: t.saved });
      else setSettingsResult({ section, ok: false, text: `${lang === "en" ? "Not saved" : "Ekki vistað"} (${res.status}): ${errText(d.error, lang || "is") || d.error || ""}` });
    } catch {
      setSettingsResult({ section, ok: false, text: lang === "en" ? "Network error — not saved. Your changes are kept." : "Netvilla — ekki vistað. Breytingarnar eru enn í forminu." });
    } finally { setSettingsSaving(null); }
  };
  const dismissOnboarding = async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(`/api/${slug}/admin/settings`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ onboardingDismissed: true }) });
    if (res.ok) await fetchPortal(); else showMsg(lang === "en" ? "Could not save" : "Ekki tókst að vista", false);
  };
  // Fill the allow-list with the address the server sees right now (the venue's Wi-Fi).
  // One click: read the address the server sees right now (the venue's Wi-Fi),
  // add it to the allow-list, turn the restriction on and save — no separate step.
  const useMyNetwork = async () => {
    if (!user || settingsSaving) return;
    setSettingsSaving("network"); setSettingsResult(null);
    let ip = "";
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/admin/my-ip`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json().catch(() => ({}));
      ip = res.ok && typeof d.ip === "string" ? d.ip : "";
    } catch { /* handled below */ }
    setSettingsSaving(null);
    if (!ip) {
      setSettingsResult({ section: "network", ok: false, text: lang === "en" ? "Could not detect your network address — nothing was changed." : "Ekki tókst að greina netfang tengingarinnar — engu var breytt." });
      return;
    }
    const current = ipList.split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
    const next = current.includes(ip) ? current : [...current, ip];
    setIpEnabled(true);
    setIpList(next.join("\n"));
    await saveSettings("network", { ipRestriction: { enabled: true, allowedIPs: next } });
  };

  const SettingsStatus = ({ section }: { section: string }) => settingsResult?.section === section
    ? <span role={settingsResult.ok ? "status" : "alert"} style={{ color: settingsResult.ok ? "var(--accent)" : "var(--danger)", fontSize: "0.9rem" }}>{settingsResult.text}</span>
    : null;

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

  // ─── Company closed by the operator ───────────────────────────────────────
  if (companyClosed) return (
    <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 16 }}>
      <div className="card" role="alert" style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
        <div style={{ fontSize: "2.4rem" }}>🔒</div>
        <h1 style={{ fontSize: "1.2rem" }}>{lang === "en" ? "Access closed" : "Aðgangi lokað"}</h1>
        <p className="text-secondary">{lang === "en" ? "This workplace's access to Tímavörður has been closed. Please contact the owner." : "Aðgangi þessa staðar að Tímaverði hefur verið lokað. Hafðu samband við eiganda."}</p>
      </div>
    </div>
  );

  // ─── Loading / auth ────────────────────────────────────────────────────────
  if (authLoading || (user && portalLoading && !portal)) return (
    <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="text-muted">{t.loading}</div>
    </div>
  );

  // "Where do you work?" — any combination of the workplaces in the group.
  const WorkplacePicker = () => (
    <fieldset style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 14px" }}>
      <legend className="form-label" style={{ padding: "0 4px" }}>{lang === "is" ? "Hvar vinnur þú?" : "Where do you work?"}</legend>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {groupList.map(c => (
          <label key={c.slug} style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={chosenCompanies.includes(c.slug)}
              onChange={e => setChosenCompanies(cs => e.target.checked ? [...cs, c.slug] : cs.filter(x => x !== c.slug))} />
            {c.name}
          </label>
        ))}
      </div>
      <div className="text-muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>{lang === "is" ? "Hakaðu við báða ef þú vinnur á báðum stöðum." : "Tick both if you work at both."}</div>
    </fieldset>
  );

  const Navbar = () => (
    <nav className="navbar">
      <div className="container navbar__inner" style={{ flexWrap: "wrap", rowGap: 8 }}>
        <div className="navbar__logo" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", rowGap: 4, minWidth: 0 }}>⏱ Tíma<span>vörður</span>
          {portal?.companyName && <span className="text-secondary" style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.9rem", marginLeft: "8px" }}>· {portal.companyName}</span>}
          {portal?.role && portal.role !== "staff" && <span className="badge" style={{ marginLeft: "8px", fontSize: "0.7rem", background: "rgba(255,255,255,0.08)", color: roleColor(portal.role) }}>{roleLabel(portal.role, lang)}</span>}
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
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
          {user && (portal?.memberships || []).filter(m => m.slug !== slug).map(m => (
            <a key={m.slug} href={`/${m.slug}`} className="btn btn--ghost btn--sm" title={lang === "is" ? "Skipta um stað" : "Switch workplace"}>↔ {m.name}</a>
          ))}
          {user && <button className="btn btn--ghost btn--sm" onClick={() => signOut(auth)}>{t.signOut}</button>}
        </div>
      </div>
    </nav>
  );

  // ─── Not signed in ─────────────────────────────────────────────────────────
  if (!user) return (
    <div className="page" style={{ minHeight: "100vh" }}><Navbar />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)" }}>
        <div className="card" style={{ maxWidth: "400px", width: "100%", padding: "40px" }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div style={{ fontSize: "3rem", marginBottom: "8px" }}>⏱</div>
            <h2 style={{ fontSize: "1.4rem" }}>{portal?.companyName || "Tímavörður"}</h2>
            <p className="text-secondary" style={{ fontSize: "0.9rem", marginTop: "4px" }}>{lang === "is" ? "Skráðu þig inn með notendanafni og PIN" : "Sign in with your username and PIN"}</p>
          </div>

          {loginError && <div style={{ background: "rgba(255,77,106,0.1)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: "var(--radius-md)", padding: "10px 14px", color: "var(--danger)", marginBottom: "14px", fontSize: "0.85rem" }}>⚠️ {loginError}</div>}

          <form onSubmit={doStaffLogin} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="li-user">{lang === "is" ? "Notendanafn" : "Username"}</label>
              <input id="li-user" className="form-input" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder={lang === "is" ? "notendanafn" : "username"} value={loginForm.username} onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="li-pin">PIN</label>
              <input id="li-pin" type="password" autoComplete="current-password" inputMode="numeric" maxLength={4} className="form-input" placeholder="••••" value={loginForm.password} onChange={e => setLoginForm(f => ({ ...f, password: e.target.value.replace(/\D/g, "") }))} required />
            </div>
            <button type="submit" className="btn btn--primary" style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: "1rem" }} disabled={loggingIn}>{loggingIn ? "..." : (lang === "is" ? "Skrá inn" : "Sign in")}</button>
          </form>

          {(
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "16px 0 14px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span className="text-muted" style={{ fontSize: "0.75rem" }}>{lang === "is" ? "Nýr starfsmaður eða stjórnandi?" : "New staff member or manager?"}</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
              <button onClick={() => {
                const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
                if (isSafari) { signInWithRedirect(auth, googleProvider); }
                else { signInWithPopup(auth, googleProvider); }
              }} className="btn btn--secondary" style={{ width: "100%", justifyContent: "center", gap: "10px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                {lang === "is" ? "Nýskrá / skrá inn með Google" : "Sign up / sign in with Google"}
              </button>
              <p className="text-muted" style={{ fontSize: "0.78rem", marginTop: 10, textAlign: "center" }}>
                {lang === "is" ? "Nýir starfsmenn skrá sig með Google. Þegar stjórnandi samþykkir færðu PIN í pósti." : "New staff register with Google. When approved, you get a PIN by e-mail."}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Registered at another workplace in the group, not here ───────────────────
  if (portal && !portal.registered && (portal.memberships?.length ?? 0) > 0) return (
    <div className="page" style={{ minHeight: "100vh" }}><Navbar />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 64px)" }}>
        <div className="card" style={{ maxWidth: 420, width: "100%", padding: 40, textAlign: "center" }}>
          <h2 style={{ fontSize: "1.2rem" }}>{lang === "is" ? `Þú ert ekki skráð(ur) á ${portal.companyName}` : `You are not registered at ${portal.companyName}`}</h2>
          <p className="text-secondary">{lang === "is" ? "Þú ert skráð(ur) á:" : "You are registered at:"}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {portal.memberships!.map(m => <a key={m.slug} className="btn btn--primary" href={`/${m.slug}`}>{m.name}</a>)}
          </div>
          <p className="text-muted" style={{ fontSize: "0.8rem", marginTop: 14 }}>{lang === "is" ? "Stjórnandi getur bætt þessum stað við hjá þér." : "An admin can add this workplace for you."}</p>
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
            <div className="form-group">
              <label className="form-label" htmlFor="reg-username">{lang === "is" ? "Notendanafn (til að stimpla með PIN)" : "Username (for clocking in with a PIN)"} <span style={{ color: "var(--danger)", fontSize: "0.78rem" }}>* {t.required}</span></label>
              <input id="reg-username" className="form-input" autoCapitalize="none" autoCorrect="off" placeholder={lang === "is" ? "t.d. anna" : "e.g. anna"} value={regForm.username || ""} onChange={e => setRegForm(v => ({ ...v, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "") }))} required minLength={3} maxLength={30} />
              <div className="text-muted" style={{ fontSize: "0.78rem", marginTop: 3 }}>{lang === "is" ? `PIN verður sent á ${user.email} þegar stjórnandi samþykkir.` : `Your PIN will be sent to ${user.email} once approved.`}</div>
            </div>
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
            {groupList.length > 1 && <WorkplacePicker />}
            <button type="submit" className="btn btn--primary" style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: "1rem" }} disabled={regSubmitting || chosenCompanies.length === 0}>{regSubmitting ? t.saving : t.regBtn}</button>
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
            {isPending && <p className="text-muted" style={{ fontSize: "0.85rem", marginTop: -12, marginBottom: 20 }}>{lang === "is" ? "Þú færð PIN í pósti þegar skráningin er samþykkt." : "You will get a PIN by e-mail when approved."}</p>}
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

  // ── Swaps-derived data ──
  const myUpcoming = allShifts.filter(s => s.uid === user.uid);
  const othersShifts = allShifts.filter(s => s.uid !== user.uid);
  const openCovers = swaps.filter(s => s.type === "cover" && s.status === "pending" && s.fromUid !== user.uid);
  const swapsToMe = swaps.filter(s => s.type === "swap" && s.status === "pending" && s.toUid === user.uid);
  const myRequests = swaps.filter(s => s.fromUid === user.uid && (s.status === "pending" || s.status === "accepted"));
  const swapAwaitingApproval = swaps.filter(s => s.status === "accepted");
  const swapBadge = canSeeTeam ? swapAwaitingApproval.length : (openCovers.length + swapsToMe.length);
  // Corrections-derived
  const myCorrections = corrections.filter(c => c.uid === user.uid);
  const pendingCorrections = corrections; // API already returns only pending; managers get all, staff get own
  const corrBadge = canSeeTeam ? pendingCorrections.length : myCorrections.length;
  const fmtCorrDate = (ymd: string) => new Date(ymd + "T00:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : "is-IS", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const fmtSwapShift = (sh: SwapShift) => {
    const d = new Date(sh.date + "T00:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : "is-IS", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    return `${d} ${sh.startTime}–${sh.endTime}${sh.endTime <= sh.startTime ? " (+1)" : ""}`;
  };
  const swapStatusLabel = (s: string) =>
    s === "accepted" ? (lang === "is" ? "Bíður samþykkis yfirmanns" : "Awaiting manager") : (lang === "is" ? "Í bið" : "Pending");

  const tabs: { key: Tab; label: string }[] = (
    [
      { key: "clock" as Tab, label: t.tabClock, show: true },
      { key: "swaps" as Tab, label: lang === "is" ? "Vaktaskipti" : "Swaps", show: true },
      { key: "corrections" as Tab, label: lang === "is" ? "Leiðréttingar" : "Corrections", show: true },
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

        {pinNotice && (
          <div role="alert" className="card" style={{ marginBottom: 16, padding: "16px 20px", border: `1px solid ${pinNotice.emailed ? "rgba(0,212,170,0.4)" : "#f0a500"}` }}>
            {pinNotice.emailed ? (
              <div>✅ {lang === "is" ? `${pinNotice.name}: PIN sent á ${pinNotice.email}.` : `${pinNotice.name}: PIN sent to ${pinNotice.email}.`}</div>
            ) : (
              <div>
                <div style={{ fontWeight: 600 }}>⚠️ {lang === "is" ? `Ekki tókst að senda póst til ${pinNotice.name}` : `Could not e-mail ${pinNotice.name}`}{pinNotice.reason === "no_email" ? (lang === "is" ? " (ekkert netfang skráð)" : " (no e-mail on file)") : pinNotice.reason === "not_configured" ? (lang === "is" ? " (póstþjónusta ekki uppsett)" : " (mail not configured)") : ""}.</div>
                <div style={{ marginTop: 6 }}>{lang === "is" ? "Afhentu starfsmanninum þetta PIN. Það birtist aðeins núna:" : "Hand this PIN to the employee. It is shown only now:"} <b style={{ fontSize: "1.4rem", letterSpacing: 4, fontFamily: "monospace" }}>{pinNotice.pin}</b></div>
              </div>
            )}
            <button className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={() => setPinNotice(null)}>{lang === "is" ? "Loka" : "Close"}</button>
          </div>
        )}

        {isOwner && portal.onboarding && (
          <OnboardingCard state={portal.onboarding as OnboardingState} slug={slug} companyName={portal.companyName || slug} lang={lang}
            goSettings={() => setTab("settings")} goStaff={() => setTab("staff")} onDismiss={dismissOnboarding} />
        )}

        {/* Registration link (admin+) */}
        {canManage && !(isOwner && portal.onboarding) && (
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

        {/* Quick nav (manager+) */}
        {canSeeTeam && (
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { href: `/${slug}/timesheets`, icon: "📊", labelIs: "Tímaskýrslur", labelEn: "Timesheets" },
              { href: `/${slug}/schedule`, icon: "🗓", labelIs: "Vaktaplan", labelEn: "Schedule" },
              { href: `/${slug}/rates`, icon: "📑", labelIs: "Launataxtar & kjör", labelEn: "Wage rates & terms" },
              ...(canManage ? [{ href: `/${slug}/payroll`, icon: "🔒", labelIs: "Launavinnsla", labelEn: "Payroll" }] : []),
            ].map(link => (
              <a key={link.href} href={link.href}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", textDecoration: "none", color: "var(--text-primary)", fontSize: "0.88rem", fontWeight: 500, transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-primary)"; }}>
                <span>{link.icon}</span>
                <span>{lang === "is" ? link.labelIs : link.labelEn}</span>
              </a>
            ))}
          </div>
        )}

        {/* Tabs */}

        {tabs.length > 1 && (
          <div role="tablist" style={{ display: "flex", gap: "4px", marginBottom: "24px", background: "var(--bg-surface)", padding: "4px", borderRadius: "var(--radius-md)", width: "fit-content", maxWidth: "100%", overflowX: "auto" }}>
            {tabs.map(tb => (
              <button key={tb.key} role="tab" aria-selected={tab === tb.key} onClick={() => setTab(tb.key)} className={`btn btn--sm ${tab === tb.key ? "btn--primary" : "btn--ghost"}`} style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                {tb.label}
                {tb.key === "staff" && pendingStaff.length > 0 && <span style={{ marginLeft: "6px", background: tab === tb.key ? "rgba(255,255,255,0.2)" : "var(--border)", borderRadius: "20px", padding: "1px 7px", fontSize: "0.75rem" }}>{pendingStaff.length}</span>}
                {tb.key === "swaps" && swapBadge > 0 && <span style={{ marginLeft: "6px", background: tab === tb.key ? "rgba(255,255,255,0.2)" : "var(--border)", borderRadius: "20px", padding: "1px 7px", fontSize: "0.75rem" }}>{swapBadge}</span>}
                {tb.key === "corrections" && corrBadge > 0 && <span style={{ marginLeft: "6px", background: tab === tb.key ? "rgba(255,255,255,0.2)" : "var(--border)", borderRadius: "20px", padding: "1px 7px", fontSize: "0.75rem" }}>{corrBadge}</span>}
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
            {multiPlace && !openPlace && (
              <fieldset role="radiogroup" style={{ border: "none", padding: 0, margin: 0, textAlign: "center" }}>
                <legend style={{ fontWeight: 600, marginBottom: 10, width: "100%" }}>{lang === "is" ? "Hvar ertu að vinna núna?" : "Where are you working now?"}</legend>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  {approvedPlaces.map(m => (
                    <button key={m.slug} role="radio" aria-checked={punchSlug === m.slug} onClick={() => setPunchSlug(m.slug)}
                      style={{ padding: "12px 20px", borderRadius: 10, minWidth: 130, cursor: "pointer", fontSize: "1rem",
                        border: `2px solid ${punchSlug === m.slug ? "var(--brand)" : "var(--border)"}`,
                        background: punchSlug === m.slug ? "var(--brand-glow)" : "var(--bg-card)", color: "var(--text-primary)", fontWeight: punchSlug === m.slug ? 700 : 500 }}>
                      {m.name}
                      {m.onNetwork === true && <div style={{ fontSize: "0.72rem", color: "var(--accent)" }}>{lang === "is" ? "þú ert á netinu hér" : "you are on this network"}</div>}
                      {m.onNetwork === false && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{lang === "is" ? "ekki á netinu hér" : "not on this network"}</div>}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {openPlace && multiPlace && <div style={{ fontWeight: 600 }}>{lang === "is" ? `Inni á ${openPlace.name}` : `Clocked in at ${openPlace.name}`}</div>}
            <button onClick={doPunch} disabled={punching || (multiPlace && !openPlace && !punchSlug)} className={`punch-btn ${openPlace ? "punch-btn--out" : ""}`}>
              <span style={{ fontSize: "1.8rem" }}>{openPlace ? "⏹" : "▶"}</span>
              <span>{punching ? "..." : openPlace ? t.punchOut : t.punchIn}</span>
            </button>
            <div style={{ display: "flex", gap: "40px" }}>
              {[[portal.periodHours?.toFixed(1) + "h", t.period, "var(--accent)"], [portal.todayHours?.toFixed(1) + "h", t.today, "var(--text-primary)"], [String(portal.shifts), t.shifts, "var(--brand-light)"]].map(([v, l, c]) => (
                <div key={l} style={{ textAlign: "center" }}><div style={{ fontSize: "1.8rem", color: c, fontWeight: 700 }}>{v}</div><div className="text-muted" style={{ fontSize: "0.82rem" }}>{l}</div></div>
              ))}
            </div>
            {myUpcoming.length > 0 && (
              <div className="card" style={{ width: "100%", maxWidth: 440, padding: "16px 20px" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                  🗓 {lang === "is" ? "Mínar vaktir" : "My shifts"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {myUpcoming.map(sh => {
                    const nextDay = sh.endTime <= sh.startTime;
                    const label = new Date(sh.date + "T00:00:00Z").toLocaleDateString(lang === "en" ? "en-GB" : "is-IS", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
                    return (
                      <div key={sh.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "9px 14px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)" }}>
                        <span style={{ fontSize: "0.9rem", fontWeight: 500, textTransform: "capitalize" }}>{label}</span>
                        <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{sh.startTime}–{sh.endTime}{nextDay ? " (+1)" : ""}{sh.notes ? ` · ${sh.notes}` : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <a href={`/${slug}/timesheets`} className="btn btn--secondary btn--sm">📊 {lang === "is" ? "Tímaskýrslur" : "Timesheets"}</a>
              <a href={`/${slug}/schedule`} className="btn btn--secondary btn--sm">🗓 {lang === "is" ? "Vaktaplan" : "Schedule"}</a>
              <a href={`/${slug}/rates`} className="btn btn--secondary btn--sm">📑 {lang === "is" ? "Mín kjör" : "My terms"}</a>
            </div>
          </div>
        )}

        {/* ── SWAPS TAB ──────────────────────────────────────────────────── */}
        {tab === "swaps" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}>
            {/* Create a request */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 14 }}>{lang === "is" ? "Bjóða eða skipta á vakt" : "Offer or swap a shift"}</div>
              {myUpcoming.length === 0 ? (
                <p className="text-muted" style={{ fontSize: "0.88rem" }}>{lang === "is" ? "Þú átt engar vaktir framundan." : "You have no upcoming shifts."}</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">{lang === "is" ? "Mín vakt" : "My shift"}</label>
                    <select className="form-input" value={swapFromId} onChange={e => setSwapFromId(e.target.value)}>
                      <option value="">{lang === "is" ? "Veldu vakt..." : "Choose shift..."}</option>
                      {myUpcoming.map(s => <option key={s.id} value={s.id}>{fmtSwapShift(s)}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["cover", "swap"] as const).map(m => (
                      <button key={m} onClick={() => setSwapMode(m)} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `2px solid ${swapMode === m ? "var(--brand)" : "var(--border)"}`, background: swapMode === m ? "var(--brand-glow)" : "transparent", cursor: "pointer", fontSize: "0.82rem", color: swapMode === m ? "var(--brand)" : "var(--text-secondary)", fontWeight: swapMode === m ? 600 : 400 }}>
                        {m === "cover" ? (lang === "is" ? "Bjóða (cover)" : "Offer (cover)") : (lang === "is" ? "Skipta við" : "Swap with")}
                      </button>
                    ))}
                  </div>
                  {swapMode === "swap" && (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">{lang === "is" ? "Skipta við vakt" : "Swap with shift"}</label>
                      <select className="form-input" value={swapToId} onChange={e => { const sh = othersShifts.find(x => x.id === e.target.value); setSwapToId(e.target.value); setSwapToUid(sh?.uid || ""); }}>
                        <option value="">{lang === "is" ? "Veldu vakt samstarfsmanns..." : "Choose a colleague's shift..."}</option>
                        {othersShifts.map(s => <option key={s.id} value={s.id}>{s.name ? `${s.name} — ` : ""}{fmtSwapShift(s)}</option>)}
                      </select>
                    </div>
                  )}
                  <button className="btn btn--primary" onClick={createSwap} disabled={!swapFromId} style={{ justifyContent: "center" }}>{lang === "is" ? "Senda beiðni" : "Send request"}</button>
                </div>
              )}
            </div>

            {/* Manager approvals */}
            {canSeeTeam && swapAwaitingApproval.length > 0 && (
              <div className="card card--brand" style={{ padding: 20 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12 }}>✅ {lang === "is" ? "Bíða samþykkis" : "Awaiting approval"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {swapAwaitingApproval.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: "0.85rem" }}>
                        {r.type === "cover"
                          ? <><strong>{r.claimedByName}</strong> {lang === "is" ? "tekur vakt" : "covers"} <strong>{r.fromName}</strong>: {fmtSwapShift(r.fromShift)}</>
                          : <><strong>{r.fromName}</strong> ⇄ <strong>{r.toName}</strong>: {fmtSwapShift(r.fromShift)} ⇄ {r.toShift && fmtSwapShift(r.toShift)}</>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn--sm" style={{ background: "rgba(0,212,170,0.1)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.3)" }} onClick={() => doSwapAction(r.id, "approve")}>{lang === "is" ? "Samþykkja" : "Approve"}</button>
                        <button className="btn btn--sm" style={{ background: "rgba(255,77,106,0.1)", color: "var(--danger)", border: "1px solid rgba(255,77,106,0.3)" }} onClick={() => doSwapAction(r.id, "decline")}>{lang === "is" ? "Hafna" : "Decline"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Open covers to take */}
            {openCovers.length > 0 && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12 }}>{lang === "is" ? "Lausar vaktir" : "Available shifts"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {openCovers.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: "0.85rem" }}><strong>{r.fromName}</strong> {lang === "is" ? "býður" : "offers"}: {fmtSwapShift(r.fromShift)}</div>
                      <button className="btn btn--primary btn--sm" onClick={() => doSwapAction(r.id, "claim")}>{lang === "is" ? "Taka" : "Take"}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Swap requests addressed to me */}
            {swapsToMe.length > 0 && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12 }}>{lang === "is" ? "Beiðnir til mín" : "Requests for you"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {swapsToMe.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: "0.85rem" }}><strong>{r.fromName}</strong> {lang === "is" ? "vill skipta" : "wants to swap"}: {fmtSwapShift(r.fromShift)} ⇄ {r.toShift && fmtSwapShift(r.toShift)} ({lang === "is" ? "þín" : "yours"})</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn--sm" style={{ background: "rgba(0,212,170,0.1)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.3)" }} onClick={() => doSwapAction(r.id, "accept")}>{lang === "is" ? "Samþykkja" : "Accept"}</button>
                        <button className="btn btn--sm" style={{ background: "rgba(255,77,106,0.1)", color: "var(--danger)", border: "1px solid rgba(255,77,106,0.3)" }} onClick={() => doSwapAction(r.id, "reject")}>{lang === "is" ? "Hafna" : "Reject"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* My own requests */}
            {myRequests.length > 0 && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12 }}>{lang === "is" ? "Mínar beiðnir" : "My requests"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {myRequests.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: "0.85rem" }}>
                        {r.type === "cover"
                          ? <>{lang === "is" ? "Býð" : "Offering"}: {fmtSwapShift(r.fromShift)}</>
                          : <>{lang === "is" ? "Skipti" : "Swap"}: {fmtSwapShift(r.fromShift)} ⇄ {r.toName}</>}
                        <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "var(--text-muted)" }}>· {swapStatusLabel(r.status)}</span>
                      </div>
                      <button className="btn btn--ghost btn--sm" onClick={() => doSwapAction(r.id, "cancel")}>{lang === "is" ? "Hætta við" : "Cancel"}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CORRECTIONS TAB ────────────────────────────────────────────── */}
        {tab === "corrections" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 640 }}>
            {/* Submit a correction */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 6 }}>{lang === "is" ? "Leiðrétting á stimplun" : "Punch correction"}</div>
              <p className="text-secondary" style={{ fontSize: "0.85rem", marginBottom: 14 }}>{lang === "is" ? "Gleymdir þú að stimpla inn eða út? Sendu leiðréttingu sem vaktstjóri/eigandi samþykkir." : "Forgot to clock in or out? Send a correction for a manager/owner to approve."}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{lang === "is" ? "Dagur" : "Date"}</label>
                  <input type="date" className="form-input" value={corrForm.date} onChange={e => setCorrForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label className="form-label">{lang === "is" ? "Inn" : "In"}</label>
                    <input type="time" className="form-input" value={corrForm.inTime} onChange={e => setCorrForm(f => ({ ...f, inTime: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label className="form-label">{lang === "is" ? "Út" : "Out"}</label>
                    <input type="time" className="form-input" value={corrForm.outTime} onChange={e => setCorrForm(f => ({ ...f, outTime: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{lang === "is" ? "Ástæða" : "Reason"}</label>
                  <input className="form-input" placeholder={lang === "is" ? "t.d. gleymdi að stimpla út" : "e.g. forgot to clock out"} value={corrForm.reason} onChange={e => setCorrForm(f => ({ ...f, reason: e.target.value }))} />
                </div>
                <button className="btn btn--primary" onClick={createCorrection} style={{ justifyContent: "center" }}>{lang === "is" ? "Senda leiðréttingu" : "Send correction"}</button>
              </div>
            </div>

            {/* Manager approvals */}
            {canSeeTeam && corrections.length > 0 && (
              <div className="card card--brand" style={{ padding: 20 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12 }}>✅ {lang === "is" ? "Til samþykktar" : "To approve"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {corrections.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: "0.85rem" }}>
                        <strong>{c.name}</strong> · {fmtCorrDate(c.date)}{" "}
                        {c.inTime ? `${lang === "is" ? "Inn" : "In"} ${c.inTime}` : ""}{c.inTime && c.outTime ? " · " : ""}{c.outTime ? `${lang === "is" ? "Út" : "Out"} ${c.outTime}` : ""}
                        {c.reason && <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{c.reason}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn--sm" style={{ background: "rgba(0,212,170,0.1)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.3)" }} onClick={() => doCorrectionAction(c.id, "approve")}>{lang === "is" ? "Samþykkja" : "Approve"}</button>
                        <button className="btn btn--sm" style={{ background: "rgba(255,77,106,0.1)", color: "var(--danger)", border: "1px solid rgba(255,77,106,0.3)" }} onClick={() => doCorrectionAction(c.id, "reject")}>{lang === "is" ? "Hafna" : "Reject"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staff's own pending */}
            {!canSeeTeam && myCorrections.length > 0 && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12 }}>{lang === "is" ? "Mínar beiðnir" : "My requests"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {myCorrections.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: "0.85rem" }}>
                        {fmtCorrDate(c.date)} · {c.inTime ? `${lang === "is" ? "Inn" : "In"} ${c.inTime}` : ""}{c.inTime && c.outTime ? " · " : ""}{c.outTime ? `${lang === "is" ? "Út" : "Out"} ${c.outTime}` : ""}
                        <span style={{ marginLeft: 8, fontSize: "0.75rem", color: "var(--text-muted)" }}>· {lang === "is" ? "Í bið" : "Pending"}</span>
                      </div>
                      <button className="btn btn--ghost btn--sm" onClick={() => doCorrectionAction(c.id, "cancel")}>{lang === "is" ? "Hætta við" : "Cancel"}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
              <button className="btn btn--primary" onClick={() => { setShowAdd(true); setAddForm(EMPTY_STAFF); setEditCompanies([slug]); }}>{t.addStaff}</button>
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="table">
                <thead><tr><th>{lang === "is" ? "Nafn" : "Name"}</th><th>{lang === "is" ? "Hlutverk" : "Role"}</th><th>{lang === "is" ? "Staða" : "Status"}</th><th></th></tr></thead>
                <tbody>
                  {staffAll.length === 0 ? <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "32px" }}>{lang === "is" ? "Enginn starfsmaður" : "No staff yet"}</td></tr>
                    : staffAll.map(s => (
                      <tr key={s.uid}>
                        <td><div style={{ fontWeight: 500 }}>{s.name}</div><div className="text-muted" style={{ fontSize: "0.78rem" }}>{s.username ? `@${s.username}` : s.email}</div></td>
                        <td><span style={{ color: roleColor(s.role), fontSize: "0.85rem" }}>{roleLabel(s.role, lang)}</span></td>
                        <td>{s.status === "pending" ? <span className="badge" style={{ background: "rgba(255,180,0,0.15)", color: "#f0a500", border: "1px solid rgba(255,180,0,0.3)" }}>⏳ {lang === "is" ? "Í bið" : "Pending"}</span> : s.status === "rejected" ? <span className="badge badge--danger">✕</span> : <span className="badge badge--success">✓</span>}</td>
                        <td>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            {s.status === "pending" && <>
                              <button className="btn btn--sm" style={{ background: "rgba(0,212,170,0.1)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.3)" }} onClick={() => pinAction("PATCH", { uid: s.uid, action: "approve" }, s.name)} disabled={saving}>{t.approve}</button>
                              <button className="btn btn--sm" style={{ background: "rgba(255,77,106,0.1)", color: "var(--danger)", border: "1px solid rgba(255,77,106,0.3)" }} onClick={() => doPortalAction("PATCH", { uid: s.uid, action: "reject" }, "Hafnað")} disabled={saving}>{t.reject}</button>
                            </>}
                            <button className="btn btn--secondary btn--sm" onClick={() => { setEditMember(s); setEditForm({ ...s }); setEditCompanies(s.companies || [slug]); }}>{t.edit}</button>
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
            {/* Business type */}
            <div className="card" style={{ padding: "28px", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "1.05rem", marginBottom: "6px" }}>{lang === "is" ? "Tegund reksturs" : "Business type"}</h2>
              <p className="text-secondary" style={{ fontSize: "0.85rem", marginBottom: "16px" }}>{lang === "is" ? "Krár, skemmtistaðir og dansstaðir greiða 55% álag kl. 00–05 aðfararnótt laugardags og sunnudags (gr. 3.2.1). Veitingastaðir greiða 45%." : "Bars/clubs pay 55% 00–05 on the nights before Saturday and Sunday (3.2.1); restaurants 45%."}</p>
              <div role="radiogroup" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {([["bar", lang === "is" ? "Krá / skemmtistaður" : "Bar / nightclub"], ["restaurant", lang === "is" ? "Veitingastaður" : "Restaurant"]] as const).map(([v, l]) => (
                  <button key={v} role="radio" aria-checked={businessType === v} onClick={() => setBusinessType(v)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `2px solid ${businessType === v ? "var(--brand)" : "var(--border)"}`, background: businessType === v ? "var(--brand-glow)" : "transparent", cursor: "pointer", fontSize: "0.85rem", color: businessType === v ? "var(--brand)" : "var(--text-secondary)", fontWeight: businessType === v ? 600 : 400 }}>{l}</button>
                ))}
              </div>
              <p className="text-muted" style={{ fontSize: "0.8rem", marginBottom: 12 }}>{lang === "is" ? "Launataxtar eru ekki slegnir inn hér lengur — þeir koma úr staðfestri taxtaskrá og kjör hvers starfsmanns eru skráð með gildisdegi." : "Wage rates are no longer typed in here — they come from the verified rate table, and each employee's terms are recorded with an effective date."} <a href={`/${slug}/rates`}>{lang === "is" ? "Launataxtar & kjör →" : "Wage rates & terms →"}</a></p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button className="btn btn--primary" onClick={() => saveSettings("business")} disabled={settingsSaving !== null}>{settingsSaving === "business" ? t.saving : t.save}</button>
                <SettingsStatus section="business" />
              </div>
            </div>
            {/* Network restriction for punching */}
            <div className="card" style={{ padding: "28px", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "1.05rem", marginBottom: "6px" }}>{lang === "is" ? "Stimplun aðeins af neti vinnustaðar" : "Punch only from the workplace network"}</h2>
              <p className="text-secondary" style={{ fontSize: "0.85rem", marginBottom: 12 }}>{lang === "is" ? "Ein IP-tala eða CIDR-bil í línu (IPv4 eða IPv6), t.d. 203.0.113.7 eða 203.0.113.0/24. Ef kveikt er á takmörkun og listinn er tómur eða ólæsilegur er stimplun hafnað." : "One IP address or CIDR range per line (IPv4 or IPv6). If enabled with an empty or invalid list, punching is refused."}</p>
              <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <input type="checkbox" checked={ipEnabled} onChange={e => setIpEnabled(e.target.checked)} />
                {lang === "is" ? "Takmörkun virk" : "Restriction enabled"}
              </label>
              <button type="button" className="btn btn--secondary btn--sm" style={{ marginBottom: 8 }} onClick={useMyNetwork} disabled={settingsSaving !== null}>📶 {settingsSaving === "network" ? t.saving : (lang === "is" ? "Nota netið sem ég er á núna og vista" : "Use the network I'm on now and save")}</button>
              <p className="text-muted" style={{ fontSize: "0.78rem", marginTop: 0 }}>{lang === "is" ? "Gerðu þetta tengd(ur) Wi-Fi staðarins (ekki farsímaneti)." : "Do this while connected to the venue's Wi-Fi (not mobile data)."}</p>
              <textarea className="form-input" rows={3} value={ipList} onChange={e => setIpList(e.target.value)} aria-label={lang === "is" ? "Leyfðar IP-tölur" : "Allowed IP addresses"} style={{ fontFamily: "monospace" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <button className="btn btn--primary" onClick={() => saveSettings("network")} disabled={settingsSaving !== null}>{settingsSaving === "network" ? t.saving : t.save}</button>
                <SettingsStatus section="network" />
              </div>
            </div>
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
                <button className="btn btn--primary" onClick={() => saveSettings("fields")} disabled={settingsSaving !== null}>{settingsSaving === "fields" ? t.saving : t.save}</button>
                <SettingsStatus section="fields" />
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
            <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-md)", padding: "12px", marginBottom: "12px" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                🔑 {lang === "is" ? "Innskráning — notendanafn + PIN" : "Login — username + PIN"}
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{lang === "is" ? "Notendanafn" : "Username"}</label>
                  <input className="form-input" autoCapitalize="none" placeholder={lang === "is" ? "t.d. anna" : "e.g. anna"} value={editForm.username || ""} onChange={e => setEditForm(f => ({ ...f, username: e.target.value.toLowerCase() }))} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{editMember.authType === "password" ? (lang === "is" ? "Nýr PIN" : "New PIN") : "PIN"}</label>
                  <input type="text" inputMode="numeric" maxLength={4} className="form-input" placeholder={editMember.authType === "password" ? (lang === "is" ? "(óbreytt ef tómt)" : "(unchanged if blank)") : (lang === "is" ? "4 tölustafir" : "4 digits")} value={editForm.password || ""} onChange={e => setEditForm(f => ({ ...f, password: e.target.value.replace(/\D/g, "") }))} />
                </div>
              </div>
            </div>
            <StaffFormFields form={editForm} onChange={setEditForm} lang={lang} isOwner={isOwner} pinAccount={editMember.authType === "password"} slug={slug} uid={editMember.uid} />
            {(portal.groupCompanies?.length ?? 0) > 1 && (
              <fieldset style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 14px", marginTop: 12 }}>
                <legend className="form-label" style={{ padding: "0 4px" }}>{lang === "is" ? "Starfsstaðir" : "Workplaces"}</legend>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {portal.groupCompanies!.map(c => {
                    const allowed = (portal.manageableCompanies || []).includes(c.slug);
                    return (
                      <label key={c.slug} style={{ display: "flex", gap: 6, alignItems: "center", opacity: allowed ? 1 : 0.5 }}>
                        <input type="checkbox" disabled={!allowed} checked={editCompanies.includes(c.slug)}
                          onChange={e => setEditCompanies(cs => e.target.checked ? [...cs, c.slug] : cs.filter(x => x !== c.slug))} />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
                <div className="text-muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>{lang === "is" ? "Kjör og uppgjör eru skráð sér á hvorum stað (ólíkar kennitölur)." : "Terms and payroll are kept separately per workplace."}</div>
              </fieldset>
            )}
            <div style={{ display: "flex", gap: "8px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn--primary" style={{ flex: 1, justifyContent: "center" }} disabled={saving} onClick={async () => {
                // Profile, role and PIN are separate server actions with separate permissions.
                const ok = await doPortalAction("PATCH", { uid: editMember.uid, action: "update", updates: profilePayload(editForm, true) }, "");
                if (!ok) return;
                if (isOwner && editForm.role && editForm.role !== editMember.role && !(await doPortalAction("PATCH", { uid: editMember.uid, action: "set-role", role: editForm.role }, ""))) return;
                if (editForm.password && !(await doPortalAction("PATCH", { uid: editMember.uid, action: "reset-pin", pin: editForm.password }, ""))) return;
                const before = [...(editMember.companies || [slug])].sort().join(",");
                if (editCompanies.length && [...editCompanies].sort().join(",") !== before && !(await doPortalAction("PATCH", { uid: editMember.uid, action: "set-companies", companies: editCompanies }, ""))) return;
                showMsg(lang === "is" ? "✅ Vistað" : "✅ Saved");
              }}>{saving ? t.saving : t.save}</button>
              {!!editMember.username && editMember.status === "approved" && (
                <button className="btn btn--secondary btn--sm" disabled={saving} onClick={() => { const m = editMember; pinAction("PATCH", { uid: m.uid, action: "send-pin" }, m.name); }}>
                  {lang === "is" ? "Senda nýtt PIN" : "Send new PIN"}
                </button>
              )}
              <button className="btn btn--sm" style={{ background: "rgba(255,77,106,0.1)", color: "var(--danger)", border: "1px solid rgba(255,77,106,0.3)" }} disabled={saving} onClick={() => { if (confirm(lang === "is" ? `Eyða ${editMember.name}? Stimplanir og launasaga varðveitast.` : `Delete ${editMember.name}? Punches and payroll history are kept.`)) doPortalAction("PATCH", { uid: editMember.uid, action: "delete" }, lang === "is" ? "Eytt" : "Deleted"); }}>{t.delete}</button>
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
            <div style={{ display: "flex", gap: "12px", marginBottom: "14px" }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{lang === "is" ? "Notendanafn" : "Username"} *</label>
                <input className="form-input" autoCapitalize="none" placeholder={lang === "is" ? "t.d. anna" : "e.g. anna"} value={addForm.username || ""} onChange={e => setAddForm(f => ({ ...f, username: e.target.value.toLowerCase() }))} required />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">PIN</label>
                <input type="text" inputMode="numeric" maxLength={4} className="form-input" placeholder={lang === "is" ? "tómt = sent í pósti" : "blank = sent by e-mail"} value={addForm.password || ""} onChange={e => setAddForm(f => ({ ...f, password: e.target.value.replace(/\D/g, "") }))} />
              </div>
            </div>
            <StaffFormFields form={addForm} onChange={setAddForm} lang={lang} isOwner={isOwner} pinAccount />
            {(portal.manageableCompanies?.length ?? 0) > 1 && (
              <fieldset style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "10px 14px", marginTop: 12 }}>
                <legend className="form-label" style={{ padding: "0 4px" }}>{lang === "is" ? "Starfsstaðir" : "Workplaces"}</legend>
                {(portal.groupCompanies || []).filter(c => portal.manageableCompanies!.includes(c.slug)).map(c => (
                  <label key={c.slug} style={{ display: "inline-flex", gap: 6, alignItems: "center", marginRight: 14 }}>
                    <input type="checkbox" checked={editCompanies.includes(c.slug)} onChange={e => setEditCompanies(cs => e.target.checked ? [...cs, c.slug] : cs.filter(x => x !== c.slug))} />
                    {c.name}
                  </label>
                ))}
              </fieldset>
            )}
            <button className="btn btn--primary" style={{ width: "100%", justifyContent: "center", marginTop: "16px" }} disabled={saving} onClick={() => pinAction("PUT", { ...profilePayload(addForm, false), ...(addForm.email ? { email: addForm.email } : {}), username: addForm.username, ...(addForm.password ? { password: addForm.password } : {}), role: addForm.role || "staff", companies: editCompanies.length ? editCompanies : [slug] }, addForm.name || addForm.username || "")}>{saving ? t.saving : lang === "is" ? "Bæta við" : "Add"}</button>
          </div>
        </div>
      )}
    </div>
  );
}




