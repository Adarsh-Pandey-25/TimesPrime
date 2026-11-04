# ADR 0004 — The standard Next.js `src/` layout

**Status:** **Proposed** — 2026-11-02, on the branch `chore/restructure`, built on `panel-0-access`.
Accepted when the owner approves the merge.
**Supersedes:** [ADR 0002](0002-frontend-backend-separation.md)'s layout. **Related:**
[`architecture.md`](../architecture.md) (the layout and the rules, in prose).

## Context

Restructure 2 split the app into `app/`, `frontend/`, `backend/`, `shared/` and `database/`. Because
the App Router fixes where route files live, every route and most pages in `app/` became a one-line
re-export of a body in `backend/api/` or `frontend/views/`: 25 files that held nothing, and every
route existed twice. Holding that shape took ~1,400 lines of custom tooling (`scripts/move-map.mjs`,
`scripts/check-move-map.mjs`, `scripts/generate-codemap.mjs`, `eslint.boundaries.mjs`) and a
generated 829-line `docs/CODEMAP.md`. The move plan the tooling was built around had finished, but it
still ran in every `npm run verify`.

The owner asked for the industry-standard structure for a high-traffic news site, with nothing kept
that does not earn its place. A new Next.js developer should find the code where the framework's own
documentation says it lives.

## Decision

The `src/` layout from the Next.js docs (`src-folder.md`, `project-structure.md`):

- `src/app/` holds routes with their code. A route handler's body is its `route.ts`; a page's body is
  its `page.tsx`. Tests sit beside what they test.
- `src/components/` holds React UI by area (`news`, `admin`, `chat`, `ui`, and the two page bodies
  that take server data as props). No barrel files: each component is imported from its own file.
- `src/server/` holds server-only code (`auth`, `repositories`, `services`, `lib`). Every module
  opens with `import "server-only"`.
- `src/lib/`, `src/config/` and `src/types/` hold what both sides import.
- `src/proxy.ts` and the instrumentation files move into `src/`, as Next requires with a `src/` folder.
- `database/`, `docs/`, `scripts/` and `public/` stay at the root.
- One alias, `@/*` → `src/*`.

The client/server boundary is held by `import "server-only"` (a client import of server code fails
`next build`, transitively) and four `import/no-restricted-paths` zones plus one local rule in
`eslint.config.mjs`. That replaces the 15 rule IDs (F1–X1, V1, R3–R9, LIB, CR-06) and the separate
`check:boundaries` step.

The feed's read path moved out of its route into `src/server/services/news/topHeadlines.ts`, unchanged,
so the article page calls it directly instead of fetching its own API over HTTP (BL-016).

## Alternatives rejected

- **Keep ADR 0002's layout.** It shows the split at the top level, but at the cost of two files per
  route, a custom checker, and a layout no Next.js developer expects. The separation that matters,
  server code out of the browser, is enforced by `server-only`, not by folder names.
- **No `src/` folder** (`app/`, `components/`, `lib/` at the root). Also standard, but it puts
  application code beside a dozen config files. The owner asked for fewer top-level folders.
- **Page bodies in `src/app/_components/`.** Private folders are a valid convention, but the
  components are shared across pages (Header, Footer, ArticleCard), so `src/components/` is the
  clearer home.
- **Move `database/` to `supabase/migrations/`.** The Supabase CLI convention needs timestamped file
  names and a `config.toml`. Two migrations are waiting for the owner to apply them by their current
  paths, so the folder stays until the local-database work adopts the CLI.

## Consequences

- Every route is one file; finding the code for a URL is reading its folder.
- Measured on one machine, this branch against `panel-0-access` (the HANDOFF §2 method): route table
  identical (30 routes and the proxy), CSS byte-identical (93,939 bytes), client JS 981,592 → 980,692
  bytes (−900), and every route smaller or equal: `/` −435, `/admin` −339, `/contact` and `/saved`
  −243, `/article/[slug]` −186, `/about`, `/privacy` and `/terms` −136. 47 test suites, 736 tests,
  before and after.
- `docs/CODEMAP.md` and `docs/_baseline-routes.txt` are gone. An editor's "find references" answers
  what CODEMAP did; the route table is compared from `next build` output.
- Branches started before this one (and `panel-0-access` itself, if it gets more commits) need their
  files moved to the new paths when merged. Git follows the renames; the one-line re-exports were
  deleted, so new routes must be written in the new place.
- `docs/PANEL_PLAN.md` (not edited, by the owner's rule) still names `app/`, `backend/` and `shared/`
  in its "How the check flows" section. Read them as `src/app/`, `src/server/` and `src/config/`.
