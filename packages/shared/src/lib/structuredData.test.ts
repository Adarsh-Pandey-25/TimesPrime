/**
 * @jest-environment node
 *
 * R2: the publisher and the site as JSON-LD, from the site config only.
 */

import { jsonLdText, liveBlogPosting, siteStructuredData } from "./structuredData";

test("a NewsMediaOrganization with the name, logo, email, address and the Grievance Officer", () => {
  const [organization] = siteStructuredData()["@graph"] as Array<Record<string, unknown>>;
  expect(organization).toMatchObject({
    "@type": "NewsMediaOrganization",
    "@id": "https://timesprime247.com/#organization",
    name: "TimesPrime",
    url: "https://timesprime247.com/",
    logo: { "@type": "ImageObject", url: "https://timesprime247.com/logo-light.png" },
    email: "adarsh@timesprime247.com",
    address: {
      "@type": "PostalAddress",
      streetAddress: "704A-704B, Iris Tech Park, Sector 48",
      addressLocality: "Gurgaon",
      addressRegion: "Haryana",
      postalCode: "122018",
      addressCountry: "IN",
    },
    contactPoint: [expect.objectContaining({ contactType: "grievance officer", name: "Adarsh Pandey", url: "https://timesprime247.com/grievance" })],
  });
});

test("a WebSite in English and Hindi, published by the organization", () => {
  const data = siteStructuredData();
  expect(data["@context"]).toBe("https://schema.org");
  const [, site] = data["@graph"] as Array<Record<string, unknown>>;
  expect(site).toEqual({
    "@type": "WebSite",
    "@id": "https://timesprime247.com/#website",
    name: "TimesPrime",
    url: "https://timesprime247.com/",
    inLanguage: ["en", "hi"],
    publisher: { "@id": "https://timesprime247.com/#organization" },
  });
});

test("no phone number is published", () => {
  expect(JSON.stringify(siteStructuredData())).not.toMatch(/telephone|phone|\+91/i);
});

test("the script text cannot close its element, and parses back unchanged", () => {
  const data = { name: "</script><script>alert(1)</script>" };
  const text = jsonLdText(data);
  expect(text).not.toContain("<");
  expect(JSON.parse(text)).toEqual(data);
});

// Panel 3, M3: a live blog's markup.
describe("LiveBlogPosting", () => {
  const STORY = { headline: "Results live", dek: null, language: "hi" as const, path: "/hi/india/results-live-55", firstPublishedAt: "2026-11-20T03:00:00Z", publishedAt: "2026-11-20T03:00:00Z" };
  const update = (id: string, headline: string | null, text: string) => ({
    id, headline, blocks: [{ kind: "p" as const, runs: [{ text }] }], keyEvent: false, pinned: false, postedAt: `2026-11-20T0${id}:00:00Z`, editedAt: null, time: "t",
  });

  test("while live: no end, modified at the newest update, each update named by its headline or its first words", () => {
    const data = liveBlogPosting(STORY, { endedAt: null, updates: [update("5", null, "x".repeat(200)), update("4", "Counting", "Postal ballots.")] });
    expect(data).toMatchObject({ "@type": "LiveBlogPosting", inLanguage: "hi-IN", coverageStartTime: "2026-11-20T03:00:00Z", dateModified: "2026-11-20T05:00:00Z" });
    expect(data).not.toHaveProperty("coverageEndTime");
    expect(data).not.toHaveProperty("description");
    const updates = data.liveBlogUpdate as Array<Record<string, string>>;
    expect([...updates[0].headline].length).toBe(110);
    expect(updates[0].headline.endsWith("…")).toBe(true);
    expect(updates[1]).toMatchObject({ headline: "Counting", articleBody: "Postal ballots.", url: expect.stringMatching(/\/hi\/india\/results-live-55#update-4$/) });
  });

  test("its markup cannot close the script element", () => {
    const text = jsonLdText(liveBlogPosting(STORY, { endedAt: "2026-11-20T09:00:00Z", updates: [update("4", "</script><b>", "x")] }));
    expect(text).not.toContain("</script>");
    expect(JSON.parse(text).coverageEndTime).toBe("2026-11-20T09:00:00Z");
  });
});
