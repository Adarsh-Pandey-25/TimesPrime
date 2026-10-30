# ADR 0001 — Feature-first structure with layer separation and a CI-enforced boundary

**Status:** **Accepted** — 2026-10-30, owner approval of Phase C, with conditions applied: a split
criterion for `features/news`, route groups recorded as deferred, `lib/` kept domain-free, and a
`server-only` guard on every `server.ts`.
**Supersedes:** nothing. **Related:** [`architecture.md`](../architecture.md),
[`MOVE-MAP.md`](../MOVE-MAP.md), [`scripts/move-map.mjs`](../../scripts/move-map.mjs).

## Context

The codebase is ~12,000 lines of TypeScript on Next.js 16.3, organised by file type: `components/`
holds every component, admin and reader mixed; `lib/` holds six unrelated kinds of thing — data
access, security primitives, infrastructure, domain logic, static config and i18n — under one name
that says nothing about any of them.

The cost is concrete, not aesthetic. Nothing marks which `lib/` modules are server-only, so nothing
stops a client component importing one — and one does. `ActivityLog.tsx` imports two constants from
`adminLogger.ts`, which imports `supabase.ts`, and the production build confirmed the Supabase SDK
shipped in the browser chunk loaded by `/admin`. (Fixed before Phase D in `b01d528`; afterwards the
SDK appears in zero browser chunks.)

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
- **Test coverage is under 4%** (3.63% at `9f3b76f`). `tsc` and `build` prove a pure move compiles; almost nothing proves
  behaviour. So the restructure must be moves and import rewrites only.

## Decision

Organise `src/` by **layer**, with a small number of **features** on top, and enforce the boundaries
with a lint rule rather than with documentation.

- `app/` — routing only. Paths frozen.
- `features/news`, `features/admin`, `features/chat` — one folder per capability, each with a
  `components/` (frontend) and, where it has one, a `server/` (backend) half.
- Shared layers below the features: `components/ui/` (domain-free presentation), `context/`
  (app-wide state providers — theme and language; added at Phase B close, since a stateful provider
  is not a UI primitive), `server/` (backend-only), `lib/` (cross-cutting utilities), `config/`
  (static data), `types/`.
- Imports go **downward only**. Nothing imports sideways between features. Anything two features
  both need moves down into a shared layer.
- Each feature exposes **at most two** public surfaces: `index.ts`, safe for client and server, and
  `server.ts`, server-only. **Every `server.ts` begins with `import "server-only";`**, so a client
  import of it fails the build (Next.js 16 docs, "Preventing environment poisoning").
- `lib/` stays **domain-free**. Modules that know a product concept live in a feature or in
  `config/` — the definition is not loosened to fit what happens to be in the folder.
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
map broke the rules **twice**, and both entries were the pre-existing `ActivityLog` bug — the same
two the CODEMAP generator finds independently by a different method. That bug needed a content
edit, so it was fixed in its own owner-approved commit, `b01d528`. **The map now breaks the rules
zero times.**

In review, `bookmarks.ts` then moved from `lib/` into `features/news`: it stores `Article` objects,
so keeping it would have meant quietly redefining `lib/` as "anything shared". With Header already
in news, every importer of bookmarks was in news or `app/`, and the checker confirmed 0 violations.

The draft was wrong because it grouped files by what they seemed to be *about*. The graph groups
them by what they actually *depend on*. Only the second survives a lint rule.

## When `features/news` gets split

`features/news` is deliberately large — it is the product's core. It must not become a second
`lib/`: a place things go because they are vaguely news-related. Review a split when **any** of
these holds. Each is checkable, not a matter of taste.

1. **The article page gains its own data access or logic.** Today it renders scraped text and has
   no server code of its own. The expected trigger is Phase F extracting the scraper into
   `features/news/server/`: once the article page owns server code that the feed never touches, it
   is a sub-domain. Split it out as `features/article` **only if** the pieces both need —
   `ArticleCard`, `newsConfig` — can move down first, so `check-move-map` still reports **0**
   violations. If they cannot, the split is premature.
2. **Size tripwire: more than 20 modules or 6,000 lines.** At acceptance it is **12 modules and
   4,091 lines** (excluding tests and the two surface files); moving Footer in before slice 4 makes it **13 and
   4,305**. Roughly 40% headroom; crossing it
   means reviewing the feature's boundary, not adding more.
3. **A news module is needed by another feature.** Then it moves down (import rule 4). It does not
   get re-exported sideways.
4. **A module stops serving the reader journeys.** Every module in `features/news` must serve
   browsing the feed, reading an article, saving one, or ingesting news (PRD §5). A utility that
   knows nothing about news belongs in `lib/`; one that only an operator uses belongs in
   `features/admin`. This is the test that keeps it from becoming `lib/` again.

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

**6. A separate `src/shared/` layer for product-aware shared code.** Proposed as a home for
modules that carry product knowledge but are used in more than one place, so that `lib/` could stay
domain-free. Rejected because, once measured, it would hold one file: `bookmarks.ts`, whose
consumers are all in `features/news` or `app/`. It joined news instead. Reconsider if a
product-aware module is ever genuinely needed by two features — that is the case this layer is for,
and today there is no such module.

### Considered and deferred

**Route groups under `app/` — `(reader)` and `(marketing)`.** Considered as part of the plan from
the start. **Deferred by owner decision**, for three reasons: they change no URL; they buy nothing
while no page shares a group layout, since every page imports Header and Footer itself; and moving
every page file is exactly what trips the stale-route-types failure in BL-007. Revisit when a group
layout can own the shared Header and Footer — which is a code change, so Phase F at the earliest.

## Consequences

**Easier.**
- "Where does this go?" has a rule-based answer, and the rule can be checked by a script.
- Server-only code is unreachable from the browser by construction once Phase E is on.
- Deleting a capability means deleting one folder.
- CODEMAP's targets and MOVE-MAP's file lists both render from one data file, so they cannot drift.

**Harder.**
- `features/news` is large — 13 files, the core of the product — and will be the main subject of
  Phase F decomposition.
- `Header` lives in a feature although every page uses it. Pages import it from `app/`, which is
  allowed; a cleaner design passes the category menu in as a slot, which is a Phase F change.
- Every new import has to respect the direction rule, and a contributor who gets it wrong learns
  from CI, not from review.
- Two public surfaces per feature is one more convention to know.

**Deferred, deliberately.**
- Route groups under `app/` — see *Considered and deferred*.
- Extracting logic out of route handlers — Phase F, behind characterization tests.

**Done before Phase D.**
- The `adminLogger` split (MOVE-MAP SC-1), `b01d528` — the one boundary violation, fixed.
