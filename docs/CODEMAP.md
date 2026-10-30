# CODEMAP — every module, what it does, what touches it

**Read this instead of re-analysing the codebase.** If the question is "where does X live",
"what imports Y" or "what would a change to Z touch", it is answered here. Do not grep the tree to re-derive it.

Generated at commit `be74120` by `node scripts/generate-codemap.mjs`. Coverage read from
`coverage/coverage-final.json` (written 2026-10-30 11:39 UTC) — run `npm run test:ci` first for current numbers.

Every column except **Purpose** and **Target** is derived. Imports come from parsing each file with
the TypeScript compiler API, so comments and strings cannot create false edges, `import type` is
recognised, dynamic `import()` and `export … from` are captured, and aliases are resolved from
`tsconfig.json`. Root tooling (notably `next.config.ts`) and `scripts/` are scanned as importers too.

**Regenerate after any file move.** A stale CODEMAP is worse than none, because it is trusted.

## At a glance

| | |
|---|---|
| Modules (excl. tests) | **104** |
| Modules with a `"use client"` directive | **24** |
| Modules in the client bundle (directive + pulled in) | **33** |
| Server-only modules in the client bundle (violations) | **0** |
| Orphans (nothing imports them) | **0** |
| Dynamic `import()` edges | **3** |
| Type-only edges (erased at compile time) | **6** |
| Unresolved project imports | **0** — self-check passes |

### Boundary violations

A server-only module that ends up in the client bundle, with the shortest import chain that pulls
it in. This is a cross-check computed from the import graph. The enforced checks are rule F1 in lint
and `npm run check:boundaries`, and `import "server-only"` in every backend module fails the build
([`architecture.md`](architecture.md) §5). See *How the boundary is detected* below.

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
  brings in interfaces (`import { Article } from "@/shared/types"`) is erased by the compiler but counted
  here as a value edge — which is why `shared/types/index.ts` shows as `bundled` though it compiles to
  nothing. This can only over-include modules, never miss one, so the estimate errs high. A dynamic
  `import()` with a non-literal specifier cannot be followed and is listed separately; `require()` is
  not followed (none in the source tree). Lint (F1) and `check:boundaries` enforce the boundary; this
  section is the cross-check.

### Cross-check: Node built-ins

A browser bundle cannot resolve Node built-ins, so a passing `next build` implies no bundled module
imports one. Modules importing built-ins, and whether any is in the client bundle:

```
backend/auth/adminSession.ts   server-side
backend/lib/urlValidation.ts   server-side
```

Consistent with the build: no bundled module imports a Node built-in.

### Orphans

```
none
```

### Dynamic imports

```
backend/api/news/scrape-article.ts -> backend/lib/supabase.ts
instrumentation.ts -> sentry.server.config.ts
instrumentation.ts -> sentry.edge.config.ts
```

### Most depended-upon

Widest blast radius when moved.

| Importers | Module |
|--:|---|
| 24 | `shared/types/index.ts` |
| 18 | `frontend/context/ThemeContext.tsx` |
| 11 | `backend/lib/supabase.ts` |
| 10 | `frontend/features/news/index.ts` |
| 8 | `frontend/context/LanguageContext.tsx` |
| 8 | `shared/config/translations.ts` |

## Legend

- **Client** — `directive`: declares `"use client"`. `bundled`: no directive, but pulled into the
  client bundle by one. Blank: server-side only.
- **Cov** — statement coverage from the last `npm run test:ci`. `excl.` = excluded by
  `collectCoverageFrom` (type-only modules, Sentry/instrumentation entrypoints).
- **Importers / Imports** — counts of project-internal edges. The full path lists, with edge kinds,
  are in the *Dependency index* section below the tables.
- **Target** — the destination in move map v2 (`scripts/move-map.mjs`): `path · slice N` until the
  file moves, `here · slice N done` after. A route or page whose body has moved keeps a re-export at
  its URL path, shown as `stays`. `PINNED` marks a framework-convention file the map does not list.
- **CR-nn** — a compatibility requirement from [`PRD.md`](PRD.md) §8.

## Modules

### Routing — `app/` (locations are the URL contract)

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `app/about/page.tsx` | Re-exports `frontend/views/about/AboutView.tsx` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/admin/login/page.tsx` | Re-exports `frontend/views/admin/AdminLoginView.tsx` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/admin/page.tsx` | Re-exports `frontend/views/admin/AdminView.tsx` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/articles/bulk/route.ts` | Re-exports `backend/api/admin/articles-bulk.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/articles/route.ts` | Re-exports `backend/api/admin/articles.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/breaking-news/route.ts` | Re-exports `backend/api/admin/breaking-news.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/db-stats/route.ts` | Re-exports `backend/api/admin/db-stats.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/health/route.ts` | Re-exports `backend/api/admin/health.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/login/route.ts` | Re-exports `backend/api/admin/login.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/logout/route.ts` | Re-exports `backend/api/admin/logout.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/logs/route.ts` | Re-exports `backend/api/admin/logs.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/publish-article/route.ts` | Re-exports `backend/api/admin/publish-article.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/seed-supabase/route.ts` | Re-exports `backend/api/admin/seed-supabase.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/admin/stats/route.ts` | Re-exports `backend/api/admin/stats.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/chat/route.ts` | Re-exports `backend/api/chat.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/cron/refresh-news/route.ts` | Re-exports `backend/api/cron/refresh-news.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/health/route.ts` | Re-exports `backend/api/health.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/news/check-new/route.ts` | Re-exports `backend/api/news/check-new.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/news/scrape-article/route.ts` | Re-exports `backend/api/news/scrape-article.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/news/top-headlines/route.ts` | Re-exports `backend/api/news/top-headlines.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/api/translate/route.ts` | Re-exports `backend/api/translate.ts` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/article/[slug]/page.tsx` | Page: /article/[slug] | 102 |  | 0% | 0 | 3 | here · slice 1 done |
| `app/contact/page.tsx` | Re-exports `frontend/views/contact/ContactView.tsx` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/layout.tsx` | Root layout: providers, metadata, fonts | 70 |  | 0% | 0 | 4 | here · slice 1 done |
| `app/loading.tsx` | Route-level loading UI | 7 | directive | 0% | 0 | 1 | here · slice 1 done |
| `app/page.tsx` | Page: / | 39 |  | 0% | 0 | 3 | here · slice 1 done |
| `app/privacy/page.tsx` | Re-exports `frontend/views/privacy/PrivacyView.tsx` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/saved/page.tsx` | Re-exports `frontend/views/saved/SavedView.tsx` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |
| `app/terms/page.tsx` | Re-exports `frontend/views/terms/TermsView.tsx` | 1 |  | excl. | 0 | 1 | stays -- the path is the URL (CR-01) |

### Frontend views — `frontend/views/` (page bodies)

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `frontend/views/about/AboutView.tsx` | Page: /about | 97 |  | 0% | 1 | 1 | here · slice 10 done |
| `frontend/views/admin/AdminLoginView.tsx` | Page: /admin/login | 103 | directive | 0% | 1 | 1 | here · slice 10 done |
| `frontend/views/admin/AdminView.tsx` | Page: /admin | 506 | directive | 0% | 1 | 4 | here · slice 10 done |
| `frontend/views/article/ArticleDetailView.tsx` | Article page body: text, translation, AI panel, share, related | 963 | directive | 0% | 1 | 6 | here · slice 9 done — split in F |
| `frontend/views/contact/ContactView.tsx` | Page: /contact | 86 | directive | 0% | 1 | 1 | here · slice 10 done |
| `frontend/views/home/HomeClient.tsx` | Feed state, new-story polling, grid, load-more | 529 | directive | 0% | 1 | 7 | here · slice 9 done — split in F |
| `frontend/views/privacy/PrivacyView.tsx` | Page: /privacy | 113 |  | 0% | 1 | 1 | here · slice 10 done |
| `frontend/views/saved/SavedView.tsx` | Page: /saved | 123 | directive | 0% | 1 | 4 | here · slice 10 done |
| `frontend/views/terms/TermsView.tsx` | Page: /terms | 108 |  | 0% | 1 | 1 | here · slice 10 done |

### Frontend features — `frontend/features/`

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `frontend/features/admin/ActivityLog.tsx` | Paginated admin_logs viewer | 235 | directive | 0% | 1 | 3 | here · slice 9 done |
| `frontend/features/admin/ArticlesTable.tsx` | Admin article list: filters, edit, delete, bulk | 751 | directive | 0% | 1 | 1 | here · slice 9 done — split in F |
| `frontend/features/admin/BreakingNewsManager.tsx` | Create/expire breaking news items | 289 | directive | 0% | 1 | 1 | here · slice 9 done |
| `frontend/features/admin/CategoryStatsCard.tsx` | Category/language/country breakdown | 362 | directive | 0% | 1 | 1 | here · slice 9 done |
| `frontend/features/admin/SyncDashboard.tsx` | Last/next sync, counts, manual sync | 198 | directive | 0% | 1 | 1 | here · slice 9 done |
| `frontend/features/admin/actionLabels.ts` | Display labels and icons for admin activity-log entries | 29 | bundled | 0% | 1 | 1 | here · slice 9 done — only consumer is ActivityLog (SC-1) |
| `frontend/features/admin/index.ts` | Public surface of admin. No server.ts: admin has no server code | 7 | bundled | 0% | 1 | 5 | here · slice 9 done |
| `frontend/features/chat/Chatbot.tsx` | Chat drawer; streams /api/chat. Honest error handling | 192 | directive | 0% | 1 | 1 | here · slice 9 done |
| `frontend/features/chat/FloatingAiAssistant.tsx` | Floating button wrapping Chatbot | 37 | directive | 0% | 1 | 1 | here · slice 9 done |
| `frontend/features/chat/index.ts` | Public surface of chat. No server.ts: chat has no server code | 3 |  | 0% | 1 | 1 | here · slice 9 done |
| `frontend/features/news/ArticleCard.tsx` | Feed card, featured and grid variants | 393 | directive | 0% | 1 | 8 | here · slice 9 done |
| `frontend/features/news/BreakingNewsBanner.tsx` | Public banner polling /api/admin/breaking-news (CR-08) | 79 | directive | 0% | 1 | 1 | here · slice 9 done |
| `frontend/features/news/CategoryMegaMenu.tsx` | Hover mega-menu of category previews | 225 | directive | 0% | 1 | 5 | here · slice 9 done |
| `frontend/features/news/Footer.tsx` | Footer nav, category links, copyright bar | 214 | directive | 0% | 1 | 3 | here · slice 9 done |
| `frontend/features/news/Header.tsx` | Nav, search, theme + language toggles, bookmarks count, clock | 568 | directive | 0% | 1 | 6 | here · slice 9 done — news masthead, not UI; split in F |
| `frontend/features/news/MarqueeTicker.tsx` | Scrolling India/World headline ticker | 176 | directive | 0% | 1 | 3 | here · slice 9 done |
| `frontend/features/news/bookmarks.ts` | localStorage saved articles + change event | 56 | directive | 96.4% | 4 | 1 | here · slice 9 done — stores Article objects, so not lib/ |
| `frontend/features/news/index.ts` | Client-safe public surface of news: components and bookmark helpers | 9 | bundled | 0% | 10 | 6 | here · slice 9 done |

### Frontend components and context — `frontend/components/`, `frontend/context/`

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `frontend/components/ui/NewsSkeletonGrid.tsx` | Suspense fallback matching real card dimensions | 90 |  | 0% | 1 | 0 | here · slice 8 done |
| `frontend/components/ui/ThemeSpinner.tsx` | Theme-aware loading spinner | 88 | directive | 0% | 2 | 1 | here · slice 8 done |
| `frontend/context/LanguageContext.tsx` | EN/HI provider, localStorage-backed | 57 | directive | 0% | 8 | 1 | here · slice 8 done — app-wide state provider, not a UI primitive |
| `frontend/context/ThemeContext.tsx` | Light/dark provider, localStorage-backed | 63 | directive | 0% | 18 | 0 | here · slice 8 done — app-wide state provider, not a UI primitive |

### Backend API — `backend/api/` (route bodies)

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `backend/api/admin/articles-bulk.ts` | API: /api/admin/articles/bulk | 81 |  | 0% | 1 | 2 | here · slice 7 done |
| `backend/api/admin/articles.ts` | API: /api/admin/articles | 249 |  | 0% | 1 | 2 | here · slice 7 done |
| `backend/api/admin/breaking-news.ts` | API: /api/admin/breaking-news | 214 |  | 0% | 1 | 2 | here · slice 7 done |
| `backend/api/admin/db-stats.ts` | API: /api/admin/db-stats | 44 |  | 0% | 1 | 2 | here · slice 7 done |
| `backend/api/admin/health.ts` | API: /api/admin/health | 16 |  | 100% | 2 | 1 | here · slice 7 done |
| `backend/api/admin/login.ts` | API: /api/admin/login | 34 |  | 0% | 1 | 1 | here · slice 7 done |
| `backend/api/admin/logout.ts` | API: /api/admin/logout | 14 |  | 0% | 1 | 1 | here · slice 7 done |
| `backend/api/admin/logs.ts` | API: /api/admin/logs | 125 |  | 0% | 1 | 2 | here · slice 7 done |
| `backend/api/admin/publish-article.ts` | API: /api/admin/publish-article | 108 |  | 0% | 1 | 2 | here · slice 7 done |
| `backend/api/admin/seed-supabase.ts` | API: /api/admin/seed-supabase | 72 |  | 0% | 1 | 3 | here · slice 7 done |
| `backend/api/admin/stats.ts` | API: /api/admin/stats | 165 |  | 0% | 1 | 1 | here · slice 7 done |
| `backend/api/chat.ts` | API: /api/chat | 164 |  | 79.3% | 2 | 1 | here · slice 7 done |
| `backend/api/cron/refresh-news.ts` | API: /api/cron/refresh-news | 122 |  | 0% | 1 | 2 | here · slice 7 done |
| `backend/api/health.ts` | API: /api/health | 17 |  | 100% | 2 | 1 | here · slice 7 done |
| `backend/api/news/check-new.ts` | API: /api/news/check-new | 53 |  | 0% | 1 | 1 | here · slice 7 done |
| `backend/api/news/scrape-article.ts` | API: /api/news/scrape-article | 558 |  | 0% | 1 | 4 | here · slice 7 done |
| `backend/api/news/top-headlines.ts` | API: /api/news/top-headlines | 267 |  | 0% | 1 | 4 | here · slice 7 done |
| `backend/api/translate.ts` | API: /api/translate | 56 |  | 0% | 1 | 2 | here · slice 7 done |

### Backend services — `backend/services/`

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `backend/services/classify/categoryClassifier.ts` | Haiku flags category tags an article does not fit (fail-open) | 135 |  | 0% | 1 | 1 | here · slice 6 done |
| `backend/services/health/health.ts` | Dependency health for /api/health (status only) and /api/admin/health (detail); D4 | 126 |  | 98.4% | 4 | 3 | here · slice 6 done |
| `backend/services/news/fetchNews.ts` | Server-side initial NewsData.io fetch for SSR | 129 |  | 0% | 1 | 2 | here · slice 6 done |
| `backend/services/news/index.ts` | Server-only public surface of news: storage, upstream fetch, editorial policy | 25 |  | 0% | 6 | 4 | here · slice 6 done — first line: import "server-only" |
| `backend/services/news/newsdata.ts` | Shared NewsData.io URL builder + row mapper; throws on failure | 116 |  | 0% | 1 | 2 | here · slice 6 done |
| `backend/services/translate/googleTranslate.ts` | Unofficial translate.googleapis.com client, bounded concurrency | 88 |  | 0% | 1 | 0 | here · slice 6 done |

### Backend repositories — `backend/repositories/`

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `backend/repositories/auditLog.ts` | Writes admin_logs rows (logAdminAction) | 40 |  | 0% | 7 | 2 | here · slice 5 done |
| `backend/repositories/db.ts` | Supabase reads/writes: filters, freshness, 7-day purge, upsert, stats | 613 |  | 65.4% | 2 | 5 | here · slice 5 done |

### Backend auth and library — `backend/auth/`, `backend/lib/`

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `backend/auth/adminSession.ts` | HMAC session token issue/verify; timing-safe password compare | 69 |  | 0% | 3 | 0 | here · slice 4 done |
| `backend/lib/cache.ts` | Upstash Redis with in-process Map fallback | 86 |  | 0% | 3 | 0 | here · slice 4 done |
| `backend/lib/rateLimit.ts` | Fixed-window in-memory limiter; client IP extraction | 28 |  | 96.4% | 2 | 0 | here · slice 4 done |
| `backend/lib/reportFallback.ts` | Rate-limited Sentry report of a fallback (D5); bounded by a fixed set of kinds | 52 |  | 100% | 4 | 0 | here · slice 4 done |
| `backend/lib/supabase.ts` | Supabase client; prefers service-role key when present | 22 |  | 0% | 11 | 0 | here · slice 4 done |
| `backend/lib/urlValidation.ts` | SSRF guard: protocol allowlist + DNS resolution against blocked ranges | 124 |  | 0% | 1 | 0 | here · slice 4 done |

### Shared — `shared/` (imported by both sides)

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `shared/config/categoryColors.ts` | Per-category hex/Tailwind class map | 64 | bundled | 0% | 1 | 0 | here · slice 3 done |
| `shared/config/imageDomains.ts` | next/image hostname allowlist. Imported by next.config.ts at LOAD TIME | 105 | bundled | 0% | 2 | 0 | here · slice 3 done — CR-06: must import nothing |
| `shared/config/newsConfig.ts` | Editorial policy: category map, script filters, spam/filler source lists, dedupe | 233 | bundled | 100% | 6 | 1 | here · slice 3 done |
| `shared/config/topicImages.ts` | Keyword to Unsplash topic-image table + per-topic round robin | 414 | bundled | 0% | 5 | 2 | here · slice 3 done |
| `shared/config/translations.ts` | EN/HI static strings; translateHeadline is a no-op stub | 127 | bundled | 0% | 8 | 0 | here · slice 3 done — shared, not a feature |
| `shared/types/index.ts` | Article, ScrapeResponse, ChatMessage, NewsDataRawArticle, AdminAction, AdminLog | 89 | bundled | excl. | 24 | 0 | here · slice 3 done |
| `shared/validation/sentryScrub.ts` | Redacts secret env values from Sentry events | 70 |  | 88.6% | 5 | 0 | here · slice 3 done |

### Framework-pinned (never move)

| Module | Purpose | LOC | Client | Cov | Importers | Imports | Target |
|---|---|--:|:-:|--:|--:|--:|---|
| `instrumentation-client.ts` | Sentry browser init | 13 |  | excl. | 0 | 1 | here · slice 1 done |
| `instrumentation.ts` | Sentry server/edge init hook | 12 |  | excl. | 0 | 2 | here · slice 1 done |
| `proxy.ts` | AUTH GATE. Next 16 Proxy (was middleware). Matches /admin/*, /api/admin/* | 46 |  | 0% | 0 | 1 | here · slice 1 done |
| `sentry.edge.config.ts` | Sentry edge config | 8 |  | excl. | 1 | 1 | here · slice 1 done |
| `sentry.server.config.ts` | Sentry Node config | 8 |  | excl. | 1 | 1 | here · slice 1 done |

## Dependency index

One entry per module. **Imports** = project-internal modules this file imports. **Used by** = files
that import it, including tests and the root tooling files. Edge kinds other than a plain value import
are labelled. A _(type)_ edge is erased at compile time and never reaches a bundle, but it still
breaks if its target moves — so it counts here, where the question is what a move would touch.

#### `app/about/page.tsx`

- **Imports:** `frontend/views/about/AboutView.tsx` _(reexport)_
- **Used by:** —

#### `app/admin/login/page.tsx`

- **Imports:** `frontend/views/admin/AdminLoginView.tsx` _(reexport)_
- **Used by:** —

#### `app/admin/page.tsx`

- **Imports:** `frontend/views/admin/AdminView.tsx` _(reexport)_
- **Used by:** —

#### `app/api/admin/articles/bulk/route.ts`

- **Imports:** `backend/api/admin/articles-bulk.ts` _(reexport)_
- **Used by:** —

#### `app/api/admin/articles/route.ts`

- **Imports:** `backend/api/admin/articles.ts` _(reexport)_
- **Used by:** —

#### `app/api/admin/breaking-news/route.ts`

- **Imports:** `backend/api/admin/breaking-news.ts` _(reexport)_
- **Used by:** —

#### `app/api/admin/db-stats/route.ts`

- **Imports:** `backend/api/admin/db-stats.ts` _(reexport)_
- **Used by:** —

#### `app/api/admin/health/route.ts`

- **Imports:** `backend/api/admin/health.ts` _(reexport)_
- **Used by:** —

#### `app/api/admin/login/route.ts`

- **Imports:** `backend/api/admin/login.ts` _(reexport)_
- **Used by:** —

#### `app/api/admin/logout/route.ts`

- **Imports:** `backend/api/admin/logout.ts` _(reexport)_
- **Used by:** —

#### `app/api/admin/logs/route.ts`

- **Imports:** `backend/api/admin/logs.ts` _(reexport)_
- **Used by:** —

#### `app/api/admin/publish-article/route.ts`

- **Imports:** `backend/api/admin/publish-article.ts` _(reexport)_
- **Used by:** —

#### `app/api/admin/seed-supabase/route.ts`

- **Imports:** `backend/api/admin/seed-supabase.ts` _(reexport)_
- **Used by:** —

#### `app/api/admin/stats/route.ts`

- **Imports:** `backend/api/admin/stats.ts` _(reexport)_
- **Used by:** —

#### `app/api/chat/route.ts`

- **Imports:** `backend/api/chat.ts` _(reexport)_
- **Used by:** —

#### `app/api/cron/refresh-news/route.ts`

- **Imports:** `backend/api/cron/refresh-news.ts` _(reexport)_
- **Used by:** —

#### `app/api/health/route.ts`

- **Imports:** `backend/api/health.ts` _(reexport)_
- **Used by:** —

#### `app/api/news/check-new/route.ts`

- **Imports:** `backend/api/news/check-new.ts` _(reexport)_
- **Used by:** —

#### `app/api/news/scrape-article/route.ts`

- **Imports:** `backend/api/news/scrape-article.ts` _(reexport)_
- **Used by:** —

#### `app/api/news/top-headlines/route.ts`

- **Imports:** `backend/api/news/top-headlines.ts` _(reexport)_
- **Used by:** —

#### `app/api/translate/route.ts`

- **Imports:** `backend/api/translate.ts` _(reexport)_
- **Used by:** —

#### `app/article/[slug]/page.tsx`

- **Imports:** `frontend/features/news/index.ts`, `frontend/views/article/ArticleDetailView.tsx`, `shared/types/index.ts`
- **Used by:** —

#### `app/contact/page.tsx`

- **Imports:** `frontend/views/contact/ContactView.tsx` _(reexport)_
- **Used by:** —

#### `app/layout.tsx`

- **Imports:** `frontend/context/LanguageContext.tsx`, `frontend/context/ThemeContext.tsx`, `frontend/features/chat/index.ts`, `frontend/features/news/index.ts`
- **Used by:** —

#### `app/loading.tsx`

- **Imports:** `frontend/components/ui/ThemeSpinner.tsx`
- **Used by:** —

#### `app/page.tsx`

- **Imports:** `backend/services/news/index.ts`, `frontend/components/ui/NewsSkeletonGrid.tsx`, `frontend/views/home/HomeClient.tsx`
- **Used by:** —

#### `app/privacy/page.tsx`

- **Imports:** `frontend/views/privacy/PrivacyView.tsx` _(reexport)_
- **Used by:** —

#### `app/saved/page.tsx`

- **Imports:** `frontend/views/saved/SavedView.tsx` _(reexport)_
- **Used by:** —

#### `app/terms/page.tsx`

- **Imports:** `frontend/views/terms/TermsView.tsx` _(reexport)_
- **Used by:** —

#### `backend/api/admin/articles-bulk.ts`

- **Imports:** `backend/lib/supabase.ts`, `backend/repositories/auditLog.ts`
- **Used by:** `app/api/admin/articles/bulk/route.ts` _(reexport)_

#### `backend/api/admin/articles.ts`

- **Imports:** `backend/lib/supabase.ts`, `backend/repositories/auditLog.ts`
- **Used by:** `app/api/admin/articles/route.ts` _(reexport)_

#### `backend/api/admin/breaking-news.ts`

- **Imports:** `backend/lib/supabase.ts`, `backend/repositories/auditLog.ts`
- **Used by:** `app/api/admin/breaking-news/route.ts` _(reexport)_

#### `backend/api/admin/db-stats.ts`

- **Imports:** `backend/repositories/auditLog.ts`, `backend/services/news/index.ts`
- **Used by:** `app/api/admin/db-stats/route.ts` _(reexport)_

#### `backend/api/admin/health.ts`

- **Imports:** `backend/services/health/health.ts`
- **Used by:** `app/api/admin/health/route.ts` _(reexport)_, `backend/api/admin/health.test.ts` _(test)_

#### `backend/api/admin/login.ts`

- **Imports:** `backend/auth/adminSession.ts`
- **Used by:** `app/api/admin/login/route.ts` _(reexport)_

#### `backend/api/admin/logout.ts`

- **Imports:** `backend/auth/adminSession.ts`
- **Used by:** `app/api/admin/logout/route.ts` _(reexport)_

#### `backend/api/admin/logs.ts`

- **Imports:** `backend/lib/supabase.ts`, `shared/types/index.ts` _(type)_
- **Used by:** `app/api/admin/logs/route.ts` _(reexport)_

#### `backend/api/admin/publish-article.ts`

- **Imports:** `backend/lib/supabase.ts`, `backend/repositories/auditLog.ts`
- **Used by:** `app/api/admin/publish-article/route.ts` _(reexport)_

#### `backend/api/admin/seed-supabase.ts`

- **Imports:** `backend/repositories/auditLog.ts`, `backend/services/news/index.ts`, `shared/types/index.ts` _(type)_
- **Used by:** `app/api/admin/seed-supabase/route.ts` _(reexport)_

#### `backend/api/admin/stats.ts`

- **Imports:** `backend/lib/supabase.ts`
- **Used by:** `app/api/admin/stats/route.ts` _(reexport)_

#### `backend/api/chat.ts`

- **Imports:** `backend/lib/rateLimit.ts`
- **Used by:** `app/api/chat/route.ts` _(reexport)_, `backend/api/chat.test.ts` _(test)_

#### `backend/api/cron/refresh-news.ts`

- **Imports:** `backend/repositories/auditLog.ts`, `backend/services/news/index.ts`
- **Used by:** `app/api/cron/refresh-news/route.ts` _(reexport)_

#### `backend/api/health.ts`

- **Imports:** `backend/services/health/health.ts`
- **Used by:** `app/api/health/route.ts` _(reexport)_, `backend/api/health.test.ts` _(test)_

#### `backend/api/news/check-new.ts`

- **Imports:** `backend/services/news/index.ts`
- **Used by:** `app/api/news/check-new/route.ts` _(reexport)_

#### `backend/api/news/scrape-article.ts`

- **Imports:** `backend/lib/cache.ts`, `backend/lib/supabase.ts` _(dynamic)_, `backend/lib/urlValidation.ts`, `shared/validation/sentryScrub.ts`
- **Used by:** `app/api/news/scrape-article/route.ts` _(reexport)_

#### `backend/api/news/top-headlines.ts`

- **Imports:** `backend/lib/cache.ts`, `backend/services/health/health.ts`, `backend/services/news/index.ts`, `shared/types/index.ts`
- **Used by:** `app/api/news/top-headlines/route.ts` _(reexport)_

#### `backend/api/translate.ts`

- **Imports:** `backend/lib/rateLimit.ts`, `backend/services/translate/googleTranslate.ts`
- **Used by:** `app/api/translate/route.ts` _(reexport)_

#### `backend/auth/adminSession.ts`

- **Imports:** —
- **Used by:** `backend/api/admin/login.ts`, `backend/api/admin/logout.ts`, `proxy.ts`

#### `backend/lib/cache.ts`

- **Imports:** —
- **Used by:** `backend/api/news/scrape-article.ts`, `backend/api/news/top-headlines.ts`, `backend/services/health/health.ts`

#### `backend/lib/rateLimit.ts`

- **Imports:** —
- **Used by:** `backend/api/chat.ts`, `backend/api/translate.ts`

#### `backend/lib/reportFallback.ts`

- **Imports:** —
- **Used by:** `backend/lib/reportFallback.test.ts` _(test)_, `backend/repositories/db.test.ts` _(test)_, `backend/repositories/db.ts`, `backend/services/health/health.ts`

#### `backend/lib/supabase.ts`

- **Imports:** —
- **Used by:** `backend/api/admin/articles-bulk.ts`, `backend/api/admin/articles.ts`, `backend/api/admin/breaking-news.ts`, `backend/api/admin/logs.ts`, `backend/api/admin/publish-article.ts`, `backend/api/admin/stats.ts`, `backend/api/news/scrape-article.ts` _(dynamic)_, `backend/repositories/auditLog.ts`, `backend/repositories/db.ts`, `backend/services/classify/categoryClassifier.ts`, `backend/services/health/health.ts`

#### `backend/lib/urlValidation.ts`

- **Imports:** —
- **Used by:** `backend/api/news/scrape-article.ts`

#### `backend/repositories/auditLog.ts`

- **Imports:** `backend/lib/supabase.ts`, `shared/types/index.ts` _(type)_
- **Used by:** `backend/api/admin/articles-bulk.ts`, `backend/api/admin/articles.ts`, `backend/api/admin/breaking-news.ts`, `backend/api/admin/db-stats.ts`, `backend/api/admin/publish-article.ts`, `backend/api/admin/seed-supabase.ts`, `backend/api/cron/refresh-news.ts`

#### `backend/repositories/db.ts`

- **Imports:** `backend/lib/reportFallback.ts`, `backend/lib/supabase.ts`, `backend/services/classify/categoryClassifier.ts`, `shared/config/newsConfig.ts`, `shared/types/index.ts`
- **Used by:** `backend/repositories/db.test.ts` _(test)_, `backend/services/news/index.ts` _(reexport)_

#### `backend/services/classify/categoryClassifier.ts`

- **Imports:** `backend/lib/supabase.ts`
- **Used by:** `backend/repositories/db.ts`

#### `backend/services/health/health.ts`

- **Imports:** `backend/lib/cache.ts`, `backend/lib/reportFallback.ts`, `backend/lib/supabase.ts`
- **Used by:** `backend/api/admin/health.ts`, `backend/api/health.ts`, `backend/api/news/top-headlines.ts`, `backend/services/health/health.test.ts` _(test)_

#### `backend/services/news/fetchNews.ts`

- **Imports:** `shared/config/newsConfig.ts`, `shared/types/index.ts`
- **Used by:** `backend/services/news/index.ts` _(reexport)_

#### `backend/services/news/index.ts`

- **Imports:** `backend/repositories/db.ts` _(reexport)_, `backend/services/news/fetchNews.ts` _(reexport)_, `backend/services/news/newsdata.ts` _(reexport)_, `shared/config/newsConfig.ts` _(reexport)_
- **Used by:** `app/page.tsx`, `backend/api/admin/db-stats.ts`, `backend/api/admin/seed-supabase.ts`, `backend/api/cron/refresh-news.ts`, `backend/api/news/check-new.ts`, `backend/api/news/top-headlines.ts`

#### `backend/services/news/newsdata.ts`

- **Imports:** `shared/config/newsConfig.ts`, `shared/types/index.ts`
- **Used by:** `backend/services/news/index.ts` _(reexport)_

#### `backend/services/translate/googleTranslate.ts`

- **Imports:** —
- **Used by:** `backend/api/translate.ts`

#### `frontend/components/ui/NewsSkeletonGrid.tsx`

- **Imports:** —
- **Used by:** `app/page.tsx`

#### `frontend/components/ui/ThemeSpinner.tsx`

- **Imports:** `frontend/context/ThemeContext.tsx`
- **Used by:** `app/loading.tsx`, `frontend/views/home/HomeClient.tsx`

#### `frontend/context/LanguageContext.tsx`

- **Imports:** `shared/config/translations.ts`
- **Used by:** `app/layout.tsx`, `frontend/features/news/ArticleCard.tsx`, `frontend/features/news/CategoryMegaMenu.tsx`, `frontend/features/news/Footer.tsx`, `frontend/features/news/Header.tsx`, `frontend/features/news/MarqueeTicker.tsx`, `frontend/views/article/ArticleDetailView.tsx`, `frontend/views/home/HomeClient.tsx`

#### `frontend/context/ThemeContext.tsx`

- **Imports:** —
- **Used by:** `app/layout.tsx`, `frontend/components/ui/ThemeSpinner.tsx`, `frontend/features/admin/ActivityLog.tsx`, `frontend/features/admin/ArticlesTable.tsx`, `frontend/features/admin/BreakingNewsManager.tsx`, `frontend/features/admin/CategoryStatsCard.tsx`, `frontend/features/admin/SyncDashboard.tsx`, `frontend/features/news/ArticleCard.tsx`, `frontend/features/news/BreakingNewsBanner.tsx`, `frontend/features/news/CategoryMegaMenu.tsx`, `frontend/features/news/Footer.tsx`, `frontend/features/news/Header.tsx`, `frontend/features/news/MarqueeTicker.tsx`, `frontend/views/admin/AdminLoginView.tsx`, `frontend/views/admin/AdminView.tsx`, `frontend/views/article/ArticleDetailView.tsx`, `frontend/views/home/HomeClient.tsx`, `frontend/views/saved/SavedView.tsx`

#### `frontend/features/admin/ActivityLog.tsx`

- **Imports:** `frontend/context/ThemeContext.tsx`, `frontend/features/admin/actionLabels.ts`, `shared/types/index.ts` _(type)_
- **Used by:** `frontend/features/admin/index.ts` _(reexport)_

#### `frontend/features/admin/ArticlesTable.tsx`

- **Imports:** `frontend/context/ThemeContext.tsx`
- **Used by:** `frontend/features/admin/index.ts` _(reexport)_

#### `frontend/features/admin/BreakingNewsManager.tsx`

- **Imports:** `frontend/context/ThemeContext.tsx`
- **Used by:** `frontend/features/admin/index.ts` _(reexport)_

#### `frontend/features/admin/CategoryStatsCard.tsx`

- **Imports:** `frontend/context/ThemeContext.tsx`
- **Used by:** `frontend/features/admin/index.ts` _(reexport)_

#### `frontend/features/admin/SyncDashboard.tsx`

- **Imports:** `frontend/context/ThemeContext.tsx`
- **Used by:** `frontend/features/admin/index.ts` _(reexport)_

#### `frontend/features/admin/actionLabels.ts`

- **Imports:** `shared/types/index.ts` _(type)_
- **Used by:** `frontend/features/admin/ActivityLog.tsx`

#### `frontend/features/admin/index.ts`

- **Imports:** `frontend/features/admin/ActivityLog.tsx` _(reexport)_, `frontend/features/admin/ArticlesTable.tsx` _(reexport)_, `frontend/features/admin/BreakingNewsManager.tsx` _(reexport)_, `frontend/features/admin/CategoryStatsCard.tsx` _(reexport)_, `frontend/features/admin/SyncDashboard.tsx` _(reexport)_
- **Used by:** `frontend/views/admin/AdminView.tsx`

#### `frontend/features/chat/Chatbot.tsx`

- **Imports:** `shared/types/index.ts`
- **Used by:** `frontend/features/chat/FloatingAiAssistant.tsx`

#### `frontend/features/chat/FloatingAiAssistant.tsx`

- **Imports:** `frontend/features/chat/Chatbot.tsx`
- **Used by:** `frontend/features/chat/index.ts` _(reexport)_

#### `frontend/features/chat/index.ts`

- **Imports:** `frontend/features/chat/FloatingAiAssistant.tsx` _(reexport)_
- **Used by:** `app/layout.tsx`

#### `frontend/features/news/ArticleCard.tsx`

- **Imports:** `frontend/context/LanguageContext.tsx`, `frontend/context/ThemeContext.tsx`, `frontend/features/news/bookmarks.ts`, `shared/config/categoryColors.ts`, `shared/config/newsConfig.ts`, `shared/config/topicImages.ts`, `shared/config/translations.ts`, `shared/types/index.ts`
- **Used by:** `frontend/features/news/index.ts` _(reexport)_

#### `frontend/features/news/BreakingNewsBanner.tsx`

- **Imports:** `frontend/context/ThemeContext.tsx`
- **Used by:** `frontend/features/news/index.ts` _(reexport)_

#### `frontend/features/news/CategoryMegaMenu.tsx`

- **Imports:** `frontend/context/LanguageContext.tsx`, `frontend/context/ThemeContext.tsx`, `shared/config/topicImages.ts`, `shared/config/translations.ts`, `shared/types/index.ts`
- **Used by:** `frontend/features/news/Header.tsx`

#### `frontend/features/news/Footer.tsx`

- **Imports:** `frontend/context/LanguageContext.tsx`, `frontend/context/ThemeContext.tsx`, `shared/config/translations.ts`
- **Used by:** `frontend/features/news/index.ts` _(reexport)_

#### `frontend/features/news/Header.tsx`

- **Imports:** `frontend/context/LanguageContext.tsx`, `frontend/context/ThemeContext.tsx`, `frontend/features/news/bookmarks.ts`, `frontend/features/news/CategoryMegaMenu.tsx`, `shared/config/translations.ts`, `shared/types/index.ts`
- **Used by:** `frontend/features/news/index.ts` _(reexport)_

#### `frontend/features/news/MarqueeTicker.tsx`

- **Imports:** `frontend/context/LanguageContext.tsx`, `frontend/context/ThemeContext.tsx`, `shared/types/index.ts`
- **Used by:** `frontend/features/news/index.ts` _(reexport)_

#### `frontend/features/news/bookmarks.ts`

- **Imports:** `shared/types/index.ts`
- **Used by:** `frontend/features/news/ArticleCard.tsx`, `frontend/features/news/bookmarks.test.ts` _(test)_, `frontend/features/news/Header.tsx`, `frontend/features/news/index.ts` _(reexport)_

#### `frontend/features/news/index.ts`

- **Imports:** `frontend/features/news/ArticleCard.tsx` _(reexport)_, `frontend/features/news/bookmarks.ts` _(reexport)_, `frontend/features/news/BreakingNewsBanner.tsx` _(reexport)_, `frontend/features/news/Footer.tsx` _(reexport)_, `frontend/features/news/Header.tsx` _(reexport)_, `frontend/features/news/MarqueeTicker.tsx` _(reexport)_
- **Used by:** `app/article/[slug]/page.tsx`, `app/layout.tsx`, `frontend/views/about/AboutView.tsx`, `frontend/views/admin/AdminView.tsx`, `frontend/views/article/ArticleDetailView.tsx`, `frontend/views/contact/ContactView.tsx`, `frontend/views/home/HomeClient.tsx`, `frontend/views/privacy/PrivacyView.tsx`, `frontend/views/saved/SavedView.tsx`, `frontend/views/terms/TermsView.tsx`

#### `frontend/views/about/AboutView.tsx`

- **Imports:** `frontend/features/news/index.ts`
- **Used by:** `app/about/page.tsx` _(reexport)_

#### `frontend/views/admin/AdminLoginView.tsx`

- **Imports:** `frontend/context/ThemeContext.tsx`
- **Used by:** `app/admin/login/page.tsx` _(reexport)_

#### `frontend/views/admin/AdminView.tsx`

- **Imports:** `frontend/context/ThemeContext.tsx`, `frontend/features/admin/index.ts`, `frontend/features/news/index.ts`, `shared/config/translations.ts`
- **Used by:** `app/admin/page.tsx` _(reexport)_

#### `frontend/views/article/ArticleDetailView.tsx`

- **Imports:** `frontend/context/LanguageContext.tsx`, `frontend/context/ThemeContext.tsx`, `frontend/features/news/index.ts`, `shared/config/topicImages.ts`, `shared/config/translations.ts`, `shared/types/index.ts`
- **Used by:** `app/article/[slug]/page.tsx`

#### `frontend/views/contact/ContactView.tsx`

- **Imports:** `frontend/features/news/index.ts`
- **Used by:** `app/contact/page.tsx` _(reexport)_

#### `frontend/views/home/HomeClient.tsx`

- **Imports:** `frontend/components/ui/ThemeSpinner.tsx`, `frontend/context/LanguageContext.tsx`, `frontend/context/ThemeContext.tsx`, `frontend/features/news/index.ts`, `shared/config/topicImages.ts`, `shared/config/translations.ts`, `shared/types/index.ts`
- **Used by:** `app/page.tsx`

#### `frontend/views/privacy/PrivacyView.tsx`

- **Imports:** `frontend/features/news/index.ts`
- **Used by:** `app/privacy/page.tsx` _(reexport)_

#### `frontend/views/saved/SavedView.tsx`

- **Imports:** `frontend/context/ThemeContext.tsx`, `frontend/features/news/index.ts`, `shared/config/topicImages.ts`, `shared/types/index.ts`
- **Used by:** `app/saved/page.tsx` _(reexport)_

#### `frontend/views/terms/TermsView.tsx`

- **Imports:** `frontend/features/news/index.ts`
- **Used by:** `app/terms/page.tsx` _(reexport)_

#### `instrumentation-client.ts`

- **Imports:** `shared/validation/sentryScrub.ts`
- **Used by:** —

#### `instrumentation.ts`

- **Imports:** `sentry.edge.config.ts` _(dynamic)_, `sentry.server.config.ts` _(dynamic)_
- **Used by:** —

#### `proxy.ts`

- **Imports:** `backend/auth/adminSession.ts`
- **Used by:** —

#### `sentry.edge.config.ts`

- **Imports:** `shared/validation/sentryScrub.ts`
- **Used by:** `instrumentation.ts` _(dynamic)_

#### `sentry.server.config.ts`

- **Imports:** `shared/validation/sentryScrub.ts`
- **Used by:** `instrumentation.ts` _(dynamic)_

#### `shared/config/categoryColors.ts`

- **Imports:** —
- **Used by:** `frontend/features/news/ArticleCard.tsx`

#### `shared/config/imageDomains.ts`

- **Imports:** —
- **Used by:** `next.config.ts`, `shared/config/topicImages.ts`

#### `shared/config/newsConfig.ts`

- **Imports:** `shared/types/index.ts`
- **Used by:** `backend/repositories/db.ts`, `backend/services/news/fetchNews.ts`, `backend/services/news/index.ts` _(reexport)_, `backend/services/news/newsdata.ts`, `frontend/features/news/ArticleCard.tsx`, `shared/config/newsConfig.test.ts` _(test)_

#### `shared/config/topicImages.ts`

- **Imports:** `shared/config/imageDomains.ts`, `shared/types/index.ts`
- **Used by:** `frontend/features/news/ArticleCard.tsx`, `frontend/features/news/CategoryMegaMenu.tsx`, `frontend/views/article/ArticleDetailView.tsx`, `frontend/views/home/HomeClient.tsx`, `frontend/views/saved/SavedView.tsx`

#### `shared/config/translations.ts`

- **Imports:** —
- **Used by:** `frontend/context/LanguageContext.tsx`, `frontend/features/news/ArticleCard.tsx`, `frontend/features/news/CategoryMegaMenu.tsx`, `frontend/features/news/Footer.tsx`, `frontend/features/news/Header.tsx`, `frontend/views/admin/AdminView.tsx`, `frontend/views/article/ArticleDetailView.tsx`, `frontend/views/home/HomeClient.tsx`

#### `shared/types/index.ts`

- **Imports:** —
- **Used by:** `app/article/[slug]/page.tsx`, `backend/api/admin/logs.ts` _(type)_, `backend/api/admin/seed-supabase.ts` _(type)_, `backend/api/news/top-headlines.ts`, `backend/repositories/auditLog.ts` _(type)_, `backend/repositories/db.test.ts` _(type)_ _(test)_, `backend/repositories/db.ts`, `backend/services/news/fetchNews.ts`, `backend/services/news/newsdata.ts`, `frontend/features/admin/actionLabels.ts` _(type)_, `frontend/features/admin/ActivityLog.tsx` _(type)_, `frontend/features/chat/Chatbot.tsx`, `frontend/features/news/ArticleCard.tsx`, `frontend/features/news/bookmarks.test.ts` _(test)_, `frontend/features/news/bookmarks.ts`, `frontend/features/news/CategoryMegaMenu.tsx`, `frontend/features/news/Header.tsx`, `frontend/features/news/MarqueeTicker.tsx`, `frontend/views/article/ArticleDetailView.tsx`, `frontend/views/home/HomeClient.tsx`, `frontend/views/saved/SavedView.tsx`, `shared/config/newsConfig.test.ts` _(test)_, `shared/config/newsConfig.ts`, `shared/config/topicImages.ts`

#### `shared/validation/sentryScrub.ts`

- **Imports:** —
- **Used by:** `backend/api/news/scrape-article.ts`, `instrumentation-client.ts`, `sentry.edge.config.ts`, `sentry.server.config.ts`, `shared/validation/sentryScrub.test.ts` _(test)_
