/**
 * @jest-environment node
 *
 * R2: the home page and About carry the publisher's JSON-LD (components/seo/SiteJsonLd.tsx);
 * other pages do not.
 */

jest.mock("@/components/news/Header", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/news/Footer", () => ({ __esModule: true, default: () => null }));
jest.mock("./_feed/ArticlesFeed", () => ({ __esModule: true, default: () => null }));

import { renderToStaticMarkup } from "react-dom/server";
import AboutPage from "./about/page";
import HomePage from "./(feed)/page";
import TermsOfUsePage from "./terms/page";

const scripts = (html: string) => html.match(/<script type="application\/ld\+json">/g) ?? [];

test("the home page and About carry it once; Terms does not", async () => {
  expect(scripts(renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) })))).toHaveLength(1);
  expect(scripts(renderToStaticMarkup(<AboutPage />))).toHaveLength(1);
  expect(scripts(renderToStaticMarkup(<TermsOfUsePage />))).toHaveLength(0);
});
