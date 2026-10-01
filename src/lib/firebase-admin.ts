import { initializeApp, getApps, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import path from "path";
import fs from "fs";

// Firebase Admin initialisation. Rules:
//  1. Emulator mode (FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST set)
//     only accepts a "demo-" project id and never reads credentials — tests can
//     not reach a real project.
//  2. There is no silent fallback to a default project. Without credentials the
//     first database call throws a clear configuration error.
//  3. A Vercel preview deployment refuses to use the production project.
//  4. The local key file is only read outside production.

const PRODUCTION_PROJECT_ID = process.env.PRODUCTION_FIREBASE_PROJECT_ID || "timavordur";

function assertNotPreviewOnProduction(projectId: string) {
  if (process.env.VERCEL_ENV === "preview" && projectId === PRODUCTION_PROJECT_ID) {
    throw new Error(
      `[firebase-admin] Preview deployment is configured with the production project (${projectId}). ` +
        "Set a separate FIREBASE_SERVICE_ACCOUNT_KEY for the Preview environment."
    );
  }
}

function createApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "";
    if (!projectId.startsWith("demo-")) {
      throw new Error("[firebase-admin] Emulator mode requires GCLOUD_PROJECT to be a demo- project id.");
    }
    return initializeApp({ projectId });
  }
  if (process.env.TIMAVORDUR_REQUIRE_EMULATOR === "1") {
    throw new Error("[firebase-admin] Tests must run against the Firebase emulator.");
  }

  const keyPath = path.join(process.cwd(), "service-account-key.json");
  if (process.env.NODE_ENV !== "production" && fs.existsSync(keyPath)) {
    const sa = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    assertNotPreviewOnProduction(sa.project_id);
    return initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }

  const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (envKey) {
    const sa = JSON.parse(envKey);
    assertNotPreviewOnProduction(sa.project_id);
    return initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }

  if (process.env.FIREBASE_USE_ADC === "1" && process.env.FIREBASE_PROJECT_ID) {
    assertNotPreviewOnProduction(process.env.FIREBASE_PROJECT_ID);
    return initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
  }

  throw new Error(
    "[firebase-admin] No Firebase credentials configured (FIREBASE_SERVICE_ACCOUNT_KEY, " +
      "service-account-key.json in development, or FIREBASE_USE_ADC=1 with FIREBASE_PROJECT_ID)."
  );
}

let app: App | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export function getAdminDb(): Firestore {
  if (!db) {
    app ??= createApp();
    db = getFirestore(app);
  }
  return db;
}

export function getAdminAuth(): Auth {
  if (!auth) {
    app ??= createApp();
    auth = getAuth(app);
  }
  return auth;
}

// Lazily-initialised handles so importing a route module (e.g. during `next build`)
// never touches credentials; the first real call does.
function lazy<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const target = get() as Record<PropertyKey, unknown>;
      const v = target[prop];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(target) : v;
    },
  });
}

export const adminDb: Firestore = lazy(getAdminDb);
export const adminAuth: Auth = lazy(getAdminAuth);
