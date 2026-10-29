# ADR 0001 — Feature-first structure with layer separation and a CI-enforced boundary

**Status:** Proposed — 2026-10-30, Phase C. Becomes *Accepted* when the owner approves the move map.
**Supersedes:** nothing. **Related:** [`architecture.md`](../architecture.md),
[`MOVE-MAP.md`](../MOVE-MAP.md), [`scripts/move-map.mjs`](../../scripts/move-map.mjs).

## Context

The codebase is ~12,000 lines of TypeScript on Next.js 16.3, organised by file type: `components/`
holds every component, admin and reader mixed; `lib/` holds six unrelated kinds of thing — data
access, security primitives, infrastructure, domain logic, static config and i18n — under one name
that says nothing about any of them.

The cost is concrete, not aesthetic. Nothing marks which `lib/` modules are server-only, so nothing
stops a client component importing one — and one does. `ActivityLog.tsx` imports two constants from
`adminLogger.ts`, which imports `supabase.ts`, and the production build confirms the Supabase SDK
ships in the browser chunk loaded by `/admin`.

Forces that are not choices:

- **Next.js is unopinionated about organisation.** Its bundled docs present three strategies and
  conclude "choose a strategy that works for you and your team and be consistent". This is a team
  decision, not a framework mandate.
- **Under `src/app/`, the path is the URL.** Route handlers *are* the backend and cannot leave
  `app/` without changing every API URL (CR-01), the cron path in `vercel.json` (CR-02) and the
  proxy's auth matcher (CR-05).
- **Five files are location-pinned:** `proxy.ts`, `instrumentation.ts`, `instrumentation-client.ts`,
  `sentry.server.config.ts`, `sentry.edge.config.ts`.
- **`imageDomains.ts` is evaluated by `next.config.ts` at config-load time** and must import nothing
  (CR-06).
- **Test coverage is 3.50%.** `tsc` and `build` prove a pure move compiles; almost nothing proves
  behaviour. So the restructure must be moves and import rewrites only.

## Decision

Organise `src/` by **layer**, with a small number of **features** on top, and enforce the boundaries
with a lint rule rather than with documentation.

- `app/` — routing only. Paths frozen.
- `features/news`, `features/admin`, `features/chat` — one folder per capability, each with a
  `components/` (frontend) and, where it has one, a `server/` (backend) half.
- Shared layers below the features: `components/ui/` (domain-free presentation), `server/`
  (backend-only), `lib/` (cross-cutting utilities), `config/` (static data), `types/`.
- Imports go **downward only**. Nothing imports sideways between features. Anything two features
  both need moves down into a shared layer.
- Each feature exposes **at most two** public surfaces: `index.ts`, safe for client and server, and
  `server.ts`, server-only.
- The rules are written in [`architecture.md`](../architecture.md) §5 and enforced in CI in Phase E.

## How the structure was arrived at — by measurement

The Phase A draft proposed six features: `news`, `article`, `admin`, `chat`, `bookmarks`, `i18n`.
It was reasoned out file by file and looked right.

Phase C tested it instead. `scripts/check-move-map.mjs` builds the real import graph with the
TypeScript compiler API, relocates every file to its proposed target, and checks all 149 edges
against the rules. **The draft broke them 21 times.** Each violation pointed at a wrong boundary:

| Draft boundary | Violations | What the graph showed |
|---|--:|---|
| `features/i18n` | 12 | News, the article page, Header and Footer all need it. It is shared infrastructure |
| `features/bookmarks` | 2 | ArticleCard and Header both import it. Shared |
| `features/article` | 1 | The article page renders the feed's `ArticleCard`. Not separable from news |
| Header in `components/ui` | 1 | Header renders the news category menu with article previews. It is news's masthead |
| `db.ts` in `server/` | 2 | It imports news editorial policy, making `server/` depend on a feature |
| client → `server/` | 2 | The one pre-existing bug, which the draft did not fix either |

Resolving them by the rule "shared things move down" produced **three** features. The resulting
map breaks the rules **twice**, and both entries are the pre-existing `ActivityLog` bug — the same
two the CODEMAP generator finds independently by a different method. Fixing that bug requires a
content edit, so it is a stop condition in Phase D, not a structural flaw in the map.

The draft was wrong because it grouped files by what they seemed to be *about*. The graph groups
them by what they actually *depend on*. Only the second survives a lint rule.

## Alternatives rejected

**1. Top-level `frontend/` and `backend/` folders, or two separate apps.** The literal reading of
"separate frontend and backend". In the App Router, `app/api/**/route.ts` is the backend and its path
is the URL, so a `backend/` folder breaks CR-01, CR-02 and CR-05. Two deployable apps would be a
rewrite, not a reorganisation: a second service to run and deploy, auth to rebuild, and server
components losing direct data access. The goal behind the request — a real wall between browser
code and server code — is better met by layers enforced in CI, which is stronger than folder
distance: a folder can be imported across, a failing lint rule cannot be merged.

**2. Full Feature-Sliced Design.** Its layer taxonomy (`shared` / `entities` / `features` /
`widgets` / `pages`) is the mature version of this idea, and it was the obvious answer to the
`ArticleCard` problem — an `entities/article` layer would let news and the article page share the
card. Rejected as too heavy here: ~12,000 lines, two personas, and three real features do not need
five layers and their conventions. Merging the article page into news solved the same problem with
no new layer.

**3. Keep the type-based layout (`components/`, `lib/`) and just tidy it.** Cheapest, and it does
not address the actual failure: a folder named by file type cannot say which code is server-only,
and so cannot stop a client component importing it. The one violation that exists today is exactly
this.

**4. The six-feature Phase A draft.** Rejected by measurement — 21 violations, above. Recorded as a
rejected alternative because it was the *approved* design at the end of Phase A, and the reason it
changed should not be lost.

**5. One `index.ts` barrel per feature.** The conventional single public surface. Rejected for
`features/news`, which holds both client components and server modules: a client import of any
component through the barrel would resolve `db.ts` as well. `supabase.ts` calls `createClient()` at
module scope — a side effect no bundler can remove — which is precisely how the SDK reached the
browser through `ActivityLog`. Two surfaces make server code unreachable from the client by
construction. Slice 6 measures the client bundle before and after to confirm the barrels cost
nothing.

## Consequences

**Easier.**
- "Where does this go?" has a rule-based answer, and the rule can be checked by a script.
- Server-only code is unreachable from the browser by construction once Phase E is on.
- Deleting a capability means deleting one folder.
- CODEMAP's targets and MOVE-MAP's file lists both render from one data file, so they cannot drift.

**Harder.**
- `features/news` is large — 12 files, the core of the product — and will be the main subject of
  Phase F decomposition.
- `Header` lives in a feature although every page uses it. Pages import it from `app/`, which is
  allowed; a cleaner design passes the category menu in as a slot, which is a Phase F change.
- Every new import has to respect the direction rule, and a contributor who gets it wrong learns
  from CI, not from review.
- Two public surfaces per feature is one more convention to know.

**Deferred, deliberately.**
- Route groups under `app/` — no URL changes, no benefit until a group layout exists (MOVE-MAP
  slice 7).
- The `adminLogger` split — needs an owner decision (MOVE-MAP SC-1).
- Extracting logic out of route handlers — Phase F, behind characterization tests.
