// E-mails around a self-registered company: received, approved, rejected, info requested.
import { loginUrlFor, PRODUCT_HOST } from "../branded-hosts";
import { sendMail } from "../mail";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const contact = `https://${PRODUCT_HOST}/hafa-samband`;
/** Where operator mail and replies go. */
export const operatorEmail = () => process.env.SUPERADMIN_NOTIFY_EMAIL || "jon@dillon.is";

export interface VenueInfo { name: string; slug: string; kennitala: string; ownerName: string; ownerEmail: string; phone?: string }

export function mailOperatorNewVenue(v: VenueInfo) {
  const admin = `https://${PRODUCT_HOST}/superadmin`;
  return sendMail({
    to: operatorEmail(),
    replyTo: v.ownerEmail,
    subject: `Nýr staður bíður samþykkis: ${v.name}`,
    text: `${v.name} (kt. ${v.kennitala}, slóð ${v.slug}) skráði sig og bíður samþykkis.\nEigandi: ${v.ownerName} <${v.ownerEmail}>${v.phone ? `, sími ${v.phone}` : ""}\nSamþykkja, hafna eða óska eftir upplýsingum: ${admin}`,
    html: `<p><b>${esc(v.name)}</b> (kt. ${esc(v.kennitala)}, slóð ${esc(v.slug)}) skráði sig og bíður samþykkis.</p><p>Eigandi: ${esc(v.ownerName)} &lt;${esc(v.ownerEmail)}&gt;${v.phone ? `, sími ${esc(v.phone)}` : ""}</p><p><a href="${admin}">Samþykkja, hafna eða óska eftir upplýsingum</a></p>`,
  });
}

export function mailOwnerReceived(v: VenueInfo) {
  return sendMail({
    to: v.ownerEmail,
    replyTo: operatorEmail(),
    subject: `Skráning móttekin — ${v.name}`,
    text: `Hæ ${v.ownerName},\n\nTakk fyrir að skrá ${v.name} í Tímavörð. Við förum yfir skráninguna og þú færð póst um leið og aðgangurinn er opnaður, yfirleitt innan sólarhrings.\n\nSpurningar: ${contact}\n\n—\nThanks for registering ${v.name}. We review every registration and will e-mail you as soon as access is opened.`,
    html: `<p>Hæ ${esc(v.ownerName)},</p><p>Takk fyrir að skrá <b>${esc(v.name)}</b> í Tímavörð. Við förum yfir skráninguna og þú færð póst um leið og aðgangurinn er opnaður, yfirleitt innan sólarhrings.</p><p>Spurningar: <a href="${contact}">${contact}</a></p><hr><p>Thanks for registering ${esc(v.name)}. We review every registration and will e-mail you as soon as access is opened.</p>`,
  });
}

export function mailOwnerApproved(v: VenueInfo) {
  const portal = loginUrlFor(v.slug);
  const steps = [
    "Skráðu þig inn með Google á slóðinni hér að ofan.",
    "Stillingar: tegund reksturs og stimplun aðeins á Wi-Fi staðarins.",
    "Hengdu upp QR-kóðann (á forsíðunni þinni) svo starfsfólk skrái sig.",
    "Samþykktu starfsfólk — það fær PIN í pósti.",
    "Skráðu kjör hvers og eins og búðu til fyrsta vaktaplanið.",
  ];
  return sendMail({
    to: v.ownerEmail,
    replyTo: operatorEmail(),
    subject: `${v.name} er komið í Tímavörð`,
    text: [`Hæ ${v.ownerName},`, "", `Aðgangur ${v.name} hefur verið opnaður. Slóðin ykkar er:`, portal, "", "Fyrstu skref:", ...steps.map((s, i) => `${i + 1}. ${s}`)].join("\n"),
    html: `<p>Hæ ${esc(v.ownerName)},</p><p>Aðgangur <b>${esc(v.name)}</b> hefur verið opnaður. Slóðin ykkar er <a href="${esc(portal)}">${esc(portal)}</a>.</p><ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`,
  });
}

export function mailOwnerRejected(v: VenueInfo, message: string) {
  return sendMail({
    to: v.ownerEmail,
    replyTo: operatorEmail(),
    subject: `Skráning ${v.name} í Tímavörð`,
    text: `Hæ ${v.ownerName},\n\nSkráning ${v.name} í Tímavörð var ekki samþykkt${message ? `:\n\n${message}` : "."}\n\nSkráningin og þær upplýsingar sem fylgdu henni hafa verið fjarlægðar. Spurningar: ${contact}`,
    html: `<p>Hæ ${esc(v.ownerName)},</p><p>Skráning <b>${esc(v.name)}</b> í Tímavörð var ekki samþykkt${message ? ":" : "."}</p>${message ? `<blockquote>${esc(message).replace(/\n/g, "<br>")}</blockquote>` : ""}<p>Skráningin og þær upplýsingar sem fylgdu henni hafa verið fjarlægðar. Spurningar: <a href="${contact}">${contact}</a></p>`,
  });
}

export function mailOwnerInfoRequest(v: VenueInfo, message: string) {
  return sendMail({
    to: v.ownerEmail,
    replyTo: operatorEmail(),
    subject: `Vantar upplýsingar — skráning ${v.name}`,
    text: `Hæ ${v.ownerName},\n\nVið erum að fara yfir skráningu ${v.name} og þurfum nánari upplýsingar:\n\n${message}\n\nSvaraðu þessum pósti.`,
    html: `<p>Hæ ${esc(v.ownerName)},</p><p>Við erum að fara yfir skráningu <b>${esc(v.name)}</b> og þurfum nánari upplýsingar:</p><blockquote>${esc(message).replace(/\n/g, "<br>")}</blockquote><p>Svaraðu þessum pósti.</p>`,
  });
}
