# Audit findings ledger

The audit (28 findings, F-001..F-028) was run at commit `0e7f1f7`, **before** both restructures, so
its own paths and line numbers are stale. Every location below is at today's paths. They were first
verified against the repo at `4cf5be6` (2026-10-30) and updated through Phase 1 at `679c72e`. Then,
after restructure 2, they were moved to the new layout and re-verified at `51bafd5` (2026-10-30).
Each cited line was re-located by its content at `679c72e`, with its surrounding lines as context,
not by adding offsets, and every claim without a line number was re-checked. Restructure 3
(2026-11-02, ADR 0004) rewrote the paths to the `src/` layout by a mechanical file-by-file map; a
route body's line numbers carry over to its `route.ts`, except `top-headlines`, whose body moved to
`packages/server/src/services/news/topHeadlines.ts` (+14 lines). Locate code through
[`architecture.md`](architecture.md) §4 and the editor, not through the audit.

**Status.** *Resolved* — fixed, with the commit. *Pending verification* — fixed in code; a check
that cannot run on this machine remains, and is named. *Partial* — part fixed, the rest named.
*Open* — not started. This file is updated as each finding is fixed; one finding per commit, prefixed with
its ID. Closed out in audit Phase 5 (2026-11-02): no finding is Open. What "Pending verification" needs is
listed in [HANDOFF.md](HANDOFF.md) §11, "Before the AWS deployment".

## Summary

| Status | Count | Findings |
|---|--:|---|
| Resolved | 22 | F-001, F-003, F-004, F-005, F-007, F-009, F-010, F-011, F-012, F-013, F-014, F-015, F-016, F-017, F-019, F-020, F-021, F-022, F-023, F-024, F-025, F-027 |
| Pending verification | 5 | F-002 (production check), F-006 (live probe), F-008 and F-018 (SQL not yet applied), F-026 (the production runtime's Node version) |
| Partial | 1 | F-028 (`isDark` ternaries, BL-028) |
| Deferred | 0 | — |
| Open | 0 | — |

## Ledger

| ID | Sev | Finding | Status | Evidence / current location | DEF |
|---|---|---|---|---|---|
| F-001 | Crit | Next.js 16.3.0 advisories, incl. 4 critical unauthenticated RCE | **Resolved** | `47e62ae`: `next` and `eslint-config-next` 16.4.3, the current latest. Four of the 13 advisories reached 16.4.0, so the 16.3.8 patch line was not enough. `npm audit` no longer lists `next`; route table identical; `next start` smoke test passed | DEF-11 |
| F-002 | Crit | Every Supabase call fails; app silently serves NewsData.io | **Pending verification** | **Connection:** working on 2026-10-30 with no code change — one real request returned HTTP 200, the app's own client path (service-role key) read 78 rows with the newest 13 min old, and the feed answered `X-Data-Source: supabase`, then `cache`. The earlier failure no longer reproduces, so its `err.cause` could not be captured. **Visibility:** `57fe578` adds `/api/health` (status only, 200/503) and `/api/admin/health` (detail, behind the session); `679c72e` reports each Supabase→NewsData fallback to Sentry, rate-limited (D5). **Needs:** in production, `/api/health` answering 200, and Sentry — with `NEXT_PUBLIC_SENTRY_DSN` set, which it is not locally — receiving a fallback event | DEF-01 |
| F-003 | **Crit** (audit: High) | Scraper follows up to 21 redirects, none revalidated | **Resolved** | `2e383cb`: the guard (`packages/shared/src/lib/urlValidation.ts`) now judges IPv6 literals directly, the IPv4 embedded in mapped/compatible/NAT64/6to4 forms, Teredo, documentation, multicast and 240/4, and rejects credentials; it returns the addresses it validated. `1145bca`: `packages/server/src/services/scrape/fetchPage.ts` follows at most 5 redirects by hand (`maxRedirects: 0`), revalidating every hop, and pins each connection to its hop's validated addresses through axios's `lookup`, so DNS rebinding is closed, not documented; a refused hop is 400. Proven against the real axios with a local server, including a negative control. The article page no longer sends an unverified `url` to the scraper at all (`8d0b775`, F-005), which narrows this surface further | DEF-02 |
| F-004 | High | Admin login unthrottled; password compare leaks length | **Resolved** | `487eb47` (tests first), `7eb9253`: `verifyAdminPassword` (`packages/server/src/auth/adminSession.ts`) compares SHA-256 digests with `timingSafeEqual`, so no length check leaks; `POST /api/admin/login` allows 10 attempts per 15 minutes per IP (owner decision D1: Redis fixed window via `checkRateLimit`, in-memory fallback, logged), 429 with Retry-After. README's "compared in constant time" is now true (N-02). Production behaviour on Redis is a deployment check | DEF-06 |
| F-005 | High | Branded phishing sink: unvalidated `targetUrl`, attacker `og:url` | **Resolved** | `8d0b775` (owner decision: trust anchor = the stored articles). `apps/web/src/app/article/[slug]/page.tsx` uses `?url=` only when `findKnownArticle` (`packages/server/src/services/news/knownArticle.ts`) finds it: an exact match on `articles.link` (read-only), or a built-in mock article. Otherwise the url is treated as absent: no publisher link, no scrape (no outbound request), no attacker title; `og:url` is always the page's own address. All four sinks in `apps/web/src/components/article/ArticleDetailView.tsx` also require `safePublisherHref` (`packages/shared/src/lib/urlValidation.ts`, moved there in `2cd04c9`). Probe: `https://evil.example.com/phish` renders no link and appears in no metadata or request. The app's own links match exactly (six shapes tested), so nothing is normalised. **Depends on** an index on `articles.link`, in the Phase 3 migration (F-018), not yet applied. **Trade-offs:** during a Supabase outage, or for an article past the 7-day window, the page shows no publisher link and no scraped text; signed links are the upgrade path if outage resilience is needed (BL-023) | DEF-03 |
| F-006 | High | PostgREST filter injection via search query | **Pending verification** | `4b33611`: the feed search (`searchFilter` in `packages/server/src/repositories/db.ts`) LIKE-escapes `\ % _`, drops `*`, and double-quotes the value, so `,` `.` `(` `)` cannot add PostgREST clauses; tested against crafted terms. `614e514` (owner: fix now): the admin article list uses the same escape (`containsPattern`, `packages/server/src/lib/likePattern.ts`). **Needs:** the injection probe re-run against the live database (never run locally: it may be production) | DEF-12 |
| F-007 | High | axios advisories (redirect SSRF, ReDoS) | **Resolved** | `56e7509`: axios 1.21.0 — 12 advisories, all fixed in 1.20.0, including "maxRedirects: 0 is not enforced by the fetch adapter", which F-003 relies on. The remaining advisories: `31f4a54` (@sentry/nextjs 10.78.0, tunnel-route bypass; `tunnelRoute` stays unset) and `5970692` (transitive, `npm audit fix` without `--force`) | DEF-13 |
| F-008 | High | `admin_logs` and `breaking_news` DDL only in code comments | **Pending verification** | `db28a46`: `database/schema.sql` creates all three tables `IF NOT EXISTS` and enables RLS; `database/policies.sql` drops and recreates every policy, idempotent, in one transaction; `packages/server/src/repositories/schema.test.ts` checks every column the code uses. Owner runbook `docs/runbooks/apply-database.md` (`069bb5b`, `48ac2a2`): order, verify queries, the key each access uses, a snapshot and a rollback per step. **Needs:** the owner applying the files. Nullability gaps: BL-024; the anon-key fallback: BL-025 | DEF-07 |
| F-009 | High | Documented env ≠ actual env | **Resolved** | `10c8b47`: `.env.local.example` lists exactly the 20 variables the code reads (found by grep), one line each; `ADMIN_SECRET_TOKEN` removed, `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` added; `packages/shared/src/config/envExample.test.ts` keeps the two in step. `45223f0` (BL-029): the seed route no longer falls back to `NEXT_PUBLIC_NEWSDATA_API_KEY`. README (`ada0757`) was already right | DEF-14 |
| F-010 | High | No input size caps | **Resolved** | `58c7f7d`: request bodies are read through a byte-capped streaming reader (`packages/server/src/lib/readJsonBody.ts`): `/api/translate` 64 KB, 50 texts, 5,000 characters each and 10,000 in all; `/api/chat` 16 KB and a 2,000-character message, with the article context trimmed; scraped pages capped at 5 MB (`MAX_PAGE_BYTES`, `packages/server/src/services/scrape/fetchPage.ts`). Over a cap: 413 or 400 | DEF-15 |
| F-011 | High | Public scraper has no rate limit | **Resolved** | `3b63a37`: `/api/news/scrape-article` allows 30 uncached scrapes a minute per IP (owner decision D1: Redis fixed window, in-memory fallback), 429 with Retry-After; cached answers are never counted. `65d3337` (BL-016): the article page calls the scraper directly, so **the limit now applies only to external callers**, not to every reader through the server's own address (BL-021). `988c7fa`: the route scrapes only stored articles (the F-005 lookup), so it can no longer be used to fetch arbitrary sites; a refused URL costs no DNS lookup or fetch. Production behaviour on Redis is a deployment check | DEF-16 |
| F-012 | Med | Contact/newsletter forms send nothing | **Resolved** | `59b875d` removed all three forms. No `<form>` remains outside admin, search, chat and the AI panel. The leftover unused newsletter strings were removed in `a81d3c4` (restructure 2, S1) | DEF-09 |
| F-013 | **High** (audit: Med) | AI panel shows a canned "Key Takeaway" on failure | **Resolved** | `526fc07` (characterization), `86bdf78`: the article page's askTimesPrime panel shows "Sorry, that request failed: <reason>" (and Hindi) in an alert, as `Chatbot.tsx` does, instead of a made-up "Key Takeaway"; an empty answer says so instead of a canned insight | DEF-04 |
| F-014 | Med | Admin purge/sync show success from `catch`; `!res.ok` shows nothing | **Resolved** | `a093080` (characterization), `5997567`: sync and purge in `apps/admin/src/app/admin/page.tsx` report success only on `res.ok`; an error status shows the server's message, a thrown request its reason, in a red alert | DEF-17 |
| F-015 | Med | `purgeOldArticles()` awaited on read and write paths | **Resolved** | `2f31bad`: the purge is off the feed's read path (`getDBArticles`) and the upsert path (`saveArticlesToDB`); it runs once per cron run (`packages/server/src/services/news/refreshNews.ts`), whose response and audit entry carry the count. The admin's explicit purge action (`POST /api/admin/db-stats`) **stays, by owner decision**: the intent was "off the read path", and a deliberate admin action is fine | DEF-05 |
| F-016 | Med | Feed fetches 80, filters in JS, slices 40 | **Resolved** | `2e3fa0b`: `getDBArticles` reads pages of 80 newest-first until 40 rows pass the JS filters, the rows run out, or 5 pages are read; a later page's error serves what was found | DEF-08 |
| F-017 | Med | Scraper returns 200 with placeholder prose; UI string-matches | **Resolved** | `41c3ab0` (characterization), `b7f6fbc`: a failed scrape is 502 (504 on timeout) with `{ error }` (`ScrapeErrorResponse`, `packages/shared/src/types`); nothing to extract is 200 with empty content; the view no longer matches placeholder wording, and the page passes it no content on any failure. Accepted by the owner: external callers of the public route now see 502/504, and the cache key is `scrape:v2:` | DEF-10 |
| F-018 | Med | 2 indexes for 7 filtered columns | **Pending verification** | `4898da4`: `database/migrations/2026-11-02-indexes.sql` adds GIN on `category` and `country`, `pg_trgm` trigram GIN on `title` and `description`, and a btree on `link` (the F-005 lookup and the public scrape route depend on it; not unique, for the `#` placeholder links). Idempotent; verify with the runbook's `EXPLAIN`. **Needs:** the owner applying it | DEF-18 |
| F-019 | Med | Lint fails; no CI | **Resolved** | `bc556da` (lint 19 errors → 0), `506a4ab` (CI). Lint today: 0 errors, 13 warnings. GitHub Actions run 41010981658 on `4cf5be6`: success; CI has stayed green since | — |
| F-020 | Med | Rate limiter keys never evicted | **Resolved** | `b44203d`: the in-memory limiter (`packages/server/src/lib/rateLimit.ts`) sweeps expired keys every minute and holds at most 10,000. `e29cf0d`: chat and translate 429s send Retry-After. The in-memory cache got the same eviction (`e5754b5`, BL-013, N-03) | DEF-19 |
| F-021 | Med | Feed fetch races; no AbortController | **Resolved** | `675ce1d` (characterization), `9ce42bc`: `fetchNews` in `apps/web/src/components/home/HomeClient.tsx` aborts the previous request and applies a response only if no newer call started (sequence guard); the duplicate fetches on category change, Reset Category and URL sync are gone (owner accepted the effect change). Related: BL-027, the hidden first search result, fixed in `96f192d` | DEF-20 |
| F-022 | Low | Page title doubled | **Resolved** | `ef510f9`: the article page sets the bare title and the root layout's template adds the suffix once; `openGraph.title` keeps it. Rendered: "Monsoon arrives early \| TimesPrime News" | DEF-21 |
| F-023 | Low | Supabase SDK in client bundle | **Resolved** | `b01d528`; `GoTrueClient` in browser chunks 1 → 0. CODEMAP: 0 server-only modules in the client bundle; `server-only` guards since `e3753b3`, and on every backend module since `19d255c` | — |
| F-024 | Low | `translateHeadline()` ignores `lang` | **Resolved** | `3de9a1e` (owner decision D3): the `translateHeadline` no-op and its three call sites are gone; nothing renders differently. Headline translation is a feature: BL-026 | DEF-22 |
| F-025 | Low | Dead RSS subsystem | **Resolved** | `bcd5393` (code + 503 route, routes 27 → 26), `d3ba8fa` (footer link). Leftover: a historical comment in `packages/shared/src/config/imageDomains.ts:14`; the unused `rssFeeds` string was removed in `a81d3c4` | — |
| F-026 | Low | `.node-version` 20 vs runtime 24 | **Pending verification** | `974b255` (D2): `.node-version` 24, `package.json` `engines` `24.x`, and CI follows `.node-version`; the local runtime is 24.19.0. CI on Node 24 has been green since (latest: run 41046741477 on `5f6b0cc`). **Needs:** Node 24 on the production runtime, at the AWS deployment (nothing is deployed until the project is complete). `@types/node` is `^24` since `0066f27` (BL-012, resolved) | DEF-23 |
| F-027 | Low | Chatbot has no dark mode | **Resolved** | `7ead49b`: `Chatbot.tsx` has dark variants from the app's palette; a test checks every light surface has one. The growth (418 B of class strings on every route) was accepted; the chatbot shipping on every route is BL-030 | DEF-24 |
| F-028 | Low | Theme flash on load | **Partial** | `5ad891a`: an inline script in `<head>` (`THEME_INIT_SCRIPT`, `packages/shared/src/config/theme.ts`) sets the `dark` class and background before the first paint, so every `dark:` variant is right from the start; no CSP blocks it. **Remaining:** components that style with `isDark ?` ternaries (75 in 16 files) still switch after hydration, a visible flash for those elements: BL-028 (owner ruling) | DEF-25 |

## Contradictions between the audit and the PRD

*The PRD (`docs/PRD.md`) was retired on 4 Nov 2026; it is in git history.*

Recorded rather than silently resolved, then ruled on by the owner (Phase 0 approval):

- **Severity of F-003.** The audit rates it High; PRD DEF-02 rates it **Critical**.
- **Severity of F-013.** The audit rates it Medium; PRD DEF-04 rates it **High**.

**Ruling: the higher rating governs priority.** F-003 is treated as Critical and F-013 as High. Both
ratings stay visible in the ledger's Sev column.

## New observations (not in the audit)

Found during triage. Not fixed; listed for the owner.

| ID | Observation | Where | Status |
|---|---|---|---|
| N-01 | Sentry's secret scrubber redacted only `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEWSDATA_API_KEY` | `packages/shared/src/lib/sentryScrub.ts` | **Resolved** `f6c2016`: nine keys, found by grep, plus a test that fails if a new secret-named env var is read without being scrubbed |
| N-02 | README claims the admin password is "compared in constant time"; F-004 shows it is not yet | `README.md:102` | **Resolved** `7eb9253` (F-004): the comparison is now constant-time, so the claim is true |
| N-03 | The in-memory cache (used when Upstash is not configured, as locally) removes an expired entry only when it is read again, so keys that are never re-read — every distinct scraped URL, every search — accumulate. Same class as F-020 | `packages/server/src/lib/cache.ts` | **Resolved** `e5754b5` (BL-013): a sweep every minute and at most 1,000 entries |
| N-04 | During a Supabase outage, `db.ts` sends every failed operation to Sentry unthrottled: five events per feed request (freshness, purge, upsert, purge, select), observed in the D5 run. D5's single rate-limited report covers visibility; these are the noise | `packages/server/src/repositories/db.ts` | **Resolved** `cc1d479` (BL-014): at most one Sentry event per operation per 5-minute window, through the D5 limiter |
| N-05 | `npm audit fix` (`5970692`) moved jest 30.4.2 → 30.5.2, which adds `@parcel/watcher` 2.6.0, the tree's first new package with an install script since the baseline. npm 11 does not run the script | `package-lock.json` | **Investigated, no action.** See below |

### N-05 — `@parcel/watcher` and its blocked install script

- **What it is for.** File watching in `jest --watch` / `--watchAll`, and nothing else. It is a
  dev-only dependency: `jest → @jest/core → jest-haste-map 30.5.1 → @parcel/watcher 2.6.0`.
  `jest-haste-map` loads it lazily inside `_subscribe()`, with the comment *"Watch mode is the only
  consumer of the native binding"*, so `npm test`, `npm run test:ci` and CI never load it. The app
  never ships it.
- **What the blocked script does.** `scripts/build-from-source.js` runs `node-gyp rebuild` **only**
  when `npm_config_build_from_source=true`; otherwise it exits doing nothing. (An earlier version
  of this row said it builds when no prebuilt binary exists; the script shows it does not.) The
  native binary arrives as a per-platform optional package — `@parcel/watcher-win32-x64` here,
  `-linux-x64-glibc` on the CI runner — so nothing depends on the script running.
- **Does anything break with it blocked?** No, checked on 2026-10-30: `npm test` exit 0 (9 suites,
  70 tests); `npm run build` exit 0 (28 routes); and the native binding itself loads from
  `@parcel/watcher-win32-x64` and delivered a file event (`update probe.txt`) in a probe, so
  `jest --watch` has what it needs. CI on Node 24 / npm 11 is green (run 41018035376).
- **npm settings:** unchanged, by owner instruction.

## npm audit

| When | Total | Critical | High | Low |
|---|--:|--:|--:|--:|
| 2026-10-30, before Phase 1 | 16 | 2 | 9 | 5 |
| after F-001 `47e62ae` (next, sharp) | 14 | 1 | 8 | 5 |
| after F-007 `56e7509` (axios) | 13 | 1 | 7 | 5 |
| after `31f4a54` (@sentry/nextjs, fast-uri) | 11 | 0 | 6 | 5 |
| after `5970692` (transitive) | **5** | **0** | **0** | 5 |
| 2026-11-02, Phase 5 close-out | 37 | 0 | 0 | 3 (+34 moderate) |

### Accepted risk — the jest lows

`jest`, `jest-cli`, `jest-config`, `@jest/core` and `deepmerge`, all **low**, accepted by owner
ruling (Phase 0 approval). The reason: npm's only "fix" is jest **25.1.0**, a major *downgrade*
from the installed 30.x, and the code runs only at test time, never in the app. Never run
`npm audit fix --force` for them; recheck when a jest release clears them.

### New since 2026-10-30 — 34 moderate, dev and build tooling only

Two advisories published after the Phase 1 audit:
- `glob` 9.0.0–14.0.1, [GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4).
  It reaches us through `@sentry/nextjs`'s build-time bundler plugin.
- `minimatch` <11.0.1, [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
  It reaches us through `eslint` and `eslint-config-next`'s plugins.

Neither ships in the app. npm's only fixes are major-version changes (`eslint` 4.0.0, `@sentry/nextjs`
10.76.1). `npm audit fix --dry-run` without `--force` changes 14 dev packages and leaves the count at 37.
So nothing was changed: no upgrade without the owner (BL-031). The jest lows are now counted as 3
(`deepmerge`, `jest`, `jest-cli`).
