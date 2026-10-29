# TimesPrime — Session Handoff

**For:** a fresh Claude session (or engineer) continuing this work with no prior context.
**State as of:** 2026-10-29, commit `506a4ab`, branch `main`.

Read §1 and §3 before touching anything. §3 in particular will save you from false conclusions
that have already been reached and discarded once.

---

## 1. Start here

**What this is.** A bilingual (English/Hindi) news aggregator on Next.js 16.3 / React 19.
NewsData.io → Supabase (7-day rolling window) → Supabase-first read path with Upstash Redis
caching. Plus a Cheerio article scraper, Claude Haiku for chat and category classification, an
unofficial Google Translate wrapper, and a session-gated admin panel at `/admin`.

**Where the work stands.** A phased PRD + restructure plan is underway. **Phases 0, 1 and A
(knowledge base) are complete and committed.** The structure decision is made: **layer separation
with a CI-enforced import boundary** — not a top-level `backend/` folder, which the App Router
cannot support without breaking every URL. Next up is Phase C (structure design / ADR), then
migration. PRD sign-off is blocked on the five open questions in §9.

**The single most important fact:** every Supabase call is currently failing with
`TypeError: fetch failed`. The app does not surface this — it silently serves NewsData.io directly
on every request. Do not diagnose the database code as broken; the *connection* is broken. See
DEF-01.

**Key documents in this repo:**

| File | What it holds |
|---|---|
| `docs/README.md` | **Entry point.** What to read, in what order |
| `docs/CODEMAP.md` | **Every module: purpose, LOC, importers, target.** Answers "where does X live / what touches Y" without a single grep. Columns derived from the repo — regenerate after any move |
| `docs/PRD.md` | Full PRD: FR-001..024 with code citations, NFR, CR, data model, defect register |
| `docs/architecture.md` | How it works today, the target structure, and the 8 import rules |
| `docs/MOVE-MAP.md` | Migration execution: slice order, risks, judgement calls, stop condition |
| `docs/TimesPrime-PRD-and-Architecture.pdf` | Same material, formatted for people. Hand to a stakeholder |
| `docs/BACKLOG.md` | Deferred debt with the reason for each deferral (BL-001..003) |
| `docs/_baseline-routes.txt` | Route table captured at Phase 0. The diff target Phase 4 must match exactly |
| `docs/prompts/00-prd-and-restructure.md` | The phased plan being executed |
| `CONTRIBUTING.md` | Commit convention and the verify gate |
| `AGENTS.md` | Project instruction: read the bundled Next docs before using framework APIs |

There is also a published audit artifact (28 findings, severity-filterable):
`https://claude.ai/artifact/Hpo9Q5pJg1vw7ZjXyuT8Ck` — private to the owner.

---

## 2. Environment and commands

| | |
|---|---|
| Platform | Windows 11. Both PowerShell and Git Bash available |
| Node / npm | v24.19.0 / 11.17.0 — **`.node-version` pins 20**, a real but so-far harmless drift |
| Dependencies | Installed (841 packages via `npm ci`) |
| Dev server | Running on `http://localhost:3000` (was PID 22308 — verify, it may have changed) |
| Line endings | **CRLF** throughout `src/` |
| Git identity | Set locally for this repo: `Vivek Singh <vivektech.dev25@gmail.com>`. Not global |

```bash
npm run dev        # dev server (Turbopack)
npm run verify     # THE GATE: typecheck -> lint -> test -> build. All four must pass
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # jest
npm run test:ci    # jest with coverage
```

**Baseline verification state — all four green:**

```
tsc --noEmit   exit 0
eslint .       exit 0   (0 errors, 15 warnings)
jest --ci      4 suites, 42 tests passed
next build     exit 0   (27 routes)
```

**Coverage is 4.41% statements**, project-wide. Treat any memory of "91%" as wrong — see §3.6.

---

## 3. Gotchas that have already burned time

These are not theoretical. Each one caused a wrong conclusion or a failed command in the last
session.

### 3.1 This is not the Next.js you were trained on

Next 16.3 postdates most published material. **`AGENTS.md` requires reading
`node_modules/next/dist/docs/` before relying on any framework convention.** Known traps:

| Looks wrong | Actually correct |
|---|---|
| `src/proxy.ts` instead of `src/middleware.ts` | Next 16 **renamed Middleware to Proxy**. Correct as-is |
| `preload` prop on `next/image` | Correct. **`priority` is deprecated as of v16.0.0** — the familiar prop is the wrong one |
| `remotePatterns` hostnames using `{,*.}host` glob | Correct. Hostnames are matched with **picomatch**, not string equality (`next/dist/shared/lib/match-remote-pattern.js`) |

`remotePatterns` is capped at **50 entries** (zod `.max(50)` in `next/dist/server/config-schema.js`).
The list in `src/lib/imageDomains.ts` holds 49. One slot free.

> A previous pass flagged `preload` as a bug. It was wrong, and the bundled docs settled it.
> **When docs and memory disagree, the bundled docs win.**

### 3.2 Supabase is down — do not misdiagnose it

Every operation fails: Select, Upsert, Purge, Freshness Check, breaking-news read. Confirm with:

```bash
curl -s -D - -o /dev/null "http://localhost:3000/api/news/top-headlines?refresh=true" | grep -i x-data-source
# returns: newsdata     <- should be: supabase
```

The `X-Data-Source` header tells you which tier answered: `cache` / `supabase` / `newsdata` / `mock`.
Also check `.next/dev/logs/next-development.log` for the actual errors.

### 3.3 CRLF breaks multi-line string anchors

Source files use CRLF. Any script doing a multi-line find/replace must normalise:

```js
const crlf = s.includes('\r\n');
const fix = t => crlf ? t.replace(/\r?\n/g, '\r\n') : t;
```

Single-line anchors are fine. Multi-line ones silently fail to match without this.

### 3.4 Bash heredocs choke on this content

Heredocs containing backticks, `${...}`, or HTML repeatedly failed with quoting errors. **Use the
Write tool for file content, or write a Node script to a scratch file and run it.** Do not fight
the shell.

### 3.5 `/tmp` paths don't resolve in Node on Windows

`node -e "require('/tmp/x.json')"` fails. Node also resolves `require()` relative to the *script's*
directory, not the cwd. Use absolute Windows paths, and for project modules use
`require(process.cwd() + '/node_modules/...')`.

### 3.6 Jest coverage was lying

`collectCoverageFrom` was unset, so coverage instrumented only files the tests imported — it
reported **91.42%** while describing 5 of 73 source files. Fixed in `4e79cb1`. The real number is
**4.41%**. Every file in the Phase 6 decomposition table reads **0%**.

### 3.7 `eslint-disable-next-line` placement

It disables the **next line**, including a comment line. Putting it at the top of a multi-line
explanation block disables the comment, not the code. The explanation goes first; the directive sits
immediately above the statement.

### 3.8 Two npm postinstall scripts are blocked

`@sentry/cli` and `unrs-resolver` were blocked by sandbox policy. **This does not break anything** —
`npm run build` and `npm run lint` both work. (An earlier claim that it might break the build was
wrong.) `npm approve-scripts --allow-scripts-pending` if source-map upload is ever needed.

### 3.9 Never print `.env.local`

It holds real credentials. Keys currently set (names only):
`ADMIN_PASSWORD`, `ADMIN_SECRET_TOKEN`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`,
`MEDIASTACK_API_KEY`, `NEWSDATA_API_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Note `ADMIN_SECRET_TOKEN` is set but **read by nothing** — leftover from the stale
`.env.local.example` that the README now corrects.

---

## 4. Commits made this session

Oldest to newest. `0e7f1f7` was the pre-existing HEAD.

| SHA | Commit | What it did |
|---|---|---|
| `0a9d103` | Align `next/image` remotePatterns with `isAllowedImageUrl` | Fixed a runtime throw on `i.newsdata.io`. `remotePatterns` used exact hostname matching while `isAllowedImageUrl` matched subdomains. Changed to the `{,*.}${hostname}` glob. Verified across all 49 hostnames: 0 mismatches, hostile look-alikes still rejected |
| `bc556da` | `chore: make lint baseline green` | 19 errors → 0. Type annotations only. Added `NewsDataRawArticle` and `ArticleRow`; widened 7 catch blocks to `unknown` + guard; 2 `eslint-disable` with reasons (BL-001); downgraded `react-hooks/set-state-in-effect` to warn (BL-002) |
| `4e79cb1` | `test: measure coverage across the whole src tree` | Added `collectCoverageFrom`. 91.42% → 4.41%. No test changed |
| `685bf14` | `build: move SQL into db/` | `git mv` → `db/schema.sql`, `db/policies.sql`. Renames detected 94%/96%. Updated 3 path references incl. a user-facing `console.warn` string |
| `63a866e` | `chore: name the package and add scripts` | `temp-app` → `timesprime`; added `typecheck` and `verify` |
| `ada0757` | `docs: add README, CONTRIBUTING and docs/ scaffold` | Real README (16 env vars documented), CONTRIBUTING, docs scaffold, baseline route table |
| `506a4ab` | `ci: run the verify gate on push and PR` | GitHub Actions running the same four steps, Node from `.node-version`, `npm ci`, coverage artifact |

**Uncommitted:** `docs/TimesPrime-PRD-and-Architecture.pdf` (untracked). Owner has not said whether
to commit it.

---

## 5. Architecture

```
INGEST ─ every 30 min, Vercel cron (vercel.json)
  /api/cron/refresh-news  [Bearer CRON_SECRET, fails closed if unset]
    → NewsData.io, 7 categories, sequential (parallel bursts get throttled)
    → filter: hard-paywall · horoscope/tarot · wire-spam · non-news listings
    → upsert on article_id
    → fire-and-forget: Haiku flags category tags that don't fit (fail-open)

SERVE ─ per request, /api/news/top-headlines
  1. Redis cache (15 min)   → X-Data-Source: cache
  2. Supabase (<30 min old) → supabase     ← CURRENTLY UNREACHABLE
  3. NewsData.io live       → newsdata     ← everything lands here today
  4. MOCK_ARTICLES          → mock

AUTHORISE ─ src/proxy.ts, matcher /admin/* and /api/admin/*
  public:          /admin/login, /api/admin/login, /api/admin/logout
  public GET only: /api/admin/breaking-news   (homepage banner, no session)
  else: HMAC-SHA256 cookie, 12h, httpOnly, SameSite=Lax
  NO route handler does its own auth check — this is the only gate.
```

### Where things live today

```
src/
  app/            routing + route handlers (several carry business logic inline)
  components/     17 files, flat, admin and reader mixed  (5,483 LOC)
  context/        Theme + Language providers
  lib/            SIX unrelated concerns in one folder    (2,909 LOC)
  types/          shared types
  proxy.ts, instrumentation*.ts, sentry.*.config.ts   ← framework-pinned, do not move
db/               schema.sql, policies.sql
docs/             PRD pdf, BACKLOG, architecture, adr/, runbooks/, prompts/
```

**The problem is `src/lib/`** — it mixes data access (`db.ts`, `supabase.ts`), security primitives
(`adminSession.ts`, `urlValidation.ts`), infrastructure (`cache.ts`, `rateLimit.ts`,
`sentryScrub.ts`), domain logic (`newsConfig.ts`, `categoryClassifier.ts`, `fetchNews.ts`), static
config (`imageDomains.ts`, `topicImages.ts`, `categoryColors.ts`) and i18n (`translations.ts`).
Nothing marks which is which, and nothing stops a client component importing a Supabase client —
which has already happened in `ActivityLog.tsx`.

### Files over 500 lines (all at 0% coverage)

| File | LOC |
|---|---|
| `components/ArticleDetailView.tsx` | 1,008 |
| `components/admin/ArticlesTable.tsx` | 751 |
| `lib/db.ts` | 571 |
| `components/Header.tsx` | 568 |
| `app/api/news/scrape-article/route.ts` | 560 |
| `components/HomeClient.tsx` | 532 |
| `app/admin/page.tsx` | 512 |

---

## 6. The restructure plan — where we are

| Phase | Work | Status |
|---|---|---|
| **0** | Baseline: four verifications, route table captured | ✅ **Done** |
| **1** | Hygiene: package name, scripts, README, CI, `db/`, docs scaffold | ✅ **Done** |
| **2** | **PRD** — author `docs/PRD.md` | ⬅ **NEXT. Gated on §9 answers** |
| **3** | Structure design — tree, move map, ADR | Gate |
| **4** | Migration — 10 slices, pure moves only | Gate |
| **5** | Enforcement — boundary lint rule, path aliases | Gate |
| **6** | Decomposition — split the 7 oversized files | Optional, last |

The target structure and complete move map are **already designed** — they are in the PDF, Part III.
Phase 3 should refine that rather than start over. Phase 2's PRD content is in the PDF, Part II; it
needs owner review before being written into `docs/PRD.md`.

### Migration slice order (Phase 4)

1. `config/` — **do first, carefully.** `next.config.ts` imports `imageDomains.ts` at config-load
   time; move the import in the same commit (CR-06)
2. `server/` (db, supabase, adminSession, adminLogger)
3. `features/bookmarks` — self-contained and tested, proves the mechanics
4. `features/i18n`
5. `features/chat` — has tests
6. `features/news`
7. `features/article` — **will likely hit the stop condition**, see §6.1
8. `features/admin`
9. `components/ui`
10. `app/` route groups — URLs must be byte-identical; diff `docs/_baseline-routes.txt`

### 6.1 Stop condition

If a slice cannot be done as a pure move and needs an edit to a module body — **stop**. Either write
a characterization test first, or defer that file to Phase 6 and say so. Slice 7 almost certainly
trips this: extracting 560 lines of scraper heuristics out of a route handler is not a pure move.

---

## 7. Known defects — current behaviour that is NOT intended

Numbered to match the PDF. These are deliberately excluded from the requirement set so no future
reader mistakes them for design.

| ID | Defect | Severity |
|---|---|---|
| DEF-01 | Every Supabase call fails; app silently serves upstream instead | **Critical** |
| DEF-02 | Scraper follows up to 21 redirects, none re-validated — defeats the SSRF guard running immediately before it | **Critical** |
| DEF-03 | Two of four publisher links render an unvalidated `targetUrl` from the query string. Branded phishing surface. (The `javascript:` XSS variant is **refuted** — React 19 blocks it) | High |
| DEF-04 | AI panel prints a canned "Key Takeaway" when the API fails, as if it were a real answer. `Chatbot.tsx` handles the same failure honestly | High |
| DEF-05 | `purgeOldArticles()` runs a DELETE on the feed read path | Medium |
| DEF-06 | Admin login unthrottled; password compare returns early on length mismatch, leaking length | High |
| DEF-07 | `breaking_news` and `admin_logs` exist only as SQL inside route-file comments, not in `db/schema.sql` | High |
| DEF-08 | Feed fetches 80 rows, filters in JS, slices to 40 — under-fills exactly when a spam source floods | Medium |
| DEF-09 | Contact form and newsletter show success, send nothing. No endpoint exists | Medium |
| DEF-10 | Scraper returns HTTP 200 with placeholder prose on failure; UI detects errors by string-matching three hard-coded sentences | Medium |

**Also outstanding:** `npm audit` reports **2 critical, 9 high**. `next` 16.3.0 carries four critical
unauthenticated-RCE advisories — **fix is a patch bump to 16.4.3**. (The AVIF and SVG RCE paths
appear closed by this config: `formats` defaults to webp-only and `dangerouslyAllowSVG` is false. The
Sentry critical advisory needs `tunnelRoute`, which is not set. Upgrade regardless.)

---

## 8. Backlog (`docs/BACKLOG.md`)

- **BL-001** — `db.ts` row mapping relies on `any` to hide unhandled nulls. `link` and `pub_date`
  are nullable in Postgres; `Article.link` and `Article.pubDate` are required strings. Two
  `eslint-disable` in place. Needs a logic change, so deferred to Phase 6.
- **BL-002** — `react-hooks/set-state-in-effect` downgraded to warn. Fixing means converting effects
  to derived state, which changes render timing on files with zero coverage. Phase 6, behind tests.
- **BL-003** — Coverage denominator fixed (resolved). Kept to explain why the number dropped from
  91% to 4% with no test deleted.

---

## 9. Open questions — blocking Phase 2

The owner must answer these; they change the move map.

1. **Is the paraphraser deliberate?** `lib/paraphraser.ts` rewrites every headline through a synonym
   table. Deliberate republishing posture, or a legacy experiment? It has no owner in the code.
2. **Does RSS return?** `lib/rssParser.ts` is 233 lines inside a block comment, with a live endpoint
   that only returns 503. Revive or delete.
3. **Is editorial publishing a real workflow?** It bypasses every filter and hardcodes
   `country: ["us"]`.
4. **What is the intended contact path?** The form implies one exists (DEF-09).
5. **Should the feed admit languages beyond EN/HI?** Odia, Bengali and Tamil articles arrive today
   and are discarded.

---

## 10. Conventions to follow

- **`npm run verify` must pass before any commit.** All four, not a subset. `tsc` catches imports
  that no longer resolve; `eslint` catches the ones left behind; `jest` covers the thin tested
  slice; `build` catches route resolution and server/client boundary violations.
- **A commit is either a move or a change, never both.** Use `git mv`. A move commit may also fix
  the import and path references the move invalidated — that is part of the move.
- **A red slice is reverted, not patched.**
- **Defer, don't fix.** Anything tempting found mid-move goes to `docs/BACKLOG.md` with its reason.
- **No `any`.** Use `unknown` + a narrowing guard, or one `eslint-disable-next-line` with a stated
  reason and a backlog entry.
- **Match the comment density.** This codebase documents *why*, citing evidence and rejected
  alternatives. That convention is its best feature — preserve comments verbatim through moves.
- **Stop at every phase gate.** Present output, wait for approval.

---

## 11. Immediate next actions

Ordered by consequence ÷ effort. Items 1–4 are independent of the restructure and should not wait
for it.

1. `npm i next@16.4.3` — patch bump, clears four critical RCE advisories
2. Fix the Supabase connection; add `/api/health` so this class of outage cannot recur silently
3. Promote `breaking_news` and `admin_logs` into `db/schema.sql` (DEF-07)
4. Guard the two unvalidated publisher links (DEF-03) — two other call sites already show the pattern
5. Get §9 answered, then write `docs/PRD.md` from PDF Part II → **Phase 2 gate**
6. Refine the move map from PDF Part III into `docs/architecture.md` + `docs/adr/0001-*.md`
   → **Phase 3 gate**

---

## 12. Quick reference

### Useful probes

```bash
# which tier answered
curl -s -D - -o /dev/null "http://localhost:3000/api/news/top-headlines?refresh=true" | grep -i x-data-source

# real runtime errors
tail -40 .next/dev/logs/next-development.log

# route table drift vs Phase 0 baseline
git ls-files 'src/app/**/page.tsx' 'src/app/**/route.ts' | sort

# confirm framework behaviour instead of guessing
node -e "const pm=require('next/dist/compiled/picomatch'); console.log(pm.makeRe('{,*.}newsdata.io').test('i.newsdata.io'))"
```

### Data model

`db/schema.sql` defines **`articles` only** — 15 columns, `article_id` unique,
`category`/`country`/`category_mismatches` are `TEXT[]`. Only `id`, `article_id`, `title`,
`created_at` are NOT NULL (this is the root of BL-001).

`breaking_news` and `admin_logs` are used by code but **not in committed SQL** (DEF-07).

Indexes: `created_at`, `article_id`. Queries also filter on `category`/`country` (array containment
— wants GIN) and `title`/`description` with `ILIKE '%…%'` (wants `pg_trgm`).

### Test suite

4 files, 42 tests, all passing: `lib/newsConfig.test.ts`, `lib/bookmarks.test.ts`,
`lib/paraphraser.test.ts`, `app/api/chat/route.test.ts`.

**Untested and security-critical:** `lib/urlValidation.ts` (122 lines) and `lib/adminSession.ts`
(67 lines). Both pure, no I/O, trivially testable. Highest value-per-hour work available.
