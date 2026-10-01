// Branded staff addresses: the root of each host shows that company's portal.
// Used by next.config.ts (rewrites) and for login links in e-mails.
export const BRANDED_HOSTS: Record<string, string> = {
  dillon: "staff.dillon.is",
  "pablo-discobar": "staff.discobar.is",
};

/** Home of the product: landing page, sign-up (/byrja) and every company at /{slug}. */
export const PRODUCT_HOST = process.env.NEXT_PUBLIC_PRODUCT_HOST || "timavordur.bling.is";

/** Login URL for a company: its branded host if any, else https://PRODUCT_HOST/<slug>. */
export function loginUrlFor(slug: string): string {
  const host = BRANDED_HOSTS[slug];
  return host ? `https://${host}/` : `https://${PRODUCT_HOST}/${slug}`;
}
