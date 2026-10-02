import Link from "next/link";
import { Showcase } from "./_home/Showcase";

const FEATURES = [
  {
    icon: "⏱",
    title: "Klukka inn og út",
    desc: "Starfsfólk stimplar sig inn og út með notendanafni og PIN — aðeins á Wi-Fi staðarins ef þú vilt.",
  },
  {
    icon: "📊",
    title: "Laun eftir kjarasamningi",
    desc: "Álag, helgi- og stórhátíðardagar og yfirvinna reiknuð eftir kjarasamningi SA og Eflingar — læst uppgjör og CSV fyrir bókarann.",
  },
  {
    icon: "🗓",
    title: "Vaktaplan",
    desc: "Skipuleggðu vaktir og sjáðu hverjir eru á vakt hvenær.",
  },
  {
    icon: "✏️",
    title: "Leiðréttingar",
    desc: "Starfsfólk getur sent leiðréttingarbeiðnir — þú samþykkir eða hafnar.",
  },
  {
    icon: "🔗",
    title: "Einkvæmur hlekkur",
    desc: "Hvert fyrirtæki fær sinn hlekk. Starfsfólk þarf ekkert að setja upp.",
  },
  {
    icon: "🔒",
    title: "Öruggt",
    desc: "Hvert fyrirtæki er aðskilið, PIN berst í pósti við samþykki og allar breytingar eru skráðar.",
  },
];

const STEPS = [
  { step: "01", title: "Skráðu staðinn", desc: "Skráðu þig inn með Google, sláðu inn nafn og kennitölu — staðurinn er tilbúinn á tveimur mínútum." },
  { step: "02", title: "Stilltu Wi-Fi", desc: "Einn smellur: stimplun leyfð aðeins á neti staðarins." },
  { step: "03", title: "Hengdu upp QR-kóða", desc: "Starfsfólk skannar, skráir sig og fær PIN í pósti þegar þú samþykkir." },
  { step: "04", title: "Þú sérð allt", desc: "Vaktaplan, tímaskýrslur, leiðréttingar og launauppgjör tilbúið fyrir bókarann." },
];

export default function LandingPage() {
  return (
    <div className="page">
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="container navbar__inner">
          <div className="navbar__logo">
            ⏱ Tíma<span>vörður</span>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <Link href="/byrja" className="btn btn--primary btn--sm">
              Byrja frítt
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section
        style={{
          padding: "120px 0 100px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: "20%",
            left: "50%",
            transform: "translateX(-50%)",
            width: "600px",
            height: "400px",
            background: "radial-gradient(ellipse, rgba(108,99,255,0.12) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />

        <div className="container--narrow" style={{ position: "relative" }}>
          <div className="badge badge--brand" style={{ marginBottom: "24px", fontSize: "0.82rem" }}>
            🇮🇸 Íslenskt tímaskráningarkerfi
          </div>

          <h1
            style={{
              fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
              fontWeight: 800,
              lineHeight: 1.1,
              marginBottom: "24px",
              background: "linear-gradient(135deg, #f0f0ff 0%, #8b84ff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Tímaskráning sem<br />virkar bara
          </h1>

          <p
            style={{
              fontSize: "1.2rem",
              color: "var(--text-secondary)",
              maxWidth: "520px",
              margin: "0 auto 40px",
              lineHeight: 1.7,
            }}
          >
            Einfalt tímaskráningarkerfi fyrir íslensk fyrirtæki.
            Starfsfólk klukkar inn og út — þú sérð allt í stigi.
          </p>

          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/byrja" className="btn btn--primary btn--lg">
              Byrja frítt →
            </Link>
            <a href="#features" className="btn btn--secondary btn--lg">
              Sjá meira
            </a>
          </div>
        </div>
      </section>

      {/* ── Showcase ── */}
      <Showcase />

      {/* ── Features ── */}
      <section id="features" style={{ padding: "80px 0" }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: "60px" }}>
            <h2 style={{ fontSize: "2.2rem", marginBottom: "16px" }}>Allt sem þú þarft</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "1.05rem" }}>
              Engin óþarfi flækjur — bara það sem skiptir máli
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "20px",
            }}
          >
            {FEATURES.map((f, i) => (
              <div key={i} className="card" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ fontSize: "2rem" }}>{f.icon}</div>
                <h3 style={{ fontSize: "1.1rem", fontFamily: "var(--font-body)", fontWeight: 600 }}>
                  {f.title}
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ padding: "80px 0", borderTop: "1px solid var(--border)" }}>
        <div className="container--narrow">
          <div style={{ textAlign: "center", marginBottom: "60px" }}>
            <h2 style={{ fontSize: "2.2rem", marginBottom: "16px" }}>Hvernig virkar þetta?</h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {STEPS.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "24px",
                  padding: "32px 0",
                  borderBottom: i < STEPS.length - 1 ? "1px solid var(--border)" : "none",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "2.5rem",
                    fontWeight: 800,
                    color: "var(--brand-dark)",
                    minWidth: "60px",
                    opacity: 0.6,
                  }}
                >
                  {item.step}
                </div>
                <div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "8px" }}>
                    {item.title}
                  </h3>
                  <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "32px 0",
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: "0.85rem",
        }}
      >
        <div className="container">
          <span>© 2026 Tímavörður · Þróað á Íslandi 🇮🇸</span>
          <div style={{ marginTop: 8, display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/skilmalar">Skilmálar</Link>
            <Link href="/vinnslusamningur">Vinnslusamningur</Link>
            <Link href="/personuvernd">Persónuvernd</Link>
            <Link href="/hafa-samband">Hafa samband</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
