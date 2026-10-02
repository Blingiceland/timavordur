"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { STEPS, WAGE_CLASSES, versionForDate, type AgreementVersion, type Step, type WageClass } from "@/lib/payroll/agreements";
import { ISSUE_TEXT, type IssueCode } from "@/lib/payroll/issues";
import { formatKr, formatRate, fractionOfMonthly, hourlyFromMonthly, krToCents, parseKr, withPremium } from "@/lib/payroll/money";
import { resolveRates } from "@/lib/payroll/rates";
import type { EmploymentTerms } from "@/lib/payroll/terms";

type Lang = "is" | "en";
const STEP_LABEL: Record<Step, [string, string]> = { start: ["Byrjun", "Start"], y1: ["1 ár", "1 yr"], y3: ["3 ár", "3 yrs"], y5: ["5 ár", "5 yrs"] };

interface Explain {
  date: string; ok: boolean; issues: IssueCode[]; termsId?: string; version?: string; versionStatus?: string;
  wageClass?: number; step?: Step; stepBasis?: string; managementRole?: boolean; minimumMonthly?: number; minimumDayCents?: number;
  basis?: "minimum" | "personal"; dayCents?: number; overtimeCents?: number; orlofBp?: number;
}
interface EmployeeRow { uid: string; name: string; current: Explain; nextYear: Explain; needsPlacement: boolean }
interface TermsRecord { id: string; effectiveFrom: string; recordedAt: string; reason: string; status: string; wageClass: number | null; workingArrangement: string | null; payType: string; employmentPercentage: number | null; personalDayRate: number | null; monthlySalary: number | null }

const EMPTY_FORM = {
  effectiveFrom: "", reason: "", workingArrangement: "shift", payType: "hourly", employmentPercentage: "100", wageClass: "6",
  managementRole: false, birthDate: "", employerStartDate: "", priorIndustryMonths: "", experienceVerifiedOn: "",
  personalDayRate: "", monthlySalary: "",
};

function rateRow(v: AgreementVersion, cls: WageClass, step: Step) {
  const m = v.monthly[cls][step];
  const day = hourlyFromMonthly(m, v.rules.dayDivisor);
  return { monthly: m, day, p33: withPremium(day, 33), p45: withPremium(day, 45), p55: withPremium(day, 55), p90: withPremium(day, 90), ot: fractionOfMonthly(m, v.rules.overtimePerMillion, 1_000_000) };
}

function ExplainBox({ e, lang }: { e: Explain; lang: Lang }) {
  const is = lang === "is";
  if (!e.ok) return <ul style={{ margin: 0, paddingLeft: 18, color: "var(--danger)" }}>{e.issues.map(c => <li key={c}>{ISSUE_TEXT[c]?.[lang] ?? c}</li>)}</ul>;
  return (
    <div style={{ fontSize: "0.88rem", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 14px" }}>
      <span className="text-muted">{is ? "Taxtaútgáfa" : "Rate table"}</span><span>{e.version} {e.versionStatus === "draft" && <b style={{ color: "#f0a500" }}>{is ? "(drög — ekki greiðslugrunnur)" : "(draft — not a payment basis)"}</b>}</span>
      <span className="text-muted">{is ? "Launaflokkur / þrep" : "Class / step"}</span><span>{e.wageClass} · {e.step ? STEP_LABEL[e.step][is ? 0 : 1] : ""}{e.managementRole ? (is ? " · +15% stjórnun" : " · +15% management") : ""}</span>
      <span className="text-muted">{is ? "Rökstuðningur þreps" : "Step basis"}</span><span>{e.stepBasis}</span>
      <span className="text-muted">{is ? "Samningslágmark" : "Agreement minimum"}</span><span>{formatKr((e.minimumMonthly ?? 0) * 100)} kr/{is ? "mán" : "mo"} · {formatRate(e.minimumDayCents ?? 0)} kr/{is ? "klst" : "h"}</span>
      <span className="text-muted">{is ? "Notaður dagvinnutaxti" : "Day rate used"}</span><span>{formatRate(e.dayCents ?? 0)} kr/{is ? "klst" : "h"} ({e.basis === "personal" ? (is ? "persónuleg kjör" : "personal terms") : (is ? "samningslágmark" : "agreement minimum")})</span>
      <span className="text-muted">{is ? "Yfirvinna" : "Overtime"}</span><span>{formatRate(e.overtimeCents ?? 0)} kr/{is ? "klst" : "h"}</span>
      <span className="text-muted">{is ? "Orlof" : "Holiday pay"}</span><span>{((e.orlofBp ?? 0) / 100).toFixed(2).replace(".", ",")}%</span>
      {e.issues.length > 0 && <><span className="text-muted">{is ? "Athugasemdir" : "Notes"}</span><ul style={{ margin: 0, paddingLeft: 18, color: "var(--danger)" }}>{e.issues.map(c => <li key={c}>{ISSUE_TEXT[c]?.[lang] ?? c}</li>)}</ul></>}
    </div>
  );
}

export default function RatesPage() {
  return <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>…</div>}><RatesInner /></Suspense>;
}

function RatesInner() {
  const { slug } = useParams() as { slug: string };
  const search = useSearchParams();
  const [lang, setLang] = useState<Lang>("is");
  const is = lang === "is";
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState("");
  const [year, setYear] = useState<2026 | 2027>(2026);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mine, setMine] = useState<{ current: Explain; nextYear: Explain } | null>(null);
  const [rows, setRows] = useState<EmployeeRow[] | null>(null);
  const [sel, setSel] = useState<string>(search.get("uid") || "");
  const [history, setHistory] = useState<TermsRecord[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => { try { const l = localStorage.getItem(`tv_lang_${slug}`); if (l === "en" || l === "is") setLang(l); } catch { /* ignore */ } }, [slug]);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const isAdmin = role === "admin" || role === "owner";

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const tok = await user!.getIdToken();
    const res = await fetch(`/api/${slug}${path}`, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${tok}`, "Content-Type": "application/json" } });
    const d = await res.json().catch(() => ({}));
    return { res, d };
  }, [user, slug]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const p = await api("/portal");
        setRole(p.d.role || "");
        const t = await api(`/terms`);
        if (t.res.ok) setMine({ current: t.d.current, nextYear: t.d.nextYear }); else setLoadError(t.d.error || String(t.res.status));
      } catch { setLoadError(is ? "Netvilla" : "Network error"); }
    })();
  }, [user, api, is]);

  const loadAll = useCallback(async () => {
    const r = await api(`/terms?uid=all`);
    if (r.res.ok) setRows(r.d.employees); else setLoadError(r.d.error || String(r.res.status));
  }, [api]);
  useEffect(() => { if (user && isAdmin) loadAll(); }, [user, isAdmin, loadAll]);

  const loadHistory = useCallback(async (uid: string) => {
    const r = await api(`/terms?uid=${encodeURIComponent(uid)}`);
    if (r.res.ok) setHistory(r.d.history);
  }, [api]);
  useEffect(() => { if (sel && isAdmin) loadHistory(sel); }, [sel, isAdmin, loadHistory]);

  const selectYear = (y: 2026 | 2027) => { setYear(y); setDate(y === 2027 ? "2027-01-01" : (new Date().getUTCFullYear() === 2026 ? new Date().toISOString().slice(0, 10) : "2026-04-01")); };

  const current = useMemo(() => versionForDate(date), [date]);
  const next = useMemo(() => {
    if (!current.ok || !current.version.effectiveTo) return null;
    const r = versionForDate(current.version.effectiveTo);
    return r.ok ? r.version : null;
  }, [current]);

  // Live minimum for the terms being entered — same engine as payroll, nothing is saved.
  const live = useMemo(() => {
    if (!sel) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(form.effectiveFrom) ? form.effectiveFrom : new Date().toISOString().slice(0, 10);
    const num = (v: string) => (v === "" || Number.isNaN(Number(v)) ? null : Number(v));
    const money = (v: string) => (v.trim() === "" || Number.isNaN(parseKr(v)) ? null : parseKr(v));
    const t: EmploymentTerms = {
      id: "preview", uid: sel, effectiveFrom: "1900-01-01", recordedAt: "", recordedBy: "", reason: "", status: "active",
      agreementId: "efling_sa_hotel", workingArrangement: form.workingArrangement as EmploymentTerms["workingArrangement"],
      payType: form.payType as EmploymentTerms["payType"], employmentPercentage: num(form.employmentPercentage),
      wageClass: Number(form.wageClass) as WageClass, managementRole: form.managementRole,
      birthDate: form.birthDate || null, employerStartDate: form.employerStartDate || null,
      priorIndustryMonths: num(form.priorIndustryMonths), experienceVerifiedOn: form.experienceVerifiedOn || null,
      stepOverride: null, personalDayRate: null, monthlySalary: null, fixedAdditions: [], orlofOverrideBp: null,
    };
    const res = resolveRates([t], date);
    if (!res.ok) return { date, ok: false as const, issues: res.issues.map(i => i.code) };
    const x = res.rates;
    let personalCents: number | null = null;
    if (form.payType === "hourly" && money(form.personalDayRate)) personalCents = krToCents(money(form.personalDayRate)!);
    if (form.payType === "monthly" && money(form.monthlySalary) && num(form.employmentPercentage)) {
      personalCents = Math.round((krToCents(money(form.monthlySalary)!) * 100) / num(form.employmentPercentage)! / x.version.rules.dayDivisor);
    }
    return {
      date, ok: true as const, version: x.version.version, draft: x.version.status === "draft", wageClass: x.wageClass, step: x.step,
      stepBasis: x.stepBasis, minimumMonthly: x.minimumMonthly, minimumDayCents: x.minimumDayCents, overtimeCents: x.overtimeCents,
      personalCents, issues: x.issues.map(i => i.code).filter(c => c !== "unverified_rate_version"),
    };
  }, [sel, form]);

  const submitTerms = async () => {
    const moneyField = form.payType === "hourly" ? form.personalDayRate : form.monthlySalary;
    if (moneyField.trim() !== "" && Number.isNaN(parseKr(moneyField))) {
      setMsg({ ok: false, text: is ? "Ólæsileg fjárhæð — skrifaðu t.d. 2801,87 eða 2.801,87" : "Unreadable amount — e.g. 2801.87" });
      return;
    }
    setBusy(true); setMsg(null);
    const num = (v: string) => (v === "" ? null : Number(v));
    const money = (v: string) => (v.trim() === "" ? null : parseKr(v));
    const body = {
      uid: sel, effectiveFrom: form.effectiveFrom, reason: form.reason, workingArrangement: form.workingArrangement, payType: form.payType,
      employmentPercentage: num(form.employmentPercentage), wageClass: num(form.wageClass), managementRole: form.managementRole,
      birthDate: form.birthDate || null, employerStartDate: form.employerStartDate || null, priorIndustryMonths: num(form.priorIndustryMonths),
      experienceVerifiedOn: form.experienceVerifiedOn || null, personalDayRate: form.payType === "hourly" ? money(form.personalDayRate) : null,
      monthlySalary: form.payType === "monthly" ? money(form.monthlySalary) : null,
    };
    try {
      const { res, d } = await api("/terms", { method: "POST", body: JSON.stringify(body) });
      if (res.ok) { setMsg({ ok: true, text: is ? "✅ Ný kjör skráð frá gildisdegi. Eldri kjör varðveitt." : "✅ New terms recorded from the effective date. Earlier terms kept." }); setForm(EMPTY_FORM); await Promise.all([loadAll(), loadHistory(sel)]); }
      else setMsg({ ok: false, text: `${is ? "Ekki vistað" : "Not saved"} (${res.status}): ${(d.errors || [d.error]).join(", ")}` });
    } catch { setMsg({ ok: false, text: is ? "Netvilla — ekki vistað" : "Network error — not saved" }); }
    finally { setBusy(false); }
  };

  if (!user) return <div style={{ padding: 40, textAlign: "center" }}>{is ? "Hleður..." : "Loading..."}</div>;
  const v = current.ok ? current.version : null;
  const missing = rows?.filter(r => r.needsPlacement) ?? [];

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 0", background: "var(--bg-surface)" }}>
        <div className="container" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Link href={`/${slug}`} style={{ color: "var(--text-muted)", fontSize: "0.88rem", textDecoration: "none" }}>{is ? "← Til baka" : "← Back"}</Link>
          <h1 style={{ fontSize: "1.3rem", margin: 0 }}>{is ? "Launataxtar og kjör" : "Wage rates and terms"}</h1>
        </div>
      </div>
      <div className="container" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        {loadError && <div role="alert" style={{ color: "var(--danger)" }}>{loadError}</div>}

        {/* Year + date */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div role="tablist" aria-label={is ? "Ár" : "Year"} style={{ display: "flex", gap: 4 }}>
              {([2026, 2027] as const).map(y => (
                <button key={y} role="tab" aria-selected={year === y} className={`btn btn--sm ${year === y ? "btn--primary" : "btn--ghost"}`} onClick={() => selectYear(y)}>{y}</button>
              ))}
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem" }}>
              {is ? "Gildir á dagsetningu" : "In force on"}
              <input type="date" className="form-input" style={{ width: "auto" }} value={date} min="2026-01-01" max="2027-12-31" onChange={e => e.target.value && setDate(e.target.value)} />
            </label>
          </div>
          <p className="text-secondary" style={{ fontSize: "0.85rem", marginTop: 12, marginBottom: 0 }}>
            {is ? "Taxtar hér eru LÁGMARKSTAXTAR kjarasamnings SA/Eflingar (hótel og veitingahús). Persónuleg kjör starfsmanns (yfirborgun, föst viðbót) eru skráð sér og koma aldrei í stað lágmarksins." : "These are the SA/Efling (hotel & restaurant) agreement MINIMUM rates. An employee's personal terms are recorded separately and never replace the minimum."}
          </p>
        </div>

        {!v && <div className="card" role="alert" style={{ color: "var(--danger)" }}>{is ? "Enginn taxti gildir á þessari dagsetningu." : "No rate table covers this date."}</div>}
        {v && (
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: "1.05rem", margin: 0 }}>{is ? "Útgáfa" : "Version"} {v.version} · {is ? "gildir frá" : "from"} {v.effectiveFrom}{v.effectiveTo ? ` ${is ? "til" : "to"} ${v.effectiveTo}` : ""}</h2>
              <span className="badge" style={{ color: v.status === "verified" ? "var(--accent)" : "#f0a500" }}>
                {v.status === "verified" ? (is ? "Staðfest gegn birtri töflu" : "Verified against published table") : (is ? "DRÖG — ekki greiðslugrunnur" : "DRAFT — not a payment basis")}
              </span>
            </div>
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="table" style={{ fontSize: "0.84rem" }}>
                <caption style={{ textAlign: "left", fontSize: "0.8rem" }} className="text-muted">{is ? "kr. Mánaðarlaun og tímakaup; næsta útgáfa og breyting í dálkum til hægri." : "ISK. Monthly and hourly; next version and change on the right."}</caption>
                <thead><tr>
                  <th>{is ? "Flokkur" : "Class"}</th><th>{is ? "Þrep" : "Step"}</th><th>{is ? "Mánaðarlaun" : "Monthly"}</th><th>{is ? "Dagvinna" : "Day"}</th>
                  <th>33%</th><th>45%</th><th>55%</th><th>90%</th><th>{is ? "Yfirvinna" : "Overtime"}</th>
                  {next && <><th>{is ? "Næst" : "Next"} ({next.version})</th><th>{is ? "Breyting" : "Change"}</th></>}
                </tr></thead>
                <tbody>
                  {WAGE_CLASSES.flatMap(cls => STEPS.map(step => {
                    const a = rateRow(v, cls, step);
                    const b = next ? rateRow(next, cls, step) : null;
                    return (
                      <tr key={`${cls}-${step}`}>
                        <td>{cls}</td><td>{STEP_LABEL[step][is ? 0 : 1]}</td><td>{formatKr(a.monthly * 100)}</td><td>{formatRate(a.day)}</td>
                        <td>{formatRate(a.p33)}</td><td>{formatRate(a.p45)}</td><td>{formatRate(a.p55)}</td><td>{formatRate(a.p90)}</td><td>{formatRate(a.ot)}</td>
                        {b && <><td>{formatKr(b.monthly * 100)}{next!.status === "draft" && <span style={{ color: "#f0a500" }}> *</span>}</td>
                          <td>{formatKr((b.monthly - a.monthly) * 100)} ({(((b.monthly - a.monthly) / a.monthly) * 100).toFixed(2).replace(".", ",")}%)</td></>}
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
            {next?.status === "draft" && <p style={{ fontSize: "0.82rem", color: "#f0a500" }}>* {is ? "Næsta útgáfa er óstaðfest drög." : "The next version is an unverified draft."}</p>}
            <ul style={{ fontSize: "0.82rem", marginTop: 10 }}>
              {v.notes.map(n => <li key={n}>{n}</li>)}
              {v.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> — {s.locator} ({is ? "skoðað" : "checked"} {s.checkedOn})</li>)}
            </ul>
          </div>
        )}

        {mine && (
          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>{is ? "Mínar forsendur" : "My terms"}</h2>
            <ExplainBox e={mine.current} lang={lang} />
            <h3 style={{ fontSize: "0.95rem", marginBottom: 6 }}>{is ? "Frá næstu áramótum" : "From next New Year"} ({mine.nextYear.date})</h3>
            <ExplainBox e={mine.nextYear} lang={lang} />
          </div>
        )}

        {isAdmin && rows && (
          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>{is ? "Starfsfólk" : "Staff"} {missing.length > 0 && <span style={{ color: "var(--danger)", fontSize: "0.9rem" }}>· {missing.length} {is ? "vantar röðun / upplýsingar" : "need placement / data"}</span>}</h2>
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ fontSize: "0.84rem" }}>
                <thead><tr><th>{is ? "Nafn" : "Name"}</th><th>{is ? "Nú" : "Now"}</th><th>{is ? "Frá áramótum" : "From New Year"}</th><th></th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.uid} style={r.needsPlacement ? { background: "rgba(255,77,106,0.06)" } : undefined}>
                      <td>{r.name}</td>
                      <td>{r.current.ok ? `fl. ${r.current.wageClass} · ${STEP_LABEL[r.current.step!][is ? 0 : 1]} · ${formatRate(r.current.dayCents!)} kr` : "—"}{r.current.issues.length > 0 && <div style={{ color: "var(--danger)" }}>{r.current.issues.map(c => ISSUE_TEXT[c]?.[lang] ?? c).join("; ")}</div>}</td>
                      <td>{r.nextYear.ok ? `${formatRate(r.nextYear.dayCents!)} kr${r.nextYear.versionStatus === "draft" ? (is ? " (drög)" : " (draft)") : ""}` : "—"}</td>
                      <td><button className="btn btn--secondary btn--sm" onClick={() => { setSel(r.uid); setMsg(null); }}>{is ? "Skrá kjör" : "Record terms"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isAdmin && sel && (
          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>{is ? "Ný ráðningarkjör" : "New employment terms"}: {rows?.find(r => r.uid === sel)?.name ?? sel}</h2>
            <p className="text-secondary" style={{ fontSize: "0.85rem" }}>{is ? "Skráning bætist við söguna frá gildisdegi — eldri færslur og lokuð uppgjör breytast ekki." : "A record is added to the history from its effective date — earlier records and locked payrolls do not change."}</p>
            {history.length > 0 && (
              <details style={{ marginBottom: 12, fontSize: "0.84rem" }}>
                <summary>{is ? "Saga" : "History"} ({history.length})</summary>
                <ul>{history.map(h => <li key={h.id}>{h.effectiveFrom} · {h.status} · fl. {h.wageClass ?? "?"} · {h.workingArrangement ?? "?"} · {h.payType} · {h.employmentPercentage ?? "?"}% {h.personalDayRate ? `· ${h.personalDayRate} kr/klst` : ""}{h.monthlySalary ? `· ${h.monthlySalary} kr/mán` : ""} — {h.reason}</li>)}</ul>
              </details>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
              {([
                ["effectiveFrom", is ? "Gildir frá *" : "Effective from *", "date"],
                ["employerStartDate", is ? "Upphaf ráðningar" : "Employment start", "date"],
                ["birthDate", is ? "Fæðingardagur" : "Birth date", "date"],
                ["priorIndustryMonths", is ? "Staðfest fyrri reynsla (mán.)" : "Verified prior experience (months)", "number"],
                ["experienceVerifiedOn", is ? "Reynsla staðfest dags." : "Experience verified on", "date"],
                ["employmentPercentage", is ? "Starfshlutfall %" : "Employment %", "number"],
              ] as const).map(([k, label, type]) => (
                <label key={k} className="form-group" style={{ margin: 0 }}>
                  <span className="form-label">{label}</span>
                  <input className="form-input" type={type} value={String(form[k])} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </label>
              ))}
              <label className="form-group" style={{ margin: 0 }}><span className="form-label">{is ? "Launaflokkur" : "Wage class"}</span>
                <select className="form-input" value={form.wageClass} onChange={e => setForm(f => ({ ...f, wageClass: e.target.value }))}>
                  <option value="6">6 — {is ? "almennt starfsfólk veitingahúsa" : "general restaurant staff"}</option>
                  <option value="7">7 — {is ? "sérþjálfað starfsfólk" : "specially trained staff"}</option>
                </select></label>
              <label className="form-group" style={{ margin: 0 }}><span className="form-label">{is ? "Vinnufyrirkomulag" : "Working arrangement"}</span>
                <select className="form-input" value={form.workingArrangement} onChange={e => setForm(f => ({ ...f, workingArrangement: e.target.value }))}>
                  <option value="shift">{is ? "Vaktavinna (gr. 3)" : "Shift work (3)"}</option>
                  <option value="casual">{is ? "Tilfallandi vinna (gr. 2.2.3)" : "Casual work (2.2.3)"}</option>
                  <option value="day">{is ? "Dagvinna (gr. 2.1)" : "Day work (2.1)"}</option>
                </select></label>
              <label className="form-group" style={{ margin: 0 }}><span className="form-label">{is ? "Launategund" : "Pay type"}</span>
                <select className="form-input" value={form.payType} onChange={e => setForm(f => ({ ...f, payType: e.target.value }))}>
                  <option value="hourly">{is ? "Tímakaup" : "Hourly"}</option>
                  <option value="monthly">{is ? "Föst mánaðarlaun" : "Fixed monthly"}</option>
                </select></label>
              {form.payType === "hourly"
                ? <label className="form-group" style={{ margin: 0 }}><span className="form-label">{is ? "Persónulegur dagvinnutaxti (kr/klst, valfrjálst)" : "Personal day rate (optional)"}</span>
                    <input className="form-input" type="text" inputMode="decimal" placeholder="2801,87" aria-invalid={form.personalDayRate.trim() !== "" && Number.isNaN(parseKr(form.personalDayRate))} value={form.personalDayRate} onChange={e => setForm(f => ({ ...f, personalDayRate: e.target.value }))} /></label>
                : <label className="form-group" style={{ margin: 0 }}><span className="form-label">{is ? "Mánaðarlaun fyrir starfshlutfallið *" : "Monthly salary for the percentage *"}</span>
                    <input className="form-input" type="text" inputMode="decimal" placeholder="520000" aria-invalid={form.monthlySalary.trim() !== "" && Number.isNaN(parseKr(form.monthlySalary))} value={form.monthlySalary} onChange={e => setForm(f => ({ ...f, monthlySalary: e.target.value }))} /></label>}
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={form.managementRole} onChange={e => setForm(f => ({ ...f, managementRole: e.target.checked }))} />
                {is ? "Ráðin(n) til stjórnunarstarfa skv. ráðningarsamningi (+15%, gr. 1.2.4)" : "Employed in a management role per contract (+15%, 1.2.4)"}
              </label>
              <label className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}><span className="form-label">{is ? "Ástæða / heimild *" : "Reason / source *"}</span>
                <input className="form-input" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder={is ? "t.d. ráðningarsamningur dags. …" : "e.g. employment contract dated …"} /></label>
            </div>
            {live && (
              <div aria-live="polite" style={{ marginTop: 14, padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-surface)", fontSize: "0.9rem" }}>
                {!live.ok ? (
                  <span style={{ color: "var(--danger)" }}>{live.issues.map(c => ISSUE_TEXT[c]?.[lang] ?? c).join("; ")}</span>
                ) : (
                  <>
                    <div><b>{is ? "Samningslágmark" : "Agreement minimum"} {live.date}:</b> {is ? "fl." : "cl."} {live.wageClass} · {STEP_LABEL[live.step][is ? 0 : 1]}{form.managementRole ? " · +15%" : ""} → <b>{formatRate(live.minimumDayCents)} kr/{is ? "klst" : "h"}</b> ({formatKr(live.minimumMonthly * 100)} kr/{is ? "mán" : "mo"} {is ? "fyrir fullt starf" : "full-time"}) · {is ? "yfirvinna" : "overtime"} {formatRate(live.overtimeCents)} kr</div>
                    <div className="text-muted" style={{ fontSize: "0.82rem" }}>{is ? "Þrep" : "Step"}: {live.stepBasis} · {is ? "taxtaútgáfa" : "rate table"} {live.version}{live.draft && <b style={{ color: "#f0a500" }}> ({is ? "drög" : "draft"})</b>}</div>
                    {live.personalCents !== null && (
                      live.personalCents >= live.minimumDayCents
                        ? <div style={{ color: "var(--accent)" }}>{is ? "Persónuleg kjör" : "Personal terms"}: {formatRate(live.personalCents)} kr/{is ? "klst" : "h"}{form.payType === "monthly" ? (is ? " (reiknað úr mánaðarlaunum)" : " (from monthly salary)") : ""} — {formatRate(live.personalCents - live.minimumDayCents)} kr ({(((live.personalCents - live.minimumDayCents) / live.minimumDayCents) * 100).toFixed(1).replace(".", ",")}%) {is ? "yfir lágmarki" : "above minimum"}</div>
                        : <div style={{ color: "var(--danger)" }}><b>{is ? "Undir lágmarki" : "Below minimum"}:</b> {formatRate(live.personalCents)} kr/{is ? "klst" : "h"} — {formatRate(live.minimumDayCents - live.personalCents)} kr {is ? "vantar upp á. Kerfið reiknar lágmarkið og merkir frávik." : "short. The engine pays the minimum and flags it."}</div>
                    )}
                    {live.issues.length > 0 && <div style={{ color: "#f0a500", fontSize: "0.82rem" }}>{live.issues.map(c => ISSUE_TEXT[c]?.[lang] ?? c).join("; ")}</div>}
                  </>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn btn--primary" disabled={busy || !form.effectiveFrom || form.reason.length < 3} onClick={submitTerms}>{busy ? "..." : (is ? "Skrá kjör" : "Record terms")}</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setSel("")}>{is ? "Loka" : "Close"}</button>
              {msg && <span role={msg.ok ? "status" : "alert"} style={{ color: msg.ok ? "var(--accent)" : "var(--danger)", fontSize: "0.88rem" }}>{msg.text}</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
