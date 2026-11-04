import "server-only";

import dns from "dns/promises";
import axios from "axios";
import { validateExternalUrl, type Resolver, type ValidatedAddress } from "@/backend/shared/validation/urlValidation";

/**
 * Fetches a publisher page through the SSRF guard, hop by hop (F-003).
 *
 * axios's default transport follows up to 21 redirects on its own and never
 * asks the guard about them, so a public URL that answered "302 Location:
 * http://169.254.169.254/" reached the metadata endpoint. Here axios never
 * follows a redirect (`maxRedirects: 0`); this loop does, at most
 * MAX_REDIRECTS times, validating every hop's URL exactly as the first.
 *
 * Each request connects only to the addresses its own validation returned:
 * the `lookup` hook answers with them instead of asking DNS again, which
 * closes the rebinding window between "validated" and "connected". TLS still
 * checks the certificate against the hostname, since only the address is
 * pinned. `proxy: false` keeps an environment proxy from carrying the
 * request anywhere else.
 */

/** The resolver the guard checks names with: the system resolver, every address. */
export const resolveHostname: Resolver = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

export const MAX_REDIRECTS = 5;

// F-010: the most of a response the scraper will read, counted after
// decompression. A heavy news page with inline scripts and JSON is 1–3 MB;
// 5 MB keeps those working and stops a hostile or broken page from filling
// memory. A GET sends no body, so its body limit is 0.
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;

/** The URL, or a redirect it led to, is not one the guard allows. The route answers 400. */
export class UnsafeTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeTargetError";
  }
}

interface FetchPageOptions {
  /** One budget for the whole chain of hops, not per hop. */
  timeoutMs: number;
  headers: Record<string, string>;
}

// The shape axios's async `lookup` resolves to: [entries, family?].
const pinnedLookup = (addresses: ValidatedAddress[]) => async () =>
  [addresses.map(({ address, family }) => ({ address, family }))] as [ValidatedAddress[]];

export async function fetchPage(url: string, { timeoutMs, headers }: FetchPageOptions): Promise<{ url: string; data: string }> {
  const deadline = Date.now() + timeoutMs;
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = await validateExternalUrl(current, resolveHostname);
    if (!check.ok || !check.addresses) {
      throw new UnsafeTargetError(`${hop === 0 ? "Invalid target URL" : "Invalid redirect target"}: ${check.reason}`);
    }

    const response = await axios.get<string>(current, {
      timeout: Math.max(1, deadline - Date.now()),
      headers,
      maxRedirects: 0,
      maxContentLength: MAX_PAGE_BYTES,
      maxBodyLength: 0,
      proxy: false,
      lookup: pinnedLookup(check.addresses),
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (response.status < 300) return { url: current, data: response.data };

    const location = response.headers?.location;
    if (!location) throw new Error(`HTTP ${response.status} without a Location header`);
    try {
      current = new URL(String(location), current).href;
    } catch {
      throw new UnsafeTargetError("Invalid redirect target: not a valid URL.");
    }
  }

  throw new UnsafeTargetError(`Invalid redirect target: more than ${MAX_REDIRECTS} redirects.`);
}
