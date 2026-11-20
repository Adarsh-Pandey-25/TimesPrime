import { liveText, type LiveFeed } from "../config/liveBlog";
import { CONTACT_EMAIL, GRIEVANCE_OFFICER, OFFICE_POSTAL_ADDRESS, PUBLISHER_NAME, SITE_URL } from "../config/site";

/**
 * The reader site's structured data (R2, approved by the owner on 17 Nov 2026): who publishes it,
 * as schema.org's NewsMediaOrganization, and the site itself, as WebSite, on the home page and
 * About. Outside stories carry none: they are not ours, and their pages are noindex. NewsArticle
 * comes with our own stories (Phase F); a live blog carries LiveBlogPosting (Panel 3, M3).
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
/** The longest headline a live update's markup carries (Google's guideline for an article's). */
const MARKUP_HEADLINE_MAX = 110;

/**
 * A live blog as schema.org's LiveBlogPosting (Panel 3 design §5, M3): its coverage from the first
 * publication to its end, and its updates as liveBlogUpdate, each with its own address on the page.
 * An update without a headline is named by its first words. Every value is what the page shows.
 */
export function liveBlogPosting(
  story: { headline: string; dek: string | null; language: "en" | "hi"; path: string; firstPublishedAt: string | null; publishedAt: string | null },
  feed: LiveFeed
): Record<string, unknown> {
  const url = `${SITE_URL}${story.path}`;
  const latest = feed.updates[0]?.editedAt ?? feed.updates[0]?.postedAt ?? story.publishedAt;
  const name = (text: string) => ([...text].length > MARKUP_HEADLINE_MAX ? `${[...text].slice(0, MARKUP_HEADLINE_MAX - 1).join("")}…` : text);
  return {
    "@context": "https://schema.org",
    "@type": "LiveBlogPosting",
    "@id": `${url}#live`,
    url,
    headline: name(story.headline),
    ...(story.dek ? { description: story.dek } : {}),
    inLanguage: story.language === "hi" ? "hi-IN" : "en-IN",
    ...(story.firstPublishedAt ? { datePublished: story.firstPublishedAt, coverageStartTime: story.firstPublishedAt } : {}),
    ...(latest ? { dateModified: latest } : {}),
    ...(feed.endedAt ? { coverageEndTime: feed.endedAt } : {}),
    publisher: { "@id": ORGANIZATION_ID, "@type": "NewsMediaOrganization", name: PUBLISHER_NAME },
    liveBlogUpdate: feed.updates.map((u) => ({
      "@type": "BlogPosting",
      "@id": `${url}#update-${u.id}`,
      url: `${url}#update-${u.id}`,
      headline: name(u.headline ?? liveText(u.blocks)),
      datePublished: u.postedAt,
      ...(u.editedAt ? { dateModified: u.editedAt } : {}),
      articleBody: liveText(u.blocks),
    })),
  };
}

export function jsonLdText(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
