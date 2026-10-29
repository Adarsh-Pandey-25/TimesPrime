# MOVE MAP — migration execution plan

**Scope.** This is the *execution* document: slice order, what moves in each, the risk, and the
judgement calls. The per-file destination table lives in [`CODEMAP.md`](CODEMAP.md) — it is not
repeated here, because two copies of the same table drift and then one of them lies.

**Structure decision.** Layer separation with a CI-enforced boundary, approved 2026-10-29. A
top-level `backend/` folder was considered and rejected: in the App Router,
`src/app/api/**/route.ts` *is* the backend and its path *is* the URL. See
[`adr/0001-feature-first-structure.md`](adr/0001-feature-first-structure.md) once written.

---

## Target layout

```
src/
  app/                  ROUTING ONLY — handlers parse, delegate, serialize
    (reader)/           / · article/[slug] · saved          route group, URLs unchanged
    (marketing)/        about · contact · privacy · terms
    admin/              login · dashboard
    api/                paths frozen — CR-01, CR-02
  features/
    news/ article/ admin/ chat/ bookmarks/ i18n/
      components/       ← frontend half
      server/           ← backend half
      index.ts          ← the ONLY public surface
  components/ui/        presentational primitives, zero domain knowledge
  server/               backend-only: db · supabase · auth · auditLog
  lib/                  cross-cutting, domain-free: cache · rateLimit · urlValidation · sentryScrub
  config/               static data: imageDomains · categoryColors · topicImages
  types/                genuinely shared types
```

**Pinned, never moved:** `src/proxy.ts`, `src/instrumentation.ts`,
`src/instrumentation-client.ts`, `src/sentry.*.config.ts`.

---

## The boundary rule

Each feature exposes exactly one public surface: `features/<name>/index.ts`.

- Nothing imports **across** feature boundaries.
- Features import only **downward** — into `components/ui`, `lib`, `server`, `config`.
- Nothing reaches **past** a feature's `index.ts` into its internals.
- **If two features need the same thing, it moves down. It does not get imported sideways.**

Phase E makes this a lint rule. Until then it is a convention, and conventions decay.

---

## Slice order

Least coupled first, so the mechanics are proven before the hard slices. One slice per commit.

| # | Slice | Risk | Moves | Watch for |
|--:|---|---|---|---|
| 1 | `config/` | **High** | `imageDomains` · `categoryColors` · `topicImages` | **Despite being first.** `next.config.ts` imports `imageDomains.ts` at **config-load time**. Move that import in the same commit and confirm `remotePatterns` still resolves (CR-06). The module must never import React or `server-only` |
| 2 | `server/` | Medium | `db` · `supabase` · `adminSession` → `auth/` · `adminLogger` → `auditLog` | Split `adminLogger`: server half to `server/`, `ACTION_LABELS`/`ACTION_ICONS` to `features/admin/`. Verify no client file imports these afterwards |
| 3 | `features/bookmarks` | **Low** | `lib/bookmarks.ts` + its test | Self-contained and already tested. **The slice that proves the mechanics — do not skip it** |
| 4 | `features/i18n` | Low | `translations` · `googleTranslate` · `LanguageContext` | Provider must stay above its consumers in the tree |
| 5 | `features/chat` | Low | `Chatbot` · `FloatingAiAssistant` + chat route logic | Has tests. The route must keep streaming — verify a real response, not just a 200 |
| 6 | `features/news` | Medium | `newsConfig` · `categoryClassifier` · `fetchNews` · `newsdata` · `ArticleCard` · `HomeClient` · `MarqueeTicker` · `CategoryMegaMenu` | Largest surface, touches the most routes |
| 7 | `features/article` | **High** | `ArticleDetailView` · `paraphraser` · scraper logic | **Expect the stop condition** — see below |
| 8 | `features/admin` | Medium | `components/admin/*` · `BreakingNewsBanner` | Must not disturb the proxy matcher (CR-05). Fixes the `ActivityLog` boundary violation |
| 9 | `components/ui` | Low | `Header` · `Footer` · `ThemeSpinner` · `NewsSkeletonGrid` · `ThemeContext` | `ThemeContext` has 18 importers — widest blast radius in the project |
| 10 | `app/` route groups | **High** | `(reader)` · `(marketing)` wrappers | **URLs must be byte-identical.** Diff against `_baseline-routes.txt` |

### Stop condition

If a slice cannot be completed as a pure move and needs an edit to a module body, **stop**. Either
write a characterization test first, or defer that file to Phase F and say so explicitly.

**Slice 7 will almost certainly trip this.** Pulling 560 lines of scraper heuristics out of
`app/api/news/scrape-article/route.ts` into `features/article/server/` is an extraction, not a
move. Recommended: move `ArticleDetailView` and `paraphraser` in slice 7, and defer the scraper
extraction to Phase F where it gets a characterization test first.

---

## Judgement calls

These are the decisions a reasonable engineer could make differently. Recorded so they are not
silently re-litigated mid-migration.

| Module | Decision | Reasoning | Rejected |
|---|---|---|---|
| `newsConfig.ts` | `features/news/` | Looks like config, but it encodes **editorial policy** — which sources are spam, which scripts belong in which feed. Policy is domain logic. Its evidence comments belong with the feature that acts on them | `config/` — would separate the rules from the code that applies them |
| `topicImages.ts` | `config/` | 414 lines, but almost all of it is a keyword→URL table. The selection function is thin. Data, not logic | `features/news/` — the data is not news-specific; saved articles and the article page use it too |
| `BreakingNewsBanner.tsx` | `features/admin/components/` | Reader-facing, but its entire contract is the admin breaking-news API (CR-08). Owned by the feature that produces the data | `components/ui/` — would hide a cross-feature data dependency behind a "shared" label |
| `adminLogger.ts` | **Split** | Server writer to `server/auditLog.ts`; the two label constants to `features/admin/`. The split is what removes the one existing boundary violation | Moving it whole — keeps the Supabase SDK in the client bundle |
| `ThemeContext.tsx` | `components/ui/theme/` | Presentational, used by 18 modules across every feature. By the boundary rule, shared things move **down** | `features/` — 18 importers would all become cross-feature imports |
| `paraphraser.ts` | `features/article/` | Transforms article text | Pending **Q1** — if it is a legacy experiment it should be deleted, not moved |
| `rssParser.ts` | **Delete** | 233 commented-out lines; nothing imports it (confirmed by the import graph). Git history preserves it | Pending **Q2** |

---

## Per-slice procedure

```bash
git mv <old> <new>          # never cp+rm — rename detection must survive
# fix imports, prefer the @/ alias
# add features/<name>/index.ts as the single public surface
npm run verify              # typecheck · lint · test · build — ALL FOUR
git commit                  # one slice, named in the subject
```

Move colocated `*.test.ts` files **with their subjects**, in the same commit.

After slice 10, regenerate the route list and diff it against `_baseline-routes.txt`. Any
difference is a bug — fix it before proceeding. Then regenerate `CODEMAP.md` and update
`HANDOFF.md`.

### Rules that apply to every slice

- A commit is either a move **or** a change, never both.
- A red slice is **reverted**, not patched.
- Anything tempting found mid-move goes to [`BACKLOG.md`](BACKLOG.md), not into the commit.

---

## Blocked on open questions

Two slices cannot be finalised until the owner answers (see [`PRD.md`](PRD.md) §12):

- **Q1 — the paraphraser.** Deliberate republishing posture, or legacy experiment? Decides whether
  slice 7 moves it or deletes it.
- **Q2 — RSS.** Decides whether `rssParser.ts` and `/api/cron/refresh-rss` are deleted. Deleting a
  live route changes the route table, so it must happen **before** slice 10's byte-identical diff —
  or be deliberately excluded from that diff with a note.
