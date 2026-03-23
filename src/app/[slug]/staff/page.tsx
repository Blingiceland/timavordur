"use client";

import { useState, useEffect, useCallback } from "react";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { useParams } from "next/navigation";

interface PunchRecord {
  id: string;
  type: "in" | "out";
  timestamp: string;
  displayTime: string;
}

interface StaffStatus {
  isPunchedIn: boolean;
  lastPunch?: PunchRecord;
  todayHours: number;
  periodHours: number;
  shifts: number;
  name: string;
  isRegistered: boolean;
  companyName: string;
}

export default function StaffPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [status, setStatus] = useState<StaffStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [punching, setPunching] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companyExists, setCompanyExists] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Check company exists
  useEffect(() => {
    fetch(`/api/${slug}/company`)
      .then((r) => r.json())
      .then((d) => {
        if (d.name) {
          setCompanyName(d.name);
          setCompanyExists(true);
        } else {
          setCompanyExists(false);
        }
      })
      .catch(() => setCompanyExists(false));
  }, [slug]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Fetch staff status
  const fetchStatus = useCallback(async () => {
    if (!user) return;
    setStatusLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/staff/punch`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setStatus(data);
    } catch {
      console.error("Failed to fetch status");
    } finally {
      setStatusLoading(false);
    }
  }, [user, slug]);

  useEffect(() => {
    if (user) fetchStatus();
  }, [user, fetchStatus]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSignOut = () => signOut(auth);

  const handlePunch = async () => {
    if (!user || !status) return;
    setPunching(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/staff/punch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: user.displayName }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          text: data.type === "in" ? "✅ Klukkaðir inn!" : "👋 Klukkaðir út!",
          type: "success",
        });
        await fetchStatus();
      } else {
        setMessage({ text: data.error || "Villa", type: "error" });
      }
    } catch {
      setMessage({ text: "Netvillla — reyndu aftur", type: "error" });
    } finally {
      setPunching(false);
      setTimeout(() => setMessage(null), 4000);
    }
  };

  // Not found
  if (companyExists === false) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "4rem", marginBottom: "16px" }}>🔍</div>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>Fyrirtæki ekki fundið</h1>
          <p className="text-secondary">Hlekkurinn <strong>/{slug}/staff</strong> er ekki til.</p>
        </div>
      </div>
    );
  }

  // Loading
  if (companyExists === null || authLoading) {
    return (
      <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", color: "var(--text-muted)" }}>Hleður...</div>
      </div>
    );
  }

  const now = new Date();
  const dateStr = now.toLocaleDateString("is-IS", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      {/* Navbar */}
      <nav className="navbar">
        <div className="container navbar__inner">
          <div className="navbar__logo">
            ⏱ Tíma<span>vörður</span>
            {companyName && (
              <span className="text-secondary" style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.9rem", marginLeft: "8px" }}>
                · {companyName}
              </span>
            )}
          </div>
          {user && (
            <button className="btn btn--ghost btn--sm" onClick={handleSignOut}>
              Útskrá
            </button>
          )}
        </div>
      </nav>

      <div
        style={{
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 24px",
          gap: "32px",
        }}
      >
        {/* Not signed in */}
        {!user ? (
          <div className="card" style={{ maxWidth: "400px", width: "100%", padding: "48px", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "16px" }}>⏱</div>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "8px" }}>Innskráning starfsfólks</h2>
            <p className="text-secondary" style={{ fontSize: "0.9rem", marginBottom: "32px" }}>
              Skráðu þig inn með Google til að klukka inn og út
            </p>
            <button
              onClick={handleSignIn}
              className="btn btn--primary"
              style={{ width: "100%", justifyContent: "center", gap: "12px", fontSize: "1rem" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Innskrá með Google
            </button>
          </div>
        ) : (
          <>
            {/* User card */}
            <div style={{ textAlign: "center" }}>
              {user.photoURL && (
                <img
                  src={user.photoURL}
                  alt={user.displayName || ""}
                  style={{ width: 64, height: 64, borderRadius: "50%", marginBottom: "12px", border: "2px solid var(--border)" }}
                />
              )}
              <div style={{ fontWeight: 600, fontSize: "1.1rem" }}>{user.displayName}</div>
              <div className="text-secondary" style={{ fontSize: "0.85rem" }}>{dateStr}</div>
            </div>

            {/* Message */}
            {message && (
              <div
                style={{
                  background: message.type === "success" ? "var(--accent-glow)" : "rgba(255,77,106,0.1)",
                  border: `1px solid ${message.type === "success" ? "rgba(0,212,170,0.3)" : "rgba(255,77,106,0.3)"}`,
                  borderRadius: "var(--radius-md)",
                  padding: "12px 24px",
                  color: message.type === "success" ? "var(--accent)" : "var(--danger)",
                  fontSize: "1rem",
                  fontWeight: 500,
                }}
              >
                {message.text}
              </div>
            )}

            {/* Punch button */}
            {statusLoading ? (
              <div className="text-muted">Hleður stöðu...</div>
            ) : status && !status.isRegistered ? (
              <div className="card" style={{ textAlign: "center", maxWidth: "400px" }}>
                <p className="text-secondary" style={{ marginBottom: "16px" }}>
                  Þú ert ekki skráð/ur hjá <strong>{companyName}</strong>.
                  Hafðu samband við yfirmann til að fá aðgang.
                </p>
              </div>
            ) : (
              <button
                onClick={handlePunch}
                disabled={punching}
                className={`punch-btn ${status?.isPunchedIn ? "punch-btn--out" : ""}`}
              >
                <span style={{ fontSize: "1.8rem" }}>
                  {status?.isPunchedIn ? "⏹" : "▶"}
                </span>
                <span>
                  {punching ? "..." : status?.isPunchedIn ? "KLUKKA ÚT" : "KLUKKA INN"}
                </span>
              </button>
            )}

            {/* Stats */}
            {status && status.isRegistered && (
              <div style={{ display: "flex", gap: "40px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.8rem", color: "var(--accent)", fontWeight: 700 }}>
                    {status.periodHours.toFixed(1)}h
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.82rem" }}>Þetta tímabil</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.8rem", color: "var(--text-primary)", fontWeight: 700 }}>
                    {status.todayHours.toFixed(1)}h
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.82rem" }}>Í dag</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "1.8rem", color: "var(--brand-light)", fontWeight: 700 }}>
                    {status.shifts}
                  </div>
                  <div className="text-muted" style={{ fontSize: "0.82rem" }}>Vaktir</div>
                </div>
              </div>
            )}

            {/* Links */}
            {status?.isRegistered && (
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
                <a href={`/${slug}/staff/timesheets`} className="btn btn--secondary btn--sm">
                  Tímaskráningar
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
