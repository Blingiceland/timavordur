// Export and permanent deletion of one company's data (data-processing
// agreement: the controller can take all data out, and it is deleted on request).

import { Timestamp, type DocumentData, type Query } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { normaliseKennitala } from "../onboarding";
import { groupRef, groupUsernameRef, pinAccountRef } from "./group";
import { companyRef } from "./refs";

/** Every per-company collection with business data. Idempotency/punch-state helpers are derived and left out. */
export const EXPORT_COLLECTIONS = [
  "staff", "punchRecords", "shifts", "shiftTemplates", "swapRequests", "punchCorrections",
  "employmentTerms", "payrollPeriods", "payrollAdjustments", "auditLog",
] as const;

const SECRET_FIELDS = new Set(["passwordHash", "passwordSalt"]);
const PAGE = 500;

/** Firestore values → plain JSON (timestamps as ISO strings, secrets dropped). */
export function plain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === "object") {
    const ref = v as { path?: unknown; firestore?: unknown };
    if (typeof ref.path === "string" && ref.firestore) return ref.path; // DocumentReference
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!SECRET_FIELDS.has(k)) out[k] = plain(x);
    return out;
  }
  return v;
}

async function* pages(q: Query): AsyncGenerator<{ id: string; data: DocumentData }[]> {
  let last: string | null = null;
  for (;;) {
    let page = q.orderBy("__name__").limit(PAGE);
    if (last) page = page.startAfter(last);
    const snap = await page.get();
    if (snap.empty) return;
    yield snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    if (snap.size < PAGE) return;
    last = snap.docs[snap.size - 1].id;
  }
}

/**
 * The whole company as one JSON document, streamed page by page so a large
 * history never has to fit in memory or in a single response buffer.
 */
export function exportStream(companyId: string, company: DocumentData): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        const head = { format: "timavordur-export", version: 1, exportedAt: new Date().toISOString(), companyId, company: plain(company) };
        controller.enqueue(enc.encode(JSON.stringify(head).slice(0, -1) + ',"collections":{'));
        for (const [ci, name] of EXPORT_COLLECTIONS.entries()) {
          controller.enqueue(enc.encode(`${ci ? "," : ""}${JSON.stringify(name)}:[`));
          let first = true;
          for await (const docs of pages(companyRef(companyId).collection(name))) {
            const chunk = docs.map((d) => JSON.stringify({ id: d.id, ...(plain(d.data) as object) })).join(",");
            controller.enqueue(enc.encode((first ? "" : ",") + chunk));
            first = false;
          }
          controller.enqueue(enc.encode("]"));
        }
        controller.enqueue(enc.encode("}}"));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

/**
 * Permanently delete a company: every subcollection, its slug/kennitala indexes,
 * and group logins that no other workplace in the group still uses.
 */
export async function purgeCompany(companyId: string, company: DocumentData): Promise<{ removedLogins: number }> {
  const groupId: string = company.groupId || companyId;
  const staffIds = (await companyRef(companyId).collection("staff").select().get()).docs.map((d) => d.id);
  const others = (await adminDb.collection("tv_companies").where("groupId", "==", groupId).get()).docs.filter((d) => d.id !== companyId);

  let removedLogins = 0;
  if (others.length === 0) {
    const logins = await groupRef(groupId).collection("pinAccounts").get();
    removedLogins = logins.size;
    await adminDb.recursiveDelete(groupRef(groupId));
  } else {
    for (const uid of staffIds) {
      const elsewhere = await Promise.all(others.map((o) => o.ref.collection("staff").doc(uid).get()));
      if (elsewhere.some((d) => d.exists)) continue;
      const acct = await pinAccountRef(groupId, uid).get();
      if (!acct.exists) continue;
      const batch = adminDb.batch();
      batch.delete(acct.ref);
      if (acct.data()!.username) batch.delete(groupUsernameRef(groupId, acct.data()!.username));
      await batch.commit();
      removedLogins++;
    }
  }

  await adminDb.recursiveDelete(companyRef(companyId));
  const indexes = [adminDb.collection("tv_slugs").doc(company.slug)];
  const kt = company.kennitala ? normaliseKennitala(company.kennitala) : null;
  if (kt) indexes.push(adminDb.collection("tv_kennitolur").doc(kt));
  for (const ref of indexes) {
    const d = await ref.get();
    if (d.exists && (!d.data()!.companyId || d.data()!.companyId === companyId)) await ref.delete();
  }
  return { removedLogins };
}
