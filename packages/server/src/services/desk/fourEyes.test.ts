/**
 * @jest-environment node
 *
 * Four-eyes (Panel 2 design §3): the approver is neither the story's creator nor anyone who edited
 * what is being approved.
 */

import { editorsSinceApproval, mayApprove, mayReviewPostHoc, type HistoryRow } from "./fourEyes";

const row = (action: string, actorId: string): HistoryRow => ({ action, actorId });

test("the creator may never approve their own story", () => {
  expect(mayApprove("writer", "writer", [row("create", "writer")])).toBe(false);
});

test("whoever saved since the last approval may not approve; a third person may", () => {
  const history = [row("create", "writer"), row("save", "writer"), row("submit", "writer"), row("save", "sub"), row("submit", "sub")];
  expect(mayApprove("sub", "writer", history)).toBe(false);
  expect(mayApprove("desk", "writer", history)).toBe(true);
});

test("for a live story's update, only the editors since the last approval count", () => {
  const history = [
    row("create", "writer"),
    row("save", "sub"),
    row("approve", "desk"),
    row("publish", "desk"),
    row("save", "desk"), // the desk editor now edits the live story
  ];
  expect(editorsSinceApproval("writer", history)).toEqual(new Set(["writer", "desk"]));
  expect(mayApprove("desk", "writer", history)).toBe(false);
  // The sub-editor's edit was approved before; they may approve the desk editor's update.
  expect(mayApprove("sub", "writer", history)).toBe(true);
});

test("a system row with no actor adds no one", () => {
  expect(editorsSinceApproval("writer", [{ action: "save", actorId: null }])).toEqual(new Set(["writer"]));
});

test("post-hoc review of a breaking story: not by its publisher, nor by its editors", () => {
  const history = [row("create", "writer"), row("save", "writer"), row("publish_direct", "desk")];
  expect(mayReviewPostHoc("desk", "writer", history)).toBe(false);
  expect(mayReviewPostHoc("writer", "writer", history)).toBe(false);
  expect(mayReviewPostHoc("editor-2", "writer", history)).toBe(true);
});
