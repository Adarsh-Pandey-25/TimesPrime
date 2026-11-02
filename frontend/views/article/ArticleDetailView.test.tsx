/**
 * The article view's links out to the publisher (F-005). Two of its four
 * sinks rendered `href={targetUrl}` guarded only by `targetUrl &&`. The page
 * now passes only a verified link, and every sink also requires
 * safePublisherHref: http(s), a named host, no credentials, no IP literal.
 */

import { render } from "@testing-library/react";
import ArticleDetailView from "./ArticleDetailView";
import { ThemeProvider } from "@/frontend/context/ThemeContext";
import { LanguageProvider } from "@/frontend/context/LanguageContext";

beforeEach(() => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;
});

function hrefsFor(targetUrl: string | undefined, content?: string[]) {
  const { container, unmount } = render(
    <ThemeProvider>
      <LanguageProvider>
        <ArticleDetailView
          slug="budget-passes"
          targetUrl={targetUrl}
          scrapedData={{ title: "Budget passes", content }}
          allArticles={[]}
        />
      </LanguageProvider>
    </ThemeProvider>
  );
  const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
  unmount();
  return hrefs;
}

const SCRAPED = ["The annual budget passed the lower house on Tuesday after a long debate about priorities."];

describe.each([
  ["with scraped content", SCRAPED],
  ["without scraped content", undefined],
])("ArticleDetailView %s", (_label, content) => {
  test("a publisher link is rendered at every sink", () => {
    const hrefs = hrefsFor("https://publisher.example/story", content);
    expect(hrefs.filter((h) => h === "https://publisher.example/story").length).toBeGreaterThanOrEqual(2);
  });

  test.each(["http://127.0.0.1/admin", "https://user:pw@publisher.example/story", "http://[::1]/", "ftp://publisher.example/story"])(
    "no sink links to %s",
    (bad) => {
      const hrefs = hrefsFor(bad, content);
      expect(hrefs.some((h) => h === bad || h.startsWith(bad.slice(0, 12)))).toBe(false);
    }
  );
});
