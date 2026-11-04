# TimesPrime

A bilingual (English / Hindi) news aggregator. It pulls headlines from
NewsData.io, stores them in Supabase on a rolling 7-day window, serves the feed
from that store rather than hitting the upstream API per visitor, and layers on
article scraping, on-demand translation, an AI assistant and an admin panel.

The reader-facing surface is a feed, a category browser, an article detail view
with scraped full text, saved articles held in the browser, and a chat assistant.
The operator-facing surface is `/admin`: article moderation, manual publishing,
breaking-news banners, sync controls and an activity log.

**Every session starts with [`CLAUDE.md`](../CLAUDE.md)** at the repository root (Claude Code reads
it by itself): the plan's current phase, the branch rules and the rules for the real database. Then
the [current status](OPERATIONS.md#current-status) in OPERATIONS.md, before any change to the code.

## The documents

Seven Markdown files, and no others: `npm run check:docs` fails on any other Markdown file in the
repository, and on a relative link or anchor in these that does not resolve.

| # | File | Read it when |
|--:|---|---|
| 1 | [`CLAUDE.md`](../CLAUDE.md) | **Every session, first.** The start-here for every developer and Claude Code session |
| 2 | [`OPERATIONS.md`, Current status](OPERATIONS.md#current-status) | **Always, before changing code.** Where the work stands, the environment, and the gotchas that have already caused wrong conclusions |
| 3 | [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md) | **The plan.** What gets built, in what order, and when each phase is done (owner-approved, 4 Nov 2026; a PDF copy sits beside it) |
| 4 | This file | Setup, commands, the folder structure, where new code goes, the commit rules |
| 5 | [`ARCHITECTURE.md`](ARCHITECTURE.md#architecture) | How the system fits together, the import rules, and every structural decision with the alternatives rejected |
| 6 | [`PANEL_DOCS.md`](PANEL_DOCS.md) | Working on the back office: the definition of done, the access rules (roles, the permission matrix, the four-eyes and MFA rules), which panel is next, and what each finished panel does |
| 7 | [`OPERATIONS.md`](OPERATIONS.md#current-status) | Environment variables, deployment, the runbooks, the backlog (read it before "fixing" something deferred on purpose) and the audit ledger |
| 8 | [`RESEARCH.md`](RESEARCH.md) | Checking why the plan decided something: the sourced research behind it (CMS, hosting, SEO, Indian law, money) |

### One source of truth

**[`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md) is the plan** for what gets built and in what order,
approved by the owner on 4 Nov 2026. **The [access rules](PANEL_DOCS.md#access-rules) in PANEL_DOCS.md are the
access specification** (roles, matrix, approval and MFA rules). The earlier PRD and `PANEL_PLAN.md`
were retired that day; they are in git history (`git log --all -- docs/PRD.md docs/PANEL_PLAN.md`).

A PDF export, `TimesPrime-PRD-and-Architecture.pdf`, was produced on 2026-10-29 as a stakeholder
snapshot. It is **retired**: untracked, git-ignored, and it predates the owner decisions recorded the
same day (to remove the paraphraser, RSS, the contact form and the newsletter, and to fix EN/HI as
the language scope). **Do not consult it.** If a copy exists on disk, it is wrong.

### If you only read two things

1. **The [gotchas](OPERATIONS.md#3-gotchas-that-have-already-burned-time)** in the current status.
   Next.js 16 renamed Middleware to Proxy, deprecated `priority` in favour of `preload`, and matches
   image hostnames as globs. On a Windows checkout source files are CRLF in the working tree. When
   Supabase fails, the feed falls back to NewsData.io without an error, so check `/api/health`
   before diagnosing anything. Each of these has already produced a wrong answer once.
2. **`NEWSROOM_PLAN.md` sections 2 and 4**: the rules every phase follows, and the phases in order.
   The current phase is the first one not marked Done.

### Keeping this true

A stale document is worse than a missing one, because it is trusted.

- Update the current status in OPERATIONS.md at the end of every phase, and the plan's Progress
  table when a phase finishes.
- Add to the backlog in OPERATIONS.md whenever something is deferred, with the reason it was
  deferred.
- Add a decision to ARCHITECTURE.md whenever a structural decision is made, including the options
  turned down.

## Project structure

One repository, three apps over shared packages, in npm workspaces
([ADR 0006](ARCHITECTURE.md#adr-0006--three-apps-over-shared-packages-2026-11-04)). The plan every developer follows is
[`docs/NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md).

```
apps/
  web/        The reader site (Next.js): pages, public APIs, the reader UI          → port 3000
  admin/      The back office (Next.js): /admin pages, /api/admin routes, the proxy → port 3001
  worker/     Scheduled jobs (plain Node): refresh-news
packages/
  server/     @timesprime/server: server-only code (auth, repositories, services, lib); every file
              imports "server-only"
  shared/     @timesprime/shared: client-safe config, types and helpers
  ui/         @timesprime/ui: React both apps use (ThemeContext)
database/     schema.sql, policies.sql, migrations/, bootstrap/, seed/; applied by hand
docs/         The plan, access rules, architecture, decision records, research, audit ledger,
              backlog, handoff, panels
scripts/      generate-access-catalog.mjs: writes the permission catalogue SQL from docs/PANEL_DOCS.md
```

The root holds the workspace configuration: `package.json` (all dependencies, the scripts),
ESLint, Jest and the base TypeScript config. Each app has its own `next.config.ts`,
`tsconfig.json` and `public/`. One `.env` at the root serves every app.

**Following a request:** `GET /api/news/top-headlines` reaches
`apps/web/src/app/api/news/top-headlines/route.ts`, which calls `getTopHeadlines` from
`@timesprime/server/services/news/topHeadlines`; that reads the cache and the feed from Supabase.
The page `/about` is `apps/web/src/app/about/page.tsx`; the admin dashboard is
`apps/admin/src/app/admin/page.tsx`.

**Lint keeps the sides apart:** client-safe code never imports `packages/server`, packages never
import an app, and no app imports another; every `packages/server` file starts with
`import "server-only"`, so a client import of it fails the build
([the rules](ARCHITECTURE.md#5-import-rules)).

**Adding code?** [Where does new code go?](#where-new-code-goes) answers it in one
table.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16.4 (App Router, Turbopack), React 19 |
| Language | TypeScript 5, `strict` |
| Database | Supabase (PostgreSQL) with Row Level Security |
| Cache | Upstash Redis, falling back to an in-process `Map` |
| AI | Anthropic Claude Haiku — chat and category classification |
| Scraping | axios + cheerio |
| Styling | Tailwind CSS v4 |
| Monitoring | Sentry |
| Tests | Jest + Testing Library |
| Hosting | **Not deployed** until the project is complete; then AWS, `ap-south-1`. The worker's 30-minute refresh needs an AWS scheduler (EventBridge) then |

> **This is not stock Next.js.** Version 16 renamed Middleware to **Proxy**
> (`apps/admin/src/proxy.ts`), deprecated the `priority` image prop in favour of `preload`,
> and matches `images.remotePatterns` hostnames with globs rather than string
> equality. Read `node_modules/next/dist/docs/` before relying on any framework
> convention from memory. See `CLAUDE.md`.

## Prerequisites

- Node.js **24** (`package.json` `engines` is `24.x`; CI reads it from there)
- npm 11+ (bundled with Node 24)
- A Supabase project, a NewsData.io API key, and an Anthropic API key

## Setup

```bash
git clone <repo-url> && cd TimesPrime
npm ci
cp .env.example .env               # then fill it in: docs/OPERATIONS.md, Environment variables
npm run dev                        # the reader site, http://localhost:3000
npm run dev:admin                  # the back office, http://localhost:3001/admin
```

The database files in `database/` are applied by the owner, in order, with the
[database runbook](OPERATIONS.md#applying-the-database-files), and Panel 0's migrations with the
[staff-access runbook](OPERATIONS.md#staff-access-switching-on-panel-0-and-getting-back-in). A session never writes to the database itself
(`CLAUDE.md`).

## Commands

Run from the repository root.

| Script | What it does |
|---|---|
| `npm run dev` | The reader site, http://localhost:3000 |
| `npm run dev:admin` | The back office, http://localhost:3001/admin |
| `npm run job -- refresh-news` | Runs a worker job once (it writes to the database `.env` points at: never from a session, `CLAUDE.md`) |
| `npm run build` | Production builds of both apps |
| `npm run typecheck` | `tsc --noEmit` for every app, every package and the root |
| `npm run lint` | ESLint over the repository, including the import-boundary rules (`eslint.config.mjs`) |
| `npm test` | Jest: one project per app, plus the packages |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:ci` | Jest with coverage, CI reporter |
| `npm run check:docs` | The Markdown files are the seven listed above, and every relative link and anchor in them resolves |
| `npm run check:js-budget` | Each app's page routes' client JS against `scripts/js-budget.json` (needs a build) |
| `npm run test:e2e` | Playwright (Chromium), read-only, against production builds of both apps (ports 3100 and 3101) |
| `npm run verify` | typecheck → lint → check:docs → test → build → check:js-budget. **The gate every commit must pass** |

## Architecture in one paragraph

A worker job (`refresh-news`, started every 30 minutes by a scheduler) pulls each
category from NewsData.io, filters out paywalled, horoscope, wire-spam and
non-news sources, and upserts into Supabase. Reads go through
`/api/news/top-headlines`, which tries the Redis cache, then Supabase if its
newest row is under 30 minutes old, then NewsData.io, and finally built-in mock
articles. The `X-Data-Source` response header says which tier answered — useful
when diagnosing whether a given response touched the database at all. Admin
routes are gated twice: `apps/admin/src/proxy.ts` lets only a session through to `/admin/*` and
`/api/admin/*`, and each route body checks the staff member's permissions
(`requirePermission`, Panel 0).

Fuller detail in [`ARCHITECTURE.md`](ARCHITECTURE.md#architecture).

## Where new code goes

The plan says **what** to build next ([`docs/NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md)); this table
says **where** it goes. The import rules are in
[`ARCHITECTURE.md` §5](ARCHITECTURE.md#5-import-rules); `npm run lint` fails an import
that breaks one, naming why.

| Adding | Where | Example to copy |
|---|---|---|
| A reader page, e.g. `/faq` | `apps/web/src/app/faq/page.tsx`: the page's code, a default export, plus `metadata` | `apps/web/src/app/about/page.tsx` |
| A reader page that needs server data | `apps/web/src/app/<path>/page.tsx` calls `@timesprime/server/...` directly (never its own API over HTTP) and passes props to a component in `apps/web/src/components/` | `apps/web/src/app/page.tsx` (`fetchInitialNews` → `HomeClient`) |
| A public API route, e.g. `GET /api/news/trending` | `apps/web/src/app/api/news/trending/route.ts`: parse the request, call `@timesprime/server/...`, return the response. Logic goes in a service | `apps/web/src/app/api/news/breaking-news/route.ts` |
| A back-office panel, e.g. Panel 2 Desk | Pages in `apps/admin/src/app/admin/desk/`, routes in `apps/admin/src/app/api/admin/desk/...`, components in `apps/admin/src/features/desk/` (NEWSROOM_PLAN section 3) | `apps/admin/src/app/admin/page.tsx` |
| An admin API route | `apps/admin/src/app/api/admin/<name>/route.ts`, gated by `requirePermission` with its rule in `packages/server/src/auth/adminRoutePolicy.ts`, and a case in `apps/admin/src/app/api/admin/access.test.ts` | `apps/admin/src/app/api/admin/stats/route.ts` |
| A scheduled job | A function in `packages/server/src/services/...`, registered by name in `apps/worker/src/jobs.ts` | `refreshNews` and the `refresh-news` job |
| A reader component | `apps/web/src/components/<area>/<Name>.tsx`, imported from its own file (no `index.ts` barrels) | `apps/web/src/components/news/ArticleCard.tsx` |
| React both apps use | `packages/ui/src/<Name>.tsx`, exported as `@timesprime/ui/<Name>` | `packages/ui/src/ThemeContext.tsx` |
| Server logic, e.g. a digest | `packages/server/src/services/digest/`, each file opening with `import "server-only";` | `packages/server/src/services/news/topHeadlines.ts` |
| A database query | `packages/server/src/repositories/` (`db.ts` holds the article queries), using `supabase` from `packages/server/src/lib/supabase.ts` | `getDBStats` in `db.ts` |
| A schema change | A migration in `database/migrations/` with its rollback, which the owner applies by hand | `database/migrations/2026-11-02-indexes.sql` |
| A permission | Proposed in the panel's design; after the owner approves, a row in the access rules (`docs/PANEL_DOCS.md`), then `node scripts/generate-access-catalog.mjs` and a new migration | `database/migrations/2026-11-02-access-2-catalog.sql` |
| A helper, type or config value both apps use | `packages/shared/src/lib/`, `src/types/index.ts` or `src/config/`; it must not import `packages/server`. An image host goes in `ALLOWED_IMAGE_HOSTNAMES` (`packages/shared/src/config/imageDomains.ts`; 49 of the 50 slots are used) | `packages/shared/src/lib/urlValidation.ts` |

A new export path in a package needs its pattern in that package's `package.json` `exports` (and,
for a new package, a line in the `moduleNameMapper` of `jest.config.ts`). Tests sit beside what
they test: `route.test.ts` next to `route.ts`, `page.test.tsx` next to `page.tsx`.

Two things no check catches:

- **Admin routes go under `/api/admin/`, admin pages under `/admin/`, in `apps/admin`.**
  `apps/admin/src/proxy.ts` gates exactly those paths. Each admin route calls `requirePermission`
  first (the only gate on the data: the apps read Supabase as service_role). A new route or method
  that is not in `adminRoutePolicy.ts` fails the route walk in `access.test.ts`, and needs its row in
  that test's access matrix.
- **Code that one side uses stays on that side.** `packages/shared` and `packages/ui` are for what
  both apps import. A server-only constant lives in its service; a reader-only component stays in
  `apps/web`.

## The verify gate

Every commit must leave the tree green:

```bash
npm run verify     # typecheck -> lint -> test -> build
```

All four, not a subset. They catch different classes of problem:

| Command | What it alone catches |
|---|---|
| `tsc --noEmit` | Unresolved imports after a file move; type regressions |
| `eslint` | Imports left **behind** after a move — unused, still referenced, now dead — and every import that breaks a boundary rule (`eslint.config.mjs`, `docs/ARCHITECTURE.md` §5) |
| `jest` | Behaviour changes in the slice that has coverage |
| `next build` | Route resolution, config evaluation, and a client module reaching `packages/server/src/` **transitively** (the `server-only` guard), which lint, checking one import at a time, cannot see |

If a change cannot go green, revert it and report why. Do not stack fixes on a
red tree — the second fix hides what the first one broke.

## Commit convention

**A commit is a move, a deletion or a change. Never two of them.**

- A **move** uses `git mv`, so history follows the file. It may also fix the import paths and path
  references the move invalidated — that is part of the move, not a separate change. It may not fix
  anything else.
- A **deletion** uses `git rm`. It may also remove the imports and index links that pointed at the
  deleted thing, and nothing else.
- A **change** is everything else.

This matters because `git log --follow` and `git blame` both become useless when
a file is moved and edited in the same commit: the rename detection fails and the
diff shows the whole file as new.

Anything you are tempted to fix "while you are in there" goes in
[the backlog](OPERATIONS.md#backlog) with the reason it was deferred, not into
the commit.

Message shape:

```
<type>: <imperative summary under ~70 chars>

Why the change was needed, and what was rejected along the way. Prefer
explaining the reasoning over restating the diff — the diff is already in
the commit.

Verification:
  tsc --noEmit   exit 0
  eslint .       exit 0
  jest --ci      N suites, M tests passed
  next build     exit 0
```

Types in use: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `build`.

## Behaviour-preserving work

A move commit changes file locations and import paths only. No logic edits, no renames of exported
symbols, no formatting sweeps. If a move cannot be completed without editing a module body, stop:
either write a characterization test first, or defer that file and say so.

## Code conventions

- Match the surrounding code's comment density. This codebase documents *why*
  — including evidence and rejected alternatives — and that convention is worth
  keeping.
- No `any`. Where the correct type is genuinely unknowable, use `unknown` with a
  narrowing guard, or a single `eslint-disable-next-line` carrying a stated
  reason and a backlog entry (`docs/OPERATIONS.md`).
- Never commit `.env` or any real secret.

## Framework caveat

Next.js 16 differs from earlier versions in ways that trip up assumptions:
Middleware is now **Proxy** (`apps/admin/src/proxy.ts`, beside `src/app/`), `next/image` uses `preload` rather
than the deprecated `priority`, and `images.remotePatterns` hostnames are
matched as globs. Check `node_modules/next/dist/docs/` before asserting that any
framework usage is wrong. See `CLAUDE.md`.

## Conventions to follow

- **`npm run verify` must pass before any commit.** All four, not a subset. `tsc` catches imports
  that no longer resolve; `eslint` catches the ones left behind and every boundary-rule break;
  `jest` covers the tested slice; `build` catches route resolution and a client module reaching
  `packages/server/src/` transitively (the `server-only` guard).
- **Three kinds of commit, never mixed:** a move (`git mv`, plus the import and path references the
  move invalidated), a deletion (`git rm`, plus the imports and index links that pointed at it), or
  a change. One finding per commit for audit fixes, prefixed with its ID.
- **A red change is reverted, not patched.**
- **Defer, don't fix.** Anything tempting found mid-task goes to the backlog in `docs/OPERATIONS.md` with its reason.
- **No `any`.** Use `unknown` + a narrowing guard, or one `eslint-disable-next-line` with a stated
  reason and a backlog entry.
- **Match the comment density.** This codebase documents *why*, citing evidence and rejected
  alternatives. That convention is its best feature — preserve comments verbatim through moves.
- **New code goes where [this file says](#where-new-code-goes)**, and every boundary rule names itself when it fails.
- **Stop at every phase gate.** Present output, wait for approval.
