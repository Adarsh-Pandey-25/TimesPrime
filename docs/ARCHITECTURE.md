# Architecture

What TimesPrime does, how it is built, and why, in four parts:

1. [Product requirements](#product-requirements): what the product does, requirement by requirement,
   with code citations, the defect register and the owner's product decisions. The canonical
   specification.
2. [System design](#system-design): how a request flows, the framework constraints, the layout, the
   import rules and how they are enforced, and what each module owns.
3. [Data model](#data-model): the tables, and where their SQL lives.
4. [Decisions](#decisions): every decision record, dated, with the alternatives it rejected, and the
   owner's decisions.

> **Paths in carried records.** The product requirements and the decision records before
> [ADR 0004](#adr-0004--four-top-level-folders-four-documents) were written before restructure 3
> (2026-11-03) and keep the paths of their time. Since then `app/` is `frontend/app/`, `shared/` is
> `backend/shared/`, `scripts/` is `backend/scripts/`, `public/` is `frontend/public/`, and the
> Next.js files that sat at the root (`proxy.ts`, `next.config.ts`, `instrumentation*.ts`,
> `sentry.*.config.ts`, `vercel.json`, `tsconfig.json`, `eslint.config.mjs`, `jest.config.ts`,
> `postcss.config.mjs`) are in `frontend/`. `.env.local` is `frontend/.env`. The system design uses
> today's paths.

## Product requirements

**Type:** brownfield / reverse-engineered · **Baseline:** commit `506a4ab`, branch `main`, updated
through `59b875d` to record the owner decisions in §12 · **Updated:** 2026-10-29; code citations
moved to the restructure-2 layout on 2026-10-30; statuses, §7, §11 and §13 brought up to date at the
audit Phase 5 close-out on 2026-11-02 (each number re-measured then, or marked as unmeasured)

This document describes what TimesPrime **does**, not what anyone intended it to do. Every
functional requirement cites the code implementing it; a requirement with no citation is marked
`Planned` and is a wish, not a description.

> **Why §11 exists.** A reverse-engineered PRD has a known failure mode: it reads the code, finds a
> behaviour, and writes it down as a requirement — including behaviours that are defects. Once a bug
> is printed in a requirements document it becomes extremely hard to remove, because every later
> reader assumes it was intended. Ten such behaviours are quarantined in §11 and are **not**
> requirements.

---

### 1. Overview

TimesPrime aggregates news from a commercial API, stores it on a rolling seven-day window, and
serves a bilingual (English / Hindi) reading experience.

It is not a thin API wrapper. Between upstream and reader sit a filtering pipeline, a caching
strategy, an article scraper, an AI classifier, an on-demand translator, and an editorial admin
surface. The product's value is that editorial layer.

### 2. Problem and context

Raw news-API output is not a reading experience. The upstream feed carries duplicate headlines,
horoscope filler tagged as business news, wire-spam accounts republishing the same crop-survey
article under five categories, articles in scripts the product does not support, and paywalled
stories whose "content" is a subscription prompt.

TimesPrime removes all of that, then adds the affordances that make a story readable: full text,
translation, saving, and an assistant that can answer questions about it. The audience is
bilingual and Indian-market, with English and Hindi as **equal** first-class languages — not a
primary language plus a translation afterthought.

### 3. Goals and non-goals

| Goals | Explicit non-goals |
|---|---|
| A clean, de-duplicated, on-topic feed in two languages | **Not a user-account product** — no registration, no server-side user state |
| Readable article text without leaving the site | **Not a CMS** — editorial publishing is an escape hatch, not the main path |
| Serve readers from storage, not upstream, to control cost | **Not a social platform** — no comments, profiles, or sharing beyond the OS share sheet |
| An operator surface for moderation and breaking news | **Not multi-tenant** — one publication, one admin credential |
| Degrade visibly rather than fail, on any third-party outage | **Not real-time** — a 30-minute refresh cadence is the design point |
| Show headlines and article text exactly as the source published them | **Not a rewriting service** — nothing is paraphrased or reworded without human review (owner decision Q1, §12) |
| | **No languages beyond English and Hindi.** Odia, Bengali, Tamil and other Indic-script articles arrive from upstream and are discarded **by design** — this is scope, not a bug (owner decision Q5, §12) |

### 4. Personas

| Persona | Needs | Implied constraints |
|---|---|---|
| **Reader** | A fast, current, relevant feed in their language; full text without hitting a paywall; to save things for later | No login. State is device-local. Must work on a mid-range phone on mobile data |
| **Operator / editor** | Remove bad articles; push a breaking banner within seconds; confirm the sync is alive; publish an original piece | Single shared credential. Destructive actions logged, and reversible where possible |

### 5. User journeys

1. **Browse the feed.** Land on `/` → server renders the category feed → client hydrates and polls
   for new stories every 2 minutes → a banner offers a refresh when newer rows exist.
2. **Read an article.** Tap a card → `/article/[slug]?url=&image=` → server calls the scraper →
   paywall detection, then `<p>` extraction, then JSON-LD fallback, then junk filtering → full text
   renders with a link to the publisher.
3. **Switch language.** Toggle to Hindi → the feed re-queries with a Devanagari script filter; on an
   article page the scraped text is translated on demand and cached per title.
4. **Save for later.** Bookmark → written to `localStorage` → a custom DOM event updates the header
   counter → `/saved` lists them.
5. **Ask the assistant.** Open the floating assistant, or ask from an article → `/api/chat` streams
   a Claude Haiku response with the article title and description as context.
6. **Operate.** Sign in → proxy issues an HMAC session cookie → moderate, publish, set a banner,
   trigger a sync → each action appended to the activity log.

### 6. Functional requirements

24 requirements. Status reflects **verified behaviour**, not intent. Paths are relative to the repository root; a route or
page is cited at its body, which the one-line file in `app/` re-exports.

#### Feed and ingestion

| ID | Requirement | Implemented in | Status |
|---|---|---|---|
| FR-001 | Fetch headlines by category from NewsData.io | `backend/services/news/newsdata.ts`, `backend/services/news/fetchNews.ts` | Implemented |
| FR-002 | Refresh all 7 categories on a 30-minute schedule | `backend/api/cron/refresh-news.ts`, `vercel.json` | Implemented |
| FR-003 | Serve from cache → store → upstream → mock, in that order | `backend/api/news/top-headlines.ts` | Implemented — tier 2 reachable again since 2026-10-30; its production check is pending (DEF-01) |
| FR-004 | Persist articles on a rolling 7-day window | `backend/repositories/db.ts` → `purgeOldArticles`, run by `backend/api/cron/refresh-news.ts` | Implemented · tested — once per cron run, off the read path (`2f31bad`) |
| FR-005 | De-duplicate by normalised title | `shared/config/newsConfig.ts` → `dedupeArticlesByTitle` | Implemented · tested |
| FR-006 | Exclude horoscope/tarot filler, wire-spam and non-news listing sources | `shared/config/newsConfig.ts` | Implemented · tested |
| FR-007 | Exclude hard-paywalled publishers at write time | `backend/repositories/db.ts` → `HARD_PAYWALL_SOURCE_DOMAINS` | Implemented |
| FR-008 | Classify and suppress mis-tagged categories via LLM | `backend/services/classify/categoryClassifier.ts` | Implemented — fail-open by design |
| FR-009 | Notify the reader when newer stories exist | `backend/api/news/check-new.ts`, `frontend/views/home/HomeClient.tsx` | Implemented |

#### Language

| ID | Requirement | Implemented in | Status |
|---|---|---|---|
| FR-010 | Restrict each feed to its language by script detection | `shared/config/newsConfig.ts`, `backend/repositories/db.ts` | Implemented · tested |
| FR-011 | Translate article text on demand | `backend/api/translate.ts`, `backend/services/translate/googleTranslate.ts` | **Partial** — unofficial endpoint; size-capped since `58c7f7d` |
| FR-012 | Persist the language choice across visits | `frontend/context/LanguageContext.tsx` | Implemented |

#### Article reading

| ID | Requirement | Implemented in | Status |
|---|---|---|---|
| FR-013 | Extract readable full text from a publisher page | `backend/services/scrape/scrapeArticle.ts` | Implemented · tested — a failure is a 502/504, not placeholder prose (`b7f6fbc`) |
| FR-014 | Detect paywalls and show publisher metadata instead of junk | same → `detectPaywall` | Implemented · tested |
| FR-015 | Strip author bios, nav and app-download boilerplate | same → `isJunkParagraph` | Implemented |
| FR-016 | Refuse to fetch internal/private network addresses | `shared/validation/urlValidation.ts`, `backend/services/scrape/fetchPage.ts` | Implemented · tested — every redirect hop revalidated, connections pinned (`2e383cb`, `1145bca`) |
| FR-017 | Always link out to the original publisher | `frontend/views/article/ArticleDetailView.tsx` | Implemented · tested — only a stored article's http(s) link is used (`8d0b775`) |

#### Reader features

| ID | Requirement | Implemented in | Status |
|---|---|---|---|
| FR-018 | Save articles device-locally and list them | `frontend/features/news/bookmarks.ts`, `frontend/views/saved/SavedView.tsx` | Implemented · tested |
| FR-019 | Answer questions about a story, streamed | `backend/api/chat.ts` | Implemented · tested — both chat surfaces report a failure honestly (`86bdf78`) |
| FR-020 | Provide a themed, topic-appropriate image for every card | `shared/config/topicImages.ts`, `shared/config/imageDomains.ts` | Implemented |

#### Operations

| ID | Requirement | Implemented in | Status |
|---|---|---|---|
| FR-021 | Gate every admin surface behind a session | `proxy.ts`, `backend/auth/adminSession.ts` | Implemented · tested — login rate-limited, constant-time compare (`7eb9253`) |
| FR-022 | List, search, edit, delete and bulk-delete stored articles | `backend/api/admin/articles.ts`, `backend/api/admin/articles-bulk.ts`, `frontend/features/admin/ArticlesTable.tsx` | Implemented |
| FR-023 | Publish an editorial article directly | `backend/api/admin/publish-article.ts` | Implemented — bypasses the filter pipeline by design |
| FR-024 | Set a time-boxed breaking-news banner | `backend/api/admin/breaking-news.ts` | Implemented — its table is in `database/schema.sql` since `db28a46`, to be applied by the owner (DEF-07) |

### 7. Non-functional requirements

| ID | Requirement | Current reality |
|---|---|---|
| NFR-01 | A reader request should not call the upstream API | **Unmeasured since 2026-10-30.** It was not met while every Supabase call failed (DEF-01); Supabase answers again, and the store is read first. Measure in production with the `X-Data-Source` header |
| NFR-02 | No third-party outage produces a user-visible error | Met — arguably over-met; see §11 |
| NFR-03 | Abuse-prone endpoints are rate-limited | **Met in code.** Chat and translate per IP in memory, with eviction; login (10 per 15 min) and the public scraper (30 per min, stored articles only) on Redis with an in-memory fallback. On Redis: a production check |
| NFR-04 | Request bodies and upstream responses are size-capped | **Met.** Chat 16 KB / 2,000 characters; translate 64 KB, 50 texts, 5,000 characters each and 10,000 in all; scraped pages 5 MB (`58c7f7d`) |
| NFR-05 | Secrets never reach the browser or an error report | Met — `shared/validation/sentryScrub.ts` redacts nine keys; no secret is read under a `NEXT_PUBLIC_` name (the last fallback went in `45223f0`) |
| NFR-06 | Stored articles are purged after 7 days | Met — once per cron run (`2f31bad`) |
| NFR-07 | Usable at 400 px width | Appears met from the breakpoint set; **not verified in a browser** |
| NFR-08 | Typecheck, lint, test and build pass on every commit | Met, and enforced in CI since `506a4ab` |
| NFR-09 | No dependency carries a known critical advisory | **Met.** `npm audit` on 2026-11-02: 0 critical, 0 high; 34 moderate and 3 low, all in dev and build tooling (`AUDIT-FINDINGS.md`, npm audit) |
| NFR-10 | Business logic is covered by tests | **Met for non-UI modules.** On 2026-11-02: 61.51% of statements in `backend/` and `shared/` (3,448 of 5,606, 44 files); 47.01% overall (5,968 of 12,694, 80 files), with `frontend/` at 34.24%. Earlier baseline: 3.62% statements (428 of 11,795) at `73e207f`. It fell 4.41% → 3.50% when the well-covered paraphraser was deleted, not because any test regressed; it has since crept up only because later deletions shrank the denominator — 428 statements have been covered throughout (BL-003) |

### 8. Compatibility requirements

Brownfield constraints. Each one, if broken, breaks something **outside** the codebase. These bind
the restructure as firmly as any functional requirement.

| ID | Must not change | Why |
|---|---|---|
| CR-01 | Every public URL, byte for byte | Existing links, search indexing, any external embed |
| CR-02 | `/api/cron/refresh-news` | Hard-coded in `vercel.json`; ingestion stops **silently** if moved |
| CR-03 | The `articles` table shape | Live data exists; no migration tooling in place |
| CR-04 | Every `process.env` name | Set in the Vercel dashboard, outside version control |
| CR-05 | `proxy.ts` location and matcher semantics | Framework-pinned, and the sole authorisation boundary |
| CR-06 | `shared/config/imageDomains.ts` importable from `next.config.ts` | Evaluated at config-load time — must never import React or `server-only` |
| CR-07 | Sentry and instrumentation file locations | Framework conventions; silently inert if moved |
| CR-08 | Public GET on `/api/admin/breaking-news` | The homepage banner has no session and reads it directly |

### 9. Data model

| Table | Defined in | Status | Shape |
|---|---|---|---|
| `articles` | `database/schema.sql` | Committed | 15 columns. `article_id` unique. `category`/`country`/`category_mismatches` are `TEXT[]`. **Only `id`, `article_id`, `title`, `created_at` are NOT NULL** |
| `breaking_news` | comment in `backend/api/admin/breaking-news.ts` | **Not committed** | `id`, `text`, `is_active`, `expires_at`, `created_at` |
| `admin_logs` | comment in `backend/api/admin/logs.ts` | **Not committed** | `id`, `action`, `details`, `metadata` (JSONB), `created_at` |

The nullability of `link` and `pub_date` is the root of **BL-001**: `Article.link` and
`Article.pubDate` are required strings in TypeScript, so the row mapping relies on `any` to hide
unhandled nulls.

**Indexes.** Two exist (`created_at`, `article_id`). Queries also filter on `category`/`country`
(array containment — wants **GIN**) and `title`/`description` with `ILIKE '%…%'` (cannot use a
B-tree at all — wants **`pg_trgm`**). Not urgent at seven-day volume; a cliff as retention grows.

### 10. Integrations and failure behaviour

| Service | Purpose | On failure | Assessment |
|---|---|---|---|
| NewsData.io | Source of all articles | 5 built-in mock articles | Correct; the mock set is obviously synthetic |
| Supabase | Storage, 7-day window | Serves upstream, and says so | `/api/health` answers 503, and each fallback is reported to Sentry, rate-limited (D5). Was silent: DEF-01 |
| Upstash Redis | Shared cache | In-process `Map` | Correct, trade-off documented in code |
| Anthropic | Chat + classification | Chat 503; classifier fails open | Fail-open on classification is the right call |
| Google Translate | On-demand translation | Returns the original string | Unofficial endpoint — fine at this volume, not a foundation |
| Sentry | Error reporting | No-op without a DSN | Fine |

### 11. Known defects — NOT requirements

Behaviour that was a defect when found. Listed here so no future reader mistakes it for intent.
**Do not promote any of these into §6.** The Behaviour column describes the defect as found; Status
records what happened to it (statuses as in [`AUDIT-FINDINGS.md`](OPERATIONS.md#audit-ledger), 2026-11-02).

| ID | Behaviour | Severity | Status |
|---|---|---|---|
| DEF-01 | Every Supabase call fails; app silently serves upstream instead | **Critical** | Pending verification — reachable again; production check (F-002) |
| DEF-02 | Scraper follows up to 21 redirects, none re-validated — defeats the SSRF guard running immediately before it | **Critical** | Resolved `2e383cb`, `1145bca` |
| DEF-03 | Two of four publisher links render an unvalidated `targetUrl` from the query string. Branded phishing surface | High | Resolved `8d0b775` |
| DEF-04 | AI panel prints a canned "Key Takeaway" when the API fails, as if it were a real answer. `Chatbot.tsx` handles the same failure honestly | High | Resolved `86bdf78` |
| DEF-05 | `purgeOldArticles()` runs a DELETE on the feed read path | Medium | Resolved `2f31bad` |
| DEF-06 | Admin login unthrottled; password compare returns early on length mismatch, leaking length | High | Resolved `7eb9253` |
| DEF-07 | `breaking_news` and `admin_logs` exist only as SQL inside route-file comments | High | Pending verification — SQL in `db28a46`, to be applied |
| DEF-08 | Feed fetches 80 rows, filters in JS, slices to 40 — under-fills exactly when a spam source floods | Medium | Resolved `2e3fa0b` |
| DEF-09 | ~~Contact form and newsletter show success, send nothing.~~ **Resolved by removal** in `59b875d`: all three forms deleted — the contact form and **two** newsletter forms, footer and article sidebar (owner decision Q4). A real backend is future work, BL-005 | Medium | Resolved `59b875d` |
| DEF-10 | Scraper returns HTTP 200 with placeholder prose on failure; UI detects errors by string-matching three hard-coded sentences | Medium | Resolved `b7f6fbc` |
| DEF-11 | `next` 16.3.0 carries 13 advisories, four of them critical unauthenticated RCE; fixed in a non-major release (audit F-001) | **Critical** | Resolved `47e62ae` |
| DEF-12 | The feed search interpolates the raw query into a PostgREST `.or()` filter string — filter injection (audit F-006) | High | Pending verification — fixed `4b33611`, `614e514`; live probe |
| DEF-13 | `axios` 1.19.0 carries advisories including redirect-based SSRF and ReDoS (audit F-007) | High | Resolved `56e7509` |
| DEF-14 | `.env.local.example` documents `ADMIN_SECRET_TOKEN`, which no code reads, and omits `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`, which the code requires (audit F-009; README is already correct) | High | Resolved `10c8b47` |
| DEF-15 | No input size caps: translate `texts[]` (count and item length), chat `message`, scraper response size (audit F-010) | High | Resolved `58c7f7d` |
| DEF-16 | The public scraper, which makes arbitrary outbound requests, has no rate limit (audit F-011) | High | Resolved `3b63a37`, `988c7fa` |
| DEF-17 | Admin purge and sync show a success message from their `catch` blocks, and nothing when `!res.ok` (audit F-014) | Medium | Resolved `5997567` |
| DEF-18 | Two indexes for seven filtered columns: array `.contains()` wants GIN, `ILIKE '%x%'` wants `pg_trgm` (audit F-018) | Medium | Pending verification — migration in `4898da4`, to be applied |
| DEF-19 | The in-memory rate limiter never evicts keys — unbounded memory growth (audit F-020) | Medium | Resolved `b44203d` |
| DEF-20 | The home feed starts overlapping fetches with no `AbortController` or sequence guard; a stale response can overwrite a fresh one (audit F-021) | Medium | Resolved `9ce42bc` |
| DEF-21 | Article page title is doubled: `… \| TimesPrime News \| TimesPrime News` (audit F-022) | Low | Resolved `ef510f9` |
| DEF-22 | `translateHeadline()` ignores its `lang` argument yet runs on every card title and description (audit F-024) | Low | Resolved `3de9a1e` |
| DEF-23 | Node version drift: `.node-version` and CI use 20, the local runtime is 24, `package.json` has no `engines`, Vercel's version is unconfirmed (audit F-026) | Low | Pending verification — Vercel's Node setting (`974b255`) |
| DEF-24 | The chat drawer has no dark mode (audit F-027) | Low | Resolved `7ead49b` |
| DEF-25 | Theme flash on load: the theme is read from `localStorage` in an effect, after first paint (audit F-028) | Low | Partial `5ad891a` — `isDark` ternaries remain, BL-028 |

**Audit cross-reference.** The 2026-10-29 audit (F-001..F-028, at commit `0e7f1f7`) maps onto this
register as: DEF-01 = F-002, DEF-02 = F-003, DEF-03 = F-005, DEF-04 = F-013, DEF-05 = F-015,
DEF-06 = F-004, DEF-07 = F-008, DEF-08 = F-016, DEF-09 = F-012, DEF-10 = F-017; DEF-11..25 were
added from the audit and name their F-ID inline. F-019, F-023 and F-025 were resolved before they
were registered and have no DEF. Status per finding, with today's code locations:
[`AUDIT-FINDINGS.md`](OPERATIONS.md#audit-ledger). The audit rates F-003 High and F-013 Medium; this register
rates DEF-02 Critical and DEF-04 High — both ratings are kept, and the ledger notes the difference.

**Refuted — do not re-report.** A `javascript:` URL XSS via `targetUrl` was suspected and
**disproven**: React 19 blocks it, rendering
`href="javascript:throw new Error('React has blocked a javascript: URL…')"`. The *phishing* half
(DEF-03) is real; the XSS half is not.

**Dependencies.** At the audit, `npm audit` reported 2 critical and 9 high, including four critical
unauthenticated-RCE advisories in `next` 16.3.0. Phase 1 cleared them: `next` 16.4.3 (`47e62ae`), axios
(`56e7509`), @sentry/nextjs (`31f4a54`) and transitive packages (`5970692`). On 2026-11-02 there are
0 critical and 0 high: 34 moderate (`glob` and `minimatch`, published since, in dev and build tooling;
the only fixes are major-version changes) and 3 low (the accepted jest set). The AVIF and SVG RCE
paths were refuted (`formats` defaults to webp-only, `dangerouslyAllowSVG` is false). Sentry's
`tunnelRoute` is not set and must never be enabled: all authorization lives in `proxy.ts`.

### 12. Owner decisions (2026-10-29)

The five questions that blocked sign-off, answered. **None remain open.**

| # | Question | Decision | Landed in |
|---|---|---|---|
| Q1 | Is the paraphraser deliberate? | **Delete.** Rewriting headlines through a synonym table can change a story's meaning with no human review. Headlines and article text are shown as the source published them | `3805007` |
| Q2 | Does RSS return? | **Delete.** `rssParser.ts` and the 503 route removed. This changed the route table (27 → 26); `_baseline-routes.txt` was updated in the same commit | `bcd5393` |
| Q3 | Is editorial publishing a real workflow? | **Keep.** It moves with the admin feature like any other file. The hardcoded `country: ["us"]` and the filter bypass are logged, **not** fixed during the restructure | BL-004 |
| Q4 | What is the intended contact path? | **Remove both UIs.** Showing "Message Sent!" while sending nothing is worse than no form. The `/contact` page remains, listing email addresses | `59b875d`, BL-005 |
| Q5 | Languages beyond EN/HI? | **EN/HI is the scope.** Recorded as an explicit non-goal in §3, so nobody treats the discard as a bug | §3 |

None of these were functional requirements: §6 never contained an FR for the paraphraser, RSS, or
the contact and newsletter forms. They were open questions and, for the forms, defect DEF-09 — so
recording the decisions required no change to the FR set.

One follow-up the decisions created: removing the newsletter and contact form left the privacy
policy describing collection that no longer happens. That is legal copy, flagged for owner or legal
review as BL-008.

### 13. Success metrics

| Metric | Target | Why this number |
|---|---|---|
| Reader requests served without an upstream call | ≥ 95% | The storage tier exists for this. ~0% while Supabase failed; unmeasured since (production) |
| Upstream calls per day | ≤ 350 | 7 categories × 48 cron runs, plus headroom |
| Feed items surviving the filter pipeline | 30–40 per category | Below 30 suggests over-filtering (DEF-08) |
| Scrape success (real text, not fallback copy) | ≥ 85% | Measured ~96% in a 120-URL sample |
| Statement coverage, non-UI modules | ≥ 60% | 61.51% on 2026-11-02 (`backend/` and `shared/`), from 3.62% |
| Critical/high dependency advisories | 0 | 0 on 2026-11-02, from 2 critical and 9 high |

### 14. Appendix — environment variables

Moved to [Environment variables in OPERATIONS.md](OPERATIONS.md#environment-variables) in
restructure 3 (2026-11-03), merged with the README's table of the same variables.

## System design

**Structure:** one Next.js app in four top-level folders. `frontend/` is the Next.js root: the UI,
and `app/`, the routing shell. `backend/` holds the server code, with `backend/shared/` for what
both sides import; `database/` holds the SQL; `docs/` the four documents. An import boundary
between them fails CI when it is broken. Decided in restructure 2
([ADR 0002](ARCHITECTURE.md#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-in-part-by-0004), 2026-10-30), which superseded the
feature-first `src/` layout of [ADR 0001](ARCHITECTURE.md#adr-0001--feature-first-structure-with-layer-separation-and-a-ci-enforced-boundary-2026-10-30-superseded-by-0002), and moved into four
folders in restructure 3 ([ADR 0004](#adr-0004--four-top-level-folders-four-documents),
2026-11-03). Where new code goes: [the README](README.md#where-new-code-goes).

---

### 1. How the system works today

Three independent flows, each with its own failure posture.

```
INGEST ─ every 30 minutes, Vercel cron
  /api/cron/refresh-news  [Bearer CRON_SECRET, fails closed if unset]
    → NewsData.io, one request per category, sequential (bursts get throttled)
    → reject: hard-paywall domains · horoscope/tarot filler · wire-spam
              · non-news listing sources
    → upsert into Supabase on article_id
    → fire-and-forget: Claude Haiku flags category tags that do not fit
  code: backend/api/cron/refresh-news.ts → backend/services/news
        → backend/repositories/db.ts → backend/services/classify

SERVE ─ per reader request
  /api/news/top-headlines
    1. Redis cache        15 min TTL                 → X-Data-Source: cache
    2. Supabase           newest row < 30 min old    → supabase
    3. NewsData.io        live call                  → newsdata
    4. MOCK_ARTICLES      built-in fallback          → mock
  Each tier degrades to the next without an error to the reader. The header
  says which tier answered; a Supabase → NewsData fallback is also reported
  to Sentry, rate-limited, and /api/health reports whether Supabase answers.
  code: backend/api/news/top-headlines.ts → backend/lib/cache, backend/services/news

AUTHORISE ─ every admin request
  frontend/proxy.ts   matcher: /admin/*, /api/admin/*
    public:          /admin/login, /api/admin/login, /api/admin/logout
    public GET only: /api/admin/breaking-news   (homepage banner, no session)
    otherwise:       HMAC-SHA256 cookie, 12 h, httpOnly, SameSite=Lax
  No route handler performs its own auth check.
  code: frontend/proxy.ts → backend/auth/adminSession.ts
```

**Authorisation is a single choke point.** That is a good design — one place to audit, one place to
change — but it means any route added outside the proxy matcher is silently public, and the matcher
has no test. Keep this property visible; do not scatter it.

### 2. Framework constraints

Fixed by Next.js 16. These are not design choices, and three of them have already caused wrong
conclusions (see [the gotchas](OPERATIONS.md#3-gotchas-that-have-already-burned-time)).

- Files under `frontend/app/**` named `page`, `layout`, `route`, `loading` or `error` **are** the routing
  table. Their path **is** the URL. Route groups `(name)` reorganise without changing a URL;
  private folders `_name` opt out of routing entirely. This is why `app/` stays a shell (§4).
- `frontend/proxy.ts`, at the Next.js root beside `app/`, is the Proxy entrypoint — Next 16's rename of Middleware.
  Location-pinned.
- `instrumentation.ts`, `instrumentation-client.ts`, `sentry.server.config.ts` and
  `sentry.edge.config.ts`, also at the Next.js root (`frontend/`), are location-pinned conventions. Silently inert if
  moved.
- `next.config.ts` imports `ALLOWED_IMAGE_HOSTNAMES` from `backend/shared/config/imageDomains.ts` and
  evaluates it at **config-load time**. That module imports nothing (CR-06).
- `images.remotePatterns` hostnames are matched with **picomatch globs**, not string equality, and
  the array is capped at **50 entries**. 49 are used.
- `frontend/vercel.json` pins the cron to `/api/cron/refresh-news`.
- `frontend/` is the Next.js root, and Next and Jest run there: the `next.config.ts` loader
  resolves the config's relative imports against the working directory
  ([gotcha 3.20](OPERATIONS.md#320-nextjs-and-jest-run-in-frontend-not-at-the-root)). Turbopack's
  root and the tracing root are the repository root, so `app/` can import `backend/`.

> Next.js is explicitly **unopinionated** about project organisation. Its own documentation presents
> three strategies and concludes: *"choose a strategy that works for you and your team and be
> consistent across the project."* The structure below is a team decision, not a framework mandate.

### 3. How the structure got here

Three restructures, each recorded in an ADR with the alternatives it rejected.

- **Restructure 1** (Phases A–E, [ADR 0001](ARCHITECTURE.md#adr-0001--feature-first-structure-with-layer-separation-and-a-ci-enforced-boundary-2026-10-30-superseded-by-0002)). `src/lib/` was
  a folder named after the absence of a decision: data access, security primitives, infrastructure,
  domain logic, static data and i18n side by side, and nothing stopped a React component from
  importing a Supabase client. One did. `ActivityLog.tsx`, a client component, imported the audit
  logger for two constants and pulled the whole Supabase SDK into `/admin`'s browser bundle (fixed
  in `b01d528`). Restructure 1 grouped code by feature under `src/features/`, defined the shared
  layers, and made the import rules fail CI.
- **Restructure 2** (S0–S5, [ADR 0002](ARCHITECTURE.md#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-in-part-by-0004)). The owner's
  reviewer asked for frontend, backend, database and documentation to be visibly separate. The App
  Router fixes where route files live (§2), so `app/` became a shell. Its route and page files
  re-export bodies that live in `backend/api/` and `frontend/views/`. Dead code went first (S1), so
  only code in use moved: 95 files in 11 slices. Every slice was gated on an identical route table
  and byte-identical CSS. Client JS changed by 35 bytes in total (974,032 → 974,067; `/` +50). The
  import rules were rewritten for the new layers in S4.

- **Restructure 3** (S0–S3, [ADR 0004](#adr-0004--four-top-level-folders-four-documents),
  2026-11-03). The owner asked for four top-level folders and four documents. `frontend/` became
  the Next.js root, holding `app/` and the framework's root files; `shared/` and `scripts/` moved
  into `backend/`; thirteen Markdown files were merged into four. Every slice was gated on an
  identical route table and segment config, byte-identical CSS and +0 bytes of client JS on every
  route.

### 4. Layout

```
frontend/                  the Next.js root, and the UI
  app/                     the routing shell: URLs, the root layout, and re-exports
    api/**/route.ts        one line each, e.g.  export { GET } from "@/backend/api/health";
    <page>/page.tsx        one line each, e.g.  export { default, metadata } from "@/frontend/views/about/AboutView";
    page.tsx               composition: fetches the first page of the feed, renders HomeClient
    article/[slug]/page.tsx  composition: fetches the article and suggestions, renders ArticleDetailView
    layout.tsx, loading.tsx
  views/<page>/            page bodies: home, article, saved, admin, about, contact, privacy, terms
  features/<feature>/      UI a feature owns: news, admin, chat, each behind its index.ts
  components/ui/           presentational primitives: ThemeSpinner, NewsSkeletonGrid
  context/                 app-wide state providers: ThemeContext, LanguageContext
  styles/                  globals.css (Tailwind v4)
  public/                  favicon and logos
  proxy.ts                 admin authorisation, the first gate (§1)
  instrumentation.ts · instrumentation-client.ts · sentry.*.config.ts    Sentry wiring, pinned beside app/
  next.config.ts · vercel.json · tsconfig.json · eslint.config.mjs · jest.config.ts · postcss.config.mjs
  .env.example · .env.test (committed) · .env (the owner's, git-ignored)
backend/                   server-only: every module opens with import "server-only"
  api/                     route bodies, one per route: parse, check the permission, delegate, serialise
  services/<service>/      domain logic: news (behind its index.ts), classify, health, scrape, translate
  repositories/            data access: db.ts (articles), auditLog.ts (audit_log), staff.ts (staff records)
  auth/                    the admin session, the staff session and the server-side permission check
  lib/                     domain-free infrastructure: cache, likePattern, rateLimit, readJsonBody,
                           reportFallback, supabase
  shared/                  imported by both sides; imports neither; not server-only
    config/                static data and the editorial rules both sides apply: imageDomains,
                           categoryColors, topicImages, translations, newsConfig, permissions, theme
    types/                 types both sides use (Article, …)
    validation/            urlValidation, sentryScrub: checks every runtime runs
  scripts/                 repo tooling, run by Node: check-boundaries, check-docs, shims,
                           generate-access-catalog, baseline-routes.txt (the built route table)
database/                  schema.sql, policies.sql, migrations/, bootstrap/, seed/: applied by hand, imported by nothing
docs/                      the four documents
```

`frontend/` is the Next.js root: `app/`, `public/`, `proxy.ts`, the instrumentation files and the
env files must sit together there (§2). `backend/shared/` is the old top-level `shared/`, moved in
restructure 3 so that the repository has four top-level folders; its rules did not change (S1, R7,
CR-06).

#### Why `app/` is a shell

In the App Router a route file's path is its URL, so route and page files cannot move into
`backend/` or `frontend/` without breaking every public URL (CR-01), the cron contract (CR-02) and
the proxy matcher (CR-05). Restructure 1 concluded from this that a top-level `backend/` folder would
take a rewrite. Restructure 2 kept every URL a different way: the route file stays where it is,
holds a single re-export, and its body moves. `frontend/app/api/health/route.ts` is one line,
`export { GET } from "@/backend/api/health";`. The route table and segment config came out
identical, and the client JS within 35 bytes.

Two pages stay in `app/` as composition, because they combine backend data with a view, and
splitting the fetch from the markup would be a logic change (the page rule, ADR 0002):

- `frontend/app/page.tsx` calls `fetchInitialNews` and renders `HomeClient`.
- `frontend/app/article/[slug]/page.tsx` fetches the scraped article and the suggestions, over HTTP from its
  own API (BL-016), and renders `ArticleDetailView`.

A two-app split, with a separate API service, was rejected (ADR 0002). Every API URL, the Vercel
cron and the proxy's cookie auth would change, and deployments would double.

### 5. Import rules

These are the rules a reviewer may cite in a pull request, by ID. Every rule an import can break
fails both `npm run lint` (`frontend/eslint.config.mjs`) and `npm run check:boundaries`
(`backend/scripts/check-boundaries.mjs`), both part of `npm run verify` and CI, with the rule's ID
at the start of the message. Lint uses `import/no-restricted-paths` zones, which judge the resolved
path, so a relative import is caught like an alias, plus three local rules. Each rule was proven in
restructure 2 (S4) by a deliberate violation that failed with its message, then passed once removed,
and proven again for the new paths in restructure 3.

| ID | Rule | Lint | `check:boundaries` |
|---|---|---|---|
| F1 | `frontend/` outside `app/` never imports `backend/`, except `backend/shared/`; the client bundle never reaches `backend/` | zone; `boundaries/no-server-in-client` for a `"use client"` module in `frontend/app/`; `boundaries/server-only-first`: every `backend/` module (not `backend/shared/`) opens with `import "server-only"`, so a client import of it fails `next build` | direct imports, and the client-bundle closure (transitive) |
| B1 | `backend/` never imports `frontend/` | zone | yes |
| S1 | `backend/shared/` imports nothing from `frontend/`, the rest of `backend/`, or `app/` | zone (`app/` reports as A1) | yes |
| A1 | `frontend/app/` is the only place frontend and backend meet. It may import `frontend/`, `backend/shared/`, `backend/api/` and the two entry points the composition pages fetch through (`backend/services/news`, `backend/services/scrape/scrapeArticle`), and nothing else in `backend/`. Nothing outside `frontend/app/` imports it; `instrumentation-client.ts` (browser) never imports `backend/` (except `backend/shared/`); `instrumentation.ts` and `sentry.*.config.ts` (server) never import the UI in `frontend/` | zones | yes |
| A2 | Every `frontend/app/**/route.ts`, and every `page.tsx` except the composition pages (`COMPOSITION_PAGES` in `backend/scripts/shims.mjs`), holds only re-exports and literal segment config | `boundaries/shim-only` | yes; and every URL in the built route table (`backend/scripts/baseline-routes.txt`) still has its `page.tsx` or `route.ts`, which lint cannot see |
| P1 | `frontend/proxy.ts` imports only `backend/auth` and `backend/shared/` | zones | yes |
| D1 | Nothing imports `database/` | zone | yes |
| X1 | No imports between features (`frontend/features/*`) or between services (`backend/services/*`). From outside, a feature is reached only through its `index.ts`, and so is a service that has one (`news`) | zones, generated from the folders on disk | yes |
| V1 | `frontend/features/**` never imports `frontend/views/**` | zone | yes |

Carried over from restructure 1, for the new paths:

| ID | Rule | Lint | `check:boundaries` |
|---|---|---|---|
| R3 | `frontend/components/ui` and `frontend/context` never import features or views | zone | yes |
| R5 | `ui` imports only `ui/`, `backend/shared/types`, `backend/shared/validation` and `ThemeContext` | zones | yes |
| R9 | `frontend/context` imports only `backend/shared/config` and `backend/shared/types` | zone | yes |
| R7 | `backend/shared/config` imports only `backend/shared/config` and `backend/shared/types`, with no React and no `server-only`; `backend/shared/types` imports only `backend/shared/types` | zones, and `no-restricted-imports` for the packages | yes, for project imports |
| LIB | `backend/lib` imports no project module | zone | yes |
| CR-06 | `frontend/next.config.ts` imports only `backend/shared/config`; `backend/shared/config/imageDomains.ts` imports nothing | zones, and `no-restricted-imports` | yes |

Both tools exempt colocated tests from the X1 entry points, R5, R9, R7 and LIB: a test may import
its own subject. Where two rules match one import, both report the first in this order: D1, A1,
F1, B1, S1, P1, CR-06, X1, V1, R3, R5, R9, R7, LIB.

**What restructure 3 changed** ([ADR 0004](#adr-0004--four-top-level-folders-four-documents)).
`shared/` became `backend/shared/`: the zones that bar `backend/` (F1, A1's browser file, S1, P1,
CR-06) except `backend/shared/`, so it keeps its meaning. A1 now names what `app/` may take from
`backend/` instead of allowing all of it. A2 is read from disk, every page but the listed
composition pages, so a new page is held to it the day it is created (BL-032); before, it covered
only the pages restructure 2 had moved. `backend/scripts/shims.mjs` is the one list: lint, the
checker and Jest's coverage exclusions read it.

#### Why each rule exists

- **F1, B1, S1: the two sides stay apart.** A client bundle that reaches backend code ships server
  code to every reader. In restructure 1 that is how the Supabase SDK reached `/admin`'s browser
  chunk: `supabase.ts` calls `createClient()` at module scope, and no bundler can tree-shake that.
  F1 is therefore checked three ways: lint on each import, `check:boundaries` on the transitive
  client-bundle closure, and `import "server-only"` at the top of every backend module, which turns
  a client import into a build error (Next.js 16 docs, "Preventing environment poisoning"). *Seen to
  work* (`19d255c`): a temporary `import "@/backend/lib/cache"` in a client component failed
  `next build` with "'server-only' cannot be imported from a Client Component module"; without the
  guard the same build passed. `frontend/proxy.ts` imports the server-only `backend/auth/adminSession.ts`,
  which is valid: Proxy runs on the Node.js runtime by default (`proxy.md`, "Runtime"). Shared code
  is imported by both sides, so it can depend on neither (S1).
- **A1, A2: `app/` is the shell.** Frontend and backend meet only in `app/`, the top of the graph.
  If anything else imported `app/`, it would reach both sides through it. The root files Next pins
  in place keep to the side of the runtime they load in. A route file, and a page whose body moved,
  holds only re-exports and literal segment config, so no logic hides in the URL contract.
- **P1: one choke point.** Authorisation lives in `proxy.ts` (§1). What it needs lives in
  `backend/auth`, and it needs nothing else.
- **D1: the database folder is for people.** `database/` holds the SQL and the seed script, which
  the owner applies by hand. No code depends on them.
- **X1: features and services stay independent.** Nothing imports sideways. If two features (or two
  services) need the same thing, it moves down a layer; it does not get imported sideways. Sideways
  imports are how a layered structure collapses back into the thing it replaced, usually within a
  quarter and always one reasonable-looking import at a time. Documentation does not prevent this;
  a linter does. Entry points are covered below.
- **V1: features never import views.** A view composes features through their entry points, so a
  feature that imports or re-exports a view closes a cycle. Slice 9 found one (view → news entry →
  view), removed in `4460a40`.
- **R3, R5, R9: the frontend's lower layers.** `components/ui` and `context` sit below features and
  views. A UI primitive must not know what an `Article` is. It may read the theme, because light
  and dark are appearance, which is exactly what a primitive owns. Language, UI strings and
  category data are app state or product knowledge, so `LanguageContext` and `backend/shared/config` are
  off-limits (owner decision, Phase D; confirmed in S4). Footer is why the rule exists: it read
  both and rendered category links, which a plain "downward is fine" rule could not catch. The
  providers in `context` import only the config and types they hold (see §6).
- **R7, CR-06: static data.** `backend/shared/config` holds static data and the editorial rules both sides
  apply. It may import other config and types, but no React, no `server-only`, and no code from
  either side. `imageDomains.ts` imports nothing at all, because `next.config.ts` evaluates it at
  config-load time. *Refined in restructure 1:* the first draft said "config imports nothing",
  which `topicImages.ts → imageDomains.ts` already contradicted.
- **LIB: `backend/lib` is domain-free** (§6).

#### Feature entry points and `sideEffects`

Each `frontend/features/<feature>/` folder has an `index.ts`, its entry point, and a `package.json`
with `"sideEffects": false`. Without that field a barrel is not free. When a server component (the
root layout, any server page) imports one export from a barrel of client components, every client
component the barrel re-exports becomes a client entry of that route. Restructure 1 measured +46 KB
on `/` (+36%) when the root layout imported one banner from an unmarked barrel. Restructure 2
measured it again, with the field removed: every route got heavier, by +457 bytes to +84,579 bytes.
Marking the folder side-effect-free lets the bundler drop unused re-exports. So nothing in a feature
may rely on an import made only for its side effects (a CSS file, a polyfill); those belong in
`app/`. The Next 16 docs make the same point from the other side: barrels slow builds, so import
from specific files where possible (`local-development.md`, "Barrel files"). Routing views through
the entry point cost 109 bytes of client JS on `/`, which the owner accepted (ADR 0002).

#### What lint cannot see, and what covers it

- **F1, transitively.** Lint checks each import as written. A client module that imports a plain
  module that imports `backend/` is caught twice more: `import "server-only"` fails `next build`,
  and `check:boundaries` walks the client-bundle closure before the build runs.
- **A shim that has gone missing.** A file that does not exist cannot be linted.
  `check:boundaries` reports a route-table URL whose `frontend/app/` file is gone.
- **What code does.** Route bodies in `backend/api/` parse input, delegate and serialise output;
  extraction heuristics, SQL and filter logic belong in a service or a repository, where they can be
  tested without constructing an HTTP request. Review enforces this. *Target state:* today
  `backend/api/news/scrape-article.ts` and `backend/api/news/top-headlines.ts` still carry logic
  inline. Extracting it is behaviour-preserving work for later, behind characterization tests.

#### Path aliases

`@/frontend/*` and `@/backend/*` (`frontend/tsconfig.json`), one per side and no catch-all, so
every import names its side (the `@/*` catch-all was removed in `d6bd8b5`, and `@/shared/*` in
restructure 3: `backend/shared/` is `@/backend/shared/*`). `database/` has no alias, because nothing
may import it (D1); nothing outside `frontend/app/` may import that folder either (A1). Jest mirrors
the two in `moduleNameMapper`; `check:boundaries` reads them from `frontend/tsconfig.json`.

### 6. Module responsibilities

| Module | Owns | Must never |
|---|---|---|
| `frontend/app/` | URLs; the root layout and loading UI; one-line re-exports; the two composition pages | Hold logic in a route file (A2); be imported (A1) |
| `frontend/views/` | One page body per page | Be imported by a feature (V1) |
| `frontend/features/news/` | Feed cards, masthead and footer, category menu, ticker, breaking-news banner, saved-article store | Import another feature or a view; be reached past its `index.ts` (X1, V1) |
| `frontend/features/admin/` | The operator dashboard: articles table, breaking-news manager, sync controls, stats, activity log | The same |
| `frontend/features/chat/` | The assistant: the chat widget and the floating panel | Import from the news feature (X1); article context reaches it as data, not as an import |
| `frontend/components/ui/` | Presentational primitives; may read the theme, no other app state | Import a feature, a view, `backend/shared/config` or `LanguageContext` (R3, R5) |
| `frontend/context/` | App-wide providers: theme (light/dark) and language (EN/HI), each persisted to `localStorage` | Import anything but `backend/shared/config` and `backend/shared/types` (R9); hold feature state |
| `backend/api/` | One route body per route: parse, delegate, serialise | Be imported by frontend code (F1) |
| `backend/services/` | Domain logic: news ingestion and the feed (`news`, behind `index.ts`), category classification, health, translation | Import another service (X1) |
| `backend/repositories/` | Supabase queries: articles (`db.ts`) and the audit log (`auditLog.ts`) | Be imported by frontend code (F1) |
| `backend/auth/` | Issuing and verifying the admin session cookie | Be imported by frontend code (F1) |
| `backend/lib/` | Domain-free infrastructure | Import any project module (LIB) |
| `backend/shared/config/` | Static data: allowlists, colour maps, topic images, UI strings, the editorial filters | Import anything but config and types, or React, or `server-only` (R7); `imageDomains.ts` imports nothing (CR-06) |
| `backend/shared/types/` | Types both sides use | Import anything but types (R7) |
| `backend/shared/validation/` | Checks every runtime runs: `sentryScrub` | Import `frontend/`, `backend/` or `app/` (S1) |
| `database/` | The schema, the RLS policies and the seed script, applied by hand | Be imported by code (D1) |

#### What `backend/lib/` means

`backend/lib/` is **cross-cutting and domain-free**: a module belongs there only if it knows no
product concept — no `Article`, no category, no editorial rule, no UI string. Restructure 1 kept the
definition rather than loosening it to fit what happened to live in `lib/`: `bookmarks.ts`, which
stores `Article` objects, went to the news feature, and `translations.ts`, which holds product copy,
went to config.

**Checkable**, and enforced as LIB: `backend/lib/` holds `cache`, `rateLimit`, `reportFallback`,
`supabase` and `urlValidation`, and **none of them imports a project module**. `cache` imports
`@upstash/redis`, `reportFallback` imports `@sentry/nextjs`, `supabase` imports
`@supabase/supabase-js`, `urlValidation` imports `dns/promises` and `net`, and `rateLimit` imports
nothing. A `lib/` module that needs a project import has picked up a domain and belongs in a service
or a repository. `urlValidation` moves to `backend/shared/validation/` with audit finding F-005, split at
its DNS step, which cannot run in the browser ([BACKLOG](OPERATIONS.md#backlog) BL-015).

#### What `frontend/context/` means

`frontend/components/ui/` is presentational primitives with no domain knowledge. A provider that
owns app state does not fit it, so **both providers live in `frontend/context/`**, a layer of
app-wide state providers importing only `backend/shared/config` and `backend/shared/types` (R9). `LanguageContext`
holds the `"en" | "hi"` choice and imports the `Language` type from `backend/shared/config/translations.ts`;
`ThemeContext` holds light/dark, persists it, and sets classes on `document`. Both stay together,
because the same objection applies to both.

### 7. Decision records

Every decision record, with the alternatives it rejected, is in [Decisions](#decisions) below: ADR
0004 (accepted: this layout), ADR 0003 (accepted), ADR 0002 (accepted; its layout superseded by
0004, its rules carried over) and ADR 0001 (superseded by 0002).

## Data model

The tables, what they hold, and where their SQL lives. The product view of the same model, with the
requirements that read and write each column, is [§9 of the product requirements](ARCHITECTURE.md#9-data-model);
the Panel 0 tables (staff, roles, permissions, assignments, the audit log) are designed in
[Panel 0's design](PANEL_DOCS.md#1-data-model) and created by
`database/migrations/2026-11-02-access-1-foundation.sql` and `-access-2-catalog.sql`.

None of the SQL is applied by the app or its tooling. The owner applies each file from
[the runbook](OPERATIONS.md#runbook-apply-the-database-files), and verifies it there; each file has a rollback.

### Tables and files

`database/schema.sql` defines all three tables, `IF NOT EXISTS`, with RLS enabled:
- `articles`: 15 columns, `article_id` unique, `category`/`country`/`category_mismatches` are `TEXT[]`.
  Only `id`, `article_id`, `title` and `created_at` are NOT NULL (the root of BL-001).
- `breaking_news` and `admin_logs`, committed in `db28a46` (F-008); their nullable columns are BL-024.

Policies and grants are in `database/policies.sql`. Indexes: `created_at` and `article_id` in the
schema; GIN on `category`/`country`, trigram on `title`/`description`, and `link` in
`database/migrations/2026-11-02-indexes.sql`. None of it is applied by the app: the owner applies it
([the go-live checklist](OPERATIONS.md#go-live-checklist)).

## Decisions

One record per significant structural decision, numbered and dated. A record is not edited once
accepted: a superseded record keeps its text, is marked in its heading, and a later record links
back, so the reasoning trail survives. Until 2026-11-03 each record was its own file in
`docs/adr/`; restructure 3 brought them here, unchanged but for their heading level and links.

Each record carries:

- **Status**: Proposed · Accepted · Superseded by NNNN
- **Context**: the forces in play, including constraints that were not chosen
- **Decision**: what was decided, in the active voice
- **Alternatives rejected**, and specifically why. This is the part future readers come back for; a
  decision without its discarded options reads as arbitrary.
- **Consequences**: what this makes easy, and what it makes harder

| Record | Decision | Date | Status |
|---|---|---|---|
| [ADR 0001](#adr-0001--feature-first-structure-with-layer-separation-and-a-ci-enforced-boundary-2026-10-30-superseded-by-0002) | Feature-first `src/` layout with layer separation and a CI-enforced boundary (restructure 1) | 2026-10-30 | Superseded by 0002 |
| [ADR 0002](#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-in-part-by-0004) | One Next.js app split into `app/`, `frontend/`, `backend/`, `shared/` and `database/`, with rules F1–X1 and V1 (restructure 2) | 2026-10-30 | Accepted; its layout superseded by 0004, its rules carried over |
| [ADR 0003](#adr-0003--an-articles-section-for-permission-scope-is-its-first-category-2026-11-02) | For permission scope, an article's section is `category[0]` (Panel 0) | 2026-11-02 | Accepted |
| [ADR 0004](#adr-0004--four-top-level-folders-four-documents) | Four top-level folders (`frontend/` as the Next.js root, `backend/` with `shared/` inside), four Markdown files, `.env` (restructure 3) | 2026-11-03 | Accepted |

The owner's product, structure and audit decisions are recorded in [Owner decisions](#owner-decisions)
below, and the product decisions of 2026-10-29 in full in
[§12 of the product requirements](ARCHITECTURE.md#12-owner-decisions-2026-10-29).

### Owner decisions

**Product (2026-10-29), all five answered.** Full rationale in `docs/PRD.md` §12.

| # | Decision | Where |
|---|---|---|
| Q1 | **Paraphraser: deleted.** Headlines shown as the source published them | `3805007` |
| Q2 | **RSS: deleted**, including the 503 route. Route table 27 → 26 | `bcd5393` |
| Q3 | **Editorial publishing: kept.** Lives in the admin feature. `country: ["us"]` and the filter bypass logged, not fixed | BL-004 |
| Q4 | **Contact form and newsletter: UIs removed.** `/contact` page kept, listing emails | `59b875d`, BL-005 |
| Q5 | **EN/HI is the scope.** An explicit non-goal in the PRD, so the discard is not treated as a bug | PRD §3 |

**Structure (restructure 2):** one app with a separated layout, not a two-app split (ADR 0002).
Pages that combine backend data with a view stay in `app/`. Views reach features only through their
entry points, at a measured 109 bytes. Features never import views (V1). R5 keeps `shared/config`
out of UI primitives. Each decision is in ADR 0002 and in the commit that applied it.

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
  `tunnelRoute` must never be enabled: all authorization lives in `proxy.ts`.

**Follow-up the product decisions created:** the privacy policy still describes newsletter and
contact-form collection that no longer happens. Legal copy, for the owner or legal review (BL-008).

### ADR 0001 — Feature-first structure with layer separation and a CI-enforced boundary (2026-10-30, superseded by 0002)

**Status:** **Superseded by [ADR 0002](ARCHITECTURE.md#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-in-part-by-0004)** — 2026-10-30.
Restructure 2 replaced this layout with `app/`, `frontend/`, `backend/`, `shared/` and `database/`.
The lessons listed in ADR 0002's "Carried over from ADR 0001" still apply. The text below is kept as
it was written, so its paths are restructure 1's (`src/…`). The import rules it refers to
(architecture.md rules 1–8, and their Phase E enforcement table) were last in
[`architecture.md` at `623b918`](https://github.com/Adarsh-Pandey-25/TimesPrime/blob/623b918/docs/architecture.md#5-import-rules).
Before that: **Accepted** — 2026-10-30, owner approval of Phase C, with conditions applied: a split
criterion for `features/news`, route groups recorded as deferred, `lib/` kept domain-free, and a
`server-only` guard on every `server.ts`.
**Supersedes:** nothing. **Related:** [`architecture.md`](ARCHITECTURE.md#system-design),
`scripts/move-map.mjs`.

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
- The rules are written in [`architecture.md`](ARCHITECTURE.md#system-design) §5 and enforced in CI in Phase E.

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

### ADR 0002 — Frontend, backend, shared and database separation in one Next.js app (2026-10-30, superseded in part by 0004)

**Status:** **Accepted** — 2026-10-30, owner approval at the S4 review. Written as a draft during
restructure 2, recording each decision as it was taken, and finalized in S5.
**Supersedes:** [ADR 0001](ARCHITECTURE.md#adr-0001--feature-first-structure-with-layer-separation-and-a-ci-enforced-boundary-2026-10-30-superseded-by-0002)'s layout; its other lessons carry over
(below). **Related:** [`architecture.md`](ARCHITECTURE.md#system-design) (the layout and the rules, in prose),
`scripts/move-map.mjs` (where every file went, and each slice's
checklist), `scripts/check-move-map.mjs` (the rules below).

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
([`architecture.md`](ARCHITECTURE.md#system-design) §5 says where each is enforced):

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
  [`CONTRIBUTING.md`](README.md#where-new-code-goes) says which file goes where.
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
**Related:** [`PANEL_PLAN.md`](PANEL_DOCS.md#panel-plan) ("Generic roles, scoped by language desk and
section"), [`design/panel-0-access-foundation.md`](PANEL_DOCS.md#panel-0-design-the-access-foundation-approved-2026-11-02) §3,
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

### ADR 0004 — Four top-level folders, four documents

**Status:** **Accepted** — 2026-11-03, owner approval of the restructure-3 design (S0), with seven
decisions. Built on `chore/four-folders`, branched from `release/v1`.
**Supersedes in part:** [ADR 0002](#adr-0002--frontend-backend-shared-and-database-separation-in-one-nextjs-app-2026-10-30-superseded-in-part-by-0004)'s
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
