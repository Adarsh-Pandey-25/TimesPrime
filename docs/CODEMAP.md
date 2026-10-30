# CODEMAP — every module, what it does, where it goes

**Read this instead of re-analysing the codebase.** If the question is "where does X live",
"what imports Y" or "what moves where", it is answered here. Do not grep the tree to re-derive it.

Generated at commit `0c381f9` by `node scripts/generate-codemap.mjs`. Coverage read from
`coverage/coverage-final.json` (written 2026-10-30 04:41 UTC) — run `npm run test:ci` first for current numbers.

Every column except **Purpose** and **Target** is derived. Imports come from parsing each file with
the TypeScript compiler API, so comments and strings cannot create false edges, `import type` is
recognised, dynamic `import()` and `export … from` are captured, and aliases are resolved from
`tsconfig.json`. Files outside `src/` (notably `next.config.ts`) are scanned as importers too.

**Regenerate after any file move.** A stale CODEMAP is worse than none, because it is trusted.

## At a glance

| | |
|---|---|
| Modules (excl. tests) | **72** |
| Modules with a `"use client"` directive | **24** |
| Modules in the client bundle (directive + pulled in) | **31** |
| Server-only modules in the client bundle (violations) | **0** |
| Orphans (nothing imports them) | **0** |
| Dynamic `import()` edges | **3** |
| Type-only edges (erased at compile time) | **5** |
| Unresolved project imports | **0** — self-check passes |

### Boundary violations

A server-only module that ends up in the client bundle, with the shortest import chain that pulls
it in. **Treat this as an estimate** until the Phase E lint rule exists — see *How the boundary is
detected* below.

```
none
```

### How the boundary is detected

- **Roots:** files whose directive prologue contains `"use client"`, read from the AST, so a leading
  comment cannot hide one.
- **Client bundle:** the transitive closure from every root over value, dynamic, re-export and
  side-effect edges. A module with no directive is still client-side if a root pulls it in — that is
  how Next.js bundles. Type edges are not followed (erased at compile time), nor are edges into a
  `"use server"` module (the client gets an RPC reference, not the code).
- **Server-only module:** an authored policy list in the generator — not derivable, since modules
  such as `supabase.ts` contain no code that would fail in a browser.
- **Violation:** a server-only module inside the client bundle.
- **Limits:** the generator reads syntax, not types. An import written without `type` that only
  brings in interfaces (`import { Article } from "@/types"`) is erased by the compiler but counted
  here as a value edge — which is why `types/index.ts` shows as `bundled` though it compiles to
  nothing. This can only over-include modules, never miss one, so the estimate errs high. A dynamic
  `import()` with a non-literal specifier cannot be followed and is listed separately; `require()` is
  not followed (none in `src/`). The Phase E lint rule replaces this estimate with an enforced check.

### Cross-check: Node built-ins

A browser bundle cannot resolve Node built-ins, so a passing `next build` implies no bundled module
imports one. Modules importing built-ins, and whether any is in the client bundle:

```
src/lib/urlValidation.ts   server-side
src/server/auth/adminSession.ts   server-side
```

Consistent with the build: no bundled module imports a Node built-in.

### Orphans

```
none
```

### Dynamic imports

```
src/app/api/news/scrape-article/route.ts -> src/server/supabase.ts
src/instrumentation.ts -> src/sentry.server.config.ts
src/instrumentation.ts -> src/sentry.edge.config.ts
```

### Most depended-upon

Widest blast radius when moved.

| Importers | Module |
|--:|---|
| 23 | `src/types/index.ts` |
| 18 | `src/context/ThemeContext.tsx` |
| 10 | `src/server/supabase.ts` |
| 8 | `src/components/Footer.tsx` |
| 8 | `src/components/Header.tsx` |
| 8 | `src/config/translations.ts` |

## Legend

- **Client** — `directive`: declares `"use client"`. `bundled`: no directive, but pulled into the
  client bundle by one. Blank: server-side only.
- **Cov** — statement coverage from the last `npm run test:ci`. `excl.` = excluded by
  `collectCoverageFrom` (type-only modules, Sentry/instrumentation entrypoints).
- **Importers / Imports** — counts of project-internal edges. The full path lists, with edge kinds,
  are in the *Dependency index* section below the tables.
- **Target** — destination under the approved *layer separation* structure. `PINNED` = a framework
  convention that must not move. Slice order is in [`MOVE-MAP.md`](MOVE-MAP.md).
- **CR-nn** — a compatibility requirement from [`PRD.md`](PRD.md) §8.

## Modules

### Routing — `src/app/` (locations are the URL contract)

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `app/about/page.tsx` | Page: /about | 98 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/admin/login/page.tsx` | Page: /admin/login | 103 | directive | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/admin/page.tsx` | Page: /admin | 512 | directive | 0% | 0 | 10 | stays -- the path is the URL (CR-01) |
| `app/api/admin/articles/bulk/route.ts` | API: /api/admin/articles/bulk | 79 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/api/admin/articles/route.ts` | API: /api/admin/articles | 247 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/api/admin/breaking-news/route.ts` | API: /api/admin/breaking-news | 212 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/api/admin/db-stats/route.ts` | API: /api/admin/db-stats | 42 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/api/admin/login/route.ts` | API: /api/admin/login | 32 |  | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/logout/route.ts` | API: /api/admin/logout | 12 |  | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/logs/route.ts` | API: /api/admin/logs | 123 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/api/admin/publish-article/route.ts` | API: /api/admin/publish-article | 106 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/api/admin/seed-supabase/route.ts` | API: /api/admin/seed-supabase | 70 |  | 0% | 0 | 3 | stays -- the path is the URL (CR-01) |
| `app/api/admin/stats/route.ts` | API: /api/admin/stats | 163 |  | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/chat/route.ts` | API: /api/chat | 162 |  | 79.0% | 1 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/cron/refresh-news/route.ts` | API: /api/cron/refresh-news | 120 |  | 0% | 0 | 3 | stays -- the path is the URL (CR-01) |
| `app/api/news/check-new/route.ts` | API: /api/news/check-new | 51 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/api/news/scrape-article/route.ts` | API: /api/news/scrape-article | 556 |  | 0% | 0 | 4 | stays -- the path is the URL (CR-01) |
| `app/api/news/top-headlines/route.ts` | API: /api/news/top-headlines | 258 |  | 0% | 0 | 4 | stays -- the path is the URL (CR-01) |
| `app/api/translate/route.ts` | API: /api/translate | 54 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/article/[slug]/page.tsx` | Page: /article/[slug] | 103 |  | 0% | 0 | 4 | stays -- the path is the URL (CR-01) |
| `app/contact/page.tsx` | Page: /contact | 87 | directive | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/layout.tsx` | Root layout: providers, metadata, fonts | 70 |  | 0% | 0 | 4 | stays -- the path is the URL (CR-01) |
| `app/loading.tsx` | Route-level loading UI | 7 | directive | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/page.tsx` | Page: / | 39 |  | 0% | 0 | 3 | stays -- the path is the URL (CR-01) |
| `app/privacy/page.tsx` | Page: /privacy | 114 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/saved/page.tsx` | Page: /saved | 126 | directive | 0% | 0 | 7 | stays -- the path is the URL (CR-01) |
| `app/terms/page.tsx` | Page: /terms | 109 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |

### Features — `src/features/`

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `features/chat/components/Chatbot.tsx` | Chat drawer; streams /api/chat. Honest error handling | 192 | directive | 0% | 1 | 1 | stays |
| `features/chat/components/FloatingAiAssistant.tsx` | Floating button wrapping Chatbot | 37 | directive | 0% | 1 | 1 | stays |
| `features/chat/index.ts` | Public surface of chat. No server.ts: chat has no server code | 3 |  | 0% | 1 | 1 | stays |

### Components — `src/components/`

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `components/ArticleCard.tsx` | Feed card, featured and grid variants | 393 | directive | 0% | 3 | 8 | `features/news/components/ArticleCard.tsx` · slice 6 |
| `components/ArticleDetailView.tsx` | Article page body: text, translation, AI panel, share, related | 963 | directive | 0% | 1 | 6 | `features/news/components/ArticleDetailView.tsx` · slice 6 — split in F |
| `components/BreakingNewsBanner.tsx` | Public banner polling /api/admin/breaking-news (CR-08) | 79 | directive | 0% | 1 | 1 | `features/admin/components/BreakingNewsBanner.tsx` · slice 5 |
| `components/CategoryMegaMenu.tsx` | Hover mega-menu of category previews | 225 | directive | 0% | 1 | 5 | `features/news/components/CategoryMegaMenu.tsx` · slice 6 |
| `components/Footer.tsx` | Footer nav, category links, copyright bar | 214 | directive | 0% | 8 | 3 | `features/news/components/Footer.tsx` · slice 6 |
| `components/Header.tsx` | Nav, search, theme + language toggles, bookmarks count, clock | 568 | directive | 0% | 8 | 6 | `features/news/components/Header.tsx` · slice 6 — news masthead, not UI; split in F |
| `components/HomeClient.tsx` | Feed state, new-story polling, grid, load-more | 532 | directive | 0% | 1 | 10 | `features/news/components/HomeClient.tsx` · slice 6 — split in F |
| `components/MarqueeTicker.tsx` | Scrolling India/World headline ticker | 176 | directive | 0% | 2 | 3 | `features/news/components/MarqueeTicker.tsx` · slice 6 |
| `components/NewsSkeletonGrid.tsx` | Suspense fallback matching real card dimensions | 90 |  | 0% | 1 | 0 | `components/ui/NewsSkeletonGrid.tsx` · slice 4 |
| `components/ThemeSpinner.tsx` | Theme-aware loading spinner | 88 | directive | 0% | 2 | 1 | `components/ui/ThemeSpinner.tsx` · slice 4 |
| `components/admin/ActivityLog.tsx` | Paginated admin_logs viewer | 235 | directive | 0% | 1 | 3 | `features/admin/components/ActivityLog.tsx` · slice 5 |
| `components/admin/ArticlesTable.tsx` | Admin article list: filters, edit, delete, bulk | 751 | directive | 0% | 1 | 1 | `features/admin/components/ArticlesTable.tsx` · slice 5 — split in F |
| `components/admin/BreakingNewsManager.tsx` | Create/expire breaking news items | 289 | directive | 0% | 1 | 1 | `features/admin/components/BreakingNewsManager.tsx` · slice 5 |
| `components/admin/CategoryStatsCard.tsx` | Category/language/country breakdown | 362 | directive | 0% | 1 | 1 | `features/admin/components/CategoryStatsCard.tsx` · slice 5 |
| `components/admin/SyncDashboard.tsx` | Last/next sync, counts, manual sync | 198 | directive | 0% | 1 | 1 | `features/admin/components/SyncDashboard.tsx` · slice 5 |
| `components/admin/actionLabels.ts` | Display labels and icons for admin activity-log entries | 29 | bundled | 0% | 1 | 1 | `features/admin/components/actionLabels.ts` · slice 5 — only consumer is ActivityLog (SC-1) |

### Server — `src/server/` (backend-only)

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `server/auditLog.ts` | Writes admin_logs rows (logAdminAction) | 40 |  | 0% | 7 | 2 | stays |
| `server/auth/adminSession.ts` | HMAC session token issue/verify; timing-safe password compare | 69 |  | 0% | 3 | 0 | stays |
| `server/googleTranslate.ts` | Unofficial translate.googleapis.com client, bounded concurrency | 88 |  | 0% | 1 | 0 | stays |
| `server/supabase.ts` | Supabase client; prefers service-role key when present | 22 |  | 0% | 10 | 0 | stays |

### Library — `src/lib/` (the folder being split)

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `lib/bookmarks.ts` | localStorage saved articles + change event | 56 | directive | 96.4% | 4 | 1 | `features/news/bookmarks.ts` · slice 6 — stores Article objects, so not lib/ |
| `lib/cache.ts` | Upstash Redis with in-process Map fallback | 73 |  | 0% | 2 | 0 | stays |
| `lib/categoryClassifier.ts` | Haiku flags category tags an article does not fit (fail-open) | 133 |  | 0% | 1 | 1 | `features/news/server/categoryClassifier.ts` · slice 6 |
| `lib/db.ts` | Supabase reads/writes: filters, freshness, 7-day purge, upsert, stats | 571 |  | 0% | 5 | 4 | `features/news/server/db.ts` · slice 6 — news editorial policy is baked in, hence features/news |
| `lib/fetchNews.ts` | Server-side initial NewsData.io fetch for SSR | 127 |  | 0% | 1 | 2 | `features/news/server/fetchNews.ts` · slice 6 |
| `lib/newsConfig.ts` | Editorial policy: category map, script filters, spam/filler source lists, dedupe | 233 | bundled | 94.8% | 7 | 1 | `features/news/newsConfig.ts` · slice 6 |
| `lib/newsdata.ts` | Shared NewsData.io URL builder + row mapper; throws on failure | 114 |  | 0% | 1 | 2 | `features/news/server/newsdata.ts` · slice 6 |
| `lib/rateLimit.ts` | Fixed-window in-memory limiter; client IP extraction | 26 |  | 96.2% | 2 | 0 | stays |
| `lib/sentryScrub.ts` | Redacts secret env values from Sentry events | 52 |  | 0% | 4 | 0 | stays |
| `lib/urlValidation.ts` | SSRF guard: protocol allowlist + DNS resolution against blocked ranges | 122 |  | 0% | 1 | 0 | stays |

### Config — `src/config/` (static data)

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `config/categoryColors.ts` | Per-category hex/Tailwind class map | 78 | bundled | 0% | 1 | 0 | stays |
| `config/imageDomains.ts` | next/image hostname allowlist. Imported by next.config.ts at LOAD TIME | 105 | bundled | 0% | 2 | 0 | stays — CR-06: must import nothing |
| `config/topicImages.ts` | Keyword to Unsplash topic-image table + per-topic round robin | 414 | bundled | 0% | 5 | 2 | stays |
| `config/translations.ts` | EN/HI static strings; translateHeadline is a no-op stub | 199 | bundled | 0% | 8 | 0 | stays — shared, not a feature |

### Context and types

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `context/LanguageContext.tsx` | EN/HI provider, localStorage-backed | 57 | directive | 0% | 8 | 1 | stays — app-wide state provider, not a UI primitive |
| `context/ThemeContext.tsx` | Light/dark provider, localStorage-backed | 63 | directive | 0% | 18 | 0 | stays — app-wide state provider, not a UI primitive |
| `types/index.ts` | Article, NewsResponse, ScrapeResponse, ChatMessage, NewsDataRawArticle, AdminAction, AdminLog | 96 | bundled | excl. | 23 | 0 | stays |

### Framework-pinned (never move)

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `instrumentation-client.ts` | Sentry browser init | 13 |  | excl. | 0 | 1 | PINNED -- do not move |
| `instrumentation.ts` | Sentry server/edge init hook | 12 |  | excl. | 0 | 2 | PINNED -- do not move |
| `proxy.ts` | AUTH GATE. Next 16 Proxy (was middleware). Matches /admin/*, /api/admin/* | 46 |  | 0% | 0 | 1 | PINNED -- do not move |
| `sentry.edge.config.ts` | Sentry edge config | 8 |  | excl. | 1 | 1 | PINNED -- do not move |
| `sentry.server.config.ts` | Sentry Node config | 8 |  | excl. | 1 | 1 | PINNED -- do not move |

## Dependency index

One entry per module. **Imports** = project-internal modules this file imports. **Used by** = files
that import it, including tests and files outside `src/`. Edge kinds other than a plain value import
are labelled. A _(type)_ edge is erased at compile time and never reaches a bundle, but it still
breaks if its target moves — so it counts here, where the question is what a move would touch.

#### `app/about/page.tsx`

- **Imports:** `components/Footer.tsx`, `components/Header.tsx`
- **Used by:** —

#### `app/admin/login/page.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** —

#### `app/admin/page.tsx`

- **Imports:** `components/admin/ActivityLog.tsx`, `components/admin/ArticlesTable.tsx`, `components/admin/BreakingNewsManager.tsx`, `components/admin/CategoryStatsCard.tsx`, `components/admin/SyncDashboard.tsx`, `components/Footer.tsx`, `components/Header.tsx`, `components/MarqueeTicker.tsx`, `config/translations.ts`, `context/ThemeContext.tsx`
- **Used by:** —

#### `app/api/admin/articles/bulk/route.ts`

- **Imports:** `server/auditLog.ts`, `server/supabase.ts`
- **Used by:** —

#### `app/api/admin/articles/route.ts`

- **Imports:** `server/auditLog.ts`, `server/supabase.ts`
- **Used by:** —

#### `app/api/admin/breaking-news/route.ts`

- **Imports:** `server/auditLog.ts`, `server/supabase.ts`
- **Used by:** —

#### `app/api/admin/db-stats/route.ts`

- **Imports:** `lib/db.ts`, `server/auditLog.ts`
- **Used by:** —

#### `app/api/admin/login/route.ts`

- **Imports:** `server/auth/adminSession.ts`
- **Used by:** —

#### `app/api/admin/logout/route.ts`

- **Imports:** `server/auth/adminSession.ts`
- **Used by:** —

#### `app/api/admin/logs/route.ts`

- **Imports:** `server/supabase.ts`, `types/index.ts` _(type)_
- **Used by:** —

#### `app/api/admin/publish-article/route.ts`

- **Imports:** `server/auditLog.ts`, `server/supabase.ts`
- **Used by:** —

#### `app/api/admin/seed-supabase/route.ts`

- **Imports:** `lib/db.ts`, `server/auditLog.ts`, `types/index.ts` _(type)_
- **Used by:** —

#### `app/api/admin/stats/route.ts`

- **Imports:** `server/supabase.ts`
- **Used by:** —

#### `app/api/chat/route.ts`

- **Imports:** `lib/rateLimit.ts`
- **Used by:** `app/api/chat/route.test.ts` _(test)_

#### `app/api/cron/refresh-news/route.ts`

- **Imports:** `lib/db.ts`, `lib/newsdata.ts`, `server/auditLog.ts`
- **Used by:** —

#### `app/api/news/check-new/route.ts`

- **Imports:** `lib/db.ts`, `lib/newsConfig.ts`
- **Used by:** —

#### `app/api/news/scrape-article/route.ts`

- **Imports:** `lib/cache.ts`, `lib/sentryScrub.ts`, `lib/urlValidation.ts`, `server/supabase.ts` _(dynamic)_
- **Used by:** —

#### `app/api/news/top-headlines/route.ts`

- **Imports:** `lib/cache.ts`, `lib/db.ts`, `lib/newsConfig.ts`, `types/index.ts`
- **Used by:** —

#### `app/api/translate/route.ts`

- **Imports:** `lib/rateLimit.ts`, `server/googleTranslate.ts`
- **Used by:** —

#### `app/article/[slug]/page.tsx`

- **Imports:** `components/ArticleDetailView.tsx`, `components/Footer.tsx`, `components/Header.tsx`, `types/index.ts`
- **Used by:** —

#### `app/contact/page.tsx`

- **Imports:** `components/Footer.tsx`, `components/Header.tsx`
- **Used by:** —

#### `app/layout.tsx`

- **Imports:** `components/BreakingNewsBanner.tsx`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `features/chat/index.ts`
- **Used by:** —

#### `app/loading.tsx`

- **Imports:** `components/ThemeSpinner.tsx`
- **Used by:** —

#### `app/page.tsx`

- **Imports:** `components/HomeClient.tsx`, `components/NewsSkeletonGrid.tsx`, `lib/fetchNews.ts`
- **Used by:** —

#### `app/privacy/page.tsx`

- **Imports:** `components/Footer.tsx`, `components/Header.tsx`
- **Used by:** —

#### `app/saved/page.tsx`

- **Imports:** `components/ArticleCard.tsx`, `components/Footer.tsx`, `components/Header.tsx`, `config/topicImages.ts`, `context/ThemeContext.tsx`, `lib/bookmarks.ts`, `types/index.ts`
- **Used by:** —

#### `app/terms/page.tsx`

- **Imports:** `components/Footer.tsx`, `components/Header.tsx`
- **Used by:** —

#### `components/ArticleCard.tsx`

- **Imports:** `config/categoryColors.ts`, `config/topicImages.ts`, `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `lib/bookmarks.ts`, `lib/newsConfig.ts`, `types/index.ts`
- **Used by:** `app/saved/page.tsx`, `components/ArticleDetailView.tsx`, `components/HomeClient.tsx`

#### `components/ArticleDetailView.tsx`

- **Imports:** `components/ArticleCard.tsx`, `config/topicImages.ts`, `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `types/index.ts`
- **Used by:** `app/article/[slug]/page.tsx`

#### `components/BreakingNewsBanner.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `app/layout.tsx`

#### `components/CategoryMegaMenu.tsx`

- **Imports:** `config/topicImages.ts`, `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `types/index.ts`
- **Used by:** `components/Header.tsx`

#### `components/Footer.tsx`

- **Imports:** `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`
- **Used by:** `app/about/page.tsx`, `app/admin/page.tsx`, `app/article/[slug]/page.tsx`, `app/contact/page.tsx`, `app/privacy/page.tsx`, `app/saved/page.tsx`, `app/terms/page.tsx`, `components/HomeClient.tsx`

#### `components/Header.tsx`

- **Imports:** `components/CategoryMegaMenu.tsx`, `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `lib/bookmarks.ts`, `types/index.ts`
- **Used by:** `app/about/page.tsx`, `app/admin/page.tsx`, `app/article/[slug]/page.tsx`, `app/contact/page.tsx`, `app/privacy/page.tsx`, `app/saved/page.tsx`, `app/terms/page.tsx`, `components/HomeClient.tsx`

#### `components/HomeClient.tsx`

- **Imports:** `components/ArticleCard.tsx`, `components/Footer.tsx`, `components/Header.tsx`, `components/MarqueeTicker.tsx`, `components/ThemeSpinner.tsx`, `config/topicImages.ts`, `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `types/index.ts`
- **Used by:** `app/page.tsx`

#### `components/MarqueeTicker.tsx`

- **Imports:** `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `types/index.ts`
- **Used by:** `app/admin/page.tsx`, `components/HomeClient.tsx`

#### `components/NewsSkeletonGrid.tsx`

- **Imports:** —
- **Used by:** `app/page.tsx`

#### `components/ThemeSpinner.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `app/loading.tsx`, `components/HomeClient.tsx`

#### `components/admin/ActivityLog.tsx`

- **Imports:** `components/admin/actionLabels.ts`, `context/ThemeContext.tsx`, `types/index.ts` _(type)_
- **Used by:** `app/admin/page.tsx`

#### `components/admin/ArticlesTable.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `app/admin/page.tsx`

#### `components/admin/BreakingNewsManager.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `app/admin/page.tsx`

#### `components/admin/CategoryStatsCard.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `app/admin/page.tsx`

#### `components/admin/SyncDashboard.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `app/admin/page.tsx`

#### `components/admin/actionLabels.ts`

- **Imports:** `types/index.ts` _(type)_
- **Used by:** `components/admin/ActivityLog.tsx`

#### `config/categoryColors.ts`

- **Imports:** —
- **Used by:** `components/ArticleCard.tsx`

#### `config/imageDomains.ts`

- **Imports:** —
- **Used by:** `next.config.ts`, `config/topicImages.ts`

#### `config/topicImages.ts`

- **Imports:** `config/imageDomains.ts`, `types/index.ts`
- **Used by:** `app/saved/page.tsx`, `components/ArticleCard.tsx`, `components/ArticleDetailView.tsx`, `components/CategoryMegaMenu.tsx`, `components/HomeClient.tsx`

#### `config/translations.ts`

- **Imports:** —
- **Used by:** `app/admin/page.tsx`, `components/ArticleCard.tsx`, `components/ArticleDetailView.tsx`, `components/CategoryMegaMenu.tsx`, `components/Footer.tsx`, `components/Header.tsx`, `components/HomeClient.tsx`, `context/LanguageContext.tsx`

#### `context/LanguageContext.tsx`

- **Imports:** `config/translations.ts`
- **Used by:** `app/layout.tsx`, `components/ArticleCard.tsx`, `components/ArticleDetailView.tsx`, `components/CategoryMegaMenu.tsx`, `components/Footer.tsx`, `components/Header.tsx`, `components/HomeClient.tsx`, `components/MarqueeTicker.tsx`

#### `context/ThemeContext.tsx`

- **Imports:** —
- **Used by:** `app/admin/login/page.tsx`, `app/admin/page.tsx`, `app/layout.tsx`, `app/saved/page.tsx`, `components/admin/ActivityLog.tsx`, `components/admin/ArticlesTable.tsx`, `components/admin/BreakingNewsManager.tsx`, `components/admin/CategoryStatsCard.tsx`, `components/admin/SyncDashboard.tsx`, `components/ArticleCard.tsx`, `components/ArticleDetailView.tsx`, `components/BreakingNewsBanner.tsx`, `components/CategoryMegaMenu.tsx`, `components/Footer.tsx`, `components/Header.tsx`, `components/HomeClient.tsx`, `components/MarqueeTicker.tsx`, `components/ThemeSpinner.tsx`

#### `features/chat/components/Chatbot.tsx`

- **Imports:** `types/index.ts`
- **Used by:** `features/chat/components/FloatingAiAssistant.tsx`

#### `features/chat/components/FloatingAiAssistant.tsx`

- **Imports:** `features/chat/components/Chatbot.tsx`
- **Used by:** `features/chat/index.ts` _(reexport)_

#### `features/chat/index.ts`

- **Imports:** `features/chat/components/FloatingAiAssistant.tsx` _(reexport)_
- **Used by:** `app/layout.tsx`

#### `instrumentation-client.ts`

- **Imports:** `lib/sentryScrub.ts`
- **Used by:** —

#### `instrumentation.ts`

- **Imports:** `sentry.edge.config.ts` _(dynamic)_, `sentry.server.config.ts` _(dynamic)_
- **Used by:** —

#### `lib/bookmarks.ts`

- **Imports:** `types/index.ts`
- **Used by:** `app/saved/page.tsx`, `components/ArticleCard.tsx`, `components/Header.tsx`, `lib/bookmarks.test.ts` _(test)_

#### `lib/cache.ts`

- **Imports:** —
- **Used by:** `app/api/news/scrape-article/route.ts`, `app/api/news/top-headlines/route.ts`

#### `lib/categoryClassifier.ts`

- **Imports:** `server/supabase.ts`
- **Used by:** `lib/db.ts`

#### `lib/db.ts`

- **Imports:** `lib/categoryClassifier.ts`, `lib/newsConfig.ts`, `server/supabase.ts`, `types/index.ts`
- **Used by:** `app/api/admin/db-stats/route.ts`, `app/api/admin/seed-supabase/route.ts`, `app/api/cron/refresh-news/route.ts`, `app/api/news/check-new/route.ts`, `app/api/news/top-headlines/route.ts`

#### `lib/fetchNews.ts`

- **Imports:** `lib/newsConfig.ts`, `types/index.ts`
- **Used by:** `app/page.tsx`

#### `lib/newsConfig.ts`

- **Imports:** `types/index.ts`
- **Used by:** `app/api/news/check-new/route.ts`, `app/api/news/top-headlines/route.ts`, `components/ArticleCard.tsx`, `lib/db.ts`, `lib/fetchNews.ts`, `lib/newsConfig.test.ts` _(test)_, `lib/newsdata.ts`

#### `lib/newsdata.ts`

- **Imports:** `lib/newsConfig.ts`, `types/index.ts`
- **Used by:** `app/api/cron/refresh-news/route.ts`

#### `lib/rateLimit.ts`

- **Imports:** —
- **Used by:** `app/api/chat/route.ts`, `app/api/translate/route.ts`

#### `lib/sentryScrub.ts`

- **Imports:** —
- **Used by:** `app/api/news/scrape-article/route.ts`, `instrumentation-client.ts`, `sentry.edge.config.ts`, `sentry.server.config.ts`

#### `lib/urlValidation.ts`

- **Imports:** —
- **Used by:** `app/api/news/scrape-article/route.ts`

#### `proxy.ts`

- **Imports:** `server/auth/adminSession.ts`
- **Used by:** —

#### `sentry.edge.config.ts`

- **Imports:** `lib/sentryScrub.ts`
- **Used by:** `instrumentation.ts` _(dynamic)_

#### `sentry.server.config.ts`

- **Imports:** `lib/sentryScrub.ts`
- **Used by:** `instrumentation.ts` _(dynamic)_

#### `server/auditLog.ts`

- **Imports:** `server/supabase.ts`, `types/index.ts` _(type)_
- **Used by:** `app/api/admin/articles/bulk/route.ts`, `app/api/admin/articles/route.ts`, `app/api/admin/breaking-news/route.ts`, `app/api/admin/db-stats/route.ts`, `app/api/admin/publish-article/route.ts`, `app/api/admin/seed-supabase/route.ts`, `app/api/cron/refresh-news/route.ts`

#### `server/auth/adminSession.ts`

- **Imports:** —
- **Used by:** `app/api/admin/login/route.ts`, `app/api/admin/logout/route.ts`, `proxy.ts`

#### `server/googleTranslate.ts`

- **Imports:** —
- **Used by:** `app/api/translate/route.ts`

#### `server/supabase.ts`

- **Imports:** —
- **Used by:** `app/api/admin/articles/bulk/route.ts`, `app/api/admin/articles/route.ts`, `app/api/admin/breaking-news/route.ts`, `app/api/admin/logs/route.ts`, `app/api/admin/publish-article/route.ts`, `app/api/admin/stats/route.ts`, `app/api/news/scrape-article/route.ts` _(dynamic)_, `lib/categoryClassifier.ts`, `lib/db.ts`, `server/auditLog.ts`

#### `types/index.ts`

- **Imports:** —
- **Used by:** `app/api/admin/logs/route.ts` _(type)_, `app/api/admin/seed-supabase/route.ts` _(type)_, `app/api/news/top-headlines/route.ts`, `app/article/[slug]/page.tsx`, `app/saved/page.tsx`, `components/admin/actionLabels.ts` _(type)_, `components/admin/ActivityLog.tsx` _(type)_, `components/ArticleCard.tsx`, `components/ArticleDetailView.tsx`, `components/CategoryMegaMenu.tsx`, `components/Header.tsx`, `components/HomeClient.tsx`, `components/MarqueeTicker.tsx`, `config/topicImages.ts`, `features/chat/components/Chatbot.tsx`, `lib/bookmarks.test.ts` _(test)_, `lib/bookmarks.ts`, `lib/db.ts`, `lib/fetchNews.ts`, `lib/newsConfig.test.ts` _(test)_, `lib/newsConfig.ts`, `lib/newsdata.ts`, `server/auditLog.ts` _(type)_
