"use client";
import { useState } from "react";
import Link from "next/link";

const ERR: Record<string, string> = {
  name_required: "Skrifaðu nafnið þitt",
  invalid_email: "Netfangið er ekki gilt",
  message_required: "Skrifaðu skilaboðin",
  too_many_attempts: "Of margar sendingar — reyndu aftur síðar",
  send_failed: "Ekki tókst að senda — reyndu aftur síðar",
};

export default function Contact() {
  const [f, setF] = useState({ name: "", email: "", company: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setSent(true);
      else setError(ERR[d.error] || d.error || String(res.status));
    } catch { setError("Netvilla — ekkert var sent. Reyndu aftur."); }
    finally { setBusy(false); }
  };
  const field = (k: "name" | "email" | "company", label: string, type = "text", required = true) => (
    <label className="form-group" style={{ margin: 0 }}>
      <span className="form-label">{label}{required ? " *" : ""}</span>
      <input className="form-input" type={type} required={required} value={f[k]} onChange={(e) => setF((v) => ({ ...v, [k]: e.target.value }))} />
    </label>
  );

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <div className="container" style={{ maxWidth: 560, padding: "32px 16px" }}>
        <Link href="/" className="navbar__logo" style={{ textDecoration: "none" }}>⏱ Tíma<span>vörður</span></Link>
        <h1 style={{ fontSize: "1.6rem", margin: "24px 0 6px" }}>Hafa samband</h1>
        <p className="text-secondary" style={{ marginBottom: 20 }}>Spurningar um Tímavörð, skráningu staðar eða persónuvernd. Við svörum á netfangið sem þú gefur upp. <span lang="en">Questions in English are welcome.</span></p>
        {sent ? (
          <div className="card" role="status" style={{ padding: 28, textAlign: "center" }}>
            <div style={{ fontSize: "2.4rem" }}>✉️</div>
            <h2 style={{ fontSize: "1.2rem" }}>Takk — skilaboðin eru send</h2>
            <p className="text-secondary">Við svörum eins fljótt og við getum.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
            {field("name", "Nafn")}
            {field("email", "Netfang", "email")}
            {field("company", "Staður / fyrirtæki", "text", false)}
            <label className="form-group" style={{ margin: 0 }}>
              <span className="form-label">Skilaboð *</span>
              <textarea className="form-input" required rows={6} value={f.message} onChange={(e) => setF((v) => ({ ...v, message: e.target.value }))} />
            </label>
            {/* Honeypot: hidden from people, bots fill it in. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={(e) => setF((v) => ({ ...v, website: e.target.value }))} style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
            {error && <div role="alert" style={{ color: "var(--danger)", fontSize: "0.88rem" }}>{error}</div>}
            <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? "Sendi…" : "Senda"}</button>
            <p className="text-muted" style={{ fontSize: "0.78rem", margin: 0 }}>Við notum nafn þitt og netfang eingöngu til að svara fyrirspurninni. <Link href="/personuvernd">Persónuvernd</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
