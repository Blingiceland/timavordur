// Migration plan 2026-10 — PURE: takes a snapshot of one company's documents and
// returns the operations to apply plus a human-readable report. Applying the
// operations and planning again yields zero operations (idempotent).
//
// What it does:
//  1. Staff docs without `status` get an EXPLICIT status (never implied):
//     deliberately-added accounts (role set, or addedBy/addedAt present) → "approved";
//     anything else → "pending" and listed for review.
//  2. PIN (password) accounts holding admin/owner are capped to "manager";
//     pinVersion is initialised (existing PIN sessions must sign in again).
//  3. Companies get an explicit groupId (their own id unless already linked).
//     PIN credentials move to the GROUP account (tv_groups/{g}/pinAccounts/{uid})
//     and usernames to the group index (tv_groups/{g}/usernames/{username});
//     the hash is then removed from the staff doc so there is one source.
//     Duplicate usernames are reported, not indexed or moved.
//  4. Every staff member without employment terms gets ONE "needs_review" terms
//     record (deterministic id). Legacy pay values are preserved in `legacy` and
//     never used for pay. Placement is NOT inferred from the hourly rate; a legacy
//     rate above the candidate minimum is preserved as personal pay (never lowered)
//     and flagged. Birth date is read from the kennitala when it is valid.

export const MIGRATION_ID = "2026-10";
export const TERMS_EFFECTIVE_FROM = "2026-01-01";

// April 2026 day minimum (aurar) for the start step — used only to decide whether
// a legacy rate might be personal overpay that must be preserved.
const MIN_START_DAY_CENTS = { 6: 280187, 7: 281812 };

/** Birth date from an Icelandic kennitala (DDMMYY-NNNC, C = century 9→1900s, 0→2000s). */
export function birthDateFromKennitala(ssn) {
  const digits = String(ssn || "").replace(/\D/g, "");
  if (digits.length !== 10) return null;
  const dd = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const yy = Number(digits.slice(4, 6));
  const c = digits[9];
  const century = c === "9" ? 1900 : c === "0" ? 2000 : c === "8" ? 1800 : null;
  if (!century || dd > 31) return null; // dd > 31 would be a company kennitala (+40)
  const y = century + yy;
  const d = new Date(Date.UTC(y, mm - 1, dd));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return d.toISOString().slice(0, 10);
}

function candidateClass(categoryId) {
  const m = /^fl([67])-/.exec(String(categoryId || ""));
  return m ? Number(m[1]) : null;
}

/** Sentinel for "delete this field" (the runner converts it to FieldValue.delete()). */
export const DELETE = "__DELETE__";

/**
 * @param {{ companyId: string, company: object, staff: {id: string, data: object}[],
 *           termsUids: string[], usernameIndex: Record<string,string>,
 *           groupPinAccounts?: Record<string, boolean> }} snap
 *   usernameIndex = the GROUP username index (username → uid)
 */
export function planCompany(snap) {
  const ops = [];
  const groupId = snap.company.groupId || snap.companyId;
  const groupPin = snap.groupPinAccounts || {};
  if (!snap.company.groupId) {
    ops.push({ kind: "update", path: `tv_companies/${snap.companyId}`, data: { groupId }, before: { groupId: "__ABSENT__" } });
  }
  const report = {
    companyId: snap.companyId,
    statusSet: [],
    pinRoleCapped: [],
    usernameConflicts: [],
    termsCreated: [],
    placementReview: [],
  };
  const cats = Array.isArray(snap.company.wageCategories) ? snap.company.wageCategories : [];
  const byUsername = new Map();
  for (const s of snap.staff) {
    const u = s.data.username;
    if (u) byUsername.set(u, [...(byUsername.get(u) || []), s.id]);
  }

  for (const { id, data } of snap.staff) {
    const staffPath = `tv_companies/${snap.companyId}/staff/${id}`;
    const update = {};

    // 1. explicit status
    if (typeof data.status !== "string") {
      const deliberate = !!data.role || !!data.addedBy || !!data.addedAt;
      const status = deliberate ? "approved" : "pending";
      update.status = status;
      report.statusSet.push({ uid: id, name: data.name || "", status, reason: deliberate ? "bætt við af stjórnanda / með hlutverk" : "óljóst uppruni — þarf samþykki" });
    }

    // 2. PIN accounts
    const isPin = data.authType === "password" || id.startsWith("pw_");
    if (isPin) {
      if (data.role === "admin" || data.role === "owner") {
        update.role = "manager";
        report.pinRoleCapped.push({ uid: id, name: data.name || "", from: data.role });
      }
      if (data.authType !== "password") update.authType = "password";
    }

    if (Object.keys(update).length) {
      update.migration = MIGRATION_ID;
      ops.push({ kind: "update", path: staffPath, data: update, before: pick(data, Object.keys(update)) });
    }

    // 3. group login (credentials + username index)
    const conflict = data.username && (byUsername.get(data.username).length > 1 || (snap.usernameIndex[data.username] && snap.usernameIndex[data.username] !== id));
    if (data.username && conflict) {
      if (byUsername.get(data.username)[0] === id) report.usernameConflicts.push({ username: data.username, uids: [...new Set([...byUsername.get(data.username), snap.usernameIndex[data.username]].filter(Boolean))] });
    } else {
      if (data.username && snap.usernameIndex[data.username] !== id) {
        ops.push({ kind: "create", path: `tv_groups/${groupId}/usernames/${data.username}`, data: { uid: id, migration: MIGRATION_ID } });
      }
      if (isPin && data.passwordHash && !groupPin[id]) {
        ops.push({
          kind: "create", path: `tv_groups/${groupId}/pinAccounts/${id}`,
          data: { uid: id, username: data.username ?? null, name: data.name || "", passwordHash: data.passwordHash, passwordSalt: data.passwordSalt, pinVersion: typeof data.pinVersion === "number" ? data.pinVersion : 0, migration: MIGRATION_ID },
        });
        ops.push({ kind: "update", path: staffPath, data: { passwordHash: DELETE, passwordSalt: DELETE, pinVersion: DELETE }, before: pick(data, ["passwordHash", "passwordSalt", "pinVersion"]) });
      }
    }

    // 4. employment terms
    if (!snap.termsUids.includes(id)) {
      const cat = cats.find((c) => c.id === data.wageCategoryId);
      const legacyRate = cat ? Number(cat.dayRate) || 0 : Number(data.hourlyRate) || 0;
      const cls = candidateClass(data.wageCategoryId);
      const payType = data.payType === "monthly" ? "monthly" : data.payType === "averaged" ? "averaged" : "hourly";
      const notes = [];
      let personalDayRate = null;
      if (payType === "hourly" && legacyRate > 0) {
        const min = cls ? MIN_START_DAY_CENTS[cls] : MIN_START_DAY_CENTS[6];
        if (Math.round(legacyRate * 100) > min) {
          personalDayRate = legacyRate;
          notes.push(`Eldri taxti ${legacyRate} kr er yfir lágmarki byrjunarþreps — varðveittur sem persónulegur taxti. Staðfestið hvort hann sé raunveruleg yfirborgun.`);
        } else {
          notes.push(`Eldri taxti ${legacyRate} kr er undir núgildandi lágmarki — lágmark gildir.`);
        }
      }
      if (!cls) notes.push("Launaflokk vantar (ekki ályktað af taxta).");
      if (payType === "averaged") notes.push("Jafnaðarkaup er ekki útfært — útreikningur stöðvast þar til kjör eru skráð.");
      if (data.collectiveAgreement === "custom") notes.push("Sérstakur samningur — ekki studdur; skrá þarf kjör skv. SA/Eflingu eða halda utan kerfis.");
      notes.push("Upphafsdag ráðningar, vinnufyrirkomulag og starfshlutfall vantar.");
      const birthDate = birthDateFromKennitala(data.ssn);
      if (!birthDate) notes.push("Fæðingardag vantar (kennitala ekki til staðar/ólæsileg).");

      const termsId = `migr${MIGRATION_ID.replace("-", "")}_${id}`;
      ops.push({
        kind: "create",
        path: `tv_companies/${snap.companyId}/employmentTerms/${termsId}`,
        data: {
          uid: id, effectiveFrom: TERMS_EFFECTIVE_FROM, recordedAt: "__SERVER_TIME__", recordedBy: `migration:${MIGRATION_ID}`,
          reason: "Flutt úr eldra kerfi — þarf yfirferð", status: "needs_review", agreementId: "efling_sa_hotel",
          workingArrangement: null, payType, employmentPercentage: null, wageClass: cls, managementRole: false,
          birthDate, employerStartDate: null, priorIndustryMonths: null, experienceVerifiedOn: null, stepOverride: null,
          personalDayRate, monthlySalary: payType === "monthly" && Number(data.monthlyRate) > 0 ? Number(data.monthlyRate) : null,
          fixedAdditions: [], orlofOverrideBp: typeof data.orlofsRate === "number" && data.orlofsRate > 0.1017 ? Math.round(data.orlofsRate * 10000) : null,
          legacy: {
            payType: data.payType ?? null, hourlyRate: data.hourlyRate ?? null, monthlyRate: data.monthlyRate ?? null,
            collectiveAgreement: data.collectiveAgreement ?? null, wageCategoryId: data.wageCategoryId ?? null,
            categoryDayRate: cat ? cat.dayRate : null, orlofsRate: data.orlofsRate ?? null, employmentType: data.employmentType ?? null,
          },
          migration: MIGRATION_ID,
        },
      });
      report.termsCreated.push({ uid: id, termsId });
      report.placementReview.push({ uid: id, name: data.name || "", candidateClass: cls, legacyRate: legacyRate || null, payType, notes });
    }
  }
  return { ops, report };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = k in obj ? obj[k] : "__ABSENT__";
  return out;
}
