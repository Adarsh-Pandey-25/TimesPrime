/**
 * Where the back office's own files are served from (R1-04). On AWS one CloudFront distribution
 * serves both apps (one flat-rate plan covers one distribution), so a path decides which service a
 * request reaches. Both apps would build their chunks at /_next/... and their public files at the
 * root, and the behaviour for those paths can only point at one service: the reader site. So the
 * back office builds every chunk, CSS and font URL under this prefix (apps/admin/next.config.ts
 * `assetPrefix`), and CloudFront sends /admin-assets/* to the admin service with /admin* and
 * /api/admin/*.
 *
 * Next maps /admin-assets/_next/... back to its build files itself, so the admin server answers
 * those paths with nothing copied. `assetPrefix` does not apply to public/ files (bundled docs:
 * next-config-js/assetPrefix.md), and Next serves them only at their own path (measured: the
 * prefixed path of a root public file is a 404). So the back office's public files live in
 * apps/admin/public/admin-assets/, and a page links them by that path (the favicon, in
 * apps/admin/src/app/layout.tsx).
 *
 * Here, not in apps/admin, because next.config.ts imports it: the config loader resolves package
 * imports, not a relative one into the app's src/ (Jest's next/jest load of the config fails on
 * it). scripts/check-asset-prefix.mjs fails the build check if a page links /_next/ without it.
 */
export const ADMIN_ASSET_PREFIX = "/admin-assets";
