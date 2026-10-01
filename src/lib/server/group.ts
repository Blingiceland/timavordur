// Company groups: separate employers (own kennitala, terms, payroll) whose staff
// share ONE login. Credentials and the username index live at group level:
//   tv_groups/{groupId}/pinAccounts/{uid}  { username, passwordHash, passwordSalt, pinVersion, name }
//   tv_groups/{groupId}/usernames/{username} { uid }
// Membership in a company is still the staff doc tv_companies/{id}/staff/{uid}.

import { adminDb } from "../firebase-admin";
import { companyFromDoc } from "../auth";
import type { Company } from "../types";

export const groupRef = (groupId: string) => adminDb.collection("tv_groups").doc(groupId);
export const pinAccountRef = (groupId: string, uid: string) => groupRef(groupId).collection("pinAccounts").doc(uid);
export const groupUsernameRef = (groupId: string, username: string) => groupRef(groupId).collection("usernames").doc(username);

/** Active companies in a group (a company without groupId is its own group). */
export async function groupCompanies(groupId: string, tx?: FirebaseFirestore.Transaction): Promise<Company[]> {
  const q = adminDb.collection("tv_companies").where("groupId", "==", groupId).where("active", "==", true);
  const [byGroup, self] = await Promise.all([
    tx ? tx.get(q) : q.get(),
    tx ? tx.get(adminDb.collection("tv_companies").doc(groupId)) : adminDb.collection("tv_companies").doc(groupId).get(),
  ]);
  const out = new Map<string, Company>();
  for (const d of byGroup.docs) out.set(d.id, companyFromDoc(d.id, d.data()));
  // Legacy company without an explicit groupId is the group named by its own id.
  if (self.exists && self.data()!.active === true && !self.data()!.groupId) out.set(self.id, companyFromDoc(self.id, self.data()!));
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, "is"));
}
