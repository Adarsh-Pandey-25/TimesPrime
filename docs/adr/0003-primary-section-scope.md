# ADR 0003 — An article's section, for permission scope, is its first category

**Status:** **Accepted**: 2026-11-02, with the owner's approval of the Panel 0 design. Drafted the
same day from owner decision D6 on the Step 1 report.
**Related:** [`PANEL_PLAN.md`](../PANEL_PLAN.md) ("Generic roles, scoped by language desk and
section"), [`design/panel-0-access-foundation.md`](../design/panel-0-access-foundation.md) §3,
[`database/schema.sql`](../../database/schema.sql) (`articles.category`).

## Context

The plan scopes editorial roles by language desk and section: one Desk Editor role, assigned with
`language = hi, section = sports`, not a "hindi_sports_editor" role. A scoped permission check
therefore needs the section of the article being acted on.

TimesPrime has no section column. `articles.category` is `TEXT[]`, and one article can carry several
tags:
- **Ingested articles** take NewsData's array as delivered, or the fetch category when NewsData
  sends none (`backend/services/news/newsdata.ts`, `backend/repositories/db.ts`). The order is
  NewsData's. It is not the category the cron happened to fetch the article under, and the first tag
  can be a broad one such as `top`.
- **Editorial articles** get one tag, the one the editor chose (`backend/api/admin/publish-article.ts`).
- **Edits** can replace the whole array (`PATCH /api/admin/articles`).
- **`category_mismatches`** lists the tags that Claude Haiku judged not to fit. It is written
  asynchronously, after the article is saved, and NULL means "not yet classified".

## Decision

**For permission scope, an article's section is `category[0]`, as stored.** An article with a NULL
or empty `category` has no section. Only an assignment with no section limit (`section` NULL)
covers it.

`category_mismatches` does not change the answer. Changing `category[0]` is itself a scoped act: an
edit that changes `category[0]` needs the permission in the scope of both the old and the new
section.

The rule lives in one function, `articleScope()` in `backend/auth/scope.ts`, next to the language
mapping (`english` ↔ `en`, `hindi` ↔ `hi`, decision D5). Tests cover it there.

## Alternatives rejected

- **Any category matches.** An editor scoped to `sports` could act on any article tagged `sports`
  anywhere in its array, and could bring any article into scope by adding `sports` to it: the edit
  itself would pass the check, because the new array contains their section. Scope would bound
  nothing. This is the owner's reason for D6.
- **All categories must match.** It closes that hole, but an article tagged `["sports", "business"]`
  would be out of reach of both the sports and the business desk, and most multi-tag articles would
  fall to Managing Editors only.
- **A new `section` column.** It is the cleanest long-term answer, but it is a schema change and a
  backfill decision for every existing row. The plan's data model lists `section_id` under "articles
  (extend)" for Phase 2, where the editorial workflow adds the other article columns. If that column
  arrives, `articleScope()` reads it instead, and this ADR is superseded.
- **Skip tags in `category_mismatches`.** The scope would change when a background job finished,
  moving articles between desks unpredictably, and an unclassified article would get a different
  answer from a classified one.

## Consequences

- A desk's section names are NewsData's category keys, plus the keys editors use. A Panel 1
  assignment form validates a section against that list.
- Because NewsData decides the order, an ingested article's first tag may be broad (`top`). Such an
  article belongs to whichever desk is scoped to that tag, or to unscoped editors. Desk assignments
  should be planned with this in mind, and Panel 2's desk filter shows editors the same rule.
- Reordering tags moves an article between desks. The both-scopes rule above means no one can do
  that for an article outside their own scope.
- An article whose `language` is neither `english` nor `hindi` has no language scope, and only
  all-language assignments cover it (deny by default).
