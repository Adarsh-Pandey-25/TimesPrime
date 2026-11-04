# Backlog

Debt deliberately deferred rather than fixed in place, with the reason it was
deferred and the phase that should pick it up. Added to when a rule in the
restructure plan ("no while-I-am-here fixes") stops a fix from happening in the
commit that found it.

---

## BL-001 — `db.ts` row mapping relies on `any` to hide unhandled nulls

**Found:** Phase 0b (lint baseline)
**Files:** `packages/server/src/repositories/db.ts` — the two `.map()` calls in `saveArticlesToDB` and `getDBArticles`
**Status:** Open · two `eslint-disable-next-line @typescript-eslint/no-explicit-any` in place

`database/schema.sql` declares `link`, `pub_date`, `description`, `content`,
`image_url`, `source_id`, `source_name`, `category`, `country` and `language` as
nullable. `Article` (in `packages/shared/src/types/index.ts`) declares `link: string` and
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
**Files:** `apps/web/src/app/saved/page.tsx:21`, `apps/web/src/components/news/ArticleCard.tsx:83` (the two warnings `npm run lint` reports)
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
5 of 73 source files. The number is now measured against the whole source tree (since restructure 2,
less the one-line `src/app/` shims) and is correspondingly, accurately, much lower.

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
**Files:** `apps/admin/src/app/api/admin/publish-article/route.ts`
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

**Found:** `bcd5393` (RSS removal) · **Status:** Open · **affects any change that
moves or deletes a route file**

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
every local change that moves or deletes a route under `src/app/` will hit it. Every restructure-2 slice
that touched `src/app/` did, and cleared `.next/types` first.

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
**Files:** `apps/web/src/app/privacy/page.tsx`

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
  removed from `apps/web/src/components/Footer.tsx` at the owner's direction (Phase C
  review). It had pointed at `href="#"` and advertised a deleted feature.
- ~~**Dead translation keys**~~ — **resolved** in `a81d3c4` (restructure 2, S1, owner item
  B8): the six listed here (`rssFeeds`, `newsletterTitle`, `newsletterDesc`,
  `newsletterStripTagline`, `subscribedSuccess`, `newsletterEmailPlaceholder`)
  plus `subscribe`, which this list missed, removed from the interface and both
  languages. Sixteen more unread keys are BL-017.
- **`"use client"` on the contact page (`apps/web/src/app/contact/page.tsx`)** — no longer needed now the
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
**Status:** **Resolved** in `e5754b5` (audit Phase 2, with F-020: a sweep every minute and at most
1,000 entries). Was: Open (audit-ledger observation N-03) — **deferred into audit Phase 2 with F-020** by the
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

## BL-015 — `urlValidation` goes to `packages/server/src/lib/` now, to `packages/shared/src/lib/` with F-005

**Found:** restructure 2, S0 judgement call 3 (owner, at the S0 approval) · **Status:** **Resolved** in
`2cd04c9` (moved to `packages/shared/src/lib/`, browser-safe; its DNS step is injected by
`packages/server/src/services/scrape/fetchPage.ts`), with F-005 as planned

Move map v2 put `urlValidation.ts` in `packages/server/src/lib/` because its only importer is the scraper,
`apps/web/src/app/api/news/scrape-article/route.ts`. The F-005 fix needs URL validation
on the frontend link sinks (`ArticleDetailView.tsx`'s `href={targetUrl}`); the module moves to
`packages/shared/src/lib/` then (owner decision).

One constraint for that move: `validateExternalUrl()` imports Node's `dns/promises` and `net` — it
resolves the hostname so it can reject private addresses (the SSRF guard) — and neither runs in the
browser. The checks that need no DNS (URL parsing, the http(s) allowlist, `localhost`) can move to
`shared/`; the resolution step stays server-side. So F-005 splits the module rather than moving it
whole.

## BL-016 — The article page fetches its own API over HTTP

**Found:** restructure 2, S0 (the F1 list) · **Status:** **Resolved** (the cleanup on
`chore/restructure`, 2026-11-02): the suggestions now call `getTopHeadlines`
(`packages/server/src/services/news/topHeadlines.ts`, the read path moved out of the route unchanged), so the
page makes no HTTP request to itself and `NEXT_PUBLIC_BASE_URL` is gone. The suggestions' cache is
now the feed's own 15-minute cache, not a 15-minute fetch cache over HTTP. Earlier: **resolved for
the scrape** in `65d3337` (owner, Phase 2 follow-up, to fix BL-021): the page calls `scrapeArticle`
(`packages/server/src/services/scrape/scrapeArticle.ts`) directly. **Still over HTTP:** the suggestions fetch
of `/api/news/top-headlines`, which has no per-IP limit and was not part of the fix. Re-checked
after Phase 3 (owner): neither the handler nor `apps/admin/src/proxy.ts` (matcher: admin paths only) limits that
route, so it has no shared bucket like BL-021's. **If a per-IP limit is ever added to
`top-headlines`, move this fetch to a direct call first**, or every reader shares the server's
bucket. The fetch also reads `NEXT_PUBLIC_BASE_URL`, not the `NEXT_PUBLIC_APP_URL` the rest of the
page uses

`apps/web/src/app/article/[slug]/page.tsx` is a server component, yet it reaches the scraper and the feed
over HTTP to its own deployment: `getArticleContent()` fetches `/api/news/scrape-article`
(`:38–42`, `revalidate: 3600`) and `getSuggestedArticles()` fetches `/api/news/top-headlines`
(`:58–62`, `revalidate: 900`), both at `NEXT_PUBLIC_BASE_URL`, falling back to
`http://localhost:3000`. Every uncached render costs two extra round trips. If the variable is
wrong or unset in an environment, both fetches fail and the page silently shows its placeholder
text and no suggestions.

Calling the backend code directly would remove the hop, but it also changes which caching and error
handling apply — and, once F-011 gives the scraper a limiter, which rate limit applies. That makes
it a behaviour change, not a move, so restructure 2 keeps the page as composition in `src/app/` and
leaves both fetches alone.

## BL-017 — Data nothing reads, left after the S1 cleanup

**Found:** restructure 2, S1 (`dc07a40`, `a81d3c4`) · **Status:** **Resolved** in `dbc4821` (the 16
keys), `6327110` (the two fields) and `c2ab97a` (the last key, `refresh`), owner-approved after a
dynamic-access check

- **Sixteen translation keys** in `packages/shared/src/config/translations.ts` have no reader, in the interface
  and in both languages: `liveFeed`, `edition`, `globalNewsHub`, `aiAssistant`,
  `storiesAvailable`, `trendingHighlights`; `footer.verifiedSources`, `footer.realtimeCaching`,
  `footer.newsCategories`, `footer.emailPlaceholder`; `articleView.backToHeadlines`,
  `originalSource`, `specialReport`, `verifiedDigest`, `visitPublisher`, `suggestedNews`. Same
  test as `a81d3c4`: no `.key` or `["key"]` access anywhere in `src/`, and the only dynamic
  indexing is `t.categories[...]`. Removing them shrinks the client JS of every page that loads
  the dictionary, as `a81d3c4` did (−962 bytes for seven keys).
- **The `bg` and `text` fields of `CATEGORY_COLORS`** (`packages/shared/src/config/categoryColors.ts`): unread
  since `dc07a40` deleted their two getters. 18 of their 22 class strings (`bg-orange-600`,
  `text-cyan-600`, …) appear in no other file, so Tailwind still emits CSS for classes no element
  carries. Removing the fields drops those rules; measure the CSS before and after.

The check that cleared them works by type, not text: it follows every value typed as the
dictionary, a section, `TRANSLATIONS`, `CategoryColorDef` or `CATEGORY_COLORS` through computed
lookups, destructuring, spreads, casts and calls. The only dynamic lookups are by language
(`TRANSLATIONS[language]`), by category id (`t.categories[...]`, whose keys all stay) and by
category name (`CATEGORY_COLORS[...]`, read only as `.hex` and `.badgeBg`). `6327110` removed 16
CSS rules; the other two of the 18 lived on in this entry's own text until `6a1382d` (BL-018).

**`refresh`, resolved in `c2ab97a`.** The same check proved the top-level `refresh` key
unreachable too; the text scan had counted `router.refresh()` as a reader. It was not on the first
approved list, so it waited for the owner, who approved its removal at the S2 review.

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

**Outside the approved list, so still scanned:** the code (`src/app/`, `frontend/`, `backend/`, `shared/`), comments and tests included,
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
  `packages/shared/src/config/imageDomains.ts:34`. So `isAllowedImageUrl` handed the URL to `<Image>`, and
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

**Found:** restructure 2, S3 (the smoke test after slice 1) · **Status:** **Resolved** in
`c3c4387` (owner-approved, S5): the slot now holds `photo-1593341646782-e0b495cff86d`, a batsman
hitting the ball, on the same host. It returned 200 before the commit

The slice-1 smoke test's `next start` log:

    ⨯ upstream image response failed for https://images.unsplash.com/photo-1540747913346-19212a729b62?w=1200&auto=format&fit=crop&q=80 404

That URL is the "Cricket" image, second of the four in the Sports bucket of `TOPIC_IMAGE_MAP`
(`packages/shared/src/config/topicImages.ts:75`). It still returned 404 when re-checked in S4. The other 44 of
the file's 45 Unsplash URLs (43 distinct, `GENERIC_NEWS_FALLBACK` included) returned 200.

Unlike BL-019, this one fails every time. Take an article whose own image is missing or not
allowlisted, whose headline matches the Sports keywords, and which `assignDedupedTopicImages`
gives that slot: its thumbnail renders empty.

Fixed by replacing the URL with a working photo that shows cricket being played. It is on the
same host, so `imageDomains` and `remotePatterns` are unchanged.

## BL-021 — The scraper's rate limit puts every reader in one bucket

**Found:** audit Phase 2, F-011 (`3b63a37`) · **Status:** **Resolved** in `65d3337` (BL-016,
owner-chosen): the article page no longer comes through the public route, so the route's per-IP
limit now sees only external callers

F-011 limits `/api/news/scrape-article` to 30 uncached scrapes a minute per client IP (owner
decision D1). The route's only caller today is the article page's server-side fetch of it
(`apps/web/src/app/article/[slug]/page.tsx:38–42`, BL-016). That request carries no reader IP, so every
reader's uncached article counts against one key: the server's own address in production, or
`unknown` locally. Next's data cache (`revalidate: 3600` per URL) and the 1-hour scrape cache keep
that traffic low, but a burst of distinct new articles could pass 30 a minute, and the page would
then show its placeholder text.

Options:
- **Call the backend directly from the page** (BL-016). The self-fetch goes away, and the public
  HTTP route keeps the limit for outside callers only. Recommended; it changes which caching applies,
  so it is a behaviour change to test first.
- Raise the limit, which weakens F-011 for direct callers.
- Have the page forward the reader's IP in a header the route trusts only alongside a server-side
  secret. More moving parts than the first option.

## BL-022 — A public scrape writes to the database

**Found:** audit Phase 2, F-003 tests · **Status:** **Kept** (owner, Phase 2 follow-up): it caches
scraped content to the stored article, and since `988c7fa` the public route scrapes only stored
articles, so it writes only to our own rows

Every uncached scrape that extracts an article also runs
`supabase.from("articles").update({ content }).eq("link", targetUrl)` in the background
(`apps/web/src/app/api/news/scrape-article/route.ts:537`). So a public GET writes to the database, and the row it
updates is chosen by the caller's `url` parameter. The value written is what the server scraped
from that very URL, so a caller can only make a stored article's content match its own link. Still
worth deciding: a local run writes to whatever project `.env.local` names, which may be production
(HANDOFF §3.18), and a public endpoint that writes is one more thing to rate-limit and audit. The
feed does return `content` with each row (`packages/server/src/repositories/db.ts:429`), so check its readers
before dropping the write.

Options: keep it, drop it, or move it behind the cron. Not changed in Phase 2: it is not part of any
audit finding.

## BL-023 — Signed article links, if the article page must survive a Supabase outage

**Found:** audit Phase 2, F-005 (`8d0b775`) · **Status:** Open — upgrade path, only if needed (owner)

F-005 trusts the article page's `?url=` only when it names a stored article (or a built-in mock
one). That is a database read per article page, so while Supabase is down, and for articles past
the 7-day purge, the page shows no publisher link and no scraped text: safe, but degraded.

If outage resilience is ever needed: the server attaches an HMAC of each article link to the feed
data it already sends (a new secret, for example `ARTICLE_LINK_SECRET`). Every place that builds an
`/article/...?url=` link adds `&sig=`, and the page verifies the signature instead of querying the
database. Costs: a new environment variable; an additive change to the feed responses; edits to
the six link builders (`ArticleCard` ×2, `CategoryMegaMenu`, `MarqueeTicker`, and the
related/trending lists in `ArticleDetailView`); and links shared before the change lose their
publisher link. The stored-article lookup was chosen instead (owner, Phase 2).

## BL-024 — Nullable columns the code treats as non-null (`breaking_news`, `admin_logs`)

**Found:** audit Phase 3, F-008 (`db28a46`) · **Status:** Open — deployment phase (owner)

`database/schema.sql` carries the DDL that lived in code comments unchanged, and it leaves these
columns nullable while the TypeScript types say they are always set:

- `breaking_news.is_active` and `breaking_news.created_at`
- `admin_logs.details`, `admin_logs.metadata` and `admin_logs.created_at`

The inserts always set them (or their defaults do), so the gap is about rows written some other
way. A `NOT NULL` migration must first check the live data for nulls
(`SELECT count(*) … WHERE <column> IS NULL` for each), which is deployment-phase work.

`admin_logs.action` is free text, while the code uses the `AdminAction` union. **Recommendation: keep
it free text.** A CHECK constraint would need a migration for every new action, and the column is
written only by `logAdminAction`, whose parameter type already restricts it.

## BL-025 — Without the service-role key, the app runs on the anon key and writes fail

**Found:** audit Phase 3, owner check of RLS against the live app · **Status:** Open

`packages/server/src/lib/supabase.ts` uses `SUPABASE_SERVICE_ROLE_KEY` when set and falls back to
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `isSupabaseConfigured()` is true with the anon key alone. With
RLS on, the anon key can only read `articles` and `breaking_news`. The cron's ingest and purge,
every admin write and the audit log all fail. Where anon still holds Supabase's default table
grants, some of these fail silently (0 rows, no error) instead of as `permission denied`.
The table of every access is in `docs/runbooks/apply-database.md`.

No policy change fixes this, because the anon key is public by design. Options: fail loudly (a
startup or health warning when only the anon key is set, or report the writes as unavailable), or
keep it and rely on the runbook's pre-check that the key is set. Not changed: no audit finding
covers it.

## BL-026 — Headline translation

**Found:** audit F-024 · **Status:** Open — feature, not a defect (owner decision D3)

`translateHeadline(text, lang)` in `packages/shared/src/config/translations.ts` returned `text` unchanged. It
ran on every card title and description (`ArticleCard`) and on the mega-menu titles
(`CategoryMegaMenu`), so it looked like translation without doing any. F-024 removed it. Cards
and the mega menu show each article in the language its publisher wrote it in; the Hindi feed is
already chosen by script (`matchesLanguageScript` in `packages/server/src/repositories/db.ts`).

The only real translation is on the article page: `ArticleDetailView` translates the article's
title, description and paragraphs through `/api/translate` when the UI is in Hindi, cached per
title. Translating headlines in the feed would need the same: a batched `/api/translate` call per
feed load (the route allows 50 texts and 10,000 characters per request, F-010) and a cache, or
translated titles stored at ingest. Either costs translate-API quota on every new story.

## BL-027 — The first search result is never shown

**Found:** audit Phase 4, writing the F-021 characterization (`675ce1d`) · **Status:** **Resolved** in `96f192d`
(owner: fix now; while searching the grids start at index 0)

In `apps/web/src/components/home/HomeClient.tsx` the featured slot shows `articles[0]` only when no search is
active (`featuredArticle && !searchQuery`, `:424`), while Top Stories and Latest start at
`articles.slice(1, …)` (`:319`). So during a search the best match is filtered in and then never
rendered. `HomeClient.test.tsx` pins the current behaviour ("Budget passes" is dropped). Fix: start
the grids at index 0 while searching, and update that test.

## BL-028 — Theme ternaries still switch after hydration

**Found:** audit Phase 4, F-028 (`5ad891a`) · **Status:** Open

F-028's pre-paint script sets the `dark` class on `<html>`, so everything styled with `dark:`
variants is right from the first paint. Components that choose classes in JavaScript instead
(`isDark ? "…" : "…"` from `useTheme()`: 75 ternaries in 16 files under `frontend/`) still render
light until ThemeContext's effect runs after hydration. They cannot read the theme during render
without their server and client HTML differing. Fix: convert those ternaries to `dark:` variants,
file by file. Check the CSS budget, since most of the colours are already in the stylesheet.

## BL-029 — The seed route falls back to a public-prefixed NewsData key

**Found:** audit F-009 (ledger note) · **Status:** **Resolved** in `45223f0` (owner: remove; the Sentry
scrub list keeps the name, for an environment that still sets it)

`apps/admin/src/app/api/admin/seed-supabase/route.ts:15` reads `NEWSDATA_API_KEY || NEXT_PUBLIC_NEWSDATA_API_KEY`.
It runs on the server, so nothing leaks today. But the fallback invites putting a secret under a
`NEXT_PUBLIC_` name, and Next inlines such a name into any client bundle that reads it. F-009 lists
it in `.env.local.example` as "do not set it". Removing the fallback is a one-line change; it breaks
the seed route only for an environment that sets the public name alone.

## BL-030 — The chatbot ships on every route

**Found:** audit Phase 4, F-027 (`7ead49b`) · **Status:** Open — proposal, not started (owner)

`apps/web/src/app/layout.tsx` renders `FloatingAiAssistant` (`apps/web/src/components/chat`), which imports
`Chatbot` statically. So the chatbot's code is in a chunk every route loads, even though it is closed
until the reader clicks its button: `/admin/login` and `/_not-found` too. F-027 showed it. 418 bytes
of dark-mode class strings grew all 10 page bundles by the same amount: +1.40% on `/_not-found` and
+1.25% on `/admin/login`.

Proposal: keep the floating button in the layout, and load `Chatbot` only on the first open, with
`next/dynamic` (`ssr: false`) or a `React.lazy` import inside `FloatingAiAssistant`. The closed
state renders `null` already (`if (!isOpen) return null`), so nothing visible changes. The cost is a
short fetch on the first click, and the bundle check should show the chunk leaving every route. Check
the Next 16 `lazy-loading` guide in `node_modules/next/dist/docs/` first. Leaving `/admin` out of the
button (its own decision) is not part of this.

## BL-031 — New moderate advisories in dev and build tooling (`glob`, `minimatch`)

**Found:** audit Phase 5, final `npm audit` (2026-11-02) · **Status:** Open — owner decision

`npm audit` went from 5 low to 37: 0 critical, 0 high, 34 moderate, 3 low. The moderates come from two
advisories published after Phase 1:
- `glob` 9.0.0–14.0.1 ([GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)),
  through `@sentry/nextjs`'s build-time bundler plugin.
- `minimatch` <11.0.1 ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)),
  through `eslint` and `eslint-config-next`'s plugins.

Neither ships in the app. npm's only fixes are major-version changes (`eslint` 4.0.0, `@sentry/nextjs`
10.76.1), which the rules forbid without the owner. `npm audit fix --dry-run` without `--force` would
change 14 dev packages and leave the count at 37, so it was not run. Options: accept, as for the jest
lows; or wait for `@sentry/nextjs` and `eslint-config-next` releases that move to fixed versions, and
recheck then. CI does not run `npm audit`, so it is unaffected either way.

## BL-032 — A2 for new pages

**Found:** audit master prompt, Phase 5 · **Status:** **Moot** — restructure 3 (ADR 0004,
`chore/restructure`) removed the shims, A2, `SHIMS` and `check:boundaries`: every page holds its own
code, as the framework intends. The text below is kept as it was written.

A2 (`eslint.boundaries.mjs`, `boundaries/shim-only`) holds two kinds of file to re-exports and
literal segment config: every `src/app/**/route.ts`, and the pages whose bodies moved to
`src/app/` in restructure 2. Those pages are `SHIMS` in `scripts/move-map.mjs`, derived from
the move map. A `page.tsx` added later is in no move map, so A2 never sees it. Its logic can then grow
in `src/app/`, which is the routing shell. Proposal: apply A2 to every `src/app/**/page.tsx`, with the two
composition pages allowlisted by name (`apps/web/src/app/page.tsx` and `apps/web/src/app/article/[slug]/page.tsx`, which
combine backend data with a view, ADR 0002). `check:boundaries` and the jest coverage exclusion read
the same list, so change all three together, and prove the rule with a probe page.

## BL-033 — The 7-day purge deletes what Rule 19 says to keep for 60 days

**Found:** panel work, Step 1 report (2026-11-02), point 7 · **Status:** Open — decided in Panel 4/7

The reader feed keeps a 7-day rolling window. `purgeOldArticles` (`packages/server/src/repositories/db.ts`)
deletes every article whose `created_at` is older than 7 days, once per cron run
(`packages/server/src/services/news/refreshNews.ts`) and when the admin presses purge (`apps/admin/src/app/api/admin/db-stats/route.ts`).
`docs/PERMISSIONS.md` (from the retired PANEL_PLAN.md) reads IT Rules Rule 19 as requiring content records for at least 60 days, and asks
for a 60-day purge floor. Today nothing of a purged article survives, so the two conflict.

Proposed direction (owner, 2026-11-02): the feed keeps its 7-day window. A separate `content_records`
table keeps a light record of every published item (title, link, source, published and unpublished
times, actor) for at least 60 days, and the purge floor applies to the records, not to the feed.
Not built now: the table, its writer and the floor belong to Panel 4 (Ingestion) or Panel 7
(Compliance), whichever comes first.

## BL-034 — Export the audit chain's head hash outside the database

**Found:** owner, Panel 0 design approval (2026-11-02) · **Status:** Open — after Panel 0

`audit_log` chains each row to the one before it (`prev_hash`, `row_hash`; design
[`panel-0-access-foundation.md`](design/panel-0-access-foundation.md) §1), and
`audit_verify_chain()` finds an edited or deleted row. It cannot find a **full rewrite**: someone
with owner access to the database could recompute every hash from the first row on, and the chain
would verify. The defence is a copy of the head that lives somewhere else. On a schedule (for
example daily, from the cron), record the latest `seq` and `row_hash` outside the database: a
log line to an external sink, a Sentry event, or a file in separate storage. A rewrite then shows as
a head that no longer matches the exported one. Needs a choice of destination that a database owner
cannot also edit.

## BL-035 — The root README's setup note about the schema is stale

**Found:** the Vercel-to-AWS docs pass (2026-11-02) · **Status:** Open — a docs fix

`README.md`'s "Setup" section says `database/schema.sql` "currently defines the `articles` table only",
and that `breaking_news` and `admin_logs` exist only as SQL in comments in two route files. That
stopped being true at F-008 (`db28a46`), which put both tables in `schema.sql`. The section also
predates the indexes migration and Panel 0's access migrations, and does not point at the runbooks.
It should list the files in their order and link `docs/runbooks/apply-database.md` and
`docs/runbooks/staff-access.md` instead. Left alone in that pass, which was limited to the Vercel
wording.

## BL-036 — The login limit trusts the first `X-Forwarded-For` address

**Found:** Panel 0's browser tests (2026-11-02) · **Status:** Open — before the AWS deployment

`getClientIp` (`packages/server/src/lib/rateLimit.ts`) takes the first address in `X-Forwarded-For`, then
`X-Real-IP`. The sign-in limit (10 per 15 minutes) is counted per that address. On Vercel the
platform sets the header, so the first address is the client's. Behind an AWS load balancer the
balancer **appends** the client's address, and the first one is whatever the client sent: a
guesser can send a new address with each attempt and never reach the limit. The per-user MFA limit
(five codes per 15 minutes) is not affected. At the AWS move, read the address the balancer adds
(the last entry, or a header it sets that clients cannot), and test it with a forged header.

## BL-037 — Contrast in the public site's chrome

**Found:** Panel 0's accessibility tests (2026-11-02) · **Status:** Open — public site

axe (WCAG 2.1 AA) reports `color-contrast` (serious) on parts every page renders, outside Panel 0:
- `apps/web/src/components/news/BreakingNewsBanner.tsx`: the "🔴 BREAKING" label is white on red with
  `animate-pulse`, which lowers its opacity, so it falls below 4.5:1 for part of every cycle.
- `apps/web/src/components/news/Header.tsx`: the 10px red "EN"/"HI" language marker, and the 11px
  "Follow Us:" label in `text-slate-400` (dark theme).
- `apps/web/src/components/news/Footer.tsx`: the column headings and labels in `text-slate-400` at 10–11px.

`e2e/accessibility.spec.ts` excluded exactly these three from its check of the sign-in page, which
is Panel 0's; since the split (ADR 0005) the sign-in page is in `apps/admin`, which does not render
them, so the check excludes nothing. The defects remain on every reader page. The fix is darker text (slate-500 and up on white) and no opacity pulse on text, or a
pulse only under `prefers-reduced-motion: no-preference`.
