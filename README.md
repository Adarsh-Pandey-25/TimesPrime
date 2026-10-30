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

One Next.js app, split by where code runs. Lint and CI fail any import that crosses the split the
wrong way: the frontend never imports the backend, shared code imports neither side, and only
`app/` brings the two together ([the rules](docs/architecture.md#5-import-rules)).

```
app/         The URLs. Each route, and most pages, is one line re-exporting its body
frontend/    The UI: page bodies (views/), feature components (features/), primitives,
             providers, styles
backend/     Server-only: route bodies (api/), domain logic (services/), Supabase queries
             (repositories/), the admin session (auth/), infrastructure (lib/)
shared/      What both sides import: config and static data, types, Sentry scrubbing
database/    schema.sql, policies.sql and the seed script; applied by hand, imported by nothing
docs/        Architecture, decision records, PRD, audit ledger, backlog, handoff
scripts/     Repo tooling: the import-boundary check and the CODEMAP generator
public/      Logos and favicon
proxy.ts     Admin authorisation: the one gate in front of /admin/* and /api/admin/*
```

The other root files are Next.js, Sentry, ESLint, Jest and TypeScript configuration. Next requires
`instrumentation*.ts` and `sentry.*.config.ts` to sit at the root.

**Following a request:** `GET /api/news/top-headlines` reaches `app/api/news/top-headlines/route.ts`,
which is one line re-exporting `backend/api/news/top-headlines.ts`; that body reads the cache in
`backend/lib/` and the feed from `backend/services/news`. The page `/about` reaches
`app/about/page.tsx`, which re-exports `frontend/views/about/AboutView.tsx`.

**Adding code?** [Where does new code go?](CONTRIBUTING.md#where-does-new-code-go) answers it in one
table: the folder, the entry point, the file to create in `app/`, and the rule that fails if it is
wrong. Every module, with its importers and imports, is in [`docs/CODEMAP.md`](docs/CODEMAP.md).

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
| Hosting | Vercel (cron defined in `vercel.json`) |

> **This is not stock Next.js.** Version 16 renamed Middleware to **Proxy**
> (`proxy.ts`), deprecated the `priority` image prop in favour of `preload`,
> and matches `images.remotePatterns` hostnames with globs rather than string
> equality. Read `node_modules/next/dist/docs/` before relying on any framework
> convention from memory. See `AGENTS.md`.

## Prerequisites

- Node.js **24** (see `.node-version`; `package.json` `engines` is `24.x`, which Vercel also reads)
- npm 11+ (bundled with Node 24)
- A Supabase project, a NewsData.io API key, and an Anthropic API key

## Setup

```bash
git clone <repo-url> && cd TimesPrime
npm ci
cp .env.local.example .env.local   # then fill it in, see below
npm run dev                        # http://localhost:3000
```

Apply the database schema before first run — paste `database/schema.sql` into the
Supabase SQL editor, then `database/policies.sql`.

> `database/schema.sql` currently defines the `articles` table only. The
> `breaking_news` and `admin_logs` tables exist as SQL inside comments in
> `backend/api/admin/breaking-news.ts` and
> `backend/api/admin/logs.ts`. Until those are promoted into
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
| `CRON_SECRET` | prod | Gates `/api/cron/refresh-news`. Vercel sends it as a bearer token. Unset means the endpoint fails closed |
| `UPSTASH_REDIS_REST_URL` | optional | Shared cache. Without it, an in-process cache is used (fine locally, not shared across serverless instances) |
| `UPSTASH_REDIS_REST_TOKEN` | optional | Pairs with the URL above |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | Error reporting. Not a secret, but must be `NEXT_PUBLIC_` to reach the browser |
| `SENTRY_AUTH_TOKEN` | build | Source-map upload at build time only |
| `SENTRY_ORG` | build | Sentry org slug |
| `SENTRY_PROJECT` | build | Sentry project slug |
| `NEXT_PUBLIC_APP_URL` | prod | Public origin; restricts CORS and fills OpenGraph metadata |
| `NEXT_PUBLIC_BASE_URL` | optional | Base URL the server uses for its own internal fetches. Defaults to `http://localhost:3000` |

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with Turbopack |
| `npm run build` | Production build |
| `npm start` | Serve a production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including the import-boundary rules (`eslint.boundaries.mjs`) |
| `npm run check:boundaries` | The same rules over the whole import graph, including what the client bundle reaches transitively |
| `npm test` | Jest |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:ci` | Jest with coverage, CI reporter |
| `npm run verify` | typecheck → lint → check:boundaries → test → build. **The gate every commit must pass** |

## Architecture in one paragraph

A Vercel cron hits `/api/cron/refresh-news` every 30 minutes, pulls each
category from NewsData.io, filters out paywalled, horoscope, wire-spam and
non-news sources, and upserts into Supabase. Reads go through
`/api/news/top-headlines`, which tries the Redis cache, then Supabase if its
newest row is under 30 minutes old, then NewsData.io, and finally built-in mock
articles. The `X-Data-Source` response header says which tier answered — useful
when diagnosing whether a given response touched the database at all. Admin
routes carry no auth checks of their own; `proxy.ts` gates every
`/admin/*` and `/api/admin/*` path ahead of them.

Fuller detail in [`docs/architecture.md`](docs/architecture.md).

## Deployment

Hosted on Vercel. Set every variable from the table above in the project's
environment settings. `vercel.json` registers the cron at `*/30 * * * *` against
`/api/cron/refresh-news`; that path must not change without updating the file.

## Documentation

- [`docs/README.md`](docs/README.md) — the index of `docs/`, and the order to read it in
- [`docs/PRD.md`](docs/PRD.md) — product requirements, reverse-engineered from the code
- [`docs/architecture.md`](docs/architecture.md) — structure and import rules
- [`docs/CODEMAP.md`](docs/CODEMAP.md) — every module, with what imports it and what it imports
- [`docs/adr/`](docs/adr/) — architecture decision records
- [`docs/runbooks/`](docs/runbooks/) — operational procedures
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — deferred debt, with the reason for each deferral
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — where new code goes, the verify gate, and the commit convention
