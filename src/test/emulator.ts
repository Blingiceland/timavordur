// Helpers for API integration tests against the Firebase emulator.
// Refuses to run unless both emulators are configured and the project is demo-*.
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

const PROJECT = process.env.GCLOUD_PROJECT || "";
const FS = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!PROJECT.startsWith("demo-") || !FS || !AUTH) {
  throw new Error("Integration tests require the Firebase emulator and a demo- project.");
}

export async function resetEmulator() {
  await fetch(`http://${FS}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

const idt = (path: string) => `http://${AUTH}/identitytoolkit.googleapis.com/v1/${path}?key=fake-api-key`;

/** A Google-provider user with a verified email; returns { uid, token }. */
export async function googleUser(email: string, name = email.split("@")[0]) {
  const claims = { sub: `g-${email}`, email, email_verified: true, name };
  const res = await fetch(idt("accounts:signInWithIdp"), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postBody: `id_token=${encodeURIComponent(JSON.stringify(claims))}&providerId=google.com`, requestUri: "http://localhost", returnIdpCredential: true, returnSecureToken: true }),
  });
  const d = await res.json();
  if (!d.idToken) throw new Error(`signInWithIdp failed: ${JSON.stringify(d)}`);
  return { uid: d.localId as string, token: d.idToken as string };
}

export async function exchangeCustomToken(customToken: string) {
  const res = await fetch(idt("accounts:signInWithCustomToken"), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const d = await res.json();
  if (!d.idToken) throw new Error(`signInWithCustomToken failed: ${JSON.stringify(d)}`);
  return d.idToken as string;
}

type Handler = (req: NextRequest, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>;

export async function call(handler: Handler, opts: { slug: string; method?: string; path?: string; token?: string; body?: unknown; headers?: Record<string, string>; query?: string }) {
  const url = `http://localhost/api/${opts.slug}/${opts.path ?? "x"}${opts.query ? `?${opts.query}` : ""}`;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers ?? {}) };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const req = new NextRequest(url, { method: opts.method ?? "GET", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await handler(req, { params: Promise.resolve({ slug: opts.slug }) });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  return { status: res.status, body, text, headers: res.headers };
}

export async function seedCompany(id: string, slug: string, extra: Record<string, unknown> = {}) {
  await adminDb.collection("tv_companies").doc(id).set({
    name: `Test ${slug}`, slug, active: true, adminEmails: [], requireApproval: true, registrationFields: {},
    ipRestriction: { enabled: false, allowedIPs: [] }, businessType: "bar", ...extra,
  });
}

export async function seedStaff(companyId: string, uid: string, data: Record<string, unknown>) {
  await adminDb.collection("tv_companies").doc(companyId).collection("staff").doc(uid).set({ uid, name: uid, status: "approved", role: "staff", ...data });
}

export async function seedTerms(companyId: string, uid: string, over: Record<string, unknown> = {}) {
  await adminDb.collection("tv_companies").doc(companyId).collection("employmentTerms").add({
    uid, effectiveFrom: "2026-01-01", recordedAt: new Date("2026-01-01T00:00:00Z"), recordedBy: "test", reason: "test", status: "active",
    agreementId: "efling_sa_hotel", workingArrangement: "shift", payType: "hourly", employmentPercentage: 100, wageClass: 6,
    managementRole: false, birthDate: "1990-01-01", employerStartDate: "2024-01-01", priorIndustryMonths: null, experienceVerifiedOn: null,
    stepOverride: null, personalDayRate: null, monthlySalary: null, fixedAdditions: [], orlofOverrideBp: null, legacy: null, ...over,
  });
}

export async function seedPunch(companyId: string, uid: string, type: "in" | "out", iso: string, id?: string) {
  const col = adminDb.collection("tv_companies").doc(companyId).collection("punchRecords");
  const ref = id ? col.doc(id) : col.doc();
  const { Timestamp } = await import("firebase-admin/firestore");
  await ref.set({ uid, name: uid, type, timestamp: Timestamp.fromDate(new Date(iso)), date: iso.slice(0, 10), displayTime: iso.slice(11, 16), source: "clock" });
  return ref.id;
}

export const key = () => Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
