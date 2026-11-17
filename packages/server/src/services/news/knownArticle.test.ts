/**
 * @jest-environment node
 *
 * findKnownArticle (F-005): the article page trusts its `?url=` only when it
 * names a stored article, matched exactly. There are no built-in mock
 * articles any more (B-04, Phase B).
 */

jest.mock("../../repositories/db", () => ({ findArticleByLink: jest.fn(), findArticleById: jest.fn() }));

import { findKnownArticle, findKnownArticleById } from "./knownArticle";

const { findArticleByLink, findArticleById } = jest.requireMock("../../repositories/db") as {
  findArticleByLink: jest.Mock;
  findArticleById: jest.Mock;
};

beforeEach(() => {
  findArticleByLink.mockReset().mockResolvedValue(null);
  findArticleById.mockReset().mockResolvedValue(null);
});

test("a stored article is known", async () => {
  findArticleByLink.mockResolvedValue({ title: "Budget passes", link: "https://publisher.example/story" });
  await expect(findKnownArticle("https://publisher.example/story")).resolves.toMatchObject({ title: "Budget passes", link: "https://publisher.example/story" });
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

// R2: the story URLs carry NewsData's article_id.
test("by id: a stored story is known, and no id costs no query", async () => {
  findArticleById.mockResolvedValue({ article_id: "3f9a", title: "Budget passes", link: "https://publisher.example/story" });
  await expect(findKnownArticleById("3f9a")).resolves.toMatchObject({ title: "Budget passes" });
  expect(findArticleById).toHaveBeenCalledWith("3f9a");
  findArticleById.mockClear();
  await expect(findKnownArticleById(null)).resolves.toBeNull();
  expect(findArticleById).not.toHaveBeenCalled();
});
