// The Phase D move map — the single source of truth for where every file goes.
//
// Read by scripts/check-move-map.mjs (validates it against the import rules)
// and scripts/generate-codemap.mjs (renders CODEMAP's Target column). Edit it
// here and nowhere else; docs/MOVE-MAP.md's file lists are generated from it
// with `node scripts/check-move-map.mjs --plan`.
//
// Each entry: [current path, target path, slice]. Files not listed stay put.

export const SLICE_NAMES = {
  1: "features/chat",
  2: "config/",
  3: "server/",
  4: "components/ui/",
  5: "features/admin",
  6: "features/news",
};

export const MOVES = [
  // 1 — features/chat: smallest and safest; proves the mechanics first
  ["src/components/Chatbot.tsx", "src/features/chat/components/Chatbot.tsx", 1],
  ["src/components/FloatingAiAssistant.tsx", "src/features/chat/components/FloatingAiAssistant.tsx", 1],
  // 2 — config/: imageDomains is read by next.config.ts at config-load time (CR-06)
  ["src/lib/imageDomains.ts", "src/config/imageDomains.ts", 2],
  ["src/lib/categoryColors.ts", "src/config/categoryColors.ts", 2],
  ["src/lib/topicImages.ts", "src/config/topicImages.ts", 2],
  ["src/lib/translations.ts", "src/config/translations.ts", 2],
  // 3 — server/
  ["src/lib/supabase.ts", "src/server/supabase.ts", 3],
  ["src/lib/adminSession.ts", "src/server/auth/adminSession.ts", 3],
  ["src/lib/adminLogger.ts", "src/server/auditLog.ts", 3],
  ["src/lib/googleTranslate.ts", "src/server/googleTranslate.ts", 3],
  // 4 — components/ui/
  ["src/context/ThemeContext.tsx", "src/components/ui/theme/ThemeContext.tsx", 4],
  ["src/context/LanguageContext.tsx", "src/components/ui/i18n/LanguageContext.tsx", 4],
  ["src/components/ThemeSpinner.tsx", "src/components/ui/ThemeSpinner.tsx", 4],
  ["src/components/NewsSkeletonGrid.tsx", "src/components/ui/NewsSkeletonGrid.tsx", 4],
  ["src/components/Footer.tsx", "src/components/ui/layout/Footer.tsx", 4],
  // 5 — features/admin
  ["src/components/admin/ActivityLog.tsx", "src/features/admin/components/ActivityLog.tsx", 5],
  ["src/components/admin/ArticlesTable.tsx", "src/features/admin/components/ArticlesTable.tsx", 5],
  ["src/components/admin/BreakingNewsManager.tsx", "src/features/admin/components/BreakingNewsManager.tsx", 5],
  ["src/components/admin/CategoryStatsCard.tsx", "src/features/admin/components/CategoryStatsCard.tsx", 5],
  ["src/components/admin/SyncDashboard.tsx", "src/features/admin/components/SyncDashboard.tsx", 5],
  ["src/components/BreakingNewsBanner.tsx", "src/features/admin/components/BreakingNewsBanner.tsx", 5],
  ["src/components/admin/actionLabels.ts", "src/features/admin/components/actionLabels.ts", 5],
  // 6 — features/news: the core domain, including the article page and the masthead
  ["src/lib/newsConfig.ts", "src/features/news/newsConfig.ts", 6],
  ["src/lib/newsConfig.test.ts", "src/features/news/newsConfig.test.ts", 6],
  ["src/lib/db.ts", "src/features/news/server/db.ts", 6],
  ["src/lib/categoryClassifier.ts", "src/features/news/server/categoryClassifier.ts", 6],
  ["src/lib/fetchNews.ts", "src/features/news/server/fetchNews.ts", 6],
  ["src/lib/newsdata.ts", "src/features/news/server/newsdata.ts", 6],
  ["src/components/ArticleCard.tsx", "src/features/news/components/ArticleCard.tsx", 6],
  ["src/components/HomeClient.tsx", "src/features/news/components/HomeClient.tsx", 6],
  ["src/components/MarqueeTicker.tsx", "src/features/news/components/MarqueeTicker.tsx", 6],
  ["src/components/CategoryMegaMenu.tsx", "src/features/news/components/CategoryMegaMenu.tsx", 6],
  ["src/components/ArticleDetailView.tsx", "src/features/news/components/ArticleDetailView.tsx", 6],
  ["src/components/Header.tsx", "src/features/news/components/Header.tsx", 6],
  // Stores Article objects — product knowledge, so not lib/. Every importer is in news or app/.
  ["src/lib/bookmarks.ts", "src/features/news/bookmarks.ts", 6],
  ["src/lib/bookmarks.test.ts", "src/features/news/bookmarks.test.ts", 6],
];

// Violations accepted for now, each with its reason and where it is resolved.
// Empty since SC-1 moved the admin action labels out of adminLogger.ts.
export const KNOWN = {
};
