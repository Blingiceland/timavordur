import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { isAccessError, verifyCompanyRole } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { PRODUCT_HOST } from "@/lib/branded-hosts";
import { sendMail } from "@/lib/mail";
import { accessFail, fail, handle, json } from "@/lib/server/http";
import { companyRef } from "@/lib/server/refs";
import { readJsonObject } from "@/lib/validation";

/** Days a closed company is kept (and can be reopened) before permanent deletion. */
const RETENTION_DAYS = 30;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// POST /api/[slug]/admin/close { confirmSlug } — owner only. Closes the company
// at once (no logins or punches) and schedules permanent deletion after
// RETENTION_DAYS. Until then the superadmin can reopen it on request.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("admin/close POST", { slug }, async () => {
    const access = await verifyCompanyRole(req, slug, "owner");
    if (isAccessError(access)) return accessFail(access);
    const body = await readJsonObject(req);
    if (body?.confirmSlug !== slug) return fail("confirm_slug_mismatch", 400);
    const id = access.company.id;
    const deleteAfter = new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);

    await adminDb.runTransaction(async (tx) => {
      tx.update(companyRef(id), {
        status: "suspended", statusChangedAt: FieldValue.serverTimestamp(), statusChangedBy: access.decoded.uid,
        closureRequestedAt: FieldValue.serverTimestamp(), closureRequestedBy: access.decoded.uid, deleteAfter,
      });
      writeAudit({
        companyId: id, actorUid: access.decoded.uid, actorRole: access.role, action: "company.close_requested",
        targetType: "company", targetId: id, after: { status: "suspended", deleteAfter }, requestId: requestIdOf(req),
      }, tx);
    });

    const name = access.company.name;
    const ownerEmail = access.decoded.email;
    const notify = process.env.SUPERADMIN_NOTIFY_EMAIL;
    await Promise.all([
      notify ? sendMail({
        to: notify,
        subject: `Staður lokaður: ${name}`,
        text: `${name} (${slug}) var lokað af eiganda (${ownerEmail ?? access.decoded.uid}). Gögnum má eyða varanlega eftir ${deleteAfter}.\nSuperadmin: https://${PRODUCT_HOST}/superadmin`,
        html: `<p><b>${esc(name)}</b> (${esc(slug)}) var lokað af eiganda (${esc(ownerEmail ?? access.decoded.uid)}).</p><p>Gögnum má eyða varanlega eftir ${deleteAfter}.</p><p><a href="https://${PRODUCT_HOST}/superadmin">Superadmin</a></p>`,
      }).catch(() => null) : null,
      ownerEmail ? sendMail({
        to: ownerEmail,
        subject: `${name} hefur verið lokað í Tímaverði`,
        text: `Aðgangi ${name} hefur verið lokað. Gögnin eru geymd til ${deleteAfter} og eytt varanlega eftir það.\nViltu hætta við? Svaraðu þessum pósti fyrir ${deleteAfter}.\n\n${name} has been closed. Data is kept until ${deleteAfter} and then permanently deleted. Reply before then to undo.`,
        html: `<p>Aðgangi <b>${esc(name)}</b> hefur verið lokað. Gögnin eru geymd til <b>${deleteAfter}</b> og eytt varanlega eftir það.</p><p>Viltu hætta við? Svaraðu þessum pósti fyrir ${deleteAfter}.</p><hr><p>${esc(name)} has been closed. Data is kept until ${deleteAfter} and then permanently deleted. Reply before then to undo.</p>`,
      }).catch(() => null) : null,
    ]);
    return json({ ok: true, status: "suspended", deleteAfter });
  });
}
