import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import * as onboarding from "@/app/api/onboarding/company/route";
import * as slugCheck from "@/app/api/onboarding/slug/route";
import * as companies from "@/app/api/companies/route";
import * as superCompany from "@/app/api/superadmin/company/route";
import * as portal from "@/app/api/[slug]/portal/route";
import * as companyPublic from "@/app/api/[slug]/company/route";
import * as login from "@/app/api/[slug]/staff/login/route";
import * as myIp from "@/app/api/[slug]/admin/my-ip/route";
import * as settings from "@/app/api/[slug]/admin/settings/route";
import { call, exchangeCustomToken, googleUser, resetEmulator, seedCompany } from "./emulator";

const KT = "5501692829"; // valid company kennitala (check digit computed)
const KT2 = "4405942049";

async function post(path: string, handler: (r: NextRequest) => Promise<Response>, token: string | null, body: unknown, headers: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: JSON.stringify(body),
  });
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}
const signupBody = (over: Record<string, unknown> = {}) => ({
  name: "Prufubar", slug: "prufubar", kennitala: KT, businessType: "bar", phone: "5551234", acceptTerms: true, authorized: true, ...over,
});

describe("company self-onboarding", () => {
  beforeEach(async () => { await resetEmulator(); });

  it("a verified Google user creates a company and is its owner at once; notifications are sent", async () => {
    process.env.SUPERADMIN_NOTIFY_EMAIL = "jon@x.is";
    const owner = await googleUser("eigandi@prufubar.is", "Eigandi");
    const r = await post("/api/onboarding/company", onboarding.POST, owner.token, signupBody());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, slug: "prufubar", url: "https://timavordur.bling.is/prufubar" });
    const c = (await adminDb.collection("tv_companies").where("slug", "==", "prufubar").get()).docs[0];
    expect(c.data()).toMatchObject({ status: "active", source: "self", plan: "free", kennitala: KT, businessType: "bar", groupId: c.id });
    expect(c.data().termsVersion).toBeTruthy();
    const me = await call(portal.GET, { slug: "prufubar", token: owner.token });
    expect(me.body).toMatchObject({ registered: true, status: "approved", role: "owner" });
    expect(me.body.onboarding).toMatchObject({ businessType: true, network: false, staffJoined: false });
    const mails = (await adminDb.collection("tv_test_mail").get()).docs.map((d) => d.data().to).sort();
    expect(mails).toEqual(["eigandi@prufubar.is", "jon@x.is"]);
    delete process.env.SUPERADMIN_NOTIFY_EMAIL;
  });

  it("refuses PIN sessions, unverified input, reserved slugs, bad kennitala and missing consent", async () => {
    const owner = await googleUser("a@x.is");
    expect((await post("/api/onboarding/company", onboarding.POST, null, signupBody())).status).toBe(401);
    expect((await post("/api/onboarding/company", onboarding.POST, owner.token, signupBody({ slug: "superadmin" }))).body.error).toBe("invalid_slug");
    expect((await post("/api/onboarding/company", onboarding.POST, owner.token, signupBody({ kennitala: "5501692819" }))).body.error).toBe("invalid_kennitala");
    expect((await post("/api/onboarding/company", onboarding.POST, owner.token, signupBody({ acceptTerms: false }))).body.error).toBe("terms_required");
    // a PIN session (custom token) is not allowed to create companies
    await seedCompany("d1", "dillon");
    const { adminAuth } = await import("@/lib/firebase-admin");
    const pinToken = await exchangeCustomToken(await adminAuth.createCustomToken("pw_x", { tv_pin: true, tv_group: "d1", tv_pin_ver: 0 }));
    expect((await post("/api/onboarding/company", onboarding.POST, pinToken, signupBody())).body.error).toBe("google_account_required");
  });

  it("slug and kennitala are unique, also under simultaneous sign-ups and against legacy companies", async () => {
    await seedCompany("legacy", "dillon", { kennitala: KT2 });
    const a = await googleUser("a@x.is");
    const b = await googleUser("b@x.is");
    const [r1, r2] = await Promise.all([
      post("/api/onboarding/company", onboarding.POST, a.token, signupBody()),
      post("/api/onboarding/company", onboarding.POST, b.token, signupBody({ kennitala: "6101100610" })),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((await post("/api/onboarding/company", onboarding.POST, b.token, signupBody({ slug: "dillon", kennitala: "6101100610" }))).body.error).toBe("slug_taken");
    expect((await post("/api/onboarding/company", onboarding.POST, b.token, signupBody({ slug: "annar", kennitala: KT2 }))).body.error).toBe("kennitala_registered");
    // availability check suggests a free variant
    const s = await slugCheck.GET(new NextRequest("http://localhost/api/onboarding/slug?name=Prufubar"));
    expect(await s.json()).toMatchObject({ slug: "prufubar-2", available: true, suggested: true });
  });

  it("is rate limited per user", async () => {
    const a = await googleUser("many@x.is");
    const kts = ["6101100610", "4405942049", "5501692829"];
    for (let i = 0; i < 3; i++) expect((await post("/api/onboarding/company", onboarding.POST, a.token, signupBody({ slug: `stadur-${i}`, kennitala: kts[i] }))).status).toBe(200);
    expect((await post("/api/onboarding/company", onboarding.POST, a.token, signupBody({ slug: "stadur-9", kennitala: "4709992099" }))).status).toBe(429);
  });

  it("superadmin can close and reopen a company; data is kept; closed means no access at all", async () => {
    const owner = await googleUser("o@x.is");
    await post("/api/onboarding/company", onboarding.POST, owner.token, signupBody());
    const su = await googleUser("su@x.is");
    await adminDb.doc(`tv_users/${su.uid}`).set({ role: "superadmin" });
    const patch = (body: unknown) => superCompany.PATCH(new NextRequest("http://localhost/api/superadmin/company", { method: "PATCH", headers: { Authorization: `Bearer ${su.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    expect((await patch({ slug: "prufubar", suspend: true })).status).toBe(200);
    expect((await call(portal.GET, { slug: "prufubar", token: owner.token })).body.error).toBe("company_suspended");
    expect((await call(companyPublic.GET, { slug: "prufubar" })).body.error).toBe("company_suspended");
    expect((await call(login.POST, { slug: "prufubar", method: "POST", body: { username: "x", password: "4826" } })).status).toBe(404);
    const list = await companies.GET(new NextRequest("http://localhost/api/companies", { headers: { Authorization: `Bearer ${su.token}` } }));
    expect((await list.json()).companies.find((c: { slug: string }) => c.slug === "prufubar")).toMatchObject({ status: "suspended", source: "self", staffCount: 1 });
    expect((await patch({ slug: "prufubar", suspend: false })).status).toBe(200);
    expect((await call(portal.GET, { slug: "prufubar", token: owner.token })).body.role).toBe("owner");
  });

  it("superadmin creation still works through the shared path (owner invite)", async () => {
    const su = await googleUser("su@x.is");
    await adminDb.doc(`tv_users/${su.uid}`).set({ role: "superadmin" });
    const res = await companies.POST(new NextRequest("http://localhost/api/companies", { method: "POST", headers: { Authorization: `Bearer ${su.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Nýi Barinn", adminEmail: "Boss@x.is" }) }));
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.slug).toBe("nyi-barinn");
    const boss = await googleUser("boss@x.is");
    expect((await call(portal.GET, { slug: "nyi-barinn", token: boss.token })).body.role).toBe("owner");
  });

  it("owner tools: my-ip from the trusted header, and dismissing the checklist", async () => {
    const owner = await googleUser("o@x.is");
    await post("/api/onboarding/company", onboarding.POST, owner.token, signupBody());
    const ip = await call(myIp.GET, { slug: "prufubar", path: "admin/my-ip", token: owner.token, headers: { "x-forwarded-for": "203.0.113.9" } });
    expect(ip.body).toEqual({ ip: "203.0.113.9", version: 4 });
    expect((await call(settings.PATCH, { slug: "prufubar", method: "PATCH", token: owner.token, body: { onboardingDismissed: true } })).status).toBe(200);
    expect((await call(portal.GET, { slug: "prufubar", token: owner.token })).body.onboarding).toBeNull();
  });
});
