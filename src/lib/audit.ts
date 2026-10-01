// Append-only audit log: tv_companies/{id}/auditLog. There is no API that
// updates or deletes entries, and Firestore rules deny all client access.
// Secrets (PIN hashes, tokens) are stripped before writing.

import { randomUUID } from "crypto";
import { FieldValue, type Transaction, type WriteBatch } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { adminDb } from "./firebase-admin";

export interface AuditEntry {
  companyId: string;
  actorUid: string;
  actorRole: string;
  action: string; // e.g. "staff.set_role", "terms.create", "punch.correction.approve"
  targetType: string;
  targetId: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  requestId: string;
  versions?: Record<string, unknown>;
}

const SECRET_KEY = /pin|password|hash|salt|token|secret/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // pinVersion is a counter, not a secret; everything else PIN-ish is removed.
    if (SECRET_KEY.test(k) && k !== "pinVersion") continue;
    out[k] = redact(v, depth + 1);
  }
  return out;
}

export function requestIdOf(req: NextRequest): string {
  return req.headers.get("x-vercel-id") || req.headers.get("x-request-id") || randomUUID();
}

export const auditCol = (companyId: string) => adminDb.collection("tv_companies").doc(companyId).collection("auditLog");

function payload(e: AuditEntry) {
  return {
    ...e,
    before: e.before === undefined ? null : redact(e.before),
    after: e.after === undefined ? null : redact(e.after),
    reason: e.reason ?? "",
    versions: e.versions ?? {},
    at: FieldValue.serverTimestamp(),
  };
}

/** Add an audit entry inside a transaction/batch, or on its own. */
export function writeAudit(e: AuditEntry, tx?: Transaction | WriteBatch): Promise<unknown> | void {
  const ref = auditCol(e.companyId).doc();
  if (tx) {
    (tx as Transaction).set(ref, payload(e));
    return;
  }
  return ref.set(payload(e));
}
