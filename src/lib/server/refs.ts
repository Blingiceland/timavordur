import { adminDb } from "../firebase-admin";

export const companyRef = (companyId: string) => adminDb.collection("tv_companies").doc(companyId);
export const staffCol = (c: string) => companyRef(c).collection("staff");
export const punchCol = (c: string) => companyRef(c).collection("punchRecords");
export const punchStateRef = (c: string, uid: string) => companyRef(c).collection("punchState").doc(uid);
export const punchIdemRef = (c: string, uid: string, key: string) => companyRef(c).collection("punchIdempotency").doc(`${uid}_${key}`);
export const shiftsCol = (c: string) => companyRef(c).collection("shifts");
export const templatesCol = (c: string) => companyRef(c).collection("shiftTemplates");
export const swapsCol = (c: string) => companyRef(c).collection("swapRequests");
export const correctionsCol = (c: string) => companyRef(c).collection("punchCorrections");
export const termsCol = (c: string) => companyRef(c).collection("employmentTerms");
export const periodsCol = (c: string) => companyRef(c).collection("payrollPeriods");
export const adjustmentsCol = (c: string) => companyRef(c).collection("payrollAdjustments");
