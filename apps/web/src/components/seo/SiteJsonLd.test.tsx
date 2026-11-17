/**
 * @jest-environment node
 *
 * R2: the publisher's JSON-LD script (the pages that carry it: app/structuredData.test.tsx).
 */

import { renderToStaticMarkup } from "react-dom/server";
import SiteJsonLd from "./SiteJsonLd";

test("the script holds the organization and the site", () => {
  const html = renderToStaticMarkup(<SiteJsonLd />);
  const match = /^<script type="application\/ld\+json">(.*)<\/script>$/.exec(html);
  const data = JSON.parse(match![1]) as { "@graph": Array<{ "@type": string }> };
  expect(data["@graph"].map((node) => node["@type"])).toEqual(["NewsMediaOrganization", "WebSite"]);
});
