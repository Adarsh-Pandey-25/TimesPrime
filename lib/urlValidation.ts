/**
 * SSRF guard for server-side fetches of user/attacker-influenced URLs
 * (e.g. the article scraper, which fetches whatever link the news API returns).
 *
 * A domain allowlist isn't viable here — the scraper legitimately needs to hit
 * arbitrary publisher domains from around the world. Instead this blocks the
 * actual attack surface: non-http(s) protocols, and any hostname that resolves
 * (directly or via DNS) to a private/loopback/link-local/reserved address,
 * which is what lets SSRF reach internal services or cloud metadata endpoints.
 */

import dns from "dns/promises";
import net from "net";

export interface UrlValidationResult {
  ok: boolean;
  reason?: string;
  resolvedAddress?: string;
}

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
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
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

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" || // loopback
    lower === "::" || // unspecified
    lower.startsWith("fe80:") || // link-local
    lower.startsWith("fc") || // unique local fc00::/7
    lower.startsWith("fd") || // unique local fc00::/7
    lower.startsWith("::ffff:127.") || // IPv4-mapped loopback
    lower.startsWith("::ffff:169.254.") // IPv4-mapped link-local
  );
}

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIPv4(ip);
  if (net.isIPv6(ip)) return isBlockedIPv6(ip);
  return true; // unrecognized format — fail closed
}

/**
 * Validates a URL is safe to fetch server-side: http(s) only, and its
 * hostname must not resolve to a private/internal address. Resolves DNS
 * itself (rather than trusting the literal hostname) to defend against
 * DNS-rebinding, where a public-looking domain resolves to an internal IP.
 */
export async function validateExternalUrl(rawUrl: string): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Not a valid URL." };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: `Protocol "${parsed.protocol}" is not allowed.` };
  }

  const hostname = parsed.hostname;

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    return { ok: false, reason: "Localhost is not allowed." };
  }

  // If the hostname is already a literal IP, check it directly.
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      return { ok: false, reason: "Target resolves to a private/internal address.", resolvedAddress: hostname };
    }
    return { ok: true };
  }

  // Otherwise resolve DNS and check every returned address — a hostname can
  // have multiple A/AAAA records, and an attacker only needs one to point
  // internally.
  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = results.map((r) => r.address);
  } catch {
    return { ok: false, reason: "Could not resolve hostname." };
  }

  if (addresses.length === 0) {
    return { ok: false, reason: "Hostname did not resolve to any address." };
  }

  const blocked = addresses.find(isBlockedIp);
  if (blocked) {
    return { ok: false, reason: "Target resolves to a private/internal address.", resolvedAddress: blocked };
  }

  return { ok: true };
}
