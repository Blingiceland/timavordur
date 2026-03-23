import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import path from "path";
import fs from "fs";

function getAdminApp(): App {
    const existingApps = getApps();
    if (existingApps.length > 0) {
        return existingApps[0];
    }

    // Aðferð 1: Lesa úr JSON skrá (locally)
    const keyPath = path.join(process.cwd(), "service-account-key.json");
    if (fs.existsSync(keyPath)) {
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
        console.log("[FIREBASE ADMIN] Tengt með service-account-key.json");
        return initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id,
        });
    }

    // Aðferð 2: Lesa úr environment variable (Vercel/Production)
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
        const serviceAccount = JSON.parse(serviceAccountKey);
        console.log("[FIREBASE ADMIN] Tengt með FIREBASE_SERVICE_ACCOUNT_KEY env var");
        return initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id,
        });
    }

    // Fallback
    console.warn("[FIREBASE ADMIN] Engin service account key fundin! Nota default credentials.");
    return initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "dillon-is",
    });
}

const adminApp = getAdminApp();

export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
