import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  // Fall back to a non-empty placeholder so getAuth() doesn't throw
  // `auth/invalid-api-key` during the build-time prerender when the env var is
  // absent (e.g. a misconfigured deploy). At runtime the real value is inlined
  // from NEXT_PUBLIC_FIREBASE_API_KEY and everything works normally.
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "missing-firebase-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
// Local testing only: NEXT_PUBLIC_AUTH_EMULATOR=127.0.0.1:9099 routes sign-in to the
// Firebase Auth emulator. Never set in Vercel environments.
if (process.env.NEXT_PUBLIC_AUTH_EMULATOR && typeof window !== "undefined") {
  connectAuthEmulator(auth, `http://${process.env.NEXT_PUBLIC_AUTH_EMULATOR}`, { disableWarnings: true });
}
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
