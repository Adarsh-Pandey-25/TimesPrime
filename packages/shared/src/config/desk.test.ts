/**
 * @jest-environment node
 *
 * The Desk's workflow table (Panel 2 design §3): each action starts only from its states, leads where
 * the design says, and needs the matrix permission the design names.
 */

import { PERMISSION_KEYS } from "./permissions";
import {
  checklist,
  DESK_FORMATS,
  embargoed,
  HEADLINE_MAX,
  holdsDeskReview,
  move,
  MOVES,
  SEO_TITLE_MAX,
  STORY_STATES,
  type DeskAction,
  type StoryState,
} from "./desk";

test("every action's permission is a key of the matrix", () => {
  for (const m of Object.values(MOVES)) {
    for (const step of Object.values(m.from)) expect(PERMISSION_KEYS).toContain(step!.permission);
  }
});

test.each([
  ["assign", "pitch", "assigned", "article.edit"],
  ["submit", "draft", "in_review", "article.submit"],
  ["submit", "in_review", "desk_review", "article.submit"],
  ["send_back", "in_review", "draft", "article.submit"],
  ["send_back", "desk_review", "draft", "article.approve"],
  ["approve", "desk_review", "approved", "article.approve"],
  ["approve", "published", "published", "article.approve"],
  ["schedule", "approved", "scheduled", "article.publish"],
  ["unschedule", "scheduled", "approved", "article.publish"],
  ["publish", "approved", "published", "article.publish"],
  ["publish", "scheduled", "published", "article.publish"],
  ["publish_direct", "draft", "published", "article.publish_direct"],
  ["unpublish", "published", "unpublished", "article.unpublish"],
  ["retract", "published", "retracted", "article.unpublish"],
  ["kill", "draft", "killed", "article.edit"],
] as const)("%s from %s leads to %s and needs %s", (action, from, to, permission) => {
  expect(move(action, from)).toMatchObject({ to, permission });
});

// Publish Guard: publishing starts only from an approved, scheduled or live story.
test.each(STORY_STATES.filter((s) => !["approved", "scheduled", "published"].includes(s)))("publish is refused from %s", (from) => {
  expect(move("publish", from)).toBeNull();
});

test("approval starts only from desk review, or a live story's next revision", () => {
  const starts = STORY_STATES.filter((s) => move("approve", s) !== null);
  expect(starts).toEqual(["desk_review", "published"]);
});

test("nothing moves a killed or retracted story, and only restore (two people) moves an unpublished one", () => {
  for (const action of Object.keys(MOVES) as DeskAction[]) {
    for (const from of ["killed", "retracted", "unpublished"] as StoryState[]) expect(move(action, from)).toBeNull();
  }
});

test("out of review, Submit and Send back are the desk's steps (the owner's decision, 18 Nov 2026); nothing else is", () => {
  expect(move("submit", "in_review")?.deskOnly).toBe(true);
  expect(move("send_back", "in_review")?.deskOnly).toBe(true);
  expect(move("submit", "draft")?.deskOnly).toBe(false);
  expect(move("send_back", "desk_review")?.deskOnly).toBe(false);
  const deskSteps = (Object.keys(MOVES) as DeskAction[]).flatMap((a) => STORY_STATES.filter((s) => move(a, s)?.deskOnly).map((s) => `${a}:${s}`));
  expect(deskSteps.sort()).toEqual(["send_back:in_review", "submit:in_review"]);
});

test("a Sub-editor, a Desk Editor or a Managing Editor is offered the desk's steps; a Writer alone is not", () => {
  expect(holdsDeskReview([{ role: "writer" }])).toBe(false);
  expect(holdsDeskReview([])).toBe(false);
  for (const role of ["sub_editor", "desk_editor", "managing_editor"]) expect(holdsDeskReview([{ role: "writer" }, { role }])).toBe(true);
});

test("send back, unpublish, retract and kill need a reason; the others do not", () => {
  const withReason = (Object.keys(MOVES) as DeskAction[]).filter((a) => MOVES[a].reason).sort();
  expect(withReason).toEqual(["kill", "retract", "send_back", "unpublish"]);
});

test("the Desk refuses sponsored stories and live blogs (Panels 9 and 3)", () => {
  expect(DESK_FORMATS).not.toContain("sponsored");
  // Panel 3, M3: a live blog is written on the Desk.
  expect(DESK_FORMATS).toContain("live_blog");
  expect(DESK_FORMATS).toContain("news");
});

describe("the pre-publish checklist", () => {
  const ok = { headline: "Budget passes", dek: "The lower house voted.", seoTitle: "Budget passes", slug: "budget-passes", legalReviewRequired: false, counterpartMissing: false };

  test("a complete story passes", () => {
    expect(checklist(ok)).toEqual([]);
  });

  test("each missing or too-long field is named", () => {
    expect(checklist({ ...ok, headline: "  " })).toEqual(["headline_missing"]);
    expect(checklist({ ...ok, headline: "x".repeat(HEADLINE_MAX + 1) })).toEqual(["headline_too_long"]);
    expect(checklist({ ...ok, dek: null })).toEqual(["dek_missing"]);
    expect(checklist({ ...ok, seoTitle: "" })).toEqual(["seo_title_missing"]);
    expect(checklist({ ...ok, seoTitle: "x".repeat(SEO_TITLE_MAX + 1) })).toEqual(["seo_title_too_long"]);
    expect(checklist({ ...ok, slug: null })).toEqual(["slug_missing"]);
    expect(checklist({ ...ok, legalReviewRequired: true })).toEqual(["legal_review_pending"]);
    expect(checklist({ ...ok, counterpartMissing: true })).toEqual(["translation_missing"]);
  });

  test("lengths count characters, so a Hindi headline at the limit passes", () => {
    expect(checklist({ ...ok, headline: "क".repeat(HEADLINE_MAX) })).toEqual([]);
  });
});

test("an embargo holds until its time, and a malformed one holds", () => {
  const now = new Date("2026-11-17T10:00:00Z");
  expect(embargoed(null, now)).toBe(false);
  expect(embargoed("2026-11-17T09:59:59Z", now)).toBe(false);
  expect(embargoed("2026-11-17T10:00:01Z", now)).toBe(true);
  expect(embargoed("not a date", now)).toBe(true);
});
