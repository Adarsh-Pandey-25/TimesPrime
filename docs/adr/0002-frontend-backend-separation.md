# ADR 0002 — Frontend, backend, shared and database separation in one Next.js app

**Status:** **Accepted** — 2026-10-30, owner approval at the S4 review. Written as a draft during
restructure 2, recording each decision as it was taken, and finalized in S5.
**Supersedes:** [ADR 0001](0001-feature-first-structure.md)'s layout; its other lessons carry over
(below). **Related:** [`architecture.md`](../architecture.md) (the layout and the rules, in prose),
[`scripts/move-map.mjs`](../../scripts/move-map.mjs) (where every file went, and each slice's
checklist), [`scripts/check-move-map.mjs`](../../scripts/check-move-map.mjs) (the rules below).

## Context

The owner's reviewer asked for frontend, backend, database and docs to be visibly separate. In the
App Router the files under `app/` are the URL contract: a route's path is its folder, so page and
route files cannot simply move into `frontend/` or `backend/`. ADR 0001's feature-first layout
(`src/features/<feature>/` holding a feature's UI and its server code together) satisfies the import
rules, but it does not show the separation at a glance.

## Decision

One Next.js app, organised as:

- `app/` — the routing shell. Each `route.ts` re-exports its handlers from `backend/api/`, and each
  page re-exports a view from `frontend/views/`. The exceptions are the two pages that combine
  backend data with a view: `app/page.tsx` and `app/article/[slug]/page.tsx`. A route file holds
  only re-exports and literal segment config (A2).
- `frontend/` — `views/` (page bodies), `features/<feature>/` (UI a feature owns, behind an
  `index.ts` entry point), `components/ui/`, `context/`, `styles/`.
- `backend/` — `api/` (route bodies), `services/<service>/` (behind an `index.ts` entry where the
  service has one), `repositories/`, `auth/`, `lib/`. Every backend module is server-only.
- `shared/` — `config/`, `types/` and `validation/`, which both sides import.
- `database/` — the SQL and the seed script. Nothing imports it.
- `proxy.ts`, `instrumentation*.ts` and `sentry.*.config.ts` stay at the root, where Next looks for
  them.

The rules, as `check:boundaries` and, from S4, lint enforce them
([`architecture.md`](../architecture.md) §5 says where each is enforced):

| Rule | What it says |
|---|---|
| F1 | Frontend never imports backend, and the client bundle never reaches it transitively |
| B1 | Backend never imports frontend |
| S1 | Shared imports nothing from frontend, backend or `app/` |
| A1 | `app/` composes frontend, backend and shared, and is the only place they meet: nothing else imports `app/`, and the root files Next pins in place keep to their runtime's side |
| A2 | Every `app/**/route.ts`, and every page whose body has moved, holds only re-exports and literal segment config |
| P1 | The proxy imports only `backend/auth` and `shared/` |
| D1 | Nothing imports `database/` |
| X1 | No cross-feature or cross-service imports; other code reaches a feature or service only through its entry point |
| V1 | Features never import views (owner, S4) |
| R3, R5, R7, R9 | UI, config, types and context import only what their layer allows |
| LIB | `backend/lib` imports no project module |
| CR-06 | `next.config.ts` imports only `shared/config`, and `imageDomains.ts` imports nothing |

### Recorded during the move (S3)

- **Features never export views** (owner, at the slice-9 review). Views sit above features: a view
  composes features through their entry points, so a feature's barrel must not re-export a view.
  After slice 9 the news barrel still re-exported `HomeClient` and `ArticleDetailView`. That formed
  a runtime import cycle (view → news entry → view). It cost nothing in size, but it was a latent
  module-initialisation risk. Removed in `4460a40`; pages now import their views from
  `@/frontend/views/...`. From S4, rule V1 enforces it in lint and `check:boundaries`.
- **Views import features only through the entry point (X1), at an accepted cost.** Routing
  `HomeClient` through `@/frontend/features/news` added 109 bytes (0.09%) of client JS to `/`: the
  bindings Turbopack emits for imports that go through a re-export. Three throwaway builds showed
  the cost is not caused by the cycle and is not removed by `sideEffects` (`0efa628`). The owner
  kept X1.

### Recorded during enforcement (S4)

- **R5 keeps its Phase D meaning.** When `check:boundaries` was rewritten for the new layers in
  S2, R5's "ui imports only ui/, lib/, types/" became "ui/ and shared/". But `shared/` also holds
  `config/`, which the Phase D decision keeps out of UI primitives. So a UI primitive could import
  `shared/config` unflagged. Restored in `52d283e`: `ui` imports only `ui/`, `shared/types`,
  `shared/validation` and `ThemeContext`. No existing import changed status.
- **A2 is in lint as well as `check:boundaries`.** ESLint can express it, as the local rule
  `boundaries/shim-only`, which runs the same check. Only `check:boundaries` sees a shim that has
  gone missing.

## Carried over from ADR 0001

- Feature entry points with a `package.json` `sideEffects` field. The lesson behind it: an unmarked
  barrel, imported by a server component, shipped every client component it re-exported.
- `import "server-only"` as the first statement of a server module.
- The transitive client-bundle check in `check:boundaries`, which lint cannot do.

## Alternatives rejected

- **Two separate apps** (owner decision). Every API URL would change, and the Vercel cron contract
  (`/api/cron/refresh-news`) would break. The proxy's admin auth would have to be rebuilt across
  origins, and deployments would double.
- **Keeping `src/` feature-first** (ADR 0001). The separation the reviewer asked for would still not
  be visible.
- **`categoryClassifier` under `services/news/`.** It would form an import cycle with the news entry,
  which re-exports `db.ts`, so it lives in `services/classify/`.
- **Splitting pages or the cron route into fetch + view.** That is a logic change, not a move.

## Consequences

**Measured.** S1 removed dead code first, so the move covered only code in use. 95 files then moved
in 11 slices (`b0fe915`..`2b9cb94`), each a gated commit.
- **Routes:** the route table matched `_baseline-routes.txt` (28 routes) at every commit, and segment
  config was identical.
- **CSS:** byte-identical throughout (93,463 bytes).
- **Client JS:** from the S2 baseline, 974,032 → 974,067 bytes (+35). `/` grew 50 bytes, the cost
  of routing `HomeClient` through the news entry point (above). Every other route shrank by 2 to 70
  bytes. Against S0, before the cleanup, the total is 978,242 → 974,067 (−0.43%).
- **Tests:** 9 suites, 70 tests throughout.
- **Lint:** 0 errors, 14 warnings, the same count as before restructure 2.
- **Coverage:** measured over 74 files once the 25 shims are excluded by name (`SHIMS`, derived from
  the move map): 9.27% of statements, 53.69% of branches, 37.61% of functions at the end of S4.
- **History:** `git log --follow` reaches each moved file's earlier history. The two rewritten
  barrels show as a delete plus an add.

**Easier.**
- A file's folder says which side it runs on, and the separation is visible at a glance.
- A client import of backend code fails three ways: lint, `check:boundaries`, and the build, since
  every one of the 32 backend modules opens with `import "server-only"`. Each rule was proven by a
  deliberate violation (S4).
- A reviewer can cite a rule by ID (F1, A2, X1, …), and both tools report the same ID.

**Harder.**
- A route, or a moved page, is two files: a one-line shim in `app/` and its body.
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md) says which file goes where.
- A2 checks route files and the moved pages, not a new page's file, which may compose server data.
- The two composition pages stay in `app/`, and the article page fetches its own API over HTTP
  (BL-016).
- Route bodies in `backend/api/` still carry some logic inline (`news/scrape-article.ts`,
  `news/top-headlines.ts`). Moving it into services is later work, behind characterization tests.
- `scripts/move-map.mjs` outlives the move. `SHIMS`, which drives the coverage exclusion and A2 in
  lint, and the missing-shim check in `check:boundaries` are derived from it.
- An import through an entry point costs a few bytes of client JS (109 on `/` at slice 9).
  `"sideEffects": false` (`bae6f8a`) keeps the barrels from costing more.
