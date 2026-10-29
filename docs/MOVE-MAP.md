# MOVE MAP — migration execution plan

**Status: finalized in Phase C (2026-10-30), awaiting owner approval.** Nothing has moved yet.

**Source of truth.** The map is data, in [`scripts/move-map.mjs`](../scripts/move-map.mjs). The
file lists below are generated from it (`node scripts/check-move-map.mjs --plan`); CODEMAP's
*Target* column is rendered from it too. Change the map there and nowhere else — two copies of the
same table drift, and then one of them lies.

**Validated, not just designed.** `node scripts/check-move-map.mjs` builds the real import graph,
relocates every file to its target, and tests all 149 edges against the import rules in
[`architecture.md`](architecture.md) §5. Run it before and after every slice.

| Map | Rule violations |
|---|--:|
| Phase A draft (six features) | **21** |
| This map | **2** — both the one known bug, see *Stop conditions* |

The draft was written by reasoning about each file. The checker showed that reasoning was wrong in
21 places, which is why Phase C exists.

---

## What changed from the Phase A draft, and why

Every change below was forced by a measured violation, not by preference.

| Draft said | Map now says | Evidence |
|---|---|---|
| `features/i18n` | **dissolved.** `translations.ts` → `config/`, `LanguageContext` → `components/ui/i18n/`, `googleTranslate.ts` → `server/` | 12 of the 21 violations. News, the article page, Header and Footer all need i18n, so it is shared infrastructure, not a feature. Rule 4: shared things move **down** |
| `features/bookmarks` | **dissolved.** `bookmarks.ts` stays in `lib/` | ArticleCard (news) and Header both import it — 2 violations |
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
      components/         ArticleCard · HomeClient · ArticleDetailView · Header · MarqueeTicker · CategoryMegaMenu
      server/             db · categoryClassifier · fetchNews · newsdata
      newsConfig.ts       editorial policy — pure, so client-safe
      index.ts            client-safe public surface
      server.ts           server-only public surface
    admin/components/     ArticlesTable · ActivityLog · BreakingNewsManager · CategoryStatsCard
                          · SyncDashboard · BreakingNewsBanner
    chat/components/      Chatbot · FloatingAiAssistant
  components/ui/
    theme/ThemeContext    i18n/LanguageContext    layout/Footer    ThemeSpinner    NewsSkeletonGrid
  server/                 supabase · auth/adminSession · auditLog · googleTranslate
  lib/                    cache · rateLimit · sentryScrub · urlValidation · bookmarks   (unchanged)
  config/                 imageDomains · categoryColors · topicImages · translations
  types/                  index.ts   (unchanged)
  proxy.ts · instrumentation*.ts · sentry.*.config.ts   PINNED
```

After slice 6, `src/context/` and `src/components/admin/` are empty and disappear; `src/components/`
holds only `ui/`.

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

Inside a feature, files import each other by relative path, never through their own `index.ts`
(which would create cycles).

---

## Slice order

Smallest and safest first, so the mechanics are proven before the risky slices. One slice per
commit.

| # | Slice | Files | Risk | Watch for |
|--:|---|--:|---|---|
| 1 | `features/chat` | 2 | **Low** | **Proves the mechanics** — `git mv`, `index.ts`, import rewrites, verify. Only `app/layout.tsx` imports it |
| 2 | `config/` | 4 | **High** | `next.config.ts` imports `imageDomains.ts` at **config-load time**. Update that import in the same commit; a passing `build` confirms `remotePatterns` still resolves (CR-06) |
| 3 | `server/` | 4 | Medium | After the move, `check-move-map.mjs` must still report only the 2 known violations |
| 4 | `components/ui/` | 5 | Medium | `ThemeContext` has **18 importers** — the widest blast radius in the project |
| 5 | `features/admin` | 6 | Medium | Must not disturb the proxy matcher (CR-05). The `ActivityLog` boundary bug travels with it — see *Stop conditions* |
| 6 | `features/news` | 12 | **High** | Largest surface. Create `index.ts` **and** `server.ts`. **Measure the client bundle before and after** — see the procedure |
| 7 | `app/` route groups | — | **High, low value** | **Recommended: defer.** See below |

### Slice 7 — recommend deferring

Wrapping pages in `(reader)` and `(marketing)` groups changes no URL, but today **buys nothing**:
no page shares a group layout, and every page imports Header and Footer itself. Meanwhile it is the
slice most exposed to the stale-route-types failure (BL-007), because it moves every page file.
Route groups become worth doing when a group layout can own the shared Header/Footer — which is a
code change, so it belongs in Phase F. **Owner decision.**

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

**Slice 4 — `components/ui/`** (5 files)

| Current | Target |
|---|---|
| `context/ThemeContext.tsx` | `components/ui/theme/ThemeContext.tsx` |
| `context/LanguageContext.tsx` | `components/ui/i18n/LanguageContext.tsx` |
| `components/ThemeSpinner.tsx` | `components/ui/ThemeSpinner.tsx` |
| `components/NewsSkeletonGrid.tsx` | `components/ui/NewsSkeletonGrid.tsx` |
| `components/Footer.tsx` | `components/ui/layout/Footer.tsx` |

**Slice 5 — `features/admin`** (6 files)

| Current | Target |
|---|---|
| `components/admin/ActivityLog.tsx` | `features/admin/components/ActivityLog.tsx` |
| `components/admin/ArticlesTable.tsx` | `features/admin/components/ArticlesTable.tsx` |
| `components/admin/BreakingNewsManager.tsx` | `features/admin/components/BreakingNewsManager.tsx` |
| `components/admin/CategoryStatsCard.tsx` | `features/admin/components/CategoryStatsCard.tsx` |
| `components/admin/SyncDashboard.tsx` | `features/admin/components/SyncDashboard.tsx` |
| `components/BreakingNewsBanner.tsx` | `features/admin/components/BreakingNewsBanner.tsx` |

**Slice 6 — `features/news`** (12 files)

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

<!-- end generated -->

**Not moving:** everything under `src/app/` (the paths are the URLs), `lib/cache`, `lib/rateLimit`,
`lib/sentryScrub`, `lib/urlValidation`, `lib/bookmarks` and its test, `types/`, and the five pinned
framework files.

---

## Stop conditions

A slice that cannot be completed as a pure move — one that needs an edit to a module body — stops.
Two are known in advance.

### SC-1 — `adminLogger.ts` must be split before Phase E · **owner decision needed**

`ActivityLog.tsx` (client) imports `ACTION_LABELS` and `ACTION_ICONS` from `adminLogger.ts`, which
imports `supabase.ts`. That is the boundary bug the whole structure exists to prevent, and moving
files cannot fix it — the two constants have to leave the module. That is a content edit.

If nothing is done, Phase E's lint rule fails on it. Two options:

- **A — recommended.** One explicitly approved extraction commit after slice 5: move
  `ACTION_LABELS`, `ACTION_ICONS` and the `AdminAction` / `AdminLog` types into
  `config/adminActions.ts`. `config/` sits below both `server/` and `features/`, so `auditLog.ts` and
  `ActivityLog.tsx` can each import it downward and neither imports the other. About 40 lines
  relocated, no logic changed, and it removes both known violations — taking the Supabase SDK out
  of `/admin`'s browser chunk. (That chunk is 283 KB in total; the SDK's share of it has not been
  measured, so do not quote a saving until slice 5 measures one.)
- **B.** Allowlist the one edge in the Phase E rule and fix it in Phase F.

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
| `bookmarks.ts` | stays in `lib/` | Client-side store used by news, Header and the saved page | `features/bookmarks/` — 2 sideways violations, and a one-file feature |
| `ThemeContext.tsx` | `components/ui/theme/` | Presentational, 18 importers across every layer. Shared, so it moves down | any feature — 18 cross-feature imports |

---

## Per-slice procedure

```bash
node scripts/check-move-map.mjs   # before: expect "2 known, 0 unexpected"
git mv <old> <new>                # never cp + rm — rename detection must survive
# fix imports (prefer the @/ alias); add the feature's index.ts / server.ts
rm -rf .next/types                # ONLY if the slice moves or deletes a route file (BL-007)
npm run verify                    # typecheck · lint · test · build — ALL FOUR
node scripts/check-move-map.mjs   # after: still "0 unexpected"
npm run test:ci && node scripts/generate-codemap.mjs   # regenerate CODEMAP
git commit                        # one slice, named in the subject
```

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
