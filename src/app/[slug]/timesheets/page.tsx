"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { ISSUE_TEXT, type Issue } from "@/lib/payroll/issues";
import { formatKr } from "@/lib/payroll/money";
import type { PayLine } from "@/lib/payroll/calculate";
import type { EmployerCost } from "@/lib/payroll/cost";

type Lang = "is" | "en";

const T = {
  is: {
    title: "Tímaskýrslur", back: "← Til baka", allStaff: "Allir starfsmenn", loading: "Hleður...", noData: "Engar færslur á þessu tímabili",
    hours: "Tímar", gross: "Laun", cost: "Launakostnaður (skilgreindir liðir)", lines: "Sundurliðun", hideLines: "Fela sundurliðun",
    status: { complete: "Tilbúið", estimate: "Áætlun", blocked: "Vantar upplýsingar" },
    period: { draft: "Drög", reviewed: "Yfirfarið", locked: "Læst uppgjör" },
    snapshot: "Birt úr læstu uppgjöri — endurreiknast ekki", notFinal: "Ekki endanleg tala",
    included: "Innifalið", excluded: "Ekki innifalið", draftRate: "drög", retry: "Reyna aftur",
    cols: ["Dags.", "Tími", "Liður", "Klst", "Taxti", "Upphæð", "Taxtaútgáfa"],
    orlof: "Orlof", pension: "Mótframlag lífeyris", funds: "Sjóðir", tg: "Tryggingagjald", total: "Samtals",
    preview: "Áætlun 2027 úr vaktaplani →", payroll: "Launavinnsla →", seed: "🧪 Mock gögn", seedDel: "🗑 Eyða mock",
  },
  en: {
    title: "Timesheets", back: "← Back", allStaff: "All staff", loading: "Loading...", noData: "No records in this period",
    hours: "Hours", gross: "Pay", cost: "Payroll cost (defined items)", lines: "Breakdown", hideLines: "Hide breakdown",
    status: { complete: "Ready", estimate: "Estimate", blocked: "Information missing" },
    period: { draft: "Draft", reviewed: "Reviewed", locked: "Locked payroll" },
    snapshot: "Shown from the locked payroll — not recalculated", notFinal: "Not a final figure",
    included: "Included", excluded: "Not included", draftRate: "draft", retry: "Retry",
    cols: ["Date", "Time", "Item", "Hours", "Rate", "Amount", "Rate table"],
    orlof: "Holiday pay", pension: "Employer pension", funds: "Union funds", tg: "Social security tax", total: "Total",
    preview: "2027 estimate from schedule →", payroll: "Payroll →", seed: "🧪 Mock data", seedDel: "🗑 Delete mock",
  },
};

interface Summary {
  uid: string; name: string; status: "complete" | "estimate" | "blocked"; totalHours: number; grossCents: number;
  lines: PayLine[]; issues: Issue[]; rateVersions: string[]; cost: EmployerCost | null;
}
interface Data {
  period: { key: string; start: string; endExclusive: string; endDateInclusive: string };
  periodStatus: "draft" | "reviewed" | "locked"; fromSnapshot: boolean; summaries: Summary[];
  totalGrossCents: number; totalCostCents: number | null;
}

const hhmm = (iso: string) => iso.slice(11, 16);
const kr = (c: number | null) => (c === null ? "—" : `${formatKr(c)} kr`);
const STATUS_COLOR = { complete: "var(--accent)", estimate: "#f0a500", blocked: "var(--danger)" };

function currentPeriodKey(offset: number) {
  const now = new Date(); let y = now.getUTCFullYear(); let m = now.getUTCMonth();
  if (now.getUTCDate() < 25) m -= 1;
  m += offset;
  while (m < 0) { m += 12; y -= 1; }
  while (m > 11) { m -= 12; y += 1; }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export default function TimesheetsPage() {
  const { slug } = useParams() as { slug: string };
  const [user, setUser] = useState<User | null>(null);
  const [lang, setLang] = useState<Lang>("is");
  const t = T[lang];
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [selectedUid, setSelectedUid] = useState("all");
  const [myRole, setMyRole] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [seedMsg, setSeedMsg] = useState("");

  useEffect(() => {
    try { const l = localStorage.getItem(`tv_lang_${slug}`); if (l === "en" || l === "is") setLang(l); } catch { /* ignore */ }
  }, [slug]);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!user) return;
    user.getIdToken().then(tok => fetch(`/api/${slug}/portal`, { headers: { Authorization: `Bearer ${tok}` } }))
      .then(r => r.json()).then(d => setMyRole(d.role || "")).catch(() => setMyRole(""));
  }, [user, slug]);

  const isAdmin = myRole === "admin" || myRole === "owner";

  const fetchData = useCallback(async () => {
    if (!user || !myRole) return;
    setLoading(true); setError("");
    try {
      const tok = await user.getIdToken();
      const qs = isAdmin ? `&uid=${selectedUid}` : "";
      const res = await fetch(`/api/${slug}/timesheets?period=${currentPeriodKey(offset)}${qs}`, { headers: { Authorization: `Bearer ${tok}` } });
      const d = await res.json();
      if (res.ok) setData(d); else { setData(null); setError(`${d.error || res.status}`); }
    } catch { setError(lang === "is" ? "Netvilla" : "Network error"); } finally { setLoading(false); }
  }, [user, myRole, isAdmin, slug, offset, selectedUid, lang]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const doSeed = async (del: boolean) => {
    if (!user) return;
    const tok = await user.getIdToken();
    const res = await fetch(`/api/${slug}/dev-seed`, { method: del ? "DELETE" : "POST", headers: { Authorization: `Bearer ${tok}` } });
    const d = await res.json().catch(() => ({}));
    setSeedMsg(d.message || d.error || String(res.status));
    if (res.ok) fetchData();
  };

  if (!user) return <div style={{ padding: 40, textAlign: "center" }}>{t.loading}</div>;
  const periodLabel = data
    ? `${new Date(data.period.start).toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(data.period.endDateInclusive + "T00:00:00Z").toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`
    : currentPeriodKey(offset);

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 0", background: "var(--bg-surface)", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href={`/${slug}`} style={{ color: "var(--text-muted)", fontSize: "0.88rem", textDecoration: "none" }}>{t.back}</Link>
            <h1 style={{ fontSize: "1.3rem", margin: 0 }}>{t.title}</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn btn--ghost btn--sm" aria-label={lang === "is" ? "Fyrra tímabil" : "Previous period"} onClick={() => setOffset(p => p - 1)}>‹</button>
            <span style={{ fontSize: "0.9rem", minWidth: 190, textAlign: "center" }} aria-live="polite">{periodLabel}</span>
            <button className="btn btn--ghost btn--sm" aria-label={lang === "is" ? "Næsta tímabil" : "Next period"} onClick={() => setOffset(p => p + 1)} disabled={offset >= 0}>›</button>
          </div>
          {isAdmin && (
            <select className="form-input" style={{ width: "auto" }} value={selectedUid} onChange={e => setSelectedUid(e.target.value)} aria-label={t.allStaff}>
              <option value="all">{t.allStaff}</option>
              {(data?.summaries || []).map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="container" style={{ padding: 24 }}>
        {isAdmin && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <Link className="btn btn--secondary btn--sm" href={`/${slug}/payroll`}>{t.payroll}</Link>
            <Link className="btn btn--secondary btn--sm" href={`/${slug}/payroll?preview=2027-01`}>{t.preview}</Link>
            {process.env.NODE_ENV !== "production" && <>
              <button className="btn btn--ghost btn--sm" onClick={() => doSeed(false)}>{t.seed}</button>
              <button className="btn btn--ghost btn--sm" onClick={() => doSeed(true)}>{t.seedDel}</button>
              {seedMsg && <span className="text-muted" style={{ fontSize: "0.8rem" }}>{seedMsg}</span>}
            </>}
          </div>
        )}

        {loading && <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }} role="status">{t.loading}</div>}
        {error && <div role="alert" style={{ background: "rgba(255,77,106,0.1)", border: "1px solid var(--danger)", borderRadius: 10, padding: 16, color: "var(--danger)", marginBottom: 16 }}>
          {error} <button className="btn btn--ghost btn--sm" onClick={fetchData}>{t.retry}</button></div>}

        {!loading && data && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
              <span className="badge" style={{ color: data.periodStatus === "locked" ? "var(--accent)" : "#f0a500" }}>{t.period[data.periodStatus]}</span>
              {data.fromSnapshot && <span className="text-muted" style={{ fontSize: "0.82rem" }}>{t.snapshot}</span>}
              {isAdmin && <span style={{ marginLeft: "auto", fontWeight: 600 }}>{t.gross}: {kr(data.totalGrossCents)}{data.totalCostCents !== null && ` · ${t.cost}: ${kr(data.totalCostCents)}`}</span>}
            </div>
            {data.summaries.length === 0 && <div className="card" style={{ textAlign: "center", color: "var(--text-muted)" }}>{t.noData}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {data.summaries.map(s => {
                const incomplete = s.lines.some(l => l.amountCents === null);
                return (
                  <div key={s.uid} className="card" style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "1.05rem" }}>{s.name}</div>
                        <span style={{ fontSize: "0.8rem", color: STATUS_COLOR[s.status] }}>● {t.status[s.status]}</span>
                        {s.status !== "complete" && <span className="text-muted" style={{ fontSize: "0.8rem" }}> · {t.notFinal}</span>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="text-muted" style={{ fontSize: "0.8rem" }}>{t.hours}: {s.totalHours.toFixed(2)}</div>
                        <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>{incomplete ? "—" : kr(s.grossCents)}</div>
                      </div>
                    </div>

                    {s.issues.length > 0 && (
                      <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: "0.85rem" }}>
                        {s.issues.map((i, n) => (
                          <li key={n} style={{ color: i.severity === "blocker" ? "var(--danger)" : "var(--text-secondary)" }}>
                            {ISSUE_TEXT[i.code]?.[lang] ?? i.code}{i.date ? ` (${i.date})` : ""}{i.detail ? ` — ${i.detail}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}

                    <button className="btn btn--ghost btn--sm" style={{ marginTop: 12 }} aria-expanded={!!open[s.uid]} onClick={() => setOpen(o => ({ ...o, [s.uid]: !o[s.uid] }))}>
                      {open[s.uid] ? t.hideLines : t.lines} ({s.lines.length})
                    </button>
                    {open[s.uid] && (
                      <div style={{ overflowX: "auto", marginTop: 8 }}>
                        <table className="table" style={{ fontSize: "0.82rem" }}>
                          <thead><tr>{t.cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
                          <tbody>
                            {s.lines.map((l, n) => (
                              <tr key={n} style={l.estimate ? { opacity: 0.75 } : undefined}>
                                <td>{l.date}</td>
                                <td style={{ fontFamily: "monospace" }}>{l.durationMs ? `${hhmm(l.start)}–${hhmm(l.end)}` : ""}</td>
                                <td>{lang === "is" ? l.labelIs : l.labelEn}{l.holiday ? ` · ${l.holiday}` : ""}</td>
                                <td>{l.durationMs ? (l.durationMs / 3_600_000).toFixed(2) : ""}</td>
                                <td>{l.rateCents === null ? "" : formatKr(l.rateCents)}</td>
                                <td>{kr(l.amountCents)}</td>
                                <td>{l.versionId ?? "—"}{l.versionStatus === "draft" && <span style={{ color: "#f0a500" }}> ({t.draftRate})</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {s.cost && (
                      <details style={{ marginTop: 10, fontSize: "0.85rem" }}>
                        <summary>{t.cost}: {kr(s.cost.totalCents)}{s.cost.rateStatus !== "verified" && ` (${t.notFinal})`}</summary>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px", marginTop: 8, maxWidth: 420 }}>
                          <span>{t.gross}</span><span>{kr(s.cost.grossCents)}</span>
                          <span>{t.orlof}</span><span>{kr(s.cost.orlofCents)}</span>
                          <span>{t.pension}</span><span>{kr(s.cost.employerPensionCents)}</span>
                          <span>{t.funds}</span><span>{kr(s.cost.unionFundsCents)}</span>
                          <span>{t.tg}</span><span>{kr(s.cost.tryggingagjaldCents)}</span>
                          <strong>{t.total}</strong><strong>{kr(s.cost.totalCents)}</strong>
                        </div>
                        <div className="text-muted" style={{ marginTop: 8 }}>{t.excluded}: {s.cost.excluded.join(" · ")}</div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
