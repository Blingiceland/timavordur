"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { loginUrlFor } from "@/lib/branded-hosts";
import type { Lang } from "./types";

export type OnboardingState = {
  businessType: boolean; network: boolean; staffJoined: boolean; staffApproved: boolean; terms: boolean; schedule: boolean;
};

/** QR code (SVG) for the staff sign-in address, printable as a poster. */
export function StaffQr({ slug, companyName, lang }: { slug: string; companyName: string; lang: Lang }) {
  const url = loginUrlFor(slug);
  const [svg, setSvg] = useState("");
  useEffect(() => { QRCode.toString(url, { type: "svg", margin: 1, width: 220 }).then(setSvg).catch(() => setSvg("")); }, [url]);
  const print = () => {
    const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(companyName)}</title>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:40px">
<h1 style="margin:0 0 8px">${esc(companyName)}</h1><p style="font-size:20px;margin:0 0 24px">${lang === "is" ? "Starfsfólk: skannaðu til að skrá þig og stimpla" : "Staff: scan to sign up and clock in"}</p>
<div style="width:320px;margin:0 auto">${svg.replace('width="220" height="220"', 'width="320" height="320"')}</div>
<p style="font-size:18px">${esc(url)}</p><script>window.onload=()=>window.print()</script></body>`);
    w.document.close();
  };
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      {svg && <div aria-label={lang === "is" ? "QR-kóði fyrir starfsfólk" : "QR code for staff"} role="img" style={{ background: "#fff", padding: 6, borderRadius: 8, width: 150 }} dangerouslySetInnerHTML={{ __html: svg.replace('width="220" height="220"', 'width="138" height="138"') }} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <code style={{ fontSize: "0.85rem", wordBreak: "break-all" }}>{url}</code>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn--secondary btn--sm" onClick={() => navigator.clipboard.writeText(url)}>{lang === "is" ? "Afrita hlekk" : "Copy link"}</button>
          <button className="btn btn--secondary btn--sm" onClick={print} disabled={!svg}>{lang === "is" ? "Prenta veggspjald" : "Print poster"}</button>
        </div>
      </div>
    </div>
  );
}

/** Owner's first-steps checklist; every tick is derived from real data. */
export function OnboardingCard({ state, slug, companyName, lang, goSettings, goStaff, onDismiss }: {
  state: OnboardingState; slug: string; companyName: string; lang: Lang;
  goSettings: () => void; goStaff: () => void; onDismiss: () => void;
}) {
  const is = lang === "is";
  const steps: { done: boolean; label: string; action?: React.ReactNode }[] = [
    { done: state.businessType, label: is ? "Staðfestu tegund reksturs (krá eða veitingastaður)" : "Confirm your business type", action: <button className="btn btn--secondary btn--sm" onClick={goSettings}>{is ? "Stillingar" : "Settings"}</button> },
    { done: state.network, label: is ? "Leyfðu stimplun aðeins á Wi-Fi staðarins" : "Allow clocking only on your Wi-Fi", action: <button className="btn btn--secondary btn--sm" onClick={goSettings}>{is ? "Stilla" : "Set up"}</button> },
    { done: state.staffJoined, label: is ? "Fáðu starfsfólk til að skrá sig (hlekkur eða QR hér að neðan)" : "Get staff to sign up (link or QR below)" },
    { done: state.staffApproved, label: is ? "Samþykktu starfsfólk — það fær PIN í pósti" : "Approve staff — they get a PIN by e-mail", action: <button className="btn btn--secondary btn--sm" onClick={goStaff}>{is ? "Starfsmenn" : "Staff"}</button> },
    { done: state.terms, label: is ? "Skráðu launakjör (launaflokkur, þrep)" : "Record pay terms", action: <a className="btn btn--secondary btn--sm" href={`/${slug}/rates`}>{is ? "Kjör" : "Terms"}</a> },
    { done: state.schedule, label: is ? "Búðu til fyrsta vaktaplanið" : "Create the first schedule", action: <a className="btn btn--secondary btn--sm" href={`/${slug}/schedule`}>{is ? "Vaktaplan" : "Schedule"}</a> },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="card card--brand" aria-labelledby="ob-title" style={{ marginBottom: 24, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 id="ob-title" style={{ fontSize: "1.05rem", margin: 0 }}>{is ? "Fyrstu skrefin" : "First steps"} <span className="text-muted" style={{ fontWeight: 400, fontSize: "0.85rem" }}>{done}/{steps.length}</span></h2>
        <button className="btn btn--ghost btn--sm" onClick={onDismiss}>{is ? "Fela — ég er búin(n)" : "Hide — I'm done"}</button>
      </div>
      <ol style={{ listStyle: "none", padding: 0, margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span aria-hidden style={{ width: 22, textAlign: "center", color: s.done ? "var(--accent)" : "var(--text-muted)" }}>{s.done ? "✓" : i + 1}</span>
            <span style={{ flex: "1 1 220px", textDecoration: s.done ? "line-through" : "none", color: s.done ? "var(--text-muted)" : "var(--text-primary)" }}>
              <span className="sr-only">{s.done ? (is ? "Lokið: " : "Done: ") : ""}</span>{s.label}
            </span>
            {!s.done && s.action && <span style={{ marginLeft: "auto" }}>{s.action}</span>}
          </li>
        ))}
      </ol>
      <StaffQr slug={slug} companyName={companyName} lang={lang} />
    </section>
  );
}
