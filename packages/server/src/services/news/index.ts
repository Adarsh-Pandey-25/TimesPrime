import "server-only";

// Server-only public surface of the news feature: article storage, the
// upstream NewsData.io client (the worker's and the back office's only: readers
// read the database, R1-12), and the editorial policy. Never import this from
// client code.
export {
  saveArticlesToDB,
  getDBArticles,
  getLatestArticleTimestamp,
  countArticlesSince,
  purgeOldArticles,
  getDBStats,
  NEWS_FRESHNESS_WINDOW_MS,
} from "../../repositories/db";
export { findKnownArticle } from "./knownArticle";
export { fetchNewsDataArticles } from "./newsdata";
export {
  mapCategory,
  MOCK_ARTICLES,
  filterArticlesByLanguageScript,
  dedupeArticlesByTitle,
  isHoroscopeOrRitualFiller,
  isFromWireSpamSource,
  isFromNonNewsListingSource,
} from "@timesprime/shared/config/newsConfig";
