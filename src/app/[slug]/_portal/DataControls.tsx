"use client";
import { useState } from "react";
import type { User } from "firebase/auth";

// Owner-only: download every record, and close the company (deleted after 30 days).
export function DataControls({ user, slug, lang }: { user: User; slug: string; lang: "is" | "en" }) {
  const is = lang !== "en";
  const [busy, setBusy] = useState<"" | "export" | "close">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [showClose, setShowClose] = useState(false);

  const download = async () => {
    setBusy("export"); setMsg(null);
    try {
      const res = await fetch(`/api/${slug}/admin/export`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `timavordur-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg({ ok: true, text: is ? "Skráin var sótt." : "File downloaded." });
    } catch (e) {
      setMsg({ ok: false, text: `${is ? "Ekki tókst að sækja gögnin" : "Download failed"} (${(e as Error).message})` });
    } finally { setBusy(""); }
  };

  const close = async () => {
    setBusy("close"); setMsg(null);
    try {
      const res = await fetch(`/api/${slug}/admin/close`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ confirmSlug }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ ok: false, text: `${is ? "Ekki lokað" : "Not closed"} (${d.error || res.status})` }); return; }
      window.location.reload();
    } finally { setBusy(""); }
  };

  return (
    <div className="card" style={{ padding: "28px", marginBottom: "16px" }}>
      <h3 style={{ marginTop: 0 }}>{is ? "Gögn og lokun" : "Data and closing"}</h3>
      <p className="text-secondary" style={{ fontSize: "0.88rem" }}>
        {is
          ? "Sæktu öll gögn fyrirtækisins í einni skrá (JSON): starfsfólk, stimplanir, vaktir, kjör, launauppgjör og aðgerðaskrá. PIN-númer fylgja ekki."
          : "Download all company data in one file (JSON): staff, punches, shifts, terms, payroll and the audit log. PINs are not included."}
      </p>
      <button className="btn btn--secondary" onClick={download} disabled={busy !== ""}>{busy === "export" ? "..." : (is ? "Sækja öll gögn" : "Download all data")}</button>

      <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 16 }}>
        {!showClose ? (
          <button className="btn btn--ghost btn--sm" style={{ color: "var(--danger)" }} onClick={() => setShowClose(true)}>{is ? "Loka fyrirtækinu og eyða gögnum…" : "Close the company and delete data…"}</button>
        ) : (
          <div>
            <p style={{ fontSize: "0.88rem", color: "var(--danger)" }}>
              {is
                ? "Aðgangi verður lokað strax: enginn getur skráð sig inn eða stimplað. Gögnin eru geymd í 30 daga (svo hægt sé að hætta við) og síðan eytt varanlega. Sæktu gögnin fyrst ef þú þarft á þeim að halda."
                : "Access closes immediately: nobody can sign in or clock in. Data is kept for 30 days (so you can change your mind) and then permanently deleted. Download the data first if you need it."}
            </p>
            <label className="form-group" style={{ margin: "10px 0" }}>
              <span className="form-label">{is ? `Skrifaðu „${slug}“ til að staðfesta` : `Type “${slug}” to confirm`}</span>
              <input className="form-input" value={confirmSlug} onChange={e => setConfirmSlug(e.target.value)} autoCapitalize="none" autoCorrect="off" />
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn--primary" style={{ background: "var(--danger)" }} disabled={confirmSlug !== slug || busy !== ""} onClick={close}>{busy === "close" ? "..." : (is ? "Loka fyrirtækinu" : "Close the company")}</button>
              <button className="btn btn--ghost btn--sm" onClick={() => { setShowClose(false); setConfirmSlug(""); }}>{is ? "Hætta við" : "Cancel"}</button>
            </div>
          </div>
        )}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} style={{ marginTop: 12, fontSize: "0.85rem", color: msg.ok ? "var(--accent)" : "var(--danger)" }}>{msg.text}</p>}
    </div>
  );
}
