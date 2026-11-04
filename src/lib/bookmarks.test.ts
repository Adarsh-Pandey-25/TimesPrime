import { getBookmarks, isBookmarked, toggleBookmark, clearAllBookmarks } from "./bookmarks";
import { Article } from "@/types";

// jsdom's built-in localStorage is an in-memory implementation, not real
// browser storage — cleared between tests so state never leaks across them.

const articleA: Article = {
  article_id: "test-1",
  title: "Test Article One",
  link: "https://example.com/test-1",
  pubDate: new Date().toISOString(),
};

const articleB: Article = {
  article_id: "test-2",
  title: "Test Article Two",
  link: "https://example.com/test-2",
  pubDate: new Date().toISOString(),
};

describe("bookmarks", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns an empty array when nothing is saved", () => {
    expect(getBookmarks()).toEqual([]);
  });

  it("saves an article and retrieves it", () => {
    toggleBookmark(articleA);
    const saved = getBookmarks();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ article_id: articleA.article_id, title: articleA.title });
  });

  it("does not create a duplicate — toggling an already-saved article removes it instead", () => {
    toggleBookmark(articleA);
    expect(getBookmarks()).toHaveLength(1);

    toggleBookmark(articleA);
    expect(getBookmarks()).toHaveLength(0);
  });

  it("reports bookmarked state correctly", () => {
    expect(isBookmarked(articleA.article_id)).toBe(false);
    toggleBookmark(articleA);
    expect(isBookmarked(articleA.article_id)).toBe(true);
    expect(isBookmarked(articleB.article_id)).toBe(false);
  });

  it("removes only the targeted article, leaving others intact", () => {
    toggleBookmark(articleA);
    toggleBookmark(articleB);
    expect(getBookmarks()).toHaveLength(2);

    toggleBookmark(articleA); // toggle off
    const remaining = getBookmarks();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].article_id).toBe(articleB.article_id);
  });

  it("clears all saved articles", () => {
    toggleBookmark(articleA);
    toggleBookmark(articleB);
    expect(getBookmarks()).toHaveLength(2);

    clearAllBookmarks();
    expect(getBookmarks()).toEqual([]);
  });

  it("survives corrupted storage without throwing", () => {
    localStorage.setItem("timesprime_saved_articles", "{not valid json");
    expect(getBookmarks()).toEqual([]);
  });
});
