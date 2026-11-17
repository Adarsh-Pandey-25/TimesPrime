import { jsonLdText, siteStructuredData } from "@timesprime/shared/lib/structuredData";

/** The publisher and the site as JSON-LD (R2), for the home page and About. */
export default function SiteJsonLd() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(siteStructuredData()) }} />;
}
