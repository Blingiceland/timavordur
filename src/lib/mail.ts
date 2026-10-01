// Outgoing e-mail via Resend (https://resend.com) — plain REST, no SDK.
// Configure in Vercel: RESEND_API_KEY and MAIL_FROM (e.g. "Tímavörður <timavordur@dillon.is>").
// In the Firebase emulator (tests / local) messages are written to tv_test_mail
// instead of being sent. Never throws: returns whether the message was accepted.

import { adminDb } from "./firebase-admin";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type MailResult = { sent: true } | { sent: false; reason: "not_configured" | "rejected" | "network" };

export async function sendMail(msg: MailMessage): Promise<MailResult> {
  if (process.env.FIRESTORE_EMULATOR_HOST && (process.env.GCLOUD_PROJECT || "").startsWith("demo-")) {
    if (process.env.MAIL_TEST_FAIL === "1") return { sent: false, reason: "rejected" };
    await adminDb.collection("tv_test_mail").add({ ...msg, at: new Date() });
    return { sent: true };
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) {
      console.error("[mail] Resend rejected", res.status, await res.text().catch(() => ""));
      return { sent: false, reason: "rejected" };
    }
    return { sent: true };
  } catch (e) {
    console.error("[mail] network error", e);
    return { sent: false, reason: "network" };
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The PIN e-mail (Icelandic first, English below). */
export function pinMessage(p: { to: string; name: string; username: string; pin: string; workplaces: string[]; loginUrl: string; reset: boolean }): MailMessage {
  const places = p.workplaces.join(" og ");
  const subject = p.reset ? "Nýtt PIN í Tímaverði / New PIN" : `Aðgangur að Tímaverði — ${places}`;
  const lead = p.reset
    ? `Hér er nýtt PIN fyrir Tímavörð.`
    : `Skráning þín hjá ${places} hefur verið samþykkt.`;
  const text = [
    `Hæ ${p.name},`, "", lead, "",
    `Notendanafn: ${p.username}`, `PIN: ${p.pin}`, "", `Skráðu þig inn hér: ${p.loginUrl}`, "",
    "Ekki deila PIN-inu með neinum. Ef þú gleymir því getur stjórnandi sent þér nýtt.", "", "—", "",
    `Hi ${p.name}, ${p.reset ? "here is your new PIN for Tímavörður." : `your registration at ${places} has been approved.`}`,
    `Username: ${p.username} · PIN: ${p.pin} · Sign in: ${p.loginUrl}`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
<p>Hæ ${esc(p.name)},</p><p>${esc(lead)}</p>
<table style="border-collapse:collapse;margin:12px 0"><tr><td style="padding:4px 12px 4px 0;color:#555">Notendanafn</td><td style="font-weight:600">${esc(p.username)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#555">PIN</td><td style="font-weight:700;font-size:22px;letter-spacing:4px">${esc(p.pin)}</td></tr></table>
<p><a href="${esc(p.loginUrl)}" style="display:inline-block;background:#6c63ff;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Skrá inn</a></p>
<p style="color:#555;font-size:13px">Ekki deila PIN-inu með neinum. Ef þú gleymir því getur stjórnandi sent þér nýtt.</p>
<hr style="border:none;border-top:1px solid #ddd"><p style="color:#555;font-size:13px">Hi ${esc(p.name)}, ${p.reset ? "here is your new PIN." : `your registration at ${esc(places)} has been approved.`} Username <b>${esc(p.username)}</b>, PIN <b>${esc(p.pin)}</b>.</p></div>`;
  return { to: p.to, subject, text, html };
}
