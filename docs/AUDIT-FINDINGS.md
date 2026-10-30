# Audit findings ledger

The audit (28 findings, F-001..F-028) was run at commit `0e7f1f7`, **before** the restructure. Its
paths and line numbers are stale; every location below is at today's paths, verified against the
repo at `4cf5be6` (2026-10-30) and updated through Phase 1 at `679c72e`. Locate code through [`CODEMAP.md`](CODEMAP.md), not through the
audit.

**Status.** *Resolved* — fixed, with the commit. *Pending verification* — fixed in code; a check
that cannot run on this machine remains, and is named. *Partial* — part fixed, the rest named.
*Open* — not started. This file is updated as each finding is fixed; one finding per commit, prefixed with
its ID.

## Summary

| Status | Count | Findings |
|---|--:|---|
| Resolved | 6 | F-001, F-007, F-012, F-019, F-023, F-025 |
| Pending verification | 2 | F-002 (production check), F-026 (CI on Node 24, Vercel setting) |
| Partial | 1 | F-009 |
| Open | 19 | everything else |

## Ledger

| ID | Sev | Finding | Status | Evidence / current location | DEF |
|---|---|---|---|---|---|
| F-001 | Crit | Next.js 16.3.0 advisories, incl. 4 critical unauthenticated RCE | **Resolved** | `47e62ae`: `next` and `eslint-config-next` 16.4.3, the current latest. Four of the 13 advisories reached 16.4.0, so the 16.3.8 patch line was not enough. `npm audit` no longer lists `next`; route table identical; `next start` smoke test passed | DEF-11 |
| F-002 | Crit | Every Supabase call fails; app silently serves NewsData.io | **Pending verification** | **Connection:** working on 2026-10-30 with no code change — one real request returned HTTP 200, the app's own client path (service-role key) read 78 rows with the newest 13 min old, and the feed answered `X-Data-Source: supabase`, then `cache`. The earlier failure no longer reproduces, so its `err.cause` could not be captured. **Visibility:** `57fe578` adds `/api/health` (status only, 200/503) and `/api/admin/health` (detail, behind the session); `679c72e` reports each Supabase→NewsData fallback to Sentry, rate-limited (D5). **Needs:** in production, `/api/health` answering 200, and Sentry — with `NEXT_PUBLIC_SENTRY_DSN` set, which it is not locally — receiving a fallback event | DEF-01 |
| F-003 | **Crit** (audit: High) | Scraper follows up to 21 redirects, none revalidated | Open | `src/app/api/news/scrape-article/route.ts:410` — `axios.get(targetUrl, { timeout, headers })`, no `maxRedirects`, so axios's default of 21 applies | DEF-02 |
| F-004 | High | Admin login unthrottled; password compare leaks length | Open | `src/server/auth/adminSession.ts:57` — `if (expectedBuf.length !== candidateBuf.length) return false;` before `timingSafeEqual`. `src/app/api/admin/login/route.ts` imports no rate limiter. (README's "compared in constant time" is therefore not true yet.) | DEF-06 |
| F-005 | High | Branded phishing sink: unvalidated `targetUrl`, attacker `og:url` | Open | `src/features/news/components/ArticleDetailView.tsx:640` and `:662` render `href={targetUrl}` guarded only by `targetUrl &&`; the sinks at `:470` and `:583` already require `sourceDomain`. `src/app/article/[slug]/page.tsx:21` sets `openGraph.url` from `searchParams.url` | DEF-03 |
| F-006 | High | PostgREST filter injection via search query | Open | `src/features/news/server/db.ts:112` — `` b.or(`title.ilike.%${q}%,description.ilike.%${q}%`) `` | DEF-12 |
| F-007 | High | axios advisories (redirect SSRF, ReDoS) | **Resolved** | `56e7509`: axios 1.21.0 — 12 advisories, all fixed in 1.20.0, including "maxRedirects: 0 is not enforced by the fetch adapter", which F-003 relies on. The remaining advisories: `31f4a54` (@sentry/nextjs 10.78.0, tunnel-route bypass; `tunnelRoute` stays unset) and `5970692` (transitive, `npm audit fix` without `--force`) | DEF-13 |
| F-008 | High | `admin_logs` and `breaking_news` DDL only in code comments | Open | `db/schema.sql` creates `articles` only (`:4`). DDL lives in comments in `src/app/api/admin/breaking-news/route.ts` and `src/app/api/admin/logs/route.ts` | DEF-07 |
| F-009 | High | Documented env ≠ actual env | **Partial** | README (`ada0757`, lines 70–71) documents `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` correctly. **Open:** `.env.local.example` still lists `ADMIN_SECRET_TOKEN` (read by no code) and omits `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`. Also: `src/app/api/admin/seed-supabase/route.ts:13` falls back to `NEXT_PUBLIC_NEWSDATA_API_KEY` — server-only code, so not a leak, but it invites a public-prefixed name for a secret | DEF-14 |
| F-010 | High | No input size caps | Open | `src/app/api/translate/route.ts:36` checks `texts` is a non-empty string array, no length or item cap. `src/app/api/chat/route.ts` has no `message` length cap. Scraper `axios.get` (route `:410`) sets no `maxContentLength` / `maxBodyLength` | DEF-15 |
| F-011 | High | Public scraper has no rate limit | Open | `src/app/api/news/scrape-article/route.ts` imports no limiter (`lib/rateLimit` is used only by `/api/chat`) | DEF-16 |
| F-012 | Med | Contact/newsletter forms send nothing | **Resolved** | `59b875d` removed all three forms. No `<form>` remains outside admin, search, chat and the AI panel. Leftover: unused newsletter strings in `src/config/translations.ts` (dead text, not behaviour) | DEF-09 |
| F-013 | **High** (audit: Med) | AI panel shows a canned "Key Takeaway" on failure | Open | `src/features/news/components/ArticleDetailView.tsx:339` | DEF-04 |
| F-014 | Med | Admin purge/sync show success from `catch`; `!res.ok` shows nothing | Open | `src/app/admin/page.tsx:76–77` (sync: `catch` → "News synchronization request sent."), `:93–94` (purge: `catch` → "Purge operation complete."); the `!res.ok` branches at `:72` and `:89` set no message | DEF-17 |
| F-015 | Med | `purgeOldArticles()` awaited on read and write paths | Open | `src/features/news/server/db.ts:234` (`saveArticlesToDB`) and `:357` (`getDBArticles`); also `src/app/api/admin/db-stats/route.ts:25` (admin action, intended) | DEF-05 |
| F-016 | Med | Feed fetches 80, filters in JS, slices 40 | Open | `src/features/news/server/db.ts:366` (`.limit(80)`) and `:403` (`.slice(0, 40)`) | DEF-08 |
| F-017 | Med | Scraper returns 200 with placeholder prose; UI string-matches | Open | `src/app/api/news/scrape-article/route.ts` catch block (~`:536–552`) returns `NextResponse.json({... content: ["Full article coverage details ..."]})` with the default 200. UI: `ArticleDetailView.tsx:35` (`SCRAPE_FALLBACK_MESSAGES`), `:41`, `:105` | DEF-10 |
| F-018 | Med | 2 indexes for 7 filtered columns | Open | `db/schema.sql:28–29`: `created_at`, `article_id` only. No GIN, no `pg_trgm` | DEF-18 |
| F-019 | Med | Lint fails; no CI | **Resolved** | `bc556da` (lint 19 errors → 0), `506a4ab` (CI). Lint today: 0 errors, 14 warnings. GitHub Actions run 41010981658 on `4cf5be6`: success | — |
| F-020 | Med | Rate limiter keys never evicted | Open | `src/lib/rateLimit.ts:10` `const requestLog = new Map()`; `:15–17` filter and `set`, never `delete` | DEF-19 |
| F-021 | Med | Feed fetch races; no AbortController | Open | `src/features/news/components/HomeClient.tsx`: `fetchNews(` at `:176`, `:180`, `:197`, `:275`, `:282`, `:315`, `:512`; no `AbortController` or sequence guard in the file | DEF-20 |
| F-022 | Low | Page title doubled | Open | `src/app/article/[slug]/page.tsx:16` sets `` `${title} \| TimesPrime News` `` while `src/app/layout.tsx:30` already applies the template `"%s \| TimesPrime News"` | DEF-21 |
| F-023 | Low | Supabase SDK in client bundle | **Resolved** | `b01d528`; `GoTrueClient` in browser chunks 1 → 0. CODEMAP: 0 server-only modules in the client bundle; `server-only` guards since `e3753b3` | — |
| F-024 | Low | `translateHeadline()` ignores `lang` | Open | `src/config/translations.ts:196–199` returns `text` unchanged. Called at `src/features/news/components/ArticleCard.tsx:117`, `:122` and `CategoryMegaMenu.tsx:185` | DEF-22 |
| F-025 | Low | Dead RSS subsystem | **Resolved** | `bcd5393` (code + 503 route, routes 27 → 26), `d3ba8fa` (footer link). Leftover: an unused `rssFeeds` string in `src/config/translations.ts:118` and a historical comment in `src/config/imageDomains.ts:14` | — |
| F-026 | Low | `.node-version` 20 vs runtime 24 | **Pending verification** | `974b255` (D2): `.node-version` 24, `package.json` `engines` `24.x`, and CI follows `.node-version`; the local runtime is 24.19.0. **Needs:** a green CI run on Node 24 (reported after the push) and the owner setting the Vercel project to 24. `@types/node` stays `^20` — BL-012 | DEF-23 |
| F-027 | Low | Chatbot has no dark mode | Open | `src/features/chat/components/Chatbot.tsx`: 0 `dark:` classes, no theme hook | DEF-24 |
| F-028 | Low | Theme flash on load | Open | `src/context/ThemeContext.tsx:39–42` reads `localStorage` (`timesprime_theme`) in `useEffect`; `src/app/layout.tsx` has no pre-paint script. `next.config.ts` sets **no** Content-Security-Policy header, so an inline script is not blocked today | DEF-25 |

## Contradictions between the audit and the PRD

Recorded rather than silently resolved, then ruled on by the owner (Phase 0 approval):

- **Severity of F-003.** The audit rates it High; PRD DEF-02 rates it **Critical**.
- **Severity of F-013.** The audit rates it Medium; PRD DEF-04 rates it **High**.

**Ruling: the higher rating governs priority.** F-003 is treated as Critical and F-013 as High. Both
ratings stay visible in the ledger's Sev column.

## New observations (not in the audit)

Found during triage. Not fixed; listed for the owner.

| ID | Observation | Where | Status |
|---|---|---|---|
| N-01 | Sentry's secret scrubber redacted only `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEWSDATA_API_KEY` | `src/lib/sentryScrub.ts` | **Resolved** `f6c2016`: nine keys, found by grep, plus a test that fails if a new secret-named env var is read without being scrubbed |
| N-02 | README claims the admin password is "compared in constant time"; F-004 shows it is not yet | `README.md:70` | Open — fixed in the F-004 commit (owner ruling), so the claim becomes true in the change that makes it true |
| N-03 | The in-memory cache (used when Upstash is not configured, as locally) removes an expired entry only when it is read again, so keys that are never re-read — every distinct scraped URL, every search — accumulate. Same class as F-020 | `src/lib/cache.ts` | Open — BL-013, deferred into Phase 2 with F-020 (owner) |
| N-04 | During a Supabase outage, `db.ts` sends every failed operation to Sentry unthrottled: five events per feed request (freshness, purge, upsert, purge, select), observed in the D5 run. D5's single rate-limited report covers visibility; these are the noise | `src/features/news/server/db.ts` | **Resolved** `cc1d479` (BL-014): at most one Sentry event per operation per 5-minute window, through the D5 limiter |
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

### Accepted risk — the jest lows

`jest`, `jest-cli`, `jest-config`, `@jest/core` and `deepmerge`, all **low**, accepted by owner
ruling (Phase 0 approval). The reason: npm's only "fix" is jest **25.1.0**, a major *downgrade*
from the installed 30.x, and the code runs only at test time, never in the app. Never run
`npm audit fix --force` for them; recheck when a jest release clears them.
