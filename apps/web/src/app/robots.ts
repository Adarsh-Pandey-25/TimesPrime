import type { MetadataRoute } from "next";
import { SITE_URL, siteNoindex } from "@timesprime/shared/config/site";

// /robots.txt (R1-09; bundled docs: file-conventions/metadata/robots.md). One file for the whole
// domain: CloudFront sends /robots.txt to the reader site, so it also covers the back office's
// paths. A NEXT_PUBLIC_SITE_NOINDEX build (staging) disallows everything.
export default function robots(): MetadataRoute.Robots {
  if (siteNoindex()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The feed's JSON, the back office and its files, and the reader's own bookmarks page.
      disallow: ["/api/", "/admin", "/admin-assets/", "/saved"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
