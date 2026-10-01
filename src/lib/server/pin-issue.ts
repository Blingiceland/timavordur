// Issue a new random PIN for a group login and e-mail it to the person.
// The PIN is never stored in clear text. If the e-mail cannot be sent the PIN
// is returned ONCE to the approving admin so it can be handed over in person.

import { randomInt } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth } from "../firebase-admin";
import { loginUrlFor } from "../branded-hosts";
import { pinMessage, sendMail } from "../mail";
import { hashPassword } from "../password";
import { isWeakPin } from "../pin-policy";
import { pinAccountRef } from "./group";
import { HttpError } from "./http";

export function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 10_000)).padStart(4, "0");
    if (!isWeakPin(pin)) return pin;
  }
}

export interface PinIssueResult {
  emailed: boolean;
  /** Only when the e-mail was NOT sent: show once to the admin. */
  pin?: string;
  email: string | null;
  reason?: string;
}

export async function issuePin(p: {
  groupId: string;
  uid: string;
  reset: boolean;
  actorUid: string;
  loginSlug: string;
  origin: string;
  workplaceNames: string[];
}): Promise<PinIssueResult> {
  const ref = pinAccountRef(p.groupId, p.uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(400, "not_pin_account");
  const acct = snap.data()!;
  const pin = generatePin();
  const { hash, salt } = hashPassword(pin);
  await ref.update({
    passwordHash: hash, passwordSalt: salt, pinVersion: (acct.pinVersion ?? 0) + 1,
    pinIssuedAt: FieldValue.serverTimestamp(), pinIssuedBy: p.actorUid,
  });
  if (p.reset) await adminAuth.revokeRefreshTokens(p.uid).catch(() => undefined);

  const email: string | null = typeof acct.email === "string" && acct.email.includes("@") ? acct.email : null;
  if (!email) return { emailed: false, pin, email: null, reason: "no_email" };
  const res = await sendMail(pinMessage({
    to: email, name: acct.name || acct.username, username: acct.username, pin,
    workplaces: p.workplaceNames, loginUrl: loginUrlFor(p.loginSlug), reset: p.reset,
  }));
  return res.sent ? { emailed: true, email } : { emailed: false, pin, email, reason: res.reason };
}
