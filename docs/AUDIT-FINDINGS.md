# Audit findings ledger

The audit (28 findings, F-001..F-028) was run at commit `0e7f1f7`, **before** the restructure. Its
paths and line numbers are stale; every location below is at today's paths, verified against the
repo at `4cf5be6` (2026-10-30). Locate code through [`CODEMAP.md`](CODEMAP.md), not through the
audit.

**Status.** *Resolved* — fixed, with the commit. *Partial* — part fixed, the rest named. *Open* —
not started. This file is updated as each finding is fixed; one finding per commit, prefixed with
its ID.

## Summary

| Status | Count | Findings |
|---|--:|---|
| Resolved | 4 | F-012, F-019, F-023, F-025 |
| Partial | 2 | F-009, F-026 |
| Open | 22 | everything else |

## Ledger

| ID | Sev | Finding | Status | Evidence / current location | DEF |
|---|---|---|---|---|---|
| F-001 | Crit | Next.js 16.3.0 advisories, incl. 4 critical unauthenticated RCE | Open | `package.json`: `next` 16.3.0 (installed 16.3.0). `npm audit` 2026-10-30: `next` critical, fix 16.4.3 (not semver-major) | DEF-11 |
| F-002 | Crit | Every Supabase call fails; app silently serves NewsData.io | Open | `next start` smoke test 2026-10-30: `/api/news/top-headlines` answered `X-Data-Source: newsdata`. Client: `src/server/supabase.ts` | DEF-01 |
| F-003 | High | Scraper follows up to 21 redirects, none revalidated | Open | `src/app/api/news/scrape-article/route.ts:410` — `axios.get(targetUrl, { timeout, headers })`, no `maxRedirects`, so axios's default of 21 applies | DEF-02 |
| F-004 | High | Admin login unthrottled; password compare leaks length | Open | `src/server/auth/adminSession.ts:57` — `if (expectedBuf.length !== candidateBuf.length) return false;` before `timingSafeEqual`. `src/app/api/admin/login/route.ts` imports no rate limiter. (README's "compared in constant time" is therefore not true yet.) | DEF-06 |
| F-005 | High | Branded phishing sink: unvalidated `targetUrl`, attacker `og:url` | Open | `src/features/news/components/ArticleDetailView.tsx:640` and `:662` render `href={targetUrl}` guarded only by `targetUrl &&`; the sinks at `:470` and `:583` already require `sourceDomain`. `src/app/article/[slug]/page.tsx:21` sets `openGraph.url` from `searchParams.url` | DEF-03 |
| F-006 | High | PostgREST filter injection via search query | Open | `src/features/news/server/db.ts:112` — `` b.or(`title.ilike.%${q}%,description.ilike.%${q}%`) `` | DEF-12 |
| F-007 | High | axios advisories (redirect SSRF, ReDoS) | Open | `package.json`: `axios` ^1.19.0 (installed 1.19.0). `npm audit`: high, fix available | DEF-13 |
| F-008 | High | `admin_logs` and `breaking_news` DDL only in code comments | Open | `db/schema.sql` creates `articles` only (`:4`). DDL lives in comments in `src/app/api/admin/breaking-news/route.ts` and `src/app/api/admin/logs/route.ts` | DEF-07 |
| F-009 | High | Documented env ≠ actual env | **Partial** | README (`ada0757`, lines 70–71) documents `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` correctly. **Open:** `.env.local.example` still lists `ADMIN_SECRET_TOKEN` (read by no code) and omits `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`. Also: `src/app/api/admin/seed-supabase/route.ts:13` falls back to `NEXT_PUBLIC_NEWSDATA_API_KEY` — server-only code, so not a leak, but it invites a public-prefixed name for a secret | DEF-14 |
| F-010 | High | No input size caps | Open | `src/app/api/translate/route.ts:36` checks `texts` is a non-empty string array, no length or item cap. `src/app/api/chat/route.ts` has no `message` length cap. Scraper `axios.get` (route `:410`) sets no `maxContentLength` / `maxBodyLength` | DEF-15 |
| F-011 | High | Public scraper has no rate limit | Open | `src/app/api/news/scrape-article/route.ts` imports no limiter (`lib/rateLimit` is used only by `/api/chat`) | DEF-16 |
| F-012 | Med | Contact/newsletter forms send nothing | **Resolved** | `59b875d` removed all three forms. No `<form>` remains outside admin, search, chat and the AI panel. Leftover: unused newsletter strings in `src/config/translations.ts` (dead text, not behaviour) | DEF-09 |
| F-013 | Med | AI panel shows a canned "Key Takeaway" on failure | Open | `src/features/news/components/ArticleDetailView.tsx:339` | DEF-04 |
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
| F-026 | Low | `.node-version` 20 vs runtime 24 | **Partial** | `.node-version` = 20, and CI reads it — run 41010981658 passed on Node 20, so CI and the file agree. **Open:** the local runtime is v24.19.0, `package.json` has no `engines`, and the Vercel Node version is unknown (D2) | DEF-23 |
| F-027 | Low | Chatbot has no dark mode | Open | `src/features/chat/components/Chatbot.tsx`: 0 `dark:` classes, no theme hook | DEF-24 |
| F-028 | Low | Theme flash on load | Open | `src/context/ThemeContext.tsx:39–42` reads `localStorage` (`timesprime_theme`) in `useEffect`; `src/app/layout.tsx` has no pre-paint script. `next.config.ts` sets **no** Content-Security-Policy header, so an inline script is not blocked today | DEF-25 |

## Contradictions between the audit and the PRD

Recorded rather than silently resolved:

- **Severity of F-003.** The audit rates it High; PRD DEF-02 rates it **Critical**. The ledger keeps
  the audit's rating for the audit row; the PRD rating stands for DEF-02. Either way it is first in
  the Phase 2 order.
- **Severity of F-013.** The audit rates it Medium; PRD DEF-04 rates it **High**.

## New observations (not in the audit)

Found during triage. Not fixed; listed for the owner.

| ID | Observation | Where |
|---|---|---|
| N-01 | Sentry's secret scrubber redacts only `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEWSDATA_API_KEY`. `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `CRON_SECRET` and the Upstash token are not in the list | `src/lib/sentryScrub.ts:9` |
| N-02 | README claims the admin password is "compared in constant time"; F-004 shows it is not yet | `README.md:70` |

## npm audit — 2026-10-30

`16 vulnerabilities (5 low, 9 high, 2 critical)`.

| Severity | Package | Direct | Fix |
|---|---|:-:|---|
| critical | `next` | yes | 16.4.3, not semver-major |
| critical | `@sentry/nextjs` | yes | available |
| high | `axios` | yes | available |
| high | `brace-expansion`, `fast-uri`, `follow-redirects`, `js-yaml`, `sharp`, `source-map-js`, `undici`, `zod` | no | available |
| low | `@jest/core` | no | available |
| low | `jest`, `jest-cli`, `jest-config`, `deepmerge` | `jest` yes | npm's only "fix" is jest **25.1.0** — a major *downgrade* from the installed 30.4.2. Not a real fix; do not `--force`. Recommend accepting these four lows (test-time only) and rechecking on the next jest release |
