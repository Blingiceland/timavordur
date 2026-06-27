// Landing-page product showcase. Pure presentational mockups (no data/auth) built
// with the same design tokens as the real app, so they read like real screenshots.

import type { CSSProperties, ReactNode } from "react";

const PERSON = [
  { name: "Anna", bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6" },
  { name: "Jón", bg: "#d1fae5", border: "#10b981", text: "#065f46" },
  { name: "Klara", bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  { name: "Mihai", bg: "#dbeafe", border: "#3b82f6", text: "#1e40af" },
];

function WindowFrame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.45), 0 0 70px rgba(108,99,255,0.07)", width: "100%" }}>
      <div style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", padding: "10px 16px", display: "flex", gap: 7, alignItems: "center" }}>
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f57" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ffbd2e" }} />
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28c840" }} />
        <span style={{ marginLeft: 10, color: "var(--text-muted)", fontSize: "0.78rem" }}>{url}</span>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  );
}

const pill: CSSProperties = { padding: "1px 7px", borderRadius: 999, fontSize: "0.66rem", fontWeight: 600, whiteSpace: "nowrap" };

// ── Schedule (week grid) ─────────────────────────────────────────────────────
function ScheduleMock() {
  const days = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];
  const shifts: Record<number, { p: number; t: string }[]> = {
    0: [{ p: 0, t: "11–18" }],
    1: [{ p: 1, t: "17–23" }],
    2: [{ p: 0, t: "11–18" }, { p: 2, t: "18–02" }],
    3: [{ p: 3, t: "16–23" }],
    4: [{ p: 1, t: "18–02" }, { p: 2, t: "20–04" }],
    5: [{ p: 0, t: "12–20" }, { p: 3, t: "20–04" }],
    6: [{ p: 2, t: "14–22" }],
  };
  return (
    <WindowFrame url="timon.bling.is/dillon/schedule">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {days.map((d, i) => (
          <div key={d} style={{ textAlign: "center", fontSize: "0.66rem", fontWeight: 700, padding: "5px 0", borderRadius: 6, background: i >= 5 ? "var(--bg-surface)" : "transparent", color: i >= 5 ? "var(--text-secondary)" : "var(--text-primary)" }}>{d}</div>
        ))}
        {days.map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 70 }}>
            {(shifts[i] || []).map((s, j) => {
              const c = PERSON[s.p];
              return (
                <div key={j} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: "4px 5px" }}>
                  <div style={{ fontSize: "0.64rem", fontWeight: 700, color: c.text, lineHeight: 1.1 }}>{c.name}</div>
                  <div style={{ fontSize: "0.6rem", fontFamily: "monospace", color: "var(--text-secondary)" }}>{s.t}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </WindowFrame>
  );
}

// ── Timesheet (rate bands → wage) ────────────────────────────────────────────
function TimesheetMock() {
  const bands = [
    { label: "Dagvinna", hrs: "62h", color: "#6c63ff" },
    { label: "Kvöld +33%", hrs: "28h", color: "#f59e0b" },
    { label: "Helgar +45%", hrs: "19h", color: "#10b981" },
    { label: "Nætur +55%", hrs: "9h", color: "#8b5cf6" },
  ];
  return (
    <WindowFrame url="timon.bling.is/dillon/timesheets">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--brand-glow)", border: "2px solid var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--brand-light)", fontSize: "0.85rem" }}>A</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Anna Sigurðardóttir</div>
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>2.000 kr/klst · 14 vaktir</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, color: "var(--accent)", fontSize: "0.95rem" }}>318.400 kr</div>
          <div style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>Brúttólaun</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {bands.map(b => (
          <span key={b.label} style={{ ...pill, background: `${b.color}18`, color: b.color, border: `1px solid ${b.color}40` }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: b.color, marginRight: 5 }} />
            {b.label} · {b.hrs}
          </span>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, display: "flex", gap: 14, flexWrap: "wrap", fontSize: "0.7rem", color: "var(--text-muted)" }}>
        <span>+ Orlof 10,17%: <strong style={{ color: "#10b981" }}>32.400 kr</strong></span>
        <span>+ Lífeyrir 11,5%</span>
        <span>+ Tryggingagjald 6,35%</span>
        <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--warning)" }}>Heildarkostnaður: 419.900 kr</span>
      </div>
    </WindowFrame>
  );
}

// ── Shift swaps ──────────────────────────────────────────────────────────────
function SwapsMock() {
  return (
    <WindowFrame url="timon.bling.is/dillon">
      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Vaktaskipti</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 11px", background: "var(--bg-surface)", borderRadius: 8 }}>
          <span style={{ fontSize: "0.78rem" }}><strong>Jón</strong> býður: Fös 27. · 11–18</span>
          <span style={{ ...pill, background: "var(--brand)", color: "#fff" }}>Taka</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 11px", background: "var(--bg-surface)", borderRadius: 8 }}>
          <span style={{ fontSize: "0.78rem" }}><strong>Klara</strong> ⇄ <strong>Anna</strong>: Lau 28. ⇄ Sun 29.</span>
          <span style={{ ...pill, background: "rgba(0,212,170,0.12)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.3)" }}>Samþykkja</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 11px", border: "1px dashed var(--brand-dark)", borderRadius: 8 }}>
          <span style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>⏳ Bíður samþykkis yfirmanns</span>
          <div style={{ display: "flex", gap: 5 }}>
            <span style={{ ...pill, background: "rgba(0,212,170,0.12)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.3)" }}>✓</span>
            <span style={{ ...pill, background: "rgba(255,77,106,0.1)", color: "var(--danger)", border: "1px solid rgba(255,77,106,0.3)" }}>✕</span>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

// ── Clock ────────────────────────────────────────────────────────────────────
function ClockMock() {
  return (
    <WindowFrame url="staff.dillon.is">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, padding: "12px 0" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 46, height: 46, borderRadius: "50%", background: "linear-gradient(135deg, var(--brand), var(--accent))", margin: "0 auto 8px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem" }}>👤</div>
          <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Anna · Barþjónn</div>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Föstudagur 27. júní · 17:58</div>
        </div>
        <button className="punch-btn" style={{ pointerEvents: "none", width: 130, height: 130 }}>
          <span style={{ fontSize: "1.5rem" }}>▶</span>
          <span style={{ fontSize: "0.9rem" }}>KLUKKA INN</span>
        </button>
        <div style={{ display: "flex", gap: 28 }}>
          {[["32,5h", "Tímabil", "var(--accent)"], ["8h", "Í dag", "var(--text-primary)"], ["4", "Vaktir", "var(--brand-light)"]].map(([v, l, c]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.1rem", color: c, fontWeight: 700 }}>{v}</div>
              <div style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </WindowFrame>
  );
}

const FEATURES: { tag: string; title: string; desc: string; mock: ReactNode }[] = [
  { tag: "Stimpilklukka", title: "Klukka inn og út á sekúndu", desc: "Starfsfólk skráir sig inn með notendanafni og PIN á sameiginlegu tæki eða eigin síma — engin lykilorð að muna.", mock: <ClockMock /> },
  { tag: "Vaktaplan", title: "Vikuplan sem allir sjá", desc: "Skipuleggðu vaktir á litríku vikuplani. Starfsfólk sér sínar vaktir og allt planið; aðeins stjórnendur breyta.", mock: <ScheduleMock /> },
  { tag: "Tímaskýrslur & laun", title: "Laun reiknuð sjálfkrafa", desc: "Álagsflokkar skv. Efling/SA — dag-, kvöld-, helgar-, nætur- og stórhátíðarálag — ásamt orlofi, lífeyri og tryggingagjaldi.", mock: <TimesheetMock /> },
  { tag: "Vaktaskipti", title: "Starfsfólk skiptist á vöktum", desc: "Bjóddu vakt eða skiptu beint við samstarfsmann. Yfirmaður samþykkir alltaf áður en breytingin tekur gildi.", mock: <SwapsMock /> },
];

export function Showcase() {
  return (
    <section style={{ padding: "40px 0 90px" }}>
      <div className="container" style={{ display: "flex", flexDirection: "column", gap: 64 }}>
        {FEATURES.map((f, i) => (
          <div key={f.tag} style={{ display: "flex", gap: 40, alignItems: "center", flexWrap: "wrap", flexDirection: i % 2 === 1 ? "row-reverse" : "row" }}>
            <div style={{ flex: "1 1 300px", minWidth: 280 }}>
              <div className="badge badge--brand" style={{ marginBottom: 14, fontSize: "0.75rem" }}>{f.tag}</div>
              <h3 style={{ fontSize: "1.6rem", lineHeight: 1.2, marginBottom: 12 }}>{f.title}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "1rem", lineHeight: 1.65, maxWidth: 420 }}>{f.desc}</p>
            </div>
            <div style={{ flex: "1 1 360px", minWidth: 300, maxWidth: 520 }}>{f.mock}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
