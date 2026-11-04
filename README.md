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

The standard Next.js `src/` layout ([ADR 0004](docs/adr/0004-standard-src-layout.md)).

```
src/
  app/          The URLs. Each page.tsx and route.ts holds its own code; tests sit beside it
  components/   React UI by area: news/, admin/, chat/, home/, article/, ui/
  context/      Theme and language providers
  server/       Server-only (every file imports "server-only"): auth/, repositories/ (Supabase
                queries), services/ (news, scrape, translate, classify, health), lib/ (cache,
                rate limit, …)
  lib/          Helpers both sides use: URL validation, Sentry scrubbing, saved articles
  config/       Static data and editorial rules: news filters, permissions, UI strings, …
  types/        Shared TypeScript types
  proxy.ts      Admin authorisation: the session check in front of /admin/* and /api/admin/*
  instrumentation*.ts, sentry.*.config.ts   Sentry wiring
database/       schema.sql, policies.sql, migrations/, bootstrap/, seed/; applied by hand
docs/           The build plan, access rules, architecture, decision records, research, audit ledger,
                backlog, handoff, panels
scripts/        generate-access-catalog.mjs: writes the permission catalogue SQL from the plan
public/         Logos and favicon
```

The root holds only configuration: Next.js, ESLint, Jest, TypeScript, PostCSS.

**Following a request:** `GET /api/news/top-headlines` reaches
`src/app/api/news/top-headlines/route.ts`, which calls `getTopHeadlines` in
`src/server/services/news/topHeadlines.ts`; that reads the cache in `src/server/lib/` and the feed
from Supabase. The page `/about` is `src/app/about/page.tsx`.

**Lint keeps server code out of the browser:** components, context, `lib`, `config` and `types`
never import `src/server/`, and every `src/server/` file starts with `import "server-only"`, so a
client import of it fails the build ([the rules](docs/architecture.md#5-import-rules)).

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
| Hosting | **Not deployed** until the project is complete; then AWS, `ap-south-1`. The cron schedule is in `vercel.json` today and needs an AWS scheduler then |

> **This is not stock Next.js.** Version 16 renamed Middleware to **Proxy**
> (`src/proxy.ts`), deprecated the `priority` image prop in favour of `preload`,
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
npm run dev                        # http://localhost:3000
```

Apply the database schema before first run — paste `database/schema.sql` into the
Supabase SQL editor, then `database/policies.sql`.

> `database/schema.sql` currently defines the `articles` table only. The
> `breaking_news` and `admin_logs` tables exist as SQL inside comments in
> `src/app/api/admin/breaking-news/route.ts` and
> `src/app/api/admin/logs/route.ts`. Until those are promoted into
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
| `CRON_SECRET` | prod | Gates `/api/cron/refresh-news`; the scheduler sends it as a bearer token. Unset means the endpoint fails closed |
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

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with Turbopack |
| `npm run build` | Production build |
| `npm start` | Serve a production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including the import-boundary rules (`eslint.config.mjs`) |
| `npm test` | Jest |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:ci` | Jest with coverage, CI reporter |
| `npm run verify` | typecheck → lint → test → build. **The gate every commit must pass** |

## Architecture in one paragraph

A scheduled job hits `/api/cron/refresh-news` every 30 minutes, pulls each
category from NewsData.io, filters out paywalled, horoscope, wire-spam and
non-news sources, and upserts into Supabase. Reads go through
`/api/news/top-headlines`, which tries the Redis cache, then Supabase if its
newest row is under 30 minutes old, then NewsData.io, and finally built-in mock
articles. The `X-Data-Source` response header says which tier answered — useful
when diagnosing whether a given response touched the database at all. Admin
routes are gated twice: `src/proxy.ts` lets only a session through to `/admin/*` and
`/api/admin/*`, and each route body checks the staff member's permissions
(`requirePermission`, Panel 0).

Fuller detail in [`docs/architecture.md`](docs/architecture.md).

## Deployment

**None until the project is complete** (owner decision, 2026-11-02); every check
runs locally. The target is AWS, region `ap-south-1`. Set every variable from the
table above in the AWS environment. `vercel.json` holds the 30-minute schedule
(`*/30 * * * *` against `/api/cron/refresh-news`), but only Vercel reads it: on
AWS a scheduler must call that path with the `CRON_SECRET` bearer token, and the
path must not change. The list for that day is in
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
