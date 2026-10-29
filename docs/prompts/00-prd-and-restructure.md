# Master Prompt — TimesPrime PRD + Codebase Restructure

> Paste the block below into a fresh Claude Code session at the repo root.
> It is phased with explicit approval gates; do not let the agent run past one.

---

You are working on **TimesPrime**, a Next.js 16.3 / React 19 AI-assisted news aggregation
platform at this repo root. Your job has two halves: (A) author a reverse-engineered PRD
for the product as it actually exists, and (B) reorganize the codebase to a feature-first
structure **without changing a single behavior**.

Read `AGENTS.md` first. This is a modified Next.js — consult `node_modules/next/dist/docs/`
before relying on any framework convention from memory. Relevant starting point:
`01-app/01-getting-started/02-project-structure.md`.

## Non-negotiable rules

1. **Behavior-preserving.** Phases 3–5 change file locations and imports only. No logic
   edits, no renames of exported symbols, no "while I am here" fixes. Log anything that
   tempts you into `docs/BACKLOG.md` instead.
2. **Moves and edits never share a commit.** Use `git mv` so history follows the file.
   A commit is either a move + import fix, or a content change. Never both.
3. **Verify every slice.** After each slice run
   `npx tsc --noEmit && npm run lint && npm test && npm run build`.
   All four green before you commit. If a slice cannot go green, `git revert` that slice
   and report why — do not pile fixes on top.
4. **One feature slice per commit.** Small enough to review in one sitting.
5. **Stop at every gate.** Gates are marked STOP. Present your output, wait for approval.
6. **Never touch** `.env.local`, secrets, or anything matched by `.gitignore`.

## Framework constraints you must not break

- Files under `src/app/**` named `page` / `layout` / `route` / `loading` / `error` ARE the
  routing table. They do not move. Only the non-route modules they import move. Use route
  groups `(name)` and private folders `_name` to reorganize without changing a single URL.
  Verify URLs are unchanged after any `app/` reshuffle.
- `next.config.ts` imports `ALLOWED_IMAGE_HOSTNAMES` from `src/lib/imageDomains.ts`. That
  module is evaluated at config-load time: it must never import React or `server-only`. If
  you move it, update the config import in the same commit and confirm `npm run build`
  still resolves image `remotePatterns`.
- `src/proxy.ts` and `src/instrumentation.ts` are location-pinned Next.js conventions.
  Leave them where they are.
- `vercel.json` cron targets `/api/cron/refresh-news`. That path must survive.
- Sentry config files (`sentry.*.config.ts`, `instrumentation-client.ts`) are
  convention-located. Leave them.

---

## PHASE 0 — Baseline

Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`. Record pass/fail, test
count, and coverage. Confirm `git status` is clean (note: `next.config.ts` may show as
modified — inspect before assuming). Capture the current route table by listing every
`page.tsx` and `route.ts` path under `src/app/`; save it to `docs/_baseline-routes.txt` as
the diff target for Phase 4.

**If the baseline is not green, STOP and report.** You cannot verify a refactor against a
broken baseline.

---

## PHASE 1 — Repository hygiene

Mechanical, low risk, no app code touched:

- `package.json`: rename `temp-app` to `timesprime`; add a `typecheck` script
  (`tsc --noEmit`) and a `verify` script chaining typecheck + lint + test + build.
- Replace the boilerplate `README.md` with a real one: what TimesPrime is, the stack,
  prerequisites, setup (including every env var from `.env.local.example` with a one-line
  purpose), a scripts table, deployment notes, and a link to `docs/`.
- Create `docs/` with `PRD.md`, `architecture.md`, `adr/`, `runbooks/`.
- `git mv supabase_schema.sql supabase_rls_policies.sql` into `db/` as `schema.sql` and
  `policies.sql`. Grep the whole repo (including `scripts/`) for references first.
- Add `.github/workflows/ci.yml`: on push and PR, Node version from `.node-version`,
  `npm ci`, then typecheck, lint, test, build.
- Add `CONTRIBUTING.md` documenting the commit convention and the verify gate.

Commit as a small series. STOP and summarize.

---

## PHASE 2 — PRD (gate)

### Discovery

Read, do not skim: every route under `src/app/api/`, every page, `src/lib/*`,
`src/types/index.ts`, `db/schema.sql`, `vercel.json`, `next.config.ts`. Also read the last
~15 commit messages — they encode product decisions (category misclassification, the
Odia-script feed leak, scraping success rate) that belong in the PRD.

Build an inventory: every user-facing capability; every API endpoint with its method, auth,
inputs and outputs; every external dependency (NewsData.io, Anthropic, Supabase, Upstash
Redis, Sentry, Google Translate) with what breaks when it is down; every background job;
every piece of persisted state.

### Write `docs/PRD.md`

```
1.  Overview            — what the product is, in two paragraphs, no marketing voice
2.  Problem & context   — why it exists, who it serves
3.  Goals / Non-goals   — explicit non-goals matter as much as goals
4.  Personas            — reader, admin/editor; what each needs
5.  User journeys       — browse feed · read article · translate · save · chat · admin
6.  Current capabilities (as-built) — the honest inventory
7.  Functional requirements — numbered FR-001.., each with:
      statement · acceptance criteria · [file:line implementing it] ·
      status (Implemented / Partial / Planned)
8.  Non-functional requirements — performance, SEO, accessibility, rate limits,
      third-party cost envelope, error budget, data retention
9.  Data model          — tables, columns, relationships, derived from db/schema.sql
10. Integrations        — per dependency: purpose, auth, failure mode, fallback
11. Success metrics     — what "working" means numerically
12. Risks & open questions
13. Out of scope / future
14. Appendix            — glossary, env var reference
```

**The traceability rule:** every FR in section 7 carries a reference to the code
implementing it, or is marked `Planned`. An FR you cannot point at is either a bug or a
wish — label it as one. This is what makes a brownfield PRD worth keeping.

Write what the code does, not what it should do. Where intent is genuinely unclear, record
it in section 12 rather than guessing.

**STOP.** Present `docs/PRD.md` plus a numbered list of open questions for the owner. Do
not start Phase 3 until the PRD is approved.

---

## PHASE 3 — Structure design (gate)

Propose the target tree in `docs/architecture.md`, plus
`docs/adr/0001-feature-first-structure.md` recording the decision and the alternatives
rejected. Baseline proposal to refine, not to accept blindly:

```
docs/            PRD.md · architecture.md · adr/ · runbooks/
db/              schema.sql · policies.sql
scripts/
public/
src/
  app/                   routing only
    (public)/            home · article/[slug] · saved · about · contact
    (legal)/             privacy · terms
    admin/
    api/                 unchanged paths
  features/
    news/                feed fetching, source config, RSS, classification
    article/             detail view, scraping, paraphrasing
    admin/               dashboard, tables, logs, breaking news
    chat/                AI assistant
    bookmarks/           client-side saved articles
    i18n/                language context, translations, Google Translate
      each: components/ · server/ · types.ts · index.ts (public API)
  components/ui/         shared presentational primitives only
  server/                db client · supabase · adminSession · adminLogger
  lib/                   cross-cutting: cache · rateLimit · urlValidation · sentryScrub
  config/                constants · imageDomains · categoryColors
  types/                 only genuinely shared types
```

Also produce a **move map**: every current file mapped to its destination, or `stays`.
Call out the judgment calls explicitly, for example:

- `topicImages.ts` (414 lines) — config data, or news-feature logic?
- `newsConfig.ts` — source allowlists: `config/` or `features/news/`?
- `categoryClassifier.ts` — domain logic, so `features/news/`
- `translations.ts` — i18n feature, not `lib/`

**The boundary rule to design toward:** each feature exposes exactly one public surface
(`features/<name>/index.ts`). Nothing imports across feature boundaries — only downward
into `components/ui`, `lib`, `server`, `config`. If two features need the same thing, it
moves down; it does not get imported sideways.

**STOP.** Get the tree and the move map approved before moving any file.

---

## PHASE 4 — Migration

Execute the move map one feature slice at a time. Suggested order, least coupled first:

1. `config/` extraction (imageDomains, categoryColors, constants) — handle imageDomains
   with extra care, see framework constraints above
2. `server/` extraction (db, supabase, adminSession, adminLogger)
3. `features/bookmarks` — self-contained, already has tests
4. `features/i18n`
5. `features/chat` — already has tests
6. `features/news`
7. `features/article`
8. `features/admin`
9. `components/ui` — whatever is left that is genuinely shared
10. `src/app/` route groups — URLs must be byte-identical afterward

Per slice: `git mv` → fix imports (prefer the `@/` alias) → add the feature's `index.ts` →
run all four verifications → commit with a message naming the slice. Move the colocated
`.test.ts` files along with their subjects.

After slice 10, regenerate the route list and diff it against `docs/_baseline-routes.txt`.
Any difference is a bug — fix it before proceeding.

STOP and summarize: slices completed, commits, verification status.

---

## PHASE 5 — Enforcement

Make the structure self-defending, or it decays within a month:

- An ESLint rule (`no-restricted-imports` with path patterns, or
  `eslint-plugin-boundaries`) blocking cross-feature imports and deep imports that bypass a
  feature's `index.ts`.
- Path aliases in `tsconfig.json` for `@/features/*`, `@/server/*`, `@/lib/*`,
  `@/config/*`, `@/ui/*`.
- A section in `docs/architecture.md` stating the import rules in prose, so a reviewer can
  cite it.
- Optional: a CI step failing on any source file over ~400 lines, with an explicit
  allowlist for the files Phase 6 has not reached yet.

Verify, commit, STOP.

---

## PHASE 6 — Decomposition (optional, separable)

Only after phases 0–5 are merged and stable. Split the oversized units by **extraction
only** — pull cohesive pieces into new modules, change no logic:

| File | Lines | Likely seams |
|---|---|---|
| `ArticleDetailView.tsx` | 1008 | header, body renderer, translation controls, share, related |
| `admin/ArticlesTable.tsx` | 751 | columns, row actions, filters, pagination |
| `Header.tsx` | 568 | nav, search, theme toggle, language switcher, mobile menu |
| `api/news/scrape-article/route.ts` | 560 | fetch, extract, sanitize, respond — move into `features/article/server/` and keep the route a thin handler |
| `db.ts` | 537 | split by table / concern |
| `HomeClient.tsx` | 532 | feed state, filters, grid |
| `admin/page.tsx` | 512 | tab shell vs panels |

One file per commit. Add a characterization test before splitting anything that lacks
coverage. Verify after each.

---

## Reporting

At each STOP, report: what changed, commits made, verification results (actual command
output, not a claim), and anything you chose to defer and why. If you deviate from this
plan, say so explicitly rather than quietly adapting.
