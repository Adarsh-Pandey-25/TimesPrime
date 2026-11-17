import { CONTACT_EMAIL, GRIEVANCE_OFFICER, OFFICE_POSTAL_ADDRESS, PUBLISHER_NAME, SITE_URL } from "../config/site";

/**
 * The reader site's structured data (R2, approved by the owner on 17 Nov 2026): who publishes it,
 * as schema.org's NewsMediaOrganization, and the site itself, as WebSite, on the home page and
 * About. Outside stories carry none: they are not ours, and their pages are noindex. NewsArticle
 * comes with our own stories (Phase F).
 *
 * Every value comes from the site config (site.ts), never from a request or the database.
 */

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

export function newsMediaOrganization(): Record<string, unknown> {
  return {
    "@type": "NewsMediaOrganization",
    "@id": ORGANIZATION_ID,
    name: PUBLISHER_NAME,
    url: `${SITE_URL}/`,
    logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-light.png`, width: 1574, height: 260 },
    email: CONTACT_EMAIL,
    address: { "@type": "PostalAddress", ...OFFICE_POSTAL_ADDRESS },
    // No phone number is published (R3). The Grievance Officer is the contact the IT Rules require.
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "grievance officer",
        name: GRIEVANCE_OFFICER.name,
        email: GRIEVANCE_OFFICER.email,
        url: `${SITE_URL}/grievance`,
        areaServed: "IN",
        availableLanguage: ["English", "Hindi"],
      },
    ],
  };
}

export function webSite(): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: PUBLISHER_NAME,
    url: `${SITE_URL}/`,
    inLanguage: ["en", "hi"],
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/** The publisher and the site, as one JSON-LD graph. */
export function siteStructuredData(): Record<string, unknown> {
  return { "@context": "https://schema.org", "@graph": [newsMediaOrganization(), webSite()] };
}

/**
 * The JSON for a <script type="application/ld+json">. "<" is escaped as <, so no value can
 * close the script element (bundled docs: guides/json-ld.md); JSON parsers read it back unchanged.
 */
export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
