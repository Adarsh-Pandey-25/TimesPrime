# TimesPrime — Product Requirements Document

**Type:** brownfield / reverse-engineered · **Baseline:** commit `506a4ab`, branch `main`, updated
through `59b875d` to record the owner decisions in §12 · **Updated:** 2026-10-29; code citations
moved to the restructure-2 layout on 2026-10-30 (statuses unchanged)

This document describes what TimesPrime **does**, not what anyone intended it to do. Every
functional requirement cites the code implementing it; a requirement with no citation is marked
`Planned` and is a wish, not a description.

> **Why §11 exists.** A reverse-engineered PRD has a known failure mode: it reads the code, finds a
> behaviour, and writes it down as a requirement — including behaviours that are defects. Once a bug
> is printed in a requirements document it becomes extremely hard to remove, because every later
> reader assumes it was intended. Ten such behaviours are quarantined in §11 and are **not**
> requirements.

---

## 1. Overview

TimesPrime aggregates news from a commercial API, stores it on a rolling seven-day window, and
serves a bilingual (English / Hindi) reading experience.

It is not a thin API wrapper. Between upstream and reader sit a filtering pipeline, a caching
strategy, an article scraper, an AI classifier, an on-demand translator, and an editorial admin
surface. The product's value is that editorial layer.

## 2. Problem and context

Raw news-API output is not a reading experience. The upstream feed carries duplicate headlines,
horoscope filler tagged as business news, wire-spam accounts republishing the same crop-survey
article under five categories, articles in scripts the product does not support, and paywalled
stories whose "content" is a subscription prompt.

TimesPrime removes all of that, then adds the affordances that make a story readable: full text,
translation, saving, and an assistant that can answer questions about it. The audience is
bilingual and Indian-market, with English and Hindi as **equal** first-class languages — not a
primary language plus a translation afterthought.

## 3. Goals and non-goals

| Goals | Explicit non-goals |
|---|---|
| A clean, de-duplicated, on-topic feed in two languages | **Not a user-account product** — no registration, no server-side user state |
| Readable article text without leaving the site | **Not a CMS** — editorial publishing is an escape hatch, not the main path |
| Serve readers from storage, not upstream, to control cost | **Not a social platform** — no comments, profiles, or sharing beyond the OS share sheet |
| An operator surface for moderation and breaking news | **Not multi-tenant** — one publication, one admin credential |
| Degrade visibly rather than fail, on any third-party outage | **Not real-time** — a 30-minute refresh cadence is the design point |
| Show headlines and article text exactly as the source published them | **Not a rewriting service** — nothing is paraphrased or reworded without human review (owner decision Q1, §12) |
| | **No languages beyond English and Hindi.** Odia, Bengali, Tamil and other Indic-script articles arrive from upstream and are discarded **by design** — this is scope, not a bug (owner decision Q5, §12) |

## 4. Personas

| Persona | Needs | Implied constraints |
|---|---|---|
| **Reader** | A fast, current, relevant feed in their language; full text without hitting a paywall; to save things for later | No login. State is device-local. Must work on a mid-range phone on mobile data |
| **Operator / editor** | Remove bad articles; push a breaking banner within seconds; confirm the sync is alive; publish an original piece | Single shared credential. Destructive actions logged, and reversible where possible |

## 5. User journeys

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

## 6. Functional requirements

24 requirements. Status reflects **verified behaviour**, not intent. Paths are relative to the repository root; a route or
page is cited at its body, which the one-line file in `app/` re-exports.

### Feed and ingestion

| ID | Requirement | Implemented in | Status |
|---|---|---|---|
| FR-001 | Fetch headlines by category from NewsData.io | `backend/services/news/newsdata.ts`, `backend/services/news/fetchNews.ts` | Implemented |
| FR-002 | Refresh all 7 categories on a 30-minute schedule | `backend/api/cron/refresh-news.ts`, `vercel.json` | Implemented |
| FR-003 | Serve from cache → store → upstream → mock, in that order | `backend/api/news/top-headlines.ts` | **Partial** — tier 2 unreachable, DEF-01 |
| FR-004 | Persist articles on a rolling 7-day window | `backend/repositories/db.ts` → `purgeOldArticles` | **Partial** — runs on the read path, DEF-05 |
| FR-005 | De-duplicate by normalised title | `shared/config/newsConfig.ts` → `dedupeArticlesByTitle` | Implemented · tested |
| FR-006 | Exclude horoscope/tarot filler, wire-spam and non-news listing sources | `shared/config/newsConfig.ts` | Implemented · tested |
| FR-007 | Exclude hard-paywalled publishers at write time | `backend/repositories/db.ts` → `HARD_PAYWALL_SOURCE_DOMAINS` | Implemented |
| FR-008 | Classify and suppress mis-tagged categories via LLM | `backend/services/classify/categoryClassifier.ts` | Implemented — fail-open by design |
| FR-009 | Notify the reader when newer stories exist | `backend/api/news/check-new.ts`, `frontend/views/home/HomeClient.tsx` | Implemented |

### Language

| ID | Requirement | Implemented in | Status |
|---|---|---|---|
| FR-010 | Restrict each feed to its language by script detection | `shared/config/newsConfig.ts`, `backend/repositories/db.ts` | Implemented · tested |
| FR-011 | Translate article text on demand | `backend/api/translate.ts`, `backend/services/translate/googleTranslate.ts` | **Partial** — unofficial endpoint, no size cap |
| FR-012 | Persist the language choice across visits | `frontend/context/LanguageContext.tsx` | Implemented |

### Article reading

| ID | Requirement | Implemented in | Status |
|---|---|---|---|
| FR-013 | Extract readable full text from a publisher page | `backend/api/news/scrape-article.ts` | Implemented |
| FR-014 | Detect paywalls and show publisher metadata instead of junk | same → `detectPaywall` | Implemented |
| FR-015 | Strip author bios, nav and app-download boilerplate | same → `isJunkParagraph` | Implemented |
| FR-016 | Refuse to fetch internal/private network addresses | `backend/lib/urlValidation.ts` | **Partial** — redirects bypass it, DEF-02 |
| FR-017 | Always link out to the original publisher | `frontend/views/article/ArticleDetailView.tsx` | **Partial** — 2 of 4 links unvalidated, DEF-03 |

### Reader features

| ID | Requirement | Implemented in | Status |
|---|---|---|---|
| FR-018 | Save articles device-locally and list them | `frontend/features/news/bookmarks.ts`, `frontend/views/saved/SavedView.tsx` | Implemented · tested |
| FR-019 | Answer questions about a story, streamed | `backend/api/chat.ts` | Implemented · tested — error path misleads, DEF-04 |
| FR-020 | Provide a themed, topic-appropriate image for every card | `shared/config/topicImages.ts`, `shared/config/imageDomains.ts` | Implemented |

### Operations

| ID | Requirement | Implemented in | Status |
|---|---|---|---|
| FR-021 | Gate every admin surface behind a session | `proxy.ts`, `backend/auth/adminSession.ts` | **Partial** — unthrottled, DEF-06 |
| FR-022 | List, search, edit, delete and bulk-delete stored articles | `backend/api/admin/articles.ts`, `backend/api/admin/articles-bulk.ts`, `frontend/features/admin/ArticlesTable.tsx` | Implemented |
| FR-023 | Publish an editorial article directly | `backend/api/admin/publish-article.ts` | Implemented — bypasses the filter pipeline by design |
| FR-024 | Set a time-boxed breaking-news banner | `backend/api/admin/breaking-news.ts` | **Blocked** — table absent from schema, DEF-07 |

## 7. Non-functional requirements

| ID | Requirement | Current reality |
|---|---|---|
| NFR-01 | A reader request should not call the upstream API | **Not met.** Every uncached request reaches NewsData.io |
| NFR-02 | No third-party outage produces a user-visible error | Met — arguably over-met; see §11 |
| NFR-03 | Abuse-prone endpoints are rate-limited | **Partial.** Chat and translate only; login and scraper unprotected |
| NFR-04 | Request bodies and upstream responses are size-capped | **Not met.** No cap on chat message, translate array, or scraped response |
| NFR-05 | Secrets never reach the browser or an error report | Met — `shared/validation/sentryScrub.ts` redacts; no secret is `NEXT_PUBLIC_` |
| NFR-06 | Stored articles are purged after 7 days | Met, on the wrong execution path |
| NFR-07 | Usable at 400 px width | Appears met from the breakpoint set; **not verified in a browser** |
| NFR-08 | Typecheck, lint, test and build pass on every commit | Met, and enforced in CI since `506a4ab` |
| NFR-09 | No dependency carries a known critical advisory | **Not met.** 2 critical, 9 high — including the framework |
| NFR-10 | Business logic is covered by tests | **Not met.** Measured baseline: 3.62% statements (428 of 11,795) at `73e207f`. It fell 4.41% → 3.50% when the well-covered paraphraser was deleted, not because any test regressed; it has since crept up only because later deletions shrank the denominator — 428 statements have been covered throughout (BL-003) |

## 8. Compatibility requirements

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

## 9. Data model

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

## 10. Integrations and failure behaviour

| Service | Purpose | On failure | Assessment |
|---|---|---|---|
| NewsData.io | Source of all articles | 5 built-in mock articles | Correct; the mock set is obviously synthetic |
| Supabase | Storage, 7-day window | **Silently serves upstream** | **Too quiet.** Invisible and expensive — DEF-01 |
| Upstash Redis | Shared cache | In-process `Map` | Correct, trade-off documented in code |
| Anthropic | Chat + classification | Chat 503; classifier fails open | Fail-open on classification is the right call |
| Google Translate | On-demand translation | Returns the original string | Unofficial endpoint — fine at this volume, not a foundation |
| Sentry | Error reporting | No-op without a DSN | Fine |

## 11. Known defects — NOT requirements

Current, observable behaviour that is a defect. Listed here so no future reader mistakes it for
intent. **Do not promote any of these into §6.**

| ID | Behaviour | Severity |
|---|---|---|
| DEF-01 | Every Supabase call fails; app silently serves upstream instead | **Critical** |
| DEF-02 | Scraper follows up to 21 redirects, none re-validated — defeats the SSRF guard running immediately before it | **Critical** |
| DEF-03 | Two of four publisher links render an unvalidated `targetUrl` from the query string. Branded phishing surface | High |
| DEF-04 | AI panel prints a canned "Key Takeaway" when the API fails, as if it were a real answer. `Chatbot.tsx` handles the same failure honestly | High |
| DEF-05 | `purgeOldArticles()` runs a DELETE on the feed read path | Medium |
| DEF-06 | Admin login unthrottled; password compare returns early on length mismatch, leaking length | High |
| DEF-07 | `breaking_news` and `admin_logs` exist only as SQL inside route-file comments | High |
| DEF-08 | Feed fetches 80 rows, filters in JS, slices to 40 — under-fills exactly when a spam source floods | Medium |
| DEF-09 | ~~Contact form and newsletter show success, send nothing.~~ **Resolved by removal** in `59b875d`: all three forms deleted — the contact form and **two** newsletter forms, footer and article sidebar (owner decision Q4). A real backend is future work, BL-005 | Resolved |
| DEF-10 | Scraper returns HTTP 200 with placeholder prose on failure; UI detects errors by string-matching three hard-coded sentences | Medium |
| DEF-11 | `next` 16.3.0 carries 13 advisories, four of them critical unauthenticated RCE; fixed in a non-major release (audit F-001) | **Critical** |
| DEF-12 | The feed search interpolates the raw query into a PostgREST `.or()` filter string — filter injection (audit F-006) | High |
| DEF-13 | `axios` 1.19.0 carries advisories including redirect-based SSRF and ReDoS (audit F-007) | High |
| DEF-14 | `.env.local.example` documents `ADMIN_SECRET_TOKEN`, which no code reads, and omits `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`, which the code requires (audit F-009; README is already correct) | High |
| DEF-15 | No input size caps: translate `texts[]` (count and item length), chat `message`, scraper response size (audit F-010) | High |
| DEF-16 | The public scraper, which makes arbitrary outbound requests, has no rate limit (audit F-011) | High |
| DEF-17 | Admin purge and sync show a success message from their `catch` blocks, and nothing when `!res.ok` (audit F-014) | Medium |
| DEF-18 | Two indexes for seven filtered columns: array `.contains()` wants GIN, `ILIKE '%x%'` wants `pg_trgm` (audit F-018) | Medium |
| DEF-19 | The in-memory rate limiter never evicts keys — unbounded memory growth (audit F-020) | Medium |
| DEF-20 | The home feed starts overlapping fetches with no `AbortController` or sequence guard; a stale response can overwrite a fresh one (audit F-021) | Medium |
| DEF-21 | Article page title is doubled: `… \| TimesPrime News \| TimesPrime News` (audit F-022) | Low |
| DEF-22 | `translateHeadline()` ignores its `lang` argument yet runs on every card title and description (audit F-024) | Low |
| DEF-23 | Node version drift: `.node-version` and CI use 20, the local runtime is 24, `package.json` has no `engines`, Vercel's version is unconfirmed (audit F-026) | Low |
| DEF-24 | The chat drawer has no dark mode (audit F-027) | Low |
| DEF-25 | Theme flash on load: the theme is read from `localStorage` in an effect, after first paint (audit F-028) | Low |

**Audit cross-reference.** The 2026-10-29 audit (F-001..F-028, at commit `0e7f1f7`) maps onto this
register as: DEF-01 = F-002, DEF-02 = F-003, DEF-03 = F-005, DEF-04 = F-013, DEF-05 = F-015,
DEF-06 = F-004, DEF-07 = F-008, DEF-08 = F-016, DEF-09 = F-012, DEF-10 = F-017; DEF-11..25 were
added from the audit and name their F-ID inline. F-019, F-023 and F-025 were resolved before they
were registered and have no DEF. Status per finding, with today's code locations:
[`AUDIT-FINDINGS.md`](AUDIT-FINDINGS.md). The audit rates F-003 High and F-013 Medium; this register
rates DEF-02 Critical and DEF-04 High — both ratings are kept, and the ledger notes the difference.

**Refuted — do not re-report.** A `javascript:` URL XSS via `targetUrl` was suspected and
**disproven**: React 19 blocks it, rendering
`href="javascript:throw new Error('React has blocked a javascript: URL…')"`. The *phishing* half
(DEF-03) is real; the XSS half is not.

**Dependencies.** `npm audit` reports 2 critical and 9 high. `next` 16.3.0 carries four critical
unauthenticated-RCE advisories; the fix is a **patch bump to 16.4.3**. The AVIF and SVG RCE paths
appear closed by this configuration (`formats` defaults to webp-only, `dangerouslyAllowSVG` is
false), and the Sentry critical advisory requires `tunnelRoute`, which is not set. Upgrade anyway.

## 12. Owner decisions (2026-10-29)

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

## 13. Success metrics

| Metric | Target | Why this number |
|---|---|---|
| Reader requests served without an upstream call | ≥ 95% | The storage tier exists for this; currently ~0% |
| Upstream calls per day | ≤ 350 | 7 categories × 48 cron runs, plus headroom |
| Feed items surviving the filter pipeline | 30–40 per category | Below 30 suggests over-filtering (DEF-08) |
| Scrape success (real text, not fallback copy) | ≥ 85% | Measured ~96% in a 120-URL sample |
| Statement coverage, non-UI modules | ≥ 60% | From 3.62%; security and data modules first |
| Critical/high dependency advisories | 0 | Currently 2 critical, 9 high |

## 14. Appendix — environment variables

Set in `.env.local` locally and in the Vercel dashboard in production. **Never commit real values.**

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key; RLS restricts it to reads |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Bypasses RLS for server writes. Never expose to the client |
| `NEWSDATA_API_KEY` | yes | Upstream news. Without it the app serves mock articles |
| `ANTHROPIC_API_KEY` | yes | Chat and category classification |
| `ADMIN_PASSWORD` | yes | Admin password, compared in constant time |
| `ADMIN_SESSION_SECRET` | yes | HMAC key signing the 12-hour session cookie |
| `CRON_SECRET` | prod | Gates the refresh cron. Unset ⇒ endpoint fails closed |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | optional | Shared cache; falls back to in-process |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | Error reporting; not a secret |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | build | Source-map upload only |
| `NEXT_PUBLIC_APP_URL` | prod | Public origin; CORS and OpenGraph |
| `NEXT_PUBLIC_BASE_URL` | optional | Base URL for the server's own internal fetches |

`ADMIN_SECRET_TOKEN` appears in some older `.env.local` files and is **read by nothing** — a
leftover from a stale example file.
