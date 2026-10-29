# CODEMAP — every module, what it does, where it goes

**Purpose: read this instead of re-analysing the codebase.** If the question is "where does X
live", "what imports Y" or "what moves where", it is answered here. Do not grep the tree to
re-derive it.

Generated 2026-10-29 at commit `506a4ab` by `node scripts/generate-codemap.mjs`. Every column
except **Purpose** and **Target** is derived from the repo: the import graph resolves each
`from "..."` specifier (both `@/` aliased and relative) against `git ls-files`, so **Used by** is
a real count, not an estimate. Purpose and Target are authored in that script.

**Regenerate after any file move.** A stale CODEMAP is worse than none, because it is trusted.

## At a glance

| | |
|---|---|
| Modules (excl. tests) | **73** |
| Client components (`"use client"`) | **24** |
| Modules with a colocated test | **4** |
| Client → server boundary violations | **1** |
| Orphans (nothing imports them) | **1** |

### Boundary violations

A `"use client"` module importing a server-only one. The Phase E lint rule exists to make
this count zero and keep it there.

```
src/components/admin/ActivityLog.tsx  ->  src/lib/adminLogger.ts
```

`ActivityLog.tsx` imports `adminLogger.ts` for two constant objects (`ACTION_LABELS`,
`ACTION_ICONS`). That module imports `@supabase/supabase-js` and Sentry, so the SDK lands in
the browser bundle. The service-role key itself is safe — non-`NEXT_PUBLIC_` env vars compile
to `undefined` client-side — but the weight is real. Fixed in migration slice 8 by moving the
two constants into `features/admin/`.

### Orphans

```
src/lib/rssParser.ts  (234 lines)
```

### Most depended-upon

Widest blast radius when moved.

| Importers | Module |
|--:|---|
| 20 | `src/types/index.ts` |
| 18 | `src/context/ThemeContext.tsx` |
| 9 | `src/lib/adminLogger.ts` |
| 9 | `src/lib/supabase.ts` |
| 8 | `src/components/Footer.tsx` |
| 8 | `src/components/Header.tsx` |

## Legend

- **Client** — file begins with `"use client"`.
- **Test** — a colocated `*.test.ts(x)` exists.
- **Used by** — count of other tracked modules importing it. `0` is expected for `app/` files:
  the framework loads them; nothing imports them.
- **Target** — destination under the approved *layer separation* structure. `PINNED` marks a
  framework convention that must not move. Slice order is in [`MOVE-MAP.md`](MOVE-MAP.md).
- **CR-nn** — a compatibility requirement from [`PRD.md`](PRD.md) §8. Breaking one breaks
  something outside the codebase.

## Modules

### Routing — `src/app/` (locations are the URL contract)

| Module | Purpose | LOC | Client | Test | Used by | Target |
|---|---|--:|:-:|:-:|--:|---|
| `app/about/page.tsx` | Page: /about | 99 |  |  | 0 | stays -- route group only (CR-01) |
| `app/admin/login/page.tsx` | Page: /admin/login | 104 | yes |  | 0 | stays -- route group only (CR-01) |
| `app/admin/page.tsx` | Page: /admin | 513 | yes |  | 0 | stays -- route group only (CR-01) |
| `app/api/admin/articles/bulk/route.ts` | API: /api/admin/articles/bulk | 80 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/admin/articles/route.ts` | API: /api/admin/articles | 248 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/admin/breaking-news/route.ts` | API: /api/admin/breaking-news | 213 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/admin/db-stats/route.ts` | API: /api/admin/db-stats | 43 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/admin/login/route.ts` | API: /api/admin/login | 33 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/admin/logout/route.ts` | API: /api/admin/logout | 13 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/admin/logs/route.ts` | API: /api/admin/logs | 124 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/admin/publish-article/route.ts` | API: /api/admin/publish-article | 107 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/admin/seed-supabase/route.ts` | API: /api/admin/seed-supabase | 72 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/admin/stats/route.ts` | API: /api/admin/stats | 164 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/chat/route.ts` | API: /api/chat | 163 |  | yes | 1 | stays -- URL is the contract (CR-01) |
| `app/api/cron/refresh-news/route.ts` | API: /api/cron/refresh-news | 121 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/cron/refresh-rss/route.ts` | API: /api/cron/refresh-rss | 32 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/news/check-new/route.ts` | API: /api/news/check-new | 52 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/news/scrape-article/route.ts` | API: /api/news/scrape-article | 561 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/news/top-headlines/route.ts` | API: /api/news/top-headlines | 260 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/api/translate/route.ts` | API: /api/translate | 55 |  |  | 0 | stays -- URL is the contract (CR-01) |
| `app/article/[slug]/page.tsx` | Page: /article/[slug] | 104 |  |  | 0 | stays -- route group only (CR-01) |
| `app/contact/page.tsx` | Page: /contact | 165 | yes |  | 0 | stays -- route group only (CR-01) |
| `app/layout.tsx` | Root layout: providers, metadata, fonts | 71 |  |  | 0 | stays |
| `app/loading.tsx` | Route-level loading UI | 8 | yes |  | 0 | stays |
| `app/page.tsx` | Page: / | 40 |  |  | 0 | stays -- route group only (CR-01) |
| `app/privacy/page.tsx` | Page: /privacy | 115 |  |  | 0 | stays -- route group only (CR-01) |
| `app/saved/page.tsx` | Page: /saved | 127 | yes |  | 0 | stays -- route group only (CR-01) |
| `app/terms/page.tsx` | Page: /terms | 110 |  |  | 0 | stays -- route group only (CR-01) |

### Components — `src/components/`

| Module | Purpose | LOC | Client | Test | Used by | Target |
|---|---|--:|:-:|:-:|--:|---|
| `components/ArticleCard.tsx` | Feed card, featured and grid variants | 394 | yes |  | 3 | features/news/components/ |
| `components/ArticleDetailView.tsx` | Article page body: text, translation, AI panel, share, related | 1009 | yes |  | 1 | features/article/components/ -- split in F |
| `components/BreakingNewsBanner.tsx` | Public banner polling /api/admin/breaking-news (CR-08) | 80 | yes |  | 1 | features/admin/components/ |
| `components/CategoryMegaMenu.tsx` | Hover mega-menu of category previews | 226 | yes |  | 1 | features/news/components/ |
| `components/Chatbot.tsx` | Chat drawer; streams /api/chat. Honest error handling | 193 | yes |  | 1 | features/chat/components/ |
| `components/FloatingAiAssistant.tsx` | Floating button wrapping Chatbot | 38 | yes |  | 1 | features/chat/components/ |
| `components/Footer.tsx` | Footer nav + newsletter form (sends nothing, DEF-09) | 262 | yes |  | 8 | components/ui/layout/ |
| `components/Header.tsx` | Nav, search, theme + language toggles, bookmarks count, clock | 569 | yes |  | 8 | components/ui/layout/ -- split in F |
| `components/HomeClient.tsx` | Feed state, new-story polling, grid, load-more | 533 | yes |  | 1 | features/news/components/ -- split in F |
| `components/MarqueeTicker.tsx` | Scrolling India/World headline ticker | 177 | yes |  | 2 | features/news/components/ |
| `components/NewsSkeletonGrid.tsx` | Suspense fallback matching real card dimensions | 91 |  |  | 1 | components/ui/ |
| `components/ThemeSpinner.tsx` | Theme-aware loading spinner | 89 | yes |  | 2 | components/ui/ |
| `components/admin/ActivityLog.tsx` | Paginated admin_logs viewer | 235 | yes |  | 1 | features/admin/components/ |
| `components/admin/ArticlesTable.tsx` | Admin article list: filters, edit, delete, bulk | 752 | yes |  | 1 | features/admin/components/ -- split in F |
| `components/admin/BreakingNewsManager.tsx` | Create/expire breaking news items | 290 | yes |  | 1 | features/admin/components/ |
| `components/admin/CategoryStatsCard.tsx` | Category/language/country breakdown | 363 | yes |  | 1 | features/admin/components/ |
| `components/admin/SyncDashboard.tsx` | Last/next sync, counts, manual sync | 199 | yes |  | 1 | features/admin/components/ |

### Library — `src/lib/` (the folder being split)

| Module | Purpose | LOC | Client | Test | Used by | Target |
|---|---|--:|:-:|:-:|--:|---|
| `lib/adminLogger.ts` | Writes admin_logs rows; also exports ACTION_LABELS/ICONS | 81 |  |  | 9 | split: server/auditLog.ts + labels to features/admin |
| `lib/adminSession.ts` | HMAC session token issue/verify; timing-safe password compare | 68 |  |  | 3 | server/auth/ |
| `lib/bookmarks.ts` | localStorage saved articles + change event | 57 | yes | yes | 4 | features/bookmarks/ |
| `lib/cache.ts` | Upstash Redis with in-process Map fallback | 74 |  |  | 2 | lib/ (stays) |
| `lib/categoryClassifier.ts` | Haiku flags category tags an article does not fit (fail-open) | 134 |  |  | 1 | features/news/server/ |
| `lib/categoryColors.ts` | Per-category hex/Tailwind class map | 79 |  |  | 1 | config/ |
| `lib/db.ts` | Supabase reads/writes: filters, freshness, 7-day purge, upsert, stats | 572 |  |  | 5 | server/db/ |
| `lib/fetchNews.ts` | Server-side initial NewsData.io fetch for SSR | 129 |  |  | 1 | features/news/server/ |
| `lib/googleTranslate.ts` | Unofficial translate.googleapis.com client, bounded concurrency | 87 |  |  | 1 | features/i18n/server/ |
| `lib/imageDomains.ts` | next/image hostname allowlist. Imported by next.config.ts at LOAD TIME | 106 |  |  | 1 | config/ -- CR-06, move first |
| `lib/newsConfig.ts` | Editorial policy: category map, script filters, spam/filler source lists, dedupe | 234 |  | yes | 7 | features/news/ |
| `lib/newsdata.ts` | Shared NewsData.io URL builder + row mapper; throws on failure | 116 |  |  | 1 | features/news/server/ |
| `lib/paraphraser.ts` | Synonym-table rewrite of titles/descriptions; skips Devanagari | 119 |  | yes | 6 | features/article/ (pending Q1) |
| `lib/rateLimit.ts` | Fixed-window in-memory limiter; client IP extraction | 27 |  |  | 2 | lib/ (stays) |
| `lib/rssParser.ts` | DEAD: 233 lines inside a block comment, licensing-blocked | 234 |  |  | 0 | DELETE (pending Q2) |
| `lib/sentryScrub.ts` | Redacts secret env values from Sentry events | 53 |  |  | 4 | lib/ (stays) |
| `lib/supabase.ts` | Supabase client; prefers service-role key when present | 21 |  |  | 9 | server/supabase.ts |
| `lib/topicImages.ts` | Keyword to Unsplash topic-image table + per-topic round robin | 415 |  |  | 5 | config/ |
| `lib/translations.ts` | EN/HI static strings; translateHeadline is a no-op stub | 200 |  |  | 8 | features/i18n/ |
| `lib/urlValidation.ts` | SSRF guard: protocol allowlist + DNS resolution against blocked ranges | 123 |  |  | 1 | lib/ (stays) |

### Context and types

| Module | Purpose | LOC | Client | Test | Used by | Target |
|---|---|--:|:-:|:-:|--:|---|
| `context/LanguageContext.tsx` | EN/HI provider, localStorage-backed | 58 | yes |  | 8 | features/i18n/ |
| `context/ThemeContext.tsx` | Light/dark provider, localStorage-backed | 64 | yes |  | 18 | components/ui/theme/ |
| `types/index.ts` | Article, NewsResponse, ScrapeResponse, ChatMessage, NewsDataRawArticle | 73 |  |  | 20 | types/ (stays) |

### Framework-pinned (never move)

| Module | Purpose | LOC | Client | Test | Used by | Target |
|---|---|--:|:-:|:-:|--:|---|
| `instrumentation-client.ts` | Sentry browser init | 14 |  |  | 0 | PINNED |
| `instrumentation.ts` | Sentry server/edge init hook | 13 |  |  | 0 | PINNED |
| `proxy.ts` | AUTH GATE. Next 16 Proxy (was middleware). Matches /admin/*, /api/admin/* | 47 |  |  | 0 | PINNED -- do not move |
| `sentry.edge.config.ts` | Sentry edge config | 9 |  |  | 0 | PINNED |
| `sentry.server.config.ts` | Sentry Node config | 9 |  |  | 0 | PINNED |
