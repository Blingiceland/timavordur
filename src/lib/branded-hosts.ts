// Branded staff addresses: the root of each host shows that company's portal.
// Used by next.config.ts (rewrites) and for login links in e-mails.
export const BRANDED_HOSTS: Record<string, string> = {
  dillon: "staff.dillon.is",
  "pablo-discobar": "staff.discobar.is",
};

/** Login URL for a company: its branded host if any, else <origin>/<slug>. */
export function loginUrlFor(slug: string, fallbackOrigin: string): string {
  const host = BRANDED_HOSTS[slug];
  return host ? `https://${host}/` : `${fallbackOrigin.replace(/\/$/, "")}/${slug}`;
}
