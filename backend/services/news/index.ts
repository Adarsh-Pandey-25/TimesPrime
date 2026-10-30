import "server-only";

// Server-only public surface of the news feature: article storage, the
// upstream NewsData.io client, the initial feed fetch, and the editorial
// policy the route handlers apply. Never import this from client code.
export {
  saveArticlesToDB,
  getDBArticles,
  getLatestArticleTimestamp,
  countArticlesSince,
  purgeOldArticles,
  getDBStats,
  NEWS_FRESHNESS_WINDOW_MS,
} from "@/backend/repositories/db";
export { fetchInitialNews } from "./fetchNews";
export { fetchNewsDataArticles } from "./newsdata";
export {
  mapCategory,
  MOCK_ARTICLES,
  filterArticlesByLanguageScript,
  dedupeArticlesByTitle,
  isHoroscopeOrRitualFiller,
  isFromWireSpamSource,
  isFromNonNewsListingSource,
} from "@/shared/config/newsConfig";
