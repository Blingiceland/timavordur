import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { isValidSlug, slugify } from "@/lib/onboarding";
import { handle, json } from "@/lib/server/http";

// GET /api/onboarding/slug?s=<slug>  or  ?name=<company name>
// Public: is the address free? With ?name= a suggestion is made from the name.
export async function GET(req: NextRequest) {
  return handle("onboarding/slug", {}, async () => {
    const url = new URL(req.url);
    const name = url.searchParams.get("name");
    const base = name ? slugify(name.slice(0, 80)) : (url.searchParams.get("s") || "").trim().toLowerCase();
    if (!isValidSlug(base)) return json({ slug: base, available: false, reason: "invalid" });
    const taken = async (s: string) => {
      const [idx, legacy] = await Promise.all([
        adminDb.collection("tv_slugs").doc(s).get(),
        adminDb.collection("tv_companies").where("slug", "==", s).limit(1).get(),
      ]);
      return idx.exists || !legacy.empty;
    };
    if (!(await taken(base))) return json({ slug: base, available: true });
    if (!name) return json({ slug: base, available: false, reason: "taken" });
    for (let i = 2; i < 10; i++) {
      const s = `${base.slice(0, 36)}-${i}`;
      if (!(await taken(s))) return json({ slug: s, available: true, suggested: true });
    }
    return json({ slug: base, available: false, reason: "taken" });
  });
}
