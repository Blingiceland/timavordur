"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ISSUE_TEXT, type Issue, type IssueCode } from "@/lib/payroll/issues";
import { formatKr } from "@/lib/payroll/money";

type Lang = "is" | "en";
interface PeriodData {
  key: string; status: "draft" | "reviewed" | "locked"; fromSnapshot: boolean; periodEnded: boolean; lockedAt: string | null;
  employees: { uid: string; name: string; status: string; hours: number; grossCents: number; costCents: number | null; issues: Issue[]; rateVersions: string[] }[];
  blockers: { uid: string; name: string; code: IssueCode; date: string | null }[];
  totalGrossCents: number;
}
interface Preview {
  period: { key: string; startDate: string; endDateInclusive: string };
  employees: { uid: string; name: string; plannedShifts: number; hours: number; grossCents: number | null; costCents: number | null; costRateStatus: string | null; draftRates: boolean; issues: IssueCode[] }[];
  totalGrossCents: number; totalCostCents: number; incomplete: boolean; usesDraftRates: boolean;
}
interface Adjustment { id: string; uid: string; originalPeriodKey: string; targetPeriodKey: string; amountCents: number; description: string; status: string; createdBy: string }

const kr = (c: number | null) => (c === null ? "—" : `${formatKr(c)} kr`);
function shiftKey(key: string, d: number) {
  const [y, m] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}
function currentKey() {
  const n = new Date(); let y = n.getUTCFullYear(); let m = n.getUTCMonth();
  if (n.getUTCDate() < 25) { m -= 1; if (m < 0) { m = 11; y -= 1; } }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

export default function PayrollPage() {
  return <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>…</div>}><PayrollInner /></Suspense>;
}

function PayrollInner() {
  const { slug } = useParams() as { slug: string };
  const search = useSearchParams();
  const [lang, setLang] = useState<Lang>("is");
  const is = lang === "is";
  const [user, setUser] = useState<User | null>(null);
  const [key, setKey] = useState(() => shiftKey(currentKey(), -1));
  const [data, setData] = useState<PeriodData | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [previewKey, setPreviewKey] = useState(search.get("preview") || "2027-01");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [adjs, setAdjs] = useState<Adjustment[]>([]);
  const [adjForm, setAdjForm] = useState({ uid: "", originalPeriodKey: "", targetPeriodKey: "", amountKr: "", description: "" });

  useEffect(() => { try { const l = localStorage.getItem(`tv_lang_${slug}`); if (l === "en" || l === "is") setLang(l); } catch { /* ignore */ } }, [slug]);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const tok = await user!.getIdToken();
    const res = await fetch(`/api/${slug}${path}`, { ...init, headers: { ...(init?.headers || {}), Authorization: `Bearer ${tok}`, "Content-Type": "application/json" } });
    const d = await res.json().catch(() => ({}));
    return { res, d };
  }, [user, slug]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [p, a] = await Promise.all([api(`/payroll?period=${key}`), api(`/payroll/adjustments`)]);
      if (p.res.ok) setData(p.d); else { setData(null); setMsg({ ok: false, text: `${p.res.status}: ${p.d.error}` }); }
      if (a.res.ok) setAdjs(a.d.adjustments);
    } catch { setMsg({ ok: false, text: is ? "Netvilla" : "Network error" }); } finally { setLoading(false); }
  }, [user, api, key, is]);
  useEffect(() => { load(); }, [load]);

  const loadPreview = useCallback(async () => {
    if (!user) return;
    const p = await api(`/payroll/preview?period=${previewKey}`);
    if (p.res.ok) setPreview(p.d); else setPreview(null);
  }, [user, api, previewKey]);
  useEffect(() => { loadPreview(); }, [loadPreview]);

  const act = async (action: "review" | "unreview" | "lock") => {
    if (action === "lock" && !confirm(is ? `Læsa uppgjöri ${key}? Læst uppgjör breytist ekki; síðari leiðréttingar verða sérfærslur.` : `Lock payroll ${key}? A locked payroll never changes; later corrections become separate entries.`)) return;
    setMsg(null);
    const { res, d } = await api("/payroll", { method: "POST", body: JSON.stringify({ period: key, action }) });
    if (res.ok) { setMsg({ ok: true, text: is ? "✅ Staða uppfærð" : "✅ Status updated" }); await load(); }
    else setMsg({ ok: false, text: `${res.status}: ${d.error}${d.blockers ? ` (${d.blockers.length})` : ""}` });
  };

  const download = async (draft: boolean) => {
    const tok = await user!.getIdToken();
    const res = await fetch(`/api/${slug}/payroll/export?period=${key}${draft ? "&draft=1" : ""}`, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg({ ok: false, text: `${res.status}: ${d.error}` }); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `timavordur_${slug}_${key}${draft ? "_DROG" : ""}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const createAdj = async () => {
    const { res, d } = await api("/payroll/adjustments", { method: "POST", body: JSON.stringify({ ...adjForm, amountKr: Number(adjForm.amountKr) }) });
    if (res.ok) { setAdjForm({ uid: "", originalPeriodKey: "", targetPeriodKey: "", amountKr: "", description: "" }); setMsg({ ok: true, text: is ? "✅ Leiðrétting skráð — bíður samþykkis annars aðila" : "✅ Adjustment recorded — awaits approval" }); load(); }
    else setMsg({ ok: false, text: `${res.status}: ${d.error}` });
  };
  const resolveAdj = async (id: string, action: "approve" | "reject") => {
    const { res, d } = await api("/payroll/adjustments", { method: "PATCH", body: JSON.stringify({ id, action }) });
    if (res.ok) load(); else setMsg({ ok: false, text: `${res.status}: ${d.error}` });
  };

  if (!user) return <div style={{ padding: 40, textAlign: "center" }}>{is ? "Hleður..." : "Loading..."}</div>;
  const statusLabel = { draft: is ? "Drög" : "Draft", reviewed: is ? "Yfirfarið" : "Reviewed", locked: is ? "Læst" : "Locked" };

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 0", background: "var(--bg-surface)" }}>
        <div className="container" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Link href={`/${slug}`} style={{ color: "var(--text-muted)", fontSize: "0.88rem", textDecoration: "none" }}>{is ? "← Til baka" : "← Back"}</Link>
          <h1 style={{ fontSize: "1.3rem", margin: 0 }}>{is ? "Launavinnsla" : "Payroll"}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <button className="btn btn--ghost btn--sm" aria-label={is ? "Fyrra tímabil" : "Previous"} onClick={() => setKey(k => shiftKey(k, -1))}>‹</button>
            <span aria-live="polite">{key} <span className="text-muted" style={{ fontSize: "0.8rem" }}>(25.–24.)</span></span>
            <button className="btn btn--ghost btn--sm" aria-label={is ? "Næsta tímabil" : "Next"} onClick={() => setKey(k => shiftKey(k, 1))}>›</button>
          </div>
        </div>
      </div>

      <div className="container" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
        {msg && <div role={msg.ok ? "status" : "alert"} style={{ color: msg.ok ? "var(--accent)" : "var(--danger)" }}>{msg.text}</div>}
        {loading && <div role="status" className="text-muted">{is ? "Hleður..." : "Loading..."}</div>}

        {data && (
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span className="badge" style={{ color: data.status === "locked" ? "var(--accent)" : "#f0a500" }}>{statusLabel[data.status]}</span>
              {data.lockedAt && <span className="text-muted" style={{ fontSize: "0.85rem" }}>{data.lockedAt}</span>}
              <span style={{ marginLeft: "auto", fontWeight: 600 }}>{is ? "Laun samtals" : "Total pay"}: {kr(data.totalGrossCents)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
              {data.status === "draft" && <button className="btn btn--secondary btn--sm" onClick={() => act("review")}>{is ? "Merkja yfirfarið" : "Mark reviewed"}</button>}
              {data.status === "reviewed" && <button className="btn btn--ghost btn--sm" onClick={() => act("unreview")}>{is ? "Aftur í drög" : "Back to draft"}</button>}
              {data.status === "reviewed" && <button className="btn btn--primary btn--sm" disabled={!data.periodEnded || data.blockers.length > 0} onClick={() => act("lock")}>{is ? "Læsa uppgjöri" : "Lock payroll"}</button>}
              {data.status === "locked"
                ? <button className="btn btn--primary btn--sm" onClick={() => download(false)}>{is ? "Sækja CSV (læst)" : "Download CSV (locked)"}</button>
                : <button className="btn btn--ghost btn--sm" onClick={() => download(true)}>{is ? "Sækja drög (CSV, ekki uppgjör)" : "Download draft (CSV, not payroll)"}</button>}
            </div>
            {!data.periodEnded && data.status !== "locked" && <p className="text-muted" style={{ fontSize: "0.82rem" }}>{is ? "Tímabilinu er ekki lokið — ekki hægt að læsa." : "The period has not ended — cannot lock yet."}</p>}
            {data.blockers.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong style={{ color: "var(--danger)" }}>{is ? "Hindranir fyrir lokun" : "Blocking issues"} ({data.blockers.length})</strong>
                <ul style={{ fontSize: "0.85rem" }}>{data.blockers.slice(0, 50).map((b, i) => <li key={i}>{b.name}: {ISSUE_TEXT[b.code]?.[lang] ?? b.code}{b.date ? ` (${b.date})` : ""}</li>)}</ul>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ fontSize: "0.85rem" }}>
                <thead><tr><th>{is ? "Nafn" : "Name"}</th><th>{is ? "Staða" : "Status"}</th><th>{is ? "Klst" : "Hours"}</th><th>{is ? "Laun" : "Pay"}</th><th>{is ? "Kostnaður" : "Cost"}</th><th>{is ? "Taxtar" : "Rates"}</th></tr></thead>
                <tbody>{data.employees.map(e => (
                  <tr key={e.uid}><td><Link href={`/${slug}/timesheets`}>{e.name}</Link></td><td>{e.status}</td><td>{e.hours.toFixed(2)}</td><td>{kr(e.grossCents)}</td><td>{kr(e.costCents)}</td><td>{e.rateVersions.join(", ")}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* Adjustments after lock */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>{is ? "Leiðréttingar eftir lokun" : "Post-lock adjustments"}</h2>
          <p className="text-secondary" style={{ fontSize: "0.85rem" }}>{is ? "Læst uppgjör breytist aldrei. Leiðrétting er sér færsla sem bókast á síðara, opið tímabil og þarf samþykki annars stjórnanda (eða eiganda)." : "A locked payroll never changes. An adjustment is a separate entry booked into a later open period and needs a second approver (or the owner)."}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            <select className="form-input" aria-label={is ? "Starfsmaður" : "Employee"} value={adjForm.uid} onChange={e => setAdjForm(f => ({ ...f, uid: e.target.value }))}>
              <option value="">{is ? "Starfsmaður…" : "Employee…"}</option>
              {(data?.employees || []).map(e => <option key={e.uid} value={e.uid}>{e.name}</option>)}
            </select>
            <input className="form-input" placeholder={is ? "Upphafl. tímabil YYYY-MM" : "Original period YYYY-MM"} value={adjForm.originalPeriodKey} onChange={e => setAdjForm(f => ({ ...f, originalPeriodKey: e.target.value }))} />
            <input className="form-input" placeholder={is ? "Bókast á YYYY-MM" : "Book into YYYY-MM"} value={adjForm.targetPeriodKey} onChange={e => setAdjForm(f => ({ ...f, targetPeriodKey: e.target.value }))} />
            <input className="form-input" type="number" step="0.01" placeholder={is ? "Fjárhæð kr (±)" : "Amount ISK (±)"} value={adjForm.amountKr} onChange={e => setAdjForm(f => ({ ...f, amountKr: e.target.value }))} />
            <input className="form-input" placeholder={is ? "Lýsing" : "Description"} value={adjForm.description} onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))} />
            <button className="btn btn--secondary btn--sm" onClick={createAdj}>{is ? "Skrá" : "Record"}</button>
          </div>
          {adjs.length > 0 && <ul style={{ fontSize: "0.85rem", marginTop: 12 }}>{adjs.map(a => (
            <li key={a.id}>{a.originalPeriodKey} → {a.targetPeriodKey}: {kr(a.amountCents)} · {a.description} · <b>{a.status}</b>
              {a.status === "pending" && <> <button className="btn btn--ghost btn--sm" onClick={() => resolveAdj(a.id, "approve")}>{is ? "Samþykkja" : "Approve"}</button><button className="btn btn--ghost btn--sm" onClick={() => resolveAdj(a.id, "reject")}>{is ? "Hafna" : "Reject"}</button></>}
            </li>))}</ul>}
        </div>

        {/* Schedule-based estimate */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ fontSize: "1.05rem", margin: 0 }}>{is ? "Áætlaður kostnaður úr vaktaplani" : "Estimated cost from the schedule"}</h2>
            <input className="form-input" style={{ width: 120 }} aria-label={is ? "Tímabil" : "Period"} value={previewKey} onChange={e => /^\d{4}-\d{2}$/.test(e.target.value) ? setPreviewKey(e.target.value) : setPreviewKey(e.target.value)} />
            <button className="btn btn--ghost btn--sm" onClick={() => setPreviewKey(k => shiftKey(k, -1))}>‹</button>
            <button className="btn btn--ghost btn--sm" onClick={() => setPreviewKey(k => shiftKey(k, 1))}>›</button>
          </div>
          <p style={{ fontSize: "0.85rem", color: "#f0a500" }}>{is ? "Áætlun byggð á skipulögðum vöktum — ekki raunlaun og ekki uppgjör. Engar launafærslur eru búnar til." : "Estimate from planned shifts — not actual pay and not payroll. No payroll records are created."}</p>
          {preview && (
            <>
              <p style={{ fontSize: "0.85rem" }}>{preview.period.startDate} – {preview.period.endDateInclusive}{preview.usesDraftRates && <b style={{ color: "#f0a500" }}> · {is ? "notar óstaðfest drög að taxta (óvissa)" : "uses unverified draft rates (uncertain)"}</b>}{preview.incomplete && <b style={{ color: "var(--danger)" }}> · {is ? "kjör vantar hjá sumum — heild er of lág" : "terms missing for some — total is understated"}</b>}</p>
              <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ fontSize: "0.85rem" }}>
                  <thead><tr><th>{is ? "Nafn" : "Name"}</th><th>{is ? "Vaktir" : "Shifts"}</th><th>{is ? "Klst" : "Hours"}</th><th>{is ? "Laun (áætl.)" : "Pay (est.)"}</th><th>{is ? "Kostnaður (áætl.)" : "Cost (est.)"}</th><th>{is ? "Athugasemdir" : "Notes"}</th></tr></thead>
                  <tbody>{preview.employees.map(e => (
                    <tr key={e.uid}><td>{e.name}</td><td>{e.plannedShifts}</td><td>{e.hours.toFixed(1)}</td><td>{kr(e.grossCents)}</td><td>{kr(e.costCents)}</td>
                      <td style={{ fontSize: "0.78rem" }}>{e.issues.map(c => ISSUE_TEXT[c]?.[lang] ?? c).join("; ")}</td></tr>
                  ))}</tbody>
                  <tfoot><tr><th colSpan={3}>{is ? "Samtals" : "Total"}</th><th>{kr(preview.totalGrossCents)}</th><th>{kr(preview.totalCostCents)}</th><th /></tr></tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
