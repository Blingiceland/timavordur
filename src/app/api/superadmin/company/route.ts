import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { verifySuperAdmin } from "@/lib/auth";
import { requestIdOf, writeAudit } from "@/lib/audit";
import { fail, handle, HttpError, json } from "@/lib/server/http";
import { readJsonObject } from "@/lib/validation";

// PATCH /api/superadmin/company { slug, addEmail? , removEmail? } — superadmin only.
// adminEmails is the owner-invite list; it is kept in sync with staff.role:
//   add    → if that person already has a staff doc, they become owner;
//   remove → any admin/owner with that email is demoted to staff (never the last owner).
export async function PATCH(req: NextRequest) {
  return handle("superadmin/company PATCH", {}, async () => {
    const su = await verifySuperAdmin(req);
    if (!su) return fail("not_superadmin", 403);
    const body = await readJsonObject(req);
    const slug = typeof body?.slug === "string" ? body.slug : "";
    if (!slug) return fail("slug_required", 400);
    const addEmail = typeof body?.addEmail === "string" ? body.addEmail.trim().toLowerCase() : "";
    const removeEmail = typeof body?.removEmail === "string" ? body.removEmail.trim().toLowerCase() : "";
    if (addEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addEmail)) return fail("invalid_email", 400);
    const linkToSlug = typeof body?.linkToSlug === "string" ? body.linkToSlug : "";
    const suspend = typeof body?.suspend === "boolean" ? body.suspend : null;
    if (!addEmail && !removeEmail && !linkToSlug && suspend === null) return fail("no_changes", 400);

    const snap = await adminDb.collection("tv_companies").where("slug", "==", slug).limit(1).get();
    if (snap.empty) return fail("company_not_found", 404);
    const companyRef = snap.docs[0].ref;
    const staff = companyRef.collection("staff");

    if (suspend !== null) {
      // Close or reopen a company. Data is kept; every login and API call is refused while closed.
      await adminDb.runTransaction(async (tx) => {
        const before = (await tx.get(companyRef)).data()?.status ?? "active";
        tx.update(companyRef, { status: suspend ? "suspended" : "active", statusChangedAt: FieldValue.serverTimestamp(), statusChangedBy: su.uid });
        writeAudit({ companyId: companyRef.id, actorUid: su.uid, actorRole: "superadmin", action: suspend ? "company.suspend" : "company.reopen", targetType: "company", targetId: companyRef.id, before: { status: before }, after: { status: suspend ? "suspended" : "active" }, requestId: requestIdOf(req) }, tx);
      });
      if (!addEmail && !removeEmail && !linkToSlug) return json({ ok: true, status: suspend ? "suspended" : "active" });
    }

    if (linkToSlug) {
      // Join another company's group. Only while this company has no staff, so no
      // existing login (which lives at group level) is orphaned.
      const other = await adminDb.collection("tv_companies").where("slug", "==", linkToSlug).limit(1).get();
      if (other.empty) return fail("link_target_not_found", 404);
      if (other.docs[0].id === companyRef.id) return fail("cannot_link_self", 400);
      if (!(await staff.limit(1).get()).empty) return fail("company_has_staff", 409);
      const groupId = (other.docs[0].data().groupId as string) || other.docs[0].id;
      await adminDb.runTransaction(async (tx) => {
        if (!other.docs[0].data().groupId) tx.update(other.docs[0].ref, { groupId });
        tx.update(companyRef, { groupId });
        writeAudit({ companyId: companyRef.id, actorUid: su.uid, actorRole: "superadmin", action: "company.link_group", targetType: "company", targetId: companyRef.id, after: { groupId, linkedTo: linkToSlug }, requestId: requestIdOf(req) }, tx);
      });
      if (!addEmail && !removeEmail) return json({ ok: true, groupId });
    }

    const result = await adminDb.runTransaction(async (tx) => {
      const company = await tx.get(companyRef);
      const current: string[] = (company.data()?.adminEmails || []).map((e: string) => e.toLowerCase());
      const addMatches = addEmail ? await tx.get(staff.where("email", "==", addEmail)) : null;
      const removeMatches = removeEmail ? await tx.get(staff.where("email", "==", removeEmail)) : null;
      const owners = await tx.get(staff.where("role", "==", "owner").where("status", "==", "approved"));
      const changes: Record<string, unknown>[] = [];

      if (removeMatches) {
        const demote = removeMatches.docs.filter((d) => ["admin", "owner"].includes(d.data().role));
        const remainingOwners = owners.docs.filter((o) => !demote.some((d) => d.id === o.id)).length;
        if (demote.some((d) => d.data().role === "owner") && remainingOwners === 0 && !addEmail) throw new HttpError(409, "last_owner");
        for (const d of demote) {
          tx.update(d.ref, { role: "staff", roleChangedAt: new Date().toISOString(), roleChangedBy: `superadmin:${su.uid}` });
          changes.push({ uid: d.id, from: d.data().role, to: "staff" });
        }
      }
      if (addMatches) {
        for (const d of addMatches.docs) {
          if (d.data().authType === "password") continue; // PIN accounts cannot be owners
          tx.update(d.ref, { role: "owner", status: "approved", roleChangedAt: new Date().toISOString(), roleChangedBy: `superadmin:${su.uid}` });
          changes.push({ uid: d.id, from: d.data().role, to: "owner" });
        }
      }
      const next = [...new Set([...current.filter((e) => e !== removeEmail), ...(addEmail ? [addEmail] : [])])];
      tx.update(companyRef, { adminEmails: next, adminEmailsUpdatedAt: FieldValue.serverTimestamp() });
      writeAudit({
        companyId: companyRef.id, actorUid: su.uid, actorRole: "superadmin", action: "company.admin_emails",
        targetType: "company", targetId: companyRef.id, before: { adminEmails: current }, after: { adminEmails: next, roleChanges: changes }, requestId: requestIdOf(req),
      }, tx);
      return { adminEmails: next, previousAdminEmails: current, roleChanges: changes };
    });
    return json({ ok: true, ...result });
  });
}
