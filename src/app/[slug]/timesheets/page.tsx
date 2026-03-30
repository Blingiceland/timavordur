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
    title: "Tímaskýrslur", back: "← Til baka", period: "Tímabil", allStaff: "Allir starfsmenn",
    hours: "Tímar", wage: "Brúttólaun", cost: "Heildarkostnaður", loading: "Hleður...",
    noData: "Engar færslur á þessu tímabili", open: "Opin vakt", perHr: "kr/klst",
    dagvinna: "Dagvinna", kvoldvinna: "Kvöldvinna", helgarvinna: "Helgarvinna",
    naetuvinna: "Nætuvinna", storhatid: "Stórhátíðaálag",
    pension: "+ Lífeyrir (11,5%)", social: "+ Tryggingagjald (6,35%)",
    totalCost: "Heildarkostnaður vinnuveitanda", noRate: "Kaup ekki stillt",
    monthly: "Föst mánaðarlaun", averaged: "Jafnaðarkaup",
    seedBtn: "🧪 Búa til mock gögn", seedDel: "🗑 Eyða mock gögnum",
    seeding: "Hleður...",
  },
  en: {
    title: "Timesheets", back: "← Back", period: "Period", allStaff: "All staff",
    hours: "Hours", wage: "Gross wages", cost: "Total cost", loading: "Loading...",
    noData: "No records for this period", open: "Open shift", perHr: "ISK/hr",
    dagvinna: "Day rate", kvoldvinna: "Evening rate", helgarvinna: "Weekend rate",
    naetuvinna: "Night rate", storhatid: "Public holiday",
    pension: "+ Pension (11.5%)", social: "+ Social tax (6.35%)",
    totalCost: "Total employer cost", noRate: "Rate not set",
    monthly: "Fixed monthly", averaged: "Averaged pay",
    seedBtn: "🧪 Create mock data", seedDel: "🗑 Delete mock data",
    seeding: "Loading...",
  },
};

const RATE_COLORS: Record<string, string> = {
  dagvinna: "#6c63ff", kvoldvinna: "#f59e0b", helgarvinna: "#10b981",
  naetuvinna: "#8b5cf6", storhatid: "#ef4444",
};

function fmtHrs(h: number) { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); return `${hh}h ${mm}m`; }
function fmtKr(n: number) { return n.toLocaleString("is-IS") + " kr"; }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("is-IS", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }); }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("is-IS", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

interface Shift { date: string; inTime: string; outTime: string | null; hours: number; wage: number; multiplier: number; open: boolean; }
interface Summary { uid: string; name: string; email: string; payType: string; hourlyRate: number; monthlyRate: number; totalHours: number; bruttoWage: number; employerCost: number; shifts: Shift[]; }
interface TimesheetData { period: { start: string; end: string }; companyName: string; summaries: Summary[]; totalEmployerCost: number; }

function getPeriodLabel(start: string, end: string) {
  const s = new Date(start); const e = new Date(end);
  return `${s.getUTCDate()}. ${s.toLocaleString("is-IS", { month: "short", timeZone: "UTC" })} – ${e.getUTCDate()}. ${e.toLocaleString("is-IS", { month: "long", timeZone: "UTC" })} ${e.getUTCFullYear()}`;
}

function getPeriodParam(offset = 0) {
  const now = new Date();
  let y = now.getUTCFullYear(); let m = now.getUTCMonth();
  if (now.getUTCDate() < 25) m -= 1;
  m += offset;
  while (m < 0) { m += 12; y -= 1; }
  while (m > 11) { m -= 12; y += 1; }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");

  useEffect(() => { return onAuthStateChanged(auth, setUser); }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError("");
    try {
      const token = await user.getIdToken();
      const period = getPeriodParam(periodOffset);
      const uid = selectedUid === "all" ? "all" : selectedUid;
      const res = await fetch(`/api/${slug}/timesheets?period=${period}&uid=${uid}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (res.ok) setData(d);
      else setError(d.error || "Villa");
    } catch { setError("Netvillla"); } finally { setLoading(false); }
  }, [user, slug, periodOffset, selectedUid]);

  // Also fetch my role for seed button
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
      <div style={{ borderBottom: "1px solid var(--border)", padding: "16px 0", background: "var(--bg-surface)", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href={`/${slug}`} style={{ color: "var(--text-muted)", fontSize: "0.88rem", textDecoration: "none" }}>{t.back}</Link>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.3rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{t.title}</h1>
          </div>
          {/* Period nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setPeriodOffset(p => p - 1)} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "var(--text-primary)", fontSize: "1rem" }}>‹</button>
            <span style={{ fontSize: "0.9rem", color: "var(--text-primary)", minWidth: 200, textAlign: "center" }}>
              {data ? getPeriodLabel(data.period.start, data.period.end) : getPeriodParam(periodOffset)}
            </span>
            <button onClick={() => setPeriodOffset(p => p + 1)} disabled={periodOffset >= 0} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "var(--text-primary)", fontSize: "1rem", opacity: periodOffset >= 0 ? 0.4 : 1 }}>›</button>
          </div>
          {/* Staff filter */}
          {isManager && data && data.summaries.length > 1 && (
            <select value={selectedUid} onChange={e => setSelectedUid(e.target.value)}
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", color: "var(--text-primary)", fontSize: "0.88rem" }}>
              <option value="all">{t.allStaff}</option>
              {data.summaries.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="container" style={{ padding: "24px 24px" }}>
        {/* Dev seed buttons */}
        {isAdmin && (
          <div style={{ background: "rgba(255,184,48,0.1)", border: "1px solid rgba(255,184,48,0.3)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--warning)", fontWeight: 600 }}>🧪 Dev tools</span>
            <button onClick={() => doSeed(false)} disabled={seeding} style={{ fontSize: "0.82rem", padding: "5px 12px", borderRadius: 6, border: "none", background: "var(--brand)", color: "#fff", cursor: "pointer" }}>{seeding ? t.seeding : t.seedBtn}</button>
            <button onClick={() => doSeed(true)} disabled={seeding} style={{ fontSize: "0.82rem", padding: "5px 12px", borderRadius: 6, border: "none", background: "var(--danger)", color: "#fff", cursor: "pointer" }}>{seeding ? t.seeding : t.seedDel}</button>
            {seedMsg && <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{seedMsg}</span>}
          </div>
        )}

        {loading && <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>{t.loading}</div>}
        {error && <div style={{ background: "rgba(255,77,106,0.1)", border: "1px solid var(--danger)", borderRadius: 10, padding: 16, color: "var(--danger)" }}>{error}</div>}

        {!loading && data && (
          <>
            {/* Summary cards */}
            {isManager && data.summaries.length > 1 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
                {[
                  { label: t.hours, value: fmtHrs(data.summaries.reduce((s, x) => s + x.totalHours, 0)), icon: "⏱" },
                  { label: t.wage, value: fmtKr(data.summaries.reduce((s, x) => s + x.bruttoWage, 0)), icon: "💰" },
                  { label: t.totalCost, value: fmtKr(data.totalEmployerCost), icon: "🏢" },
                ].map(c => (
                  <div key={c.label} className="card" style={{ padding: "20px 24px" }}>
                    <div style={{ fontSize: "1.5rem", marginBottom: 6 }}>{c.icon}</div>
                    <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>{c.value}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>{c.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Per-employee sections */}
            {data.summaries.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>{t.noData}</div>
            )}

            {data.summaries.map(s => (
              <div key={s.uid} className="card" style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
                {/* Employee header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexWrap: "wrap", gap: 12, cursor: "pointer", background: "var(--bg-card)" }}
                  onClick={() => setExpanded(e => ({ ...e, [s.uid]: !e[s.uid] }))}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--brand-glow)", border: "2px solid var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--brand-light)", fontSize: "1rem" }}>
                      {s.name.charAt(0)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{s.name}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {s.payType === "hourly" ? `${s.hourlyRate.toLocaleString("is-IS")} ${t.perHr}` : s.payType === "monthly" ? t.monthly : t.averaged}
                        {" · "}{s.shifts.length} {lang === "is" ? "vaktir" : "shifts"}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>{fmtHrs(s.totalHours)}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{t.hours}</div>
                    </div>
                    {s.hourlyRate > 0 || s.monthlyRate > 0 ? (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)" }}>{fmtKr(s.bruttoWage)}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{t.wage}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontStyle: "italic" }}>{t.noRate}</div>
                    )}
                    {isAdmin && (s.hourlyRate > 0 || s.monthlyRate > 0) && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--warning)" }}>{fmtKr(s.employerCost)}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{t.cost}</div>
                      </div>
                    )}
                    <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{expanded[s.uid] ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Employer cost breakdown */}
                {isAdmin && expanded[s.uid] && (s.hourlyRate > 0 || s.monthlyRate > 0) && (
                  <div style={{ padding: "12px 20px", background: theme === "light" ? "rgba(108,99,255,0.05)" : "rgba(108,99,255,0.06)", borderBottom: "1px solid var(--border)", display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--text-muted)" }}>{lang === "is" ? "Brúttólaun" : "Gross"}: </span>
                      <strong>{fmtKr(s.bruttoWage)}</strong>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--text-muted)" }}>{t.pension}: </span>
                      <strong>{fmtKr(Math.round(s.bruttoWage * 0.115))}</strong>
                    </div>
                    <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--text-muted)" }}>{t.social}: </span>
                      <strong>{fmtKr(Math.round(s.bruttoWage * 0.0635))}</strong>
                    </div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--warning)" }}>
                      {t.totalCost}: {fmtKr(s.employerCost)}
                    </div>
                  </div>
                )}

                {/* Shifts table */}
                {expanded[s.uid] && (
                  <div style={{ overflowX: "auto" }}>
                    {s.shifts.length === 0 ? (
                      <div style={{ padding: "20px 24px", color: "var(--text-muted)", fontSize: "0.88rem" }}>{t.noData}</div>
                    ) : (
                      <table className="table" style={{ fontSize: "0.85rem" }}>
                        <thead>
                          <tr>
                            <th>{lang === "is" ? "Dagur" : "Date"}</th>
                            <th>{lang === "is" ? "Inn" : "In"}</th>
                            <th>{lang === "is" ? "Út" : "Out"}</th>
                            <th style={{ textAlign: "right" }}>{t.hours}</th>
                            <th style={{ textAlign: "center" }}>{lang === "is" ? "Stuðull" : "Rate"}</th>
                            {(s.hourlyRate > 0) && <th style={{ textAlign: "right" }}>{t.wage}</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {s.shifts.map((sh, i) => {
                            const multPct = Math.round((sh.multiplier - 1) * 100);
                            const category = sh.multiplier >= 1.85 ? "storhatid" : sh.multiplier >= 1.50 ? "naetuvinna" : sh.multiplier >= 1.40 ? "helgarvinna" : sh.multiplier >= 1.30 ? "kvoldvinna" : "dagvinna";
                            const color = RATE_COLORS[category];
                            const catLabel = t[category as keyof typeof t] as string;
                            return (
                              <tr key={i}>
                                <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                                  {fmtDate(sh.date)}
                                </td>
                                <td>{fmtTime(sh.inTime)}</td>
                                <td>{sh.outTime ? fmtTime(sh.outTime) : <span style={{ color: "var(--accent)", fontSize: "0.78rem" }}>⏺ {t.open}</span>}</td>
                                <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtHrs(sh.hours)}</td>
                                <td style={{ textAlign: "center" }}>
                                  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: "0.75rem", fontWeight: 600, background: `${color}20`, color, border: `1px solid ${color}50` }}>
                                    {multPct > 0 ? `+${multPct}%` : "×1.0"} {catLabel}
                                  </span>
                                </td>
                                {s.hourlyRate > 0 && (
                                  <td style={{ textAlign: "right", fontWeight: 600, color: "var(--text-primary)" }}>
                                    {fmtKr(sh.wage)}
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "2px solid var(--border)" }}>
                            <td colSpan={3} style={{ fontWeight: 700, color: "var(--text-primary)", paddingTop: 10 }}>{lang === "is" ? "Samtals" : "Total"}</td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: "var(--text-primary)" }}>{fmtHrs(s.totalHours)}</td>
                            <td />
                            {s.hourlyRate > 0 && <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent)", fontSize: "1rem" }}>{fmtKr(s.bruttoWage)}</td>}
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
