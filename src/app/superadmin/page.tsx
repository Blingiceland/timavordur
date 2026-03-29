"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { Company } from "@/app/api/companies/route";

interface SuperAdminUser {
  uid: string;
  email: string;
  name: string;
  token: string;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [superAdmin, setSuperAdmin] = useState<SuperAdminUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", slug: "", adminEmail: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [editAdminEmail, setEditAdminEmail] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // Auth guard
  useEffect(() => {
    const stored = sessionStorage.getItem("superadmin");
    if (!stored) {
      router.replace("/superadmin/login");
      return;
    }
    try {
      setSuperAdmin(JSON.parse(stored));
    } catch {
      router.replace("/superadmin/login");
      return;
    }
    setAuthChecked(true);
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    sessionStorage.removeItem("superadmin");
    router.push("/superadmin/login");
  };

  const handleAddAdmin = async (slug: string, email: string) => {
    if (!email || !superAdmin) return;
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch("/api/superadmin/company", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdmin.token}`,
        },
        body: JSON.stringify({ slug, addEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || "Villa"); return; }
      setCompanies((prev) =>
        prev.map((c) =>
          c.slug === slug ? { ...c, adminEmails: data.adminEmails } : c
        )
      );
      setEditCompany((prev) => prev ? { ...prev, adminEmails: data.adminEmails } : null);
      setEditAdminEmail("");
    } catch { setEditError("Netvillla"); }
    finally { setEditSaving(false); }
  };

  const handleRemoveAdmin = async (slug: string, email: string) => {
    if (!superAdmin) return;
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch("/api/superadmin/company", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdmin.token}`,
        },
        body: JSON.stringify({ slug, removEmail: email }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error || "Villa"); return; }
      setCompanies((prev) =>
        prev.map((c) =>
          c.slug === slug ? { ...c, adminEmails: data.adminEmails } : c
        )
      );
      setEditCompany((prev) => prev ? { ...prev, adminEmails: data.adminEmails } : null);
    } catch { setEditError("Netvillla"); }
    finally { setEditSaving(false); }
  };

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/companies");
      const data = await res.json();
      setCompanies(data.companies || []);
    } catch {
      setError("Gat ekki sótt fyrirtæki");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) fetchCompanies();
  }, [authChecked, fetchCompanies]);


  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Villa við að vista");
      } else {
        setCompanies((prev) => [data, ...prev]);
        setNewForm({ name: "", slug: "", adminEmail: "" });
        setShowNew(false);
      }
    } catch {
      setError("Netvillla — reyndu aftur");
    } finally {
      setSaving(false);
    }
  };

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[áàä]/g, "a")
      .replace(/[éèë]/g, "e")
      .replace(/[íìï]/g, "i")
      .replace(/[óòö]/g, "o")
      .replace(/[úùü]/g, "u")
      .replace(/ð/g, "d")
      .replace(/þ/g, "th")
      .replace(/æ/g, "ae")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  // Show nothing while checking auth (avoid flash)
  if (!authChecked) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-base)" }}>
        <p className="text-secondary">Sannreyni aðgang...</p>
      </div>
    );
  }

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      {/* Navbar */}
      <nav className="navbar">
        <div className="container navbar__inner">
          <div className="navbar__logo">
            ⏱ Tíma<span>vörður</span>
            <span className="badge badge--warning" style={{ fontSize: "0.7rem", marginLeft: "8px" }}>
              SUPERADMIN
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              {superAdmin?.name || superAdmin?.email}
            </span>
            <button className="btn btn--ghost btn--sm" onClick={handleLogout}>
              Útskrá
            </button>
          </div>
        </div>
      </nav>


      <div className="container" style={{ padding: "48px 24px" }}>
        {/* Header */}
        <div className="flex justify-between items-center" style={{ marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "1.8rem", marginBottom: "4px" }}>Fyrirtæki</h1>
            <p className="text-secondary" style={{ fontSize: "0.9rem" }}>
              {loading ? "Hleður..." : `${companies.length} skráð fyrirtæki`}
            </p>
          </div>
          <button className="btn btn--primary" onClick={() => setShowNew(!showNew)}>
            + Bæta við fyrirtæki
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: "rgba(255,77,106,0.1)",
              border: "1px solid rgba(255,77,106,0.3)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              color: "var(--danger)",
              marginBottom: "16px",
              fontSize: "0.9rem",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* New company form */}
        {showNew && (
          <div className="card card--brand" style={{ marginBottom: "24px" }}>
            <h3 style={{ fontFamily: "var(--font-body)", fontWeight: 600, marginBottom: "20px", fontSize: "1rem" }}>
              Nýtt fyrirtæki
            </h3>
            <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label className="form-label">Nafn fyrirtækis</label>
                  <input
                    className="form-input"
                    placeholder="Dillon Whiskey Bar"
                    value={newForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setNewForm({ ...newForm, name, slug: slugify(name) });
                    }}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Slug (URL)</label>
                  <div style={{ position: "relative" }}>
                    <span
                      style={{
                        position: "absolute", left: "12px", top: "50%",
                        transform: "translateY(-50%)", color: "var(--text-muted)",
                        fontSize: "0.82rem", pointerEvents: "none",
                      }}
                    >
                      .../
                    </span>
                    <input
                      className="form-input"
                      style={{ paddingLeft: "36px" }}
                      placeholder="dillon"
                      value={newForm.slug}
                      onChange={(e) => setNewForm({ ...newForm, slug: slugify(e.target.value) })}
                      required
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Admin netfang</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="admin@fyrirtaeki.is"
                    value={newForm.adminEmail}
                    onChange={(e) => setNewForm({ ...newForm, adminEmail: e.target.value })}
                    required
                  />
                </div>
              </div>

              {newForm.slug && (
                <div
                  style={{
                    background: "var(--brand-glow)", border: "1px solid var(--brand-dark)",
                    borderRadius: "var(--radius-md)", padding: "12px 16px",
                    fontSize: "0.85rem", color: "var(--text-secondary)",
                  }}
                >
                  🔗 Staff:{" "}
                  <strong className="text-brand">timavordur.is/{newForm.slug}/staff</strong>
                  {"  "}· Admin:{" "}
                  <strong className="text-brand">timavordur.is/{newForm.slug}/admin</strong>
                </div>
              )}

              <div className="flex gap-3">
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? "Vista..." : "Vista fyrirtæki"}
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => setShowNew(false)}>
                  Hætta við
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Companies table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
              Hleður fyrirtækjum...
            </div>
          ) : companies.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
              Engin fyrirtæki skráð ennþá. Bættu við fyrsta fyrirtækinu!
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Fyrirtæki</th>
                  <th>Slug / Hlekkur</th>
                  <th>Admin</th>
                  <th>Starfsfólk</th>
                  <th>Stofnað</th>
                  <th>Staða</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>
                        {c.name}
                      </strong>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span className="text-brand" style={{ fontSize: "0.82rem" }}>/{c.slug}/staff</span>
                        <span className="text-secondary" style={{ fontSize: "0.82rem" }}>/{c.slug}/admin</span>
                      </div>
                    </td>
                    <td style={{ fontSize: "0.85rem" }}>{c.adminEmails?.[0] || "—"}</td>
                    <td>
                      <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {c.staffCount ?? "—"}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.82rem" }}>{c.createdAt}</td>
                    <td>
                      <span className={`badge ${c.active ? "badge--success" : "badge--danger"}`}>
                        {c.active ? "Virkt" : "Óvirkt"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn--secondary btn--sm"
                        onClick={() => { setEditCompany(c); setEditAdminEmail(""); setEditError(""); }}
                      >
                        Breyta
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Edit Company Modal */}
      {editCompany && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: "24px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditCompany(null); }}
        >
          <div className="card" style={{ maxWidth: "500px", width: "100%", padding: "32px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <div>
                <h2 style={{ fontSize: "1.2rem", marginBottom: "2px" }}>{editCompany.name}</h2>
                <span className="text-secondary" style={{ fontSize: "0.82rem" }}>/{editCompany.slug}</span>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => setEditCompany(null)}>✕</button>
            </div>

            {editError && (
              <div style={{ background: "rgba(255,77,106,0.1)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: "var(--radius-md)", padding: "10px 14px", color: "var(--danger)", marginBottom: "16px", fontSize: "0.85rem" }}>
                ⚠️ {editError}
              </div>
            )}

            <div style={{ marginBottom: "20px" }}>
              <label className="form-label" style={{ marginBottom: "10px", display: "block" }}>Admin netföng</label>
              {editCompany.adminEmails?.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                  {editCompany.adminEmails.map((email) => (
                    <div key={email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-surface)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
                      <span style={{ fontSize: "0.88rem" }}>{email}</span>
                      <button
                        className="btn btn--ghost btn--sm"
                        style={{ color: "var(--danger)", fontSize: "0.8rem" }}
                        onClick={() => handleRemoveAdmin(editCompany.slug, email)}
                        disabled={editSaving}
                      >
                        Eyða
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted" style={{ fontSize: "0.85rem", marginBottom: "12px" }}>Enginn admin skráður</p>
              )}

              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  className="form-input"
                  type="email"
                  placeholder="nyradmin@fyrirtaeki.is"
                  value={editAdminEmail}
                  onChange={(e) => setEditAdminEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddAdmin(editCompany.slug, editAdminEmail); } }}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => handleAddAdmin(editCompany.slug, editAdminEmail)}
                  disabled={editSaving || !editAdminEmail}
                >
                  {editSaving ? "..." : "Bæta við"}
                </button>
              </div>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", display: "flex", gap: "8px" }}>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                <div>🔗 Staff: <strong>timavordur.vercel.app/{editCompany.slug}/staff</strong></div>
                <div>🔐 Admin: <strong>timavordur.vercel.app/{editCompany.slug}/admin</strong></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
