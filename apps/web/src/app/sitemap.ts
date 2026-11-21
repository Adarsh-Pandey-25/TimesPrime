import type { MetadataRoute } from "next";
import { SITE_URL } from "@timesprime/shared/config/site";
import { SECTION_IDS } from "@timesprime/shared/config/sections";

// /sitemap.xml (R1-09; bundled docs: file-conventions/metadata/sitemap.md): the reader site's own
// pages, with R2's section pages. Outside stories stay out: their pages are noindex (Phase B). Our
// own stories, with news sitemaps, come with Phase F.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    ...SECTION_IDS.map((section) => ({ url: `${SITE_URL}/${section}`, changeFrequency: "hourly" as const, priority: 0.8 })),
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/grievance`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/corrections`, changeFrequency: "daily", priority: 0.3 },
  ];
}
