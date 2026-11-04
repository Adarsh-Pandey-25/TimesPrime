# TimesPrime

A bilingual (English / Hindi) news aggregator. It pulls headlines from
NewsData.io, stores them in Supabase on a rolling 7-day window, serves the feed
from that store rather than hitting the upstream API per visitor, and layers on
article scraping, on-demand translation, an AI assistant and an admin panel.

The reader-facing surface is a feed, a category browser, an article detail view
with scraped full text, saved articles held in the browser, and a chat assistant.
The operator-facing surface is `/admin`: article moderation, manual publishing,
breaking-news banners, sync controls and an activity log.

## Project structure

One repository, three apps over shared packages, in npm workspaces
([ADR 0005](docs/adr/0005-apps-and-packages.md)). The plan every developer follows is
[`docs/NEWSROOM_PLAN.md`](docs/NEWSROOM_PLAN.md).

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
scripts/      generate-access-catalog.mjs: writes the permission catalogue SQL from docs/PERMISSIONS.md
```

The root holds the workspace configuration: `package.json` (all dependencies, the scripts),
ESLint, Jest and the base TypeScript config. Each app has its own `next.config.ts`,
`tsconfig.json` and `public/`. One `.env.local` at the root serves every app.

**Following a request:** `GET /api/news/top-headlines` reaches
`apps/web/src/app/api/news/top-headlines/route.ts`, which calls `getTopHeadlines` from
`@timesprime/server/services/news/topHeadlines`; that reads the cache and the feed from Supabase.
The page `/about` is `apps/web/src/app/about/page.tsx`; the admin dashboard is
`apps/admin/src/app/admin/page.tsx`.

**Lint keeps the sides apart:** client-safe code never imports `packages/server`, packages never
import an app, and no app imports another; every `packages/server` file starts with
`import "server-only"`, so a client import of it fails the build
([the rules](docs/architecture.md#5-import-rules)).

**Adding code?** [Where does new code go?](CONTRIBUTING.md#where-does-new-code-go) answers it in one
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
> convention from memory. See `AGENTS.md`.

## Prerequisites

- Node.js **24** (see `.node-version`; `package.json` `engines` is `24.x`)
- npm 11+ (bundled with Node 24)
- A Supabase project, a NewsData.io API key, and an Anthropic API key

## Setup

```bash
git clone <repo-url> && cd TimesPrime
npm ci
cp .env.local.example .env.local   # then fill it in, see below
npm run dev                        # the reader site, http://localhost:3000
npm run dev:admin                  # the back office, http://localhost:3001/admin
```

Apply the database schema before first run — paste `database/schema.sql` into the
Supabase SQL editor, then `database/policies.sql`.

> `database/schema.sql` currently defines the `articles` table only. The
> `breaking_news` and `admin_logs` tables exist as SQL inside comments in
> `apps/admin/src/app/api/admin/breaking-news/route.ts` and
> `apps/admin/src/app/api/admin/logs/route.ts`. Until those are promoted into
> `database/schema.sql`, breaking news and the activity log will not work on a fresh
> project.

## Environment variables

Copy `.env.local.example` to `.env.local`. Never commit `.env.local`.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key; RLS restricts it to reads |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Bypasses RLS for server-side writes. Never expose to the client |
| `NEWSDATA_API_KEY` | yes | NewsData.io. Without it the app serves built-in mock articles |
| `ANTHROPIC_API_KEY` | yes | Powers `/api/chat` and category classification. Without it chat returns a clear "unavailable" message |
| `ADMIN_PASSWORD` | yes | The admin panel password, compared in constant time |
| `ADMIN_SESSION_SECRET` | yes | HMAC key signing the 12-hour admin session cookie |
| `ADMIN_LEGACY_LOGIN` | optional | `off` retires the shared admin password early. It ends by itself at 00:00 IST on 1 January 2027 (Panel 0) |
| `UPSTASH_REDIS_REST_URL` | optional | Shared cache. Without it, an in-process cache is used (fine locally, not shared across serverless instances) |
| `UPSTASH_REDIS_REST_TOKEN` | optional | Pairs with the URL above |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | Error reporting. Not a secret, but must be `NEXT_PUBLIC_` to reach the browser |
| `SENTRY_AUTH_TOKEN` | build | Source-map upload at build time only |
| `SENTRY_ORG` | build | Sentry org slug |
| `SENTRY_PROJECT` | build | Sentry project slug |
| `NEXT_PUBLIC_APP_URL` | prod | Public origin; fills OpenGraph metadata |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## Scripts

Run from the repository root.

| Script | What it does |
|---|---|
| `npm run dev` | The reader site, http://localhost:3000 |
| `npm run dev:admin` | The back office, http://localhost:3001/admin |
| `npm run job -- refresh-news` | Runs a worker job once (it writes to the database `.env.local` points at) |
| `npm run build` | Production builds of both apps |
| `npm run typecheck` | `tsc --noEmit` for every app, every package and the root |
| `npm run lint` | ESLint over the repository, including the import-boundary rules (`eslint.config.mjs`) |
| `npm test` | Jest: one project per app, plus the packages |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:ci` | Jest with coverage, CI reporter |
| `npm run verify` | typecheck → lint → test → build. **The gate every commit must pass** |

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

Fuller detail in [`docs/architecture.md`](docs/architecture.md).

## Deployment

**None until the project is complete** (owner decision, 2026-11-02); every check
runs locally. The target is AWS, region `ap-south-1`. Set every variable from the
table above in the AWS environment. Three units deploy: the reader site and the
back office as ECS services, and the worker as a task that EventBridge starts every
30 minutes (`npm run job -- refresh-news`). The plan for that day is Phase I of
[`docs/NEWSROOM_PLAN.md`](docs/NEWSROOM_PLAN.md), and the checklist is in
[`docs/HANDOFF.md`](docs/HANDOFF.md) §11.

## Documentation

- [`docs/README.md`](docs/README.md) — the index of `docs/`, and the order to read it in
- [`docs/NEWSROOM_PLAN.md`](docs/NEWSROOM_PLAN.md) — the build plan: phases, order, what each delivers
- [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) — roles, the permission matrix, four-eyes and MFA rules
- [`docs/architecture.md`](docs/architecture.md) — structure and import rules
- [`docs/adr/`](docs/adr/) — architecture decision records
- [`docs/runbooks/`](docs/runbooks/) — operational procedures
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — deferred debt, with the reason for each deferral
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — where new code goes, the verify gate, and the commit convention
