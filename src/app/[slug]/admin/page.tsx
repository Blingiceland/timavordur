"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { auth, googleProvider } from "@/lib/firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";

interface StaffMember {
  uid: string; name: string; email: string;
  status: "pending" | "approved" | "rejected";
  isPunchedIn: boolean; todayHours: number;
  ssn?: string; phone?: string; address?: string;
  bankName?: string; bankAccount?: string;
  union?: string; pension?: string;
  workPermit?: boolean; workPermitExpiry?: string;
  jobTitle?: string; employmentType?: string;
  language?: string; registeredSelf?: boolean;
  addedAt?: string;
}

interface AdminData {
  companyName: string; isAdmin: boolean; staffList: StaffMember[];
}

const EMPTY_STAFF: Partial<StaffMember> = {
  name: "", email: "", ssn: "", phone: "", address: "",
  bankName: "", bankAccount: "", union: "", pension: "",
  jobTitle: "", employmentType: "", workPermitExpiry: "",
};

export default function AdminPage() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"all" | "pending">("all");
  const [editStaff, setEditStaff] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState<Partial<StaffMember>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState<Partial<StaffMember>>(EMPTY_STAFF);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
  }, []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/admin`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (res.ok) setData(d);
      else setError(d.error || "Villa");
    } catch { setError("Netvillla"); }
    finally { setLoading(false); }
  }, [user, slug]);

  useEffect(() => { if (user) fetchData(); }, [user, fetchData]);

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setActionMsg({ text, type });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const doAction = async (uid: string, action: string, updates?: object) => {
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/admin/staff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid, action, updates }),
      });
      const d = await res.json();
      if (res.ok) { showMsg("✅ Vistað!"); await fetchData(); setEditStaff(null); }
      else showMsg(d.error || "Villa", "error");
    } catch { showMsg("Netvillla", "error"); }
    finally { setSaving(false); }
  };

  const doAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/${slug}/admin/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(addForm),
      });
      const d = await res.json();
      if (res.ok) { showMsg("✅ Starfsmaður bætt við!"); setShowAdd(false); setAddForm(EMPTY_STAFF); await fetchData(); }
      else showMsg(d.error || "Villa", "error");
    } catch { showMsg("Netvillla", "error"); }
    finally { setSaving(false); }
  };

  // ── Auth states ────────────────────────────────────────────────────────────

  if (authLoading) return (
    <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="text-muted">Hleður...</div>
    </div>
  );

  if (!user) return (
    <div className="page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div className="card" style={{ maxWidth: "400px", width: "100%", padding: "48px", textAlign: "center" }}>
        <h2 style={{ marginBottom: "8px" }}>Admin innskráning</h2>
        <p className="text-secondary" style={{ marginBottom: "32px", fontSize: "0.9rem" }}>Skráðu þig inn með Google admin netfanginu þínu</p>
        <button onClick={() => signInWithPopup(auth, googleProvider)} className="btn btn--primary" style={{ width: "100%", justifyContent: "center" }}>
          Innskrá með Google
        </button>
      </div>
    </div>
  );

  // ── Main UI ────────────────────────────────────────────────────────────────

  const pendingStaff = data?.staffList.filter(s => s.status === "pending") || [];
  const allStaff = data?.staffList || [];
  const displayList = tab === "pending" ? pendingStaff : allStaff;

  const statusBadge = (s: StaffMember) => {
    if (s.status === "pending") return <span className="badge" style={{ background: "rgba(255,180,0,0.15)", color: "#f0a500", border: "1px solid rgba(255,180,0,0.3)" }}>⏳ Í bið</span>;
    if (s.status === "rejected") return <span className="badge badge--danger">✕ Hafnað</span>;
    return <span className="badge badge--success">✓ Samþykkt</span>;
  };

  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      {/* Navbar */}
      <nav className="navbar">
        <div className="container navbar__inner">
          <div className="navbar__logo">
            ⏱ Tíma<span>vörður</span>
            {data?.companyName && <span className="text-secondary" style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.9rem", marginLeft: "8px" }}>· {data.companyName}</span>}
            <span className="badge badge--warning" style={{ fontSize: "0.7rem", marginLeft: "8px" }}>ADMIN</span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span className="text-secondary" style={{ fontSize: "0.82rem" }}>{user.email}</span>
            <button className="btn btn--ghost btn--sm" onClick={() => signOut(auth)}>Útskrá</button>
          </div>
        </div>
      </nav>

      <div className="container" style={{ padding: "40px 24px" }}>
        {error && (
          <div style={{ background: "rgba(255,77,106,0.1)", border: "1px solid rgba(255,77,106,0.3)", borderRadius: "var(--radius-md)", padding: "16px", color: "var(--danger)", marginBottom: "24px" }}>
            {error === "Forbidden" ? "Þú hefur ekki admin réttindi hjá þessu fyrirtæki." : error}
          </div>
        )}
        {actionMsg && (
          <div style={{ background: actionMsg.type === "success" ? "var(--accent-glow)" : "rgba(255,77,106,0.1)", border: `1px solid ${actionMsg.type === "success" ? "rgba(0,212,170,0.3)" : "rgba(255,77,106,0.3)"}`, borderRadius: "var(--radius-md)", padding: "12px 16px", color: actionMsg.type === "success" ? "var(--accent)" : "var(--danger)", marginBottom: "16px", fontSize: "0.9rem" }}>
            {actionMsg.text}
          </div>
        )}

        {loading && <div className="text-muted">Hleður gögnum...</div>}

        {data && data.isAdmin && (
          <>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ fontSize: "1.8rem", marginBottom: "4px" }}>Starfsmenn</h1>
                <p className="text-secondary" style={{ fontSize: "0.9rem" }}>{allStaff.length} skráð{pendingStaff.length > 0 && <span style={{ color: "#f0a500", marginLeft: "8px" }}>· {pendingStaff.length} í bið</span>}</p>
              </div>
              <button className="btn btn--primary" onClick={() => { setShowAdd(true); setAddForm(EMPTY_STAFF); }}>
                + Bæta við starfsmanni
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "20px", background: "var(--bg-surface)", padding: "4px", borderRadius: "var(--radius-md)", width: "fit-content" }}>
              {([["all", "Allir", allStaff.length], ["pending", "Í bið", pendingStaff.length]] as const).map(([key, label, count]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`btn btn--sm ${tab === key ? "btn--primary" : "btn--ghost"}`}
                  style={{ position: "relative" }}>
                  {label}
                  {count > 0 && <span style={{ marginLeft: "6px", background: tab === key ? "rgba(255,255,255,0.2)" : "var(--border)", borderRadius: "20px", padding: "1px 7px", fontSize: "0.75rem" }}>{count}</span>}
                </button>
              ))}
            </div>

            {/* Staff table */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Nafn</th>
                    <th>Netfang</th>
                    <th>Staða klukku</th>
                    <th>Í dag</th>
                    <th>Staða</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayList.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--text-muted)", padding: "32px" }}>
                      {tab === "pending" ? "Engir starfsmenn í bið" : "Ekkert starfsfólk skráð enn þá"}
                    </td></tr>
                  ) : displayList.map(s => (
                    <tr key={s.uid}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{s.name}</div>
                        {s.jobTitle && <div className="text-muted" style={{ fontSize: "0.78rem" }}>{s.jobTitle}</div>}
                      </td>
                      <td style={{ fontSize: "0.85rem" }}>{s.email}</td>
                      <td>
                        {s.status === "approved" ? (
                          <span className={`badge ${s.isPunchedIn ? "badge--success" : ""}`} style={!s.isPunchedIn ? { color: "var(--text-muted)" } : {}}>
                            {s.isPunchedIn ? "● Inni" : "○ Úti"}
                          </span>
                        ) : <span className="text-muted" style={{ fontSize: "0.82rem" }}>—</span>}
                      </td>
                      <td>{s.status === "approved" ? `${s.todayHours.toFixed(1)}h` : "—"}</td>
                      <td>{statusBadge(s)}</td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {s.status === "pending" && <>
                            <button className="btn btn--sm" style={{ background: "rgba(0,212,170,0.1)", color: "var(--accent)", border: "1px solid rgba(0,212,170,0.3)" }}
                              onClick={() => doAction(s.uid, "approve")} disabled={saving}>✓ Samþykkja</button>
                            <button className="btn btn--sm" style={{ background: "rgba(255,77,106,0.1)", color: "var(--danger)", border: "1px solid rgba(255,77,106,0.3)" }}
                              onClick={() => doAction(s.uid, "reject")} disabled={saving}>✕ Hafna</button>
                          </>}
                          <button className="btn btn--secondary btn--sm" onClick={() => { setEditStaff(s); setEditForm({ ...s }); }}>Breyta</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Edit Staff Modal */}
      {editStaff && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "24px" }}
          onClick={e => { if (e.target === e.currentTarget) setEditStaff(null); }}>
          <div className="card" style={{ maxWidth: "560px", width: "100%", padding: "32px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "1.2rem" }}>Breyta starfsmanni</h2>
              <button className="btn btn--ghost btn--sm" onClick={() => setEditStaff(null)}>✕</button>
            </div>
            <StaffForm form={editForm as StaffMember} onChange={setEditForm}
              onSubmit={() => doAction(editStaff.uid, "update", editForm)}
              onDelete={() => { if (confirm(`Eyða ${editStaff.name}?`)) doAction(editStaff.uid, "delete"); }}
              saving={saving} isEdit />
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "24px" }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div className="card" style={{ maxWidth: "560px", width: "100%", padding: "32px", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "1.2rem" }}>Bæta við starfsmanni</h2>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <form onSubmit={doAdd}>
              <StaffForm form={addForm as StaffMember} onChange={setAddForm} saving={saving} showEmail />
              <button type="submit" className="btn btn--primary" disabled={saving} style={{ width: "100%", justifyContent: "center", marginTop: "16px" }}>
                {saving ? "Vista..." : "Bæta við"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared form component ──────────────────────────────────────────────────

function StaffForm({ form, onChange, onSubmit, onDelete, saving, isEdit, showEmail }: {
  form: Partial<StaffMember>;
  onChange: (v: Partial<StaffMember>) => void;
  onSubmit?: () => void;
  onDelete?: () => void;
  saving?: boolean;
  isEdit?: boolean;
  showEmail?: boolean;
}) {
  const f = (key: keyof StaffMember) => String(form[key] || "");
  const set = (key: keyof StaffMember, val: string) => onChange({ ...form, [key]: val });

  const fields: [keyof StaffMember, string, string, string?][] = [
    ["name", "Fullt nafn", "Jón Jónsson"],
    ...(showEmail ? [["email", "Netfang", "jon@dillon.is"] as [keyof StaffMember, string, string]] : []),
    ["ssn", "Kennitala", "1234567890"],
    ["phone", "Símanúmer", "8001234"],
    ["address", "Heimilisfang", "Laugavegur 1, 101 Reykjavík"],
    ["bankName", "Banki", "Íslandsbanki"],
    ["bankAccount", "Reikningsnúmer", "0111-26-123456"],
    ["union", "Stéttarfélag", "VR"],
    ["pension", "Lífeyrissjóður", "Gildi lífeyrissjóður"],
    ["jobTitle", "Starfsheiti", "Barþjónn"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {fields.map(([key, label, ph]) => (
        <div key={key} className="form-group">
          <label className="form-label">{label}</label>
          <input className="form-input" placeholder={ph} value={f(key)} onChange={e => set(key, e.target.value)} />
        </div>
      ))}

      {/* Employment type */}
      <div className="form-group">
        <label className="form-label">Ráðningarstig</label>
        <select className="form-input" value={f("employmentType")} onChange={e => set("employmentType", e.target.value)}>
          <option value="">Veldu...</option>
          <option value="full-time">Fullt starf</option>
          <option value="part-time">Hlutastarfa</option>
        </select>
      </div>

      {/* Work permit */}
      <div className="form-group">
        <label className="form-label">Vinnuleyfi</label>
        <div style={{ display: "flex", gap: "12px" }}>
          {[["true", "Já"], ["false", "Nei"], ["", "Á ekki við"]].map(([val, label]) => (
            <label key={val} style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "8px 14px", borderRadius: "var(--radius-md)", border: `1px solid ${String(form.workPermit) === val || (val === "" && form.workPermit == null) ? "var(--brand)" : "var(--border)"}`, background: String(form.workPermit) === val ? "var(--brand-glow)" : "transparent", transition: "all 0.15s", fontSize: "0.88rem" }}>
              <input type="radio" name="workPermitEdit" value={val} checked={val === "" ? form.workPermit == null : String(form.workPermit) === val}
                onChange={() => onChange({ ...form, workPermit: val === "" ? undefined : val === "true" })} style={{ display: "none" }} />
              {label}
            </label>
          ))}
        </div>
      </div>

      {form.workPermit === true && (
        <div className="form-group">
          <label className="form-label">Vinnuleyfi gildir til</label>
          <input type="date" className="form-input" value={f("workPermitExpiry")} onChange={e => set("workPermitExpiry", e.target.value)} />
        </div>
      )}

      {isEdit && (
        <div style={{ display: "flex", gap: "8px", paddingTop: "8px", borderTop: "1px solid var(--border)" }}>
          <button type="button" className="btn btn--primary" onClick={onSubmit} disabled={saving} style={{ flex: 1, justifyContent: "center" }}>
            {saving ? "Vista..." : "Vista breytingar"}
          </button>
          <button type="button" className="btn btn--sm" onClick={onDelete} disabled={saving}
            style={{ background: "rgba(255,77,106,0.1)", color: "var(--danger)", border: "1px solid rgba(255,77,106,0.3)" }}>
            Eyða
          </button>
        </div>
      )}
    </div>
  );
}
