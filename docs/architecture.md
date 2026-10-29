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

Finalized in Phase C and **validated**: `node scripts/check-move-map.mjs` relocates every file and
tests all 149 import edges against §5. The Phase A draft of this tree — six features — broke the
rules 21 times; this one breaks them twice, both the one known bug. Full reasoning in
[`adr/0001-feature-first-structure.md`](adr/0001-feature-first-structure.md).

```
src/
  app/                  ROUTING ONLY — handlers parse, delegate, serialize. Paths frozen (CR-01)
  features/
    news/               feed, article page, masthead, ingestion, classification, storage
      components/       ← frontend half
      server/           ← backend half
      index.ts          ← client-safe public surface
      server.ts         ← server-only public surface
    admin/              operator UI
    chat/               AI assistant
  components/ui/        theme · i18n provider · layout/Footer · spinner · skeleton — no domain
  server/               backend-only: supabase · auth · auditLog · googleTranslate
  lib/                  cross-cutting: cache · rateLimit · urlValidation · sentryScrub · bookmarks
  config/               static data: imageDomains · categoryColors · topicImages · translations
  types/                genuinely shared types
db/  docs/  scripts/  public/
```

**Three features, not six.** i18n, bookmarks and the article page all looked like features and
measured as shared code or as part of news — see the ADR. Route groups under `app/` are deferred:
they change no URL and buy nothing until a group layout exists.

### Why not a top-level `backend/` folder

Considered and rejected. In the App Router, `src/app/api/**/route.ts` **is** the backend and its
path **is** the URL. Moving it breaks every API URL (CR-01), the cron contract (CR-02) and the auth
matcher (CR-05). A genuine two-app split is a rewrite, not a reorganisation, and would discard the
co-location that makes server components work.

The separation above is stronger than folder distance, because §5 makes a violation fail CI.

## 5. Import rules

These are the rules a reviewer may cite in a pull request. Phase E enforces them mechanically.

1. **At most two public surfaces per feature.** `features/<name>/index.ts` is safe for client and
   server; `features/<name>/server.ts` is server-only and **never** imported by client code. Nothing
   outside the feature reaches past either. *Why two:* a single barrel re-exporting both would let a
   client import of `ArticleCard` resolve `db.ts` too — the same mechanism that put the Supabase SDK
   in `/admin`'s browser chunk, because `supabase.ts` calls `createClient()` at module scope and no
   bundler can tree-shake that.
2. **No sideways imports.** Nothing imports across feature boundaries. `features/admin` may not
   import from `features/news`. (`app/` composes features and may import any of them.)
3. **Imports go downward only.** Features import into `components/ui`, `lib`, `server`, `config`,
   `types`. Never upward, never laterally.
4. **Shared things move down.** If two features need the same thing, it moves into a shared layer.
   It does not get imported sideways.
5. **`components/ui` is domain-free.** It may not import a feature, and must not know what an
   `Article` is.
6. **`server/` is never imported by a client component.** This is the rule `ActivityLog.tsx`
   currently breaks.
7. **`config/` imports only `config/` and `types/`.** Static data — no React, no `server-only`, no
   feature or server code. **`imageDomains.ts` imports nothing at all**: `next.config.ts` evaluates it
   at config-load time (CR-06). *Refined in Phase C:* the draft said "config imports nothing", which
   `topicImages.ts → imageDomains.ts` already contradicted.
8. **`app/` holds no business logic.** Route handlers parse input, call a feature, serialise output.
   Extraction heuristics, SQL and filter logic belong in a feature where they can be tested without
   constructing an HTTP request. *Target state:* today `scrape-article` and `top-headlines` still
   carry logic inline; extracting it is Phase F, behind characterization tests.

Rule 4 is the one that matters most. Sideways imports are how a feature-first structure collapses
back into the thing it replaced — usually within a quarter, always one reasonable-looking import at
a time. Documentation does not prevent this; a linter does.

## 6. Module responsibilities

| Module | Owns | Must never |
|---|---|---|
| `app/` | URL structure, request/response shape, auth delegation | Contain extraction heuristics, filter logic or SQL |
| `features/news/` | Feed, article page, masthead; upstream fetching, editorial filters, classification, freshness, article storage | Import from another feature; expose server code through `index.ts` |
| `features/admin/` | Operator UI, plus the public breaking-news banner whose data it owns (CR-08) | Be imported by another feature |
| `features/chat/` | Assistant UI | Reach into news internals — take article context as a parameter |
| `components/ui/` | Theme and language providers, Footer, spinner, skeleton — appearance only | Import a feature, or know what an Article is |
| `server/` | Supabase client, session issue/verify, audit logging, the translate client | Be imported by a client component |
| `lib/` | Cross-cutting utilities with no feature knowledge, including the client-side bookmark store | Become the next dumping ground — if it has a domain, it belongs in a feature |
| `config/` | Static data: allowlists, colour maps, topic images, UI strings | Import anything but `config/` and `types/`; `imageDomains.ts` imports nothing (CR-06) |

## 7. Decision records

Structural decisions and the alternatives rejected live in [`adr/`](adr/).
[`0001-feature-first-structure.md`](adr/0001-feature-first-structure.md) records this structure,
the measurements that shaped it, and the five alternatives rejected.
