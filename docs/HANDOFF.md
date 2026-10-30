# TimesPrime — Session Handoff

**For:** a fresh Claude session (or engineer) continuing this work with no prior context.
**State as of:** 2026-10-30. Branch `main`. Two restructures are done:
- **Restructure 2** is complete (S0–S5, `b0c471b` onwards; [ADR 0002](adr/0002-frontend-backend-separation.md)
  accepted). The code is now split into `app/`, `frontend/`, `backend/`, `shared/` and `database/`.
- **Restructure 1** (Phases A–E, [ADR 0001](adr/0001-feature-first-structure.md), now superseded)
  and **Phase 1 of the audit fixes** came before it.

**Next: audit Phase 2 (security)**, from [`AUDIT-FINDINGS.md`](AUDIT-FINDINGS.md) (§11). Run
`git log --oneline -20` for the exact head.

Read §1 and §3 before touching anything. §3 in particular will save you from false conclusions
that have already been reached and discarded once.

---

## 1. Start here

**What this is.** A bilingual (English/Hindi) news aggregator on Next.js 16.4 / React 19.
NewsData.io → Supabase (7-day rolling window) → Supabase-first read path with Upstash Redis
caching. Plus a Cheerio article scraper, Claude Haiku for chat and category classification, an
unofficial Google Translate wrapper, and a session-gated admin panel at `/admin`.

**Where the work stands.**
- **Restructure 1** (Phases 0, 1, A–E) built the knowledge base (PRD, CODEMAP, architecture), took
  the owner's five product decisions (§9), and moved the code into a feature-first `src/`. It also
  made the import rules fail CI.
- **Audit Phase 1** is complete. Of the 28 findings, 6 are resolved, 2 await a check that cannot
  run on this machine, 1 is partly fixed and 19 are open; the status of each is in
  `AUDIT-FINDINGS.md`.
- **Restructure 2** answered the reviewer's request to make frontend, backend, database and docs
  visibly separate. One app, with `app/` as a routing shell
  ([`architecture.md`](architecture.md) §4):
  - The cleanup came first (S1, with follow-ups the owner approved in S2): two stale docs, five
    unused SVGs, an unused script, three unused exports, 24 dead translation keys, two unused colour
    fields, four unused dependencies.
  - S3 moved 95 files in 11 slices. The route table stayed identical and the CSS byte-identical,
    and the client JS changed by 35 bytes.
  - S4 rewrote the lint boundary rules for the new layers (F1–X1 plus V1), opened every backend
    module with `import "server-only"`, and proved each rule with a deliberate violation (46
    probes).
  - S5 brought every document up to date.
- **Phase F (decomposing the oversized files) is optional and not started** (§6).

**The single most important fact:** Supabase **was** failing every call with `TypeError: fetch
failed` until about 29 Oct, and the app hid it by silently serving NewsData.io. On 30 Oct it is
reachable again with no code change (F-002 in the audit ledger). It can no longer fail silently:
`/api/health` answers 503 when it is down, and each fallback is reported to Sentry, rate-limited.
Check `/api/health` before assuming the database is either up or down.

**Key documents in this repo:**

| File | What it holds |
|---|---|
| `docs/README.md` | **Entry point.** What to read, in what order |
| `docs/CODEMAP.md` | **Every module: purpose, LOC, importers, imports, coverage.** Answers "where does X live / what touches Y" without a single grep. Derived from the repo; regenerate after any move |
| `docs/architecture.md` | The layout, the flows, and the import rules (F1–X1, V1, R3–R9, LIB, CR-06) in prose a reviewer can cite |
| `docs/AUDIT-FINDINGS.md` | The 28 audit findings at today's paths and lines, re-verified after restructure 2. **Audit Phase 2 starts here** |
| `docs/PRD.md` | Full PRD: FR-001..024 with code citations, NFR, CR, data model, defect register |
| `docs/BACKLOG.md` | Deferred debt with the reason for each deferral (BL-001..BL-020) |
| `docs/adr/` | ADR 0002 (accepted, this layout) and ADR 0001 (superseded) |
| `docs/_baseline-routes.txt` | The built route table (28 URLs); every structural change must match it byte for byte |
| `CONTRIBUTING.md` | Where new code goes, the verify gate, the commit convention |
| `AGENTS.md` | Project instruction: read the bundled Next docs before using framework APIs |

There is also a published audit artifact (28 findings, severity-filterable):
`https://claude.ai/artifact/Hpo9Q5pJg1vw7ZjXyuT8Ck` — private to the owner.

---

## 2. Environment and commands

| | |
|---|---|
| Platform | Windows 11. Both PowerShell and Git Bash available |
| Node / npm | v24.19.0 / 11.17.0. **Node 24 everywhere** since `974b255`: `.node-version`, `engines` `24.x`, CI |
| Dependencies | Installed via `npm ci` |
| Dev server | **Stopped** during both restructures (its Turbopack watcher can lock files during `git mv`). `npm run dev` to start |
| Line endings | **CRLF** in the working tree (`core.autocrlf=true`; the index is LF) |
| Git identity | Set locally for this repo: `Vivek Singh <vivektech.dev25@gmail.com>`. Not global |

```bash
npm run dev               # dev server (Turbopack)
npm run verify            # THE GATE: typecheck -> lint -> check:boundaries -> test -> build. All five
npm run typecheck         # tsc --noEmit
npm run lint              # eslint, including the boundary rules (eslint.boundaries.mjs)
npm run check:boundaries  # the same rules over the whole graph, plus the transitive client bundle
npm test                  # jest
npm run test:ci           # jest with coverage
```

**Baselines at the end of restructure 2.** Compare against these after any change:

| Measure | Value |
|---|---|
| Routes | **28**, identical to `_baseline-routes.txt` |
| Client JS | **974,067 bytes** in 18 chunks. Per route: `/admin` 161,585 · `/article/[slug]` 140,433 · `/` 125,049 · `/saved` 112,956 · `/contact` 100,198 · `/about`, `/privacy`, `/terms` 97,040 each · `/admin/login` 31,306 |
| CSS | **93,463 bytes**, one file, 920 selectors |
| Tests | **9 suites, 70 tests**, all passing |
| Coverage | **74 files** (the 25 shims excluded): 9.27% of statements (1,116 of 12,038), 53.69% of branches, 37.61% of functions |
| Lint | **0 errors, 14 warnings** (all in source; BL-002 accounts for two) |
| Boundaries | `check:boundaries`: 0 violations |
| `npm audit` | **5 low**: the accepted jest lows (`AUDIT-FINDINGS.md`) |

Client JS is the sum of `.next/static/chunks/**/*.js`. A route's JS is the chunks listed in
`entryJSFiles` of its `.next/server/app/**/page_client-reference-manifest.js`. Chunk bytes move
when module ids do (§3.17).

```
tsc --noEmit             exit 0
eslint                   exit 0   (0 errors, 14 warnings)
check:boundaries         exit 0   (0 violations)
jest --ci                9 suites, 70 tests passed
next build               exit 0   (28 routes)
```

---

## 3. Gotchas that have already burned time

These are not theoretical. Each one caused a wrong conclusion or a failed command in an earlier
session.

### 3.1 This is not the Next.js you were trained on

Next 16.4 postdates most published material. **`AGENTS.md` requires reading
`node_modules/next/dist/docs/` before relying on any framework convention.** Known traps:

| Looks wrong | Actually correct |
|---|---|
| `proxy.ts` instead of `middleware.ts` | Next 16 **renamed Middleware to Proxy**. Correct as-is, at the repository root |
| `preload` prop on `next/image` | Correct. **`priority` is deprecated as of v16.0.0** — the familiar prop is the wrong one |
| `remotePatterns` hostnames using `{,*.}host` glob | Correct. Hostnames are matched with **picomatch**, not string equality (`next/dist/shared/lib/match-remote-pattern.js`) |
| A route file that is one line, `export { GET } from "@/backend/api/…"` | Correct. Restructure 2's shims (A2); the body lives in `backend/api/` |

`remotePatterns` is capped at **50 entries** (zod `.max(50)` in `next/dist/server/config-schema.js`).
The list in `shared/config/imageDomains.ts` holds 49. One slot free.

> A previous pass flagged `preload` as a bug. It was wrong, and the bundled docs settled it.
> **When docs and memory disagree, the bundled docs win.**

### 3.2 Check whether Supabase is up before diagnosing anything

It was down until about 29 Oct — every operation failed: Select, Upsert, Purge, Freshness Check,
breaking-news read — and it is up again on 30 Oct. `GET /api/health` answers 200 or 503;
`/api/admin/health` (with a session) names the failing dependency and an error code. Or confirm
with:

```bash
curl -s -D - -o /dev/null "http://localhost:3000/api/news/top-headlines?refresh=true" | grep -i x-data-source
# newsdata on a fresh table means Supabase failed; supabase or cache means it answered
```

The `X-Data-Source` header tells you which tier answered: `cache` / `supabase` / `newsdata` / `mock`.
Also check `.next/dev/logs/next-development.log` for the actual errors.

### 3.3 CRLF breaks multi-line string anchors

Source files use CRLF in the working tree. Any script doing a multi-line find/replace must
normalise:

```js
const crlf = s.includes('\r\n');
const fix = t => crlf ? t.replace(/\r?\n/g, '\r\n') : t;
```

Single-line anchors are fine. Multi-line ones silently fail to match without this.

### 3.4 Bash heredocs choke on this content

Heredocs containing backticks, `${...}`, or HTML repeatedly failed with quoting errors. **Use the
Write tool for file content, or write a Node script to a scratch file and run it.** Do not fight
the shell. Inline `node -e` with backslash regexes breaks the same way.

### 3.5 `/tmp` paths don't resolve in Node on Windows

`node -e "require('/tmp/x.json')"` fails. Node also resolves `require()` relative to the *script's*
directory, not the cwd. Use absolute Windows paths, and for project modules use
`require(process.cwd() + '/node_modules/...')`.

### 3.6 Jest coverage was lying

`collectCoverageFrom` was unset, so coverage instrumented only files the tests imported — it
reported **91.42%** while describing 5 of 73 source files. Fixed in `4e79cb1`. The real number was
**4.41%**, fell to **3.50%** when `3805007` deleted the paraphraser — one of the few well-covered
modules — and was **3.63%** at `9f3b76f` only because later deletions shrank the denominator.
Restructure 2 measures the whole repo by glob (`7ef8ab8`), excludes the 25 one-line shims by name
from the move map (`2b0f86c`), and the audit fixes added tests: **9.27%** of statements at the end
of restructure 2. The oversized files in §6 still read **0%**.

### 3.7 `eslint-disable-next-line` placement

It disables the **next line**, including a comment line. Putting it at the top of a multi-line
explanation block disables the comment, not the code. The explanation goes first; the directive sits
immediately above the statement.

### 3.8 Two npm postinstall scripts are blocked

`@sentry/cli` and `unrs-resolver` were blocked by sandbox policy. **This does not break anything** —
`npm run build` and `npm run lint` both work. (An earlier claim that it might break the build was
wrong.) `npm approve-scripts --allow-scripts-pending` if source-map upload is ever needed.

### 3.9 Never print `.env.local`

It holds real credentials. It is never read, copied or moved, including for worktrees and probe
builds (owner instruction); a probe build runs without it. Keys set at the last check (names only):
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

The source is fine — do not "fix" it. `rm -rf .next/types` and re-run. It hit the RSS deletion
(`bcd5393`), and every restructure-2 slice that touched `app/` cleared `.next/types` first. Durable
fix: `next typegen` in the `typecheck` script (BL-007).

### 3.11 Verify claims against the build, not just the graph

`docs/CODEMAP.md`'s boundary count is a static cross-check. When it matters, check the production
bundle: `grep -l <distinctive-string> .next/static/chunks/*.js`, then find which route loads that
chunk in `.next/server/app/**/page_client-reference-manifest.js`. That is how the Supabase SDK in
`/admin`'s chunk was confirmed (`GoTrueClient`), with server-only strings as a negative control, and
how S5 confirmed a same-length image URL change actually shipped.

### 3.12 A barrel imported by a server component ships every client component it re-exports

Measured in restructure 1, slice 5: `app/layout.tsx` importing `BreakingNewsBanner` from the admin
feature's barrel put all five admin dashboard components on **every** route (+46 KB on `/`).
`"use client"` on the barrel does not help — the module count drops but the bytes stay. What fixes
it is the `package.json` in each feature folder: today `{ "sideEffects": false }` in each
`frontend/features/*/` (`bae6f8a`). Restructure 2 measured it again with the field removed: every
route got heavier, by +457 bytes to +84,579 bytes. **Do not delete those files as clutter**, and do
not put a side-effect-only import (CSS, polyfill) inside a feature.

### 3.13 `sed -i` silently converts CRLF files to LF

Git Bash's `sed -i` rewrites the line endings of every file it touches. The index is LF
(`core.autocrlf=true`), so commits are unaffected, but the working copy drifts. Rewrite with a Node
script that detects and restores `\r\n`, and check with `git ls-files --eol <file>`.

### 3.14 Path-keyed lists in the scripts go stale silently on a move

`generate-codemap.mjs` keys `PURPOSE`, `SERVER_ONLY` and its table groups by path, through the move
map. Each throws if an entry names a missing file or a module matches no group (`ab8661b`,
`21c8951`). Keep it that way: a policy list that tolerates a stale path reports success while
checking nothing. `scripts/move-map.mjs` itself now has consumers: `SHIMS` drives the coverage
exclusion (`jest.config.ts`) and A2 in lint (`eslint.boundaries.mjs`).

### 3.15 Directory renames fail on Windows while the editor watches them

`git mv src/app app` failed with "Permission denied": VS Code's TypeScript server holds watch
handles on the directories. Restructure 2 moved files one by one instead (`git mv` per file, with
`GIT_LITERAL_PATHSPECS=1` for paths like `[slug]`), then removed the empty folders. Do not kill
editor processes to get around it (owner instruction).

### 3.16 Tailwind v4 scans every file that is not git-ignored

Class detection is automatic and reads Markdown and comments too. A word in a document once removed
a CSS rule when the document was deleted (BL-018). `frontend/styles/globals.css` now excludes
`docs/`, `scripts/`, `database/` and the root `.md` files with `@source not`, with paths relative to
the stylesheet. Code comments and tests are still scanned: `.transform` is in the CSS only because
`jest.config.ts` comments say "transform".

### 3.17 Turbopack's chunk bytes move when module ids do

Module ids derive from paths, so a pure move changes chunk bytes with no code change. Restructure 2
compared a **normalised** JS size per route (digits, hashes, chunk names and UUIDs neutralised) to
tell that noise from real growth. In S3 the normalised size moved only where the code really
changed; the one growth kept was the X1 entry point on `/` (109 bytes at slice 9, 50 by the end of
S3; ADR 0002).

### 3.18 `next start` reads `.env.local`, so a local run uses the real Supabase

Next loads `.env.local` itself. A local `next start` therefore runs the app's normal flow against
the configured project: the feed's read path purges old rows (F-015), and a stale table triggers a
NewsData fetch and an upsert. The S3 smoke tests did exactly that (reported to the owner). Nothing
in this repo writes to the database by hand: SQL changes are files in `database/` that the owner
applies.

---

## 4. Commits — restructure 2

`f260d3e` closed audit Phase 1. Everything after it is restructure 2. Restructure 1 and Phase 1 are
in `git log` before it, with their reasoning in ADR 0001 and the audit ledger.

| Stage | Commits | What it did |
|---|---|---|
| **S0** design | `b0c471b` | Move map v2 (95 files, 11 slices) and its checker, run against the rules before anything moved |
| **S1** cleanup | `26adbbd`..`8881bd1`, then `dbc4821`, `6327110`, `c2ab97a` | Deletions only, one category per commit. Two stale docs, five unused SVGs, an unused script, three unused exports, 24 dead translation keys, two unused colour fields (16 CSS rules), four unused dependencies |
| **S2** tooling | `6a1382d`..`381805f` | Tailwind stops scanning docs (BL-018); `@/frontend`, `@/backend`, `@/shared` aliases; layout-independent coverage, secret scan and CODEMAP; the per-slice checklist |
| **S3** moves | `b0fe915`..`2b9cb94` | 11 slices (slice 7 in six commits), pure moves. Plus `4460a40` (the news barrel stops exporting views), `ecdd8ea` (ADR 0002 draft), `bae6f8a` (`sideEffects: false`) |
| **S4** enforcement | `705b32e`..`5f6b0cc` | `@/*` removed; shims excluded from coverage by name; `import "server-only"` on all 32 backend modules (proved by a failing build); R5 restored; A1 and V1 added; lint rewritten for F1–X1 and V1, each rule proved by a probe (46 in all); BL-019 and BL-020 logged |
| **S5** docs | `c3c4387`..this file | BL-020 fixed (`c3c4387`); CONTRIBUTING's "Where does new code go?"; architecture, both ADRs, CODEMAP (and its generator's prose), README "Project structure", AUDIT-FINDINGS, PRD, backlog, this file |

Every commit passed `npm run verify`. Every commit that touched `app/` or deleted anything was
diffed against the route table, and every one matched it. CI was green at each push.

**Retired:** `docs/TimesPrime-PRD-and-Architecture.pdf` was committed in `ddbcc9f`, then untracked
and git-ignored at the owner's direction. `docs/PRD.md` is the only canonical spec — do not consult
the PDF if a copy exists on disk.

---

## 5. Architecture

The flows (ingest, serve, authorise), the layout, the rules and each folder's responsibilities are
in [`architecture.md`](architecture.md). The tree, in short:

```
app/          URLs: route and page files, mostly one-line re-exports; two composition pages
frontend/     views/ · features/{news,admin,chat} · components/ui · context · styles
backend/      api/ · services/{news,classify,health,translate} · repositories · auth · lib
shared/       config · types · validation
database/     schema.sql · policies.sql · seed/
proxy.ts · instrumentation*.ts · sentry.*.config.ts    framework-pinned at the root
```

**Authorisation is still the one choke point:** `proxy.ts`, matcher `/admin/*` and
`/api/admin/*`. No route handler does its own auth check, so a route outside the matcher is public.

### Files over 500 lines (all at 0% coverage)

| File | LOC |
|---|--:|
| `frontend/views/article/ArticleDetailView.tsx` | 963 |
| `frontend/features/admin/ArticlesTable.tsx` | 751 |
| `backend/repositories/db.ts` | 613 |
| `frontend/features/news/Header.tsx` | 568 |
| `backend/api/news/scrape-article.ts` | 558 |
| `frontend/views/home/HomeClient.tsx` | 529 |
| `frontend/views/admin/AdminView.tsx` | 506 |

---

## 6. Structural work — where it stands

| Work | Status |
|---|---|
| Restructure 1: Phases 0, 1, A, C, D, E | ✅ Done (ADR 0001, superseded) |
| Restructure 2: S0 design, S1 cleanup, S2 tooling, S3 moves, S4 enforcement, S5 docs | ✅ Done (ADR 0002, accepted) |
| **Phase F** — decompose the oversized files; move route-body logic into services | Optional, not started; needs an owner decision |

### Phase F candidates — which need a characterization test first

All seven are at 0% coverage. Decomposing any of them edits a module body, so each needs a
characterization test first. The only part that splits by pure move is noted.

| File | Lines | Shape | Test first? |
|---|--:|---|---|
| `frontend/views/article/ArticleDetailView.tsx` | 963 | One ~885-line component: 10 `useState`, 3 effects, 3 `fetch`es (scrape, translate, chat) | **Yes** — render with mocked `fetch`: scrape success, scrape fallback, translate. DEF-03/04/10 live here, so coordinate with the security work |
| `frontend/features/admin/ArticlesTable.tsx` | 751 | Table plus two modals already at module scope (`EditArticleModal`, `PreviewArticleModal`) | **Yes** for the table logic. The two modals can move to their own files as a pure move |
| `backend/repositories/db.ts` | 613 | Pure helpers (filters, language script, paywall) + Supabase-backed functions | **Yes**. The pure helpers are cheap to test with no database; the rest needs a Supabase mock (`db.test.ts` has one). BL-001, DEF-05, DEF-08 sit here |
| `frontend/features/news/Header.tsx` | 568 | One ~528-line component: 9 `useState`, 5 effects | **Yes** |
| `backend/api/news/scrape-article.ts` | 558 | Many pure extraction helpers + the handler | **Yes** — HTML fixtures through the pure helpers. The logic belongs in a service (architecture §5, "What code does"). DEF-02/10 here; coordinate with the security work |
| `frontend/views/home/HomeClient.tsx` | 529 | 3 small pure helpers + a ~457-line component with 2-minute polling | **Yes** — fake timers for the poll |
| `frontend/views/admin/AdminView.tsx` | 506 | One component: 20 `useState`, 5 `fetch`es | **Yes**. Its data logic belongs in `frontend/features/admin` |

**Cheapest first:** the pure helpers in `scrape-article` and `db.ts` need no rendering and no
database, so they buy the most safety per hour.

---

## 7. Known defects — current behaviour that is NOT intended

Numbered to match `docs/PRD.md` §11. These are deliberately excluded from the requirement set so no
future reader mistakes them for design. Audit status and current locations: `AUDIT-FINDINGS.md`.

| ID | Defect | Severity |
|---|---|---|
| DEF-01 | Supabase calls failed and the app silently served upstream instead. Reachable again since 30 Oct, and no longer silent: F-002 awaits its production check | **Critical** |
| DEF-02 | Scraper follows up to 21 redirects, none re-validated — defeats the SSRF guard running immediately before it | **Critical** |
| DEF-03 | Two of four publisher links render an unvalidated `targetUrl` from the query string. Branded phishing surface. (The `javascript:` XSS variant is **refuted** — React 19 blocks it) | High |
| DEF-04 | AI panel prints a canned "Key Takeaway" when the API fails, as if it were a real answer. `Chatbot.tsx` handles the same failure honestly | High |
| DEF-05 | `purgeOldArticles()` runs a DELETE on the feed read path | Medium |
| DEF-06 | Admin login unthrottled; password compare returns early on length mismatch, leaking length | High |
| DEF-07 | `breaking_news` and `admin_logs` exist only as SQL inside comments in their route bodies, not in `database/schema.sql` | High |
| DEF-08 | Feed fetches 80 rows, filters in JS, slices to 40 — under-fills exactly when a spam source floods | Medium |
| DEF-09 | ~~Contact form and newsletter show success, send nothing~~ — **resolved by removal** in `59b875d` | Resolved |
| DEF-10 | Scraper returns HTTP 200 with placeholder prose on failure; UI detects errors by string-matching three hard-coded sentences | Medium |

**`npm audit`:** 5 low, the jest packages accepted by owner ruling. The criticals and highs were
cleared in Phase 1 (`47e62ae`, `56e7509`, `31f4a54`, `5970692`).

---

## 8. Backlog (`docs/BACKLOG.md`)

**Open:**
- BL-001 (`any` in `db.ts`'s row mapping), BL-002 (two `set-state-in-effect` warnings). Both need
  logic changes behind tests (Phase F).
- BL-004 (editorial publishing hardcodes `country: ["us"]`) and BL-006 (stored paraphrased titles,
  self-heals). BL-005, real contact and newsletter backends, is future feature work.
- BL-007 (`next typegen` in `typecheck`, a one-line change) and BL-009 (two cosmetic leftovers).
- BL-008 (privacy policy, needs the owner or legal).
- BL-013 (in-memory cache eviction, with F-020 in audit Phase 2) and BL-015 (`urlValidation` →
  `shared/validation` with F-005, split at its DNS step).
- BL-016 (the article page fetches its own API over HTTP) and BL-019 (an image optimizer timeout:
  act only if it recurs).

**Resolved:** BL-003, BL-010, BL-011, BL-012, BL-014, BL-017, BL-018, BL-020.

---

## 9. Owner decisions

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

**Follow-up the product decisions created:** the privacy policy still describes newsletter and
contact-form collection that no longer happens. Legal copy, for the owner or legal review (BL-008).

---

## 10. Conventions to follow

- **`npm run verify` must pass before any commit.** All five, not a subset. `tsc` catches imports
  that no longer resolve; `eslint` catches the ones left behind and every boundary-rule break;
  `check:boundaries` catches a client module reaching `backend/` transitively; `jest` covers the
  thin tested slice; `build` catches route resolution and server/client boundary violations.
- **Three kinds of commit, never mixed:** a move (`git mv`, plus the import and path references the
  move invalidated), a deletion (`git rm`, plus the imports and index links that pointed at it), or
  a change. One finding per commit for audit fixes, prefixed with its ID.
- **A red change is reverted, not patched.**
- **Defer, don't fix.** Anything tempting found mid-task goes to `docs/BACKLOG.md` with its reason.
- **No `any`.** Use `unknown` + a narrowing guard, or one `eslint-disable-next-line` with a stated
  reason and a backlog entry.
- **Match the comment density.** This codebase documents *why*, citing evidence and rejected
  alternatives. That convention is its best feature — preserve comments verbatim through moves.
- **New code goes where `CONTRIBUTING.md` says**, and every boundary rule names itself when it fails.
- **Stop at every phase gate.** Present output, wait for approval.

---

## 11. Immediate next actions

**Next session: audit Phase 2 (security)**, from `docs/AUDIT-FINDINGS.md`, whose locations were
re-verified after restructure 2:

1. Tests first for `backend/lib/urlValidation.ts` and `backend/auth/adminSession.ts` (§12).
2. Then F-003 (scraper redirects), F-010 (input size caps), F-020 with BL-013 (eviction, owner:
   deferred into Phase 2), F-004 and F-011 (D1: a Redis-backed limiter for login and the scraper),
   F-005 (with BL-015's split of `urlValidation`), F-006.

**Open with the owner:**
- Is production on the same Supabase project as `.env.local` (project ref `yhjotyxrdaqtcgsxigok`)?
  Not confirmable from here: production env lives in Vercel, and GitHub carries no Vercel
  deployments or statuses. Read-only evidence against it: all 78 articles were inserted in 7
  minutes that match this machine's own activity, none on the cron's :00/:30 schedule, and
  `admin_logs` holds no `news_synced` row although the cron writes one per run. So production
  either uses another project or its cron is not running. If it is the same project, local runs
  write to the production database (§3.18), and it needs a separate dev project.
- `/api/health` shares one result for 15 s per instance (`HEALTH_CACHE_MS`). Proposed: 60 s. Not
  implemented; awaiting approval.
- The Vercel project's Node version (F-026's last check).
- The privacy policy (BL-008).

**Also open:** Phase F (§6) is optional. Set `ANTHROPIC_API_KEY` locally to see the chat route
stream end to end; on this machine it answers 503 by design. Promoting `breaking_news` and
`admin_logs` into `database/schema.sql` (DEF-07, F-008) is independent of the rest.

---

## 12. Quick reference

### Useful probes

```bash
# which tier answered
curl -s -D - -o /dev/null "http://localhost:3000/api/news/top-headlines?refresh=true" | grep -i x-data-source

# real runtime errors
tail -40 .next/dev/logs/next-development.log

# route table drift vs the baseline: _baseline-routes.txt is the BUILT URL table
# (f/o + path), so compare the "Route (app)" block of `next build` output, not a file list
git ls-files 'app/**/page.tsx' 'app/**/route.ts' | sort

# the boundary rules, with the rule ID in every message
npm run lint && npm run check:boundaries

# confirm framework behaviour instead of guessing
node -e "const pm=require('next/dist/compiled/picomatch'); console.log(pm.makeRe('{,*.}newsdata.io').test('i.newsdata.io'))"
```

### Data model

`database/schema.sql` defines **`articles` only** — 15 columns, `article_id` unique,
`category`/`country`/`category_mismatches` are `TEXT[]`. Only `id`, `article_id`, `title`,
`created_at` are NOT NULL (this is the root of BL-001).

`breaking_news` and `admin_logs` are used by code but **not in committed SQL** (DEF-07): their DDL
is in comments in `backend/api/admin/breaking-news.ts` and `backend/api/admin/logs.ts`.

Indexes: `created_at`, `article_id`. Queries also filter on `category`/`country` (array containment
— wants GIN) and `title`/`description` with `ILIKE '%…%'` (wants `pg_trgm`).

### Test suite

9 files, 70 tests, all passing:
- `backend/api/admin/health.test.ts`, `backend/api/chat.test.ts`, `backend/api/health.test.ts`;
- `backend/lib/reportFallback.test.ts`, `backend/repositories/db.test.ts`,
  `backend/services/health/health.test.ts`;
- `frontend/features/news/bookmarks.test.ts`;
- `shared/config/newsConfig.test.ts`, `shared/validation/sentryScrub.test.ts`.

**Untested and security-critical:** `backend/lib/urlValidation.ts` (124 lines) and
`backend/auth/adminSession.ts` (69 lines). Both pure, no I/O, trivially testable. The highest
value-per-hour work available, and audit Phase 2's first step.
