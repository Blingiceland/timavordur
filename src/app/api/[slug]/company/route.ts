import { NextRequest } from "next/server";
import { getCompanyBySlug } from "@/lib/auth";
import { groupCompanies } from "@/lib/server/group";
import { fail, handle, json } from "@/lib/server/http";

// GET /api/[slug]/company — public: name, registration fields and the workplaces
// in the same group (for the "where do you work?" choice at sign-up).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return handle("company GET", { slug }, async () => {
    const company = await getCompanyBySlug(slug);
    if (!company) return fail("not_found", 404);
    const group = await groupCompanies(company.groupId);
    return json({
      id: company.id, name: company.name, slug: company.slug,
      registrationFields: company.registrationFields, requireApproval: company.requireApproval,
      groupCompanies: group.map((c) => ({ slug: c.slug, name: c.name })),
    });
  });
}
