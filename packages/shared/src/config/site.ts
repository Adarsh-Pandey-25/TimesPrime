/**
 * The reader site's public origin (R1-09): canonical links, the sitemap, robots.txt and Open
 * Graph URLs resolve against it (the root layout's `metadataBase`). Next inlines
 * NEXT_PUBLIC_APP_URL at build time, so each environment's image is built with its own (the
 * Dockerfile's build argument). The fallback is the one the article page always used.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://timesprimenews.com").replace(/\/+$/, "");

/**
 * True for a build that search engines must not index: staging, or any copy that is not the
 * public site. Set NEXT_PUBLIC_SITE_NOINDEX=1 when building it: robots.txt then disallows
 * everything and every response carries X-Robots-Tag: noindex.
 *
 * NEXT_PUBLIC_, though it is no secret to keep, so that Next inlines it at build time: the shared
 * cache handler (apps/web/cache-handler.mjs) does not read the build's prerendered files, so
 * robots.txt renders again on its first request, and a plain variable set only for the build was
 * unset by then (measured: the staging image served "Allow: /"). Inlined, the prerender, that
 * render and next.config.ts's headers all see the build's value.
 */
export function siteNoindex(): boolean {
  return process.env.NEXT_PUBLIC_SITE_NOINDEX === "1";
}
