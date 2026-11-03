/**
 * @jest-environment node
 *
 * findKnownArticle (F-005): the article page trusts its `?url=` only when it
 * names a stored article or a built-in mock one, matched exactly.
 */

jest.mock("@/backend/repositories/db", () => ({ findArticleByLink: jest.fn() }));

import { findKnownArticle } from "./knownArticle";
import { MOCK_ARTICLES } from "@/backend/shared/config/newsConfig";

const { findArticleByLink } = jest.requireMock("@/backend/repositories/db") as { findArticleByLink: jest.Mock };

beforeEach(() => findArticleByLink.mockReset().mockResolvedValue(null));

test("a stored article is known", async () => {
  findArticleByLink.mockResolvedValue({ title: "Budget passes", link: "https://publisher.example/story" });
  await expect(findKnownArticle("https://publisher.example/story")).resolves.toEqual({ title: "Budget passes", link: "https://publisher.example/story" });
  expect(findArticleByLink).toHaveBeenCalledWith("https://publisher.example/story");
});

test("a mock article is known without asking the database", async () => {
  const mock = MOCK_ARTICLES[0];
  await expect(findKnownArticle(mock.link)).resolves.toEqual({ title: mock.title, link: mock.link });
  expect(findArticleByLink).not.toHaveBeenCalled();
});

test("anything else is unknown", async () => {
  await expect(findKnownArticle("https://evil.example.com/phish")).resolves.toBeNull();
});

test.each([undefined, null, ""])("no link (%j) is unknown, and costs no query", async (link) => {
  await expect(findKnownArticle(link)).resolves.toBeNull();
  expect(findArticleByLink).not.toHaveBeenCalled();
});
