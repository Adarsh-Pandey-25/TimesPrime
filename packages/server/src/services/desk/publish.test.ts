/**
 * @jest-environment node
 *
 * Publishing's own rules (Panel 2 design §3), shared by the Desk's Publish route and the worker's
 * publish-scheduled job: Publish Guard, the embargo, and what going live sets.
 */

import { publishFields, publishRefusal, storyTarget } from "./publish";

const NOW = new Date("2026-11-17T10:00:00.000Z");
const story = (over: Record<string, unknown> = {}) => ({
  embargo_until: null as string | null,
  approved_revision_id: "r-2" as string | null,
  published_revision_id: null as string | null,
  first_published_at: null as string | null,
  ...over,
});

test("an approved revision past its embargo may go live", () => {
  expect(publishRefusal(story(), NOW)).toBeNull();
  expect(publishRefusal(story({ embargo_until: "2026-11-17T09:59:59Z" }), NOW)).toBeNull();
});

test("never before the embargo", () => {
  expect(publishRefusal(story({ embargo_until: "2026-11-17T10:00:01Z" }), NOW)).toEqual({
    code: "embargo",
    message: "The story is under embargo until 2026-11-17T10:00:01Z.",
  });
});

test("only an approved revision that is not already live (Publish Guard)", () => {
  expect(publishRefusal(story({ approved_revision_id: null }), NOW)?.code).toBe("not_approved");
  expect(publishRefusal(story({ published_revision_id: "r-2" }), NOW)?.code).toBe("not_approved");
});

test("going live: the approved revision, by whom and when; the first publication's time stays", () => {
  expect(publishFields(story(), "u-1", NOW)).toEqual({
    published_by: "u-1",
    published_revision_id: "r-2",
    published_at: "2026-11-17T10:00:00.000Z",
    first_published_at: "2026-11-17T10:00:00.000Z",
    scheduled_at: null,
  });
  expect(publishFields(story({ first_published_at: "2026-11-16T08:00:00Z" }), "u-1", NOW).first_published_at).toBe("2026-11-16T08:00:00Z");
});

test("a story's permission target is its desk and its creator", () => {
  expect(storyTarget({ language: "hi", section: "sports", created_by: "u-9" })).toEqual({ language: "hi", section: "sports", ownerId: "u-9" });
});
