# TimesPrime — Session Handoff

**For:** a fresh Claude session (or engineer) continuing this work with no prior context.
**State as of:** 2026-11-02. Branch `main`. Two restructures and all five audit phases are done:
- **Audit Phases 1–5** fixed the 28 audit findings. None is open: 22 are resolved, 5 await a check
  that needs production or the owner, and 1 (F-028) is partial. Status per finding:
  [`AUDIT-FINDINGS.md`](AUDIT-FINDINGS.md).
- **Restructure 2** is complete (S0–S5, [ADR 0002](adr/0002-frontend-backend-separation.md)
  accepted). The code is split into `app/`, `frontend/`, `backend/`, `shared/` and `database/`.
- **Restructure 1** (Phases A–E, [ADR 0001](adr/0001-feature-first-structure.md), now superseded)
  came before it.

**Next: Panel 0 (Access foundation)**, the first panel of the back office: staff accounts, roles,
permissions, MFA, the audit log and the server-side permission check. The plan is
[`PANEL_PLAN.md`](PANEL_PLAN.md); progress and per-panel docs are in [`PANEL_DOCS.md`](PANEL_DOCS.md).
Panels are built one at a time, and Panel 0 starts with a design for the owner to approve. The
deployment phase (§11) stays on the owner's list. Run `git log --oneline -20` for the exact head.

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
- **Audit Phase 1** cleared the critical and high dependency advisories and added `/api/health`.
  **Phases 2–5** (after restructure 2) fixed the security findings, the data layer and the
  failure and UX findings, then closed out (§4). Every finding has a status in `AUDIT-FINDINGS.md`.
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
| `docs/AUDIT-FINDINGS.md` | The 28 audit findings, each with its status and fixing commit, and the `npm audit` history |
| `docs/PRD.md` | Full PRD: FR-001..024 with code citations, NFR, CR, data model, defect register |
| `docs/BACKLOG.md` | Deferred debt with the reason for each deferral (BL-001..BL-032) |
| `docs/runbooks/apply-database.md` | **For the deployment phase.** Apply the SQL files in order, verify each, roll back each |
| `docs/PANEL_PLAN.md` | **For the back office.** The owner's reference plan: panels, roles, permission matrix, four-eyes and MFA rules, data model. Not edited |
| `docs/PANEL_DOCS.md` | Back-office progress (panels 0–9) and each finished panel's record, from one template |
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

**Baselines at the audit Phase 5 close-out (2026-11-02).** Compare against these after any change:

| Measure | Value |
|---|---|
| Routes | **28**, identical to `_baseline-routes.txt` |
| Client JS | **976,061 bytes** in 18 chunks (restructure 2 ended at 974,067). Per route: `/admin` 162,443 · `/article/[slug]` 141,655 · `/` 125,795 · `/saved` 113,333 · `/contact` 100,601 · `/about`, `/privacy`, `/terms` 97,443 each · `/admin/login` 31,750 · `/_not-found` 28,259 |
| CSS | **93,540 bytes**, one file, 921 selectors (+1 in F-027: `dark:hover:text-white`) |
| Tests | **32 suites, 388 tests**, all passing |
| Coverage | **80 files** (the shims excluded): 47.01% of statements (5,968 of 12,694), 71.33% of branches, 61.84% of functions. `backend/` + `shared/`: 61.51% (3,448 of 5,606) |
| Lint | **0 errors, 13 warnings** (all in source; BL-002 accounts for two) |
| Boundaries | `check:boundaries`: 0 violations. CODEMAP: 0 server-only modules in the client bundle |
| `npm audit` | **37: 0 critical, 0 high, 34 moderate, 3 low**. The moderates are dev and build tooling (BL-031); the lows are the accepted jest set |

Client JS is the sum of `.next/static/chunks/**/*.js`. A route's JS is the chunks listed in
`entryJSFiles` of its `.next/server/app/**/page_client-reference-manifest.js`. Chunk bytes move
when module ids do (§3.17).

```
tsc --noEmit             exit 0
eslint                   exit 0   (0 errors, 13 warnings)
check:boundaries         exit 0   (0 violations)
jest --ci                32 suites, 388 tests passed
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
the configured project: a stale table triggers a NewsData fetch and an upsert. (Before F-015, the
feed's read path also purged old rows.) In audit Phase 4, `next start` was run only to read static
HTML (`/about`, and an `/article/...` URL without `?url=`), on port 3123, so the article page's
suggestions fetch to `localhost:3000` failed and wrote nothing. The S3 smoke tests did exactly that (reported to the owner). Nothing
in this repo writes to the database by hand: SQL changes are files in `database/` that the owner
applies.

### 3.19 `TaskStop` leaves `next start` running on Windows

Stopping a background `npx next start` with `TaskStop` kills `npx`, not its `node` child, which keeps
the port. The next `next start` then fails with `EADDRINUSE`, and `curl` silently answers from the
**old** build. Before trusting a page, list them with
`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? CommandLine -match 'next.*start'` and
stop the leftovers with `Stop-Process`.

---

## 4. Commits — restructure 2, then audit Phases 2–5

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

**Audit Phases 2–5** (after `f1d268c`). One finding per commit, each prefixed with its ID; tests first
for security code, and characterization tests first for untested UI and route logic.

| Phase | Commits | What it did |
|---|---|---|
| **2** security | `487eb47`..`25d1c7f` | F-003 (redirects revalidated, connections pinned), F-010 (size caps), F-020 and BL-013 (eviction), F-004 (login limit, digest compare), F-011 (scraper limit), F-005 (stored-article trust anchor), F-006 (search escaping), F-015 (purge off the read path) |
| **2** follow-up | `3d8b5ed`..`fcdf1db` | BL-016: the article page calls the scraper directly, which fixes BL-021; the public scraper takes only stored articles; Retry-After on chat and translate |
| **3** data layer | `db28a46`..`9e5c5ad` | F-008 (DDL and policies as files), F-018 (index migration), F-016 (feed fills to 40), the owner runbook with its rollback, the `#`-link tests |
| **4** honest failure, UX | `e582d2d`..`ecc4a31` | Admin search escaping, F-013, F-014, F-017, F-021, F-024, F-022, F-009, F-027, F-028 |
| **5** close-out | `96f192d`..this file | BL-027 (the first search result), BL-029 (no public-prefixed key), the ledger, PRD, CODEMAP, this file |

Every commit passed `npm run verify` and reported client JS and CSS. No route changed.

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
backend/      api/ · services/{news,classify,health,translate,scrape} · repositories · auth · lib
shared/       config · types · validation
database/     schema.sql · policies.sql · migrations/ · seed/
proxy.ts · instrumentation*.ts · sentry.*.config.ts    framework-pinned at the root
```

**Authorisation is still the one choke point:** `proxy.ts`, matcher `/admin/*` and
`/api/admin/*`. No route handler does its own auth check, so a route outside the matcher is public.

### Files over 500 lines

| File | LOC | Statements covered |
|---|--:|--:|
| `frontend/views/article/ArticleDetailView.tsx` | 970 | tested (F-005, F-013, F-017) |
| `frontend/features/admin/ArticlesTable.tsx` | 751 | 0% |
| `backend/repositories/db.ts` | 678 | 71.8% |
| `backend/services/scrape/scrapeArticle.ts` | 580 | 87.1% |
| `frontend/features/news/Header.tsx` | 568 | stubbed in tests |
| `frontend/views/home/HomeClient.tsx` | 561 | tested (F-021, BL-027) |
| `frontend/views/admin/AdminView.tsx` | 521 | tested (F-014) |

Per-file coverage: [`CODEMAP.md`](CODEMAP.md).

---

## 6. Structural work — where it stands

| Work | Status |
|---|---|
| Restructure 1: Phases 0, 1, A, C, D, E | ✅ Done (ADR 0001, superseded) |
| Restructure 2: S0 design, S1 cleanup, S2 tooling, S3 moves, S4 enforcement, S5 docs | ✅ Done (ADR 0002, accepted) |
| **Phase F** — decompose the oversized files; move route-body logic into services | Optional, not started; needs an owner decision |

### Phase F candidates

Decomposing any of the files above edits a module body, so each needs a characterization test of
what it splits. The audit phases added most of them: `ArticleDetailView` (links, the AI panel, the
story area), `HomeClient` (the feed's fetches and search), `AdminView` (sync and purge),
`scrapeArticle` and `db.ts` (through their route and repository tests). Still untested:
`ArticlesTable.tsx`, whose two modals already sit at module scope and can move to their own files as
a pure move, and `Header.tsx`.

---

## 7. Known defects — current behaviour that is NOT intended

Numbered to match `docs/PRD.md` §11, which now carries a Status column. Of DEF-01..25, all but six
are resolved:

| ID | What remains | Status |
|---|---|---|
| DEF-01 | Supabase reachable again and no longer silent; `/api/health` 200 and a Sentry fallback event in production | Pending verification (F-002) |
| DEF-07 | `breaking_news` and `admin_logs` DDL in `database/schema.sql`; the owner applies it | Pending verification (F-008) |
| DEF-12 | Search escaping fixed; the injection probe against the live database | Pending verification (F-006) |
| DEF-18 | The index migration; the owner applies it | Pending verification (F-018) |
| DEF-23 | The Vercel project's Node version | Pending verification (F-026) |
| DEF-25 | `dark:` classes right before paint; 75 `isDark` ternaries still switch after hydration | Partial (F-028, BL-028) |

**`npm audit`:** 0 critical, 0 high. 34 moderate in dev and build tooling, published after Phase 1 (BL-031), and the 3 accepted jest lows.

---

## 8. Backlog (`docs/BACKLOG.md`)

**Open:**
- BL-001 (`any` in `db.ts`'s row mapping), BL-002 (two `set-state-in-effect` warnings). Both need
  logic changes behind tests (Phase F).
- BL-004 (editorial publishing hardcodes `country: ["us"]`) and BL-006 (stored paraphrased titles,
  self-heals). BL-005, real contact and newsletter backends, is future feature work.
- BL-007 (`next typegen` in `typecheck`, a one-line change) and BL-009 (two cosmetic leftovers).
- BL-008 (privacy policy, needs the owner or legal).
- BL-016's remainder (the suggestions fetch is still HTTP; no per-IP limit on its route) and BL-019
  (an image optimizer timeout: act only if it recurs).
- BL-022 (a public scrape writes `articles.content`; kept by the owner), BL-023 (signed links, only if
  needed), BL-024 (nullable columns, deployment phase), BL-025 (the anon-key fallback).
- BL-026 (headline translation, a feature), BL-028 (theme ternaries), BL-030 (lazy-load the chatbot),
  BL-031 (the new moderate advisories), BL-032 (A2 for new pages).

**Resolved:** BL-003, BL-010, BL-011, BL-012, BL-013, BL-014, BL-015, BL-017, BL-018, BL-020, BL-021,
BL-027, BL-029.

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

## 11. Immediate next actions — the deployment phase

Nothing below can be done from this machine without touching production. It is the owner's list.

**Database** ([`runbooks/apply-database.md`](runbooks/apply-database.md)):
1. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set in the deployment (present, not copied). Without it the
   app falls back to the anon key and RLS refuses every write (BL-025).
2. Take the step 0 snapshot and confirm `service_role` has `rolbypassrls`.
3. Apply `database/schema.sql`, then `database/policies.sql`, then
   `database/migrations/2026-11-02-indexes.sql`. Verify each as the runbook shows. Each has a
   rollback. This closes F-008 and F-018 (the F-005 and scraper lookups use the link index).
4. Before any `NOT NULL` migration, count the nulls in live data (BL-024).
5. Re-run the F-006 injection probe, and an RLS check, against the live database.

**Environment and platform:**
- Confirm whether local and production use the same Supabase project (`.env.local` names
  `yhjotyxrdaqtcgsxigok`). If they do, set up a separate dev project: a local run writes to it (§3.18).
- Vercel: Node 24 (F-026), `NEXT_PUBLIC_SENTRY_DSN`, the Upstash variables, `CRON_SECRET`, and that
  the cron runs. No production cron entry has ever been seen in the database.
- Owner's `.env.local`: `ADMIN_SECRET_TOKEN` and `MEDIASTACK_API_KEY` can go; nothing reads them.
  Never set `NEXT_PUBLIC_NEWSDATA_API_KEY`.

**Production smoke test:**
- `/api/health` answers 200, and Sentry receives a Supabase fallback event (F-002).
- `X-Data-Source` shows `supabase` or `cache` for readers (NFR-01).
- The cron runs and its audit entry carries the purge count (F-015).
- The Redis limiter: the 11th login attempt in 15 minutes and the 31st uncached scrape in a minute
  answer 429 across instances (F-004, F-011).
- BL-019 (publisher image timeouts) under real traffic.

**Not covered by any audit:** accessibility (axe-core), a scraper replay against the 120-URL
publisher sample, a staging environment, Supabase backup and restore, end-to-end tests, and a bundle
budget in CI.

**Open with the owner:** the privacy policy (BL-008); BL-031 (accept the moderate advisories or wait);
Phase F (§6) is optional.

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

`database/schema.sql` defines all three tables, `IF NOT EXISTS`, with RLS enabled:
- `articles`: 15 columns, `article_id` unique, `category`/`country`/`category_mismatches` are `TEXT[]`.
  Only `id`, `article_id`, `title` and `created_at` are NOT NULL (the root of BL-001).
- `breaking_news` and `admin_logs`, committed in `db28a46` (F-008); their nullable columns are BL-024.

Policies and grants are in `database/policies.sql`. Indexes: `created_at` and `article_id` in the
schema; GIN on `category`/`country`, trigram on `title`/`description`, and `link` in
`database/migrations/2026-11-02-indexes.sql`. None of it is applied by the app: the owner applies it
(§11).

### Test suite

32 files, 388 tests, all passing. Every security module has tests: `urlValidation` (73),
`fetchPage` (real axios against a local server), `adminSession`, the login and scrape routes, the
rate limiter (memory and Redis), the size-capped body reader, and the search escaping. Repo-reading
tests keep the SQL in step with the code (`backend/repositories/schema.test.ts`, including the
runbook's rollback), and `.env.local.example` in step with `process.env`
(`shared/config/envExample.test.ts`). Untested: `proxy.ts` (0%), `ArticlesTable.tsx` and `Header.tsx`.
