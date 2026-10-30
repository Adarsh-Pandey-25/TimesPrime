// Move map v2 (restructure 2: frontend / backend / shared / database
// separation) — the single source of truth for where every file goes.
//
// Read by scripts/check-move-map.mjs (validates it against the import rules
// F1–X1 before, during and after the moves, and prints the plan with each
// slice's checklist) and scripts/generate-codemap.mjs (renders CODEMAP's Target
// column). Edit it here and nowhere else. Restructure
// 1's map (Phase D, all 34 moves done) is in git history: `git show
// f260d3e:scripts/move-map.mjs`.
//
// Each entry: [current path, final path, slice]. Slice 1 lifts every file in
// src/ to the repo root with its internal layout unchanged; later slices then
// move the lifted file to its final path. So an entry's current path may be
// src/x or, after slice 1, x — the checker accepts both. Files not listed stay
// put (public/, docs/, scripts/ except the seed, root configs).
//
// File naming for files that leave app/ (a page.tsx or route.ts means nothing
// outside app/): a route body becomes backend/api/<url path>.ts, nested
// segments joined with "-" (articles/bulk -> articles-bulk.ts); a page body
// becomes frontend/views/<route>/<Name>View.tsx; a colocated route.test.ts
// becomes <name>.test.ts beside it. The app/ file left behind is a re-export.

export const SLICE_NAMES = {
  1: "lift src/ to the root",
  2: "database/",
  3: "shared/",
  4: "backend/lib + backend/auth",
  5: "backend/repositories",
  6: "backend/services",
  7: "backend/api (one URL group per commit)",
  8: "frontend/components/ui + frontend/context",
  9: "frontend/features (+ the two page-level views they contain)",
  10: "frontend/views + frontend/styles",
  11: "remove the old aliases (no file moves)",
};

// What each slice must do besides its moves: the tooling and path references
// the slice invalidates (S0's tooling list, owner-approved, plus BL-018).
// `check-move-map.mjs --plan` prints it under each slice, so the plan is the
// runbook. Every slice also runs the full gate: verify, route diff, and client
// JS and CSS against the S2 baseline. Docs (README, CONTRIBUTING, HANDOFF, PRD,
// AUDIT-FINDINGS, CODEMAP) follow in S5.
export const SLICE_CHECKLIST = {
  1: [
    "tsconfig.json paths: the six ./src/* targets become ./*; jest.config.ts moduleNameMapper <rootDir>/src/ becomes <rootDir>/",
    "next.config.ts: ./src/config/imageDomains becomes ./config/imageDomains, in the import and its comment; then the picomatch probe and the remotePatterns comparison (CR-06)",
    "app/globals.css: every @source not path goes from ../../ to ../ (BL-018: paths resolve from the stylesheet); compare the CSS with the S2 baseline",
    "comments naming src/<path> lose the src/ prefix: the 10 route files that name src/proxy.ts, NewsSkeletonGrid.tsx:1, imageDomains.ts:9, ActivityLog.tsx:48, ArticleDetailView.tsx:32, MarqueeTicker.tsx:119, db.ts:179, proxy.ts:6 and :15. imageDomains.ts:16-17 stays verbatim: it is a git command over history",
    "clear .next/types before verify: route files move (BL-007)",
    "eslint.boundaries.mjs zones and eslint.config.mjs:14 name ./src/... and go stale here; check:boundaries enforces the v2 rules until S4 rewrites them",
    "smoke test, then STOP for the owner",
  ],
  2: [
    "db/schema.sql becomes database/schema.sql in categoryClassifier.ts:36 and :45 (a user-facing console.warn) and db.ts:32 and :335",
    "seed_supabase.mjs: its own usage string names scripts/seed_supabase.mjs",
    "globals.css: drop @source not \"../db\" (db/ is gone); the CSS must not change, which proves the database/ entry",
  ],
  3: [
    "next.config.ts: ./config/imageDomains becomes ./shared/config/imageDomains, in the import and its comment; the picomatch probe and the remotePatterns comparison again (CR-06)",
    "imports of the moved files go through @/shared/...",
  ],
  4: ["imageDomains.ts:9 names lib/urlValidation.ts: becomes backend/lib/urlValidation.ts", "imports of the moved files go through @/backend/..."],
  5: ["ActivityLog.tsx:48 names server/auditLog.ts: becomes backend/repositories/auditLog.ts"],
  6: ["backend/services/news/index.ts keeps import \"server-only\" as its first statement"],
  7: [
    "one commit per URL group: admin, news, chat, translate, health, cron",
    "each app/**/route.ts left behind holds only re-exports and literal segment config (A2); none has segment config today",
    "ArticleDetailView.tsx:32 and db.ts:179 name the scrape-article route as the scraper: point them at backend/api/news/scrape-article.ts",
    "clear .next/types before verify (BL-007)",
    "smoke test",
  ],
  8: ["imports of ui and context go through @/frontend/..."],
  9: [
    "the 5 planned X1 rewrites: HomeClient and ArticleDetailView import the news entry, frontend/features/news/index.ts",
    "the banner's re-export moves from the admin barrel to the news barrel; delete its KNOWN entry",
    "MarqueeTicker.tsx:119 and proxy.ts:15 name the banner: becomes frontend/features/news/BreakingNewsBanner.tsx",
    "then a separate change commit: {\"sideEffects\": false} for each frontend feature, with a bundle measurement",
  ],
  10: [
    "frontend/styles/globals.css: every @source not path goes from ../ to ../../ (BL-018); compare the CSS with the S2 baseline",
    "app/layout.tsx: its globals.css import follows the file",
    "each app/<route>/page.tsx becomes a re-export of its view (default, plus metadata where the page has it)",
    "clear .next/types before verify (BL-007)",
    "smoke test",
  ],
  11: [
    "remove the old aliases (@/features, @/server, @/lib, @/config, @/ui) from tsconfig.json and jest.config.ts once nothing imports them",
    "final smoke test; push at the end of S3 or at S5, whichever comes first (owner: no pushes during S3)",
  ],
};

export const MOVES = [
  // 1 — files whose final home is the lifted path. Every other src/ file is
  // lifted in the same commit and moves on in its own slice below.
  ["src/app/layout.tsx", "app/layout.tsx", 1],
  ["src/app/loading.tsx", "app/loading.tsx", 1],
  // Composition: backend data (fetchInitialNews) + a frontend view. Stays (page rule).
  ["src/app/page.tsx", "app/page.tsx", 1],
  // Composition: fetches the scraper and builds metadata, then renders a view. Stays.
  ["src/app/article/[slug]/page.tsx", "app/article/[slug]/page.tsx", 1],
  ["src/proxy.ts", "proxy.ts", 1],
  ["src/instrumentation.ts", "instrumentation.ts", 1],
  ["src/instrumentation-client.ts", "instrumentation-client.ts", 1],
  ["src/sentry.edge.config.ts", "sentry.edge.config.ts", 1],
  ["src/sentry.server.config.ts", "sentry.server.config.ts", 1],

  // 2 — database/
  ["db/schema.sql", "database/schema.sql", 2],
  ["db/policies.sql", "database/policies.sql", 2],
  // Unreferenced CLI script, kept and moved (owner decision at the S0 approval).
  ["scripts/seed_supabase.mjs", "database/seed/seed_supabase.mjs", 2],

  // 3 — shared/: imported by both sides, or by neither side's code alone
  ["src/types/index.ts", "shared/types/index.ts", 3],
  ["src/config/categoryColors.ts", "shared/config/categoryColors.ts", 3],
  // CR-06: next.config.ts imports this at config-load time; move the import in the same commit.
  ["src/config/imageDomains.ts", "shared/config/imageDomains.ts", 3],
  ["src/config/topicImages.ts", "shared/config/topicImages.ts", 3],
  ["src/config/translations.ts", "shared/config/translations.ts", 3],
  // Importers on both sides: ArticleCard (frontend); db, fetchNews, newsdata and the news service entry (backend).
  ["src/features/news/newsConfig.ts", "shared/config/newsConfig.ts", 3],
  ["src/features/news/newsConfig.test.ts", "shared/config/newsConfig.test.ts", 3],
  // Both runtimes: instrumentation-client (browser) and the Sentry server/edge configs.
  ["src/lib/sentryScrub.ts", "shared/validation/sentryScrub.ts", 3],
  ["src/lib/sentryScrub.test.ts", "shared/validation/sentryScrub.test.ts", 3],

  // 4 — backend/lib + backend/auth
  ["src/server/supabase.ts", "backend/lib/supabase.ts", 4],
  ["src/lib/cache.ts", "backend/lib/cache.ts", 4],
  ["src/lib/rateLimit.ts", "backend/lib/rateLimit.ts", 4],
  ["src/lib/reportFallback.ts", "backend/lib/reportFallback.ts", 4],
  ["src/lib/reportFallback.test.ts", "backend/lib/reportFallback.test.ts", 4],
  // Server-only: its one importer is the scraper route (and it imports dns/net).
  ["src/lib/urlValidation.ts", "backend/lib/urlValidation.ts", 4],
  // Imported by proxy.ts (P1) and the login/logout routes.
  ["src/server/auth/adminSession.ts", "backend/auth/adminSession.ts", 4],

  // 5 — backend/repositories
  ["src/features/news/server/db.ts", "backend/repositories/db.ts", 5],
  ["src/features/news/server/db.test.ts", "backend/repositories/db.test.ts", 5],
  ["src/server/auditLog.ts", "backend/repositories/auditLog.ts", 5],

  // 6 — backend/services
  // The news service entry: re-exports storage (repositories/db), upstream
  // fetching and the editorial policy the routes use. Keeps import "server-only".
  ["src/features/news/server.ts", "backend/services/news/index.ts", 6],
  ["src/features/news/server/fetchNews.ts", "backend/services/news/fetchNews.ts", 6],
  ["src/features/news/server/newsdata.ts", "backend/services/news/newsdata.ts", 6],
  // Refinement of the target (S0): its only importer is repositories/db.ts.
  // Inside services/news, db.ts would need a deep import past the news entry
  // (X1) or an import cycle through it (the entry re-exports db). As its own
  // single-file service it is importable directly. Owner decision in S0.
  ["src/features/news/server/categoryClassifier.ts", "backend/services/classify/categoryClassifier.ts", 6],
  ["src/server/googleTranslate.ts", "backend/services/translate/googleTranslate.ts", 6],
  ["src/server/health.ts", "backend/services/health/health.ts", 6],
  ["src/server/health.test.ts", "backend/services/health/health.test.ts", 6],

  // 7 — backend/api: route bodies. app/.../route.ts becomes a re-export.
  // admin
  ["src/app/api/admin/articles/route.ts", "backend/api/admin/articles.ts", 7],
  ["src/app/api/admin/articles/bulk/route.ts", "backend/api/admin/articles-bulk.ts", 7],
  ["src/app/api/admin/breaking-news/route.ts", "backend/api/admin/breaking-news.ts", 7],
  ["src/app/api/admin/db-stats/route.ts", "backend/api/admin/db-stats.ts", 7],
  ["src/app/api/admin/health/route.ts", "backend/api/admin/health.ts", 7],
  ["src/app/api/admin/health/route.test.ts", "backend/api/admin/health.test.ts", 7],
  ["src/app/api/admin/login/route.ts", "backend/api/admin/login.ts", 7],
  ["src/app/api/admin/logout/route.ts", "backend/api/admin/logout.ts", 7],
  ["src/app/api/admin/logs/route.ts", "backend/api/admin/logs.ts", 7],
  ["src/app/api/admin/publish-article/route.ts", "backend/api/admin/publish-article.ts", 7],
  ["src/app/api/admin/seed-supabase/route.ts", "backend/api/admin/seed-supabase.ts", 7],
  ["src/app/api/admin/stats/route.ts", "backend/api/admin/stats.ts", 7],
  // news
  ["src/app/api/news/check-new/route.ts", "backend/api/news/check-new.ts", 7],
  ["src/app/api/news/scrape-article/route.ts", "backend/api/news/scrape-article.ts", 7],
  ["src/app/api/news/top-headlines/route.ts", "backend/api/news/top-headlines.ts", 7],
  // chat, translate, health
  ["src/app/api/chat/route.ts", "backend/api/chat.ts", 7],
  ["src/app/api/chat/route.test.ts", "backend/api/chat.test.ts", 7],
  ["src/app/api/translate/route.ts", "backend/api/translate.ts", 7],
  ["src/app/api/health/route.ts", "backend/api/health.ts", 7],
  ["src/app/api/health/route.test.ts", "backend/api/health.test.ts", 7],
  // cron: the whole job lives in the route body, so it moves whole (no backend/jobs/ split).
  ["src/app/api/cron/refresh-news/route.ts", "backend/api/cron/refresh-news.ts", 7],

  // 8 — frontend/components/ui + frontend/context
  ["src/components/ui/NewsSkeletonGrid.tsx", "frontend/components/ui/NewsSkeletonGrid.tsx", 8],
  ["src/components/ui/ThemeSpinner.tsx", "frontend/components/ui/ThemeSpinner.tsx", 8],
  ["src/context/LanguageContext.tsx", "frontend/context/LanguageContext.tsx", 8],
  ["src/context/ThemeContext.tsx", "frontend/context/ThemeContext.tsx", 8],

  // 9 — frontend/features. components/ is flattened into the feature folder.
  // Each feature's package.json ("sideEffects") moves with it.
  ["src/features/news/components/ArticleCard.tsx", "frontend/features/news/ArticleCard.tsx", 9],
  ["src/features/news/components/CategoryMegaMenu.tsx", "frontend/features/news/CategoryMegaMenu.tsx", 9],
  ["src/features/news/components/Footer.tsx", "frontend/features/news/Footer.tsx", 9],
  ["src/features/news/components/Header.tsx", "frontend/features/news/Header.tsx", 9],
  ["src/features/news/components/MarqueeTicker.tsx", "frontend/features/news/MarqueeTicker.tsx", 9],
  // localStorage, browser-only.
  ["src/features/news/bookmarks.ts", "frontend/features/news/bookmarks.ts", 9],
  ["src/features/news/bookmarks.test.ts", "frontend/features/news/bookmarks.test.ts", 9],
  ["src/features/news/index.ts", "frontend/features/news/index.ts", 9],
  ["src/features/news/package.json", "frontend/features/news/package.json", 9],
  // Reader-facing, on every page, data from a public GET (owner decision in S0).
  ["src/features/admin/components/BreakingNewsBanner.tsx", "frontend/features/news/BreakingNewsBanner.tsx", 9],
  ["src/features/admin/components/ActivityLog.tsx", "frontend/features/admin/ActivityLog.tsx", 9],
  ["src/features/admin/components/ArticlesTable.tsx", "frontend/features/admin/ArticlesTable.tsx", 9],
  ["src/features/admin/components/BreakingNewsManager.tsx", "frontend/features/admin/BreakingNewsManager.tsx", 9],
  ["src/features/admin/components/CategoryStatsCard.tsx", "frontend/features/admin/CategoryStatsCard.tsx", 9],
  ["src/features/admin/components/SyncDashboard.tsx", "frontend/features/admin/SyncDashboard.tsx", 9],
  ["src/features/admin/components/actionLabels.ts", "frontend/features/admin/actionLabels.ts", 9],
  ["src/features/admin/index.ts", "frontend/features/admin/index.ts", 9],
  ["src/features/admin/package.json", "frontend/features/admin/package.json", 9],
  ["src/features/chat/components/Chatbot.tsx", "frontend/features/chat/Chatbot.tsx", 9],
  ["src/features/chat/components/FloatingAiAssistant.tsx", "frontend/features/chat/FloatingAiAssistant.tsx", 9],
  ["src/features/chat/index.ts", "frontend/features/chat/index.ts", 9],
  ["src/features/chat/package.json", "frontend/features/chat/package.json", 9],
  // Page-level UI that lives in the news feature today. Moved with it (their
  // relative imports of news internals become imports of the news entry).
  ["src/features/news/components/HomeClient.tsx", "frontend/views/home/HomeClient.tsx", 9],
  ["src/features/news/components/ArticleDetailView.tsx", "frontend/views/article/ArticleDetailView.tsx", 9],

  // 10 — frontend/views + frontend/styles: page bodies with no backend import
  // (page rule). app/<route>/page.tsx becomes a re-export of the view.
  ["src/app/about/page.tsx", "frontend/views/about/AboutView.tsx", 10],
  ["src/app/contact/page.tsx", "frontend/views/contact/ContactView.tsx", 10],
  ["src/app/privacy/page.tsx", "frontend/views/privacy/PrivacyView.tsx", 10],
  ["src/app/terms/page.tsx", "frontend/views/terms/TermsView.tsx", 10],
  ["src/app/saved/page.tsx", "frontend/views/saved/SavedView.tsx", 10],
  ["src/app/admin/page.tsx", "frontend/views/admin/AdminView.tsx", 10],
  ["src/app/admin/login/page.tsx", "frontend/views/admin/AdminLoginView.tsx", 10],
  // Its @source not paths resolve from the stylesheet: see SLICE_CHECKLIST 1 and 10 (BL-018).
  ["src/app/globals.css", "frontend/styles/globals.css", 10],
];

// Violations accepted for now, keyed by "<rule> <importer> -> <imported>"
// (paths as targets), each with its reason and where it is resolved.
export const KNOWN = {};
