# Architecture

**Structure:** one Next.js app in the standard `src/` layout. `src/app/` holds the routes with their
code; `src/components/`, `src/server/`, `src/lib/`, `src/config/` and `src/types/` hold the rest. One
lint rule set keeps server code out of the browser. Decided in the 2026-11-02 cleanup
([ADR 0004](adr/0004-standard-src-layout.md)), which supersedes the split layout of
[ADR 0002](adr/0002-frontend-backend-separation.md). Where new code goes:
[`CONTRIBUTING.md`](../CONTRIBUTING.md#where-does-new-code-go).

---

## 1. How the system works today

Three independent flows, each with its own failure posture.

```
INGEST ─ every 30 minutes, a scheduler (vercel.json today; an AWS scheduler at deployment)
  /api/cron/refresh-news  [Bearer CRON_SECRET, fails closed if unset]
    → NewsData.io, one request per category, sequential (bursts get throttled)
    → reject: hard-paywall domains · horoscope/tarot filler · wire-spam
              · non-news listing sources
    → upsert into Supabase on article_id
    → fire-and-forget: Claude Haiku flags category tags that do not fit
  code: src/app/api/cron/refresh-news/route.ts → src/server/services/news
        → src/server/repositories/db.ts → src/server/services/classify

SERVE ─ per reader request
  /api/news/top-headlines
    1. Redis cache        15 min TTL                 → X-Data-Source: cache
    2. Supabase           newest row < 30 min old    → supabase
    3. NewsData.io        live call                  → newsdata
    4. MOCK_ARTICLES      built-in fallback          → mock
  Each tier degrades to the next without an error to the reader. The header
  says which tier answered; a Supabase → NewsData fallback is also reported
  to Sentry, rate-limited, and /api/health reports whether Supabase answers.
  code: src/server/services/news/topHeadlines.ts → src/server/lib/cache, src/server/services/news

AUTHORISE ─ every admin request (Panel 0)
  1. src/proxy.ts   matcher: /admin/*, /api/admin/*            OPTIMISTIC: is there a session?
       public (D10): page /admin/login · POST login · POST logout · GET breaking-news (banner)
       a session:    a Supabase staff JWT (getClaims verifies it, refreshes it when due)
                     or the shared password's HMAC cookie, until 2027-01-01 00:00 IST (Q3)
       neither:      401 for /api/admin/*, redirect to /admin/login for pages. No database call.
  2. the route body → requirePermission(rule, target)       DECIDES
       session (getClaims + getUser) → staff record, read live (no cache) → decide()
       live assignment · cell code (F S R M; Own and A refused) · scope (language, category[0])
       · aal2 where the role or the profile requires it
       401 · 403 { error, code, required } (audited as denied) · 503 if the record cannot be read
  3. a change: audit_log 'attempted' (refused with 503 if it cannot be written) → the change →
     'succeeded' or 'failed'. audit_log is append-only and hash-chained, in the database.
  code: src/proxy.ts → src/server/auth/{adminRoutePolicy, adminSession, supabaseServer}
        src/app/api/admin/* → src/server/auth/requirePermission → staffSession, decide, scope
                            → src/server/repositories/{staff, auditLog}
```

**The backend check is the only gate on the data.** The app reads Supabase as `service_role`,
which bypasses RLS, so `requirePermission` in each route body is all that stands between a request
and the data. The proxy only filters out requests with no session, as Next's docs advise (it "should
not be your only line of defense"). RLS protects only direct access with a user's own token (none of
the access tables grant `anon` or `authenticated` anything). Two tests keep this honest:
- `src/app/api/admin/access.test.ts` walks every admin route file on disk and fails on a route or
  method that is not public, session-only or guarded by a rule;
- the same file runs every guarded method through the real gate as allowed, no session, no grants,
  expired, wrong scope, no MFA, and the shared password.

The full design is [`design/panel-0-access-foundation.md`](design/panel-0-access-foundation.md); what
the panel does is in [`PANEL_DOCS.md`](PANEL_DOCS.md).

## 2. Framework constraints

Fixed by Next.js 16. These are not design choices, and three of them have already caused wrong
conclusions (see [`HANDOFF.md`](HANDOFF.md) §3).

- Files under `src/app/**` named `page`, `layout`, `route`, `loading` or `error` **are** the routing
  table. Their path **is** the URL. Any other file there (a component, a test) is colocated safely
  and never routable. Route groups `(name)` reorganise without changing a URL.
- With a `src/` folder, `src/proxy.ts` (Next 16's rename of Middleware), `src/instrumentation.ts`
  and `src/instrumentation-client.ts` must sit in `src/`, beside `app/`. Silently inert anywhere
  else. `public/`, `.env*` and the config files stay at the root (`src-folder.md`).
- `next.config.ts` imports `ALLOWED_IMAGE_HOSTNAMES` from `src/config/imageDomains.ts` and
  evaluates it at **config-load time**, where path aliases do not exist. That module imports
  nothing (CR-06).
- `images.remotePatterns` hostnames are matched with **picomatch globs**, not string equality, and
  the array is capped at **50 entries**. 49 are used.
- `vercel.json` pins the cron to `/api/cron/refresh-news`. Only Vercel reads it. Nothing is
  deployed until the project is complete, and the target is AWS (`ap-south-1`), where a scheduler
  must call the same path ([`HANDOFF.md`](HANDOFF.md) §11).

## 3. How the structure got here

Three restructures, each recorded in an ADR with the alternatives it rejected.

- **Restructure 1** ([ADR 0001](adr/0001-feature-first-structure.md)). A catch-all `src/lib/` let a
  client component import the audit logger and pull the whole Supabase SDK into `/admin`'s browser
  bundle (fixed in `b01d528`). Code was grouped by feature and the import rules made to fail CI.
- **Restructure 2** ([ADR 0002](adr/0002-frontend-backend-separation.md)). A reviewer asked for
  frontend and backend to be visibly separate, so the code moved to five top-level folders
  (`app/`, `frontend/`, `backend/`, `shared/`, `database/`). Every route and page in `app/` became
  a one-line re-export of a body elsewhere, held in place by ~1,400 lines of custom tooling.
- **Restructure 3** ([ADR 0004](adr/0004-standard-src-layout.md), 2026-11-02). Back to the layout
  every Next.js developer knows: routes keep their code in `src/app/`, the one-line re-exports and
  the feature barrels are gone, and the client/server boundary is held by `server-only` plus four
  lint zones. Route table identical (30 routes), CSS byte-identical, client JS 900 bytes smaller.

## 4. Layout

```
src/
  app/                     routes, with their code
    page.tsx                 home: fetches the first page of the feed, renders HomeClient
    article/[slug]/page.tsx  fetches the article and suggestions, renders ArticleDetailView
    about/ contact/ privacy/ terms/ saved/ admin/    one page.tsx each (tests beside them)
    api/**/route.ts          route handlers: parse the request, call src/server, answer
    layout.tsx  loading.tsx  globals.css (Tailwind v4)
  components/              React UI
    news/                    cards, masthead, footer, category menu, ticker, breaking banner
    admin/                   the operator dashboard's widgets
    chat/                    the assistant widget and its floating panel
    home/  article/          the two page bodies that need server data as props
    ui/                      presentational primitives
  context/                 app-wide providers: ThemeContext, LanguageContext
  server/                  server-only: every module opens with import "server-only"
    auth/                    the access foundation (Panel 0): requirePermission (the gate), decide,
                             scope, adminRoutePolicy, staffSession, supabaseServer, mfa, adminSession
    repositories/            Supabase queries: db.ts (articles), auditLog.ts, staff.ts
    services/                news (feed read path, ingestion), scrape, translate, classify, health
    lib/                     domain-free infrastructure: cache, rateLimit, readJsonBody, supabase, …
  lib/                     client-safe helpers both sides use: urlValidation, sentryScrub, bookmarks
  config/                  static data and editorial rules: newsConfig, permissions, translations, …
  types/                   types both sides use (Article, …)
  proxy.ts                 the optimistic session check on admin paths (§1); the routes decide
  instrumentation.ts  instrumentation-client.ts  sentry.*.config.ts      Sentry wiring
database/                  schema.sql, policies.sql, migrations/, bootstrap/, seed/: applied by hand
scripts/                   generate-access-catalog.mjs: the permission catalogue SQL from the plan
docs/  public/
```

A route handler holds only HTTP: it reads the request, calls `src/server/`, and turns the result
into a response. A server page that needs the same data calls the same function, never its own API
over HTTP (`getTopHeadlines` serves both `/api/news/top-headlines` and the article page's
suggestions). *Target state:* `src/app/api/news/scrape-article/route.ts` still carries some logic
inline; moving it out is behaviour-preserving work for later, behind characterization tests.

## 5. Import rules

Lint enforces these (`eslint.config.mjs`, part of `npm run verify` and CI). The zones use
`import/no-restricted-paths`, which judges the resolved path, so `@/server/x` and `../server/x` are
the same import.

| Rule | Why |
|---|---|
| `src/components`, `src/context`, `src/lib`, `src/config` and `src/types` never import `src/server` | A client bundle that reaches server code ships it to every reader. Server data reaches the UI as props from a page, or through a route handler |
| Every `src/server/` module starts with `import "server-only"` (`boundaries/server-only-first`) | Turns any client import of server code, direct or through another module, into a `next build` error ("Preventing environment poisoning", Next 16 docs). This is the check lint alone cannot do: it catches the transitive case |
| `src/server` never imports `src/app`, `src/components` or `src/context` | Server code does not depend on UI or routes |
| `src/lib`, `src/config` and `src/types` never import `src/app`, `src/components` or `src/context` | Both sides import them, so they can depend on neither |
| `src/components` and `src/context` never import `src/app` | A page imports its components, not the other way round |
| `src/config/imageDomains.ts` imports nothing | `next.config.ts` evaluates it at config-load time (CR-06) |

The first zone, the shared-code zone and `server-only-first` were each proven when they were
written: a deliberate violation failed lint with its message, then passed once removed. `src/proxy.ts` imports the server-only `src/server/auth/adminSession.ts`, which
is valid: Proxy runs on the Node.js runtime by default (`proxy.md`, "Runtime").

### Path alias

`@/*` maps to `src/*` (`tsconfig.json`; Jest mirrors it in `moduleNameMapper`). Siblings import
each other as `./x`.

## 6. Module responsibilities

| Module | Owns | Must never |
|---|---|---|
| `src/app/` | URLs: pages, route handlers, the root layout and loading UI | Hold business logic in a route handler; be imported by components |
| `src/components/` | React UI, grouped by area (news, admin, chat, ui) | Import `src/server` |
| `src/context/` | App-wide providers: theme (light/dark) and language (EN/HI), persisted to `localStorage` | Hold feature state |
| `src/server/auth/` | Who is asking and what they may do: the session, the permission rule, the gate every admin route passes, the route policy, MFA, the shared password until it is retired | Trust an identity from a header, body or query |
| `src/server/repositories/` | Supabase queries | Cache the staff record (revocation applies to the next request) |
| `src/server/services/` | Domain logic: the feed read path and ingestion (`news`), scraping, translation, classification, health | Return HTTP responses; that is the route handler's job |
| `src/server/lib/` | Domain-free infrastructure: no `Article`, no category, no UI string | Import a product module |
| `src/lib/` | Helpers that run in every runtime: URL validation, Sentry scrubbing, the saved-articles store | Import `src/server` |
| `src/config/` | Static data and the editorial rules both sides apply | Import React, `server-only` or either side's code |
| `src/types/` | Types both sides use | Import anything but types |
| `database/` | The schema, the RLS policies, the migrations, the bootstrap and seed scripts, applied by hand | Be imported by code |

## 7. Decision records

Structural decisions, and the alternatives rejected, live in [`adr/`](adr/):

- [`0004-standard-src-layout.md`](adr/0004-standard-src-layout.md), **Accepted**: this layout and the
  rules in §5.
- [`0003-primary-section-scope.md`](adr/0003-primary-section-scope.md), **Accepted**: for
  permission scope, an article's section is `category[0]` (Panel 0).
- [`0002-frontend-backend-separation.md`](adr/0002-frontend-backend-separation.md), **Superseded by
  0004**: the five-folder split of restructure 2.
- [`0001-feature-first-structure.md`](adr/0001-feature-first-structure.md), **Superseded by
  0002**: the feature-first `src/` layout of restructure 1.
