"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

type Lang = "is" | "en";

const T = {
  is: {
    title: "Vaktaplan", back: "← Til baka",
    addShift: "+ Stök vakt", addTemplate: "↻ Föst vakt",
    save: "Vista", cancel: "Hætta við",
    loading: "Hleður...", noShifts: "Engar vaktir þessa vikuna",
    employee: "Starfsmaður", date: "Dagur", from: "Frá", to: "Til", notes: "Athugasemdir",
    estimate: "Áætl. laun", hours: "Tímar",
    weekView: "Vika", listView: "Listi", templatesView: "Föstar vaktir",
    totalCost: "Áætlaður kostnaður", confirmDel: "Eyða þessari vakt?", confirmDelTmpl: "Eyða fastri vakt?",
    mon: "Mán", tue: "Þri", wed: "Mið", thu: "Fim", fri: "Fös", sat: "Lau", sun: "Sun",
    days: ["Sun", "Mán", "Þri", "Mið", "Fim", "Fös", "Lau"],
    recurring: "Föst vakt", single: "Stök", label: "Auðkenni",
    noTemplates: "Engar fastar vaktir skráðar",
    thisWeek: "Þessi vika", activeFrom: "Virk frá", activeTo: "Virk til",
  },
  en: {
    title: "Schedule", back: "← Back",
    addShift: "+ One-off shift", addTemplate: "↻ Recurring shift",
    save: "Save", cancel: "Cancel",
    loading: "Loading...", noShifts: "No shifts this week",
    employee: "Employee", date: "Date", from: "From", to: "To", notes: "Notes",
    estimate: "Est. wages", hours: "Hours",
    weekView: "Week", listView: "List", templatesView: "Recurring",
    totalCost: "Estimated cost", confirmDel: "Delete this shift?", confirmDelTmpl: "Delete recurring shift?",
    mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    recurring: "Recurring", single: "Single", label: "Label",
    noTemplates: "No recurring shifts defined",
    thisWeek: "This week", activeFrom: "Active from", activeTo: "Active to",
  },
};

const STAFF_COLORS = [
  { bg: "rgba(108,99,255,0.12)", border: "#6c63ff", text: "#6c63ff" },
  { bg: "rgba(16,185,129,0.12)", border: "#10b981", text: "#059669" },
  { bg: "rgba(245,158,11,0.12)", border: "#f59e0b", text: "#b45309" },
  { bg: "rgba(239,68,68,0.12)", border: "#ef4444", text: "#dc2626" },
  { bg: "rgba(139,92,246,0.12)", border: "#8b5cf6", text: "#7c3aed" },
  { bg: "rgba(236,72,153,0.12)", border: "#ec4899", text: "#be185d" },
  { bg: "rgba(20,184,166,0.12)", border: "#14b8a6", text: "#0f766e" },
];

function fmtKr(n: number) { return n.toLocaleString("is-IS") + " kr"; }
function getWeekStart(d: Date) {
  const dd = new Date(d); const dow = dd.getUTCDay();
  dd.setUTCDate(dd.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  dd.setUTCHours(0, 0, 0, 0); return dd;
}
function addDays(d: Date, n: number) { const dd = new Date(d); dd.setUTCDate(dd.getUTCDate() + n); return dd; }
function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
function fmtDay(d: Date, lang: Lang) {
  return d.toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
function fmtWeekRange(s: Date, lang: Lang) {
  const e = addDays(s, 6);
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  return `${s.toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", o)} – ${e.toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", { ...o, year: "numeric" })}`;
}

interface Shift {
  id: string; uid: string; name: string; date: string; startTime: string; endTime: string;
  notes: string; status: string; wageEstimate: number; totalHours: number; source: "single" | "template"; templateId?: string;
}
interface Template {
  id: string; uid: string; name: string; daysOfWeek: number[];
  startTime: string; endTime: string; label: string;
  wageEstimate: number; totalHours: number; hourlyRate: number;
}
interface StaffMember { uid: string; name: string; status: string; }

const DOW = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
const EMPTY_SHIFT = { uid: "", date: "", startTime: "09:00", endTime: "17:00", notes: "" };
const EMPTY_TMPL = { uid: "", daysOfWeek: [] as number[], startTime: "09:00", endTime: "17:00", label: "", activeFrom: "", activeTo: "" };

export default function SchedulePage() {
  const { slug } = useParams() as { slug: string };
  const [user, setUser] = useState<User | null>(null);
  const [lang] = useState<Lang>(() => (typeof window !== "undefined" ? (localStorage.getItem(`tv_lang_${slug}`) as Lang) || "is" : "is"));
  const t = T[lang];

  const [myRole, setMyRole] = useState("");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [tab, setTab] = useState<"week" | "list" | "templates">("week");
  const [showAdd, setShowAdd] = useState<"shift" | "template" | null>(null);
  const [shiftForm, setShiftForm] = useState(EMPTY_SHIFT);
  const [tmplForm, setTmplForm] = useState(EMPTY_TMPL);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => { return onAuthStateChanged(auth, setUser); }, []);

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then(async tok => {
      const r = await fetch(`/api/${slug}/portal`, { headers: { Authorization: `Bearer ${tok}` } });
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
      const tok = await user.getIdToken();
      const r = await fetch(`/api/${slug}/schedule?from=${toYMD(weekStart)}&to=${toYMD(weekEnd)}`, { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) { const d = await r.json(); setShifts(d.shifts || []); }
    } finally { setLoading(false); }
  }, [user, slug, weekStart, weekEnd]);

  const fetchTemplates = useCallback(async () => {
    if (!user || !isManager) return;
    const tok = await user.getIdToken();
    const r = await fetch(`/api/${slug}/shift-templates`, { headers: { Authorization: `Bearer ${tok}` } });
    if (r.ok) { const d = await r.json(); setTemplates(d.templates || []); }
  }, [user, slug, isManager]);

  useEffect(() => { if (user && myRole) { fetchShifts(); fetchTemplates(); } }, [user, myRole, fetchShifts, fetchTemplates]);

  const saveShift = async () => {
    if (!user || !shiftForm.uid || !shiftForm.date) return;
    setSaving(true); setErr("");
    try {
      const tok = await user.getIdToken();
      const r = await fetch(`/api/${slug}/schedule`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify(shiftForm),
      });
      const d = await r.json();
      if (r.ok) { setShowAdd(null); setShiftForm(EMPTY_SHIFT); fetchShifts(); }
      else setErr(d.error || "Villa");
    } finally { setSaving(false); }
  };

  const saveTemplate = async () => {
    if (!user || !tmplForm.uid || !tmplForm.daysOfWeek.length) return;
    setSaving(true); setErr("");
    try {
      const tok = await user.getIdToken();
      const r = await fetch(`/api/${slug}/shift-templates`, {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify(tmplForm),
      });
      const d = await r.json();
      if (r.ok) { setShowAdd(null); setTmplForm(EMPTY_TMPL); fetchTemplates(); fetchShifts(); }
      else setErr(d.error || "Villa");
    } finally { setSaving(false); }
  };

  const deleteShift = async (id: string) => {
    if (!user || !confirm(t.confirmDel)) return;
    setDeletingId(id);
    try {
      const tok = await user.getIdToken();
      await fetch(`/api/${slug}/schedule`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ shiftId: id }) });
      fetchShifts();
    } finally { setDeletingId(null); }
  };

  const deleteTemplate = async (id: string) => {
    if (!user || !confirm(t.confirmDelTmpl)) return;
    setDeletingId(id);
    try {
      const tok = await user.getIdToken();
      await fetch(`/api/${slug}/shift-templates`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ templateId: id }) });
      fetchTemplates(); fetchShifts();
    } finally { setDeletingId(null); }
  };

  const uidToColor = new Map<string, number>();
  [...new Set(shifts.map(s => s.uid))].forEach((uid, i) => uidToColor.set(uid, i % STAFF_COLORS.length));
  [...new Set(templates.map(s => s.uid))].forEach((uid, i) => { if (!uidToColor.has(uid)) uidToColor.set(uid, i % STAFF_COLORS.length); });
  const col = (uid: string) => STAFF_COLORS[uidToColor.get(uid) ?? 0];

  const shiftsByDate = new Map<string, Shift[]>();
  for (const s of shifts) {
    if (!shiftsByDate.has(s.date)) shiftsByDate.set(s.date, []);
    shiftsByDate.get(s.date)!.push(s);
  }
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const totalEst = shifts.reduce((s, x) => s + (x.wageEstimate || 0), 0);
  const totalHrs = shifts.reduce((s, x) => s + (x.totalHours || 0), 0);

  const dayLabels = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

  if (!user) return <div style={{ padding: 40, textAlign: "center" }}>{t.loading}</div>;

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 0", background: "var(--bg-surface)", position: "sticky", top: 0, zIndex: 50 }}>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href={`/${slug}`} style={{ color: "var(--text-muted)", fontSize: "0.88rem", textDecoration: "none" }}>{t.back}</Link>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>🗓 {t.title}</h1>
          </div>
          {/* Week nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <button onClick={() => setWeekStart(w => addDays(w, -7))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7, padding: "4px 11px", cursor: "pointer", color: "var(--text-primary)" }}>‹</button>
            <span style={{ fontSize: "0.88rem", color: "var(--text-primary)", minWidth: 175, textAlign: "center" }}>{fmtWeekRange(weekStart, lang)}</span>
            <button onClick={() => setWeekStart(w => addDays(w, 7))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7, padding: "4px 11px", cursor: "pointer", color: "var(--text-primary)" }}>›</button>
            <button onClick={() => setWeekStart(getWeekStart(new Date()))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7, padding: "4px 9px", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.78rem" }}>{t.thisWeek}</button>
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <div style={{ display: "flex", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden" }}>
              {(["week", "list", ...(isManager ? ["templates"] : [])] as ("week" | "list" | "templates")[]).map(v => (
                <button key={v} onClick={() => setTab(v)} style={{ padding: "4px 11px", border: "none", cursor: "pointer", fontSize: "0.8rem", fontWeight: tab === v ? 600 : 400, background: tab === v ? "var(--brand)" : "transparent", color: tab === v ? "#fff" : "var(--text-muted)" }}>
                  {v === "week" ? t.weekView : v === "list" ? t.listView : t.templatesView}
                  {v === "templates" && templates.length > 0 && <span style={{ marginLeft: 4, fontSize: "0.7rem", opacity: 0.8 }}>({templates.length})</span>}
                </button>
              ))}
            </div>
            {isManager && (
              <>
                <button onClick={() => { setShiftForm(EMPTY_SHIFT); setErr(""); setShowAdd("shift"); }} className="btn btn--secondary btn--sm">{t.addShift}</button>
                <button onClick={() => { setTmplForm(EMPTY_TMPL); setErr(""); setShowAdd("template"); }} className="btn btn--primary btn--sm">{t.addTemplate}</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: "18px 24px" }}>
        {/* Summary */}
        {shifts.length > 0 && (
          <div style={{ display: "inline-flex", gap: 20, marginBottom: 18, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 18px", fontSize: "0.82rem" }}>
            <span style={{ color: "var(--text-muted)" }}>{lang === "is" ? "Vaktir" : "Shifts"}: <strong style={{ color: "var(--text-primary)" }}>{shifts.length}</strong></span>
            <span style={{ color: "var(--text-muted)" }}>{t.hours}: <strong style={{ color: "var(--text-primary)" }}>{totalHrs.toFixed(1)}h</strong></span>
            {isManager && totalEst > 0 && <span style={{ color: "var(--text-muted)" }}>💰 {t.totalCost}: <strong style={{ color: "var(--warning)" }}>{fmtKr(totalEst)}</strong></span>}
          </div>
        )}

        {loading && <div style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>{t.loading}</div>}

        {/* ── WEEK VIEW ── */}
        {!loading && tab === "week" && (
          <>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(125px, 1fr))", gap: 8, minWidth: 680 }}>
                {weekDays.map((day, i) => {
                  const ymd = toYMD(day);
                  const isToday = ymd === toYMD(new Date());
                  const dayShifts = shiftsByDate.get(ymd) || [];
                  const dow = day.getUTCDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <div key={ymd} style={{ minHeight: 180 }}>
                      <div style={{ textAlign: "center", padding: "7px 4px", marginBottom: 7, borderRadius: 8, background: isToday ? "var(--brand)" : isWeekend ? "var(--bg-surface)" : "transparent", color: isToday ? "#fff" : isWeekend ? "var(--text-secondary)" : "var(--text-primary)" }}>
                        <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t[dayLabels[DOW.indexOf(dow)] as keyof typeof t] as string}</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>{fmtDay(day, lang)}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {dayShifts.map(sh => {
                          const c = col(sh.uid);
                          const isTemplate = sh.source === "template";
                          return (
                            <div key={sh.id}
                              style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 7, padding: "6px 9px", cursor: isManager ? "pointer" : "default", opacity: isTemplate ? 0.85 : 1, position: "relative" }}
                              onClick={() => isManager && !isTemplate && deleteShift(sh.id)}
                              title={isManager ? (isTemplate ? (lang === "is" ? "Föst vakt" : "Recurring shift") : t.confirmDel) : ""}>
                              <div style={{ fontWeight: 600, fontSize: "0.8rem", color: c.text }}>
                                {isTemplate && <span style={{ marginRight: 3, opacity: 0.7 }}>↻</span>}
                                {sh.name.split(" ")[0]}
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{sh.startTime}–{sh.endTime}</div>
                              {(sh.totalHours > 0 || sh.wageEstimate > 0) && (
                                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                                  {sh.totalHours.toFixed(1)}h{sh.wageEstimate > 0 && sh.source !== "template" ? ` · ${fmtKr(sh.wageEstimate)}` : ""}
                                </div>
                              )}
                              {sh.notes && <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontStyle: "italic" }}>{sh.notes}</div>}
                              {deletingId === sh.id && <div style={{ position: "absolute", top: 2, right: 5, fontSize: "0.65rem", color: "var(--danger)" }}>🗑</div>}
                            </div>
                          );
                        })}
                        {isManager && (
                          <button onClick={() => { setShiftForm({ ...EMPTY_SHIFT, date: ymd }); setErr(""); setShowAdd("shift"); }}
                            style={{ width: "100%", padding: "5px", borderRadius: 7, border: "1px dashed var(--border)", background: "transparent", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.72rem", transition: "all 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {shifts.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "50px 0", color: "var(--text-muted)" }}>
                <div style={{ fontSize: "2.2rem", marginBottom: 8 }}>📭</div>
                <div>{t.noShifts}</div>
              </div>
            )}
            {/* Legend */}
            {shifts.length > 0 && (
              <div style={{ marginTop: 16, display: "flex", gap: 14, flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                <span>↻ {t.recurring}</span>
                <span style={{ opacity: 0.6 }}>|</span>
                {[...new Set(shifts.map(s => s.uid))].map(uid => {
                  const sh = shifts.find(s => s.uid === uid);
                  const c = col(uid);
                  return <span key={uid} style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: c.border, display: "inline-block" }} />{sh?.name.split(" ")[0]}</span>;
                })}
              </div>
            )}
          </>
        )}

        {/* ── LIST VIEW ── */}
        {!loading && tab === "list" && (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {shifts.length === 0 ? <div style={{ textAlign: "center", padding: 44, color: "var(--text-muted)" }}>{t.noShifts}</div> : (
              <table className="table" style={{ fontSize: "0.84rem" }}>
                <thead><tr>
                  <th>{t.date}</th>
                  {isManager && <th>{t.employee}</th>}
                  <th>{t.from}</th><th>{t.to}</th>
                  <th style={{ textAlign: "right" }}>{t.hours}</th>
                  {isManager && <th style={{ textAlign: "right" }}>{t.estimate}</th>}
                  <th>{t.notes}</th>
                  <th style={{ textAlign: "center" }}>{lang === "is" ? "Tegund" : "Type"}</th>
                  {isManager && <th />}
                </tr></thead>
                <tbody>
                  {shifts.map(sh => (
                    <tr key={sh.id}>
                      <td style={{ fontWeight: 500 }}>{new Date(sh.date + "T00:00:00Z").toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</td>
                      {isManager && <td><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: col(sh.uid).border, display: "inline-block" }} />{sh.name}</span></td>}
                      <td style={{ fontFamily: "monospace" }}>{sh.startTime}</td>
                      <td style={{ fontFamily: "monospace" }}>{sh.endTime}</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>{sh.totalHours.toFixed(1)}h</td>
                      {isManager && <td style={{ textAlign: "right", color: "var(--accent)" }}>{sh.wageEstimate > 0 ? fmtKr(sh.wageEstimate) : "—"}</td>}
                      <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>{sh.notes || "—"}</td>
                      <td style={{ textAlign: "center" }}>
                        {sh.source === "template"
                          ? <span style={{ fontSize: "0.72rem", opacity: 0.7 }}>↻ {t.recurring}</span>
                          : <span style={{ fontSize: "0.72rem", color: "var(--brand-light)" }}>{t.single}</span>}
                      </td>
                      {isManager && <td>
                        {sh.source === "single" && (
                          <button onClick={() => deleteShift(sh.id)} disabled={deletingId === sh.id}
                            style={{ padding: "2px 7px", fontSize: "0.75rem", border: "1px solid var(--border)", borderRadius: 5, background: "transparent", cursor: "pointer", color: "var(--danger)" }}>🗑</button>
                        )}
                      </td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr style={{ borderTop: "2px solid var(--border)" }}>
                  <td colSpan={isManager ? 4 : 2} style={{ fontWeight: 700, paddingTop: 8 }}>{lang === "is" ? "Samtals" : "Total"}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{totalHrs.toFixed(1)}h</td>
                  {isManager && <td style={{ textAlign: "right", fontWeight: 700, color: "var(--warning)" }}>{totalEst > 0 ? fmtKr(totalEst) : "—"}</td>}
                  <td /><td />{isManager && <td />}
                </tr></tfoot>
              </table>
            )}
          </div>
        )}

        {/* ── TEMPLATES VIEW ── */}
        {!loading && tab === "templates" && isManager && (
          <div>
            {templates.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-muted)" }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>↻</div>
                <div>{t.noTemplates}</div>
                <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => { setTmplForm(EMPTY_TMPL); setErr(""); setShowAdd("template"); }}>{t.addTemplate}</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {templates.map(tmpl => {
                  const c = col(tmpl.uid);
                  return (
                    <div key={tmpl.id} className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: c.bg, border: `2px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: c.text, fontSize: "0.9rem" }}>↻</div>
                        <div>
                          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{tmpl.name} {tmpl.label && <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· {tmpl.label}</span>}</div>
                          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "monospace" }}>{tmpl.startTime}–{tmpl.endTime}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {[0, 1, 2, 3, 4, 5, 6].map(dow => {
                          const active = tmpl.daysOfWeek.includes(dow);
                          return <span key={dow} style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 600, background: active ? c.border : "var(--bg-surface)", color: active ? "#fff" : "var(--text-muted)", border: "1px solid " + (active ? c.border : "var(--border)") }}>{t.days[dow]}</span>;
                        })}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: "0.82rem" }}>
                        <span style={{ color: "var(--text-muted)" }}>{tmpl.totalHours.toFixed(1)}h{tmpl.wageEstimate > 0 ? ` · ${fmtKr(tmpl.wageEstimate)}` : ""}{lang === "is" ? "/skipti" : "/shift"}</span>
                        <button onClick={() => deleteTemplate(tmpl.id)} disabled={deletingId === tmpl.id}
                          style={{ padding: "3px 8px", fontSize: "0.75rem", border: "1px solid var(--border)", borderRadius: 6, background: "transparent", cursor: "pointer", color: "var(--danger)" }}>
                          {deletingId === tmpl.id ? "..." : "🗑"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODALS ── */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div className="card" style={{ width: "100%", maxWidth: 460, padding: 26 }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", fontWeight: 700, marginBottom: 18, color: "var(--text-primary)" }}>
              {showAdd === "shift" ? t.addShift : t.addTemplate}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {/* Employee */}
              <div className="form-group">
                <label className="form-label">{t.employee}</label>
                <select className="form-input"
                  value={showAdd === "shift" ? shiftForm.uid : tmplForm.uid}
                  onChange={e => showAdd === "shift" ? setShiftForm(f => ({ ...f, uid: e.target.value })) : setTmplForm(f => ({ ...f, uid: e.target.value }))}>
                  <option value="">{lang === "is" ? "Veldu starfsmann..." : "Choose employee..."}</option>
                  {staffList.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
                </select>
              </div>

              {showAdd === "shift" ? (
                /* Single shift fields */
                <div className="form-group">
                  <label className="form-label">{t.date}</label>
                  <input type="date" className="form-input" value={shiftForm.date} onChange={e => setShiftForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              ) : (
                /* Template: days of week */
                <div className="form-group">
                  <label className="form-label">{lang === "is" ? "Virkir dagar" : "Active days"}</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[0, 1, 2, 3, 4, 5, 6].map(dow => {
                      const active = tmplForm.daysOfWeek.includes(dow);
                      return (
                        <button key={dow} type="button"
                          onClick={() => setTmplForm(f => ({ ...f, daysOfWeek: active ? f.daysOfWeek.filter(d => d !== dow) : [...f.daysOfWeek, dow].sort() }))}
                          style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${active ? "var(--brand)" : "var(--border)"}`, background: active ? "var(--brand)" : "transparent", color: active ? "#fff" : "var(--text-muted)", fontSize: "0.72rem", fontWeight: 600, cursor: "pointer" }}>
                          {t.days[dow]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Time */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">{t.from}</label>
                  <input type="time" className="form-input" style={{ fontFamily: "monospace" }}
                    value={showAdd === "shift" ? shiftForm.startTime : tmplForm.startTime}
                    onChange={e => showAdd === "shift" ? setShiftForm(f => ({ ...f, startTime: e.target.value })) : setTmplForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.to}</label>
                  <input type="time" className="form-input" style={{ fontFamily: "monospace" }}
                    value={showAdd === "shift" ? shiftForm.endTime : tmplForm.endTime}
                    onChange={e => showAdd === "shift" ? setShiftForm(f => ({ ...f, endTime: e.target.value })) : setTmplForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>

              {/* Notes / Label */}
              <div className="form-group">
                <label className="form-label">{showAdd === "shift" ? t.notes : t.label}</label>
                <input className="form-input"
                  placeholder={showAdd === "shift" ? (lang === "is" ? "Opnunarvakt, bar..." : "Opening, bar...") : (lang === "is" ? "Barþjónn, eldhús..." : "Server, kitchen...")}
                  value={showAdd === "shift" ? shiftForm.notes : tmplForm.label}
                  onChange={e => showAdd === "shift" ? setShiftForm(f => ({ ...f, notes: e.target.value })) : setTmplForm(f => ({ ...f, label: e.target.value }))} />
              </div>

              {err && <div style={{ color: "var(--danger)", fontSize: "0.83rem" }}>{err}</div>}
            </div>

            <div style={{ display: "flex", gap: 9, marginTop: 20, justifyContent: "flex-end" }}>
              <button className="btn btn--ghost btn--sm" onClick={() => { setShowAdd(null); setErr(""); }}>{t.cancel}</button>
              <button className="btn btn--primary" onClick={showAdd === "shift" ? saveShift : saveTemplate}
                disabled={saving || (showAdd === "shift" ? !shiftForm.uid || !shiftForm.date : !tmplForm.uid || !tmplForm.daysOfWeek.length)}>
                {saving ? "..." : t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
