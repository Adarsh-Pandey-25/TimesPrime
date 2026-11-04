# TimesPrime — Session Handoff

> **⚠ Nothing is deployed until the whole project is complete (owner decision, 2026-11-02).** Ignore
> any earlier Vercel deployment; the target is AWS (`ap-south-1`), at the end. All verification is
> local, and **never against the database `.env.local` points at**, which may be production: Panel 0's
> migrations, bootstrap and smoke tests wait for a local database (§2). Since `78e58b6` every admin
> change writes `audit_log` first and refuses with 503 without it, so the app needs Panel 0's
> migrations wherever it runs.
>
> **Branch rule:** all work happens on a branch (`panel-N-<name>`, `fix/<topic>`, `chore/<topic>`),
> and only that branch is pushed. Nothing is pushed to `main` directly: a branch is merged into
> `main`, and `main` pushed, only after the owner approves.

**For:** a fresh Claude session (or engineer) continuing this work with no prior context.
**State as of:** 2026-11-04. **Panel 0 (Access foundation) is complete on the branch
`panel-0-access`** and awaits the owner's approval to merge; its first half is on `main`
([`PANEL_DOCS.md`](PANEL_DOCS.md), §4). None of its SQL is applied yet. **On top of it, the branch
`chore/restructure`** (local, 8 commits, not pushed) holds:
- restructure 3, the standard `src/` layout and the cleanup (ADR 0004);
- the owner-approved build plan [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md) and its research
  ([`RESEARCH.md`](RESEARCH.md)), with `PANEL_PLAN.md` and the PRD retired (the matrix lives on in
  [`PERMISSIONS.md`](PERMISSIONS.md));
- **restructure 4**, the plan's Phase C: `apps/web`, `apps/admin`, `apps/worker` over
  `packages/server`, `packages/shared` and `packages/ui` ([ADR 0005](adr/0005-apps-and-packages.md)).

It merges into `panel-0-access` once the owner approves, so Panel 0 finishes in the new layout.
50 suites, 753 tests passing; every old route present across the two apps. Before it, two
restructures and all five audit phases were done:
- **Audit Phases 1–5** fixed the 28 audit findings. None is open: 22 are resolved, 5 await a check
  that needs production or the owner, and 1 (F-028) is partial. Status per finding:
  [`AUDIT-FINDINGS.md`](AUDIT-FINDINGS.md).
- **Restructure 2** (S0–S5, [ADR 0002](adr/0002-frontend-backend-separation.md), now superseded by
  ADR 0004) split the code into `app/`, `frontend/`, `backend/`, `shared/` and `database/`.
- **Restructure 1** (Phases A–E, [ADR 0001](adr/0001-feature-first-structure.md), now superseded)
  came before it.

**Next:** the first phase in the Progress table of [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md) that is not
Done. Today that is **Phase A**:
1. The owner approves `chore/restructure`; it is pushed and merged into `panel-0-access`.
2. **A local database** (Supabase CLI stack in Docker; not set up yet). Until it runs, no Panel 0
   migration, bootstrap or staff sign-in is run anywhere.
3. **Finish Panel 0 locally:**
   - `staff-access.md` step by step against the local database;
   - definition-of-done items 7–13 (real-database tests in `npm run test:db`, end-to-end browser
     tests, states, accessibility, Sentry, the JS budget in CI, a runbook).
4. The owner approves; `panel-0-access` is merged into `main`.

Then Phase B (`fix/aggregator-off`, then `fix/audit-closeout`: F-028/BL-028, the local SQL checks for
F-006/F-008/F-018, the F-002 check, BL-030), then Panel 1.

The plan is [`NEWSROOM_PLAN.md`](NEWSROOM_PLAN.md); the access rules are [`PERMISSIONS.md`](PERMISSIONS.md); the panels, one at a time, are in
[`PANEL_DOCS.md`](PANEL_DOCS.md). Run `git log --oneline -20` on the branch for the exact head.

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
  visibly separate. One app, with `src/app/` as a routing shell
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
| `docs/architecture.md` | The flows, the layout (where each kind of code lives), and the import rules |
| `docs/AUDIT-FINDINGS.md` | The 28 audit findings, each with its status and fixing commit, and the `npm audit` history |
| `docs/BACKLOG.md` | Deferred debt with the reason for each deferral (BL-001..BL-034) |
| `docs/runbooks/apply-database.md` | Apply the SQL files in order, verify each, roll back each: on a local database now, on production at the AWS deployment |
| `docs/NEWSROOM_PLAN.md` | **The build plan.** The phases from Panel 0 to launch and after, their order, owner tasks and the sign-off |
| `docs/PERMISSIONS.md` | **For the back office.** Panels, roles, the permission matrix (the catalogue SQL is generated from it), four-eyes and MFA rules, data model |
| `docs/PANEL_DOCS.md` | Back-office progress (panels 0–9) and each finished panel's record, from one template. **Panel 0 is written up there** |
| `docs/design/panel-0-access-foundation.md` | Panel 0's design as approved, with the owner's decisions (D1–D12, Q1–Q8) and the amendments |
| `docs/runbooks/staff-access.md` | **For switching Panel 0 on.** The order (migrations, deploy, bootstrap, staff sign-in, freeze, then the shared password off), each step's check and undo, and how to get back in |
| `docs/adr/` | ADR 0004 (proposed, this layout), ADR 0003 (accepted, the section rule for permission scope), ADR 0002 and ADR 0001 (superseded) |
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
| Local database | **None yet.** `.env.local` may point at production, so nothing that writes (Panel 0's SQL, the bootstrap, a smoke test that signs in or changes data) may run with it. A local Supabase is proposed to the owner (Docker stack, or a separate dev project), with a guard that refuses any run whose Supabase URL is not the local one |
| Deployment | **None until the project is complete.** Then AWS, `ap-south-1` (§11) |
| Line endings | **CRLF** in a Windows working tree (`core.autocrlf=true`); LF on the owner's macOS checkout. The index is LF |
| Git identity | Set locally for this repo: `Vivek Singh <vivektech.dev25@gmail.com>`. Not global |

```bash
npm run dev               # the reader site (apps/web), http://localhost:3000
npm run dev:admin         # the back office (apps/admin), http://localhost:3001/admin
npm run job -- <name>     # a worker job (apps/worker); refresh-news writes to the configured database
npm run verify            # THE GATE: typecheck -> lint -> test -> build. All four
npm run typecheck         # tsc --noEmit, for every app, every package and the root
npm run lint              # eslint, including the boundary rules (eslint.config.mjs)
npm test                  # jest
npm run test:ci           # jest with coverage
```

**Baselines at the end of Panel 0, on the branch `panel-0-access` (2026-11-02).** Compare against these after any change:

| Measure | Value |
|---|---|
| Routes | **30** in `next build`'s route table (Panel 0 added `/api/admin/me` and `/api/admin/mfa`). Compare a structural change's table against the one before it |
| Client JS | **981,592 bytes** in 18 chunks (976,061 at the audit close-out). Per route: `/admin` 164,101 · `/article/[slug]` 141,655 · `/` 125,795 · `/saved` 113,333 · `/contact` 100,601 · `/about`, `/privacy`, `/terms` 97,443 each · `/admin/login` 35,623 · `/_not-found` 28,259. Panel 0 changed only the two admin pages: `/admin` +1,658 (the clear button out, `/me` and the permission checks in), `/admin/login` +3,873 (staff sign-in and the MFA steps) |
| CSS | **93,942 bytes**, one file, 927 selectors (+6 in Panel 0, for the notices and the code field) |
| Tests | **47 suites, 736 tests**, all passing |
| Coverage | **93 files**, measured before restructure 3 removed the shims: 60.07% of statements (8,635 of 14,374), 74.98% of branches, 74.35% of functions. `backend/` + `shared/`: 78.02% (5,514 of 7,067). `apps/admin/src/proxy.ts`: 100% (it was 0%) |
| Lint | **0 errors, 13 warnings** (all in source; BL-002 accounts for two) |
| Boundaries | Lint zones (`eslint.config.mjs`) and `import "server-only"` on every `packages/server/src/` module; `check:boundaries` was removed in restructure 3 |
| `npm audit` | **37: 0 critical, 0 high, 34 moderate, 3 low**. The moderates are dev and build tooling (BL-031); the lows are the accepted jest set |

**After restructure 3 (`chore/restructure`, same machine as a fresh build of `panel-0-access`):**
routes identical (30); client JS **980,692 bytes** (−900): `/` 125,360 · `/article/[slug]` 141,469 ·
`/admin` 163,762 · `/saved` 113,090 · `/contact` 100,358 · `/about`, `/privacy`, `/terms` 97,307
each · `/admin/login` 35,541 · `/_not-found` 28,175; CSS **93,939 bytes**, byte-identical (the
93,942 above was measured on Windows); 47 suites, 736 tests; lint 0 errors, 13 warnings.

**After restructure 4 (the apps/packages split, same machine):** `apps/web` 15 routes, `apps/admin`
16 routes plus the proxy; every old route present (the cron route became the worker's
`refresh-news` job; `/api/news/breaking-news` is new). Client JS, web: `/` 125,071 ·
`/article/[slug]` 141,328 · `/saved` 112,909 · `/contact` 100,205 · `/about`, `/privacy`, `/terms`
96,768 each · `/_not-found` 28,135. Admin: `/admin` **80,206** (was 163,762) · `/admin/login`
**23,705** (was 35,541). CSS: web 83,122 bytes, admin 47,737. 50 suites, 753 tests; lint 0 errors,
13 warnings. Measure each app from its own folder (`apps/<app>/.next`).

Client JS is the sum of `.next/static/chunks/**/*.js`. A route's JS is the chunks listed in
`entryJSFiles` of its `.next/server/app/**/page_client-reference-manifest.js`. Chunk bytes move
when module ids do (§3.17).

```
tsc --noEmit             exit 0
eslint                   exit 0   (0 errors, 13 warnings)
jest --ci                47 suites, 736 tests passed
next build               exit 0   (30 routes)
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
| `apps/admin/src/proxy.ts` instead of `middleware.ts` | Next 16 **renamed Middleware to Proxy**. Correct as-is, in `src/` beside `app/` (required with a `src/` folder) |
| `preload` prop on `next/image` | Correct. **`priority` is deprecated as of v16.0.0** — the familiar prop is the wrong one |
| `remotePatterns` hostnames using `{,*.}host` glob | Correct. Hostnames are matched with **picomatch**, not string equality (`next/dist/shared/lib/match-remote-pattern.js`) |

`remotePatterns` is capped at **50 entries** (zod `.max(50)` in `next/dist/server/config-schema.js`).
The list in `packages/shared/src/config/imageDomains.ts` holds 49. One slot free.

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
Restructure 2 measured the whole repo by glob (`7ef8ab8`), and the audit fixes added tests: **9.27%**
of statements at the end of restructure 2. Since restructure 3 the glob is `src/**`. The oversized files in §6 still read **0%**.

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
(`bcd5393`), and every restructure-2 slice that touched `src/app/` cleared `.next/types` first. Durable
fix: `next typegen` in the `typecheck` script (BL-007).

### 3.11 Verify claims against the build, not just the graph

Lint checks imports one at a time. When it matters, check the production bundle: `grep -l <distinctive-string> .next/static/chunks/*.js`, then find which route loads that
chunk in `.next/server/app/**/page_client-reference-manifest.js`. That is how the Supabase SDK in
`/admin`'s chunk was confirmed (`GoTrueClient`), with server-only strings as a negative control, and
how S5 confirmed a same-length image URL change actually shipped.

### 3.12 A barrel imported by a server component ships every client component it re-exports

Measured in restructure 1, slice 5: `apps/web/src/app/layout.tsx` importing `BreakingNewsBanner` from the admin
feature's barrel put all five admin dashboard components on **every** route (+46 KB on `/`).
`"use client"` on the barrel does not help — the module count drops but the bytes stay. What fixes
it was a `package.json` of `{ "sideEffects": false }` in each feature folder (`bae6f8a`; restructure
2 measured +457 to +84,579 bytes per route without it). **Restructure 3 removed the barrels
instead**: every component is imported from its own file, and client JS fell 900 bytes. **Do not add
an `index.ts` that re-exports client components**; if one is ever needed, it needs that
`package.json` back.

### 3.13 `sed -i` silently converts CRLF files to LF

Git Bash's `sed -i` rewrites the line endings of every file it touches. The index is LF
(`core.autocrlf=true`), so commits are unaffected, but the working copy drifts. Rewrite with a Node
script that detects and restores `\r\n`, and check with `git ls-files --eol <file>`.

### 3.14 Path-keyed lists go stale silently on a move

A policy list that tolerates a stale path reports success while checking nothing. The scripts this
was written about (`generate-codemap.mjs`, `move-map.mjs`) were deleted in restructure 3. What is
left that walks paths: the route walk in `apps/admin/src/app/api/admin/access.test.ts` (it reads
`apps/admin/src/app/api/admin/**/route.ts` and fails on a route the policy does not name).

### 3.15 Directory renames fail on Windows while the editor watches them

`git mv src/app app` failed with "Permission denied": VS Code's TypeScript server holds watch
handles on the directories. Restructure 2 moved files one by one instead (`git mv` per file, with
`GIT_LITERAL_PATHSPECS=1` for paths like `[slug]`), then removed the empty folders. Do not kill
editor processes to get around it (owner instruction).

### 3.16 Tailwind v4 scans every file that is not git-ignored

Class detection is automatic and reads Markdown and comments too. A word in a document once removed
a CSS rule when the document was deleted (BL-018). `apps/web/src/app/globals.css` now excludes
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

### 3.20 PowerShell's `$env:X = ""` deletes X, so Next fills it from `.env.local`

Next's env loader fills only keys that are `undefined` in the process (`@next/env`, `processEnv`). A
Panel 0 smoke test set every key the code reads to `""` in PowerShell to keep `.env.local` out.
On Windows that **removes** the variable, so Next loaded the real `NEWSDATA_API_KEY` and the feed
made one real NewsData.io request. Nothing was written: Supabase pointed at a local stand-in, and
Upstash was not configured. To run the app without `.env.local`'s values, spawn it from Node with an
explicit `env` object, where an empty string survives as "set".

### 3.21 Windows PowerShell 5.1 reads UTF-8 files as ANSI, and writes a BOM

`Get-Content -Raw` without `-Encoding` decodes a BOM-less UTF-8 file as Windows-1252, so writing it
back turns `§` into `Â§` (it happened to a test file in Panel 0, repaired before commit).
`Set-Content -Encoding utf8` and `Out-File` add a BOM, which once reached a commit subject (amended
before push). Read and write text with Node, or the Write and Edit tools. Check a commit message's
first bytes with `git cat-file -p`, not through a PowerShell pipe, which adds its own BOM.

### 3.22 Tailwind reads test files too

§3.16 again: a test id `"row-1"` produced a `.row-1` rule (grid-row) in the shipped CSS. Choose
ids that are not utility class names.

### 3.23 The env-var test sees only tracked files

`check:boundaries` (removed in restructure 3) read `git ls-files`, and so does
`packages/shared/src/config/envExample.test.ts`. A gate run before a new file is added cannot see it. Register new
files with `git add -N <file>` before the gate.

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

Every commit passed `npm run verify`. Every commit that touched `src/app/` or deleted anything was
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

**Panel 0, the access foundation** (design approved with conditions; [`PANEL_DOCS.md`](PANEL_DOCS.md)).
Tests first for authorization code; characterization first for untested UI and the proxy.

| Part | Commits | What it did |
|---|---|---|
| Step 1, workflow | `862cf41`..`5f8b835` | PANEL_PLAN.md (from the owner's PDF), PANEL_DOCS.md, CLAUDE.md's panel section, README, this file |
| Step 2, design | `e9bce19`, `6bcfb4e` | BL-033; the design and ADR 0003 |
| First half, on `main` | `38ac276`..`f357d71` | The approval; BL-034; supabase-js 2.116.0; the access SQL; `decide` and `scope`; the shared password's end date; `requirePermission` with `@supabase/ssr` 0.12.7; every admin route wired, one per commit; the route walk; the cron as `system:cron`; `logAdminAction` deleted |
| Warning on `main` | `c35637f` | `main` is not deployable until the migrations are applied |
| Second half, branch `panel-0-access` | `d1bff91`..this file | The bulk limit test; the proxy (characterized, then both sessions); `/me` and `/mfa`; staff sign-in and sign-out; the activity log read-only; the dashboard by `/me`; the sign-in page with MFA; CODEMAP; the runbooks; architecture; PANEL_DOCS; this file |

Every commit passed `npm run verify` before it was made, except `ebb7049`, whose tree failed
`check:boundaries` (§3.23). It was reverted, not patched. Six second-half commit messages state the
suite count one too high (`d8bf37a` 45, `523cc51` 46, `ced5f2a` and `e5c6914` 47, `4b809f5` and
`06da24b` 48; the logs say 44, 45, 46, 46, 47, 47). Their test counts are right. They were pushed,
so they are not rewritten. Client JS and CSS were reported per commit. The two admin pages grew,
with the causes recorded in their commits (§2).

**Retired:** `docs/TimesPrime-PRD-and-Architecture.pdf` was committed in `ddbcc9f`, then untracked
and git-ignored at the owner's direction. Do not consult the PDF if a copy exists on disk. The PRD
(`docs/PRD.md`) and the owner's `PANEL_PLAN.md` were retired on 4 Nov 2026 for `NEWSROOM_PLAN.md`
and `PERMISSIONS.md`; both are in git history.

---

## 5. Architecture

The flows (ingest, serve, authorise), the layout, the rules and each folder's responsibilities are
in [`architecture.md`](architecture.md). The tree, in short:

```
apps/web/        the reader site: src/app (pages, public APIs) · src/components · src/context · src/lib
apps/admin/      the back office: src/proxy.ts · src/app/admin · src/app/api/admin · src/components
apps/worker/     scheduled jobs: src/jobs.ts (refresh-news)
packages/server/ auth/ · repositories/ · services/{news,scrape,translate,classify,health} · lib/
packages/shared/ config/ · types/ · lib/      what both apps import
packages/ui/     ThemeContext
database/        schema.sql · policies.sql · migrations/ · bootstrap/ · seed/
```

**Authorisation, since Panel 0:** `apps/admin/src/proxy.ts` (matcher `/admin/*`, `/api/admin/*`) only checks that a
session exists. Every admin route body calls `requirePermission`, the **only** gate on the data,
because the app reads Supabase as `service_role` and bypasses RLS. A route outside the matcher is
still public, and an admin route without a rule fails the route walk (`access.test.ts`).
[`architecture.md`](architecture.md) §1 has the flow.

### Files over 500 lines

| File | LOC | Statements covered |
|---|--:|--:|
| `apps/web/src/components/article/ArticleDetailView.tsx` | 970 | tested (F-005, F-013, F-017) |
| `apps/admin/src/components/ArticlesTable.tsx` | 751 | 0% |
| `packages/server/src/repositories/db.ts` | 678 | 71.8% |
| `packages/server/src/services/scrape/scrapeArticle.ts` | 580 | 87.1% |
| `apps/web/src/components/news/Header.tsx` | 568 | stubbed in tests |
| `apps/web/src/components/home/HomeClient.tsx` | 561 | tested (F-021, BL-027) |
| `apps/admin/src/app/admin/page.tsx` | 521 | tested (F-014) |

Per-file coverage: `npm run test:ci`, then `coverage/lcov-report/index.html`.

---

## 6. Structural work — where it stands

| Work | Status |
|---|---|
| Restructure 1: Phases 0, 1, A, C, D, E | ✅ Done (ADR 0001, superseded) |
| Restructure 2: S0 design, S1 cleanup, S2 tooling, S3 moves, S4 enforcement, S5 docs | ✅ Done (ADR 0002, superseded) |
| Restructure 3: the standard `src/` layout, cleanup of the restructure-2 tooling, ngrok and CORS | On `chore/restructure`, awaiting the owner (ADR 0004, proposed). Moved the feed's read path into `packages/server/src/services/news/topHeadlines.ts` |
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

Numbered to match the retired PRD's §11 (in git history). Of DEF-01..25, all but six
are resolved:

| ID | What remains | Status |
|---|---|---|
| DEF-01 | Supabase reachable again and no longer silent; `/api/health` 200 and a Sentry fallback event in production | Pending verification (F-002) |
| DEF-07 | `breaking_news` and `admin_logs` DDL in `database/schema.sql`; the owner applies it | Pending verification (F-008) |
| DEF-12 | Search escaping fixed; the injection probe against the live database | Pending verification (F-006) |
| DEF-18 | The index migration; the owner applies it | Pending verification (F-018) |
| DEF-23 | The production runtime's Node version (AWS, at deployment) | Pending verification (F-026) |
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
- BL-033 (the 7-day purge against Rule 19's 60 days; Panel 4 or 7), BL-034 (export the audit chain's
  head hash outside the database).

**Resolved:** BL-003, BL-010, BL-011, BL-012, BL-013, BL-014, BL-015, BL-017, BL-018, BL-020, BL-021,
BL-027, BL-029.

---

## 9. Owner decisions

**Product (2026-10-29), all five answered.** Full rationale in the retired PRD's §12 (in git history).

| # | Decision | Where |
|---|---|---|
| Q1 | **Paraphraser: deleted.** Headlines shown as the source published them | `3805007` |
| Q2 | **RSS: deleted**, including the 503 route. Route table 27 → 26 | `bcd5393` |
| Q3 | **Editorial publishing: kept.** Lives in the admin feature. `country: ["us"]` and the filter bypass logged, not fixed | BL-004 |
| Q4 | **Contact form and newsletter: UIs removed.** `/contact` page kept, listing emails | `59b875d`, BL-005 |
| Q5 | **EN/HI is the scope.** An explicit non-goal in the PRD, so the discard is not treated as a bug | PRD §3 |

**Plan (2026-11-04):** `NEWSROOM_PLAN.md` approved as the one plan every developer follows; sign-off
item 6 (how aggregated items show) is pending, and until then they stay hidden. `PANEL_PLAN.md` and
the PRD retired; the access rules moved to `PERMISSIONS.md`.

**Structure (restructure 4, 2026-11-04):** three apps over shared packages (ADR 0005, superseding ADR
0004's single app, which superseded ADR 0002's five-folder split). Routes hold their own code;
components are imported from their own files, with no barrels; `server-only` and lint zones keep
server code out of the browser and the apps apart.

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
  `tunnelRoute` must never be enabled (D12): it would add a route the proxy does not see.

**Process and hosting (2026-11-02):**
- **Branches:** all work happens on a branch (`panel-N-<name>`, `fix/<topic>`, `chore/<topic>`), and
  only that branch is pushed. Nothing reaches `main` without the owner's approval.
- **A production-level standard:** a panel is done only with items 7–13 of CLAUDE.md's definition
  of done as well:
  - real-database tests against the local Supabase;
  - end-to-end browser tests, including a refused-access flow;
  - loading, error and empty states;
  - accessibility;
  - failures in Sentry and privileged actions audited;
  - a JS size budget per route in CI;
  - a runbook for when the main flow breaks.
- **The audit's remaining items** wait for Panel 0's merge, then go on `fix/audit-closeout` (§ "Next").
- **Deployment:** none until the whole project is complete. Ignore the earlier Vercel deployment.
  The target is AWS, `ap-south-1`. All verification is local, against a local database.

**Panel 0 (2026-11-02).** All recorded in the design's "Approval" section and in
[`PANEL_DOCS.md`](PANEL_DOCS.md):
- **The matrix is canonical (D2).**
- **Who is privileged, and who needs MFA (D3):** two admins to grant Super Admin, Managing Editor,
  Legal or Privacy Officer; `aal2` for those four, Desk Editor, Security Lead and Ingestion Ops;
  MFA for all staff by default (Q1).
- **Bootstrap by SQL only (D4).**
- **Scope (D5, D6, ADR 0003):** `en`/`hi` mapped from `english`/`hindi`; the section is `category[0]`.
- **One public list (D10), and the cron as `system:cron` (D11).**
- **Audit fail-closed (Q2):** "attempted", then the outcome.
- **The shared password (Q3):** ends 2027-01-01 IST in code, with a fixed permission list and no
  admin, audit or settings permission.
- **Dependencies (Q4):** `@supabase/ssr` 0.12.7 with `supabase-js` 2.116.0.
- **Removed or refused:** the purge until Panel 4 (Q5); clearing the log (Q6).
- **`admin_logs` (Q7):** frozen and readable.
- **`database/bootstrap/` (Q8).**
- **Approved at the midway STOP:**
  - no staff-record cache;
  - the banner for unscoped grants only, until Panel 3;
  - the three behaviour changes;
  - the bulk audit as one pair, with the 100-article limit.

**Follow-up the product decisions created:** the privacy policy still describes newsletter and
contact-form collection that no longer happens. Legal copy, for the owner or legal review (BL-008).

---

## 10. Conventions to follow

- **`npm run verify` must pass before any commit.** All four, not a subset. `tsc` catches imports
  that no longer resolve; `eslint` catches the ones left behind and every boundary-rule break;
  `jest` covers the tested slice; `build` catches route resolution and a client module reaching
  `packages/server/src/` transitively (the `server-only` guard).
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

## 11. Before the AWS deployment

Nothing is deployed until the whole project is complete (owner decision, 2026-11-02). This list is
for that day. Until then every check is made locally, against a local database (§2).

**AWS.**
- **Region:** `ap-south-1` (Mumbai), for the app and for its logs. CERT-In's directions keep logs for
  180 days within India; the plan also asks for the Supabase project in an Indian region, or logs
  exported to Indian storage.
- **The refresh:** the worker's `refresh-news` job, started every 30 minutes by EventBridge
  Scheduler (an ECS task running `npm run job -- refresh-news`). It has no HTTP path and needs no
  secret; without the scheduler, ingestion stops silently, so alarm on the task's exit code.
- **Runtime:** Node 24 (F-026). The proxy runs on Next's Node runtime. Audit rows take their
  `request_id` from `x-vercel-id`, and fall back to a random UUID where that header is absent, as it
  will be on AWS.
- **Configuration:** every variable in `.env.local.example`, set in the AWS environment, never in
  the repository.

**Panel 0** ([`runbooks/staff-access.md`](runbooks/staff-access.md)). It is rehearsed first on the local
database, then done once more against the production database at deployment, in this order:
1. Supabase dashboard: sign-ups off, TOTP on. Apply `2026-11-02-access-1-foundation.sql`, then
   `2026-11-02-access-2-catalog.sql`, and run their checks.
2. Run the merged code. The shared password still works, and an admin change writes `audit_log`
   rows.
3. Invite two Super Admins, and run `database/bootstrap/super-admin.sql` for each, with its four
   checks.
4. Each signs in with email, password and a second factor; check the audit rows.
5. Apply `2026-11-02-access-3-freeze-admin-logs.sql`.
6. Only after Panel 1: consider `ADMIN_LEGACY_LOGIN=off`. The code ends the shared password on
   1 January 2027 regardless.

**The production database** ([`runbooks/apply-database.md`](runbooks/apply-database.md)), from the audit:
1. Confirm `SUPABASE_SERVICE_ROLE_KEY` is set in the environment (present, not copied). Without it the
   app falls back to the anon key and RLS refuses every write (BL-025).
2. Take the step 0 snapshot and confirm `service_role` has `rolbypassrls`.
3. Apply `database/schema.sql`, then `database/policies.sql`, then
   `database/migrations/2026-11-02-indexes.sql`. Verify each as the runbook shows. Each has a
   rollback. This closes F-008 and F-018 (the F-005 and scraper lookups use the link index).
4. Before any `NOT NULL` migration, count the nulls in live data (BL-024).
5. Re-run the F-006 injection probe, and an RLS check, against the live database.

**Environment:**
- `.env.local` names the Supabase project `yhjotyxrdaqtcgsxigok`, which may be production. Until the
  local database exists, no local run may write (§2, §3.18).
- On AWS: Node 24 (F-026), `NEXT_PUBLIC_SENTRY_DSN`, the Upstash variables, and the worker's
  scheduler. No production cron entry has ever been seen in the database.
- Owner's `.env.local`: `ADMIN_SECRET_TOKEN` and `MEDIASTACK_API_KEY` can go; nothing reads them.
  Never set `NEXT_PUBLIC_NEWSDATA_API_KEY`.

**Smoke test at deployment:**
- `/api/health` answers 200, and Sentry receives a Supabase fallback event (F-002).
- `X-Data-Source` shows `supabase` or `cache` for readers (NFR-01).
- The scheduler starts the worker's refresh, and its `audit_log` row (`system:cron`, `cron.refresh_news`) carries
  the purge count (F-015).
- The Redis limiter: the 11th login attempt in 15 minutes and the 31st uncached scrape in a minute
  answer 429 across instances (F-004, F-011).
- BL-019 (publisher image timeouts) under real traffic.

**Before production.** A list only; no work is planned on it yet (owner, 2026-11-02):
- **Environments:** local, then staging on AWS, then production. Nothing skips a stage.
- **Backup and restore:** a restore actually tested, not just backups switched on.
- **Load test** of the reader paths and the admin API.
- **Review:** dependencies (advisories, BL-031) and HTTP headers (CSP, HSTS, frame and referrer
  policies).
- **AWS infrastructure as code:** no hand-made production resources.
- **Alerts:** Sentry, the cron's runs, `/api/health`, the audit chain.
- **Incident runbook:** including CERT-In's 6-hour report.
- **Legal pages:** the privacy policy (BL-008), and the grievance officer page (NEWSROOM_PLAN Phase H, IT Rules
  Level I).

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

# route table drift: compare the "Route (app)" block of `next build` output before and after
# (f/o + path), not a file list
git ls-files 'apps/*/src/app/**/page.tsx' 'apps/*/src/app/**/route.ts' | sort

# the boundary rules
npm run lint

# confirm framework behaviour instead of guessing
node -e "const pm=require('next/dist/compiled/picomatch'); console.log(pm.makeRe('{,*.}newsdata.io').test('i.newsdata.io'))"
```

### Data model

`database/schema.sql` defines all three tables, `IF NOT EXISTS`, with RLS enabled:
- `articles`: 15 columns, `article_id` unique, `category`/`country`/`category_mismatches` are `TEXT[]`.
  Only `id`, `article_id`, `title` and `created_at` are NOT NULL (the root of BL-001).
- `breaking_news` and `admin_logs`, committed in `db28a46` (F-008); their nullable columns are BL-024.

Panel 0's six access tables (`staff_profiles`, `roles`, `permissions`, `role_permissions`,
`role_assignments`, `audit_log`) are in `database/migrations/2026-11-02-access-1-foundation.sql`, the
catalogue in `-2-catalog.sql`, generated from the plan's matrix by `scripts/generate-access-catalog.mjs`.

Policies and grants are in `database/policies.sql`. Indexes: `created_at` and `article_id` in the
schema; GIN on `category`/`country`, trigram on `title`/`description`, and `link` in
`database/migrations/2026-11-02-indexes.sql`. None of it is applied by the app: the owner applies it
(§11).

### Test suite

47 files, 736 tests, all passing. Panel 0: `access.test.ts` is the route walk and the access matrix
(every admin route and method, through the real gate, for every kind of caller), with `decide`,
`requirePermission`, the session, the proxy, sign-in, `/me`, `/mfa`, the catalogue against the matrix,
and the access SQL's guarantees. Every security module has tests: `urlValidation` (73),
`fetchPage` (real axios against a local server), `adminSession`, the login and scrape routes, the
rate limiter (memory and Redis), the size-capped body reader, and the search escaping. Repo-reading
tests keep the SQL in step with the code (`packages/server/src/repositories/schema.test.ts`, including the
runbook's rollback), and `.env.local.example` in step with `process.env`
(`packages/shared/src/config/envExample.test.ts`). Untested: `ArticlesTable.tsx` and `Header.tsx`.
