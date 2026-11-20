/**
 * @jest-environment node
 *
 * A live blog's updates (Panel 3 design §2, M3): every change is one database function, a list keeps
 * to its story, and the database's refusals become the statuses the routes answer.
 */

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { editLiveUpdate, endLiveBlog, liveError, listLiveUpdates, postLiveUpdate, removeLiveUpdate } from "./liveUpdates";
import { DeskStoreError } from "./stories";

const { supabase } = jest.requireMock("../lib/supabase") as { supabase: { from: jest.Mock; rpc: jest.Mock } };

function query(result: unknown, calls: Array<[string, unknown[]]> = []) {
  const builder: object = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([String(prop), args]);
          return builder;
        };
      },
    }
  );
  return builder;
}

beforeEach(() => jest.resetAllMocks());

const FIELDS = { headline: null, body: { type: "doc", content: [] }, isKeyEvent: true, isPinned: false };

test("each write is its own database function, with the fields named", async () => {
  supabase.rpc.mockResolvedValue({ data: { id: "lu-1" }, error: null });
  await postLiveUpdate("s-1", "u-1", FIELDS);
  await editLiveUpdate("lu-1", "u-1", FIELDS);
  await removeLiveUpdate("lu-1", "u-1", "Wrong figure.");
  await endLiveBlog("s-1", "u-1");
  expect(supabase.rpc.mock.calls).toEqual([
    ["live_post", { p_story: "s-1", p_actor: "u-1", p_headline: null, p_body: FIELDS.body, p_key_event: true, p_pinned: false }],
    ["live_edit", { p_update: "lu-1", p_actor: "u-1", p_headline: null, p_body: FIELDS.body, p_key_event: true, p_pinned: false }],
    ["live_remove", { p_update: "lu-1", p_actor: "u-1", p_reason: "Wrong figure." }],
    ["live_end", { p_story: "s-1", p_actor: "u-1" }],
  ]);
});

test.each([
  ["P0002", "live_post: story s-1 not found", 404, "Story not found."],
  ["P0002", "live_edit: update lu-1 not found", 404, "Update not found."],
  ["55000", "live_post: story s-1 is not an open live blog", 409, /not an open live blog/],
  ["55000", "live_remove: update lu-1 was already removed", 409, "This update was removed."],
  ["23514", "check", 422, "check"],
  ["57014", "timeout", 500, "timeout"],
])("the database's %s (%s) is answered %d", (code, message, status, words) => {
  const err = liveError({ code, message });
  expect(err).toBeInstanceOf(DeskStoreError);
  expect(err.status).toBe(status);
  expect(err.message).toEqual(typeof words === "string" ? words : expect.stringMatching(words));
});

test("the panel's list: one story's updates, newest first, and only that story's", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [{ id: "a", story_id: "s-1" }, { id: "x", story_id: "s-9" }], error: null }, calls));
  expect((await listLiveUpdates("s-1")).map((u) => u.id)).toEqual(["a"]);
  expect(calls).toEqual(expect.arrayContaining([["eq", ["story_id", "s-1"]], ["order", ["posted_at", { ascending: false }]]]));
});

test("a refused write is thrown with its status, and an empty answer is a 500", async () => {
  supabase.rpc.mockResolvedValue({ data: null, error: { code: "55000", message: "live_end: story s-1 is not an open live blog" } });
  await expect(endLiveBlog("s-1", "u-1")).rejects.toMatchObject({ status: 409 });
  supabase.rpc.mockResolvedValue({ data: null, error: null });
  await expect(postLiveUpdate("s-1", "u-1", FIELDS)).rejects.toMatchObject({ status: 500 });
});
