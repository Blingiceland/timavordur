// Employment-terms persistence (tv_companies/{id}/employmentTerms). Records are
// only ever added; nothing here updates or deletes one.

import type { EmploymentTerms } from "../payroll/terms";
import { termsCol } from "./refs";

export function termsFromDoc(id: string, d: FirebaseFirestore.DocumentData): EmploymentTerms {
  return {
    id,
    uid: d.uid,
    effectiveFrom: d.effectiveFrom,
    recordedAt: d.recordedAt?.toDate?.().toISOString?.() ?? String(d.recordedAt ?? ""),
    recordedBy: d.recordedBy ?? "",
    reason: d.reason ?? "",
    status: d.status ?? "needs_review",
    agreementId: d.agreementId ?? "efling_sa_hotel",
    workingArrangement: d.workingArrangement ?? null,
    payType: d.payType ?? "hourly",
    employmentPercentage: d.employmentPercentage ?? null,
    wageClass: d.wageClass ?? null,
    managementRole: !!d.managementRole,
    birthDate: d.birthDate ?? null,
    employerStartDate: d.employerStartDate ?? null,
    priorIndustryMonths: d.priorIndustryMonths ?? null,
    experienceVerifiedOn: d.experienceVerifiedOn ?? null,
    stepOverride: d.stepOverride ?? null,
    personalDayRate: d.personalDayRate ?? null,
    monthlySalary: d.monthlySalary ?? null,
    fixedAdditions: Array.isArray(d.fixedAdditions) ? d.fixedAdditions : [],
    orlofOverrideBp: d.orlofOverrideBp ?? null,
    customRates: d.customRates ?? null,
    legacy: d.legacy ?? null,
  };
}

export async function loadTermsByUid(companyId: string, uids?: string[]): Promise<Map<string, EmploymentTerms[]>> {
  const out = new Map<string, EmploymentTerms[]>();
  const push = (t: EmploymentTerms) => {
    if (!out.has(t.uid)) out.set(t.uid, []);
    out.get(t.uid)!.push(t);
  };
  if (uids && uids.length <= 30) {
    if (uids.length === 0) return out;
    const snap = await termsCol(companyId).where("uid", "in", uids).get();
    snap.docs.forEach((d) => push(termsFromDoc(d.id, d.data())));
  } else {
    const snap = await termsCol(companyId).get();
    snap.docs.forEach((d) => {
      const t = termsFromDoc(d.id, d.data());
      if (!uids || uids.includes(t.uid)) push(t);
    });
  }
  return out;
}
