import { NextRequest } from "next/server";
import { getClientIp } from "@/lib/ip";
import { sendMail } from "@/lib/mail";
import { POLICIES, lockedFor, recordAttempt } from "@/lib/rate-limit";
import { fail, handle, json } from "@/lib/server/http";
import { operatorEmail } from "@/lib/server/onboarding-mail";
import { cleanStr, readJsonObject } from "@/lib/validation";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// POST /api/contact { name, email, company?, message, website? } — public enquiry
// form. Forwarded to the operator with Reply-To set to the sender. `website` is
// a honeypot: bots fill it, people never see it.
export async function POST(req: NextRequest) {
  return handle("contact", {}, async () => {
    const body = await readJsonObject(req);
    if (!body) return fail("invalid_body", 400);
    if (typeof body.website === "string" && body.website.trim()) return json({ ok: true }); // silently drop bots
    const name = cleanStr(body.name, 120);
    const email = cleanStr(body.email, 200).toLowerCase();
    const company = cleanStr(body.company, 120);
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 5000) : "";
    if (name.length < 2) return fail("name_required", 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("invalid_email", 400);
    if (message.length < 5) return fail("message_required", 400);

    const ip = getClientIp(req.headers);
    if (ip) {
      const key = `contact:ip:${ip}`;
      const locked = await lockedFor([key]);
      if (locked > 0) {
        const retryAfter = Math.ceil(locked / 1000);
        return json({ error: "too_many_attempts", retryAfter }, 429, { "Retry-After": String(retryAfter) });
      }
      await recordAttempt([{ key, policy: POLICIES.contactIp }]);
    }

    const r = await sendMail({
      to: operatorEmail(),
      replyTo: email,
      subject: `Fyrirspurn á Tímaverði: ${name}${company ? ` (${company})` : ""}`,
      text: `Frá: ${name} <${email}>${company ? `\nStaður/fyrirtæki: ${company}` : ""}\n\n${message}`,
      html: `<p>Frá: <b>${esc(name)}</b> &lt;${esc(email)}&gt;${company ? `<br>Staður/fyrirtæki: ${esc(company)}` : ""}</p><p>${esc(message).replace(/\n/g, "<br>")}</p>`,
    });
    if (!r.sent) return fail("send_failed", 502);
    return json({ ok: true });
  });
}
