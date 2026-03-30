"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { useTheme } from "@/lib/theme";

type Lang = "is" | "en";

const T = {
  is: {
    title: "Tímaskýrslur", back: "← Til baka", allStaff: "Allir starfsmenn",
    hours: "Tímar", wage: "Brúttólaun", cost: "Heildarkostnaður", loading: "Hleður...",
    noData: "Engar færslur á þessu tímabili", open: "Opin vakt", perHr: "kr/klst",
    dagvinna: "Dagvinna", kvoldvinna: "Kvöldvinna (+33%)", helgarvinna: "Helgar (+45%)",
    naetuvinna: "Nætur (+55%)", storhatid: "Stórhátíð (+90%)",
    total: "Samtals", shifts: "Vaktir",
    pension: "+ Lífeyrir (11,5%)", social: "+ Tryggingagjald (6,35%)",
    totalCost: "Heildarkostnaður vinnuveitanda", noRate: "Kaup ekki stillt",
    monthly: "Föst mánaðarlaun", averaged: "Jafnaðarkaup",
    seedBtn: "🧪 Búa til mock gögn", seedDel: "🗑 Eyða mock gögnum", seeding: "Hleður...",
    showShifts: "Sýna vaktir", hideShifts: "Fela vaktir",
    avgPerHr: "Meðalkostnaður/klst",
  },
  en: {
    title: "Timesheets", back: "← Back", allStaff: "All staff",
    hours: "Hours", wage: "Gross wages", cost: "Total cost", loading: "Loading...",
    noData: "No records for this period", open: "Open shift", perHr: "ISK/hr",
    dagvinna: "Day rate", kvoldvinna: "Evening (+33%)", helgarvinna: "Weekend (+45%)",
    naetuvinna: "Night (+55%)", storhatid: "Holiday (+90%)",
    total: "Total", shifts: "Shifts",
    pension: "+ Pension (11.5%)", social: "+ Social tax (6.35%)",
    totalCost: "Total employer cost", noRate: "Rate not set",
    monthly: "Fixed monthly", averaged: "Averaged pay",
    seedBtn: "🧪 Create mock data", seedDel: "🗑 Delete mock data", seeding: "Loading...",
    showShifts: "Show shifts", hideShifts: "Hide shifts",
    avgPerHr: "Avg. cost/hr",
  },
};

const RATE_COLORS: Record<string, string> = {
  dagvinna: "#6c63ff", kvoldvinna: "#f59e0b", helgarvinna: "#10b981",
  naetuvinna: "#8b5cf6", storhatid: "#ef4444",
};

// Always 24h, UTC
function fmt24(iso: string) {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function fmtHrs(h: number) {
  const hh = Math.floor(h); const mm = Math.round((h - hh) * 60);
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
}
function fmtKr(n: number) { return n.toLocaleString("is-IS") + " kr"; }
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("is-IS", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

interface Segment { labelIs: string; labelEn: string; hours: number; multiplier: number; wage: number; category: string; }
interface CostBreakdown { brutto: number; orlof: number; orlofsRate: number; gjaldskyldBase: number; employerPension: number; socialTax: number; total: number; }
interface Shift { date: string; inTime: string; outTime: string | null; hours: number; wage: number; segments: Segment[]; open: boolean; }
interface Summary { uid: string; name: string; payType: string; hourlyRate: number; monthlyRate: number; totalHours: number; bruttoWage: number; employerCost: number; costBreakdown?: CostBreakdown; shifts: Shift[]; }
interface TimesheetData { period: { start: string; end: string }; summaries: Summary[]; totalEmployerCost: number; }

function getPeriodLabel(start: string, end: string) {
  const s = new Date(start); const e = new Date(end);
  return `${s.getUTCDate()}. ${s.toLocaleString("is-IS", { month: "short", timeZone: "UTC" })} – ${e.getUTCDate()}. ${e.toLocaleString("is-IS", { month: "long", timeZone: "UTC" })} ${e.getUTCFullYear()}`;
}
function getPeriodParam(offset = 0) {
  const now = new Date(); let y = now.getUTCFullYear(); let m = now.getUTCMonth();
  if (now.getUTCDate() < 25) m -= 1;
  m += offset;
  while (m < 0) { m += 12; y -= 1; }
  while (m > 11) { m -= 12; y += 1; }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

// Aggregate hours and wage per category across all shifts
function aggregateBreakdown(shifts: Shift[]) {
  const result: Record<string, { hours: number; wage: number; label: string; }> = {};
  for (const sh of shifts) {
    for (const seg of (sh.segments || [])) {
      if (!result[seg.category]) result[seg.category] = { hours: 0, wage: 0, label: seg.labelIs };
      result[seg.category].hours += seg.hours;
      result[seg.category].wage += seg.wage;
    }
  }
  return result;
}

const CATEGORY_ORDER = ["dagvinna", "kvoldvinna", "helgarvinna", "naetuvinna", "storhatid"] as const;

export default function TimesheetsPage() {
  const { slug } = useParams() as { slug: string };
  const [user, setUser] = useState<User | null>(null);
  const [lang] = useState<Lang>(() => (typeof window !== "undefined" ? (localStorage.getItem(`tv_lang_${slug}`) as Lang) || "is" : "is"));
  const { theme } = useTheme();
  const t = T[lang];

  const [data, setData] = useState<TimesheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedUid, setSelectedUid] = useState("all");
  const [myRole, setMyRole] = useState("");
  const [showShifts, setShowShifts] = useState<Record<string, boolean>>({});
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");

  useEffect(() => { return onAuthStateChanged(auth, setUser); }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/timesheets?period=${getPeriodParam(periodOffset)}&uid=${selectedUid}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (res.ok) setData(d); else setError(d.error || "Villa");
    } catch { setError("Netvillla"); } finally { setLoading(false); }
  }, [user, slug, periodOffset, selectedUid]);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then(token =>
      fetch(`/api/${slug}/portal`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setMyRole(d.role || ""))
    );
  }, [user, slug]);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const doSeed = async (del = false) => {
    if (!user) return;
    setSeeding(true); setSeedMsg("");
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/dev-seed`, { method: del ? "DELETE" : "POST", headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setSeedMsg(d.message || d.error || "Done");
      if (res.ok) fetchData();
    } catch { setSeedMsg("Villa"); } finally { setSeeding(false); }
  };

  const isManager = ["manager", "admin", "owner"].includes(myRole);
  const isAdmin = ["admin", "owner"].includes(myRole);
  if (!user) return <div style={{ padding: 40, textAlign: "center" }}>{t.loading}</div>;

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 0", background: "var(--bg-surface)", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href={`/${slug}`} style={{ color: "var(--text-muted)", fontSize: "0.88rem", textDecoration: "none" }}>{t.back}</Link>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.3rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{t.title}</h1>
          </div>
          {/* Period nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setPeriodOffset(p => p - 1)} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", color: "var(--text-primary)" }}>‹</button>
            <span style={{ fontSize: "0.9rem", color: "var(--text-primary)", minWidth: 200, textAlign: "center" }}>
              {data ? getPeriodLabel(data.period.start, data.period.end) : getPeriodParam(periodOffset)}
            </span>
            <button onClick={() => setPeriodOffset(p => p + 1)} disabled={periodOffset >= 0} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", color: "var(--text-primary)", opacity: periodOffset >= 0 ? 0.4 : 1 }}>›</button>
          </div>
          {isManager && data && data.summaries.length > 1 && (
            <select value={selectedUid} onChange={e => setSelectedUid(e.target.value)}
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", color: "var(--text-primary)", fontSize: "0.88rem" }}>
              <option value="all">{t.allStaff}</option>
              {data.summaries.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="container" style={{ padding: "24px" }}>
        {/* Dev seed */}
        {isAdmin && (
          <div style={{ background: "rgba(255,184,48,0.1)", border: "1px solid rgba(255,184,48,0.3)", borderRadius: 10, padding: "10px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--warning)", fontWeight: 600 }}>🧪 Dev tools</span>
            <button onClick={() => doSeed(false)} disabled={seeding} style={{ fontSize: "0.82rem", padding: "4px 12px", borderRadius: 6, border: "none", background: "var(--brand)", color: "#fff", cursor: "pointer" }}>{seeding ? t.seeding : t.seedBtn}</button>
            <button onClick={() => doSeed(true)} disabled={seeding} style={{ fontSize: "0.82rem", padding: "4px 12px", borderRadius: 6, border: "none", background: "var(--danger)", color: "#fff", cursor: "pointer" }}>{seeding ? t.seeding : t.seedDel}</button>
            {seedMsg && <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{seedMsg}</span>}
          </div>
        )}

        {loading && <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>{t.loading}</div>}
        {error && <div style={{ background: "rgba(255,77,106,0.1)", border: "1px solid var(--danger)", borderRadius: 10, padding: 16, color: "var(--danger)" }}>{error}</div>}

        {!loading && data && (
          <>
            {/* Total summary cards (multi-employee) */}
            {isManager && data.summaries.length > 1 && (() => {
              const totHrs = data.summaries.reduce((s, x) => s + x.totalHours, 0);
              const totWage = data.summaries.reduce((s, x) => s + x.bruttoWage, 0);
              const totCost = data.totalEmployerCost;
              const avgPerHr = totHrs > 0 ? Math.round(totCost / totHrs) : 0;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
                  {[
                    { label: t.hours, value: fmtHrs(totHrs), icon: "⏱" },
                    { label: t.wage, value: fmtKr(totWage), icon: "💰" },
                    { label: t.totalCost, value: fmtKr(totCost), icon: "🏢" },
                    { label: t.avgPerHr, value: avgPerHr > 0 ? fmtKr(avgPerHr) : "—", icon: "📊" },
                  ].map(c => (
                    <div key={c.label} className="card" style={{ padding: "18px 20px" }}>
                      <div style={{ fontSize: "1.4rem", marginBottom: 4 }}>{c.icon}</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>{c.value}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {data.summaries.length === 0 && <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>{t.noData}</div>}

            {data.summaries.map(s => {
              const breakdown = aggregateBreakdown(s.shifts);
              const activeCats = CATEGORY_ORDER.filter(c => (breakdown[c]?.hours || 0) > 0);
              const showingShifts = showShifts[s.uid];

              return (
                <div key={s.uid} className="card" style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
                  {/* Employee name row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "var(--bg-card)", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--brand-glow)", border: "2px solid var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--brand-light)" }}>
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.name}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                          {s.payType === "hourly" ? `${s.hourlyRate.toLocaleString("is-IS")} ${t.perHr}` : s.payType === "monthly" ? t.monthly : t.averaged}
                          {" · "}{s.shifts.length} {lang === "is" ? "vaktir" : "shifts"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                      {s.hourlyRate > 0 || s.monthlyRate > 0 ? (
                        <>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, color: "var(--accent)" }}>{fmtKr(s.bruttoWage)}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{t.wage}</div>
                          </div>
                          {isAdmin && (
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 700, color: "var(--warning)" }}>{fmtKr(s.employerCost)}</div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{t.cost}</div>
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>{t.noRate}</span>
                      )}
                    </div>
                  </div>

                  {/* Aggregated hours table — what goes into DK */}
                  <div style={{ overflowX: "auto" }}>
                    <table className="table" style={{ fontSize: "0.88rem" }}>
                      <thead>
                        <tr>
                          {activeCats.map(cat => (
                            <th key={cat} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: RATE_COLORS[cat], display: "inline-block" }} />
                                {t[cat as keyof typeof t] as string}
                              </span>
                            </th>
                          ))}
                          <th style={{ textAlign: "right" }}>{t.total}</th>
                          {s.hourlyRate > 0 && <th style={{ textAlign: "right" }}>{t.wage}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {activeCats.map(cat => (
                            <td key={cat} style={{ textAlign: "right", fontWeight: 600, color: RATE_COLORS[cat] }}>
                              {fmtHrs(breakdown[cat]?.hours || 0)}
                            </td>
                          ))}
                          <td style={{ textAlign: "right", fontWeight: 700, color: "var(--text-primary)", fontSize: "1rem" }}>{fmtHrs(s.totalHours)}</td>
                          {s.hourlyRate > 0 && <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)", fontSize: "1rem" }}>{fmtKr(s.bruttoWage)}</td>}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Employer cost breakdown (admin) */}
                  {isAdmin && (s.hourlyRate > 0 || s.monthlyRate > 0) && s.costBreakdown && (() => {
                    const avgCostPerHr = s.totalHours > 0 ? Math.round(s.costBreakdown.total / s.totalHours) : 0;
                    return (
                      <div style={{ padding: "10px 20px", background: theme === "light" ? "rgba(108,99,255,0.04)" : "rgba(108,99,255,0.06)", borderTop: "1px solid var(--border)", fontSize: "0.8rem" }}>
                        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ color: "var(--text-muted)" }}>{lang === "is" ? "Brúttólaun" : "Gross"}: <strong style={{ color: "var(--text-primary)" }}>{fmtKr(s.costBreakdown.brutto)}</strong></span>
                          <span style={{ color: "var(--text-muted)" }}>+ {lang === "is" ? `Orlof (${(s.costBreakdown.orlofsRate * 100).toFixed(2).replace(".", ",")}%)` : `Holiday pay (${(s.costBreakdown.orlofsRate * 100).toFixed(2)}%)`}: <strong style={{ color: "#10b981" }}>{fmtKr(s.costBreakdown.orlof)}</strong></span>
                          <span style={{ color: "var(--text-muted)" }}>+ {t.pension}: <strong style={{ color: "var(--text-primary)" }}>{fmtKr(s.costBreakdown.employerPension)}</strong></span>
                          <span style={{ color: "var(--text-muted)" }}>+ {t.social}: <strong style={{ color: "var(--text-primary)" }}>{fmtKr(s.costBreakdown.socialTax)}</strong></span>
                          <span style={{ fontWeight: 700, color: "var(--warning)" }}>{t.totalCost}: {fmtKr(s.costBreakdown.total)}</span>
                          {avgCostPerHr > 0 && (
                            <span style={{ marginLeft: "auto", background: "var(--brand-glow)", border: "1px solid var(--brand)", borderRadius: 8, padding: "3px 10px", fontWeight: 700, color: "var(--brand-light)", whiteSpace: "nowrap" }}>
                              📊 {fmtKr(avgCostPerHr)}/{lang === "is" ? "klst" : "hr"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Toggle per-shift detail */}
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    <button onClick={() => setShowShifts(p => ({ ...p, [s.uid]: !p[s.uid] }))}
                      style={{ width: "100%", padding: "9px 20px", background: "transparent", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "left", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{showingShifts ? "▲" : "▼"}</span>{showingShifts ? t.hideShifts : `${t.showShifts} (${s.shifts.length})`}
                    </button>

                    {showingShifts && (
                      <div style={{ overflowX: "auto", borderTop: "1px solid var(--border)" }}>
                        <table className="table" style={{ fontSize: "0.82rem" }}>
                          <thead>
                            <tr>
                              <th>{lang === "is" ? "Dagur" : "Date"}</th>
                              <th style={{ textAlign: "center" }}>{lang === "is" ? "Inn" : "In"}</th>
                              <th style={{ textAlign: "center" }}>{lang === "is" ? "Út" : "Out"}</th>
                              <th style={{ textAlign: "right" }}>{lang === "is" ? "Tímar" : "Hours"}</th>
                              <th>{lang === "is" ? "Álagsflokkar" : "Rate bands"}</th>
                              {s.hourlyRate > 0 && <th style={{ textAlign: "right" }}>{t.wage}</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {s.shifts.map((sh, i) => (
                              <tr key={i} style={{ background: sh.open ? "rgba(108,99,255,0.04)" : undefined }}>
                                <td style={{ fontWeight: 500 }}>{fmtDate(sh.date)}</td>
                                <td style={{ textAlign: "center", fontFamily: "monospace" }}>{fmt24(sh.inTime)}</td>
                                <td style={{ textAlign: "center", fontFamily: "monospace" }}>
                                  {sh.outTime ? fmt24(sh.outTime) : <span style={{ color: "var(--accent)", fontSize: "0.75rem" }}>⏺ {t.open}</span>}
                                </td>
                                <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtHrs(sh.hours)}</td>
                                <td>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                    {(sh.segments || []).map((seg, j) => {
                                      const pct = Math.round((seg.multiplier - 1) * 100);
                                      const col = RATE_COLORS[seg.category] || "#999";
                                      return (
                                        <span key={j} style={{ padding: "1px 7px", borderRadius: 999, fontSize: "0.72rem", fontWeight: 600, background: `${col}18`, color: col, border: `1px solid ${col}40`, whiteSpace: "nowrap" }}>
                                          {fmtHrs(seg.hours)} {pct > 0 ? `+${pct}%` : "×1.0"}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </td>
                                {s.hourlyRate > 0 && <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtKr(sh.wage)}</td>}
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ borderTop: "2px solid var(--border)" }}>
                              <td colSpan={3} style={{ fontWeight: 700, paddingTop: 8 }}>{lang === "is" ? "Samtals" : "Total"}</td>
                              <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtHrs(s.totalHours)}</td>
                              <td />
                              {s.hourlyRate > 0 && <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)" }}>{fmtKr(s.bruttoWage)}</td>}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
