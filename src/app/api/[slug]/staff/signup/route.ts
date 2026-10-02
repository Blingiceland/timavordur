import { fail } from "@/lib/server/http";

// Self sign-up without Google has been removed: new staff register with their
// Google account (POST /api/[slug]/staff/register) and receive a PIN by e-mail
// when approved. Admins can still create accounts in the staff tab.
export async function POST() {
  return fail("google_signup_required", 410);
}
