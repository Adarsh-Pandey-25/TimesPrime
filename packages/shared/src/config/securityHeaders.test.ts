/**
 * @jest-environment node
 *
 * The security headers both apps send (R1-06), and that both apps' configs send them.
 */

import fs from "fs";
import path from "path";
import { contentSecurityPolicy, securityHeaders } from "./securityHeaders";

const byName = (headers: { key: string; value: string }[]) => Object.fromEntries(headers.map((h) => [h.key, h.value]));

test("the fixed headers: HSTS two years with subdomains, nosniff, no framing, the referrer and permissions policies", () => {
  expect(byName(securityHeaders({ dev: false }))).toMatchObject({
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  });
});

test("the CSP is report-only for now, never enforcing", () => {
  const names = securityHeaders({ dev: false }).map((h) => h.key);
  expect(names).toContain("Content-Security-Policy-Report-Only");
  expect(names).not.toContain("Content-Security-Policy");
});

test("production: no 'unsafe-eval'; the site, Sentry, and nothing else", () => {
  const csp = contentSecurityPolicy({ dev: false });
  expect(csp).not.toContain("unsafe-eval");
  expect(csp.split("; ")).toEqual([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self' https://*.sentry.io",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]);
});

test("next dev adds 'unsafe-eval'; extra image sources are appended", () => {
  expect(contentSecurityPolicy({ dev: true })).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  expect(contentSecurityPolicy({ dev: false, imgSrc: ["https:"] })).toContain("img-src 'self' blob: data: https:");
});

test.each([
  ["web", "securityHeaders({ dev: process.env.NODE_ENV !== \"production\" })"],
  ["admin", "securityHeaders({ dev: process.env.NODE_ENV !== \"production\", imgSrc: [\"https:\"] })"],
])("%s sends them on every path", (app, call) => {
  // Read as text: importing the config would load the root env files into the test process.
  const config = fs.readFileSync(path.join(__dirname, "..", "..", "..", "..", "apps", app, "next.config.ts"), "utf8");
  expect(config).toContain(`return [{ source: "/(.*)", headers: ${call} }];`);
});
