import { adminDb } from "./firebase-admin";

// Server-side error reporting for API routes. console.error alone is not
// enough in production: Vercel only retains function logs for a short window,
// so the Firestore copy in tv_errors is what makes an error visible after the
// fact (Firebase Console → Firestore → tv_errors, newest first by createdAt).
// Documents carry expiresAt (30 days) so a TTL policy can prune them.

/** Log `err` to the console and persist it to tv_errors. Never throws. */
export async function reportApiError(
  where: string,
  err: unknown,
  ctx: { slug?: string; uid?: string } = {}
): Promise<void> {
  console.error(`[${where}]`, err);
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    await adminDb.collection("tv_errors").add({
      where,
      message: e.message.slice(0, 500),
      stack: (e.stack || "").slice(0, 2000),
      ...ctx,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  } catch (persistErr) {
    console.error("[report-error] could not persist to tv_errors", persistErr);
  }
}
