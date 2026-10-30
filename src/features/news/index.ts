// Client-safe public surface of the news feature: what app/ renders, plus the
// saved-articles helpers. Server code (storage, upstream fetching, editorial
// policy for route handlers) is exported from server.ts instead.
export { default as ArticleCard } from "./components/ArticleCard";
export { default as ArticleDetailView } from "./components/ArticleDetailView";
export { default as Footer } from "./components/Footer";
export { default as Header } from "./components/Header";
export { default as HomeClient } from "./components/HomeClient";
export { default as MarqueeTicker } from "./components/MarqueeTicker";
export { getBookmarks, clearAllBookmarks } from "./bookmarks";
