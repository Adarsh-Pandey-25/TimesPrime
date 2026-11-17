/**
 * @jest-environment node
 *
 * R2: the publisher and the site as JSON-LD, from the site config only.
 */

import { jsonLdText, siteStructuredData } from "./structuredData";

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
