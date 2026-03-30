"use client";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";

type Lang = "is" | "en";

const T = {
  is: {
    title: "Vaktaplan", back: "← Til baka", loading: "Hleður...",
    addTemplate: "Föst vakt", addSingle: "Stök vakt",
    thisWeek: "Þessi vika", noRate: "(kaup ikke stillt)",
    employee: "Starfsmaður", shiftType: "Tegund", save: "Vista", cancel: "Hætta við",
    recurring: "↻ Föst vakt (endurtekst á þessum degi hverja viku)",
    single: "• Stök vakt (þennan dag einungis)",
    confirmDel: "Eyða þessari vakt?", confirmDelTmpl: "Eyða fastri vakt fyrir alla framtíð?",
    totalCost: "Áætlaður kostnaður", hours: "klst.",
    templatesTitle: "Föstar vaktir", noTemplates: "Engar fastar vaktir",
    days: ["Sun", "Mán", "Þri", "Mið", "Fim", "Fös", "Lau"],
    dragHint: "Dragðu yfir tímasvæði til að búa til vakt",
  },
  en: {
    title: "Schedule", back: "← Back", loading: "Loading...",
    addTemplate: "Recurring", addSingle: "One-off",
    thisWeek: "This week", noRate: "(rate not set)",
    employee: "Employee", shiftType: "Type", save: "Save", cancel: "Cancel",
    recurring: "↻ Recurring (repeats every week on this day)",
    single: "• One-off (this date only)",
    confirmDel: "Delete this shift?", confirmDelTmpl: "Delete recurring shift permanently?",
    totalCost: "Estimated cost", hours: "hrs",
    templatesTitle: "Recurring shifts", noTemplates: "No recurring shifts",
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    dragHint: "Drag over hours to create a shift",
  },
};

const STAFF_COLORS = [
  { bg: "rgba(108,99,255,0.25)", border: "#6c63ff", text: "#6c63ff" },
  { bg: "rgba(16,185,129,0.25)", border: "#10b981", text: "#059669" },
  { bg: "rgba(245,158,11,0.25)", border: "#f59e0b", text: "#b45309" },
  { bg: "rgba(239,68,68,0.25)", border: "#ef4444", text: "#dc2626" },
  { bg: "rgba(139,92,246,0.25)", border: "#8b5cf6", text: "#7c3aed" },
  { bg: "rgba(236,72,153,0.25)", border: "#ec4899", text: "#be185d" },
  { bg: "rgba(20,184,166,0.25)", border: "#14b8a6", text: "#0f766e" },
];

// Grid: 06:00 → 02:00 next day = 20 hours
const GRID_START = 6;   // 06:00
const GRID_END = 26;    // 02:00 +1day
const GRID_HOURS = GRID_END - GRID_START; // 20 rows
const ROW_H = 44; // px per hour
const LABEL_W = 52; // px for time label column

function fmt24(h: number) {
  const hh = h % 24;
  return `${String(hh).padStart(2, "0")}:00`;
}
function timeToRow(hhmm: string, crossesMidnight = false): number {
  const [h, m] = hhmm.split(":").map(Number);
  let hour = h + m / 60;
  if (crossesMidnight && hour < GRID_START) hour += 24;
  return Math.max(0, Math.min(GRID_HOURS, hour - GRID_START));
}
function rowToTime(row: number): string {
  const h = (row + GRID_START) % 24;
  return `${String(h).padStart(2, "0")}:00`;
}
function fmtKr(n: number) { return n.toLocaleString("is-IS") + " kr"; }
function getWeekStart(d: Date) {
  const dd = new Date(d); const dow = dd.getUTCDay();
  dd.setUTCDate(dd.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  dd.setUTCHours(0, 0, 0, 0); return dd;
}
function addDays(d: Date, n: number) { const dd = new Date(d); dd.setUTCDate(dd.getUTCDate() + n); return dd; }
function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
function fmtWeekRange(s: Date, lang: Lang) {
  const e = addDays(s, 6);
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };
  const loc = lang === "is" ? "is-IS" : "en-GB";
  return `${s.toLocaleDateString(loc, o)} – ${e.toLocaleDateString(loc, { ...o, year: "numeric" })}`;
}

interface Shift {
  id: string; uid: string; name: string; date: string;
  startTime: string; endTime: string; notes: string;
  wageEstimate: number; totalHours: number; source: "single" | "template"; templateId?: string;
}
interface Template {
  id: string; uid: string; name: string; daysOfWeek: number[];
  startTime: string; endTime: string; label: string;
  wageEstimate: number; totalHours: number;
}
interface StaffMember { uid: string; name: string; status: string; }
interface DragState { dayIndex: number; startRow: number; endRow: number; }
interface Pending { dayIndex: number; startRow: number; endRow: number; x: number; y: number; }

const DOW_MON_FIRST = [1, 2, 3, 4, 5, 6, 0]; // grid columns Mon→Sun → DOW values

export default function SchedulePage() {
  const { slug } = useParams() as { slug: string };
  const [user, setUser] = useState<User | null>(null);
  const [lang] = useState<Lang>(() => (typeof window !== "undefined" ? (localStorage.getItem(`tv_lang_${slug}`) as Lang) || "is" : "is"));
  const t = T[lang];

  const [myRole, setMyRole] = useState("");
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [uidToColorIdx, setUidToColorIdx] = useState<Map<string, number>>(new Map());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [showTemplates, setShowTemplates] = useState(false);

  // Drag state
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Popup for new shift
  const [pendingUid, setPendingUid] = useState("");
  const [pendingType, setPendingType] = useState<"single" | "recurring">("single");
  const [pendingLabel, setPendingLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isManager = ["manager", "admin", "owner"].includes(myRole);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(k => k + 1);

  const col = (uid: string) => STAFF_COLORS[uidToColorIdx.get(uid) ?? 0];

  useEffect(() => { return onAuthStateChanged(auth, setUser); }, []);

  // Load portal data (role + staff list) once on auth
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    user.getIdToken().then(async tok => {
      const r = await fetch(`/api/${slug}/portal`, { headers: { Authorization: `Bearer ${tok}` } });
      if (cancelled || !r.ok) return;
      const d = await r.json();
      setMyRole(d.role || "");
      const approved = (d.staffList || []).filter((s: StaffMember) => s.status === "approved");
      setStaffList(approved);
      const m = new Map<string, number>();
      approved.forEach((s: StaffMember, i: number) => m.set(s.uid, i % STAFF_COLORS.length));
      setUidToColorIdx(m);
      if (approved.length > 0) setPendingUid(prev => prev || approved[0].uid);
    });
    return () => { cancelled = true; };
  }, [user, slug]);

  // Load shifts + templates whenever week or reloadKey changes
  useEffect(() => {
    if (!user || !myRole) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const tok = await user.getIdToken();
        const from = toYMD(weekStart);
        const to = toYMD(addDays(weekStart, 6));
        const isMgr = ["manager", "admin", "owner"].includes(myRole);
        const [sRes, tRes] = await Promise.all([
          fetch(`/api/${slug}/schedule?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${tok}` } }),
          isMgr ? fetch(`/api/${slug}/shift-templates`, { headers: { Authorization: `Bearer ${tok}` } }) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (sRes.ok) { const d = await sRes.json(); setShifts(d.shifts || []); }
        if (tRes?.ok) { const d = await tRes.json(); setTemplates(d.templates || []); }
      } finally { if (!cancelled) setLoading(false); }
    };
    load();
    return () => { cancelled = true; };
  }, [user, slug, weekStart, myRole, reloadKey]); // stable deps — no callbacks

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const getCellFromEvent = (e: React.MouseEvent, dayIndex: number) => {
    const col = e.currentTarget as HTMLElement;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top;
    return Math.max(0, Math.min(GRID_HOURS - 1, Math.floor(y / ROW_H)));
  };

  const onMouseDown = (e: React.MouseEvent, dayIndex: number) => {
    if (!isManager) return;
    e.preventDefault();
    const row = getCellFromEvent(e, dayIndex);
    setDrag({ dayIndex, startRow: row, endRow: row });
  };

  const onMouseMove = (e: React.MouseEvent, dayIndex: number) => {
    if (!drag || drag.dayIndex !== dayIndex) return;
    const row = getCellFromEvent(e, dayIndex);
    setDrag(d => d ? { ...d, endRow: row } : null);
  };

  const onMouseUp = (e: React.MouseEvent, dayIndex: number) => {
    if (!drag || drag.dayIndex !== dayIndex) return;
    const minRow = Math.min(drag.startRow, drag.endRow);
    const maxRow = Math.max(drag.startRow, drag.endRow) + 1;
    if (maxRow - minRow < 1) { setDrag(null); return; }
    const rect = (e.currentTarget as HTMLElement).closest(".schedule-grid")?.getBoundingClientRect();
    setPending({
      dayIndex, startRow: minRow, endRow: maxRow,
      x: rect ? e.clientX - rect.left : e.clientX,
      y: rect ? e.clientY - rect.top : e.clientY,
    });
    setDrag(null);
  };

  const cancelPending = () => { setPending(null); setPendingLabel(""); setPendingType("single"); };

  const savePending = async () => {
    if (!pending || !user || !pendingUid) return;
    setSaving(true);
    try {
      const tok = await user.getIdToken();
      const day = weekDays[pending.dayIndex];
      const startTime = rowToTime(pending.startRow);
      const endTime = rowToTime(pending.endRow);
      const date = toYMD(day);
      const dow = day.getUTCDay();

      if (pendingType === "recurring") {
        await fetch(`/api/${slug}/shift-templates`, {
          method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uid: pendingUid, daysOfWeek: [dow], startTime, endTime, label: pendingLabel }),
        });
      } else {
        await fetch(`/api/${slug}/schedule`, {
          method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
          body: JSON.stringify({ uid: pendingUid, date, startTime, endTime, notes: pendingLabel }),
        });
      }
      cancelPending();
      reload();
    } finally { setSaving(false); }
  };

  const deleteShift = async (sh: Shift) => {
    if (!user) return;
    const isTemplate = sh.source === "template";
    if (!confirm(isTemplate ? t.confirmDelTmpl : t.confirmDel)) return;
    setDeletingId(sh.id);
    try {
      const tok = await user.getIdToken();
      if (isTemplate && sh.templateId) {
        await fetch(`/api/${slug}/shift-templates`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ templateId: sh.templateId }) });
      } else {
        await fetch(`/api/${slug}/schedule`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ shiftId: sh.id }) });
      }
      reload();
    } finally { setDeletingId(null); }
  };

  // Group shifts by day index (0=Mon..6=Sun)
  const shiftsByDay = new Map<number, Shift[]>();
  for (const sh of shifts) {
    const dayIdx = weekDays.findIndex(d => toYMD(d) === sh.date);
    if (dayIdx >= 0) {
      if (!shiftsByDay.has(dayIdx)) shiftsByDay.set(dayIdx, []);
      shiftsByDay.get(dayIdx)!.push(sh);
    }
  }

  const totalEst = shifts.reduce((s, x) => s + (x.wageEstimate || 0), 0);
  const totalHrs = shifts.reduce((s, x) => s + (x.totalHours || 0), 0);

  if (!user) return <div style={{ padding: 40, textAlign: "center" }}>{t.loading}</div>;

  return (
    <div className="page" style={{ minHeight: "100vh", userSelect: "none" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "12px 0", background: "var(--bg-surface)", position: "sticky", top: 0, zIndex: 100 }}>
        <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href={`/${slug}`} style={{ color: "var(--text-muted)", fontSize: "0.88rem", textDecoration: "none" }}>{t.back}</Link>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>🗓 {t.title}</h1>
          </div>
          {/* Week nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <button onClick={() => setWeekStart(w => addDays(w, -7))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7, padding: "4px 12px", cursor: "pointer", color: "var(--text-primary)", fontSize: "1rem" }}>‹</button>
            <span style={{ fontSize: "0.88rem", minWidth: 175, textAlign: "center" }}>{fmtWeekRange(weekStart, lang)}</span>
            <button onClick={() => setWeekStart(w => addDays(w, 7))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7, padding: "4px 12px", cursor: "pointer", color: "var(--text-primary)", fontSize: "1rem" }}>›</button>
            <button onClick={() => setWeekStart(getWeekStart(new Date()))} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7, padding: "4px 9px", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.78rem" }}>{t.thisWeek}</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isManager && <button onClick={() => setShowTemplates(v => !v)} style={{ fontSize: "0.82rem", padding: "5px 12px", borderRadius: 7, border: "1px solid var(--border)", background: showTemplates ? "var(--brand)" : "var(--bg-card)", color: showTemplates ? "#fff" : "var(--text-muted)", cursor: "pointer" }}>↻ {t.templatesTitle} {templates.length > 0 && `(${templates.length})`}</button>}
            {shifts.length > 0 && <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", padding: "5px 12px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 7 }}>{totalHrs.toFixed(1)}h{totalEst > 0 ? ` · ${fmtKr(totalEst)}` : ""}</span>}
          </div>
        </div>
      </div>

      {/* Templates panel */}
      {showTemplates && isManager && (
        <div className="container" style={{ padding: "12px 24px" }}>
          <div className="card" style={{ padding: "14px 18px" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>↻ {t.templatesTitle}</div>
            {templates.length === 0 ? <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>{t.noTemplates}</div> : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {templates.map(tmpl => {
                  const c = col(tmpl.uid);
                  return (
                    <div key={tmpl.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8 }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: c.text }}>{tmpl.name.split(" ")[0]}</span>
                      <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-secondary)" }}>{tmpl.startTime}–{tmpl.endTime}</span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {tmpl.daysOfWeek.map(d => t.days[d]).join(" ")}
                      </span>
                      {tmpl.label && <span style={{ fontSize: "0.72rem", fontStyle: "italic", color: "var(--text-muted)" }}>{tmpl.label}</span>}
                      <button onClick={async () => {
                        if (!user || !confirm(t.confirmDelTmpl)) return;
                        const tok = await user.getIdToken();
                        await fetch(`/api/${slug}/shift-templates`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ templateId: tmpl.id }) });
                        reload();
                      }} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: "0.8rem", padding: "0 2px" }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="container" style={{ padding: "16px 24px" }}>
        {loading && <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>{t.loading}</div>}
        {!loading && (
          <div ref={gridRef} className="schedule-grid" style={{ position: "relative", overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px repeat(7, 1fr)`, minWidth: 680 }}>
              {/* Header row */}
              <div style={{ height: 40 }} />
              {weekDays.map((day, i) => {
                const isToday = toYMD(day) === toYMD(new Date());
                const dow = day.getUTCDay();
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <div key={i} style={{ height: 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderLeft: "1px solid var(--border)", background: isToday ? "var(--brand)" : isWeekend ? "var(--bg-surface)" : "transparent", color: isToday ? "#fff" : isWeekend ? "var(--text-secondary)" : "var(--text-primary)", borderRadius: i === 0 ? "8px 0 0 0" : i === 6 ? "0 8px 0 0" : 0 }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{t.days[dow]}</div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700 }}>{day.getUTCDate()}.{day.getUTCMonth() + 1}</div>
                  </div>
                );
              })}

              {/* Time label column + day columns */}
              {/* Render all hour labels */}
              <div style={{ position: "relative", height: GRID_HOURS * ROW_H }}>
                {Array.from({ length: GRID_HOURS + 1 }, (_, i) => (
                  <div key={i} style={{ position: "absolute", top: i * ROW_H - 8, right: 8, fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "monospace", lineHeight: 1 }}>
                    {fmt24(GRID_START + i)}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((day, dayIndex) => {
                const dayShifts = shiftsByDay.get(dayIndex) || [];
                const isDragging = drag?.dayIndex === dayIndex;
                const dragMin = isDragging ? Math.min(drag.startRow, drag.endRow) : -1;
                const dragMax = isDragging ? Math.max(drag.startRow, drag.endRow) + 1 : -1;

                return (
                  <div key={dayIndex}
                    style={{ position: "relative", height: GRID_HOURS * ROW_H, borderLeft: "1px solid var(--border)", cursor: isManager ? "crosshair" : "default" }}
                    onMouseDown={e => onMouseDown(e, dayIndex)}
                    onMouseMove={e => onMouseMove(e, dayIndex)}
                    onMouseUp={e => onMouseUp(e, dayIndex)}
                    onMouseLeave={() => drag?.dayIndex === dayIndex && setDrag(null)}>

                    {/* Hour grid lines */}
                    {Array.from({ length: GRID_HOURS }, (_, i) => (
                      <div key={i} style={{ position: "absolute", top: i * ROW_H, left: 0, right: 0, height: ROW_H, borderTop: "1px solid var(--border)", borderTopColor: i % 2 === 0 ? "var(--border)" : "transparent" }} />
                    ))}

                    {/* Drag selection overlay */}
                    {isDragging && drag && dragMax > dragMin && (
                      <div style={{ position: "absolute", top: dragMin * ROW_H, left: 2, right: 2, height: (dragMax - dragMin) * ROW_H, background: "rgba(108,99,255,0.2)", border: "2px solid var(--brand)", borderRadius: 6, zIndex: 5, pointerEvents: "none" }}>
                        <div style={{ padding: "3px 6px", fontSize: "0.72rem", color: "var(--brand)", fontFamily: "monospace", fontWeight: 600 }}>
                          {rowToTime(dragMin)}–{rowToTime(dragMax)}
                        </div>
                      </div>
                    )}

                    {/* Shifts */}
                    {dayShifts.map(sh => {
                      const crosses = sh.endTime <= sh.startTime;
                      const top = timeToRow(sh.startTime) * ROW_H;
                      const endRow = timeToRow(sh.endTime, crosses);
                      const height = Math.max(ROW_H * 0.5, (endRow - timeToRow(sh.startTime)) * ROW_H);
                      const c = col(sh.uid);
                      const isRecurring = sh.source === "template";
                      return (
                        <div key={sh.id}
                          style={{ position: "absolute", top, left: 3, right: 3, height, background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 6, zIndex: 10, overflow: "hidden", cursor: isManager ? "pointer" : "default", opacity: deletingId === sh.id ? 0.4 : 1 }}
                          onClick={() => isManager && deleteShift(sh)}>
                          <div style={{ padding: "2px 5px" }}>
                            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: c.text, lineHeight: 1.2 }}>
                              {isRecurring && <span style={{ opacity: 0.7 }}>↻ </span>}{sh.name.split(" ")[0]}
                            </div>
                            <div style={{ fontSize: "0.68rem", fontFamily: "monospace", color: "var(--text-secondary)" }}>{sh.startTime}–{sh.endTime}</div>
                            {sh.notes && <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontStyle: "italic" }}>{sh.notes}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Drag hint */}
            {isManager && shifts.length === 0 && !loading && (
              <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%,-50%)", color: "var(--text-muted)", fontSize: "0.85rem", pointerEvents: "none", textAlign: "center" }}>
                <div style={{ fontSize: "2rem", marginBottom: 6 }}>✏️</div>
                {t.dragHint}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {shifts.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            {[...new Set(shifts.map(s => s.uid))].map(uid => {
              const s = shifts.find(x => x.uid === uid);
              const c = col(uid);
              return <span key={uid} style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c.bg, border: `1.5px solid ${c.border}`, display: "inline-block" }} />{s?.name}</span>;
            })}
            <span>↻ = {t.addTemplate.toLowerCase()}</span>
            {isManager && <span style={{ marginLeft: "auto", opacity: 0.6 }}>{lang === "is" ? "Smelltu á vakt til að eyða" : "Click shift to delete"}</span>}
          </div>
        )}
      </div>

      {/* ── Create shift popup ── */}
      {pending && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", padding: 24 }}>
          <div className="card" style={{ width: "100%", maxWidth: 360, padding: 22 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, marginBottom: 14, color: "var(--text-primary)" }}>
              {rowToTime(pending.startRow)} – {rowToTime(pending.endRow)}
              <span style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--text-muted)", marginLeft: 8 }}>({pending.endRow - pending.startRow}h)</span>
            </div>

            {/* Employee */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">{t.employee}</label>
              <select className="form-input" value={pendingUid} onChange={e => setPendingUid(e.target.value)}>
                {staffList.map(s => <option key={s.uid} value={s.uid}>{s.name}</option>)}
              </select>
            </div>

            {/* Label */}
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">{lang === "is" ? "Athugasemd (valfrjálst)" : "Note (optional)"}</label>
              <input className="form-input" placeholder={lang === "is" ? "Barþjónn, eldhús..." : "Bar, kitchen..."} value={pendingLabel} onChange={e => setPendingLabel(e.target.value)} />
            </div>

            {/* Type */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {(["single", "recurring"] as const).map(type => (
                <button key={type} onClick={() => setPendingType(type)}
                  style={{ flex: 1, padding: "9px 8px", borderRadius: 8, border: `2px solid ${pendingType === type ? "var(--brand)" : "var(--border)"}`, background: pendingType === type ? "rgba(108,99,255,0.1)" : "transparent", cursor: "pointer", fontSize: "0.78rem", color: pendingType === type ? "var(--brand)" : "var(--text-secondary)", fontWeight: pendingType === type ? 600 : 400, textAlign: "center", transition: "all 0.15s" }}>
                  {type === "single" ? `• ${lang === "is" ? "Stök vakt" : "One-off"}` : `↻ ${lang === "is" ? "Föst vakt" : "Recurring"}`}
                </button>
              ))}
            </div>
            {pendingType === "recurring" && (
              <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: -12, marginBottom: 14, background: "var(--bg-surface)", borderRadius: 6, padding: "6px 10px" }}>
                {lang === "is" ? `Endurtekst á ${t.days[weekDays[pending.dayIndex].getUTCDay()]} hverja viku` : `Repeats every ${t.days[weekDays[pending.dayIndex].getUTCDay()]}`}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn--ghost btn--sm" onClick={cancelPending}>{t.cancel}</button>
              <button className="btn btn--primary" onClick={savePending} disabled={saving || !pendingUid}>
                {saving ? "..." : t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
