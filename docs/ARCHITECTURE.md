# Architecture

**Structure:** one repository, three apps and three shared packages (npm workspaces). `apps/web` is
the reader site, `apps/admin` the back office, `apps/worker` the scheduled jobs; `packages/server`
holds the server-only code, `packages/shared` the client-safe config, types and helpers, and
`packages/ui` the React both apps share. Lint keeps each side to its own imports, and
`import "server-only"` keeps server code out of every browser bundle. Decided in
[ADR 0006](#adr-0006--three-apps-over-shared-packages-2026-11-04), following the owner-approved
[`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md) (section 3). Where new code goes:
[where new code goes](README.md#where-new-code-goes).

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

The access rules are [the access rules](PANEL_DOCS.md#access-rules); the Panel 0 design is
[Panel 0's design](PANEL_DOCS.md#panel-0-design-the-access-foundation); what the panel does
is in [`PANEL_DOCS.md`](PANEL_DOCS.md).

## 2. Framework constraints

Fixed by Next.js 16. These are not design choices, and three of them have already caused wrong
conclusions (see [the gotchas](OPERATIONS.md#3-gotchas-that-have-already-burned-time)).

- In each app, files under `src/app/**` named `page`, `layout`, `route`, `loading` or `error`
  **are** the routing table. Their path **is** the URL. Any other file there (a component, a test)
  is colocated safely and never routable.
- With a `src/` folder, `proxy.ts` (Next 16's rename of Middleware) and the instrumentation files
  must sit in the app's `src/`, beside `app/`. Silently inert anywhere else (`src-folder.md`).
- Next reads `.env*` only from the app's own folder. Both `next.config.ts` files load the files at
  the repository root with `@next/env` (with `forceReload`: Next has already loaded and cached
  the app's own folder, gotcha 3.25), so one `.env` serves every app; the worker passes
  `--env-file-if-exists=../../.env`.
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

- **Restructure 1** ([ADR 0001](#adr-0001--feature-first-structure-with-layer-separation-and-a-ci-enforced-boundary-2026-10-30-superseded-by-0002)). A catch-all `src/lib/` let a
  client component import the audit logger and pull the whole Supabase SDK into `/admin`'s browser
  bundle (fixed in `b01d528`). Code was grouped by feature and the import rules made to fail CI.
- **Restructure 2** ([ADR 0002](#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-by-0004-in-part-and-by-0005)). Five top-level folders
  (`app/`, `frontend/`, `backend/`, `shared/`, `database/`), every route a one-line re-export, held
  in place by ~1,400 lines of custom tooling.
- **Restructure 4** ([ADR 0005](#adr-0005--the-standard-nextjs-src-layout-2026-11-02-superseded-by-0006), 2 Nov 2026). The standard single
  `src/` app: routes with their code, no re-exports or barrels, `server-only` plus lint zones.
- **Restructure 5** ([ADR 0006](#adr-0006--three-apps-over-shared-packages-2026-11-04), 4 Nov 2026). The owner-approved
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
scripts/                   generate-access-catalog.mjs: the permission catalogue SQL from docs/PANEL_DOCS.md
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

## Decisions

One record per significant decision, never edited once merged. A superseded record is not edited or
deleted: a later one supersedes it and links back, so the reasoning survives. Each carries its
**status**, the **context** (including the constraints that were not chosen), the **decision**, the
**alternatives rejected**, and why, and the **consequences**. Until 2026-11-03 each was a file in
`docs/adr/`; `main` merged them here, and the apps/packages merge carried this branch's two in after
them.

| Record | Decision | Status |
|---|---|---|
| [Owner decisions](#owner-decisions) | The owner's product, scope and process decisions, with where each landed | Standing |
| [ADR 0001](#adr-0001--feature-first-structure-with-layer-separation-and-a-ci-enforced-boundary-2026-10-30-superseded-by-0002) | Feature-first `src/` layout with layer separation and a CI-enforced boundary (restructure 1) | Superseded by 0002 |
| [ADR 0002](#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-by-0004-in-part-and-by-0005) | One Next.js app split into `app/`, `frontend/`, `backend/`, `shared/` and `database/`, with rules F1–X1 and V1 (restructure 2) | Superseded by 0004 in part (on `main`), and by 0005 (on `chore/restructure`) |
| [ADR 0003](#adr-0003--an-articles-section-for-permission-scope-is-its-first-category-2026-11-02) | For permission scope, an article's section is `category[0]` (Panel 0) | Accepted |
| [ADR 0004](#adr-0004--four-top-level-folders-four-documents-2026-11-03-superseded-in-part-by-0006) | Four top-level folders and four documents (restructure 3, on `main`) | Superseded in part by 0006 |
| [ADR 0005](#adr-0005--the-standard-nextjs-src-layout-2026-11-02-superseded-by-0006) | The standard Next.js `src/` layout: routes with their code, `server-only` and four lint zones as the boundary (restructure 4, on `chore/restructure`) | Superseded by 0006 |
| [ADR 0006](#adr-0006--three-apps-over-shared-packages-2026-11-04) | Three apps (`web`, `admin`, `worker`) over shared packages (`server`, `shared`, `ui`) in npm workspaces (restructure 5, the plan's Phase C) | Accepted |

### Owner decisions

**Product (2026-10-29), all five answered.** Full rationale in the retired PRD's §12 (in git history).

| # | Decision | Where |
|---|---|---|
| Q1 | **Paraphraser: deleted.** Headlines shown as the source published them | `3805007` |
| Q2 | **RSS: deleted**, including the 503 route. Route table 27 → 26 | `bcd5393` |
| Q3 | **Editorial publishing: kept.** Lives in the admin feature. `country: ["us"]` and the filter bypass logged, not fixed | BL-004 |
| Q4 | **Contact form and newsletter: UIs removed.** `/contact` page kept, listing emails | `59b875d`, BL-005 |
| Q5 | **EN/HI is the scope.** An explicit non-goal in the PRD, so the discard is not treated as a bug | PRD §3 |

**Plan (2026-11-04):** `NEWSROOM_PLAN.md` approved as the one plan every developer follows; sign-off
item 6 (how aggregated items show) is pending, and until then they stay hidden. `PANEL_PLAN.md` and
the PRD retired; the access rules moved to the access rules (`PANEL_DOCS.md`).

**Structure (restructure 5, 2026-11-04):** three apps over shared packages (ADR 0006, superseding ADR
0004's single app, which superseded ADR 0002's five-folder split). Routes hold their own code;
components are imported from their own files, with no barrels; `server-only` and lint zones keep
server code out of the browser and the apps apart.

**Audit (Phases 0–5).** Each one is recorded in the ledger row or backlog entry it governs:
- **Severity:** the higher rating governs (F-003 Critical, F-013 High). The jest lows are accepted;
  `npm audit fix --force` is never run.
- **D1:** login and the public scraper use a Redis fixed window on the existing `@upstash/redis`,
  falling back to memory, with the fallback logged. Every other route uses the in-memory limiter.
- **D3:** the `translateHeadline` no-op is removed (BL-026).
- **F-005:** the trust anchor is the stored articles (exact link match), not signed links (BL-023).
- **F-015:** the admin's explicit purge stays. **BL-022:** kept.
- **F-017:** external callers of the public scraper see 502/504. **F-021:** the feed's effect runs on
  language only. **F-027:** the growth is accepted. **F-028:** Partial.
- **Refuted, never "fixed":** the `javascript:` XSS, `preload` on `next/image`, AVIF/SVG. Sentry's
  `tunnelRoute` must never be enabled (D12): it would add a route the proxy does not see.

**Process and hosting (2026-11-02):**
- **Branches:** all work happens on a branch (`panel-N-<name>`, `fix/<topic>`, `chore/<topic>`), and
  only that branch is pushed. Nothing reaches `main` without the owner's approval.
- **A production-level standard:** a panel is done only with items 7–13 of CLAUDE.md's definition
  of done as well:
  - real-database tests against the local Supabase (the local database was dropped since: see §2);
  - end-to-end browser tests, including a refused-access flow;
  - loading, error and empty states;
  - accessibility;
  - failures in Sentry and privileged actions audited;
  - a JS size budget per route in CI;
  - a runbook for when the main flow breaks.
- **The audit's remaining items** wait for Panel 0's merge, then go on `fix/audit-closeout` (§ "Next").
- **Deployment:** none until the whole project is complete. Ignore the earlier Vercel deployment.
  The target is AWS, `ap-south-1`. All verification is local.
- **The real database (later the same day):** `.env.local` holds its credentials and the app uses
  them; the local database was dropped. Never write to it yourself; browser tests are read-only (§2).

**Panel 0 (2026-11-02).** All recorded in the design's "Approval" section and in
[`PANEL_DOCS.md`](PANEL_DOCS.md):
- **The matrix is canonical (D2).**
- **Who is privileged, and who needs MFA (D3):** two admins to grant Super Admin, Managing Editor,
  Legal or Privacy Officer; `aal2` for those four, Desk Editor, Security Lead and Ingestion Ops;
  MFA for all staff by default (Q1).
- **Bootstrap by SQL only (D4).**
- **Scope (D5, D6, ADR 0003):** `en`/`hi` mapped from `english`/`hindi`; the section is `category[0]`.
- **One public list (D10), and the cron as `system:cron` (D11).**
- **Audit fail-closed (Q2):** "attempted", then the outcome.
- **The shared password (Q3):** ends 2027-01-01 IST in code, with a fixed permission list and no
  admin, audit or settings permission.
- **Dependencies (Q4):** `@supabase/ssr` 0.12.7 with `supabase-js` 2.116.0.
- **Removed or refused:** the purge until Panel 4 (Q5); clearing the log (Q6).
- **`admin_logs` (Q7):** frozen and readable.
- **`database/bootstrap/` (Q8).**
- **Approved at the midway STOP:**
  - no staff-record cache;
  - the banner for unscoped grants only, until Panel 3;
  - the three behaviour changes;
  - the bulk audit as one pair, with the 100-article limit.

**Follow-up the product decisions created:** the privacy policy still describes newsletter and
contact-form collection that no longer happens. Legal copy, for the owner or legal review (BL-008).

### ADR 0001 — Feature-first structure with layer separation and a CI-enforced boundary (2026-10-30, superseded by 0002)

**Status:** **Superseded by [ADR 0002](#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-by-0004-in-part-and-by-0005)** — 2026-10-30.
Restructure 2 replaced this layout with `app/`, `frontend/`, `backend/`, `shared/` and `database/`.
The lessons listed in ADR 0002's "Carried over from ADR 0001" still apply. The text below is kept as
it was written, so its paths are restructure 1's (`src/…`). The import rules it refers to
(architecture.md rules 1–8, and their Phase E enforcement table) were last in
[`ARCHITECTURE.md` at `623b918`](https://github.com/Adarsh-Pandey-25/TimesPrime/blob/623b918/docs/architecture.md#5-import-rules).
Before that: **Accepted** — 2026-10-30, owner approval of Phase C, with conditions applied: a split
criterion for `features/news`, route groups recorded as deferred, `lib/` kept domain-free, and a
`server-only` guard on every `server.ts`.
**Supersedes:** nothing. **Related:** [`ARCHITECTURE.md`](#architecture),
`scripts/move-map.mjs` (deleted in restructure 4).

#### Context

The codebase is ~12,000 lines of TypeScript on Next.js 16.3, organised by file type: `components/`
holds every component, admin and reader mixed; `lib/` holds six unrelated kinds of thing — data
access, security primitives, infrastructure, domain logic, static config and i18n — under one name
that says nothing about any of them.

The cost is concrete, not aesthetic. Nothing marks which `lib/` modules are server-only, so nothing
stops a client component importing one — and one does. `ActivityLog.tsx` imports two constants from
`adminLogger.ts`, which imports `supabase.ts`, and the production build confirmed the Supabase SDK
shipped in the browser chunk loaded by `/admin`. (Fixed before Phase D in `b01d528`; afterwards the
SDK appears in zero browser chunks.)

Forces that are not choices:

- **Next.js is unopinionated about organisation.** Its bundled docs present three strategies and
  conclude "choose a strategy that works for you and your team and be consistent". This is a team
  decision, not a framework mandate.
- **Under `src/app/`, the path is the URL.** Route handlers *are* the backend and cannot leave
  `app/` without changing every API URL (CR-01), the cron path in `vercel.json` (CR-02) and the
  proxy's auth matcher (CR-05).
- **Five files are location-pinned:** `proxy.ts`, `instrumentation.ts`, `instrumentation-client.ts`,
  `sentry.server.config.ts`, `sentry.edge.config.ts`.
- **`imageDomains.ts` is evaluated by `next.config.ts` at config-load time** and must import nothing
  (CR-06).
- **Test coverage is under 4%** (3.63% at `9f3b76f`). `tsc` and `build` prove a pure move compiles; almost nothing proves
  behaviour. So the restructure must be moves and import rewrites only.

#### Decision

Organise `src/` by **layer**, with a small number of **features** on top, and enforce the boundaries
with a lint rule rather than with documentation.

- `app/` — routing only. Paths frozen.
- `features/news`, `features/admin`, `features/chat` — one folder per capability, each with a
  `components/` (frontend) and, where it has one, a `server/` (backend) half.
- Shared layers below the features: `components/ui/` (domain-free presentation), `context/`
  (app-wide state providers — theme and language; added at Phase B close, since a stateful provider
  is not a UI primitive), `server/` (backend-only), `lib/` (cross-cutting utilities), `config/`
  (static data), `types/`.
- Imports go **downward only**. Nothing imports sideways between features. Anything two features
  both need moves down into a shared layer.
- Each feature exposes **at most two** public surfaces: `index.ts`, safe for client and server, and
  `server.ts`, server-only. **Every `server.ts` begins with `import "server-only";`**, so a client
  import of it fails the build (Next.js 16 docs, "Preventing environment poisoning").
- `lib/` stays **domain-free**. Modules that know a product concept live in a feature or in
  `config/` — the definition is not loosened to fit what happens to be in the folder.
- The rules are written in [`ARCHITECTURE.md`](#architecture) §5 and enforced in CI in Phase E.

#### How the structure was arrived at — by measurement

The Phase A draft proposed six features: `news`, `article`, `admin`, `chat`, `bookmarks`, `i18n`.
It was reasoned out file by file and looked right.

Phase C tested it instead. `scripts/check-move-map.mjs` builds the real import graph with the
TypeScript compiler API, relocates every file to its proposed target, and checks all 149 edges
against the rules. **The draft broke them 21 times.** Each violation pointed at a wrong boundary:

| Draft boundary | Violations | What the graph showed |
|---|--:|---|
| `features/i18n` | 12 | News, the article page, Header and Footer all need it. It is shared infrastructure |
| `features/bookmarks` | 2 | ArticleCard and Header both import it. Shared |
| `features/article` | 1 | The article page renders the feed's `ArticleCard`. Not separable from news |
| Header in `components/ui` | 1 | Header renders the news category menu with article previews. It is news's masthead |
| `db.ts` in `server/` | 2 | It imports news editorial policy, making `server/` depend on a feature |
| client → `server/` | 2 | The one pre-existing bug, which the draft did not fix either |

Resolving them by the rule "shared things move down" produced **three** features. The resulting
map broke the rules **twice**, and both entries were the pre-existing `ActivityLog` bug — the same
two the CODEMAP generator finds independently by a different method. That bug needed a content
edit, so it was fixed in its own owner-approved commit, `b01d528`. **The map now breaks the rules
zero times.**

In review, `bookmarks.ts` then moved from `lib/` into `features/news`: it stores `Article` objects,
so keeping it would have meant quietly redefining `lib/` as "anything shared". With Header already
in news, every importer of bookmarks was in news or `app/`, and the checker confirmed 0 violations.

The draft was wrong because it grouped files by what they seemed to be *about*. The graph groups
them by what they actually *depend on*. Only the second survives a lint rule.

#### When `features/news` gets split

`features/news` is deliberately large — it is the product's core. It must not become a second
`lib/`: a place things go because they are vaguely news-related. Review a split when **any** of
these holds. Each is checkable, not a matter of taste.

1. **The article page gains its own data access or logic.** Today it renders scraped text and has
   no server code of its own. The expected trigger is Phase F extracting the scraper into
   `features/news/server/`: once the article page owns server code that the feed never touches, it
   is a sub-domain. Split it out as `features/article` **only if** the pieces both need —
   `ArticleCard`, `newsConfig` — can move down first, so `check-move-map` still reports **0**
   violations. If they cannot, the split is premature.
2. **Size tripwire: more than 20 modules or 6,000 lines.** At acceptance it is **12 modules and
   4,091 lines** (excluding tests and the two surface files); moving Footer in before slice 4 makes it **13 and
   4,305**. Roughly 40% headroom; crossing it
   means reviewing the feature's boundary, not adding more.
3. **A news module is needed by another feature.** Then it moves down (import rule 4). It does not
   get re-exported sideways.
4. **A module stops serving the reader journeys.** Every module in `features/news` must serve
   browsing the feed, reading an article, saving one, or ingesting news (PRD §5). A utility that
   knows nothing about news belongs in `lib/`; one that only an operator uses belongs in
   `features/admin`. This is the test that keeps it from becoming `lib/` again.

#### Alternatives rejected

**1. Top-level `frontend/` and `backend/` folders, or two separate apps.** The literal reading of
"separate frontend and backend". In the App Router, `app/api/**/route.ts` is the backend and its path
is the URL, so a `backend/` folder breaks CR-01, CR-02 and CR-05. Two deployable apps would be a
rewrite, not a reorganisation: a second service to run and deploy, auth to rebuild, and server
components losing direct data access. The goal behind the request — a real wall between browser
code and server code — is better met by layers enforced in CI, which is stronger than folder
distance: a folder can be imported across, a failing lint rule cannot be merged.

**2. Full Feature-Sliced Design.** Its layer taxonomy (`shared` / `entities` / `features` /
`widgets` / `pages`) is the mature version of this idea, and it was the obvious answer to the
`ArticleCard` problem — an `entities/article` layer would let news and the article page share the
card. Rejected as too heavy here: ~12,000 lines, two personas, and three real features do not need
five layers and their conventions. Merging the article page into news solved the same problem with
no new layer.

**3. Keep the type-based layout (`components/`, `lib/`) and just tidy it.** Cheapest, and it does
not address the actual failure: a folder named by file type cannot say which code is server-only,
and so cannot stop a client component importing it. The one violation that exists today is exactly
this.

**4. The six-feature Phase A draft.** Rejected by measurement — 21 violations, above. Recorded as a
rejected alternative because it was the *approved* design at the end of Phase A, and the reason it
changed should not be lost.

**5. One `index.ts` barrel per feature.** The conventional single public surface. Rejected for
`features/news`, which holds both client components and server modules: a client import of any
component through the barrel would resolve `db.ts` as well. `supabase.ts` calls `createClient()` at
module scope — a side effect no bundler can remove — which is precisely how the SDK reached the
browser through `ActivityLog`. Two surfaces make server code unreachable from the client by
construction. The barrels were measured, and they were **not** free: slice 5 found that a server
component importing one client component from a barrel pulled in every client component the
barrel re-exports, on every route that rendered it. Each feature folder therefore carries a
`package.json` declaring itself side-effect-free except for `server.ts`, after which the bundle
matched the pre-slice build exactly (architecture.md rule 1). Slice 6 measures again.

**6. A separate `src/shared/` layer for product-aware shared code.** Proposed as a home for
modules that carry product knowledge but are used in more than one place, so that `lib/` could stay
domain-free. Rejected because, once measured, it would hold one file: `bookmarks.ts`, whose
consumers are all in `features/news` or `app/`. It joined news instead. Reconsider if a
product-aware module is ever genuinely needed by two features — that is the case this layer is for,
and today there is no such module.

##### Considered and deferred

**Route groups under `app/` — `(reader)` and `(marketing)`.** Considered as part of the plan from
the start. **Deferred by owner decision**, for three reasons: they change no URL; they buy nothing
while no page shares a group layout, since every page imports Header and Footer itself; and moving
every page file is exactly what trips the stale-route-types failure in BL-007. Revisit when a group
layout can own the shared Header and Footer — which is a code change, so Phase F at the earliest.

#### Consequences

**Easier.**
- "Where does this go?" has a rule-based answer, and the rule can be checked by a script.
- Server-only code is unreachable from the browser by construction once Phase E is on.
- Deleting a capability means deleting one folder.
- CODEMAP's targets and MOVE-MAP's file lists both render from one data file, so they cannot drift.

**Harder.**
- `features/news` is large — 13 files, the core of the product — and will be the main subject of
  Phase F decomposition.
- `Header` lives in a feature although every page uses it. Pages import it from `app/`, which is
  allowed; a cleaner design passes the category menu in as a slot, which is a Phase F change.
- Every new import has to respect the direction rule, and a contributor who gets it wrong learns
  from CI, not from review.
- Two public surfaces per feature is one more convention to know.

**Deferred, deliberately.**
- Route groups under `app/` — see *Considered and deferred*.
- Extracting logic out of route handlers — Phase F, behind characterization tests.

**Done before Phase D.**
- The `adminLogger` split (MOVE-MAP SC-1), `b01d528` — the one boundary violation, fixed.

### ADR 0002 — Frontend, backend, shared and database separation in one Next.js app (2026-10-30, superseded by 0004 in part and by 0005)

**Status:** **Superseded by [ADR 0005](#adr-0005--the-standard-nextjs-src-layout-2026-11-02-superseded-by-0006)** — 2026-11-02 (proposed on
`chore/restructure`). Restructure 4 moved the code to the standard `src/` layout. The text below is
kept as it was written, so its paths are restructure 2's, and the scripts it links to are in git
history only. Before that: **Accepted** — 2026-10-30, owner approval at the S4 review. Written as a
draft during restructure 2, recording each decision as it was taken, and finalized in S5.
**Supersedes:** [ADR 0001](#adr-0001--feature-first-structure-with-layer-separation-and-a-ci-enforced-boundary-2026-10-30-superseded-by-0002)'s layout; its other lessons carry over
(below). **Related:** [`ARCHITECTURE.md`](#architecture) (the layout and the rules, in prose),
`scripts/move-map.mjs` (where every file went, and each slice's
checklist; deleted in restructure 4), `scripts/check-move-map.mjs` (the rules below; deleted with it).

#### Context

The owner's reviewer asked for frontend, backend, database and docs to be visibly separate. In the
App Router the files under `app/` are the URL contract: a route's path is its folder, so page and
route files cannot simply move into `frontend/` or `backend/`. ADR 0001's feature-first layout
(`src/features/<feature>/` holding a feature's UI and its server code together) satisfies the import
rules, but it does not show the separation at a glance.

#### Decision

One Next.js app, organised as:

- `app/` — the routing shell. Each `route.ts` re-exports its handlers from `backend/api/`, and each
  page re-exports a view from `frontend/views/`. The exceptions are the two pages that combine
  backend data with a view: `app/page.tsx` and `app/article/[slug]/page.tsx`. A route file holds
  only re-exports and literal segment config (A2).
- `frontend/` — `views/` (page bodies), `features/<feature>/` (UI a feature owns, behind an
  `index.ts` entry point), `components/ui/`, `context/`, `styles/`.
- `backend/` — `api/` (route bodies), `services/<service>/` (behind an `index.ts` entry where the
  service has one), `repositories/`, `auth/`, `lib/`. Every backend module is server-only.
- `shared/` — `config/`, `types/` and `validation/`, which both sides import.
- `database/` — the SQL and the seed script. Nothing imports it.
- `proxy.ts`, `instrumentation*.ts` and `sentry.*.config.ts` stay at the root, where Next looks for
  them.

The rules, as `check:boundaries` and, from S4, lint enforce them
([`ARCHITECTURE.md`](#architecture) §5 says where each is enforced):

| Rule | What it says |
|---|---|
| F1 | Frontend never imports backend, and the client bundle never reaches it transitively |
| B1 | Backend never imports frontend |
| S1 | Shared imports nothing from frontend, backend or `app/` |
| A1 | `app/` composes frontend, backend and shared, and is the only place they meet: nothing else imports `app/`, and the root files Next pins in place keep to their runtime's side |
| A2 | Every `app/**/route.ts`, and every page whose body has moved, holds only re-exports and literal segment config |
| P1 | The proxy imports only `backend/auth` and `shared/` |
| D1 | Nothing imports `database/` |
| X1 | No cross-feature or cross-service imports; other code reaches a feature or service only through its entry point |
| V1 | Features never import views (owner, S4) |
| R3, R5, R7, R9 | UI, config, types and context import only what their layer allows |
| LIB | `backend/lib` imports no project module |
| CR-06 | `next.config.ts` imports only `shared/config`, and `imageDomains.ts` imports nothing |

##### Recorded during the move (S3)

- **Features never export views** (owner, at the slice-9 review). Views sit above features: a view
  composes features through their entry points, so a feature's barrel must not re-export a view.
  After slice 9 the news barrel still re-exported `HomeClient` and `ArticleDetailView`. That formed
  a runtime import cycle (view → news entry → view). It cost nothing in size, but it was a latent
  module-initialisation risk. Removed in `4460a40`; pages now import their views from
  `@/frontend/views/...`. From S4, rule V1 enforces it in lint and `check:boundaries`.
- **Views import features only through the entry point (X1), at an accepted cost.** Routing
  `HomeClient` through `@/frontend/features/news` added 109 bytes (0.09%) of client JS to `/`: the
  bindings Turbopack emits for imports that go through a re-export. Three throwaway builds showed
  the cost is not caused by the cycle and is not removed by `sideEffects` (`0efa628`). The owner
  kept X1.

##### Recorded during enforcement (S4)

- **R5 keeps its Phase D meaning.** When `check:boundaries` was rewritten for the new layers in
  S2, R5's "ui imports only ui/, lib/, types/" became "ui/ and shared/". But `shared/` also holds
  `config/`, which the Phase D decision keeps out of UI primitives. So a UI primitive could import
  `shared/config` unflagged. Restored in `52d283e`: `ui` imports only `ui/`, `shared/types`,
  `shared/validation` and `ThemeContext`. No existing import changed status.
- **A2 is in lint as well as `check:boundaries`.** ESLint can express it, as the local rule
  `boundaries/shim-only`, which runs the same check. Only `check:boundaries` sees a shim that has
  gone missing.

#### Carried over from ADR 0001

- Feature entry points with a `package.json` `sideEffects` field. The lesson behind it: an unmarked
  barrel, imported by a server component, shipped every client component it re-exported.
- `import "server-only"` as the first statement of a server module.
- The transitive client-bundle check in `check:boundaries`, which lint cannot do.

#### Alternatives rejected

- **Two separate apps** (owner decision). Every API URL would change, and the Vercel cron contract
  (`/api/cron/refresh-news`) would break. The proxy's admin auth would have to be rebuilt across
  origins, and deployments would double.
- **Keeping `src/` feature-first** (ADR 0001). The separation the reviewer asked for would still not
  be visible.
- **`categoryClassifier` under `services/news/`.** It would form an import cycle with the news entry,
  which re-exports `db.ts`, so it lives in `services/classify/`.
- **Splitting pages or the cron route into fetch + view.** That is a logic change, not a move.

#### Consequences

**Measured.** S1 removed dead code first, so the move covered only code in use. 95 files then moved
in 11 slices (`b0fe915`..`2b9cb94`), each a gated commit.
- **Routes:** the route table matched `_baseline-routes.txt` (28 routes) at every commit, and segment
  config was identical.
- **CSS:** byte-identical throughout (93,463 bytes).
- **Client JS:** from the S2 baseline, 974,032 → 974,067 bytes (+35). `/` grew 50 bytes, the cost
  of routing `HomeClient` through the news entry point (above). Every other route shrank by 2 to 70
  bytes. Against S0, before the cleanup, the total is 978,242 → 974,067 (−0.43%).
- **Tests:** 9 suites, 70 tests throughout.
- **Lint:** 0 errors, 14 warnings, the same count as before restructure 2.
- **Coverage:** measured over 74 files once the 25 shims are excluded by name (`SHIMS`, derived from
  the move map): 9.27% of statements, 53.69% of branches, 37.61% of functions at the end of S4.
- **History:** `git log --follow` reaches each moved file's earlier history. The two rewritten
  barrels show as a delete plus an add.

**Easier.**
- A file's folder says which side it runs on, and the separation is visible at a glance.
- A client import of backend code fails three ways: lint, `check:boundaries`, and the build, since
  every one of the 32 backend modules opens with `import "server-only"`. Each rule was proven by a
  deliberate violation (S4).
- A reviewer can cite a rule by ID (F1, A2, X1, …), and both tools report the same ID.

**Harder.**
- A route, or a moved page, is two files: a one-line shim in `app/` and its body.
  [where new code goes](README.md#where-new-code-goes) says which file goes where.
- A2 checks route files and the moved pages, not a new page's file, which may compose server data.
- The two composition pages stay in `app/`, and the article page fetches its own API over HTTP
  (BL-016).
- Route bodies in `backend/api/` still carry some logic inline (`news/scrape-article.ts`,
  `news/top-headlines.ts`). Moving it into services is later work, behind characterization tests.
- `scripts/move-map.mjs` outlives the move. `SHIMS`, which drives the coverage exclusion and A2 in
  lint, and the missing-shim check in `check:boundaries` are derived from it.
- An import through an entry point costs a few bytes of client JS (109 on `/` at slice 9).
  `"sideEffects": false` (`bae6f8a`) keeps the barrels from costing more.

### ADR 0003 — An article's section, for permission scope, is its first category (2026-11-02)

**Status:** **Accepted**: 2026-11-02, with the owner's approval of the Panel 0 design. Drafted the
same day from owner decision D6 on the Step 1 report.
**Related:** [the access rules](PANEL_DOCS.md#generic-roles-scoped-by-language-desk-and-section), from the retired `PANEL_PLAN.md` ("Generic roles, scoped by language desk and
section"), [Panel 0's design](PANEL_DOCS.md#panel-0-design-the-access-foundation) §3,
[`database/schema.sql`](../database/schema.sql) (`articles.category`).

#### Context

The plan scopes editorial roles by language desk and section: one Desk Editor role, assigned with
`language = hi, section = sports`, not a "hindi_sports_editor" role. A scoped permission check
therefore needs the section of the article being acted on.

TimesPrime has no section column. `articles.category` is `TEXT[]`, and one article can carry several
tags:
- **Ingested articles** take NewsData's array as delivered, or the fetch category when NewsData
  sends none (`backend/services/news/newsdata.ts`, `backend/repositories/db.ts`). The order is
  NewsData's. It is not the category the cron happened to fetch the article under, and the first tag
  can be a broad one such as `top`.
- **Editorial articles** get one tag, the one the editor chose (`backend/api/admin/publish-article.ts`).
- **Edits** can replace the whole array (`PATCH /api/admin/articles`).
- **`category_mismatches`** lists the tags that Claude Haiku judged not to fit. It is written
  asynchronously, after the article is saved, and NULL means "not yet classified".

#### Decision

**For permission scope, an article's section is `category[0]`, as stored.** An article with a NULL
or empty `category` has no section. Only an assignment with no section limit (`section` NULL)
covers it.

`category_mismatches` does not change the answer. Changing `category[0]` is itself a scoped act: an
edit that changes `category[0]` needs the permission in the scope of both the old and the new
section.

The rule lives in one function, `articleScope()` in `backend/auth/scope.ts`, next to the language
mapping (`english` ↔ `en`, `hindi` ↔ `hi`, decision D5). Tests cover it there.

#### Alternatives rejected

- **Any category matches.** An editor scoped to `sports` could act on any article tagged `sports`
  anywhere in its array, and could bring any article into scope by adding `sports` to it: the edit
  itself would pass the check, because the new array contains their section. Scope would bound
  nothing. This is the owner's reason for D6.
- **All categories must match.** It closes that hole, but an article tagged `["sports", "business"]`
  would be out of reach of both the sports and the business desk, and most multi-tag articles would
  fall to Managing Editors only.
- **A new `section` column.** It is the cleanest long-term answer, but it is a schema change and a
  backfill decision for every existing row. The plan's data model lists `section_id` under "articles
  (extend)" for Phase 2, where the editorial workflow adds the other article columns. If that column
  arrives, `articleScope()` reads it instead, and this ADR is superseded.
- **Skip tags in `category_mismatches`.** The scope would change when a background job finished,
  moving articles between desks unpredictably, and an unclassified article would get a different
  answer from a classified one.

#### Consequences

- A desk's section names are NewsData's category keys, plus the keys editors use. A Panel 1
  assignment form validates a section against that list.
- Because NewsData decides the order, an ingested article's first tag may be broad (`top`). Such an
  article belongs to whichever desk is scoped to that tag, or to unscoped editors. Desk assignments
  should be planned with this in mind, and Panel 2's desk filter shows editors the same rule.
- Reordering tags moves an article between desks. The both-scopes rule above means no one can do
  that for an article outside their own scope.
- An article whose `language` is neither `english` nor `hindi` has no language scope, and only
  all-language assignments cover it (deny by default).

### ADR 0004 — Four top-level folders, four documents (2026-11-03, superseded in part by 0006)

**Status:** **Accepted** — 2026-11-03, owner approval of the restructure-3 design (S0), with seven
decisions. Built on `chore/four-folders`, branched from `release/v1`.
**Superseded in part by [ADR 0006](#adr-0006--three-apps-over-shared-packages-2026-11-04)** (2026-11-04), when `main` was
merged into the apps/packages layout: the code layout (`frontend/`, `backend/`) gave way to `apps/`
and `packages/`, and `check-boundaries.mjs` to the lint zones and `server-only`. Carried over:
the env-file rules (the file is the root `.env`), `agentRules: false`, the Turbopack and tracing
roots, `.claude/settings.json`, and `check:docs`, whose list now also holds the plan, its research
and the root `CLAUDE.md` (the owner asked for that file on 4 Nov 2026, after this decision).
**Supersedes in part:** [ADR 0002](#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-by-0004-in-part-and-by-0005)'s
five top-level parts. Its rules carry over, for the new paths ([the import rules](#5-import-rules)).

#### Context

The owner wanted the repository to show exactly four top-level folders, `frontend/`, `backend/`,
`database/` and `docs/`, and exactly four Markdown files, all in `docs/`: no `CLAUDE.md`,
`AGENTS.md`, `CONTRIBUTING.md` or root `README.md`. The real credentials file is named `.env`. Every
dependency the project needs stays; clutter goes.

Fixed by the framework: `app/`, `public/`, `proxy.ts` (beside `app/`), the instrumentation files,
`next.config.ts` and the env files sit in the Next.js root (bundled docs: `proxy.md`,
`instrumentation.md`, `public-folder.md`, `src-folder.md`). Turbopack resolves no file outside its
root and output tracing includes none outside its own (`turbopack.md`, `output.md`).

#### Decision

- **`frontend/` is the Next.js root.** It holds `app/` and every Next.js root file. Vercel's Root
  Directory is `frontend`. `turbopack.root` and `outputFileTracingRoot` are the repository root,
  where the one `package.json` and lockfile are, so `app/` can import `backend/`.
- **Next.js and Jest run in `frontend/`** (`cd frontend && next build`, `cd frontend && jest`); lint
  (`eslint -c frontend/eslint.config.mjs`) and the typecheck (`tsc -p frontend`) run from the root.
  Measured: Next's `next.config.ts` loader compiles the config into a module without a filename
  (`requireFromString`, `next/dist/build/next-config-ts`), so Node resolves the config's relative
  imports against the working directory. From the root, `../backend/shared/config/imageDomains`
  failed ("Cannot find module").
- **`shared/` becomes `backend/shared/`**, imported as `@/backend/shared/*` (70 imports rewritten);
  `@/shared/*` is gone. It keeps its meaning: frontend code may import it, and it is not
  server-only. **`scripts/` becomes `backend/scripts/`.**
- **Tailwind scans the whole repository** (`@source "../.."` in `globals.css`). Detection starts at
  the working directory, now `frontend/`, and utilities are also written in
  `backend/shared/config/categoryColors.ts`: without it, 12 selectors went missing.
- **`check-boundaries.mjs` replaces restructure 2's move map and its checker.** A1 names what
  `app/` may import from `backend/`; A2 covers every route and every page but the composition pages,
  read from disk (BL-032); a missing file for a route-table URL fails. `backend/scripts/shims.mjs` is
  the one list for lint, the checker and coverage.
- **Configs are merged:** `eslint.boundaries.mjs` into `eslint.config.mjs`; `jest.setup.ts` into
  `jest.config.ts` (`setupFilesAfterEnv: ["@testing-library/jest-dom"]`, plus a type reference).
  `.node-version` is gone: CI reads `engines.node` from `package.json`.
- **Env files.** The owner's credentials are `frontend/.env` (owner action). `frontend/.env.example`
  is the committed template. `frontend/.env.test`, committed with every key empty, is loaded before
  `.env` in the test environment, and `@next/env` keeps the first value it finds, an empty one
  included, so tests never see the real values; guard tests fail if a real Supabase URL reaches
  them. `.gitignore` ignores every `.env*` except the two templates.
- **Four documents**, each a merge of the files before it; `check:docs` in `verify` fails a fifth
  Markdown file or a broken link. `CODEMAP.md` and its generator are deleted: generated, stale on
  every move. `agentRules: false` stops `next dev` writing an `AGENTS.md`. The panel plan is carried
  byte-identical, and a test holds it so.
- **`.claude/settings.json`** denies Claude Code's Read and Edit on `**/.env`, `**/.env.local` and
  `**/.env*.local`, now that no `CLAUDE.md` carries that rule into every session.

#### Alternatives rejected

- **Keeping the Next.js config files at the root**: the owner's four-folder rule.
- **`next build frontend` from the root**, the CLI's directory argument: the config's import of
  `backend/` fails, as measured above.
- **A tsconfig alias in `next.config.ts`**: SWC rewrites the alias to a path relative to `baseUrl`,
  which the same loader then resolves against the working directory. Same failure.
- **Node's native TypeScript loader for the config** (`--experimental-next-config-strip-types`):
  opt-in per command, and `next/jest` always takes the legacy path, so the tests would still fail.
- **Tailwind's `base` option in `postcss.config.mjs`**: Turbopack evaluates the PostCSS config from
  a compiled chunk inside `.next`, so a path derived from the config file's own URL points there.
  Measured: 12 selectors missing.
- **npm workspaces with a `frontend/package.json`**: splits the dependency list. Kept as the
  fallback if Vercel cannot install from the root (owner decision 1).
- **Keeping `CODEMAP.md`**: generated from the repository, so it holds nothing the repository does
  not, and it is stale after every move.

#### Consequences

- The route table, the segment config, the client JS (976,120 bytes, +0 on every route) and the CSS
  (95,166 bytes, byte-identical) came through unchanged; coverage measures the same 88 files.
- Editors: the VS Code ESLint extension finds no config at the root; point it at
  `frontend/eslint.config.mjs` (`"eslint.options": { "overrideConfigFile": "frontend/eslint.config.mjs" }`).
  TypeScript resolves `@/` aliases in `backend/` files through `frontend/tsconfig.json`, which an
  editor opening a `backend/` file may not pick up; `npm run typecheck` is the authority.
- `panel-0-access` is still on the old paths. When panel work resumes, merging `main` into it
  carries its edited files to the new paths; its new files (`e2e/`, `playwright.config.ts`, the
  budget files, the `me` and `mfa` routes) move in a follow-up move commit, and its doc edits are
  merged by hand into the four documents.

### ADR 0005 — The standard Next.js `src/` layout (2026-11-02, superseded by 0006)

**Status:** **Superseded by [ADR 0006](#adr-0006--three-apps-over-shared-packages-2026-11-04)** — 4 Nov 2026: the single app split
into `apps/` and `packages/`. The text below is kept as it was written, so its paths are the single
app's. Before that: **Accepted** — 4 Nov 2026, with the owner's approval of `NEWSROOM_PLAN.md`.
**Supersedes:** [ADR 0002](#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-by-0004-in-part-and-by-0005)'s layout. **Related:**
[`ARCHITECTURE.md`](#architecture) (the layout and the rules, in prose).

#### Context

Restructure 2 split the app into `app/`, `frontend/`, `backend/`, `shared/` and `database/`. Because
the App Router fixes where route files live, every route and most pages in `app/` became a one-line
re-export of a body in `backend/api/` or `frontend/views/`: 25 files that held nothing, and every
route existed twice. Holding that shape took ~1,400 lines of custom tooling (`scripts/move-map.mjs`,
`scripts/check-move-map.mjs`, `scripts/generate-codemap.mjs`, `eslint.boundaries.mjs`) and a
generated 829-line `docs/CODEMAP.md`. The move plan the tooling was built around had finished, but it
still ran in every `npm run verify`.

The owner asked for the industry-standard structure for a high-traffic news site, with nothing kept
that does not earn its place. A new Next.js developer should find the code where the framework's own
documentation says it lives.

#### Decision

The `src/` layout from the Next.js docs (`src-folder.md`, `project-structure.md`):

- `src/app/` holds routes with their code. A route handler's body is its `route.ts`; a page's body is
  its `page.tsx`. Tests sit beside what they test.
- `src/components/` holds React UI by area (`news`, `admin`, `chat`, `ui`, and the two page bodies
  that take server data as props). No barrel files: each component is imported from its own file.
- `src/server/` holds server-only code (`auth`, `repositories`, `services`, `lib`). Every module
  opens with `import "server-only"`.
- `src/lib/`, `src/config/` and `src/types/` hold what both sides import.
- `src/proxy.ts` and the instrumentation files move into `src/`, as Next requires with a `src/` folder.
- `database/`, `docs/`, `scripts/` and `public/` stay at the root.
- One alias, `@/*` → `src/*`.

The client/server boundary is held by `import "server-only"` (a client import of server code fails
`next build`, transitively) and four `import/no-restricted-paths` zones plus one local rule in
`eslint.config.mjs`. That replaces the 15 rule IDs (F1–X1, V1, R3–R9, LIB, CR-06) and the separate
`check:boundaries` step.

The feed's read path moved out of its route into `src/server/services/news/topHeadlines.ts`, unchanged,
so the article page calls it directly instead of fetching its own API over HTTP (BL-016).

#### Alternatives rejected

- **Keep ADR 0002's layout.** It shows the split at the top level, but at the cost of two files per
  route, a custom checker, and a layout no Next.js developer expects. The separation that matters,
  server code out of the browser, is enforced by `server-only`, not by folder names.
- **No `src/` folder** (`app/`, `components/`, `lib/` at the root). Also standard, but it puts
  application code beside a dozen config files. The owner asked for fewer top-level folders.
- **Page bodies in `src/app/_components/`.** Private folders are a valid convention, but the
  components are shared across pages (Header, Footer, ArticleCard), so `src/components/` is the
  clearer home.
- **Move `database/` to `supabase/migrations/`.** The Supabase CLI convention needs timestamped file
  names and a `config.toml`. Two migrations are waiting for the owner to apply them by their current
  paths, so the folder stays until the local-database work adopts the CLI.

#### Consequences

- Every route is one file; finding the code for a URL is reading its folder.
- Measured on one machine, this branch against `panel-0-access` (the method in the current status, §2): route table
  identical (30 routes and the proxy), CSS byte-identical (93,939 bytes), client JS 981,592 → 980,692
  bytes (−900), and every route smaller or equal: `/` −435, `/admin` −339, `/contact` and `/saved`
  −243, `/article/[slug]` −186, `/about`, `/privacy` and `/terms` −136. 47 test suites, 736 tests,
  before and after.
- `docs/CODEMAP.md` and `docs/_baseline-routes.txt` are gone. An editor's "find references" answers
  what CODEMAP did; the route table is compared from `next build` output.
- Branches started before this one (and `panel-0-access` itself, if it gets more commits) need their
  files moved to the new paths when merged. Git follows the renames; the one-line re-exports were
  deleted, so new routes must be written in the new place.
- The access rules (the access rules (`docs/PANEL_DOCS.md`), from the retired `PANEL_PLAN.md`) name `app/`, `backend/`
  and `shared/` in their "How the check flows" section. Read them as `src/app/`, `src/server/` and
  `src/config/`.

### ADR 0006 — Three apps over shared packages (2026-11-04)

**Status:** **Accepted** — 4 Nov 2026, with the owner's approval of
[`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md) (sign-off item 2) and the instruction to restructure the
code to it. **Supersedes:** [ADR 0005](#adr-0005--the-standard-nextjs-src-layout-2026-11-02-superseded-by-0006)'s single app.
**Related:** [`ARCHITECTURE.md`](#architecture) (the layout and the rules, in prose).

#### Context

ADR 0005 put the reader site, the back office and the scheduled refresh in one Next.js app. The
research behind the plan ([`RESEARCH.md`](RESEARCH.md), section 2) found four costs of that for
a news site: an admin deploy resets the reader's cache; the newsroom editor (Tiptap, Panel 2) would
ship in shared bundles; the admin sits on the public origin and cannot get a stricter firewall or an
IP allowlist; and a reader surge on election night competes with the editors for the same servers.
The owner chose to separate them now, before the desk panel brings the editor.

#### Decision

npm workspaces, with all dependencies in the root `package.json` and one lockfile:

- `apps/web` — the reader site; `apps/admin` — the back office, keeping the `/admin` and
  `/api/admin` paths (so the proxy matcher and every route rule stay as they were); `apps/worker`
  — scheduled jobs as plain Node, run with `tsx` under the `react-server` condition.
- `packages/server` (server-only), `packages/shared` (client-safe config, types, helpers) and
  `packages/ui` (React both apps use), each exposing modules through `package.json` `exports`.
- The admin no longer renders the reader's header, ticker and footer (they fetch the public feed);
  it has its own top bar and layout, and is `noindex`.
- The homepage banner reads the reader site's own `GET /api/news/breaking-news`; the admin's GET
  needs `breaking_banner.manage`, so the admin API has no public read left besides sign-in and
  sign-out.
- The 30-minute refresh is a worker job, not an HTTP route; `vercel.json` and `CRON_SECRET` go.
- Jest runs one project per app plus the packages; ESLint's zones keep apps from importing each
  other and packages from importing apps.

`packages/editor` (the Tiptap schema shared by admin and web, plan section 3) is created with
Panel 2, when there is code to put in it.

#### Alternatives rejected

- **Keep one app until the triggers fire** (the research's first suggestion). Cheaper today, but the
  owner wants the separation in place before the desk panel, and doing it later would collide with
  more panel work.
- **Turborepo or Nx.** Build caching and task graphs pay off with many apps and a CI bill; with three
  apps and two developers, npm workspaces and plain scripts are enough. Adding Turborepo later does
  not change the folder layout.
- **A separate API service** (web and admin calling a backend over HTTP). No publisher evidence
  supports it, it adds a network hop and a second auth surface, and it gives up server components
  reading the data directly.
- **One app per panel.** The panels share the staff session, the permission check, the audit log
  and the layout; separate apps would mean separate sign-ins and duplicated code.

#### Consequences

- Measured: `/admin` client JS 163,762 → 80,206 bytes and `/admin/login` 35,541 → 23,705; every
  reader route equal or smaller; the reader's CSS 93,939 → 83,122 bytes (admin-only classes left it).
  50 test suites, 753 tests.
- Local development runs two servers (`npm run dev` on 3000, `npm run dev:admin` on 3001).
- Deployment has three units (Phase I): two ECS services and a scheduled worker task.
- `globals.css` exists in both apps; moving the shared base styles into `packages/ui` is a later
  cleanup.
