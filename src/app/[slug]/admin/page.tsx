"use client";

import { useState, useEffect } from "react";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { useParams } from "next/navigation";

interface StaffMember {
  uid: string;
  name: string;
  email: string;
  isPunchedIn: boolean;
  todayHours: number;
}

interface AdminData {
  companyName: string;
  staffList: StaffMember[];
  isAdmin: boolean;
}

export default function AdminPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/${slug}/admin`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json();
        if (res.ok) setData(d);
        else setError(d.error || "Villa");
      } catch {
        setError("Netvillla");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, slug]);

  if (authLoading) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="text-muted">Hleður...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="card" style={{ maxWidth: "400px", width: "100%", padding: "48px", textAlign: "center" }}>
          <h2 style={{ marginBottom: "8px" }}>Admin innskráning</h2>
          <p className="text-secondary" style={{ marginBottom: "32px", fontSize: "0.9rem" }}>Skráðu þig inn með Google admin netfanginu þínu</p>
          <button
            onClick={() => signInWithPopup(auth, googleProvider)}
            className="btn btn--primary"
            style={{ width: "100%", justifyContent: "center" }}
          >
            Innskrá með Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <nav className="navbar">
        <div className="container navbar__inner">
          <div className="navbar__logo">
            ⏱ Tíma<span>vörður</span>
            {data?.companyName && (
              <span className="text-secondary" style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.9rem", marginLeft: "8px" }}>
                · {data.companyName}
              </span>
            )}
            <span className="badge badge--warning" style={{ fontSize: "0.7rem", marginLeft: "8px" }}>ADMIN</span>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => signOut(auth)}>Útskrá</button>
        </div>
      </nav>

      <div className="container" style={{ padding: "48px 24px" }}>
        {error && (
          <div style={{ background: "rgba(255,77,106,0.1)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: "var(--radius-md)", padding: "16px", color: "var(--danger)", marginBottom: "24px" }}>
            {error === "Forbidden" ? "Þú hefur ekki admin réttindi hjá þessu fyrirtæki." : error}
          </div>
        )}

        {loading && <div className="text-muted">Hleður gögnum...</div>}

        {data && data.isAdmin && (
          <>
            <div style={{ marginBottom: "32px" }}>
              <h1 style={{ fontSize: "1.8rem", marginBottom: "4px" }}>Yfirlit</h1>
              <p className="text-secondary" style={{ fontSize: "0.9rem" }}>{data.staffList.length} starfsmanns skráð</p>
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Nafn</th>
                    <th>Netfang</th>
                    <th>Staða</th>
                    <th>Í dag</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staffList.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)", padding: "32px" }}>
                        Ekkert starfsfólk skráð enn þá
                      </td>
                    </tr>
                  ) : (
                    data.staffList.map((s) => (
                      <tr key={s.uid}>
                        <td style={{ color: "var(--text-primary)", fontWeight: 500 }}>{s.name}</td>
                        <td style={{ fontSize: "0.85rem" }}>{s.email}</td>
                        <td>
                          <span className={`badge ${s.isPunchedIn ? "badge--success" : ""}`} style={!s.isPunchedIn ? { color: "var(--text-muted)" } : {}}>
                            {s.isPunchedIn ? "● Inni" : "○ Úti"}
                          </span>
                        </td>
                        <td>{s.todayHours.toFixed(1)}h</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
