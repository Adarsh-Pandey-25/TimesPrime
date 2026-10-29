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
