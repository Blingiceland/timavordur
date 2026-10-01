// Exact IP / CIDR matching for the punch-clock network restriction.
//
// The client address is read ONLY from a header that the configured trusted
// proxy sets itself (CLIENT_IP_SOURCE). A client-supplied X-Forwarded-For is
// never trusted on its own. If the address cannot be determined, or the
// restriction is enabled but has no valid entries, access is refused.

export interface ParsedIp {
  version: 4 | 6;
  bytes: Uint8Array;
}

function parseV4(s: string): Uint8Array | null {
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  const out = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const p = parts[i];
    if (!/^\d{1,3}$/.test(p) || (p.length > 1 && p.startsWith("0"))) return null;
    const n = Number(p);
    if (n > 255) return null;
    out[i] = n;
  }
  return out;
}

function parseV6(input: string): Uint8Array | null {
  let s = input;
  const pct = s.indexOf("%");
  if (pct >= 0) s = s.slice(0, pct); // drop zone id
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (!s.includes(":")) return null;

  // Embedded IPv4 tail (e.g. ::ffff:192.0.2.1)
  let tailV4: Uint8Array | null = null;
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    tailV4 = parseV4(tail);
    if (!tailV4) return null;
    s = s.slice(0, lastColon + 1) + "0:0";
  }

  const dbl = s.split("::");
  if (dbl.length > 2) return null;
  const head = dbl[0] ? dbl[0].split(":") : [];
  const rest = dbl.length === 2 && dbl[1] ? dbl[1].split(":") : [];
  const groups = dbl.length === 2 ? head.length + rest.length : head.length;
  if (dbl.length === 1 && groups !== 8) return null;
  if (dbl.length === 2 && groups > 7) return null;
  const all = dbl.length === 2 ? [...head, ...Array(8 - groups).fill("0"), ...rest] : head;
  const out = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const g = all[i];
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    out[i * 2] = n >> 8;
    out[i * 2 + 1] = n & 0xff;
  }
  if (tailV4) out.set(tailV4, 12);
  return out;
}

export function parseIp(raw: string | null | undefined): ParsedIp | null {
  if (!raw) return null;
  const s = raw.trim();
  const v4 = parseV4(s);
  if (v4) return { version: 4, bytes: v4 };
  const v6 = parseV6(s);
  if (!v6) return null;
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) is treated as the IPv4 address.
  const mapped = v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff;
  return mapped ? { version: 4, bytes: v6.slice(12) } : { version: 6, bytes: v6 };
}

export interface Cidr extends ParsedIp {
  prefix: number;
}

export function parseCidr(raw: string): Cidr | null {
  const s = raw.trim();
  const slash = s.indexOf("/");
  const ip = parseIp(slash >= 0 ? s.slice(0, slash) : s);
  if (!ip) return null;
  const max = ip.version === 4 ? 32 : 128;
  let prefix = max;
  if (slash >= 0) {
    const p = s.slice(slash + 1);
    if (!/^\d{1,3}$/.test(p)) return null;
    prefix = Number(p);
    if (prefix > max) return null;
    // An IPv4-mapped IPv6 CIDR (::ffff:a.b.c.d/120) maps onto the IPv4 prefix.
    if (ip.version === 4 && s.slice(0, slash).includes(":")) {
      if (prefix < 96) return null;
      prefix -= 96;
    }
  }
  return { ...ip, prefix };
}

export function ipInCidr(ip: ParsedIp, cidr: Cidr): boolean {
  if (ip.version !== cidr.version) return false;
  let bits = cidr.prefix;
  for (let i = 0; i < ip.bytes.length && bits > 0; i++) {
    const take = Math.min(8, bits);
    const mask = (0xff << (8 - take)) & 0xff;
    if ((ip.bytes[i] & mask) !== (cidr.bytes[i] & mask)) return false;
    bits -= take;
  }
  return true;
}

export type ClientIpSource = "vercel" | "x-real-ip" | "none";

/**
 * Client address from the trusted proxy. On Vercel the edge network sets
 * x-forwarded-for / x-real-ip itself; other deployments must configure
 * CLIENT_IP_SOURCE explicitly. Unknown → null (restriction then refuses).
 */
export function getClientIp(headers: Headers, source?: ClientIpSource): string | null {
  const mode: ClientIpSource =
    source ?? ((process.env.CLIENT_IP_SOURCE as ClientIpSource | undefined) || (process.env.VERCEL ? "vercel" : "none"));
  if (mode === "none") return null;
  const candidates =
    // Vercel overwrites x-forwarded-for with the real client address and does not
    // forward external values (https://vercel.com/docs/headers/request-headers).
    mode === "vercel" ? [headers.get("x-forwarded-for"), headers.get("x-real-ip")] : [headers.get("x-real-ip")];
  for (const c of candidates) {
    const first = c?.split(",")[0]?.trim();
    if (first && parseIp(first)) return first;
  }
  return null;
}

export interface IpRestrictionConfig {
  enabled?: boolean;
  allowedIPs?: unknown;
}

export type IpCheck =
  | { allowed: true }
  | { allowed: false; reason: "ip_restricted" | "ip_restriction_misconfigured" | "client_ip_unknown" };

export function checkIpRestriction(cfg: IpRestrictionConfig | null | undefined, clientIp: string | null): IpCheck {
  if (!cfg?.enabled) return { allowed: true };
  const list = Array.isArray(cfg.allowedIPs) ? cfg.allowedIPs : [];
  const cidrs = list.map((x) => (typeof x === "string" ? parseCidr(x) : null));
  if (cidrs.length === 0 || cidrs.some((c) => c === null)) return { allowed: false, reason: "ip_restriction_misconfigured" };
  const ip = parseIp(clientIp);
  if (!ip) return { allowed: false, reason: "client_ip_unknown" };
  return (cidrs as Cidr[]).some((c) => ipInCidr(ip, c)) ? { allowed: true } : { allowed: false, reason: "ip_restricted" };
}

/** Validate and normalise an allow-list for storage; returns null if any entry is invalid. */
export function normaliseAllowList(entries: unknown): string[] | null {
  if (!Array.isArray(entries) || entries.length > 50) return null;
  const out: string[] = [];
  for (const e of entries) {
    if (typeof e !== "string" || !parseCidr(e)) return null;
    out.push(e.trim());
  }
  return out;
}
