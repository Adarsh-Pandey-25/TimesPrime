// Client-safe public surface of the news feature: what app/ renders, plus the
// saved-articles helpers. Server code (storage, upstream fetching, editorial
// policy for route handlers) lives in backend/services/news instead.
export { default as ArticleCard } from "./ArticleCard";
export { default as ArticleDetailView } from "@/frontend/views/article/ArticleDetailView";
export { default as BreakingNewsBanner } from "./BreakingNewsBanner";
export { default as Footer } from "./Footer";
export { default as Header } from "./Header";
export { default as HomeClient } from "@/frontend/views/home/HomeClient";
export { default as MarqueeTicker } from "./MarqueeTicker";
export { getBookmarks, clearAllBookmarks } from "./bookmarks";
