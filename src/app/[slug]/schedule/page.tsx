"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

type Lang = "is" | "en";
const T = {
  is: {
    title: "Vaktaplan", back: "← Til baka", loading: "Hleður...",
    thisWeek: "Þessi vika", save: "Vista", cancel: "Hætta við",
    employee: "Starfsmaður", from: "Frá", to: "Til", note: "Athugasemd",
    close: "Lokun", confirmDel: "Eyða vakt?", confirmDelTmpl: "Eyða fastri vakt?",
    addShift: "+ Vakt", templatesTitle: "Föstar vaktir",
    days: ["Sun", "Mán", "Þri", "Mið", "Fim", "Fös", "Lau"],
    recurring: "↻ Föst vakt", single: "• Stök vakt",
    totalCost: "Áætlaður kostnaður",
  },
  en: {
    title: "Schedule", back: "← Back", loading: "Loading...",
    thisWeek: "This week", save: "Save", cancel: "Cancel",
    employee: "Employee", from: "From", to: "To", note: "Note",
    close: "Close", confirmDel: "Delete shift?", confirmDelTmpl: "Delete recurring shift?",
    addShift: "+ Shift", templatesTitle: "Recurring",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    recurring: "↻ Recurring", single: "• One-off",
    totalCost: "Estimated cost",
  },
};

const STAFF_COLORS = [
  { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
  { bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  { bg: "#fee2e2", border: "#ef4444", text: "#991b1b" },
  { bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
  { bg: "#fce7f3", border: "#ec4899", text: "#9d174d" },
  { bg: "#ccfbf1", border: "#14b8a6", text: "#134e4a" },
  { bg: "#e0e7ff", border: "#6366f1", text: "#3730a3" },
];

function getWeekStart(d: Date) {
  const dd = new Date(d); const dow = dd.getUTCDay();
  dd.setUTCDate(dd.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  dd.setUTCHours(0, 0, 0, 0); return dd;
}
function addDays(d: Date, n: number) { const dd = new Date(d); dd.setUTCDate(dd.getUTCDate() + n); return dd; }
function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
function fmtKr(n: number) { return n.toLocaleString("is-IS") + " kr"; }
function fmtHeader(d: Date, lang: Lang) {
  return d.toLocaleDateString(lang === "is" ? "is-IS" : "en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
function fmtWeekRange(s: Date, lang: Lang) {
  const e = addDays(s, 6);
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  const loc = lang === "is" ? "is-IS" : "en-GB";
  return `${s.toLocaleDateString(loc, o)} – ${e.toLocaleDateString(loc, { ...o, year: "numeric" })}`;
}

// Build 24h time options at 15-min intervals (00:00 → 23:45)
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

function Time24Select({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  // Snap to nearest 15-min slot if needed
  const snapped = TIME_OPTIONS.includes(value) ? value : TIME_OPTIONS.reduce((best, opt) => {
    const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    return Math.abs(toMins(opt) - toMins(value)) < Math.abs(toMins(best) - toMins(value)) ? opt : best;
  }, TIME_OPTIONS[0]);
  return (
    <select className="form-input" style={{ fontFamily: "monospace", ...style }} value={snapped} onChange={e => onChange(e.target.value)}>
      {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}


interface Shift {
  id: string; uid: string; name: string; date: string;
  startTime: string; endTime: string; notes: string;
  wageEstimate: number; totalHours: number; source: "single" | "template"; templateId?: string;
}
interface Template { id: string; uid: string; name: string; daysOfWeek: number[]; startTime: string; endTime: string; label: string; }
interface StaffMember { uid: string; name: string; status: string; }
interface AddModal { dayIndex: number; date: string; }

export default function SchedulePage() {
  const { slug } = useParams() as { slug: string };
  const [user, setUser] = useState<User | null>(null);
  const [lang] = useState<Lang>(() => typeof window !== "undefined" ? (localStorage.getItem(`tv_lang_${slug}`) as Lang) || "is" : "is");
  const t = T[lang];

  const [myRole, setMyRole] = useState("");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [uidToColor, setUidToColor] = useState<Map<string, number>>(new Map());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(k => k + 1);
  const isManager = ["manager", "admin", "owner"].includes(myRole);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Modal
  const [modal, setModal] = useState<AddModal | null>(null);
  const [mUid, setMUid] = useState("");
  const [mFrom, setMFrom] = useState("11:00");
  const [mTo, setMTo] = useState("18:00");
  const [mNote, setMNote] = useState("");
  const [mType, setMType] = useState<"single" | "recurring">("single");
  const [saving, setSaving] = useState(false);

  const openModal = (dayIndex: number, date: string) => {
    setModal({ dayIndex, date });
    setMUid(staffList[0]?.uid || "");
    setMFrom("11:00"); setMTo("18:00"); setMNote(""); setMType("single");
  };
  const closeModal = () => setModal(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // Portal — staff list
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user.getIdToken().then(async tok => {
      const r = await fetch(`/api/${slug}/portal`, { headers: { Authorization: `Bearer ${tok}` } });
      if (cancelled || !r.ok) return;
      const d = await r.json();
      if (d.role) setMyRole(d.role);
      const approved: StaffMember[] = (d.staffList || []).filter((s: StaffMember) => s.status === "approved");
      setStaffList(approved);
      const m = new Map<string, number>();
      approved.forEach((s, i) => m.set(s.uid, i % STAFF_COLORS.length));
      setUidToColor(m);
      setMUid(prev => prev || approved[0]?.uid || "");
    });
    return () => { cancelled = true; };
  }, [user, slug]);

  // Shifts + role
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const tok = await user.getIdToken();
        const from = toYMD(weekStart); const to = toYMD(addDays(weekStart, 6));
        const [sRes, tRes] = await Promise.all([
          fetch(`/api/${slug}/schedule?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${tok}` } }),
          fetch(`/api/${slug}/shift-templates`, { headers: { Authorization: `Bearer ${tok}` } }),
        ]);
        if (cancelled) return;
        if (sRes.ok) { const d = await sRes.json(); setShifts(d.shifts || []); if (d.myRole) setMyRole(d.myRole); }
        if (tRes.ok) { const d = await tRes.json(); setTemplates(d.templates || []); }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, slug, weekStart, reloadKey]);

  const saveShift = async () => {
    if (!user || !mUid || !modal) return;
    setSaving(true);
    try {
      const tok = await user.getIdToken();
      const day = weekDays[modal.dayIndex];
      const dow = day.getUTCDay();
      if (mType === "recurring") {
        await fetch(`/api/${slug}/shift-templates`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ uid: mUid, daysOfWeek: [dow], startTime: mFrom, endTime: mTo, label: mNote }) });
      } else {
        await fetch(`/api/${slug}/schedule`, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ uid: mUid, date: modal.date, startTime: mFrom, endTime: mTo, notes: mNote }) });
      }
      closeModal(); reload();
    } finally { setSaving(false); }
  };

  const deleteShift = async (sh: Shift) => {
    if (!user || !confirm(sh.source === "template" ? t.confirmDelTmpl : t.confirmDel)) return;
    setDeletingId(sh.id);
    try {
      const tok = await user.getIdToken();
      if (sh.source === "template" && sh.templateId) {
        await fetch(`/api/${slug}/shift-templates`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ templateId: sh.templateId }) });
      } else {
        await fetch(`/api/${slug}/schedule`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ shiftId: sh.id }) });
      }
      reload();
    } finally { setDeletingId(null); }
  };

  const col = (uid: string) => STAFF_COLORS[uidToColor.get(uid) ?? 0];
  const totalEst = shifts.reduce((s, x) => s + (x.wageEstimate || 0), 0);
  const totalHrs = shifts.reduce((s, x) => s + (x.totalHours || 0), 0);
  // Group shifts by date
  const byDate = new Map<string, Shift[]>();
  for (const sh of shifts) { if (!byDate.has(sh.date)) byDate.set(sh.date, []); byDate.get(sh.date)!.push(sh); }

  if (!user) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>{t.loading}</div>;

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "12px 0", background: "var(--bg-surface)", position: "sticky", top: 0, zIndex: 100 }}>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href={`/${slug}`} style={{ color: "var(--text-muted)", fontSize: "0.88rem", textDecoration: "none" }}>{t.back}</Link>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>🗓 {t.title}</h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <button onClick={() => setWeekStart(w => addDays(w, -7))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 13px", cursor: "pointer", color: "var(--text-primary)", fontSize: "1.1rem" }}>‹</button>
            <span style={{ fontSize: "0.88rem", minWidth: 175, textAlign: "center" }}>{fmtWeekRange(weekStart, lang)}</span>
            <button onClick={() => setWeekStart(w => addDays(w, 7))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 13px", cursor: "pointer", color: "var(--text-primary)", fontSize: "1.1rem" }}>›</button>
            <button onClick={() => setWeekStart(getWeekStart(new Date()))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 9px", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.78rem" }}>{t.thisWeek}</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isManager && templates.length > 0 && (
              <button onClick={() => setShowTemplates(v => !v)} style={{ fontSize: "0.8rem", padding: "5px 11px", borderRadius: 7, border: "1px solid var(--border)", background: showTemplates ? "var(--brand)" : "var(--bg-card)", color: showTemplates ? "#fff" : "var(--text-muted)", cursor: "pointer" }}>
                ↻ {t.templatesTitle} ({templates.length})
              </button>
            )}
            {shifts.length > 0 && (
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "5px 11px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7 }}>
                {totalHrs.toFixed(1)}h{totalEst > 0 ? ` · ${fmtKr(totalEst)}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Templates panel */}
      {showTemplates && (
        <div className="container" style={{ padding: "10px 24px" }}>
          <div className="card" style={{ padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {templates.map(tmpl => {
              const c = col(tmpl.uid);
              return (
                <div key={tmpl.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 7, fontSize: "0.78rem" }}>
                  <span style={{ fontWeight: 600, color: c.text }}>{tmpl.name.split(" ")[0]}</span>
                  <span style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>{tmpl.startTime}–{tmpl.endTime}</span>
                  <span style={{ color: "var(--text-muted)" }}>{tmpl.daysOfWeek.map(d => t.days[d]).join(" ")}</span>
                  {tmpl.label && <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>{tmpl.label}</span>}
                  {isManager && <button onClick={async () => {
                    if (!user || !confirm(t.confirmDelTmpl)) return;
                    const tok = await user.getIdToken();
                    await fetch(`/api/${slug}/shift-templates`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ templateId: tmpl.id }) });
                    reload();
                  }} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--danger)", padding: "0 2px", fontSize: "0.8rem" }}>✕</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Schedule table */}
      <div className="container" style={{ padding: "16px 24px" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 700 }}>
            <thead>
              <tr>
                {weekDays.map((day, i) => {
                  const isToday = toYMD(day) === toYMD(new Date());
                  const dow = day.getUTCDay();
                  const isWeekend = dow === 0 || dow === 6;
                  return (
                    <th key={i} style={{ padding: "10px 8px", textAlign: "center", width: "14.28%", background: isToday ? "var(--brand)" : isWeekend ? "var(--bg-surface)" : "var(--bg-card)", color: isToday ? "#fff" : isWeekend ? "var(--text-secondary)" : "var(--text-primary)", border: "1px solid var(--border)", borderRadius: i === 0 ? "8px 0 0 0" : i === 6 ? "0 8px 0 0" : 0, fontWeight: 700, fontSize: "0.82rem" }}>
                      {fmtHeader(day, lang)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr style={{ verticalAlign: "top" }}>
                {weekDays.map((day, dayIndex) => {
                  const ymd = toYMD(day);
                  const dayShifts = byDate.get(ymd) || [];
                  const isWeekend = [0, 6].includes(day.getUTCDay());
                  return (
                    <td key={dayIndex} style={{ padding: "8px 6px", border: "1px solid var(--border)", borderTop: "none", verticalAlign: "top", background: isWeekend ? "rgba(0,0,0,0.015)" : "transparent", minHeight: 120 }}>
                      {/* Shift cards stacked vertically within day */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {loading ? (
                          <div style={{ height: 36, background: "var(--bg-surface)", borderRadius: 6, animation: "pulse 1.5s infinite" }} />
                        ) : (
                          dayShifts.map(sh => {
                            const c = col(sh.uid);
                            return (
                              <div key={sh.id} style={{ position: "relative", padding: "5px 8px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 7, opacity: deletingId === sh.id ? 0.4 : 1 }}>
                                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: c.text, lineHeight: 1.2 }}>
                                  {sh.source === "template" && <span style={{ opacity: 0.65, marginRight: 2 }}>↻</span>}
                                  {sh.name}
                                </div>
                                <div style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-secondary)", marginTop: 1 }}>
                                  {sh.startTime}–{sh.endTime}
                                </div>
                                {sh.notes && <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontStyle: "italic" }}>{sh.notes}</div>}
                                {isManager && (
                                  <button onClick={() => deleteShift(sh)}
                                    style={{ position: "absolute", top: 3, right: 4, background: "transparent", border: "none", cursor: "pointer", color: c.border, opacity: 0.5, fontSize: "0.75rem", lineHeight: 1, padding: "0 2px" }}
                                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}>✕</button>
                                )}
                              </div>
                            );
                          })
                        )}
                        {/* Add button */}
                        {isManager && (
                          <button onClick={() => openModal(dayIndex, ymd)}
                            style={{ padding: "5px 0", borderRadius: 6, border: "1px dashed var(--border)", background: "transparent", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.78rem", width: "100%", transition: "all 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
                            {t.addShift}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Legend */}
        {!loading && shifts.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {[...new Set(shifts.map(s => s.uid))].map(uid => {
              const s = shifts.find(x => x.uid === uid); const c = col(uid);
              return <span key={uid} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c.bg, border: `1.5px solid ${c.border}`, display: "inline-block" }} />{s?.name}</span>;
            })}
          </div>
        )}
      </div>

      {/* Add shift modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: 24 }}>
          <div className="card" style={{ width: "100%", maxWidth: 380, padding: 24 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1rem", marginBottom: 16 }}>
              {fmtHeader(weekDays[modal.dayIndex], lang)}
            </div>

            {/* Employee */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">{t.employee}</label>
              <select className="form-input" value={mUid} onChange={e => setMUid(e.target.value)}>
                {staffList.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
              </select>
            </div>

            {/* Time */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{t.from}</label>
                <Time24Select value={mFrom} onChange={setMFrom} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{t.to}</label>
                <Time24Select value={mTo} onChange={setMTo} />
              </div>
            </div>

            {/* Note */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">{t.note}</label>
              <input className="form-input" placeholder={lang === "is" ? "Bar, eldhús, þrið hæð..." : "Bar, kitchen, 3rd floor..."} value={mNote} onChange={e => setMNote(e.target.value)} />
            </div>

            {/* Shift type */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {(["single", "recurring"] as const).map(type => (
                <button key={type} onClick={() => setMType(type)}
                  style={{ flex: 1, padding: "9px 6px", borderRadius: 8, border: `2px solid ${mType === type ? "var(--brand)" : "var(--border)"}`, background: mType === type ? "rgba(108,99,255,0.08)" : "transparent", cursor: "pointer", fontSize: "0.78rem", color: mType === type ? "var(--brand)" : "var(--text-secondary)", fontWeight: mType === type ? 600 : 400, transition: "all 0.15s" }}>
                  {type === "single" ? t.single : t.recurring}
                </button>
              ))}
            </div>
            {mType === "recurring" && (
              <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginBottom: 14, background: "var(--bg-surface)", borderRadius: 6, padding: "6px 10px" }}>
                {lang === "is" ? `Endurtekst á ${t.days[weekDays[modal.dayIndex].getUTCDay()]} hverja viku` : `Repeats every ${t.days[weekDays[modal.dayIndex].getUTCDay()]}`}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn--ghost btn--sm" onClick={closeModal}>{t.cancel}</button>
              <button className="btn btn--primary" onClick={saveShift} disabled={saving || !mUid}>{saving ? "..." : t.save}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
