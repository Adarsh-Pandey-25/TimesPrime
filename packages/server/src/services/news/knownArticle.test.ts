/**
 * @jest-environment node
 *
 * findKnownArticle (F-005): the article page trusts its `?url=` only when it
 * names a stored article, matched exactly. There are no built-in mock
 * articles any more (B-04, Phase B).
 */

jest.mock("../../repositories/db", () => ({ findArticleByLink: jest.fn() }));

import { findKnownArticle } from "./knownArticle";

const { findArticleByLink } = jest.requireMock("../../repositories/db") as { findArticleByLink: jest.Mock };

beforeEach(() => findArticleByLink.mockReset().mockResolvedValue(null));

test("a stored article is known", async () => {
  findArticleByLink.mockResolvedValue({ title: "Budget passes", link: "https://publisher.example/story" });
  await expect(findKnownArticle("https://publisher.example/story")).resolves.toEqual({ title: "Budget passes", link: "https://publisher.example/story" });
  expect(findArticleByLink).toHaveBeenCalledWith("https://publisher.example/story");
});

test("a link that only the old mock articles had is unknown: the database decides", async () => {
  await expect(findKnownArticle("https://nextjs.org")).resolves.toBeNull();
  expect(findArticleByLink).toHaveBeenCalledWith("https://nextjs.org");
});

test("anything else is unknown", async () => {
  await expect(findKnownArticle("https://evil.example.com/phish")).resolves.toBeNull();
});

test.each([undefined, null, ""])("no link (%j) is unknown, and costs no query", async (link) => {
  await expect(findKnownArticle(link)).resolves.toBeNull();
  expect(findArticleByLink).not.toHaveBeenCalled();
});
