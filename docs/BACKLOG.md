# Backlog

Debt deliberately deferred rather than fixed in place, with the reason it was
deferred and the phase that should pick it up. Added to when a rule in the
restructure plan ("no while-I-am-here fixes") stops a fix from happening in the
commit that found it.

---

## BL-001 — `db.ts` row mapping relies on `any` to hide unhandled nulls

**Found:** Phase 0b (lint baseline)
**Files:** `src/lib/db.ts` — the two `.map()` calls in `saveArticlesToDB` and `getDBArticles`
**Status:** Open · two `eslint-disable-next-line @typescript-eslint/no-explicit-any` in place

`db/schema.sql` declares `link`, `pub_date`, `description`, `content`,
`image_url`, `source_id`, `source_name`, `category`, `country` and `language` as
nullable. `Article` (in `src/types/index.ts`) declares `link: string` and
`pubDate: string` as required.

The accurate row type (`ArticleRow`, now defined in `db.ts` and checked against
the schema) is therefore *not* assignable to `Article` at those two mapping
sites. The pre-existing `(row: any)` annotation was the only thing letting it
compile. Typing the rows honestly surfaces the gap rather than creating it.

Three of the five `any` annotations in this file **were** replaced with
`ArticleRow` — the two `.filter()` predicates and the `classifyCategoryRelevance`
projection, none of which produce an `Article`.

**Why not fixed now:** the fix is a logic change (null coalescing at the mapping
sites, or widening `Article.link` / `Article.pubDate` to accept null), and the
commit that found it was scoped to type annotations only. `db.ts` has no test
coverage, so the change cannot currently be proven equivalent.

**Pick up in:** Phase 6, when `db.ts` is split. Write a characterization test
over the mapping first, then decide whether a null `link` should become `"#"`
(as `saveArticlesToDB` already does on write) or whether `Article` should admit
null.

---

## BL-002 — `react-hooks/set-state-in-effect` downgraded to a warning

**Found:** Phase 0b (lint baseline)
**Files:** `src/app/saved/page.tsx:24`, `src/components/ArticleCard.tsx:83`
**Status:** Open · rule set to `"warn"` in `eslint.config.mjs`

Both call `setState` synchronously inside an effect body. Satisfying the rule
means converting them to derived state computed during render.

**Why not fixed now:** that conversion changes *when* the state settles relative
to paint. Both files have zero test coverage, so a render-timing change cannot
be verified as equivalent, and the restructure plan forbids behavior changes
outside the phase that owns them.

**Pick up in:** Phase 6. Write a characterization test (initial render output,
then output after the effect flushes) before converting either component. Restore
the rule to `"error"` in the same commit that fixes the last violation.

---

## BL-003 — Jest coverage previously measured 6.8% of the codebase

**Found:** Phase 0 (baseline)
**Files:** `jest.config.ts`
**Status:** Resolved in Phase 0c — `collectCoverageFrom` added

Before Phase 0c, `collectCoverageFrom` was unset, so coverage instrumented only
the five modules the four test suites import. The reported 91.42% described
5 of 73 source files. The number is now measured against the whole `src/` tree
and is correspondingly, accurately, much lower.

Kept here as the reason the coverage number dropped sharply in one commit
without any test being deleted.

Note: coverage then fell again, 4.41% → 3.50%, in `3805007`. That was not a
test regression either: the deleted paraphraser was one of the few well-covered
modules (98.3%), so removing it took covered statements out of the numerator.

It has since crept back up, 3.50% → 3.63%, with **no test added**. Measured per commit (`jest
--coverage`, statements):

| Commit | Change | Coverage | Covered / total |
|---|---|--:|--:|
| `3805007` | paraphraser deleted | 3.50% | 428 / 12,201 |
| `bcd5393` | RSS ingestion deleted | 3.58% | 428 / 11,937 |
| `59b875d` | contact and newsletter forms deleted | 3.63% | 428 / 11,772 |
| `b01d528` | SC-1 split | 3.63% | 428 / 11,760 |
| `d3ba8fa` | footer RSS link deleted | 3.64% | 428 / 11,756 |
| `9f3b76f` | after slices 1–2 (the chat barrel adds 3 uncovered statements) | 3.63% | 428 / 11,759 |
| `73e207f` | after Phase D (the admin and news barrels add 36 more) | 3.62% | 428 / 11,795 |

The covered count is 428 at every step; only the denominator moved. A rising coverage number is
not, by itself, evidence of progress — check the covered count.

---

## BL-004 — Editorial publishing hardcodes `country: ["us"]` and bypasses the filters

**Found:** Phase A review · **Owner decision (Q3):** keep the feature, fix later
**Files:** `src/app/api/admin/publish-article/route.ts`
**Status:** Open · **do not fix during the restructure**

Editorial publishing stays, and moves with the admin feature like any other
file. Two behaviours are logged rather than changed:

- Every published article is stored with `country: ["us"]`, regardless of what
  it is about. An India story published by an editor is therefore tagged
  United States.
- The route upserts straight into `articles`, skipping `saveArticlesToDB` and so
  every filter in the pipeline (paywall, horoscope, wire-spam, script). This is
  deliberate in the code — an editor's insert must not fail silently — but it
  means editorial content is the one path with no filtering at all.

**Pick up in:** after Phase D, as feature work. Needs a product call on whether
the editor chooses the country, and whether editorial content should pass the
script filter.

---

## BL-005 — Real contact and newsletter backends

**Found:** Phase A review · **Owner decision (Q4):** remove both UIs now
**Status:** Future feature work · UIs removed in `59b875d`

The contact form and both newsletter forms (footer strip and article sidebar)
were removed because each reported success while sending nothing — there was no
endpoint behind any of them (DEF-09).

If either returns, it returns with a real backend first: somewhere a message or
address is actually stored or delivered, and a UI that reports failure honestly.
Not before. The `/contact` page remains, listing the email addresses.

---

## BL-006 — Stored rows still carry paraphrased titles

**Found:** `3805007` (paraphraser removal) · **Status:** Open · self-heals

Headlines are now shown as the source published them. Rows written to Supabase
before `3805007` hold paraphrased titles. `upsert` on `article_id` overwrites a
title when the same article is fetched again; a row that is never re-fetched
keeps its paraphrased title until the 7-day purge removes it.

Until then, `dedupeArticlesByTitle` compares titles, so a stored paraphrased
title and its raw upstream twin will not be recognised as the same story — a
possible transient duplicate in the feed.

**Currently moot:** Supabase is unreachable (DEF-01), so no stored rows are read.
**Pick up:** only if duplicates are observed after the connection is restored.
Waiting seven days resolves it with no code change.

---

## BL-007 — The verify gate fails on stale route types after a route moves

**Found:** `bcd5393` (RSS removal) · **Status:** Open · **affects every Phase D
slice that moves or deletes a route file**

`tsconfig.json` includes `.next/types/**/*.ts`, which `next build` generates.
`npm run verify` runs `typecheck` **before** `build`. So after a route file is
moved or deleted, `tsc` reads the previous build's validator, which still
imports the old path, and fails:

```
.next/types/validator.ts(242,39): error TS2307: Cannot find module
'../../src/app/api/cron/refresh-rss/route.js'
```

The source is fine. Clearing `.next/types` and re-running turns the gate green
with no source change. CI is unaffected (a fresh checkout has no `.next/`), but
every local migration slice that touches `src/app/` will hit it — slice 7 (route
groups, currently recommended for deferral) moves every page.

**Workaround until fixed:** `rm -rf .next/types` before `npm run verify` on any
slice that moves or deletes a route file.

**Fix:** Next 16 ships `next typegen`, which "generates TypeScript definitions
for your application's routes without performing a full build" — its own docs
name CI type-checking as the use case
(`node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`).
Changing `typecheck` to `next typegen && tsc --noEmit` regenerates the types
from the current routes before checking them. A one-line config change; not
made here because it was outside the item that found it.

---

## BL-008 — Privacy policy describes data collection that no longer happens

**Found:** `59b875d` (form removal) · **Status:** Open · **needs owner or legal
review — not a code decision**
**Files:** `src/app/privacy/page.tsx`

The policy still says email addresses are collected "when you subscribe to our
newsletter or submit the contact form", that updates are sent "if you've opted
in to our newsletter", and that readers can "unsubscribe from newsletter
emails". None of those forms exist any more.

A privacy policy that describes collection the product does not perform is
inaccurate in a document with legal weight. The correct wording is the owner's
or legal counsel's to choose, so it was deliberately not edited alongside the
UI removal.

---

## BL-009 — Residual references to removed features

**Found:** `bcd5393`, `59b875d` · **Status:** Open · cosmetic, low risk

Each was left alone because it was not required by the item that removed the
feature:

- ~~**Footer "RSS Feeds" link**~~ — **resolved**: the link and its separator were
  removed from `src/components/Footer.tsx` at the owner's direction (Phase C
  review). It had pointed at `href="#"` and advertised a deleted feature.
- ~~**Dead translation keys**~~ — **resolved** in `a81d3c4` (restructure 2, S1, owner item
  B8): the six listed here (`rssFeeds`, `newsletterTitle`, `newsletterDesc`,
  `newsletterStripTagline`, `subscribedSuccess`, `newsletterEmailPlaceholder`)
  plus `subscribe`, which this list missed, removed from the interface and both
  languages. Sixteen more unread keys are BL-017.
- **`"use client"` on `src/app/contact/page.tsx`** — no longer needed now the
  form's state is gone. Removing it changes the page's rendering mode, which is
  a behaviour change, not a cleanup.

**Pick up:** any time, as one small commit. Nothing left in this entry is
visible to a user. `rssFeeds` is now dead too — the link was its only reader.

---

## BL-010 — ESLint lints the generated `coverage/` directory

**Found:** Phase A review, reading the unabridged `npm run verify` log ·
**Status:** **Resolved** (Phase C review) — `"coverage/**"` added to `globalIgnores`.
With `coverage/` present on disk, lint now reports 14 warnings, all in source.

`eslint.config.mjs` ignores `.next/`, `out/`, `build/` and `next-env.d.ts`, but
not `coverage/`. After `npm run test:ci`, ESLint lints Istanbul's generated
report and emits:

```
C:\Users\DELL\TimesPrime\coverage\lcov-report\block-navigation.js
  1:1  warning  Unused eslint-disable directive (no problems were reported)
```

So the "15 warnings" reported throughout the restructure are **14 in source
plus 1 in a generated file**, and the total depends on whether `coverage/`
exists. CI runs Lint before Test, so CI sees 14 while a local run after
`test:ci` sees 15. Every filtered view of the lint output hid this; only the
full log shows the path.

**Fix:** add `"coverage/**"` to `globalIgnores` in `eslint.config.mjs`. One
line; not made here because it was outside the item that found it.

## BL-011 — `withSentryConfig` is imported from a deprecated path

**Found:** audit fix F-007, bumping @sentry/nextjs to 10.78.0 (`31f4a54`) · **Status:** **Resolved**
in `7e578e0` — imported from `@sentry/nextjs/config`; the warning no longer appears

Every build and test run now prints: *"Importing `withSentryConfig` from `@sentry/nextjs` is
deprecated and will stop working in v11. Import it from `@sentry/nextjs/config` instead."* The fix
is one line in `next.config.ts`. Not made in `31f4a54` because it was outside that finding; it
becomes mandatory only at v11, which is a major bump and needs owner approval anyway.

## BL-012 — `@types/node` is `^20` while the runtime is Node 24

**Found:** audit fix F-026 (`974b255`) · **Status:** **Resolved** in `0066f27` (owner approved) —
`@types/node` `^24`, resolving 24.19.2; typecheck clean with no source change

`.node-version`, `engines` and CI are on Node 24, but the type definitions still describe Node 20:
APIs added since 20 are untyped, and the compiler will not flag anything removed. Nothing fails
today. Moving to `@types/node@^24` is a major bump of the types package, which the audit-fix rules
reserve for the owner.

## BL-013 — The in-memory cache never evicts keys that are not read again

**Found:** Phase 1 of the audit fixes, checking how `cache.ts` behaves without Upstash (D1) ·
**Status:** Open (audit-ledger observation N-03) — **deferred into audit Phase 2 with F-020** by the
owner

When Upstash is not configured — as on this machine — `cache.ts` falls back to a `Map` and deletes
an expired entry only when `get()` reads it again. Keys that are never re-read stay forever: every
distinct scraped URL, every search query. Memory grows with traffic, the same class of bug as
F-020 (the rate limiter). **Pick up in:** Phase 2, alongside F-020 (owner decision);
with Upstash configured in production the in-memory path is only a fallback.

## BL-014 — `db.ts` reports every failed Supabase operation to Sentry, unthrottled

**Found:** Phase 1, the D5 outage simulation (`679c72e`) · **Status:** **Resolved** in `cc1d479` —
throttled through the D5 limiter, one key per operation, not demoted to breadcrumbs (owner ruling);
a failing-DB test went from 15 events for three requests to one per operation per window

Each feed request during an outage produced five Sentry events from `db.ts` — freshness check,
purge, upsert, purge, select — on top of D5's single rate-limited fallback report. At real traffic
that is thousands of events an hour and a Sentry quota problem. Options: route them through the
same rate limiting as `reportFallback`, or demote them to breadcrumbs and let D5's report be the
event. Owner decision; it changes how errors are reported, not behaviour. The double purge in the
same trace is F-015, Phase 3.

## BL-015 — `urlValidation` goes to `backend/lib/` now, to `shared/validation/` with F-005

**Found:** restructure 2, S0 judgement call 3 (owner, at the S0 approval) · **Status:** Open —
**pick up with F-005** (audit Phase 2)

Move map v2 puts `src/lib/urlValidation.ts` in `backend/lib/` because its only importer today is
the scraper route, `src/app/api/news/scrape-article/route.ts`. The F-005 fix needs URL validation
on the frontend link sinks (`ArticleDetailView.tsx`'s `href={targetUrl}`); the module moves to
`shared/validation/` then (owner decision).

One constraint for that move: `validateExternalUrl()` imports Node's `dns/promises` and `net` — it
resolves the hostname so it can reject private addresses (the SSRF guard) — and neither runs in the
browser. The checks that need no DNS (URL parsing, the http(s) allowlist, `localhost`) can move to
`shared/`; the resolution step stays server-side. So F-005 splits the module rather than moving it
whole.

## BL-016 — The article page fetches its own API over HTTP

**Found:** restructure 2, S0 (the F1 list) · **Status:** Open — possible improvement; **not changed
in restructure 2** (owner)

`src/app/article/[slug]/page.tsx` is a server component, yet it reaches the scraper and the feed
over HTTP to its own deployment: `getArticleContent()` fetches `/api/news/scrape-article`
(`:37–41`, `revalidate: 3600`) and `getSuggestedArticles()` fetches `/api/news/top-headlines`
(`:57–61`, `revalidate: 900`), both at `NEXT_PUBLIC_BASE_URL`, falling back to
`http://localhost:3000`. Every uncached render costs two extra round trips. If the variable is
wrong or unset in an environment, both fetches fail and the page silently shows its placeholder
text and no suggestions.

Calling the backend code directly would remove the hop, but it also changes which caching and error
handling apply — and, once F-011 gives the scraper a limiter, which rate limit applies. That makes
it a behaviour change, not a move, so restructure 2 keeps the page as composition in `app/` and
leaves both fetches alone.

## BL-017 — Data nothing reads, left after the S1 cleanup

**Found:** restructure 2, S1 (`dc07a40`, `a81d3c4`) · **Status:** **Resolved** in `dbc4821` (the 16
keys) and `6327110` (the two fields), owner-approved after a dynamic-access check; one key is still
open, below

- **Sixteen translation keys** in `src/config/translations.ts` have no reader, in the interface
  and in both languages: `liveFeed`, `edition`, `globalNewsHub`, `aiAssistant`,
  `storiesAvailable`, `trendingHighlights`; `footer.verifiedSources`, `footer.realtimeCaching`,
  `footer.newsCategories`, `footer.emailPlaceholder`; `articleView.backToHeadlines`,
  `originalSource`, `specialReport`, `verifiedDigest`, `visitPublisher`, `suggestedNews`. Same
  test as `a81d3c4`: no `.key` or `["key"]` access anywhere in `src/`, and the only dynamic
  indexing is `t.categories[...]`. Removing them shrinks the client JS of every page that loads
  the dictionary, as `a81d3c4` did (−962 bytes for seven keys).
- **The `bg` and `text` fields of `CATEGORY_COLORS`** (`src/config/categoryColors.ts`): unread
  since `dc07a40` deleted their two getters. 18 of their 22 class strings (`bg-orange-600`,
  `text-cyan-600`, …) appear in no other file, so Tailwind still emits CSS for classes no element
  carries. Removing the fields drops those rules; measure the CSS before and after.

The check that cleared them works by type, not text: it follows every value typed as the
dictionary, a section, `TRANSLATIONS`, `CategoryColorDef` or `CATEGORY_COLORS` through computed
lookups, destructuring, spreads, casts and calls. The only dynamic lookups are by language
(`TRANSLATIONS[language]`), by category id (`t.categories[...]`, whose keys all stay) and by
category name (`CATEGORY_COLORS[...]`, read only as `.hex` and `.badgeBg`). `6327110` removed 16
CSS rules; the other two of the 18 lived on in this entry's own text until `6a1382d` (BL-018).

**Still open: `refresh`.** The same check proves the top-level `refresh` key unreachable too; the
text scan had counted `router.refresh()` as a reader. It was not on the approved list, so it stays
until the owner decides.

## BL-018 — Tailwind scans `docs/` and `scripts/`, so editing a document can change the CSS

**Found:** restructure 2, S1 (`26adbbd`) · **Status:** **Resolved** in `6a1382d` (owner-approved,
S2): `@source not` for `docs/`, `scripts/`, `database/`, `db/` and the four root `.md` files, each
proved by a probe build. The paths resolve from the stylesheet, so slices 1 and 10 rewrite them
when it moves (`SLICE_CHECKLIST` in `scripts/move-map.mjs`)

Tailwind v4 detects class names automatically in every file that is not git-ignored, Markdown
included. Deleting `docs/MOVE-MAP.md` removed one utility rule from the production CSS (−219
bytes): an ordinary English word in one of its sentences was the only place that utility's name
appeared. `26adbbd`'s message names it; this entry does not, because writing the word here
would put the rule back. Any documentation edit can add or drop a utility the same way, so a
docs-only commit can move the CSS, and a per-commit CSS comparison has to tell that apart from a
code change.

Fix: exclude the non-code folders in `globals.css` with `@source not "<path>"` (supported by the
installed Tailwind 4.3.3; the path resolves from the stylesheet), or use `source(none)` and list
the code folders. Either is a CSS configuration change, so it waits for the owner.

**Outside the approved list, so still scanned:** code under `src/`, comments and tests included,
and root tooling. Two cases so far: while `4ff0167` was being written, a test comment saying a
scan could not "shrink" emitted `.shrink` until it was reworded; and `.transform` is in the CSS
only because three `jest.config.ts` comments say "transform". Excluding test files or root
configs would be a further owner decision.

## BL-019 — An article-page trending image timed out at the image optimizer

**Found:** restructure 2, S3 (the smoke test after slice 11) · **Status:** Open — **no config
change** (owner, S4); act only if it recurs

In the slice-11 smoke test's screenshot of `/article/[slug]`, one thumbnail in the lists the page
builds from `/api/news/top-headlines` was empty. The `next start` log of that run has exactly one
image error:

    ⨯ upstream image response timed out for https://kubrick.htvapps.com/htv-prod/images/53baa842-b42a-46f7-96af-373e09efe30a.jpg

- **Host:** `kubrick.htvapps.com`. **It is in `imageDomains`**: `ALLOWED_IMAGE_HOSTNAMES` in
  `shared/config/imageDomains.ts:34`. So `isAllowedImageUrl` handed the URL to `<Image>`, and
  `remotePatterns` (`{,*.}kubrick.htvapps.com`) let `/_next/image` fetch it. The allowlist is not
  the cause, and no slot is needed: `remotePatterns` holds 49 entries against the cap of 50.
- **What failed:** the optimizer's fetch from the publisher. `next/dist/server/image-optimizer.js:474`
  logs that line and answers 504 when the upstream does not respond within
  `images.imgOptTimeoutInSeconds`, default 7 (`next/dist/server/config-shared.js:229`). Fetched
  directly in S4, the same URL returned 200 in 0.31 s (35,448 bytes). The CDN was slow once; the
  image is not broken.
- **Not caused by the restructure:** `remotePatterns` is unchanged.

Nothing to fix for a one-off. If it recurs, the options are an `onError` fallback to the topic
image, which covers any publisher outage, or a longer `imgOptTimeoutInSeconds`, which only makes
readers wait longer. Either is a change for the owner to decide.

## BL-020 — A curated Sports topic image is gone from Unsplash (404)

**Found:** restructure 2, S3 (the smoke test after slice 1) · **Status:** Open — a one-line data
fix in `shared/config/topicImages.ts`, for the owner

The slice-1 smoke test's `next start` log:

    ⨯ upstream image response failed for https://images.unsplash.com/photo-1540747913346-19212a729b62?w=1200&auto=format&fit=crop&q=80 404

That URL is the "Cricket" image, second of the four in the Sports bucket of `TOPIC_IMAGE_MAP`
(`shared/config/topicImages.ts:75`). It still returned 404 when re-checked in S4. The other 44 of
the file's 45 Unsplash URLs (43 distinct, `GENERIC_NEWS_FALLBACK` included) returned 200.

Unlike BL-019, this one fails every time. Take an article whose own image is missing or not
allowlisted, whose headline matches the Sports keywords, and which `assignDedupedTopicImages`
gives that slot: its thumbnail renders empty.

Fix: replace the URL with a working photo, or drop it from the bucket. Not done in S4, which
changes no data.
