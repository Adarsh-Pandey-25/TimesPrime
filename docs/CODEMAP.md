# CODEMAP — every module, what it does, where it goes

**Read this instead of re-analysing the codebase.** If the question is "where does X live",
"what imports Y" or "what moves where", it is answered here. Do not grep the tree to re-derive it.

Generated at commit `d892cf2` by `node scripts/generate-codemap.mjs`. Coverage read from
`coverage/coverage-final.json` (written 2026-10-30 05:17 UTC) — run `npm run test:ci` first for current numbers.

Every column except **Purpose** and **Target** is derived. Imports come from parsing each file with
the TypeScript compiler API, so comments and strings cannot create false edges, `import type` is
recognised, dynamic `import()` and `export … from` are captured, and aliases are resolved from
`tsconfig.json`. Files outside `src/` (notably `next.config.ts`) are scanned as importers too.

**Regenerate after any file move.** A stale CODEMAP is worse than none, because it is trusted.

## At a glance

| | |
|---|---|
| Modules (excl. tests) | **75** |
| Modules with a `"use client"` directive | **24** |
| Modules in the client bundle (directive + pulled in) | **33** |
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
| 8 | `src/config/translations.ts` |
| 8 | `src/context/LanguageContext.tsx` |
| 8 | `src/features/news/index.ts` |

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
| `app/about/page.tsx` | Page: /about | 97 |  | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/admin/login/page.tsx` | Page: /admin/login | 103 | directive | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/admin/page.tsx` | Page: /admin | 506 | directive | 0% | 0 | 4 | stays -- the path is the URL (CR-01) |
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
| `app/api/cron/refresh-news/route.ts` | API: /api/cron/refresh-news | 120 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/api/news/check-new/route.ts` | API: /api/news/check-new | 51 |  | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/news/scrape-article/route.ts` | API: /api/news/scrape-article | 556 |  | 0% | 0 | 4 | stays -- the path is the URL (CR-01) |
| `app/api/news/top-headlines/route.ts` | API: /api/news/top-headlines | 258 |  | 0% | 0 | 3 | stays -- the path is the URL (CR-01) |
| `app/api/translate/route.ts` | API: /api/translate | 54 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/article/[slug]/page.tsx` | Page: /article/[slug] | 101 |  | 0% | 0 | 2 | stays -- the path is the URL (CR-01) |
| `app/contact/page.tsx` | Page: /contact | 86 | directive | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/layout.tsx` | Root layout: providers, metadata, fonts | 70 |  | 0% | 0 | 4 | stays -- the path is the URL (CR-01) |
| `app/loading.tsx` | Route-level loading UI | 7 | directive | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/page.tsx` | Page: / | 39 |  | 0% | 0 | 3 | stays -- the path is the URL (CR-01) |
| `app/privacy/page.tsx` | Page: /privacy | 113 |  | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/saved/page.tsx` | Page: /saved | 123 | directive | 0% | 0 | 4 | stays -- the path is the URL (CR-01) |
| `app/terms/page.tsx` | Page: /terms | 108 |  | 0% | 0 | 1 | stays -- the path is the URL (CR-01) |

### Features — `src/features/`

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `features/admin/components/ActivityLog.tsx` | Paginated admin_logs viewer | 235 | directive | 0% | 1 | 3 | stays |
| `features/admin/components/ArticlesTable.tsx` | Admin article list: filters, edit, delete, bulk | 751 | directive | 0% | 1 | 1 | stays — split in F |
| `features/admin/components/BreakingNewsBanner.tsx` | Public banner polling /api/admin/breaking-news (CR-08) | 79 | directive | 0% | 1 | 1 | stays |
| `features/admin/components/BreakingNewsManager.tsx` | Create/expire breaking news items | 289 | directive | 0% | 1 | 1 | stays |
| `features/admin/components/CategoryStatsCard.tsx` | Category/language/country breakdown | 362 | directive | 0% | 1 | 1 | stays |
| `features/admin/components/SyncDashboard.tsx` | Last/next sync, counts, manual sync | 198 | directive | 0% | 1 | 1 | stays |
| `features/admin/components/actionLabels.ts` | Display labels and icons for admin activity-log entries | 29 | bundled | 0% | 1 | 1 | stays — only consumer is ActivityLog (SC-1) |
| `features/admin/index.ts` | Public surface of admin. No server.ts: admin has no server code | 8 | bundled | 0% | 2 | 6 | stays |
| `features/chat/components/Chatbot.tsx` | Chat drawer; streams /api/chat. Honest error handling | 192 | directive | 0% | 1 | 1 | stays |
| `features/chat/components/FloatingAiAssistant.tsx` | Floating button wrapping Chatbot | 37 | directive | 0% | 1 | 1 | stays |
| `features/chat/index.ts` | Public surface of chat. No server.ts: chat has no server code | 3 |  | 0% | 1 | 1 | stays |
| `features/news/bookmarks.ts` | localStorage saved articles + change event | 56 | directive | 96.4% | 4 | 1 | stays — stores Article objects, so not lib/ |
| `features/news/components/ArticleCard.tsx` | Feed card, featured and grid variants | 393 | directive | 0% | 3 | 8 | stays |
| `features/news/components/ArticleDetailView.tsx` | Article page body: text, translation, AI panel, share, related | 963 | directive | 0% | 1 | 6 | stays — split in F |
| `features/news/components/CategoryMegaMenu.tsx` | Hover mega-menu of category previews | 225 | directive | 0% | 1 | 5 | stays |
| `features/news/components/Footer.tsx` | Footer nav, category links, copyright bar | 214 | directive | 0% | 2 | 3 | stays |
| `features/news/components/Header.tsx` | Nav, search, theme + language toggles, bookmarks count, clock | 568 | directive | 0% | 2 | 6 | stays — news masthead, not UI; split in F |
| `features/news/components/HomeClient.tsx` | Feed state, new-story polling, grid, load-more | 532 | directive | 0% | 1 | 10 | stays — split in F |
| `features/news/components/MarqueeTicker.tsx` | Scrolling India/World headline ticker | 176 | directive | 0% | 2 | 3 | stays |
| `features/news/index.ts` | Client-safe public surface of news: components and bookmark helpers | 10 | bundled | 0% | 8 | 7 | stays |
| `features/news/newsConfig.ts` | Editorial policy: category map, script filters, spam/filler source lists, dedupe | 233 | bundled | 94.8% | 6 | 1 | stays |
| `features/news/server.ts` | Server-only public surface of news: storage, upstream fetch, editorial policy | 25 |  | 0% | 6 | 4 | stays — first line: import "server-only" |
| `features/news/server/categoryClassifier.ts` | Haiku flags category tags an article does not fit (fail-open) | 133 |  | 0% | 1 | 1 | stays |
| `features/news/server/db.ts` | Supabase reads/writes: filters, freshness, 7-day purge, upsert, stats | 571 |  | 0% | 1 | 4 | stays — news editorial policy is baked in, hence features/news |
| `features/news/server/fetchNews.ts` | Server-side initial NewsData.io fetch for SSR | 127 |  | 0% | 1 | 2 | stays |
| `features/news/server/newsdata.ts` | Shared NewsData.io URL builder + row mapper; throws on failure | 114 |  | 0% | 1 | 2 | stays |

### Components — `src/components/`

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `components/ui/NewsSkeletonGrid.tsx` | Suspense fallback matching real card dimensions | 90 |  | 0% | 1 | 0 | stays |
| `components/ui/ThemeSpinner.tsx` | Theme-aware loading spinner | 88 | directive | 0% | 2 | 1 | stays |

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
| `lib/cache.ts` | Upstash Redis with in-process Map fallback | 73 |  | 0% | 2 | 0 | stays |
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

- **Imports:** `features/news/index.ts`
- **Used by:** —

#### `app/admin/login/page.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** —

#### `app/admin/page.tsx`

- **Imports:** `config/translations.ts`, `context/ThemeContext.tsx`, `features/admin/index.ts`, `features/news/index.ts`
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

- **Imports:** `features/news/server.ts`, `server/auditLog.ts`
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

- **Imports:** `features/news/server.ts`, `server/auditLog.ts`, `types/index.ts` _(type)_
- **Used by:** —

#### `app/api/admin/stats/route.ts`

- **Imports:** `server/supabase.ts`
- **Used by:** —

#### `app/api/chat/route.ts`

- **Imports:** `lib/rateLimit.ts`
- **Used by:** `app/api/chat/route.test.ts` _(test)_

#### `app/api/cron/refresh-news/route.ts`

- **Imports:** `features/news/server.ts`, `server/auditLog.ts`
- **Used by:** —

#### `app/api/news/check-new/route.ts`

- **Imports:** `features/news/server.ts`
- **Used by:** —

#### `app/api/news/scrape-article/route.ts`

- **Imports:** `lib/cache.ts`, `lib/sentryScrub.ts`, `lib/urlValidation.ts`, `server/supabase.ts` _(dynamic)_
- **Used by:** —

#### `app/api/news/top-headlines/route.ts`

- **Imports:** `features/news/server.ts`, `lib/cache.ts`, `types/index.ts`
- **Used by:** —

#### `app/api/translate/route.ts`

- **Imports:** `lib/rateLimit.ts`, `server/googleTranslate.ts`
- **Used by:** —

#### `app/article/[slug]/page.tsx`

- **Imports:** `features/news/index.ts`, `types/index.ts`
- **Used by:** —

#### `app/contact/page.tsx`

- **Imports:** `features/news/index.ts`
- **Used by:** —

#### `app/layout.tsx`

- **Imports:** `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `features/admin/index.ts`, `features/chat/index.ts`
- **Used by:** —

#### `app/loading.tsx`

- **Imports:** `components/ui/ThemeSpinner.tsx`
- **Used by:** —

#### `app/page.tsx`

- **Imports:** `components/ui/NewsSkeletonGrid.tsx`, `features/news/index.ts`, `features/news/server.ts`
- **Used by:** —

#### `app/privacy/page.tsx`

- **Imports:** `features/news/index.ts`
- **Used by:** —

#### `app/saved/page.tsx`

- **Imports:** `config/topicImages.ts`, `context/ThemeContext.tsx`, `features/news/index.ts`, `types/index.ts`
- **Used by:** —

#### `app/terms/page.tsx`

- **Imports:** `features/news/index.ts`
- **Used by:** —

#### `components/ui/NewsSkeletonGrid.tsx`

- **Imports:** —
- **Used by:** `app/page.tsx`

#### `components/ui/ThemeSpinner.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `app/loading.tsx`, `features/news/components/HomeClient.tsx`

#### `config/categoryColors.ts`

- **Imports:** —
- **Used by:** `features/news/components/ArticleCard.tsx`

#### `config/imageDomains.ts`

- **Imports:** —
- **Used by:** `next.config.ts`, `config/topicImages.ts`

#### `config/topicImages.ts`

- **Imports:** `config/imageDomains.ts`, `types/index.ts`
- **Used by:** `app/saved/page.tsx`, `features/news/components/ArticleCard.tsx`, `features/news/components/ArticleDetailView.tsx`, `features/news/components/CategoryMegaMenu.tsx`, `features/news/components/HomeClient.tsx`

#### `config/translations.ts`

- **Imports:** —
- **Used by:** `app/admin/page.tsx`, `context/LanguageContext.tsx`, `features/news/components/ArticleCard.tsx`, `features/news/components/ArticleDetailView.tsx`, `features/news/components/CategoryMegaMenu.tsx`, `features/news/components/Footer.tsx`, `features/news/components/Header.tsx`, `features/news/components/HomeClient.tsx`

#### `context/LanguageContext.tsx`

- **Imports:** `config/translations.ts`
- **Used by:** `app/layout.tsx`, `features/news/components/ArticleCard.tsx`, `features/news/components/ArticleDetailView.tsx`, `features/news/components/CategoryMegaMenu.tsx`, `features/news/components/Footer.tsx`, `features/news/components/Header.tsx`, `features/news/components/HomeClient.tsx`, `features/news/components/MarqueeTicker.tsx`

#### `context/ThemeContext.tsx`

- **Imports:** —
- **Used by:** `app/admin/login/page.tsx`, `app/admin/page.tsx`, `app/layout.tsx`, `app/saved/page.tsx`, `components/ui/ThemeSpinner.tsx`, `features/admin/components/ActivityLog.tsx`, `features/admin/components/ArticlesTable.tsx`, `features/admin/components/BreakingNewsBanner.tsx`, `features/admin/components/BreakingNewsManager.tsx`, `features/admin/components/CategoryStatsCard.tsx`, `features/admin/components/SyncDashboard.tsx`, `features/news/components/ArticleCard.tsx`, `features/news/components/ArticleDetailView.tsx`, `features/news/components/CategoryMegaMenu.tsx`, `features/news/components/Footer.tsx`, `features/news/components/Header.tsx`, `features/news/components/HomeClient.tsx`, `features/news/components/MarqueeTicker.tsx`

#### `features/admin/components/ActivityLog.tsx`

- **Imports:** `context/ThemeContext.tsx`, `features/admin/components/actionLabels.ts`, `types/index.ts` _(type)_
- **Used by:** `features/admin/index.ts` _(reexport)_

#### `features/admin/components/ArticlesTable.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `features/admin/index.ts` _(reexport)_

#### `features/admin/components/BreakingNewsBanner.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `features/admin/index.ts` _(reexport)_

#### `features/admin/components/BreakingNewsManager.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `features/admin/index.ts` _(reexport)_

#### `features/admin/components/CategoryStatsCard.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `features/admin/index.ts` _(reexport)_

#### `features/admin/components/SyncDashboard.tsx`

- **Imports:** `context/ThemeContext.tsx`
- **Used by:** `features/admin/index.ts` _(reexport)_

#### `features/admin/components/actionLabels.ts`

- **Imports:** `types/index.ts` _(type)_
- **Used by:** `features/admin/components/ActivityLog.tsx`

#### `features/admin/index.ts`

- **Imports:** `features/admin/components/ActivityLog.tsx` _(reexport)_, `features/admin/components/ArticlesTable.tsx` _(reexport)_, `features/admin/components/BreakingNewsBanner.tsx` _(reexport)_, `features/admin/components/BreakingNewsManager.tsx` _(reexport)_, `features/admin/components/CategoryStatsCard.tsx` _(reexport)_, `features/admin/components/SyncDashboard.tsx` _(reexport)_
- **Used by:** `app/admin/page.tsx`, `app/layout.tsx`

#### `features/chat/components/Chatbot.tsx`

- **Imports:** `types/index.ts`
- **Used by:** `features/chat/components/FloatingAiAssistant.tsx`

#### `features/chat/components/FloatingAiAssistant.tsx`

- **Imports:** `features/chat/components/Chatbot.tsx`
- **Used by:** `features/chat/index.ts` _(reexport)_

#### `features/chat/index.ts`

- **Imports:** `features/chat/components/FloatingAiAssistant.tsx` _(reexport)_
- **Used by:** `app/layout.tsx`

#### `features/news/bookmarks.ts`

- **Imports:** `types/index.ts`
- **Used by:** `features/news/bookmarks.test.ts` _(test)_, `features/news/components/ArticleCard.tsx`, `features/news/components/Header.tsx`, `features/news/index.ts` _(reexport)_

#### `features/news/components/ArticleCard.tsx`

- **Imports:** `config/categoryColors.ts`, `config/topicImages.ts`, `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `features/news/bookmarks.ts`, `features/news/newsConfig.ts`, `types/index.ts`
- **Used by:** `features/news/components/ArticleDetailView.tsx`, `features/news/components/HomeClient.tsx`, `features/news/index.ts` _(reexport)_

#### `features/news/components/ArticleDetailView.tsx`

- **Imports:** `config/topicImages.ts`, `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `features/news/components/ArticleCard.tsx`, `types/index.ts`
- **Used by:** `features/news/index.ts` _(reexport)_

#### `features/news/components/CategoryMegaMenu.tsx`

- **Imports:** `config/topicImages.ts`, `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `types/index.ts`
- **Used by:** `features/news/components/Header.tsx`

#### `features/news/components/Footer.tsx`

- **Imports:** `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`
- **Used by:** `features/news/components/HomeClient.tsx`, `features/news/index.ts` _(reexport)_

#### `features/news/components/Header.tsx`

- **Imports:** `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `features/news/bookmarks.ts`, `features/news/components/CategoryMegaMenu.tsx`, `types/index.ts`
- **Used by:** `features/news/components/HomeClient.tsx`, `features/news/index.ts` _(reexport)_

#### `features/news/components/HomeClient.tsx`

- **Imports:** `components/ui/ThemeSpinner.tsx`, `config/topicImages.ts`, `config/translations.ts`, `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `features/news/components/ArticleCard.tsx`, `features/news/components/Footer.tsx`, `features/news/components/Header.tsx`, `features/news/components/MarqueeTicker.tsx`, `types/index.ts`
- **Used by:** `features/news/index.ts` _(reexport)_

#### `features/news/components/MarqueeTicker.tsx`

- **Imports:** `context/LanguageContext.tsx`, `context/ThemeContext.tsx`, `types/index.ts`
- **Used by:** `features/news/components/HomeClient.tsx`, `features/news/index.ts` _(reexport)_

#### `features/news/index.ts`

- **Imports:** `features/news/bookmarks.ts` _(reexport)_, `features/news/components/ArticleCard.tsx` _(reexport)_, `features/news/components/ArticleDetailView.tsx` _(reexport)_, `features/news/components/Footer.tsx` _(reexport)_, `features/news/components/Header.tsx` _(reexport)_, `features/news/components/HomeClient.tsx` _(reexport)_, `features/news/components/MarqueeTicker.tsx` _(reexport)_
- **Used by:** `app/about/page.tsx`, `app/admin/page.tsx`, `app/article/[slug]/page.tsx`, `app/contact/page.tsx`, `app/page.tsx`, `app/privacy/page.tsx`, `app/saved/page.tsx`, `app/terms/page.tsx`

#### `features/news/newsConfig.ts`

- **Imports:** `types/index.ts`
- **Used by:** `features/news/components/ArticleCard.tsx`, `features/news/newsConfig.test.ts` _(test)_, `features/news/server.ts` _(reexport)_, `features/news/server/db.ts`, `features/news/server/fetchNews.ts`, `features/news/server/newsdata.ts`

#### `features/news/server.ts`

- **Imports:** `features/news/newsConfig.ts` _(reexport)_, `features/news/server/db.ts` _(reexport)_, `features/news/server/fetchNews.ts` _(reexport)_, `features/news/server/newsdata.ts` _(reexport)_
- **Used by:** `app/api/admin/db-stats/route.ts`, `app/api/admin/seed-supabase/route.ts`, `app/api/cron/refresh-news/route.ts`, `app/api/news/check-new/route.ts`, `app/api/news/top-headlines/route.ts`, `app/page.tsx`

#### `features/news/server/categoryClassifier.ts`

- **Imports:** `server/supabase.ts`
- **Used by:** `features/news/server/db.ts`

#### `features/news/server/db.ts`

- **Imports:** `features/news/newsConfig.ts`, `features/news/server/categoryClassifier.ts`, `server/supabase.ts`, `types/index.ts`
- **Used by:** `features/news/server.ts` _(reexport)_

#### `features/news/server/fetchNews.ts`

- **Imports:** `features/news/newsConfig.ts`, `types/index.ts`
- **Used by:** `features/news/server.ts` _(reexport)_

#### `features/news/server/newsdata.ts`

- **Imports:** `features/news/newsConfig.ts`, `types/index.ts`
- **Used by:** `features/news/server.ts` _(reexport)_

#### `instrumentation-client.ts`

- **Imports:** `lib/sentryScrub.ts`
- **Used by:** —

#### `instrumentation.ts`

- **Imports:** `sentry.edge.config.ts` _(dynamic)_, `sentry.server.config.ts` _(dynamic)_
- **Used by:** —

#### `lib/cache.ts`

- **Imports:** —
- **Used by:** `app/api/news/scrape-article/route.ts`, `app/api/news/top-headlines/route.ts`

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
- **Used by:** `app/api/admin/articles/bulk/route.ts`, `app/api/admin/articles/route.ts`, `app/api/admin/breaking-news/route.ts`, `app/api/admin/logs/route.ts`, `app/api/admin/publish-article/route.ts`, `app/api/admin/stats/route.ts`, `app/api/news/scrape-article/route.ts` _(dynamic)_, `features/news/server/categoryClassifier.ts`, `features/news/server/db.ts`, `server/auditLog.ts`

#### `types/index.ts`

- **Imports:** —
- **Used by:** `app/api/admin/logs/route.ts` _(type)_, `app/api/admin/seed-supabase/route.ts` _(type)_, `app/api/news/top-headlines/route.ts`, `app/article/[slug]/page.tsx`, `app/saved/page.tsx`, `config/topicImages.ts`, `features/admin/components/actionLabels.ts` _(type)_, `features/admin/components/ActivityLog.tsx` _(type)_, `features/chat/components/Chatbot.tsx`, `features/news/bookmarks.test.ts` _(test)_, `features/news/bookmarks.ts`, `features/news/components/ArticleCard.tsx`, `features/news/components/ArticleDetailView.tsx`, `features/news/components/CategoryMegaMenu.tsx`, `features/news/components/Header.tsx`, `features/news/components/HomeClient.tsx`, `features/news/components/MarqueeTicker.tsx`, `features/news/newsConfig.test.ts` _(test)_, `features/news/newsConfig.ts`, `features/news/server/db.ts`, `features/news/server/fetchNews.ts`, `features/news/server/newsdata.ts`, `server/auditLog.ts` _(type)_
