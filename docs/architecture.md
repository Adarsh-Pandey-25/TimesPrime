# Architecture

**Structure decision:** layer separation with a CI-enforced import boundary. Approved 2026-10-29.
Per-file destinations are in [`CODEMAP.md`](CODEMAP.md); slice order is in
[`MOVE-MAP.md`](MOVE-MAP.md).

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

SERVE ─ per reader request
  /api/news/top-headlines
    1. Redis cache        15 min TTL                 → X-Data-Source: cache
    2. Supabase           newest row < 30 min old    → supabase
    3. NewsData.io        live call                  → newsdata
    4. MOCK_ARTICLES      built-in fallback          → mock
  Each tier degrades silently to the next. The header is the only signal
  of which tier actually answered.

AUTHORISE ─ every admin request
  src/proxy.ts   matcher: /admin/*, /api/admin/*
    public:          /admin/login, /api/admin/login, /api/admin/logout
    public GET only: /api/admin/breaking-news   (homepage banner, no session)
    otherwise:       HMAC-SHA256 cookie, 12 h, httpOnly, SameSite=Lax
  No route handler performs its own auth check.
```

**Authorisation is a single choke point.** That is a good design — one place to audit, one place to
change — but it means any route added outside the proxy matcher is silently public, and the matcher
has no test. Keep this property visible; do not scatter it.

## 2. Framework constraints

Fixed by Next.js 16. These are not design choices, and three of them have already caused wrong
conclusions (see [`HANDOFF.md`](HANDOFF.md) §3).

- Files under `src/app/**` named `page`, `layout`, `route`, `loading` or `error` **are** the routing
  table. Their path **is** the URL. Route groups `(name)` reorganise without changing a URL;
  private folders `_name` opt out of routing entirely.
- `src/proxy.ts` is the Proxy entrypoint — Next 16's rename of Middleware. Location-pinned.
- `src/instrumentation.ts`, `src/instrumentation-client.ts` and `src/sentry.*.config.ts` are
  location-pinned conventions. Silently inert if moved.
- `next.config.ts` imports `ALLOWED_IMAGE_HOSTNAMES` from `imageDomains.ts` and evaluates it at
  **config-load time**. That module must never import React or `server-only`.
- `images.remotePatterns` hostnames are matched with **picomatch globs**, not string equality, and
  the array is capped at **50 entries**.
- `vercel.json` pins the cron to `/api/cron/refresh-news`.

> Next.js is explicitly **unopinionated** about project organisation. Its own documentation presents
> three strategies and concludes: *"choose a strategy that works for you and your team and be
> consistent across the project."* The structure below is a team decision, not a framework mandate.

## 3. Why the current structure needs changing

`src/lib/` is not a module. It is a folder named after the absence of a decision, and it holds six
genuinely different kinds of thing:

| Concern | Files |
|---|---|
| Data access | `db.ts` (571) · `supabase.ts` |
| Security primitives | `adminSession.ts` · `urlValidation.ts` |
| Cross-cutting infrastructure | `cache.ts` · `rateLimit.ts` · `sentryScrub.ts` · `adminLogger.ts` |
| Domain logic | `newsConfig.ts` · `categoryClassifier.ts` · `fetchNews.ts` · `newsdata.ts` |
| Static configuration data | `imageDomains.ts` · `categoryColors.ts` · `topicImages.ts` (414) |
| Presentation / i18n | `translations.ts` · `googleTranslate.ts` · `bookmarks.ts` |

Nothing in the folder name tells a reader which of those a given file is, and nothing prevents a
React component importing a Supabase client. **That has already happened**: `ActivityLog.tsx` is a
client component that imports `adminLogger.ts` for two constants and drags the entire Supabase SDK
into the browser bundle. The import graph confirms it is currently the *only* such violation —
which makes this the right moment to fix it and close the door.

## 4. Target structure

```
src/
  app/                  ROUTING ONLY — handlers parse, delegate, serialize
    (reader)/           / · article/[slug] · saved
    (marketing)/        about · contact · privacy · terms
    admin/              login · dashboard
    api/                paths frozen — CR-01, CR-02
  features/
    news/ article/ admin/ chat/ bookmarks/ i18n/
      components/       ← frontend half
      server/           ← backend half
      index.ts          ← the ONLY public surface
  components/ui/        presentational primitives, zero domain knowledge
  server/               backend-only: db · supabase · auth · auditLog
  lib/                  cross-cutting, domain-free: cache · rateLimit · urlValidation · sentryScrub
  config/               static data: imageDomains · categoryColors · topicImages
  types/                genuinely shared types
db/  docs/  scripts/  public/
```

### Why not a top-level `backend/` folder

Considered and rejected. In the App Router, `src/app/api/**/route.ts` **is** the backend and its
path **is** the URL. Moving it breaks every API URL (CR-01), the cron contract (CR-02) and the auth
matcher (CR-05). A genuine two-app split is a rewrite, not a reorganisation, and would discard the
co-location that makes server components work.

The separation above is stronger than folder distance, because §5 makes a violation fail CI.

## 5. Import rules

These are the rules a reviewer may cite in a pull request. Phase E enforces them mechanically.

1. **One public surface per feature.** A feature is imported only through
   `features/<name>/index.ts`. Reaching past it into internals is forbidden.
2. **No sideways imports.** Nothing imports across feature boundaries. `features/news` may not
   import from `features/article`.
3. **Imports go downward only.** Features import into `components/ui`, `lib`, `server`, `config`.
   Never upward, never laterally.
4. **Shared things move down.** If two features need the same thing, it moves into a shared layer.
   It does not get imported sideways.
5. **`components/ui` is domain-free.** It may not import a feature, and must not know what an
   `Article` is.
6. **`server/` is never imported by a client component.** This is the rule `ActivityLog.tsx`
   currently breaks.
7. **`config/` imports nothing.** Static data only — no React, no `server-only`, no feature code.
   `imageDomains.ts` depends on this (CR-06).
8. **`app/` holds no business logic.** Route handlers parse input, call a feature, serialise output.
   Extraction heuristics, SQL and filter logic belong in a feature where they can be tested without
   constructing an HTTP request.

Rule 4 is the one that matters most. Sideways imports are how a feature-first structure collapses
back into the thing it replaced — usually within a quarter, always one reasonable-looking import at
a time. Documentation does not prevent this; a linter does.

## 6. Module responsibilities

| Module | Owns | Must never |
|---|---|---|
| `app/` | URL structure, request/response shape, auth delegation | Contain extraction heuristics, filter logic or SQL |
| `features/news/` | Upstream fetching, source allowlists, script and spam filters, classification, freshness | Import from another feature |
| `features/article/` | Scraping, paywall detection, extraction, junk filtering, the detail view | Know about admin or chat |
| `features/admin/` | Operator UI and its server actions | Be imported by reader-facing code |
| `features/chat/` | Assistant UI, prompt assembly, streaming | Reach into article internals — take context as a parameter |
| `features/bookmarks/` | Device-local persistence and its UI | Touch the server at all |
| `features/i18n/` | Language state, static strings, translation client | Hold feature-specific copy |
| `components/ui/` | Buttons, cards, skeletons, layout — appearance only | Import a feature, or know what an Article is |
| `server/` | Database client, session issue/verify, audit logging | Be imported by a client component |
| `lib/` | Genuinely cross-cutting, domain-free utilities | Become the next dumping ground — if it has a domain, it belongs in a feature |
| `config/` | Static data: allowlists, colour maps, topic images | Import anything at all (CR-06) |

## 7. Decision records

Structural decisions and the alternatives rejected live in [`adr/`](adr/).
`0001-feature-first-structure.md` is written in Phase C and must record the two-app split
considered in §4, and why full Feature-Sliced Design was judged too heavy for a 13k-LOC codebase
with two personas.
