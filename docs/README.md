Claude Code: read this file before any work.

# TimesPrime

A bilingual (English / Hindi) news aggregator on Next.js 16.4 and React 19. It pulls headlines from
NewsData.io, keeps them in Supabase on a rolling 7-day window, and serves the feed from that store,
behind an Upstash Redis cache, rather than calling the upstream API for every visitor. On top of
that: a Cheerio article scraper, on-demand translation (an unofficial Google Translate wrapper),
Claude Haiku for the chat assistant and for category classification, and an admin panel.

Readers get a feed, a category browser, an article page with scraped full text, saved articles kept
in the browser, and the assistant. Operators get `/admin`: article moderation, manual publishing,
breaking-news banners, sync controls and an activity log.

| Concern | Choice |
|---|---|
| Framework | Next.js 16.4 (App Router, Turbopack), React 19 |
| Language | TypeScript 5, `strict` |
| Database | Supabase (PostgreSQL) with Row Level Security |
| Cache | Upstash Redis, falling back to an in-process `Map` |
| AI | Anthropic Claude Haiku: chat and category classification |
| Scraping | axios + cheerio |
| Styling | Tailwind CSS v4 |
| Monitoring | Sentry |
| Tests | Jest + Testing Library |
| Hosting | Vercel, Root Directory `frontend` (cron defined in `frontend/vercel.json`) |

## The four documents

The project keeps exactly four Markdown files, all in `docs/`. `npm run verify` fails on any other
Markdown file in the repository, and on any link in these four that does not resolve (`check:docs`).

| File | Read it when | What it holds |
|---|---|---|
| [`README.md`](#timesprime) | First, always | What TimesPrime is, setup, commands, the folder structure, where new code goes, branch and commit rules, and the working rules for Claude Code sessions |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Before changing how something works | The product requirements (the PRD), how a request flows, the layout, the import rules and how they are enforced, the data model, and every decision record |
| [`OPERATIONS.md`](OPERATIONS.md) | Running, deploying, or picking the work up | Environment variables, deployment and the go-live checklist, runbooks, the current status, the backlog, and the audit ledger |
| [`PANEL_DOCS.md`](PANEL_DOCS.md) | Working on the back office | The panel plan (roles, the permission matrix, the four-eyes and MFA rules), the definition of done, and each panel's record |

**One source of truth.** The product requirements in `ARCHITECTURE.md` are the canonical
specification. A PDF export, `TimesPrime-PRD-and-Architecture.pdf`, was produced on 2026-10-29 as a
stakeholder snapshot. It is **retired**: untracked, git-ignored, and it predates the owner decisions
recorded the same day: to remove the paraphraser, RSS, the contact form and the newsletter, and to
fix EN/HI as the language scope. **Do not consult it.** If a copy exists on disk, it is wrong.

**If you only read two more things:**

1. [The gotchas](OPERATIONS.md#3-gotchas-that-have-already-burned-time). Next.js 16 renamed Middleware
   to Proxy, deprecated `priority` in favour of `preload`, and matches image hostnames as globs.
   Source files are CRLF in the working tree. When Supabase fails, the feed falls back to
   NewsData.io without an error, so check `/api/health` before diagnosing anything. Each of these
   has already produced a wrong answer once.
2. [The defect register](ARCHITECTURE.md#11-known-defects--not-requirements): behaviours that exist but are
   **not** requirements. A bug written into a spec becomes permanent.

## Setup

Prerequisites: Node.js 24 (`package.json` `engines` is `24.x`; CI reads it from there), npm 11 or
later (bundled with Node 24), a Supabase project, a NewsData.io API key and an Anthropic API key.

```bash
git clone https://github.com/Adarsh-Pandey-25/TimesPrime.git && cd TimesPrime
npm ci                                    # at the repository root: the one package.json
cp frontend/.env.example frontend/.env    # then fill it in: OPERATIONS.md, "Environment variables"
npm run dev                               # http://localhost:3000
```

`frontend/.env` holds real credentials. It is git-ignored, and it is never committed, printed or
shared. Tests never see it: `frontend/.env.test`, committed with every key empty, is loaded first in
the test environment, and a test fails if a real Supabase URL reaches the tests
([details](#working-rules-for-claude-code-sessions)).

The database is set up by applying the SQL files in `database/`, in the order the
[runbook](OPERATIONS.md#runbook-apply-the-database-files) gives. The owner does this; the app and its tooling never do.

## Commands

Every command runs from the repository root. Next.js and Jest run inside `frontend/`, the Next.js
root; lint and the typecheck run from the root ([why](ARCHITECTURE.md#adr-0004--four-top-level-folders-four-documents)).

| Command | Runs | What it does |
|---|---|---|
| `npm run dev` | `cd frontend && next dev` | Dev server with Turbopack |
| `npm run build` | `cd frontend && next build` | Production build, into `frontend/.next` |
| `npm start` | `cd frontend && next start` | Serves the production build |
| `npm run typecheck` | `tsc --noEmit -p frontend` | Types, for `frontend/` and `backend/` |
| `npm run lint` | `eslint -c frontend/eslint.config.mjs` | ESLint, including the import-boundary rules |
| `npm run check:boundaries` | `node backend/scripts/check-boundaries.mjs` | The same rules over the whole import graph, including what the client bundle reaches transitively, and every route-table URL keeps its file |
| `npm run check:docs` | `node backend/scripts/check-docs.mjs` | Only the four Markdown files exist, and every link in them resolves |
| `npm test` | `cd frontend && jest` | Jest, over `frontend/` and `backend/` |
| `npm run test:watch` | `cd frontend && jest --watch` | Jest in watch mode |
| `npm run test:ci` | `cd frontend && jest --ci --coverage` | Jest with coverage, written to `coverage/` |
| `npm run verify` | all of the above in order | typecheck → lint → check:boundaries → check:docs → test → build. **The gate every commit must pass** |

Two scripts are run by hand:

```bash
node backend/scripts/generate-access-catalog.mjs          # writes the permission catalogue SQL from the panel plan's matrix
node backend/scripts/generate-access-catalog.mjs --check  # exit 1 if the SQL file is not what it would write
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # a secret for .env
```

## Folder structure

Four top-level folders, and at the root only what git, CI and the package manager need.

```
TimesPrime/
├── frontend/                  the Next.js root (Vercel Root Directory) and all UI
│   ├── app/                   the routing shell: URLs only. Route files and most pages are one
│   │                          line re-exporting a body; two composition pages fetch and render
│   ├── views/                 page bodies: home, article, admin, about, contact, privacy, terms, saved
│   ├── features/              news, admin, chat: each behind its index.ts
│   ├── components/ui/         presentational primitives: NewsSkeletonGrid, ThemeSpinner
│   ├── context/               ThemeContext, LanguageContext
│   ├── styles/globals.css     Tailwind v4
│   ├── public/                favicon.png, logo-light.png, logo-dark.png
│   ├── proxy.ts               admin authorisation: the gate in front of /admin/* and /api/admin/*
│   ├── instrumentation.ts  instrumentation-client.ts  sentry.server.config.ts  sentry.edge.config.ts
│   ├── next.config.ts  vercel.json  tsconfig.json  eslint.config.mjs  jest.config.ts  postcss.config.mjs
│   ├── .env.example           committed template
│   ├── .env.test              committed, every key empty: the test environment
│   └── .env                   the owner's real credentials: git-ignored, created from .env.example
├── backend/                   server-side code; every module opens with import "server-only"
│   ├── api/                   route bodies: news/, admin/, cron/, chat.ts, translate.ts, health.ts
│   ├── auth/                  requirePermission, decide, scope, adminRoutePolicy, adminSession,
│   │                          staffSession, supabaseServer
│   ├── services/              news/, scrape/, translate/, classify/, health/
│   ├── repositories/          db.ts, auditLog.ts, staff.ts
│   ├── lib/                   cache, likePattern, rateLimit, readJsonBody, reportFallback, supabase
│   ├── shared/                imported by frontend/ and backend/; no server-only
│   │   ├── config/            translations, newsConfig, permissions, theme, imageDomains,
│   │   │                      topicImages, categoryColors
│   │   ├── types/
│   │   └── validation/        urlValidation, sentryScrub
│   └── scripts/               repo tooling: check-boundaries, check-docs, shims,
│                              generate-access-catalog, baseline-routes.txt
├── database/                  SQL only; nothing imports it
│   ├── schema.sql  policies.sql
│   ├── migrations/            indexes, access-1, access-2, access-3
│   ├── bootstrap/super-admin.sql
│   └── seed/seed_supabase.mjs
├── docs/                      the four documents
├── .github/workflows/ci.yml
├── .claude/settings.json      Claude Code may not read or edit the env files
├── package.json  package-lock.json   every dependency and script
└── .gitignore
```

**Following a request.** `GET /api/news/top-headlines` reaches
`frontend/app/api/news/top-headlines/route.ts`, one line re-exporting
`backend/api/news/top-headlines.ts`; that body reads the cache in `backend/lib/` and the feed from
`backend/services/news`. The page `/about` reaches `frontend/app/about/page.tsx`, which re-exports
`frontend/views/about/AboutView.tsx`. The whole design, with the rules that keep it this way, is in
[`ARCHITECTURE.md`](ARCHITECTURE.md#system-design).

## Where new code goes

Rule IDs are defined in [the import rules](ARCHITECTURE.md#5-import-rules). Each one fails
`npm run lint` and `npm run check:boundaries`, naming the rule.

| Adding | Code goes in | Others import it from | File in `frontend/app/` | Fails if wrong |
|---|---|---|---|---|
| A page, e.g. `/faq` | `frontend/views/faq/FaqView.tsx`: a default export, plus `metadata` | — | `frontend/app/faq/page.tsx`, one line, like `frontend/app/about/page.tsx`: `export { default, metadata } from "@/frontend/views/faq/FaqView";` | F1 if the view imports `backend/` (other than `backend/shared/`); V1 if a feature imports the view; A2 if the page file holds code |
| A page that needs server data | The view, as above. The fetch stays in the page | — | `frontend/app/<path>/page.tsx` fetches and passes props, like `frontend/app/page.tsx` (`fetchInitialNews` → `HomeClient`). List it in `COMPOSITION_PAGES` (`backend/scripts/shims.mjs`); if it fetches through a backend module other than `backend/api/` or `backend/shared/`, add that module to A1's entry points (`frontend/eslint.config.mjs` and `check-boundaries.mjs`) | A2 if it is not listed; A1 if it imports an unlisted backend module |
| An API route, e.g. `GET /api/news/trending` | `backend/api/news/trending.ts`, opening with `import "server-only";` | — | `frontend/app/api/news/trending/route.ts`, one line: `export { GET } from "@/backend/api/news/trending";`, plus literal segment config if needed | A2 if the route file holds code; F1 if the guard is missing; B1 if it imports `frontend/` |
| A frontend feature, e.g. polls | `frontend/features/polls/`, with an `index.ts` and a `package.json` of `{ "sideEffects": false }` | `@/frontend/features/polls`, its `index.ts`, and nothing deeper | — (views and `app/` import the entry point) | X1 if anything imports past `index.ts`, or one feature imports another; V1 if it imports a view |
| A backend service, e.g. digest | `backend/services/digest/`, each module opening with `import "server-only";` | an `index.ts` once others use more than one module, like `@/backend/services/news` | — (route bodies in `backend/api/` import it) | X1 if one service imports another, or anything imports past an `index.ts` |
| A database query | `backend/repositories/` (`db.ts` holds the article queries), using `supabase` from `@/backend/lib/supabase` | the owning service's `index.ts`, as `services/news/index.ts` re-exports `getDBStats` | — | F1 if a component queries Supabase; LIB if the query goes in `backend/lib/` |
| A schema change | A migration in `database/migrations/` with its rollback, which the owner applies by hand from a runbook | — (nothing imports it) | — | D1 if code imports it |
| A type both sides use | `backend/shared/types/index.ts` | `@/backend/shared/types` | — | R7 if it imports anything but types |
| A config value both sides use | `backend/shared/config/<name>.ts`. An image host goes in `ALLOWED_IMAGE_HOSTNAMES` (`backend/shared/config/imageDomains.ts`; 49 of the 50 slots are used) | `@/backend/shared/config/<name>` | — | R7 if it imports React, `server-only` or code; CR-06 if `imageDomains.ts` imports anything; R5 if a UI primitive imports it |
| Repo tooling | `backend/scripts/`, a Node script (no `server-only`; nothing imports it) | — | — | — |
| Documentation | A section of one of the four files in `docs/` | — | — | `check:docs` if it is a new `.md` file or a link breaks |

Two things no check catches:

- **Admin routes go under `/api/admin/`, admin pages under `/admin/`.** `frontend/proxy.ts` gates
  exactly those paths, and anything outside them is public
  ([how a request is authorised](ARCHITECTURE.md#1-how-the-system-works-today)).
- **Code that one side uses stays on that side.** `backend/shared/` is for what both sides import. A
  backend-only constant lives in its service.

## Branch and commit rules

**Branches.**

- All work happens on a branch: `panel-N-<name>` for a panel (e.g. `panel-0-access`), `fix/<topic>`
  for fixes, `chore/<topic>` for tooling and docs, `release/<name>` for a release (`release/v1`).
  Push only the branch.
- **Never push to `main` directly.** A branch reaches `main` only after the owner approves: then
  merge it into `main` and push `main`.

**The verify gate.** Every commit must leave the tree green:

```bash
npm run verify     # typecheck -> lint -> check:boundaries -> check:docs -> test -> build
```

All six, not a subset. They catch different classes of problem:

| Command | What it alone catches |
|---|---|
| `tsc --noEmit -p frontend` | Unresolved imports after a file move; type regressions |
| `eslint` | Imports left **behind** after a move (unused, still referenced, now dead), and every import that breaks a boundary rule (`frontend/eslint.config.mjs`, [the import rules](ARCHITECTURE.md#5-import-rules)) |
| `check:boundaries` | A client module reaching `backend/` **transitively**, through modules that look harmless, which lint, checking one import at a time, cannot see; and a route-table URL whose file is gone |
| `check:docs` | A fifth Markdown file, or a link in the four that no longer resolves |
| `jest` | Behaviour changes in the slice that has coverage |
| `next build` | Route resolution, config evaluation, server/client boundary violations |

If a change cannot go green, revert it and report why. Do not stack fixes on a red tree: the second
fix hides what the first one broke. **A red change is reverted, not patched.**

**A commit is a move, a deletion or a change. Never two of them.**

- A **move** uses `git mv`, so history follows the file. It may also fix the import paths and path
  references the move invalidated: that is part of the move, not a separate change. It may not fix
  anything else.
- A **deletion** uses `git rm`. It may also remove the imports and index links that pointed at the
  deleted thing, and nothing else.
- A **change** is everything else. One audit finding per commit, prefixed with its ID.

This matters because `git log --follow` and `git blame` both become useless when a file is moved
and edited in the same commit: the rename detection fails and the diff shows the whole file as new.

Anything you are tempted to fix "while you are in there" goes in [the backlog](OPERATIONS.md#backlog) with the
reason it was deferred, not into the commit.

Message shape:

```
<type>: <imperative summary under ~70 chars>

Why the change was needed, and what was rejected along the way. Prefer
explaining the reasoning over restating the diff: the diff is already in
the commit.

Verified: npm run verify exit 0 (tsc 0; eslint 0 errors, N warnings;
check:boundaries 0 violations; check:docs 0 problems; jest N suites,
M tests; next build N routes). Client JS and CSS per route.

Co-Authored-By: ...
```

Types in use: `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `build`, `ci`. Every commit
reports client JS and CSS per route; growth over 0.5% needs an evidenced cause.

**Behaviour-preserving work.** A move commit changes file locations and import paths only. No logic
edits, no renames of exported symbols, no formatting sweeps. If a move cannot be completed without
editing a module body, stop: either write a characterization test first, or defer that file and say
so. Tests come first; characterization tests come before changing untested UI.

**Code conventions.**

- Match the surrounding code's comment density. This codebase documents *why*, including evidence
  and rejected alternatives, and that convention is worth keeping. Preserve comments verbatim
  through moves.
- No `any`. Where the correct type is genuinely unknowable, use `unknown` with a narrowing guard, or
  a single `eslint-disable-next-line` carrying a stated reason and a backlog entry.
- Every backend module opens with `import "server-only";` (`backend/shared/` and `backend/scripts/`
  excepted).
- No new dependency without the owner's approval: an exact version, at least two weeks old.
- Never commit `frontend/.env` or any real secret.

## Working rules for Claude Code sessions

These were `CLAUDE.md` and `AGENTS.md`; the owner keeps four Markdown files, so they live here.

**Before any work.**

- Read this file, then the current status in [`OPERATIONS.md`](OPERATIONS.md#current-status). Do not re-analyse the
  codebase: re-deriving what is already written is the most expensive mistake available.
- **This is not the Next.js you know.** Version 16 has breaking changes: APIs, conventions and file
  structure may all differ from your training data. Read the relevant guide in
  `node_modules/next/dist/docs/` before writing any code, and heed deprecation notices. When the
  bundled docs and memory disagree, the bundled docs win. (`next dev` used to re-add this rule to an
  `AGENTS.md`; `agentRules: false` in `frontend/next.config.ts` stops that.)

**Credentials.**

- `frontend/.env` holds the real credentials, and the app uses them. **Never read, print, copy,
  edit or move it**, including for worktrees and probes. The same goes for any `.env.local` or
  `.env*.local`. `.claude/settings.json` denies Claude Code's Read and Edit on `**/.env`,
  `**/.env.local` and `**/.env*.local`; a shell command reading it is still a breach of this rule.
- Never print a key. `/api/health` answers only `{ "status": ... }` for that reason.
- Tests run with `frontend/.env.test` (every key empty), loaded before `.env`; the guard tests in
  `backend/shared/config/envExample.test.ts` fail if a real Supabase URL reaches them.

**The real database.**

- Never write to the database yourself: no SQL, migrations, bootstrap, test users or destructive
  tests. Schema changes are owner actions in a runbook. The app's normal behaviour (reading,
  ingesting, caching scraped content) is fine.
- Database tests against the real database are read-only, and so are end-to-end tests. The
  database's own rules (triggers, the audit hash chain, bootstrap) are verified by the owner via the
  runbook.

**Deployment and the release** (owner, 2026-11-02).

- A deployment now: the owner's senior has asked for one. The earlier "no deployment until the
  project is complete; AWS" decision is superseded. The hosting chosen in R0 is Vercel Pro, region
  `bom1`.
- **Panel work is paused** and resumes after the release. The release is built on `release/v1`
  (from `main`), in phases R0–R4, each ending at a STOP; Panel 0's second half stays on
  `panel-0-access` meanwhile.

**Back-office panels.** The plan, the definition of done and each panel's record are in
[`PANEL_DOCS.md`](PANEL_DOCS.md). The plan is the reference: do not edit it; report errors or
conflicts with the code instead. One panel at a time, Panel 0 (Access foundation) first; no panel
starts before the previous one is done.

**How the owner works.**

- Work comes in phases, each ending at a STOP gate. Stop at every gate: present the output and wait
  for approval. Approval is item by item.
- At every STOP report what changed, the commits (SHA and message), the actual command output,
  anything deferred with its reason, and any deviation from the request, stated plainly.
- Replies to the owner are in Hinglish with the technical terms in English; the repository's docs
  and commit messages are in English.
- Never stop or touch the owner's own `npm run dev`. Stop a dev server you started yourself before
  moving files.
- Leave `TimesPrime-Work-Report-2026-10-30.pdf` at the root untouched: it is the owner's file.
- Sentry's `tunnelRoute` is not set and **must never be enabled**: all authorisation lives in the
  proxy and the route bodies.

**Keeping the docs true.** A stale document is worse than a missing one, because it is trusted.

- Update the current status in `OPERATIONS.md` at the end of every phase.
- Append to the backlog whenever something is deferred, with the reason it was deferred.
- Add a decision record to `ARCHITECTURE.md` whenever a structural decision is made, including the
  options turned down.
- Never add a fifth Markdown file: `check:docs` fails it.
