# Architecture

**Structure:** one Next.js app in five top-level parts. `app/` is the routing shell; `frontend/`,
`backend/`, `shared/` and `database/` sit beside it, and an import boundary between them fails CI
when it is broken. Decided in restructure 2 ([ADR 0002](adr/0002-frontend-backend-separation.md),
2026-10-30), which supersedes the feature-first `src/` layout of
[ADR 0001](adr/0001-feature-first-structure.md). Every module, with what imports it and what it
imports, is in [`CODEMAP.md`](CODEMAP.md). Where new code goes:
[`CONTRIBUTING.md`](../CONTRIBUTING.md#where-does-new-code-go).

---

## 1. How the system works today

Three independent flows, each with its own failure posture.

```
INGEST ─ every 30 minutes, Vercel cron
  /api/cron/refresh-news  [Bearer CRON_SECRET, fails closed if unset]
    → NewsData.io, one request per category, sequential (bursts get throttled)
    → reject: hard-paywall domains · horoscope/tarot filler · wire-spam
              · non-news listing sources
    → upsert into Supabase on article_id
    → fire-and-forget: Claude Haiku flags category tags that do not fit
  code: backend/api/cron/refresh-news.ts → backend/services/news
        → backend/repositories/db.ts → backend/services/classify

SERVE ─ per reader request
  /api/news/top-headlines
    1. Redis cache        15 min TTL                 → X-Data-Source: cache
    2. Supabase           newest row < 30 min old    → supabase
    3. NewsData.io        live call                  → newsdata
    4. MOCK_ARTICLES      built-in fallback          → mock
  Each tier degrades to the next without an error to the reader. The header
  says which tier answered; a Supabase → NewsData fallback is also reported
  to Sentry, rate-limited, and /api/health reports whether Supabase answers.
  code: backend/api/news/top-headlines.ts → backend/lib/cache, backend/services/news

AUTHORISE ─ every admin request
  proxy.ts   matcher: /admin/*, /api/admin/*
    public:          /admin/login, /api/admin/login, /api/admin/logout
    public GET only: /api/admin/breaking-news   (homepage banner, no session)
    otherwise:       HMAC-SHA256 cookie, 12 h, httpOnly, SameSite=Lax
  No route handler performs its own auth check.
  code: proxy.ts → backend/auth/adminSession.ts
```

**Authorisation is a single choke point.** That is a good design — one place to audit, one place to
change — but it means any route added outside the proxy matcher is silently public, and the matcher
has no test. Keep this property visible; do not scatter it.

## 2. Framework constraints

Fixed by Next.js 16. These are not design choices, and three of them have already caused wrong
conclusions (see [`HANDOFF.md`](HANDOFF.md) §3).

- Files under `app/**` named `page`, `layout`, `route`, `loading` or `error` **are** the routing
  table. Their path **is** the URL. Route groups `(name)` reorganise without changing a URL;
  private folders `_name` opt out of routing entirely. This is why `app/` stays a shell (§4).
- `proxy.ts`, at the repository root, is the Proxy entrypoint — Next 16's rename of Middleware.
  Location-pinned.
- `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts` and
  `sentry.edge.config.ts`, also at the root, are location-pinned conventions. Silently inert if
  moved.
- `next.config.ts` imports `ALLOWED_IMAGE_HOSTNAMES` from `shared/config/imageDomains.ts` and
  evaluates it at **config-load time**. That module imports nothing (CR-06).
- `images.remotePatterns` hostnames are matched with **picomatch globs**, not string equality, and
  the array is capped at **50 entries**. 49 are used.
- `vercel.json` pins the cron to `/api/cron/refresh-news`.

> Next.js is explicitly **unopinionated** about project organisation. Its own documentation presents
> three strategies and concludes: *"choose a strategy that works for you and your team and be
> consistent across the project."* The structure below is a team decision, not a framework mandate.

## 3. How the structure got here

Two restructures, each recorded in an ADR with the alternatives it rejected.

- **Restructure 1** (Phases A–E, [ADR 0001](adr/0001-feature-first-structure.md)). `src/lib/` was
  a folder named after the absence of a decision: data access, security primitives, infrastructure,
  domain logic, static data and i18n side by side, and nothing stopped a React component from
  importing a Supabase client. One did. `ActivityLog.tsx`, a client component, imported the audit
  logger for two constants and pulled the whole Supabase SDK into `/admin`'s browser bundle (fixed
  in `b01d528`). Restructure 1 grouped code by feature under `src/features/`, defined the shared
  layers, and made the import rules fail CI.
- **Restructure 2** (S0–S5, [ADR 0002](adr/0002-frontend-backend-separation.md)). The owner's
  reviewer asked for frontend, backend, database and documentation to be visibly separate. The App
  Router fixes where route files live (§2), so `app/` became a shell. Its route and page files
  re-export bodies that live in `backend/api/` and `frontend/views/`. Dead code went first (S1), so
  only code in use moved: 95 files in 11 slices. Every slice was gated on an identical route table
  and byte-identical CSS. Client JS changed by 35 bytes in total (974,032 → 974,067; `/` +50). The
  import rules were rewritten for the new layers in S4.

## 4. Layout

```
app/                       the routing shell: URLs, the root layout, and re-exports
  api/**/route.ts          one line each, e.g.  export { GET } from "@/backend/api/health";
  <page>/page.tsx          one line each, e.g.  export { default, metadata } from "@/frontend/views/about/AboutView";
  page.tsx                 composition: fetches the first page of the feed, renders HomeClient
  article/[slug]/page.tsx  composition: fetches the article and suggestions, renders ArticleDetailView
  layout.tsx, loading.tsx
frontend/                  the UI; never imports backend/
  views/<page>/            page bodies: home, article, saved, admin, about, contact, privacy, terms
  features/<feature>/      UI a feature owns: news, admin, chat, each behind its index.ts
  components/ui/           presentational primitives: ThemeSpinner, NewsSkeletonGrid
  context/                 app-wide state providers: ThemeContext, LanguageContext
  styles/                  globals.css (Tailwind v4)
backend/                   server-only: every module opens with import "server-only"
  api/                     route bodies, one per route: parse, delegate, serialise
  services/<service>/      domain logic: news (behind its index.ts), classify, health, translate
  repositories/            data access: db.ts (articles), auditLog.ts (admin_logs)
  auth/                    adminSession.ts: issue and verify the admin session cookie
  lib/                     domain-free infrastructure: cache, rateLimit, reportFallback, supabase,
                           urlValidation
shared/                    imported by both sides; imports neither
  config/                  static data and the editorial rules both sides apply: imageDomains,
                           categoryColors, topicImages, translations, newsConfig
  types/                   types both sides use (Article, …)
  validation/              sentryScrub: strips secrets from Sentry events, in every runtime
database/                  schema.sql, policies.sql, seed/: applied by hand, imported by nothing
proxy.ts                   admin authorisation, the single choke point (§1)
instrumentation.ts · instrumentation-client.ts · sentry.*.config.ts    Sentry wiring, pinned at the root
docs/  scripts/  public/
```

### Why `app/` is a shell

In the App Router a route file's path is its URL, so route and page files cannot move into
`backend/` or `frontend/` without breaking every public URL (CR-01), the cron contract (CR-02) and
the proxy matcher (CR-05). Restructure 1 concluded from this that a top-level `backend/` folder would
take a rewrite. Restructure 2 kept every URL a different way: the route file stays where it is,
holds a single re-export, and its body moves. `app/api/health/route.ts` is one line,
`export { GET } from "@/backend/api/health";`. The route table and segment config came out
identical, and the client JS within 35 bytes.

Two pages stay in `app/` as composition, because they combine backend data with a view, and
splitting the fetch from the markup would be a logic change (the page rule, ADR 0002):

- `app/page.tsx` calls `fetchInitialNews` and renders `HomeClient`.
- `app/article/[slug]/page.tsx` fetches the scraped article and the suggestions, over HTTP from its
  own API (BL-016), and renders `ArticleDetailView`.

A two-app split, with a separate API service, was rejected (ADR 0002). Every API URL, the Vercel
cron and the proxy's cookie auth would change, and deployments would double.

## 5. Import rules

These are the rules a reviewer may cite in a pull request, by ID. Every rule an import can break
fails both `npm run lint` ([`eslint.boundaries.mjs`](../eslint.boundaries.mjs)) and
`npm run check:boundaries` ([`scripts/check-move-map.mjs`](../scripts/check-move-map.mjs)), both
part of `npm run verify` and CI, with the rule's ID at the start of the message. Lint uses
`import/no-restricted-paths` zones, which judge the resolved path, so a relative import is caught
like an alias, plus three local rules. Each rule was proven in S4 by a deliberate violation that
failed with its message, then passed once removed.

| ID | Rule | Lint | `check:boundaries` |
|---|---|---|---|
| F1 | `frontend/` never imports `backend/`, and the client bundle never reaches it | zone; `boundaries/no-server-in-client` for a `"use client"` module in `app/`; `boundaries/server-only-first`: every `backend/` module opens with `import "server-only"`, so a client import of it fails `next build` | direct imports, and the client-bundle closure (transitive) |
| B1 | `backend/` never imports `frontend/` | zone | yes |
| S1 | `shared/` imports nothing from `frontend/`, `backend/` or `app/` | zone (`app/` reports as A1) | yes |
| A1 | `app/` may import `frontend/`, `backend/` and `shared/`, and it is the only place they meet. Nothing outside `app/` imports it; `instrumentation-client.ts` (browser) never imports `backend/`; `instrumentation.ts` and `sentry.*.config.ts` (server) never import `frontend/` | zones | yes |
| A2 | `app/**/route.ts`, and every page whose body moved to `frontend/views/` (`SHIMS` in `scripts/move-map.mjs`), holds only re-exports and literal segment config | `boundaries/shim-only` | yes, and also a moved body whose `app/` file is missing, which lint cannot see |
| P1 | `proxy.ts` imports only `backend/auth` and `shared/` | zones | yes |
| D1 | Nothing imports `database/` | zone | yes |
| X1 | No imports between features (`frontend/features/*`) or between services (`backend/services/*`). From outside, a feature is reached only through its `index.ts`, and so is a service that has one (`news`) | zones, generated from the folders on disk | yes |
| V1 | `frontend/features/**` never imports `frontend/views/**` | zone | yes |

Carried over from restructure 1, for the new paths:

| ID | Rule | Lint | `check:boundaries` |
|---|---|---|---|
| R3 | `frontend/components/ui` and `frontend/context` never import features or views | zone | yes |
| R5 | `ui` imports only `ui/`, `shared/types`, `shared/validation` and `ThemeContext` | zones | yes |
| R9 | `frontend/context` imports only `shared/config` and `shared/types` | zone | yes |
| R7 | `shared/config` imports only `shared/config` and `shared/types`, with no React and no `server-only`; `shared/types` imports only `shared/types` | zones, and `no-restricted-imports` for the packages | yes, for project imports |
| LIB | `backend/lib` imports no project module | zone | yes |
| CR-06 | `next.config.ts` imports only `shared/config`; `shared/config/imageDomains.ts` imports nothing | zones, and `no-restricted-imports` | yes |

Both tools exempt colocated tests from the X1 entry points, R5, R9, R7 and LIB: a test may import
its own subject. Where two rules match one import, both report the first in this order: D1, A1,
F1, B1, S1, P1, CR-06, X1, V1, R3, R5, R9, R7, LIB.

### Why each rule exists

- **F1, B1, S1: the two sides stay apart.** A client bundle that reaches backend code ships server
  code to every reader. In restructure 1 that is how the Supabase SDK reached `/admin`'s browser
  chunk: `supabase.ts` calls `createClient()` at module scope, and no bundler can tree-shake that.
  F1 is therefore checked three ways: lint on each import, `check:boundaries` on the transitive
  client-bundle closure, and `import "server-only"` at the top of every backend module, which turns
  a client import into a build error (Next.js 16 docs, "Preventing environment poisoning"). *Seen to
  work* (`19d255c`): a temporary `import "@/backend/lib/cache"` in a client component failed
  `next build` with "'server-only' cannot be imported from a Client Component module"; without the
  guard the same build passed. `proxy.ts` imports the server-only `backend/auth/adminSession.ts`,
  which is valid: Proxy runs on the Node.js runtime by default (`proxy.md`, "Runtime"). Shared code
  is imported by both sides, so it can depend on neither (S1).
- **A1, A2: `app/` is the shell.** Frontend and backend meet only in `app/`, the top of the graph.
  If anything else imported `app/`, it would reach both sides through it. The root files Next pins
  in place keep to the side of the runtime they load in. A route file, and a page whose body moved,
  holds only re-exports and literal segment config, so no logic hides in the URL contract.
- **P1: one choke point.** Authorisation lives in `proxy.ts` (§1). What it needs lives in
  `backend/auth`, and it needs nothing else.
- **D1: the database folder is for people.** `database/` holds the SQL and the seed script, which
  the owner applies by hand. No code depends on them.
- **X1: features and services stay independent.** Nothing imports sideways. If two features (or two
  services) need the same thing, it moves down a layer; it does not get imported sideways. Sideways
  imports are how a layered structure collapses back into the thing it replaced, usually within a
  quarter and always one reasonable-looking import at a time. Documentation does not prevent this;
  a linter does. Entry points are covered below.
- **V1: features never import views.** A view composes features through their entry points, so a
  feature that imports or re-exports a view closes a cycle. Slice 9 found one (view → news entry →
  view), removed in `4460a40`.
- **R3, R5, R9: the frontend's lower layers.** `components/ui` and `context` sit below features and
  views. A UI primitive must not know what an `Article` is. It may read the theme, because light
  and dark are appearance, which is exactly what a primitive owns. Language, UI strings and
  category data are app state or product knowledge, so `LanguageContext` and `shared/config` are
  off-limits (owner decision, Phase D; confirmed in S4). Footer is why the rule exists: it read
  both and rendered category links, which a plain "downward is fine" rule could not catch. The
  providers in `context` import only the config and types they hold (see §6).
- **R7, CR-06: static data.** `shared/config` holds static data and the editorial rules both sides
  apply. It may import other config and types, but no React, no `server-only`, and no code from
  either side. `imageDomains.ts` imports nothing at all, because `next.config.ts` evaluates it at
  config-load time. *Refined in restructure 1:* the first draft said "config imports nothing",
  which `topicImages.ts → imageDomains.ts` already contradicted.
- **LIB: `backend/lib` is domain-free** (§6).

### Feature entry points and `sideEffects`

Each `frontend/features/<feature>/` folder has an `index.ts`, its entry point, and a `package.json`
with `"sideEffects": false`. Without that field a barrel is not free. When a server component (the
root layout, any server page) imports one export from a barrel of client components, every client
component the barrel re-exports becomes a client entry of that route. Restructure 1 measured +46 KB
on `/` (+36%) when the root layout imported one banner from an unmarked barrel. Restructure 2
measured it again, with the field removed: every route got heavier, by +457 bytes to +84,579 bytes.
Marking the folder side-effect-free lets the bundler drop unused re-exports. So nothing in a feature
may rely on an import made only for its side effects (a CSS file, a polyfill); those belong in
`app/`. The Next 16 docs make the same point from the other side: barrels slow builds, so import
from specific files where possible (`local-development.md`, "Barrel files"). Routing views through
the entry point cost 109 bytes of client JS on `/`, which the owner accepted (ADR 0002).

### What lint cannot see, and what covers it

- **F1, transitively.** Lint checks each import as written. A client module that imports a plain
  module that imports `backend/` is caught twice more: `import "server-only"` fails `next build`,
  and `check:boundaries` walks the client-bundle closure before the build runs.
- **A shim that has gone missing.** A file that does not exist cannot be linted.
  `check:boundaries` reports a moved body whose `app/` file is gone.
- **What code does.** Route bodies in `backend/api/` parse input, delegate and serialise output;
  extraction heuristics, SQL and filter logic belong in a service or a repository, where they can be
  tested without constructing an HTTP request. Review enforces this. *Target state:* today
  `backend/api/news/scrape-article.ts` and `backend/api/news/top-headlines.ts` still carry logic
  inline. Extracting it is behaviour-preserving work for later, behind characterization tests.

### Path aliases

`@/frontend/*`, `@/backend/*` and `@/shared/*` (`tsconfig.json`), one per layer and no catch-all,
so every import names its layer (the `@/*` catch-all was removed in `d6bd8b5`). `app/` and
`database/` have no alias, because nothing may import them (A1, D1). Jest mirrors the three in
`moduleNameMapper`; `check:boundaries` and the CODEMAP generator read them from `tsconfig.json`.

## 6. Module responsibilities

| Module | Owns | Must never |
|---|---|---|
| `app/` | URLs; the root layout and loading UI; one-line re-exports; the two composition pages | Hold logic in a route file (A2); be imported (A1) |
| `frontend/views/` | One page body per page | Be imported by a feature (V1) |
| `frontend/features/news/` | Feed cards, masthead and footer, category menu, ticker, breaking-news banner, saved-article store | Import another feature or a view; be reached past its `index.ts` (X1, V1) |
| `frontend/features/admin/` | The operator dashboard: articles table, breaking-news manager, sync controls, stats, activity log | The same |
| `frontend/features/chat/` | The assistant: the chat widget and the floating panel | Import from the news feature (X1); article context reaches it as data, not as an import |
| `frontend/components/ui/` | Presentational primitives; may read the theme, no other app state | Import a feature, a view, `shared/config` or `LanguageContext` (R3, R5) |
| `frontend/context/` | App-wide providers: theme (light/dark) and language (EN/HI), each persisted to `localStorage` | Import anything but `shared/config` and `shared/types` (R9); hold feature state |
| `backend/api/` | One route body per route: parse, delegate, serialise | Be imported by frontend code (F1) |
| `backend/services/` | Domain logic: news ingestion and the feed (`news`, behind `index.ts`), category classification, health, translation | Import another service (X1) |
| `backend/repositories/` | Supabase queries: articles (`db.ts`) and the audit log (`auditLog.ts`) | Be imported by frontend code (F1) |
| `backend/auth/` | Issuing and verifying the admin session cookie | Be imported by frontend code (F1) |
| `backend/lib/` | Domain-free infrastructure | Import any project module (LIB) |
| `shared/config/` | Static data: allowlists, colour maps, topic images, UI strings, the editorial filters | Import anything but config and types, or React, or `server-only` (R7); `imageDomains.ts` imports nothing (CR-06) |
| `shared/types/` | Types both sides use | Import anything but types (R7) |
| `shared/validation/` | Checks every runtime runs: `sentryScrub` | Import `frontend/`, `backend/` or `app/` (S1) |
| `database/` | The schema, the RLS policies and the seed script, applied by hand | Be imported by code (D1) |

### What `backend/lib/` means

`backend/lib/` is **cross-cutting and domain-free**: a module belongs there only if it knows no
product concept — no `Article`, no category, no editorial rule, no UI string. Restructure 1 kept the
definition rather than loosening it to fit what happened to live in `lib/`: `bookmarks.ts`, which
stores `Article` objects, went to the news feature, and `translations.ts`, which holds product copy,
went to config.

**Checkable**, and enforced as LIB: `backend/lib/` holds `cache`, `rateLimit`, `reportFallback`,
`supabase` and `urlValidation`, and **none of them imports a project module**. `cache` imports
`@upstash/redis`, `reportFallback` imports `@sentry/nextjs`, `supabase` imports
`@supabase/supabase-js`, `urlValidation` imports `dns/promises` and `net`, and `rateLimit` imports
nothing. A `lib/` module that needs a project import has picked up a domain and belongs in a service
or a repository. `urlValidation` moves to `shared/validation/` with audit finding F-005, split at
its DNS step, which cannot run in the browser ([BACKLOG](BACKLOG.md) BL-015).

### What `frontend/context/` means

`frontend/components/ui/` is presentational primitives with no domain knowledge. A provider that
owns app state does not fit it, so **both providers live in `frontend/context/`**, a layer of
app-wide state providers importing only `shared/config` and `shared/types` (R9). `LanguageContext`
holds the `"en" | "hi"` choice and imports the `Language` type from `shared/config/translations.ts`;
`ThemeContext` holds light/dark, persists it, and sets classes on `document`. Both stay together,
because the same objection applies to both.

## 7. Decision records

Structural decisions, and the alternatives rejected, live in [`adr/`](adr/):

- [`0002-frontend-backend-separation.md`](adr/0002-frontend-backend-separation.md), **Accepted**:
  this layout, the rules in §5, and the measurements from the move.
- [`0001-feature-first-structure.md`](adr/0001-feature-first-structure.md), **Superseded by
  0002**: the feature-first `src/` layout of restructure 1. Its text is kept, including the
  measurements that shaped it and the alternatives it rejected.
