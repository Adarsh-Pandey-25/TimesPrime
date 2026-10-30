"use client";

import { Article } from "@/types";

const BOOKMARKS_KEY = "timesprime_saved_articles";

export function getBookmarks(): Article[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(BOOKMARKS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function isBookmarked(articleIdOrLink: string): boolean {
  const bookmarks = getBookmarks();
  return bookmarks.some(
    (b) => b.article_id === articleIdOrLink || b.link === articleIdOrLink
  );
}

export function toggleBookmark(article: Article): boolean {
  if (typeof window === "undefined") return false;
  const bookmarks = getBookmarks();
  const id = article.article_id || article.link;
  const existingIdx = bookmarks.findIndex(
    (b) => (b.article_id || b.link) === id
  );

  let isSaved = false;
  if (existingIdx >= 0) {
    bookmarks.splice(existingIdx, 1);
    isSaved = false;
  } else {
    bookmarks.unshift(article);
    isSaved = true;
  }

  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
    // Dispatch custom event to update header counter instantly
    window.dispatchEvent(new Event("timesprime_bookmarks_updated"));
  } catch (err) {
    console.error("Failed to update bookmarks:", err);
  }

  return isSaved;
}

export function clearAllBookmarks(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(BOOKMARKS_KEY);
  window.dispatchEvent(new Event("timesprime_bookmarks_updated"));
}
