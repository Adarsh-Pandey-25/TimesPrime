/**
 * The security headers both apps send on every response (R1-06), set in each app's
 * next.config.ts `headers()` (bundled docs: next-config-js/headers.md).
 *
 * The Content-Security-Policy follows the bundled guide's "Without Nonces" form
 * (guides/content-security-policy.md): a nonce needs every page rendered per request, and the
 * prerendered pages (about, privacy, terms, the sign-in page) would lose that, so scripts and
 * styles allow 'unsafe-inline' (the theme script in <head>, Next's own script-tag payloads). It is
 * sent as Content-Security-Policy-Report-Only first, so a source this list missed shows up in
 * the browser console without breaking a page; the switch to enforcing is a later, owner-approved
 * change. Clickjacking is blocked now by X-Frame-Options, which report-only cannot do.
 *
 * What the pages load: scripts, styles, fonts (next/font serves them) and images through the
 * image optimizer from the site itself; Sentry's ingest host for error reports; the MFA QR code
 * as a data: URL. The back office also shows admin-entered image URLs in a plain img
 * (ArticlesTable), so it passes `imgSrc: ["https:"]`.
 */
export interface SecurityHeaderOptions {
  /** next dev: React needs 'unsafe-eval' for its debug stacks (the guide's note). */
  dev: boolean;
  /** Image sources beyond the site itself, blob: and data:. */
  imgSrc?: readonly string[];
}

export function contentSecurityPolicy({ dev, imgSrc = [] }: SecurityHeaderOptions): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    ["img-src 'self' blob: data:", ...imgSrc].join(" "),
    "font-src 'self'",
    "connect-src 'self' https://*.sentry.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): { key: string; value: string }[] {
  return [
    // Two years, every subdomain. Not `preload`: that list is hard to leave, so it is an owner
    // decision for go-live. Browsers ignore the header on plain http, so local runs are unaffected.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(options) },
  ];
}
