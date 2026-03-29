"use client";

import { useState } from "react";
import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useRouter } from "next/navigation";

export default function SuperAdminLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      const res = await fetch("/api/superadmin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        await signOut(auth);
        setError(data.error || "Ekki heimilt");
        return;
      }

      // Store superadmin session in sessionStorage
      sessionStorage.setItem("superadmin", JSON.stringify({
        uid: data.uid,
        email: data.email,
        name: data.name,
        token: idToken,
      }));

      router.push("/superadmin");
    } catch (err) {
      console.error(err);
      setError("Innskráning mistókst");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-base)",
        padding: "24px",
      }}
    >
      <div
        className="card card--brand"
        style={{
          maxWidth: "420px",
          width: "100%",
          textAlign: "center",
          padding: "48px 40px",
        }}
      >
        {/* Logo */}
        <div style={{ fontSize: "2.5rem", marginBottom: "8px" }}>⏱</div>
        <div className="navbar__logo" style={{ justifyContent: "center", marginBottom: "4px", fontSize: "1.4rem" }}>
          Tíma<span>vörður</span>
        </div>
        <div style={{ marginBottom: "32px" }}>
          <span className="badge badge--warning" style={{ fontSize: "0.75rem" }}>
            SUPERADMIN
          </span>
        </div>

        <h1 style={{ fontSize: "1.3rem", marginBottom: "8px", fontWeight: 700 }}>
          Innskráning
        </h1>
        <p className="text-secondary" style={{ fontSize: "0.9rem", marginBottom: "32px" }}>
          Aðeins viðurkenndir superadmins hafa aðgang
        </p>

        {error && (
          <div
            style={{
              background: "rgba(255,77,106,0.1)",
              border: "1px solid rgba(255,77,106,0.3)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              color: "var(--danger)",
              marginBottom: "20px",
              fontSize: "0.9rem",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <button
          className="btn btn--primary"
          style={{ width: "100%", gap: "10px", justifyContent: "center", padding: "14px" }}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? (
            "Skrái inn..."
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Skrá inn með Google
            </>
          )}
        </button>

        <a
          href="/"
          className="text-secondary"
          style={{ display: "block", marginTop: "24px", fontSize: "0.85rem" }}
        >
          ← Til baka á forsíðu
        </a>
      </div>
    </div>
  );
}
