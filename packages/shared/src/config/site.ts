/**
 * The reader site's public origin (R1-09): canonical links, the sitemap, robots.txt and Open
 * Graph URLs resolve against it (the root layout's `metadataBase`). Next inlines
 * NEXT_PUBLIC_APP_URL at build time, so each environment's image is built with its own (the
 * Dockerfile's build argument). The fallback is the public domain, timesprime247.com (the owner's
 * senior, 16 Nov 2026).
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://timesprime247.com").replace(/\/+$/, "");

/**
 * The publisher's contact details (R3; the owner's senior, 16 Nov 2026), shown by the grievance,
 * contact, privacy and terms pages. One person is the Grievance Officer under the IT Rules, 2021
 * and the CERT-In point of contact, and the one confirmed mailbox serves every enquiry (owner,
 * 17 Nov 2026). No phone number is published or kept in the repository.
 */
export const GRIEVANCE_OFFICER = {
  name: "Adarsh Pandey",
  email: "adarsh@timesprime247.com",
} as const;

/** The one mailbox the site shows for every enquiry until others exist. */
export const CONTACT_EMAIL = GRIEVANCE_OFFICER.email;

/** The office's postal address, by part, as schema.org's PostalAddress names them (R2's markup). */
export const OFFICE_POSTAL_ADDRESS = {
  streetAddress: "704A-704B, Iris Tech Park, Sector 48",
  addressLocality: "Gurgaon",
  addressRegion: "Haryana",
  postalCode: "122018",
  addressCountry: "IN",
} as const;

/** The office's postal address, one line per entry, for the pages. */
export const OFFICE_ADDRESS = ["704A-704B, Iris Tech Park", "Sector 48", "Gurgaon 122018", "Haryana, India"] as const;

/** The publisher's name, as the pages and the structured data give it. */
export const PUBLISHER_NAME = "TimesPrime";

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
