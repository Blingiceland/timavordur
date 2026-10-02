"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, type User } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { isKennitala, isValidSlug } from "@/lib/onboarding";
import { PRODUCT_HOST } from "@/lib/branded-hosts";

type Lang = "is" | "en";

const T = {
  is: {
    title: "Byrjaðu að nota Tímavörð", lead: "Skráðu staðinn þinn — það tekur tvær mínútur og er frítt. Við förum yfir skráninguna og opnum aðganginn.",
    google: "Halda áfram með Google", googleNote: "Eigandi eða stjórnandi skráir staðinn með Google-aðgangi. Starfsfólk skráir sig síðar með notendanafni og PIN.",
    name: "Nafn staðar", slug: "Slóð", kt: "Kennitala rekstraraðila", type: "Tegund reksturs", bar: "Krá / skemmtistaður", restaurant: "Veitingastaður",
    phone: "Símanúmer", owner: "Nafnið þitt", authorized: "Ég er í forsvari fyrir rekstraraðilann eða hef umboð hans.",
    accept: "Ég samþykki", terms: "skilmála", and: "og", dpa: "vinnslusamning", create: "Stofna stað", creating: "Stofna…",
    free: "Laus", taken: "Upptekin", invalid: "Ógild slóð", ktBad: "Ógild kennitala",
    agreement: "Launaútreikningur ber kjör saman við kjarasamning SA og Eflingar (hótel og veitingahús). Starfsfólk á öðrum samningum (t.d. VR eða Matvís) má skrá á sérkjörum með eigin taxta og álögum, en þá er engin lágmarksathugun. Stimplun og vaktaplan virka fyrir alla.",
    signedInAs: "Innskráð(ur) sem", other: "Annar aðgangur", privacy: "Persónuvernd",
  },
  en: {
    title: "Start using Tímavörður", lead: "Register your venue — it takes two minutes and it's free. We review the registration and open access.",
    google: "Continue with Google", googleNote: "The owner or a manager registers the venue with a Google account. Staff sign up later with a username and PIN.",
    name: "Venue name", slug: "Address", kt: "Company ID (kennitala)", type: "Business type", bar: "Bar / nightclub", restaurant: "Restaurant",
    phone: "Phone", owner: "Your name", authorized: "I represent the business or am authorised by it.",
    accept: "I accept the", terms: "terms", and: "and", dpa: "data processing agreement", create: "Create venue", creating: "Creating…",
    free: "Available", taken: "Taken", invalid: "Invalid address", ktBad: "Invalid kennitala",
    agreement: "Pay is checked against the SA/Efling hotel & restaurant agreement. Staff on other agreements (e.g. VR or Matvís) can be recorded on custom terms with their own rate and premiums, without a minimum check. Clocking and scheduling work for everyone.",
    signedInAs: "Signed in as", other: "Use another account", privacy: "Privacy",
  },
};

const ERR: Record<string, [string, string]> = {
  slug_taken: ["Þessi slóð er þegar í notkun", "This address is taken"],
  kennitala_registered: ["Staður með þessa kennitölu er þegar skráður — hafðu samband", "A venue with this kennitala is already registered — contact us"],
  invalid_kennitala: ["Ógild kennitala", "Invalid kennitala"],
  invalid_slug: ["Ógild slóð", "Invalid address"],
  terms_required: ["Það þarf að samþykkja skilmálana", "Please accept the terms"],
  google_account_required: ["Skráðu þig inn með Google-aðgangi með staðfestu netfangi", "Sign in with a Google account with a verified e-mail"],
  too_many_attempts: ["Of margar skráningar — reyndu aftur síðar", "Too many sign-ups — try again later"],
};

export default function StartPage() {
  const [lang, setLang] = useState<Lang>("is");
  const t = T[lang];
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [f, setF] = useState({ name: "", slug: "", kennitala: "", businessType: "bar", phone: "", ownerName: "", authorized: false, acceptTerms: false });
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugState, setSlugState] = useState<"" | "free" | "taken" | "invalid">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    getRedirectResult(auth).catch(() => undefined);
    return onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); if (u?.displayName) setF((x) => (x.ownerName ? x : { ...x, ownerName: u.displayName || "" })); });
  }, []);

  // Suggest an address from the name, or check the one typed by the user.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = slugEdited ? `s=${encodeURIComponent(f.slug)}` : f.name.trim().length >= 2 ? `name=${encodeURIComponent(f.name)}` : "";
    if (!q) { setSlugState(""); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await (await fetch(`/api/onboarding/slug?${q}`)).json();
        if (!slugEdited && d.slug) setF((x) => ({ ...x, slug: d.slug }));
        setSlugState(d.available ? "free" : d.reason === "invalid" ? "invalid" : "taken");
      } catch { setSlugState(""); }
    }, 350);
  }, [f.name, f.slug, slugEdited]);

  const signIn = () => {
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) signInWithRedirect(auth, googleProvider); else signInWithPopup(auth, googleProvider).catch(() => undefined);
  };

  const ktOk = f.kennitala === "" || isKennitala(f.kennitala);
  const canSubmit = !!user && f.name.trim().length >= 2 && isValidSlug(f.slug) && slugState === "free" && isKennitala(f.kennitala) && f.authorized && f.acceptTerms && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canSubmit) return;
    setBusy(true); setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/onboarding/company", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...f, kennitala: f.kennitala.replace(/\D/g, "") }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setDone(true); return; }
      setError(ERR[d.error]?.[lang === "is" ? 0 : 1] || d.error || String(res.status));
    } catch { setError(lang === "is" ? "Netvilla — ekkert var stofnað. Reyndu aftur." : "Network error — nothing was created. Try again."); }
    finally { setBusy(false); }
  };

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <div className="container" style={{ maxWidth: 560, padding: "32px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <Link href="/" className="navbar__logo" style={{ textDecoration: "none" }}>⏱ Tíma<span>vörður</span></Link>
          <div style={{ display: "flex", gap: 4 }}>
            {(["is", "en"] as const).map((l) => (
              <button key={l} className={`btn btn--sm ${lang === l ? "btn--primary" : "btn--ghost"}`} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </div>
        <h1 style={{ fontSize: "1.6rem", marginBottom: 6 }}>{t.title}</h1>
        <p className="text-secondary" style={{ marginBottom: 24 }}>{t.lead}</p>

        {done ? (
          <div className="card" role="status" style={{ padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: "2.4rem" }}>✅</div>
            <h2 style={{ fontSize: "1.2rem" }}>{lang === "is" ? "Takk — skráningin er móttekin" : "Thanks — your registration is in"}</h2>
            <p className="text-secondary">{lang === "is"
              ? <>Við förum yfir hverja skráningu. Þú færð póst á <b>{user?.email}</b> um leið og aðgangurinn er opnaður, yfirleitt innan sólarhrings.</>
              : <>We review every registration. You will get an e-mail at <b>{user?.email}</b> as soon as access is opened, usually within a day.</>}</p>
            <p style={{ fontSize: "0.85rem" }}><Link href="/hafa-samband">{lang === "is" ? "Spurningar? Hafðu samband" : "Questions? Contact us"}</Link></p>
          </div>
        ) : !ready ? null : !user ? (
          <div className="card" style={{ padding: 24, textAlign: "center" }}>
            <button className="btn btn--primary btn--lg" onClick={signIn}>{t.google}</button>
            <p className="text-muted" style={{ fontSize: "0.85rem", marginTop: 12 }}>{t.googleNote}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="text-muted" style={{ fontSize: "0.85rem" }}>
              {t.signedInAs} <b>{user.email}</b> · <button type="button" className="btn btn--ghost btn--sm" onClick={() => signOut(auth)}>{t.other}</button>
            </div>
            <label className="form-group" style={{ margin: 0 }}><span className="form-label">{t.name} *</span>
              <input className="form-input" value={f.name} maxLength={80} required onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <label className="form-group" style={{ margin: 0 }}><span className="form-label">{t.slug} *</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <span className="text-muted" style={{ fontSize: "0.9rem" }}>{PRODUCT_HOST}/</span>
                <input className="form-input" style={{ flex: "1 1 140px" }} value={f.slug} maxLength={40} required aria-describedby="slug-state"
                  onChange={(e) => { setSlugEdited(true); setF({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }); }} />
              </div>
              <span id="slug-state" aria-live="polite" style={{ fontSize: "0.8rem", color: slugState === "free" ? "var(--accent)" : "var(--danger)" }}>
                {slugState === "free" ? `✓ ${t.free}` : slugState === "taken" ? t.taken : slugState === "invalid" ? t.invalid : ""}
              </span></label>
            <label className="form-group" style={{ margin: 0 }}><span className="form-label">{t.kt} *</span>
              <input className="form-input" inputMode="numeric" placeholder="000000-0000" value={f.kennitala} required aria-invalid={!ktOk}
                onChange={(e) => setF({ ...f, kennitala: e.target.value.replace(/[^\d-]/g, "").slice(0, 11) })} />
              {!ktOk && <span role="alert" style={{ fontSize: "0.8rem", color: "var(--danger)" }}>{t.ktBad}</span>}</label>
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend className="form-label">{t.type} *</legend>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["bar", "restaurant"] as const).map((v) => (
                  <label key={v} style={{ flex: "1 1 150px", display: "flex", gap: 8, alignItems: "center", padding: 10, borderRadius: 8, cursor: "pointer", border: `2px solid ${f.businessType === v ? "var(--brand)" : "var(--border)"}` }}>
                    <input type="radio" name="bt" checked={f.businessType === v} onChange={() => setF({ ...f, businessType: v })} />{t[v]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label className="form-group" style={{ margin: 0, flex: "1 1 180px" }}><span className="form-label">{t.owner}</span>
                <input className="form-input" value={f.ownerName} maxLength={120} onChange={(e) => setF({ ...f, ownerName: e.target.value })} /></label>
              <label className="form-group" style={{ margin: 0, flex: "1 1 140px" }}><span className="form-label">{t.phone}</span>
                <input className="form-input" type="tel" value={f.phone} maxLength={30} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
            </div>
            <p className="text-muted" style={{ fontSize: "0.82rem", margin: 0 }}>{t.agreement}</p>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.9rem" }}>
              <input type="checkbox" checked={f.authorized} onChange={(e) => setF({ ...f, authorized: e.target.checked })} style={{ marginTop: 3 }} />{t.authorized}
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.9rem" }}>
              <input type="checkbox" checked={f.acceptTerms} onChange={(e) => setF({ ...f, acceptTerms: e.target.checked })} style={{ marginTop: 3 }} />
              <span>{t.accept} <a href="/skilmalar" target="_blank">{t.terms}</a> {t.and} <a href="/vinnslusamningur" target="_blank">{t.dpa}</a>. <a href="/personuvernd" target="_blank">{t.privacy}</a>.</span>
            </label>
            {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{error}</div>}
            <button type="submit" className="btn btn--primary" disabled={!canSubmit}>{busy ? t.creating : t.create}</button>
          </form>
        )}
      </div>
    </div>
  );
}
