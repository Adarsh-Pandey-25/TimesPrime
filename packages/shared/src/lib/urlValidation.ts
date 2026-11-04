/**
 * SSRF guard for server-side fetches of user/attacker-influenced URLs
 * (e.g. the article scraper, which fetches whatever link the news API returns).
 *
 * A domain allowlist isn't viable here — the scraper legitimately needs to hit
 * arbitrary publisher domains from around the world. Instead this blocks the
 * actual attack surface: non-http(s) protocols, and any hostname that resolves
 * (directly or via DNS) to a private/loopback/link-local/reserved address,
 * which is what lets SSRF reach internal services or cloud metadata endpoints.
 *
 * On success it returns the addresses it checked, so the caller can connect
 * to exactly those (F-003): resolving again at connect time would let a
 * second DNS answer differ from the one validated (DNS rebinding).
 *
 * Shared, and safe in the browser (F-005): it imports nothing. A server
 * caller passes the DNS resolver in (src/server/services/scrape/fetchPage.ts
 * passes dns.lookup); without one, a hostname that needs resolving fails
 * closed. The article page's publisher links use safePublisherHref.
 */

export interface ValidatedAddress {
  address: string;
  family: 4 | 6;
}

export interface UrlValidationResult {
  ok: boolean;
  reason?: string;
  resolvedAddress?: string;
  /** On success: every address the hostname resolved to, all of them public. */
  addresses?: ValidatedAddress[];
}

/** Resolves a hostname to every address it has, like dns.lookup(name, { all: true }). */
export type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

// IPv4 ranges that must never be reachable from this server-side fetch.
const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (includes cloud metadata endpoints)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation (TEST-NET-1)
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation (TEST-NET-2)
  ["203.0.113.0", 24], // documentation (TEST-NET-3)
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, including the 255.255.255.255 broadcast
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return BLOCKED_IPV4_RANGES.some(([base, prefix]) => {
    const baseInt = ipv4ToInt(base);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  });
}

/** The 16 bytes of a valid IPv6 address, in any textual form (`::`, embedded dotted IPv4). */
function ipv6ToBytes(ip: string): number[] {
  let text = ip.toLowerCase();
  const tail: number[] = [];
  const dotted = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    tail.push(...dotted[1].split(".").map(Number));
    text = text.slice(0, -dotted[1].length) + "0:0";
  }
  const [head, rest] = text.split("::");
  const groups = (part: string | undefined) => (part ? part.split(":").filter(Boolean) : []);
  const left = groups(head);
  const right = rest === undefined ? [] : groups(rest);
  const missing = 8 - left.length - right.length;
  const all = [...left, ...Array(rest === undefined ? 0 : missing).fill("0"), ...right];
  const bytes = all.flatMap((group) => {
    const value = parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
  if (tail.length) bytes.splice(12, 4, ...tail);
  return bytes;
}

const embeddedIPv4 = (bytes: number[], at: number) => bytes.slice(at, at + 4).join(".");
const startsWith = (bytes: number[], prefix: number[]) => prefix.every((b, i) => bytes[i] === b);

function isBlockedIPv6(ip: string): boolean {
  const b = ipv6ToBytes(ip);
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);

  if (zeros(0, 15) && (b[15] === 0 || b[15] === 1)) return true; // :: unspecified, ::1 loopback
  if (zeros(0, 10) && b[10] === 0xff && b[11] === 0xff) return isBlockedIPv4(embeddedIPv4(b, 12)); // ::ffff:0:0/96 IPv4-mapped
  if (zeros(0, 12)) return isBlockedIPv4(embeddedIPv4(b, 12)); // ::/96 IPv4-compatible (deprecated)
  if (startsWith(b, [0x00, 0x64, 0xff, 0x9b]) && zeros(4, 12)) return isBlockedIPv4(embeddedIPv4(b, 12)); // 64:ff9b::/96 NAT64
  if (startsWith(b, [0x00, 0x64, 0xff, 0x9b, 0x00, 0x01])) return true; // 64:ff9b:1::/48 local-use NAT64
  if (startsWith(b, [0x20, 0x02])) return isBlockedIPv4(embeddedIPv4(b, 2)); // 2002::/16 6to4
  if (startsWith(b, [0x20, 0x01, 0x00, 0x00])) return true; // 2001::/32 Teredo: the embedded address is obfuscated
  if (startsWith(b, [0x20, 0x01, 0x0d, 0xb8])) return true; // 2001:db8::/32 documentation
  if (startsWith(b, [0x01, 0x00]) && zeros(2, 8)) return true; // 100::/64 discard-only
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // fec0::/10 site-local (deprecated)
  if (b[0] === 0xff) return true; // ff00::/8 multicast
  return false;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** 4 or 6 for an IP literal, 0 otherwise. A pure stand-in for net.isIP, so this module runs in a browser. */
function ipFamily(value: string): 0 | 4 | 6 {
  if (IPV4.test(value)) return 4;
  const ip = value.replace(/%.*$/, ""); // a zone id, as in fe80::1%eth0
  if (!/^[0-9a-f:.]+$/i.test(ip) || !ip.includes(":") || (ip.match(/::/g) ?? []).length > 1) return 0;
  const dotted = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted && !IPV4.test(dotted[1])) return 0;
  const groups = ip.replace(/(\d+\.\d+\.\d+\.\d+)$/, "0:0").split(":");
  if (groups.some((g) => g.length > 4)) return 0;
  const count = groups.filter(Boolean).length;
  return (ip.includes("::") ? count < 8 : count === 8) ? 6 : 0;
}

function isBlockedIp(ip: string): boolean {
  const family = ipFamily(ip);
  if (family === 4) return isBlockedIPv4(ip);
  if (family === 6) return isBlockedIPv6(ip.replace(/%.*$/, ""));
  return true; // unrecognized format — fail closed
}

type Shape = { ok: true; url: URL; hostname: string } | { ok: false; reason: string };

/** The checks that need no network: http(s), no credentials, not localhost. */
function checkShape(rawUrl: string | undefined | null): Shape {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl ?? "");
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: `Protocol "${parsed.protocol}" is not allowed.` };
  }

  // A publisher link never needs credentials, and userinfo is where URL
  // parsers have disagreed about which part is the host.
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URLs with credentials are not allowed." };
  }

  // `new URL()` keeps the brackets around an IPv6 literal.
  const hostname = parsed.hostname.replace(/^\[(.*)\]$/, "$1");

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, reason: "Localhost is not allowed." };
  }
  return { ok: true, url: parsed, hostname };
}

/**
 * The href for a link out to a publisher, or null (F-005): an http(s) URL
 * with a dotted hostname, no credentials, and no IP literal or localhost.
 * Shape only. Whether the URL is really a publisher's article is decided on
 * the server, against the stored articles, before it reaches the page.
 */
export function safePublisherHref(rawUrl: string | undefined | null): string | null {
  const shape = checkShape(rawUrl);
  if (!shape.ok || ipFamily(shape.hostname) !== 0 || !shape.hostname.includes(".")) return null;
  return shape.url.href;
}

/**
 * Validates a URL is safe to fetch server-side: http(s) only, no credentials,
 * and its hostname must not resolve to a private/internal address. Resolves
 * DNS itself (rather than trusting the literal hostname) to defend against
 * DNS-rebinding, where a public-looking domain resolves to an internal IP.
 */
export async function validateExternalUrl(rawUrl: string, resolve?: Resolver): Promise<UrlValidationResult> {
  const shape = checkShape(rawUrl);
  if (!shape.ok) return { ok: false, reason: shape.reason };
  const { hostname } = shape;

  // If the hostname is already a literal IP, check it directly.
  const literalFamily = ipFamily(hostname);
  if (literalFamily) {
    if (isBlockedIp(hostname)) {
      return { ok: false, reason: "Target resolves to a private/internal address.", resolvedAddress: hostname };
    }
    return { ok: true, addresses: [{ address: hostname, family: literalFamily as 4 | 6 }] };
  }

  // Otherwise resolve DNS and check every returned address — a hostname can
  // have multiple A/AAAA records, and an attacker only needs one to point
  // internally.
  let addresses: ValidatedAddress[];
  try {
    if (!resolve) throw new Error("no resolver");
    const results = await resolve(hostname);
    addresses = results.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
  } catch {
    return { ok: false, reason: "Could not resolve hostname." };
  }

  if (addresses.length === 0) {
    return { ok: false, reason: "Hostname did not resolve to any address." };
  }

  const blocked = addresses.find((a) => isBlockedIp(a.address));
  if (blocked) {
    return { ok: false, reason: "Target resolves to a private/internal address.", resolvedAddress: blocked.address };
  }

  return { ok: true, addresses };
}
