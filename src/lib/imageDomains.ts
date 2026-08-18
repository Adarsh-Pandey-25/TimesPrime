/**
 * Hostnames next/image is allowed to fetch and optimize from. Shared
 * between next.config.ts (remotePatterns, enforced by the framework at the
 * /_next/image endpoint) and topicImages.ts (existingUrl validation before
 * ever handing a URL to <Image>) so the two can't drift out of sync.
 *
 * Kept deliberately small: article images come from hundreds of arbitrary
 * publisher domains via NewsData.io, which isn't a viable allowlist target
 * (same reasoning as the scraper's SSRF guard — see src/lib/urlValidation.ts).
 * Anything not on this list falls back to the curated Unsplash topic image
 * instead of being rejected outright.
 */
export const ALLOWED_IMAGE_HOSTNAMES = ["images.unsplash.com", "newsdata.io"] as const;

/** True only for https URLs whose hostname is on the allowlist (or a subdomain of one). */
export function isAllowedImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTNAMES.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}
