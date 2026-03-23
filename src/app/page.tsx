"use client";

import { useState } from "react";

const FEATURES = [
  {
    icon: "⏱",
    title: "Klukka inn og út",
    desc: "Starfsfólk klukkar inn og út með einum smelli — einfalt og öruggt með Google aðgangi.",
  },
  {
    icon: "📊",
    title: "Tímaskráningar",
    desc: "Sjáðu allar tímaskráningar á einum stað. Flokkaðar eftir launatímabili.",
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
    title: "Google innskráning",
    desc: "Öruggt og auðvelt — engin lykilorð að muna. Starfsfólk skráir sig inn með Google.",
  },
];

export default function LandingPage() {
  const [contactSent, setContactSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [sending, setSending] = useState(false);

  const handleContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    // TODO: wire up API route
    await new Promise((r) => setTimeout(r, 1000));
    setContactSent(true);
    setSending(false);
  };

  return (
    <div className="page">
      {/* ── Navbar ── */}
      <nav className="navbar">
        <div className="container navbar__inner">
          <div className="navbar__logo">
            ⏱ Tíma<span>vörður</span>
          </div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <a
              href="#contact"
              className="btn btn--ghost btn--sm"
            >
              Hafa samband
            </a>
            <a href="/superadmin" className="btn btn--secondary btn--sm">
              Admin innskráning
            </a>
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
            <a href="#contact" className="btn btn--primary btn--lg">
              Fá aðgang →
            </a>
            <a href="#features" className="btn btn--secondary btn--lg">
              Sjá meira
            </a>
          </div>
        </div>
      </section>

      {/* ── Demo preview ── */}
      <section style={{ padding: "0 0 100px" }}>
        <div className="container">
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-xl)",
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 80px rgba(108,99,255,0.08)",
            }}
          >
            {/* Window chrome */}
            <div
              style={{
                background: "var(--bg-surface)",
                borderBottom: "1px solid var(--border)",
                padding: "12px 20px",
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
              <span style={{ marginLeft: 12, color: "var(--text-muted)", fontSize: "0.82rem" }}>
                timavordur.is/dillon/staff
              </span>
            </div>

            {/* Demo content */}
            <div
              style={{
                padding: "60px 40px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "32px",
              }}
            >
              <div>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, var(--brand), var(--accent))",
                    margin: "0 auto 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.5rem",
                  }}
                >
                  👤
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>Jón Jónsson · Barþjónn</p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Mánudagur 23. mars · 10:30</p>
              </div>

              <button className="punch-btn">
                <span style={{ fontSize: "1.8rem" }}>→</span>
                <span style={{ fontSize: "1rem" }}>KLUKKA INN</span>
              </button>

              <div
                style={{
                  display: "flex",
                  gap: "40px",
                  color: "var(--text-muted)",
                  fontSize: "0.85rem",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.3rem", color: "var(--accent)", fontWeight: 700 }}>32.5h</div>
                  <div>Þetta tímabil</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.3rem", color: "var(--text-primary)", fontWeight: 700 }}>8h</div>
                  <div>Í dag</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.3rem", color: "var(--brand-light)", fontWeight: 700 }}>4</div>
                  <div>Vaktir</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
            {[
              { step: "01", title: "Þú hefur samband", desc: "Sendu okkur skilaboð — við setjum upp aðgang fyrir þitt fyrirtæki." },
              { step: "02", title: "Starfsfólk fær hlekk", desc: "Þú deylir hlekk eins og timavordur.is/mitt-fyrirtaeki/staff með starfsfólkinu þínu." },
              { step: "03", title: "Klukka inn og út", desc: "Starfsfólk skráir sig inn með Google og klukkar inn/út á hvert skipti." },
              { step: "04", title: "Þú sérð allt", desc: "Í admin-viðmóti sérðu allar tímaskráningar, getur samþykkt leiðréttingar og séð samantekt á launatímabili." },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: "24px",
                  padding: "32px 0",
                  borderBottom: i < 3 ? "1px solid var(--border)" : "none",
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

      {/* ── Contact ── */}
      <section id="contact" style={{ padding: "80px 0", borderTop: "1px solid var(--border)" }}>
        <div className="container--narrow">
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <h2 style={{ fontSize: "2.2rem", marginBottom: "16px" }}>Fá aðgang</h2>
            <p style={{ color: "var(--text-secondary)" }}>
              Sendu okkur skilaboð og við setjum upp aðgang fyrir þitt fyrirtæki
            </p>
          </div>

          {contactSent ? (
            <div className="card card--brand" style={{ textAlign: "center", padding: "48px" }}>
              <div style={{ fontSize: "3rem", marginBottom: "16px" }}>✅</div>
              <h3 style={{ fontSize: "1.3rem", marginBottom: "8px" }}>Skilaboð móttekin!</h3>
              <p style={{ color: "var(--text-secondary)" }}>
                Við höfum samband við þig fljótlega.
              </p>
            </div>
          ) : (
            <form onSubmit={handleContact} className="card" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label className="form-label">Nafn</label>
                  <input
                    className="form-input"
                    placeholder="Jón Jónsson"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Netfang</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="jon@fyrirtaeki.is"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Fyrirtæki</label>
                <input
                  className="form-input"
                  placeholder="Nafn fyrirtækis"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Skilaboð</label>
                <textarea
                  className="form-input"
                  placeholder="Hvað getum við gert fyrir ykkur?"
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  style={{ resize: "vertical" }}
                />
              </div>

              <button type="submit" className="btn btn--primary btn--lg" disabled={sending}>
                {sending ? "Sendi..." : "Senda fyrirspurn →"}
              </button>
            </form>
          )}
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
        </div>
      </footer>
    </div>
  );
}
