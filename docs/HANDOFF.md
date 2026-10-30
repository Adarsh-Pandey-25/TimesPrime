# TimesPrime — Session Handoff

**For:** a fresh Claude session (or engineer) continuing this work with no prior context.
**State as of:** 2026-10-30, after **Phase D** (all six slices, `a626542`..`73e207f`) and its
close-out, branch `main`. **Phase E (enforcement) is next.** Run `git log --oneline -20` for the
exact head.

Read §1 and §3 before touching anything. §3 in particular will save you from false conclusions
that have already been reached and discarded once.

---

## 1. Start here

**What this is.** A bilingual (English/Hindi) news aggregator on Next.js 16.3 / React 19.
NewsData.io → Supabase (7-day rolling window) → Supabase-first read path with Upstash Redis
caching. Plus a Cheerio article scraper, Claude Haiku for chat and category classification, an
unofficial Google Translate wrapper, and a session-gated admin panel at `/admin`.

**Where the work stands.** A phased PRD + restructure plan is underway. **Phases 0, 1 and A
(knowledge base) are complete, and the Phase A review's changes have landed**, including the
owner's five decisions (§9) — the paraphraser, RSS, the contact form and both newsletter forms are
deleted. The structure decision is made: **layer separation with a CI-enforced import boundary** —
not a top-level `backend/` folder, which the App Router cannot support without breaking every URL.

**Phase C is approved** (ADR 0001 Accepted), and its review's conditions are applied: SC-1 fixed
(`b01d528`, the Supabase SDK no longer reaches the browser), BL-009 and BL-010 fixed, slice 7
skipped, bookmarks moved into news so `lib/` stays domain-free.

**Phase D is done.** All 34 moves in `scripts/move-map.mjs` are committed as six pure-move slices,
each with `npm run verify` and `check-move-map` green. The built route table is identical to
`_baseline-routes.txt` (26 URLs); `lib/` holds only `cache`, `rateLimit`, `sentryScrub`,
`urlValidation`, none importing a project module; every `server/` module and
`features/news/server.ts` begins with `import "server-only"`, seen to fail a client import.
**Phase E (lint enforcement, path aliases) is next** — see §11.
The security items (Next.js bump, DEF-02, DEF-06) and the Supabase connection are reserved by the
owner for a separate session. Do not start either here.

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
| `docs/BACKLOG.md` | Deferred debt with the reason for each deferral (BL-001..010) |
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
| Dev server | **Stopped** for the restructure (its Turbopack watcher can lock files during `git mv`). `npm run dev` to start |
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
eslint .       exit 0   (0 errors, 14 warnings — all in source since BL-010)
jest --ci      3 suites, 31 tests passed
next build     exit 0   (26 routes)
```

**Coverage is 3.62% statements** (428 of 11,795 at `73e207f`), project-wide. It was 4.41% until the
well-covered paraphraser was deleted (3.50%); later deletions shrank the denominator and the new
feature barrels grew it, never the 428. Treat any memory of "91%" as wrong — see §3.6.

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
reported **91.42%** while describing 5 of 73 source files. Fixed in `4e79cb1`. The real number was
**4.41%**, fell to **3.50%** when `3805007` deleted the paraphraser — one of the few well-covered
modules — and is **3.63%** at `9f3b76f` only because later deletions shrank the denominator. Every file in the Phase 6 decomposition table reads **0%**.

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

### 3.10 Moving or deleting a route breaks `typecheck` until `.next/types` is cleared

`npm run verify` runs `typecheck` **before** `build`, and `tsconfig.json` includes the previous
build's generated route types. After a route file moves or is deleted, `tsc` reads a stale validator
still importing the old path:

```
.next/types/validator.ts: error TS2307: Cannot find module '../../src/app/.../route.js'
```

The source is fine — do not "fix" it. `rm -rf .next/types` and re-run. This happened once already
(RSS deletion, `bcd5393`) and **will hit Phase D slice 7** if route groups go ahead, since that
moves every page. Durable fix: `next typegen` in the `typecheck` script (BL-007).

### 3.11 Verify claims against the build, not just the graph

`docs/CODEMAP.md`'s boundary count is a static estimate. When it matters, check the production
bundle: `grep -l <distinctive-string> .next/static/chunks/*.js`, then find which route loads that
chunk in `.next/server/app/**/page_client-reference-manifest.js`. That is how the second boundary
violation was confirmed (Supabase's `GoTrueClient` ships in a chunk loaded only by `/admin`), with
server-only strings as a negative control.

### 3.12 A barrel imported by a server component ships every client component it re-exports

Measured in slice 5: `app/layout.tsx` importing `BreakingNewsBanner` from `@/features/admin` put all
five admin dashboard components on **every** route (+46 KB on `/`). `"use client"` on the barrel
does not help — the module count drops but the bytes stay. What fixes it is the three-line
`package.json` in each feature folder, `{ "sideEffects": ["./server.ts"] }` (`8864691`). **Do not
delete those files as clutter**, and do not put a side-effect-only import (CSS, polyfill) inside a
feature. To measure: total `.next/static/chunks/**/*.js` bytes, and per route the chunks listed in
`entryJSFiles` of `.next/server/app/**/page_client-reference-manifest.js`.

### 3.13 `sed -i` silently converts CRLF files to LF

Git Bash's `sed -i` rewrites the line endings of every file it touches. The index is LF
(`core.autocrlf=true`), so commits are unaffected, but the working copy drifts. Rewrite with a Node
script that detects and restores `\r\n`, and check with `git ls-files --eol <file>`.

### 3.14 Path-keyed lists in the scripts go stale silently on a move

`generate-codemap.mjs` keys `PURPOSE`, `SERVER_ONLY` and its table groups by path. Each now throws if
an entry names a missing file or a module matches no group (`ab8661b`, `21c8951`). Keep it that
way: a policy list that tolerates a stale path reports success while checking nothing.

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
| `ac8900e` | `docs: add CODEMAP and the script that generates it` | Phase A. One row per module, generated by `scripts/generate-codemap.mjs` |
| `51b5570` | `docs: write the PRD, complete architecture, add the move map` | Phase A. FR/NFR/CR, defect register, 8 import rules, slice plan |
| `ddbcc9f` | `docs: add the docs index and commit the session handoff` | Phase A. `docs/README.md` entry point; this file first committed |
| `08b9e59` | `docs: CODEMAP lists imports, importers and coverage` | Review item 2. TypeScript-AST parser; path lists; coverage %. Found 2 importers the regex missed (`next.config.ts`; a dynamic import) |
| `33b2315` | `docs: CODEMAP detects the client boundary transitively` | Review item 3. Violations 1 → 2, confirmed against the production bundle |
| `b1d597c` | `docs: state CODEMAP's type-elision limit, as 33b2315 claimed` | Fixes a false claim in `33b2315`'s message |
| `8b39cd5` | `docs: retire the PDF; PRD.md is the only canonical spec` | Review item 4. PDF untracked + git-ignored; 9 references re-pointed |
| `3805007` | `feat: show headlines as published; remove the paraphraser` | Q1. 17 call-site edits. Tests 42 → 31, coverage 4.41% → 3.50% |
| `bcd5393` | `feat: remove the RSS ingestion code and its 503 route` | Q2. **Route table 27 → 26**; baseline updated in the same commit |
| `59b875d` | `feat: remove the contact form and both newsletter forms` | Q4. Resolves DEF-09. Three forms, not two — the newsletter lived in two places |
| `7ceae74` | `docs: log the owner decisions and everything deferred along the way` | BL-004..009 |
| `4ead26d`, `652f2b8`, `630371a` | docs, CODEMAP regeneration, BL-010 logged | Knowledge base brought current |
| `9f4ab48` | `build: make the move map data, and check it against the import rules` | Phase C. `scripts/move-map.mjs` + `check-move-map.mjs`. Draft map: 21 violations |
| `a0d7f85` | `docs: Phase C — finalize the move map and record ADR 0001` | Three features, not six |
| `b01d528` | `refactor: keep the Supabase SDK out of the admin page's browser bundle` | SC-1. `GoTrueClient` in browser chunks 1 → 0; violations 2 → 0 |
| `d3ba8fa` | `fix: remove the footer's "RSS Feeds" link` | BL-009 |
| `755fadc` | `build: stop ESLint linting the generated coverage/ directory` | BL-010. Lint warnings 15 → 14 |
| `127096f` | `build: move bookmarks into features/news; keep lib/ domain-free` | Phase C review. `lib/` stays domain-free |
| `24ef99b` | `docs: apply the Phase C review conditions; ADR 0001 accepted` | ADR split criteria, route groups deferred |
| `d44b9cc` | `build: keep the theme and language providers in src/context/` | Phase B close. `context/` becomes a layer; rule R9 |
| `ea2a869` | `docs: record context/ as the app-wide provider layer` |  |
| `ab8661b` | `build: give CODEMAP a table group for every target layer` | Moved modules were silently dropping out of CODEMAP's tables; now a missing group throws |
| `a626542` | `refactor(slice 1): move chat into features/chat` | Phase D begins. `features/chat/index.ts` |
| `befacce` | `refactor(slice 2): move static data into config/` | CR-06: built `remotePatterns` byte-identical before/after; picomatch probe true |
| `9f3b76f` | `build: move Footer to features/news instead of components/ui` | Owner decision. Footer reads app state and renders category links |
| `e14c948` | `docs: replace the stale 3.50% coverage figure with the measured 3.63%` | Covered count 428 at every commit; only the denominator moved |
| `21c8951` | `build: fail CODEMAP generation when SERVER_ONLY names a missing file` | The list is path-keyed; a stale entry would have hidden a module from the client-bundle check |
| `0c381f9` | `refactor(slice 3): move backend-only modules into server/` | Security-session files moved as-is |
| `e3753b3` | `feat: guard every server/ module with import "server-only"` | Condition 2. Guard seen to fail a client import; proxy re-tested under `next start` |
| `b4192f0` | `build: rule R5, what components/ui may import` | `ui` → `ui`/`lib`/`types` + `ThemeContext` only. Seen to fire on the old Footer plan |
| `f965c1d` | `refactor(slice 4): move ThemeSpinner and NewsSkeletonGrid into components/ui` |  |
| `8864691` | `build: mark each feature folder side-effect-free except server.ts` | **Found by measurement**: without it slice 5 put the admin dashboard on every page (+46 KB on `/`). See §3.12 |
| `8b44939` | `refactor(slice 5): move the admin UI into features/admin` | Bundle 0.00% vs pre-slice; proxy matcher untouched (CR-05) |
| `73e207f` | `refactor(slice 6): move news into features/news` | All 34 moves done. `server.ts` guard seen to fail; bundle +0.04%, max route +0.14% |

Followed by the Phase D close-out docs commit (CODEMAP, PRD paths, this file).

**Retired:** `docs/TimesPrime-PRD-and-Architecture.pdf` was committed in `ddbcc9f`, then untracked
and git-ignored at the owner's direction. `docs/PRD.md` is the only canonical spec — do not consult
the PDF if a copy exists on disk.

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

### Where things live today (after Phase D)

```
src/
  app/                 routing + route handlers; paths are the URLs      27 files  3,640 LOC
  features/news/       feed, article page, masthead, footer, ingestion   15 files  4,340 LOC
    components/ server/ newsConfig bookmarks · index.ts · server.ts
  features/admin/      operator UI + breaking-news banner                 8 files  1,951 LOC
  features/chat/       AI assistant UI                                    3 files    232 LOC
  components/ui/       ThemeSpinner · NewsSkeletonGrid                    2 files    178 LOC
  context/             Theme + Language providers                         2 files    120 LOC
  server/              supabase · auth/adminSession · auditLog · googleTranslate   219 LOC
  lib/                 cache · rateLimit · sentryScrub · urlValidation    4 files    273 LOC
  config/              imageDomains · categoryColors · topicImages · translations  796 LOC
  types/               shared types
  proxy.ts, instrumentation*.ts, sentry.*.config.ts   ← framework-pinned, do not move
db/                    schema.sql, policies.sql
docs/                  README (index), PRD, CODEMAP, MOVE-MAP, architecture, BACKLOG, adr/, runbooks/
```

LOC excludes tests; feature counts include `index.ts`/`server.ts` (and each feature's
`package.json`, §3.12, is not counted).

**The problem was `src/lib/`** (resolved by Phase D; kept for the reasoning) — it mixed data access (`db.ts`, `supabase.ts`), security primitives
(`adminSession.ts`, `urlValidation.ts`), infrastructure (`cache.ts`, `rateLimit.ts`,
`sentryScrub.ts`), domain logic (`newsConfig.ts`, `categoryClassifier.ts`, `fetchNews.ts`), static
config (`imageDomains.ts`, `topicImages.ts`, `categoryColors.ts`) and i18n (`translations.ts`).
Nothing marked which was which, and nothing stopped a client component importing a Supabase client —
which happened in `ActivityLog.tsx` until `b01d528`.

### Files over 500 lines (all at 0% coverage)

| File | LOC |
|---|---|
| `features/news/components/ArticleDetailView.tsx` | 963 |
| `features/admin/components/ArticlesTable.tsx` | 751 |
| `features/news/server/db.ts` | 571 |
| `features/news/components/Header.tsx` | 568 |
| `app/api/news/scrape-article/route.ts` | 556 |
| `features/news/components/HomeClient.tsx` | 532 |
| `app/admin/page.tsx` | 506 |

---

## 6. The restructure plan — where we are

| Phase | Work | Status |
|---|---|---|
| **0** | Baseline: four verifications, route table captured | ✅ **Done** |
| **1** | Hygiene: package name, scripts, README, CI, `db/`, docs scaffold | ✅ **Done** |
| **A** | Knowledge base + PRD; review changes and owner decisions | ✅ **Done** |
| **C** | Structure design — tree, move map, ADR 0001 | ✅ **Done, approved** |
| **D** | Migration — 6 slices, pure moves only (slice 7 skipped) | ✅ **Done** — `a626542`..`73e207f` |
| **E** | Enforcement — boundary lint rule, path aliases | **Next** |
| **F** | Decomposition — split the 7 oversized files; route-handler extraction | Optional, last |

**Phase C changed the design.** `scripts/check-move-map.mjs` tested the Phase A draft against the
import rules and found **21 violations**. The finalized map has **2**, both the known `ActivityLog`
bug. Result: **three features — `news`, `admin`, `chat` — not six.** i18n and bookmarks are shared
code; the article page is part of news; `Header` is news's masthead. Reasoning in
`docs/adr/0001-feature-first-structure.md`.

**The map is data:** `scripts/move-map.mjs`. MOVE-MAP's file lists and CODEMAP's Target column are
both generated from it. Edit it there and nowhere else.

### Migration slice order (Phase D)

All six are done — commit per slice in §4.

1. `features/chat` — 2 files, smallest and safest; **proves the mechanics**
2. `config/` — `next.config.ts` imports `imageDomains.ts` at config-load time; move that import in
   the same commit (CR-06)
3. `server/` — supabase, adminSession, adminLogger → auditLog, googleTranslate
4. `components/ui/` — 2 files, presentation only; Theme/LanguageContext stay in `context/`; Footer moved to slice 6 (owner decision)
5. `features/admin` — 7 files, including `actionLabels.ts` (SC-1 is done, so a pure move)
6. `features/news` — 15 files including `bookmarks.ts` and `Footer.tsx`; create `index.ts` **and** `server.ts`
   (first line `import "server-only";`), **prove the guard fails a client import**, and measure the
   client bundle before and after
7. ~~`app/` route groups~~ — **skipped**, owner decision

Run `node scripts/check-move-map.mjs` before and after every slice — expect "0 violation(s)".

### 6.1 Stop conditions

If a slice cannot be done as a pure move — **stop**.

- **SC-1 — `adminLogger.ts` split.** ✅ **Resolved in `b01d528`**: types → `types/`, labels →
  `components/admin/actionLabels.ts`, now `features/admin/components/actionLabels.ts` (slice 5).
- **SC-2 — the scraper.** `scrape-article`'s 556 lines stay in their route through Phase D; extracting
  them is Phase F, behind a characterization test.

---

## 7. Known defects — current behaviour that is NOT intended

Numbered to match `docs/PRD.md` §11. These are deliberately excluded from the requirement set so no future
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
| DEF-09 | ~~Contact form and newsletter show success, send nothing~~ — **resolved by removal** in `59b875d` | Resolved |
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

## 9. Owner decisions — all five answered (2026-10-29)

No open questions remain. Full rationale in `docs/PRD.md` §12.

| # | Decision | Where |
|---|---|---|
| Q1 | **Paraphraser: deleted.** Headlines shown as the source published them | `3805007` |
| Q2 | **RSS: deleted**, including the 503 route. Route table 27 → 26 | `bcd5393` |
| Q3 | **Editorial publishing: kept.** Moves with `features/admin`. `country: ["us"]` and the filter bypass logged, not fixed | BL-004 |
| Q4 | **Contact form and newsletter: UIs removed.** `/contact` page kept, listing emails | `59b875d`, BL-005 |
| Q5 | **EN/HI is the scope.** An explicit non-goal in the PRD, so the discard is not treated as a bug | PRD §3 |

**Follow-up the decisions created:** the privacy policy still describes newsletter and contact-form
collection that no longer happens. Legal copy — for the owner or legal review, BL-008.

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

**In this line of work** — the restructure:

1. **Phase E** — ESLint boundary rules for architecture.md §5, path aliases, `check-move-map` folded
   into the gate, CI confirmed; prove each rule by a deliberate violation.
2. BL-007 stays deferred: no Phase D slice moved a route file, so it never fired.
3. Owner or legal rewrites the privacy policy (BL-008).
4. Phase F (optional, not started): decomposition of the seven files in §5, each behind a
   characterization test.

**Reserved by the owner for a separate session** — do not start them here:

4. `npm i next@16.4.3` — patch bump, clears four critical RCE advisories
5. Fix the Supabase connection; add `/api/health` so this class of outage cannot recur silently
6. DEF-02 (SSRF via redirects), DEF-06 (login rate limit + length leak). DEF-03 (unvalidated
   publisher links) belongs with them.

**Independent, unscheduled:** promote `breaking_news` and `admin_logs` into `db/schema.sql` (DEF-07).

---

## 12. Quick reference

### Useful probes

```bash
# which tier answered
curl -s -D - -o /dev/null "http://localhost:3000/api/news/top-headlines?refresh=true" | grep -i x-data-source

# real runtime errors
tail -40 .next/dev/logs/next-development.log

# route table drift vs Phase 0 baseline: _baseline-routes.txt is the BUILT URL table
# (f/o + path), so compare the "Route (app)" block of `next build` output, not a file list
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

3 files, 31 tests, all passing: `features/news/newsConfig.test.ts`, `features/news/bookmarks.test.ts`,
`app/api/chat/route.test.ts`. (`lib/paraphraser.test.ts` was deleted with its subject in `3805007`.)

**Untested and security-critical:** `lib/urlValidation.ts` (122 lines) and
`server/auth/adminSession.ts` (69 lines, including the `server-only` guard). Both pure, no I/O, trivially testable. Highest value-per-hour work available.
