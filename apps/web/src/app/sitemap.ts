import type { MetadataRoute } from "next";
import { SITE_URL } from "@timesprime/shared/config/site";

// /sitemap.xml (R1-09; bundled docs: file-conventions/metadata/sitemap.md): the reader site's own
// pages. Articles and sections join it in R2, with the article and section URLs that phase
// introduces (owner decision 6 of R0 v2); today's article URLs carry query strings.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
