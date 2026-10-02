import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_DRAFT_NOTICE } from "@/lib/legal";

export function LegalPage({ title, version, children }: { title: string; version: string; children: ReactNode }) {
  return (
    <div className="page" style={{ minHeight: "100vh" }}>
      <div className="container" style={{ maxWidth: 760, padding: "32px 16px", lineHeight: 1.65 }}>
        <Link href="/" className="navbar__logo" style={{ textDecoration: "none" }}>⏱ Tíma<span>vörður</span></Link>
        <h1 style={{ fontSize: "1.6rem", margin: "24px 0 4px" }}>{title}</h1>
        <p className="text-muted" style={{ fontSize: "0.85rem" }}>Útgáfa {version}</p>
        {LEGAL_DRAFT_NOTICE && <p role="note" style={{ background: "rgba(240,165,0,0.12)", border: "1px solid #f0a500", borderRadius: 8, padding: "10px 14px" }}>{LEGAL_DRAFT_NOTICE}</p>}
        <div className="legal-body">{children}</div>
        <p style={{ marginTop: 32 }}>
          <Link href="/skilmalar">Skilmálar</Link> · <Link href="/vinnslusamningur">Vinnslusamningur</Link> · <Link href="/personuvernd">Persónuvernd</Link> · <Link href="/hafa-samband">Hafa samband</Link>
        </p>
      </div>
    </div>
  );
}

/** Placeholder for a fact that must be filled in before publication. */
export const Fill = ({ children }: { children: ReactNode }) => (
  <mark style={{ background: "rgba(240,165,0,0.25)", color: "inherit", padding: "0 3px" }}>[{children}]</mark>
);
