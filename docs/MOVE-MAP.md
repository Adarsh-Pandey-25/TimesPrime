# MOVE MAP — migration execution plan

**Status: executed 2026-10-30.** All 34 moves are committed as six slices, `a626542`..`73e207f`
(one commit per slice; see HANDOFF §4). `check-move-map` reports "34 moves (34 done) · 0
violation(s)". The map stays the record of where each file came from.

**Source of truth.** The map is data, in [`scripts/move-map.mjs`](../scripts/move-map.mjs). The
file lists below are generated from it (`node scripts/check-move-map.mjs --plan`); CODEMAP's
*Target* column is rendered from it too. Change the map there and nowhere else — two copies of the
same table drift, and then one of them lies.

**Validated, not just designed.** `node scripts/check-move-map.mjs` builds the real import graph,
relocates every file to its target, and tests every import edge (155 at the end of Phase D) against the import rules in
[`architecture.md`](architecture.md) §5. Run it before and after every slice.

| Map | Rule violations |
|---|--:|
| Phase A draft (six features) | **21** |
| Finalized map, Phase C | **2** — both the one known `ActivityLog` bug |
| Finalized map, after SC-1 (`b01d528`) | **0** |

The draft was written by reasoning about each file. The checker showed that reasoning was wrong in
21 places, which is why Phase C exists.

---

## What changed from the Phase A draft, and why

Every change below was forced by a measured violation, not by preference.

| Draft said | Map now says | Evidence |
|---|---|---|
| `features/i18n` | **dissolved.** `translations.ts` → `config/`, `LanguageContext` **stays** in `context/` (Phase B close: a stateful provider is not a UI primitive), `googleTranslate.ts` → `server/` | 12 of the 21 violations. News, the article page, Header and Footer all need i18n, so it is shared infrastructure, not a feature. Rule 4: shared things move **down** |
| `features/bookmarks` | **dissolved.** `bookmarks.ts` → `features/news/` | ArticleCard (news) and Header both import it — 2 violations as its own feature. Kept in `lib/` at first, but it stores `Article` objects, and `lib/` is domain-free; once Header moved into news, every importer was in news or `app/`, so it joined news with 0 violations (Phase C review) |
| `features/article` | **merged into `features/news`** | `ArticleDetailView` renders `ArticleCard` for related stories. Keeping them apart needs either a sideways import or an entities layer, which ADR 0001 rejects |
| `Header` → `components/ui/layout/` | **`features/news/components/`** | Header renders the news category mega-menu with article previews. It is the news site's masthead, not domain-free UI |
| `db.ts` → `server/` | **`features/news/server/db.ts`** | It imports news editorial policy (`newsConfig`, `categoryClassifier`) — `server/` importing a feature is upward. Only `app/` routes import it, so it can live in the feature |
| One `index.ts` per feature | **Two surfaces: `index.ts` + `server.ts`** | See *Public surfaces* below |

**Net result:** three features — `news`, `admin`, `chat` — instead of six.

---

## Target layout

```
src/
  app/                    ROUTING ONLY — handlers parse, delegate, serialize. Paths frozen (CR-01).
  features/
    news/                 feed, article page, masthead, ingestion, classification, storage
      components/         ArticleCard · HomeClient · ArticleDetailView · Header · Footer · MarqueeTicker
                          · CategoryMegaMenu
      server/             db · categoryClassifier · fetchNews · newsdata
      newsConfig.ts       editorial policy — pure, so client-safe
      bookmarks.ts        device-local saved articles — client-safe
      index.ts            client-safe public surface
      server.ts           server-only public surface — first line: import "server-only"
    admin/components/     ArticlesTable · ActivityLog · actionLabels · BreakingNewsManager
                          · CategoryStatsCard · SyncDashboard · BreakingNewsBanner
    chat/components/      Chatbot · FloatingAiAssistant
  components/ui/
    ThemeSpinner    NewsSkeletonGrid
  context/                ThemeContext · LanguageContext   (app-wide state providers; unchanged)
  server/                 supabase · auth/adminSession · auditLog · googleTranslate
  lib/                    cache · rateLimit · sentryScrub · urlValidation   (domain-free; none moves)
  config/                 imageDomains · categoryColors · topicImages · translations
  types/                  index.ts   (unchanged)
  proxy.ts · instrumentation*.ts · sentry.*.config.ts   PINNED
```

After slice 6, `src/components/admin/` is empty and disappears, and `src/components/` holds only
`ui/`. `src/context/` stays.

---

## Public surfaces

Each feature exposes **at most two** entry points, and nothing outside the feature imports past them:

- **`features/<name>/index.ts`** — safe to import from client *and* server code.
- **`features/<name>/server.ts`** — server-only: database access, upstream API clients, anything
  holding a secret. Client code must never import it.

**Why two, not one.** A single barrel re-exporting both kinds would let any client component that
imports, say, `ArticleCard` from `@/features/news` resolve `db.ts` along with it. That is the exact
mechanism already observed in production: `supabase.ts` calls `createClient()` at module scope, a
side effect no bundler can tree-shake, which is how the Supabase SDK ended up in `/admin`'s browser
chunk (see [`CODEMAP.md`](CODEMAP.md)). Splitting the surfaces keeps server code unreachable from
the client by construction, rather than by hoping tree-shaking holds.

**`server.ts` begins with `import "server-only";`** so the boundary is enforced by the build, not
by discipline. Per the Next.js 16 docs (`01-app/01-getting-started/05-server-and-client-components.md`,
"Preventing environment poisoning"), importing such a module into a client component is a
**build-time error**, and installing the `server-only` package is optional in Next.js — it resolves
to a copy Next bundles (`node_modules/next/dist/compiled/server-only`). One caveat: Jest does not
use Next's resolver, so the first test that imports a `server.ts` will need `npm install server-only`
or a `moduleNameMapper` entry. No test does today.

Inside a feature, files import each other by relative path, never through their own `index.ts`
(which would create cycles).

Each feature folder also holds a three-line `package.json`, `{ "sideEffects": ["./server.ts"] }`,
without which a barrel imported by a server component ships every client component it re-exports.
Measured and explained in `architecture.md` rule 1. Do not delete it as clutter.

---

## Slice order

Smallest and safest first, so the mechanics are proven before the risky slices. One slice per
commit.

| # | Slice | Files | Risk | Watch for |
|--:|---|--:|---|---|
| 1 | `features/chat` | 2 | **Low** | **Proves the mechanics** — `git mv`, `index.ts`, import rewrites, verify. Only `app/layout.tsx` imports it |
| 2 | `config/` | 4 | **High** | `next.config.ts` imports `imageDomains.ts` at **config-load time**. Update that import in the same commit; a passing `build` confirms `remotePatterns` still resolves (CR-06) |
| 3 | `server/` | 4 | Medium | After the move, `check-move-map.mjs` must still report 0 violations — `server/` is now unreachable from any client module, and must stay so |
| 4 | `components/ui/` | 2 | Low | Presentation only. The providers no longer move, so `ThemeContext`'s 18 importers are untouched. Footer moved to slice 6 — see *Judgement calls* |
| 5 | `features/admin` | 7 | Medium | Must not disturb the proxy matcher (CR-05). `actionLabels.ts` moves with `ActivityLog` — SC-1 is already done, so this is now a pure move |
| 6 | `features/news` | 15 | **High** | Largest surface. Create `index.ts` **and** `server.ts` (with `import "server-only"`), and **prove** the guard — see the procedure. **Measure the client bundle before and after** |
| ~~7~~ | ~~`app/` route groups~~ | — | — | **Skipped** — owner decision, Phase C review |

### Slice 7 — skipped

Route groups were considered and **skipped by owner decision**: wrapping pages in `(reader)` and
`(marketing)` changes no URL, buys nothing while no page shares a group layout, and is the slice
most exposed to the stale-route-types failure (BL-007), since it moves every page file. Revisit
only when a group layout can own the shared Header/Footer — a code change, so Phase F at the
earliest. Recorded in ADR 0001.

---

## Generated file lists

<!-- generated by `node scripts/check-move-map.mjs --plan` — do not edit by hand -->

**Slice 1 — `features/chat`** (2 files)

| Current | Target |
|---|---|
| `components/Chatbot.tsx` | `features/chat/components/Chatbot.tsx` |
| `components/FloatingAiAssistant.tsx` | `features/chat/components/FloatingAiAssistant.tsx` |

**Slice 2 — `config/`** (4 files)

| Current | Target |
|---|---|
| `lib/imageDomains.ts` | `config/imageDomains.ts` |
| `lib/categoryColors.ts` | `config/categoryColors.ts` |
| `lib/topicImages.ts` | `config/topicImages.ts` |
| `lib/translations.ts` | `config/translations.ts` |

**Slice 3 — `server/`** (4 files)

| Current | Target |
|---|---|
| `lib/supabase.ts` | `server/supabase.ts` |
| `lib/adminSession.ts` | `server/auth/adminSession.ts` |
| `lib/adminLogger.ts` | `server/auditLog.ts` |
| `lib/googleTranslate.ts` | `server/googleTranslate.ts` |

**Slice 4 — `components/ui/`** (2 files)

| Current | Target |
|---|---|
| `components/ThemeSpinner.tsx` | `components/ui/ThemeSpinner.tsx` |
| `components/NewsSkeletonGrid.tsx` | `components/ui/NewsSkeletonGrid.tsx` |

**Slice 5 — `features/admin`** (7 files)

| Current | Target |
|---|---|
| `components/admin/ActivityLog.tsx` | `features/admin/components/ActivityLog.tsx` |
| `components/admin/ArticlesTable.tsx` | `features/admin/components/ArticlesTable.tsx` |
| `components/admin/BreakingNewsManager.tsx` | `features/admin/components/BreakingNewsManager.tsx` |
| `components/admin/CategoryStatsCard.tsx` | `features/admin/components/CategoryStatsCard.tsx` |
| `components/admin/SyncDashboard.tsx` | `features/admin/components/SyncDashboard.tsx` |
| `components/BreakingNewsBanner.tsx` | `features/admin/components/BreakingNewsBanner.tsx` |
| `components/admin/actionLabels.ts` | `features/admin/components/actionLabels.ts` |

**Slice 6 — `features/news`** (15 files)

| Current | Target |
|---|---|
| `lib/newsConfig.ts` | `features/news/newsConfig.ts` |
| `lib/newsConfig.test.ts` | `features/news/newsConfig.test.ts` |
| `lib/db.ts` | `features/news/server/db.ts` |
| `lib/categoryClassifier.ts` | `features/news/server/categoryClassifier.ts` |
| `lib/fetchNews.ts` | `features/news/server/fetchNews.ts` |
| `lib/newsdata.ts` | `features/news/server/newsdata.ts` |
| `components/ArticleCard.tsx` | `features/news/components/ArticleCard.tsx` |
| `components/HomeClient.tsx` | `features/news/components/HomeClient.tsx` |
| `components/MarqueeTicker.tsx` | `features/news/components/MarqueeTicker.tsx` |
| `components/CategoryMegaMenu.tsx` | `features/news/components/CategoryMegaMenu.tsx` |
| `components/ArticleDetailView.tsx` | `features/news/components/ArticleDetailView.tsx` |
| `components/Header.tsx` | `features/news/components/Header.tsx` |
| `components/Footer.tsx` | `features/news/components/Footer.tsx` |
| `lib/bookmarks.ts` | `features/news/bookmarks.ts` |
| `lib/bookmarks.test.ts` | `features/news/bookmarks.test.ts` |

<!-- end generated -->

**Not moving:** everything under `src/app/` (the paths are the URLs), `lib/cache`, `lib/rateLimit`,
`lib/sentryScrub`, `lib/urlValidation`, `types/`, and the five pinned framework files.

---

## Stop conditions

A slice that cannot be completed as a pure move — one that needs an edit to a module body — stops.
Two are known in advance.

### SC-1 — `adminLogger.ts` split · **resolved in `b01d528`**

`ActivityLog.tsx` (client) imported `ACTION_LABELS` and `ACTION_ICONS` from `adminLogger.ts`, which
imports `supabase.ts` — so the Supabase SDK shipped in `/admin`'s browser chunk. Fixed before Phase D
as an owner-approved, behaviour-neutral commit (Option A):

- `AdminAction` and `AdminLog` → `types/` — the contract both the server writer and the admin UI need.
- `ACTION_LABELS` and `ACTION_ICONS` → `components/admin/actionLabels.ts`, beside their only
  consumer; it moves into `features/admin` with `ActivityLog` in slice 5. **Not `config/`**, as first
  proposed: `config/` is for data two layers share, and these have one consumer.

Moved declarations are byte-identical. Production build afterwards: `GoTrueClient` in **0** browser
chunks (was 1); check-move-map violations **2 → 0**.

### SC-2 — the scraper is not extracted in Phase D

`app/api/news/scrape-article/route.ts` (556 lines) stays where it is. Pulling its heuristics into
`features/news/server/` is an extraction, not a move, and belongs in Phase F behind a
characterization test. Merging `article` into `news` means Phase D has no slice that touches it.

---

## Judgement calls

Decisions a reasonable engineer could make differently, recorded so they are not re-litigated
mid-migration.

| Module | Decision | Reasoning | Rejected |
|---|---|---|---|
| `newsConfig.ts` | `features/news/` | Encodes **editorial policy** — which sources are spam, which scripts belong in which feed. Policy is domain logic, and its evidence comments belong with the code that applies it | `config/` — would separate the rules from the code that applies them |
| `topicImages.ts` | `config/` | 414 lines, almost all a keyword→URL table; the selection function is thin. Used by news *and* the saved page | `features/news/` — the saved page would then import a feature from `app/`, fine, but the data is not news policy |
| `translations.ts` | `config/` | Static strings, imports nothing — exactly what `config/` holds | `components/ui/i18n/` beside its provider — data and React provider are different kinds of thing |
| `BreakingNewsBanner.tsx` | `features/admin/` | Reader-facing, but its entire contract is the admin breaking-news API (CR-08). Owned by the feature that produces the data. Only `app/layout.tsx` imports it | `components/ui/` — would hide a data dependency behind a "shared" label |
| `Header.tsx` | `features/news/` | Renders the category mega-menu with article previews — a news component. Domain-free it is not | `components/ui/layout/` — 1 upward violation. Phase F can invert this by passing the menu in as a slot |
| `Footer.tsx` | `features/news/` (via slice 6) | Reads theme and language state from `context/` and renders 9 category links — app state *and* a product concept, so it fails both halves of `components/ui`'s "no state, no domain". Its importers are pages in `app/` and `HomeClient` (news). Owner decision, Phase D, before slice 4 | `components/ui/layout/` — the Phase C plan. It passed the checker only because `ui → context` and `ui → config` are downward imports, so the rule could not see the problem |
| `bookmarks.ts` | `features/news/` | Stores `Article` objects, so it carries product knowledge and cannot sit in a domain-free `lib/`. Its importers are Header and ArticleCard (both news) and the saved page (`app/`) | `features/bookmarks/` — 2 sideways violations, a one-file feature · `lib/` — would quietly redefine `lib/` · a new `shared/` layer — a whole layer for one file whose consumers already live in one feature |
| `actionLabels.ts` | `features/admin/` (via slice 5) | One consumer, `ActivityLog` | `config/` — config holds data two layers share; this has one consumer |
| `ThemeSpinner.tsx` | `components/ui/` (slice 4) | Reads `useTheme` to pick its colours. Theme is appearance, so rule R5 allows `ui → context/ThemeContext` and nothing else from `context/`. Owner decision, Phase D, before slice 4 | anywhere else — it has no domain; moving it would make "reads the theme" a reason to leave `ui`, which would empty `ui` of anything themed |
| `NewsSkeletonGrid.tsx` | `components/ui/` (slice 4) | Imports nothing. Its dimensions are copied from `ArticleCard`, so it is shaped like news but knows no product concept. Borderline; kept in `ui` | `features/news/` — reconsider if it ever imports an `Article` or a news module |
| `ThemeContext.tsx`, `LanguageContext.tsx` | stay in `context/` | App-wide state providers, not presentational primitives; the same reason applies to both, so they stay together | `components/ui/` — contradicts "presentation only" · any feature — 18 cross-feature imports |

---

## Per-slice procedure

```bash
node scripts/check-move-map.mjs   # before: expect "0 violation(s)"
git mv <old> <new>                # never cp + rm — rename detection must survive
# fix imports (prefer the @/ alias); add the feature's index.ts / server.ts
rm -rf .next/types                # ONLY if the slice moves or deletes a route file (BL-007)
npm run verify                    # typecheck · lint · check:boundaries · test · build (four steps until Phase E)
node scripts/check-move-map.mjs   # after: still "0 unexpected"
npm run test:ci && node scripts/generate-codemap.mjs   # regenerate CODEMAP
git commit                        # one slice, named in the subject
```

**Slice 6 only — prove the `server-only` guard.** After creating `features/news/server.ts`,
temporarily add `import "@/features/news/server";` to a `"use client"` component and run
`npm run build`. **It must fail.** Revert the line, rebuild, then commit. A guard that has never
been seen to fail is an assumption, not a guard.

**Slice 6 only — measure the client bundle.** Before the slice, record the total size of
`.next/static/chunks/*.js` and each route's chunk list from
`.next/server/app/**/page_client-reference-manifest.js`. Repeat after. A pure move plus barrel files
should leave both unchanged; **any growth above 1% means a barrel is pulling in code it should not**
— stop and investigate before committing.

Move colocated `*.test.ts` files **with their subjects**, in the same commit.

**Clear `.next/types` before verifying any slice that moves or deletes a route file** (BL-007).
`verify` runs `typecheck` before `build`, and `tsconfig.json` includes the previous build's
generated route types, which still import the old paths. The gate then fails while the source is
correct. This already happened once, in `bcd5393`. Do not "fix" the source in response — clear the
directory and re-run. The durable fix is `next typegen` in the `typecheck` script.

### Rules that apply to every slice

- A commit is either a move **or** a change, never both.
- A red slice is **reverted**, not patched.
- Anything tempting found mid-move goes to [`BACKLOG.md`](BACKLOG.md), not into the commit.

---

## Resolved by owner decision

Both questions that once blocked the map were answered on 2026-10-29 (see [`PRD.md`](PRD.md) §12),
and both files were **deleted rather than moved**: the paraphraser in `3805007`, and RSS in
`bcd5393`, including the live `/api/cron/refresh-rss` route. `_baseline-routes.txt` was updated in
that same commit, so the migration's route-table diff target already reflects 26 routes.
