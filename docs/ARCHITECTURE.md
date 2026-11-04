# Architecture

**Structure:** one repository, three apps and three shared packages (npm workspaces). `apps/web` is
the reader site, `apps/admin` the back office, `apps/worker` the scheduled jobs; `packages/server`
holds the server-only code, `packages/shared` the client-safe config, types and helpers, and
`packages/ui` the React both apps share. Lint keeps each side to its own imports, and
`import "server-only"` keeps server code out of every browser bundle. Decided in
[ADR 0005](adr/0005-apps-and-packages.md), following the owner-approved
[`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md) (section 3). Where new code goes:
[`CONTRIBUTING.md`](../CONTRIBUTING.md#where-does-new-code-go).

---

## 1. How the system works today

Three independent flows, each with its own failure posture.

```
INGEST ─ every 30 minutes, a scheduler starts the worker (EventBridge at deployment, Phase I)
  npm run job -- refresh-news   (apps/worker; exit 0 clean, 1 failed, 2 unknown job)
    → NewsData.io, one request per category, sequential (bursts get throttled)
    → reject: hard-paywall domains · horoscope/tarot filler · wire-spam
              · non-news listing sources
    → upsert into Supabase on article_id; purge rows older than 7 days
    → one audit_log row as system:cron
  code: apps/worker/src/jobs.ts → packages/server/src/services/news/refreshNews.ts
        → packages/server/src/repositories/db.ts, auditLog.ts

SERVE ─ per reader request (apps/web)
  /api/news/top-headlines
    1. Redis cache        15 min TTL                 → X-Data-Source: cache
    2. Supabase           newest row < 30 min old    → supabase
    3. NewsData.io        live call                  → newsdata
    4. MOCK_ARTICLES      built-in fallback          → mock
  Each tier degrades to the next without an error to the reader. The header
  says which tier answered; a Supabase → NewsData fallback is also reported
  to Sentry, rate-limited, and /api/health reports whether Supabase answers.
  /api/news/breaking-news: the homepage banner's public read.
  code: packages/server/src/services/news/topHeadlines.ts, breakingNews.ts

AUTHORISE ─ every admin request (apps/admin, Panel 0)
  1. apps/admin/src/proxy.ts   matcher: /admin/*, /api/admin/*      OPTIMISTIC: is there a session?
       public (D10): page /admin/login · POST login · POST logout
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
  code: apps/admin/src/proxy.ts → packages/server/src/auth/{adminRoutePolicy, adminSession, supabaseServer}
        apps/admin/src/app/api/admin/* → packages/server/src/auth/requirePermission → staffSession, decide, scope
                                       → packages/server/src/repositories/{staff, auditLog}
```

**The backend check is the only gate on the data.** The apps read Supabase as `service_role`,
which bypasses RLS, so `requirePermission` in each admin route body is all that stands between a
request and the data. The proxy only filters out requests with no session, as Next's docs advise
(it "should not be your only line of defense"). RLS protects only direct access with a user's own
token (none of the access tables grant `anon` or `authenticated` anything). Two tests keep this
honest:
- `apps/admin/src/app/api/admin/access.test.ts` walks every admin route file on disk and fails on a
  route or method that is not public, session-only or guarded by a rule;
- the same file runs every guarded method through the real gate as allowed, no session, no grants,
  expired, wrong scope, no MFA, and the shared password.

The access rules are [`PERMISSIONS.md`](PERMISSIONS.md); the Panel 0 design is
[`design/panel-0-access-foundation.md`](design/panel-0-access-foundation.md); what the panel does
is in [`PANEL_DOCS.md`](PANEL_DOCS.md).

## 2. Framework constraints

Fixed by Next.js 16. These are not design choices, and three of them have already caused wrong
conclusions (see [`HANDOFF.md`](HANDOFF.md) §3).

- In each app, files under `src/app/**` named `page`, `layout`, `route`, `loading` or `error`
  **are** the routing table. Their path **is** the URL. Any other file there (a component, a test)
  is colocated safely and never routable.
- With a `src/` folder, `proxy.ts` (Next 16's rename of Middleware) and the instrumentation files
  must sit in the app's `src/`, beside `app/`. Silently inert anywhere else (`src-folder.md`).
- Next reads `.env*` only from the app's own folder. Both `next.config.ts` files load the files at
  the repository root with `@next/env`, so one `.env.local` serves every app; the worker passes
  `--env-file-if-exists=../../.env.local`.
- `apps/web/next.config.ts` imports `ALLOWED_IMAGE_HOSTNAMES` from
  `@timesprime/shared/config/imageDomains` at **config-load time**. Next's config loader resolves a
  relative import from the working directory, not from the config file, so the import uses the
  package name, and `imageDomains.ts` imports nothing (CR-06).
- `images.remotePatterns` hostnames are matched with **picomatch globs**, not string equality, and
  the array is capped at **50 entries**. 49 are used.
- Turbopack compiles the workspace packages without `transpilePackages`, and finds the repository
  root from the single `package-lock.json`.
- Nothing is deployed until the project is complete; the target is AWS (`ap-south-1`).
  `vercel.json` is gone: the worker's scheduler replaces it ([`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md),
  Phase I).

## 3. How the structure got here

Four restructures, each recorded in an ADR with the alternatives it rejected.

- **Restructure 1** ([ADR 0001](adr/0001-feature-first-structure.md)). A catch-all `src/lib/` let a
  client component import the audit logger and pull the whole Supabase SDK into `/admin`'s browser
  bundle (fixed in `b01d528`). Code was grouped by feature and the import rules made to fail CI.
- **Restructure 2** ([ADR 0002](adr/0002-frontend-backend-separation.md)). Five top-level folders
  (`app/`, `frontend/`, `backend/`, `shared/`, `database/`), every route a one-line re-export, held
  in place by ~1,400 lines of custom tooling.
- **Restructure 3** ([ADR 0004](adr/0004-standard-src-layout.md), 2 Nov 2026). The standard single
  `src/` app: routes with their code, no re-exports or barrels, `server-only` plus lint zones.
- **Restructure 4** ([ADR 0005](adr/0005-apps-and-packages.md), 4 Nov 2026). The owner-approved
  plan separates the reader site, the back office and the jobs into apps over shared packages, so an
  admin deploy cannot reset the reader's cache, the editor's code never reaches readers, the admin can
  sit behind a stricter firewall, and election-night reader load cannot starve the editors. `/admin`'s
  client JS halved (163,762 → 80,206 bytes) once it stopped carrying the reader's header and ticker.

## 4. Layout

```
apps/
  web/                     the reader site (Next.js 16)
    src/app/               home, article, about, contact, privacy, terms, saved; public APIs:
                           /api/news/{top-headlines, breaking-news, check-new, scrape-article},
                           /api/chat, /api/translate, /api/health
    src/components/        news/ (cards, masthead, footer, menu, ticker, banner), home/, article/,
                           chat/, ui/
    src/context/           LanguageContext
    src/lib/               bookmarks (saved articles, in the browser)
  admin/                   the back office (Next.js 16); keeps the /admin and /api/admin paths
    src/proxy.ts           the optimistic session check (§1)
    src/app/admin/         the dashboard and the staff sign-in; panels arrive as route folders
    src/app/api/admin/     every admin route handler, each gated by requirePermission
    src/components/        the dashboard widgets and AdminTopBar
  worker/                  scheduled jobs (plain Node + TypeScript via tsx, no Next.js)
    src/jobs.ts            the jobs by name: refresh-news
packages/
  server/                  @timesprime/server: server-only, every module opens with import "server-only"
    src/auth/              the access foundation (Panel 0): requirePermission (the gate), decide, scope,
                           adminRoutePolicy, staffSession, supabaseServer, mfa, adminSession
    src/repositories/      Supabase queries: db.ts (articles), auditLog.ts, staff.ts
    src/services/          news (feed read path, breaking news, refresh), scrape, translate, classify, health
    src/lib/               domain-free infrastructure: cache, rateLimit, readJsonBody, supabase, …
  shared/                  @timesprime/shared: client-safe config, types and lib (urlValidation, sentryScrub)
  ui/                      @timesprime/ui: React shared by both apps (ThemeContext)
database/                  schema.sql, policies.sql, migrations/, bootstrap/, seed/: applied by hand
scripts/                   generate-access-catalog.mjs: the permission catalogue SQL from PERMISSIONS.md
docs/
```

Each package exposes its modules through `exports` in its `package.json`
(`@timesprime/server/auth/requirePermission`, `@timesprime/shared/config/newsConfig`,
`@timesprime/ui/ThemeContext`). Each app imports its own files as `@/…`. All dependencies are
declared once, in the root `package.json`.

A route handler holds only HTTP: it reads the request, calls `packages/server`, and turns the result
into a response. A server page that needs the same data calls the same function, never its own API
over HTTP (`getTopHeadlines` serves both `/api/news/top-headlines` and the article page's
suggestions). *Target state:* `apps/web/src/app/api/news/scrape-article/route.ts` still carries some
logic inline; moving it out is behaviour-preserving work for later, behind characterization tests.

## 5. Import rules

Lint enforces these (`eslint.config.mjs`, part of `npm run verify` and CI). The zones use
`import/no-restricted-paths`, which judges the resolved path, so `@timesprime/server/x` and a
relative path to the same file are the same import.

| Rule | Why |
|---|---|
| Client-safe code (each app's `components`, `context`, `lib`; `packages/shared`; `packages/ui`) never imports `packages/server` | A client bundle that reaches server code ships it to every reader. Server data reaches the UI as props from a page, or through a route handler |
| Every `packages/server` module starts with `import "server-only"` (`boundaries/server-only-first`) | Turns any client import of server code, direct or through another module, into a `next build` error. This is the check lint alone cannot do: it catches the transitive case |
| Packages never import an app; `packages/server` and `packages/shared` import no React UI (`packages/ui`) | Both apps depend on the packages, so the packages depend on neither |
| No app imports another app (web, admin, worker) | What two apps need belongs in a package |
| Components never import an app's `src/app` | A page imports its components, not the other way round |
| `packages/shared/src/config/imageDomains.ts` imports nothing | `apps/web/next.config.ts` evaluates it at config-load time (CR-06) |

Every zone and `server-only-first` were proven when they were written: a deliberate violation
failed lint with its message, then passed once removed. `apps/admin/src/proxy.ts` imports the
server-only `packages/server/src/auth/adminSession.ts`, which is valid: Proxy runs on the Node.js
runtime by default (`proxy.md`, "Runtime").

The worker runs outside Next, so `import "server-only"` would throw there; its `job` script runs
Node with the `react-server` condition, under which the package resolves to its empty module.

## 6. Module responsibilities

| Module | Owns | Must never |
|---|---|---|
| `apps/web` | The reader site: pages, public route handlers, the reader UI | Import the admin app or the worker; hold business logic in a route handler |
| `apps/admin` | The back office: `/admin` pages, `/api/admin` handlers, the proxy, the panels | Serve reader pages; import the reader site |
| `apps/worker` | Scheduled and queued jobs, each a function in `packages/server` called by name | Serve HTTP; import an app |
| `packages/server/src/auth` | Who is asking and what they may do: the session, the permission rule, the gate every admin route passes, the route policy, MFA, the shared password until it is retired | Trust an identity from a header, body or query |
| `packages/server/src/repositories` | Supabase queries | Cache the staff record (revocation applies to the next request) |
| `packages/server/src/services` | Domain logic: the feed read path, breaking news, the refresh, scraping, translation, classification, health | Return HTTP responses; that is the route handler's job |
| `packages/server/src/lib` | Domain-free infrastructure: no `Article`, no category, no UI string | Import a product module |
| `packages/shared` | Static data, editorial rules, types and helpers that run in every runtime | Import React, `server-only` or either side's code |
| `packages/ui` | React shared by the apps (providers, later primitives) | Import `packages/server` |
| `database/` | The schema, the RLS policies, the migrations, the bootstrap and seed scripts, applied by hand | Be imported by code |

## 7. Decision records

Structural decisions, and the alternatives rejected, live in [`adr/`](adr/):

- [`0005-apps-and-packages.md`](adr/0005-apps-and-packages.md), **Accepted**: this layout and the
  rules in §5.
- [`0004-standard-src-layout.md`](adr/0004-standard-src-layout.md), **Superseded by 0005**: the
  single-app `src/` layout of restructure 3.
- [`0003-primary-section-scope.md`](adr/0003-primary-section-scope.md), **Accepted**: for
  permission scope, an article's section is `category[0]` (Panel 0).
- [`0002-frontend-backend-separation.md`](adr/0002-frontend-backend-separation.md), **Superseded by
  0004**: the five-folder split of restructure 2.
- [`0001-feature-first-structure.md`](adr/0001-feature-first-structure.md), **Superseded by
  0002**: the feature-first `src/` layout of restructure 1.
