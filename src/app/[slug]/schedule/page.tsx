"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

type Lang = "is" | "en";
type Tab = "week" | "list";

const T = {
  is: {
    title: "Vaktaplan", back: "← Til baka",
    addShift: "Bæta við vakt", save: "Vista", cancel: "Hætta við", delete: "Eyða",
    loading: "Hleður...", noShifts: "Engar vaktir þessa vikuna",
    employee: "Starfsmaður", date: "Dagur", from: "Frá", to: "Til", notes: "Athugasemdir",
    estimate: "Áætluð laun", hours: "Tímar",
    weekView: "Vikuyfirlit", listView: "Listyfirlit",
    totalCost: "Áætlaður kostnaður", confirmDel: "Eyða þessari vakt?",
    mon: "Mán", tue: "Þri", wed: "Mið", thu: "Fim", fri: "Fös", sat: "Lau", sun: "Sun",
    myShifts: "Mínar vaktir",
  },
  en: {
    title: "Schedule", back: "← Back",
    addShift: "Add shift", save: "Save", cancel: "Cancel", delete: "Delete",
    loading: "Loading...", noShifts: "No shifts this week",
    employee: "Employee", date: "Date", from: "From", to: "To", notes: "Notes",
    estimate: "Estimated wages", hours: "Hours",
    weekView: "Week", listView: "List",
    totalCost: "Estimated cost", confirmDel: "Delete this shift?",
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
    myShifts: "My shifts",
  },
};

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_DOW = [1, 2, 3, 4, 5, 6, 0]; // Mon=1..Sun=0

// Color palette for employees (cycles)
const STAFF_COLORS = [
  { bg: "rgba(108,99,255,0.15)", border: "#6c63ff", text: "#6c63ff" },
  { bg: "rgba(16,185,129,0.15)", border: "#10b981", text: "#10b981" },
  { bg: "rgba(245,158,11,0.15)", border: "#f59e0b", text: "#b45309" },
  { bg: "rgba(239,68,68,0.15)", border: "#ef4444", text: "#ef4444" },
  { bg: "rgba(139,92,246,0.15)", border: "#8b5cf6", text: "#8b5cf6" },
  { bg: "rgba(236,72,153,0.15)", border: "#ec4899", text: "#ec4899" },
  { bg: "rgba(20,184,166,0.15)", border: "#14b8a6", text: "#0f766e" },
];

function fmtKr(n: number) { return n.toLocaleString("is-IS") + " kr"; }
function getWeekStart(d: Date) {
  const dd = new Date(d);
  const dow = dd.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow; // Monday-based
  dd.setUTCDate(dd.getUTCDate() + diff);
  dd.setUTCHours(0, 0, 0, 0);
  return dd;
}
function addDays(d: Date, n: number) { const dd = new Date(d); dd.setUTCDate(dd.getUTCDate() + n); return dd; }
function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDayHeader(d: Date, lang: Lang) {
  return d.toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
function fmtWeekRange(start: Date, lang: Lang) {
  const end = addDays(start, 6);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  return `${start.toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", opts)} – ${end.toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", { ...opts, year: "numeric" })}`;
}

interface Shift {
  id: string; uid: string; name: string; date: string; startTime: string; endTime: string;
  notes: string; status: string; wageEstimate: number; totalHours: number; hourlyRate: number;
}
interface StaffMember { uid: string; name: string; status: string; hourlyRate?: number; }

const EMPTY_FORM = { uid: "", date: "", startTime: "09:00", endTime: "17:00", notes: "" };

export default function SchedulePage() {
  const { slug } = useParams() as { slug: string };
  const [user, setUser] = useState<User | null>(null);
  const [lang] = useState<Lang>(() => (typeof window !== "undefined" ? (localStorage.getItem(`tv_lang_${slug}`) as Lang) || "is" : "is"));
  const t = T[lang];

  const [myRole, setMyRole] = useState("");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [tab, setTab] = useState<Tab>("week");

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { return onAuthStateChanged(auth, setUser); }, []);

  // Fetch my role + staff list from portal
  useEffect(() => {
    if (!user) return;
    user.getIdToken().then(async token => {
      const r = await fetch(`/api/${slug}/portal`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        setMyRole(d.role || "");
        setStaffList((d.staffList || []).filter((s: StaffMember) => s.status === "approved"));
      }
    });
  }, [user, slug]);

  const isManager = ["manager", "admin", "owner"].includes(myRole);
  const weekEnd = addDays(weekStart, 6);

  const fetchShifts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const r = await fetch(`/api/${slug}/schedule?from=${toYMD(weekStart)}&to=${toYMD(weekEnd)}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (r.ok) setShifts(d.shifts || []);
    } finally { setLoading(false); }
  }, [user, slug, weekStart, weekEnd]);

  useEffect(() => { if (user && myRole) fetchShifts(); }, [user, myRole, fetchShifts]);

  const doAdd = async () => {
    if (!user || !form.uid || !form.date || !form.startTime || !form.endTime) return;
    setSaving(true); setError("");
    try {
      const token = await user.getIdToken();
      const r = await fetch(`/api/${slug}/schedule`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (r.ok) { setShowAdd(false); setForm(EMPTY_FORM); fetchShifts(); }
      else setError(d.error || "Villa");
    } finally { setSaving(false); }
  };

  const doDelete = async (id: string) => {
    if (!user || !confirm(t.confirmDel)) return;
    setDeletingId(id);
    try {
      const token = await user.getIdToken();
      await fetch(`/api/${slug}/schedule`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: id }),
      });
      fetchShifts();
    } finally { setDeletingId(null); }
  };

  // Map uid → color index
  const uidToColor = new Map<string, number>();
  [...new Set(shifts.map(s => s.uid))].forEach((uid, i) => uidToColor.set(uid, i % STAFF_COLORS.length));
  const colorFor = (uid: string) => STAFF_COLORS[uidToColor.get(uid) ?? 0];

  // Group shifts by date
  const shiftsByDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    if (!shiftsByDate.has(s.date)) shiftsByDate.set(s.date, []);
    shiftsByDate.get(s.date)!.push(s);
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const totalEstimate = shifts.reduce((sum, s) => sum + (s.wageEstimate || 0), 0);
  const totalHours = shifts.reduce((sum, s) => sum + (s.totalHours || 0), 0);

  if (!user) return <div style={{ padding: 40, textAlign: "center" }}>{t.loading}</div>;

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 0", background: "var(--bg-surface)", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link href={`/${slug}`} style={{ color: "var(--text-muted)", fontSize: "0.88rem", textDecoration: "none" }}>{t.back}</Link>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.3rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>🗓 {t.title}</h1>
          </div>
          {/* Week nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setWeekStart(w => addDays(w, -7))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", color: "var(--text-primary)" }}>‹</button>
            <span style={{ fontSize: "0.9rem", color: "var(--text-primary)", minWidth: 180, textAlign: "center" }}>{fmtWeekRange(weekStart, lang)}</span>
            <button onClick={() => setWeekStart(w => addDays(w, 7))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", color: "var(--text-primary)" }}>›</button>
            <button onClick={() => setWeekStart(getWeekStart(new Date()))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.8rem" }}>
              {lang === "is" ? "Þessi vika" : "This week"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* View toggle */}
            <div style={{ display: "flex", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {(["week", "list"] as Tab[]).map(v => (
                <button key={v} onClick={() => setTab(v)} style={{ padding: "5px 12px", border: "none", cursor: "pointer", fontSize: "0.82rem", fontWeight: tab === v ? 600 : 400, background: tab === v ? "var(--brand)" : "transparent", color: tab === v ? "#fff" : "var(--text-muted)" }}>
                  {v === "week" ? t.weekView : t.listView}
                </button>
              ))}
            </div>
            {isManager && (
              <button onClick={() => { setForm(EMPTY_FORM); setShowAdd(true); }} className="btn btn--primary btn--sm">+ {t.addShift}</button>
            )}
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: "20px 24px" }}>
        {/* Summary bar */}
        {shifts.length > 0 && (
          <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
            <div className="card" style={{ padding: "12px 20px", display: "inline-flex", gap: 24, alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>⏱ {lang === "is" ? "Vaktir" : "Shifts"}: <strong style={{ color: "var(--text-primary)" }}>{shifts.length}</strong></span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{lang === "is" ? "Tímar" : "Hours"}: <strong style={{ color: "var(--text-primary)" }}>{totalHours.toFixed(1)}h</strong></span>
              {isManager && totalEstimate > 0 && (
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>💰 {t.totalCost}: <strong style={{ color: "var(--warning)" }}>{fmtKr(totalEstimate)}</strong></span>
              )}
            </div>
          </div>
        )}

        {loading && <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>{t.loading}</div>}

        {/* ── WEEK VIEW ──────────────────────────────────────────────── */}
        {!loading && tab === "week" && (
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(7, minmax(130px, 1fr))`, gap: 8, minWidth: 700 }}>
              {weekDays.map((day, i) => {
                const ymd = toYMD(day);
                const isToday = ymd === toYMD(new Date());
                const dayShifts = shiftsByDate.get(ymd) || [];
                const dow = day.getUTCDay();
                const isWeekend = dow === 0 || dow === 6;
                const dayName = t[DAY_KEYS[i]];

                return (
                  <div key={ymd} style={{ minHeight: 200 }}>
                    {/* Day header */}
                    <div style={{ textAlign: "center", padding: "8px 4px", marginBottom: 8, borderRadius: 8, background: isToday ? "var(--brand)" : isWeekend ? "var(--bg-surface)" : "transparent", color: isToday ? "#fff" : isWeekend ? "var(--text-secondary)" : "var(--text-primary)" }}>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{dayName}</div>
                      <div style={{ fontSize: "0.92rem", fontWeight: 700 }}>{fmtDayHeader(day, lang)}</div>
                    </div>

                    {/* Shifts */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {dayShifts.map(sh => {
                        const col = colorFor(sh.uid);
                        return (
                          <div key={sh.id} style={{ background: col.bg, border: `1px solid ${col.border}`, borderRadius: 8, padding: "7px 10px", cursor: "pointer", position: "relative" }}
                            onClick={() => isManager && doDelete(sh.id)}>
                            <div style={{ fontWeight: 600, fontSize: "0.82rem", color: col.text }}>{sh.name.split(" ")[0]}</div>
                            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{sh.startTime}–{sh.endTime}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{sh.totalHours.toFixed(1)}h{sh.wageEstimate > 0 ? ` · ${fmtKr(sh.wageEstimate)}` : ""}</div>
                            {sh.notes && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2, fontStyle: "italic" }}>{sh.notes}</div>}
                            {isManager && deletingId === sh.id && <div style={{ position: "absolute", top: 2, right: 6, fontSize: "0.7rem", color: "var(--danger)" }}>🗑</div>}
                          </div>
                        );
                      })}
                      {/* Add shift quick button */}
                      {isManager && (
                        <button onClick={() => { setForm({ ...EMPTY_FORM, date: ymd }); setShowAdd(true); }}
                          style={{ width: "100%", padding: "6px", borderRadius: 8, border: "1px dashed var(--border)", background: "transparent", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.78rem", transition: "all 0.15s" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
                          + {lang === "is" ? "vakt" : "shift"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {shifts.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>📭</div>
                <div>{t.noShifts}</div>
              </div>
            )}
          </div>
        )}

        {/* ── LIST VIEW ────────────────────────────────────────────── */}
        {!loading && tab === "list" && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {shifts.length === 0 ? (
              <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>{t.noShifts}</div>
            ) : (
              <table className="table" style={{ fontSize: "0.85rem" }}>
                <thead>
                  <tr>
                    <th>{t.date}</th>
                    {isManager && <th>{t.employee}</th>}
                    <th>{t.from}</th>
                    <th>{t.to}</th>
                    <th style={{ textAlign: "right" }}>{t.hours}</th>
                    {isManager && <th style={{ textAlign: "right" }}>{t.estimate}</th>}
                    <th>{t.notes}</th>
                    {isManager && <th />}
                  </tr>
                </thead>
                <tbody>
                  {shifts.map(sh => {
                    const col = colorFor(sh.uid);
                    return (
                      <tr key={sh.id}>
                        <td style={{ fontWeight: 500 }}>
                          {new Date(sh.date + "T00:00:00Z").toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                        </td>
                        {isManager && (
                          <td>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.border, display: "inline-block" }} />
                              {sh.name}
                            </span>
                          </td>
                        )}
                        <td style={{ fontFamily: "monospace" }}>{sh.startTime}</td>
                        <td style={{ fontFamily: "monospace" }}>{sh.endTime}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{sh.totalHours.toFixed(1)}h</td>
                        {isManager && <td style={{ textAlign: "right", color: sh.wageEstimate > 0 ? "var(--accent)" : "var(--text-muted)" }}>{sh.wageEstimate > 0 ? fmtKr(sh.wageEstimate) : "—"}</td>}
                        <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{sh.notes || "—"}</td>
                        {isManager && (
                          <td>
                            <button onClick={() => doDelete(sh.id)} disabled={deletingId === sh.id}
                              style={{ padding: "3px 8px", fontSize: "0.78rem", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", cursor: "pointer", color: "var(--danger)" }}>
                              🗑
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)" }}>
                    <td colSpan={isManager ? 4 : 2} style={{ fontWeight: 700, paddingTop: 10 }}>{lang === "is" ? "Samtals" : "Total"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{totalHours.toFixed(1)}h</td>
                    {isManager && <td style={{ textAlign: "right", fontWeight: 700, color: "var(--warning)" }}>{totalEstimate > 0 ? fmtKr(totalEstimate) : "—"}</td>}
                    <td /><td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── ADD SHIFT MODAL ──────────────────────────────────────── */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="card" style={{ width: "100%", maxWidth: 440, padding: 28 }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.15rem", fontWeight: 700, marginBottom: 20, color: "var(--text-primary)" }}>+ {t.addShift}</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Employee */}
              <div className="form-group">
                <label className="form-label">{t.employee}</label>
                <select className="form-input" value={form.uid} onChange={e => setForm(f => ({ ...f, uid: e.target.value }))}>
                  <option value="">{lang === "is" ? "Veldu starfsmann..." : "Choose employee..."}</option>
                  {staffList.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
                </select>
              </div>

              {/* Date */}
              <div className="form-group">
                <label className="form-label">{t.date}</label>
                <input type="date" className="form-input" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>

              {/* Time */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">{t.from}</label>
                  <input type="time" className="form-input" style={{ fontFamily: "monospace" }} value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.to}</label>
                  <input type="time" className="form-input" style={{ fontFamily: "monospace" }} value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">{t.notes}</label>
                <input className="form-input" placeholder={lang === "is" ? "Opnun, lokunarvakt..." : "Opening, closing shift..."} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              {error && <div style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</div>}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button className="btn btn--ghost btn--sm" onClick={() => { setShowAdd(false); setError(""); }}>{t.cancel}</button>
              <button className="btn btn--primary" onClick={doAdd} disabled={saving || !form.uid || !form.date}>
                {saving ? "..." : t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
