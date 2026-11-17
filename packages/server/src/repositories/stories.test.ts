/**
 * @jest-environment node
 *
 * The Desk's store (Panel 2 design §2): every write goes through one desk_* database function, a list
 * stays inside the caller's scopes, and database errors become the statuses the routes answer.
 */

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import {
  createStory,
  DeskStoreError,
  hasCounterpart,
  listHistory,
  listStories,
  saveRevision,
  scopeFilter,
  storeError,
  transition,
} from "./stories";

const { supabase } = jest.requireMock("../lib/supabase") as { supabase: { from: jest.Mock; rpc: jest.Mock } };

/** A query builder that records every call and resolves to `result`. */
function query(result: unknown, calls: Array<[string, unknown[]]>) {
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

describe("scopeFilter", () => {
  test("an unlimited scope lifts the filter", () => {
    expect(scopeFilter([{ language: "hi", section: "sports" }, { language: null, section: null }])).toBeNull();
  });

  test("each scope becomes one clause: language, section, or both", () => {
    expect(scopeFilter([{ language: "hi", section: "sports" }, { language: "en", section: null }, { language: null, section: "world" }])).toBe(
      "and(language.eq.hi,section.eq.sports),language.eq.en,section.eq.world"
    );
  });

  test("a malformed scope is dropped, and with none left nothing matches", () => {
    expect(scopeFilter([{ language: "hi", section: "Sports,id.neq.0" }])).toBe("id.is.null");
    expect(scopeFilter([{ language: "fr", section: null }, { language: "en", section: "india" }])).toBe("and(language.eq.en,section.eq.india)");
  });
});

describe("listStories", () => {
  test("filters, keeps to the scopes, and pages", async () => {
    const calls: Array<[string, unknown[]]> = [];
    supabase.from.mockImplementation(() => query({ data: [{ id: "s-1" }], error: null, count: 1 }, calls));
    const out = await listStories({ language: "hi", state: "desk_review" }, [{ language: "hi", section: "sports" }], 2);
    expect(out).toEqual({ stories: [{ id: "s-1" }], total: 1 });
    expect(supabase.from).toHaveBeenCalledWith("stories");
    expect(calls).toContainEqual(["eq", ["language", "hi"]]);
    expect(calls).toContainEqual(["eq", ["workflow_state", "desk_review"]]);
    expect(calls).toContainEqual(["or", ["and(language.eq.hi,section.eq.sports)"]]);
    expect(calls).toContainEqual(["range", [50, 99]]);
  });

  test("with no scope at all it reads nothing", async () => {
    await expect(listStories({}, [])).resolves.toEqual({ stories: [], total: 0 });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

test("the history is read oldest first", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockImplementation(() => query({ data: [{ action: "create" }], error: null }, calls));
  await expect(listHistory("s-1")).resolves.toEqual([{ action: "create" }]);
  expect(supabase.from).toHaveBeenCalledWith("workflow_transitions");
  expect(calls).toContainEqual(["order", ["id", { ascending: true }]]);
});

test("a story outside a translation group needs no counterpart; inside one, the other language must exist", async () => {
  await expect(hasCounterpart({ id: "s-1", language: "en", translation_group_id: null })).resolves.toBe(true);
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockImplementation(() => query({ count: 0, error: null }, calls));
  await expect(hasCounterpart({ id: "s-1", language: "en", translation_group_id: "g-1" })).resolves.toBe(false);
  expect(calls).toContainEqual(["neq", ["language", "en"]]);
});

describe("writes go through the desk_* functions", () => {
  test("create", async () => {
    supabase.rpc.mockResolvedValue({ data: { id: "s-1" }, error: null });
    await createStory({ actorId: "u-1", language: "hi", section: "sports", format: "news", state: "draft", headline: "h", dek: null, body: { type: "doc" }, translationGroupId: null });
    expect(supabase.rpc).toHaveBeenCalledWith("desk_create_story", {
      p_actor: "u-1",
      p_language: "hi",
      p_section: "sports",
      p_format: "news",
      p_state: "draft",
      p_headline: "h",
      p_dek: null,
      p_body: { type: "doc" },
      p_translation_group_id: null,
    });
  });

  test("save names the revision the editor started from", async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: "s-1" }], error: null });
    await saveRevision({ storyId: "s-1", actorId: "u-1", expectedRevisionId: "r-1", headline: "h", dek: "d", body: {}, seoTitle: null, seoDescription: null, isSubstantive: false });
    expect(supabase.rpc).toHaveBeenCalledWith("desk_save_revision", expect.objectContaining({ p_story: "s-1", p_expected_revision: "r-1" }));
  });

  test("a move names where it starts, so a story that moved meanwhile is refused (409)", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "desk: story s-1 is not desk_review any more" } });
    const moving = transition({ storyId: "s-1", action: "approve", from: "desk_review", to: "approved", actorId: "u-2", actorLabel: "staff:u-2", reason: null, fields: { approved_by: "u-2" } });
    await expect(moving).rejects.toMatchObject({ status: 409 });
    expect(supabase.rpc).toHaveBeenCalledWith("desk_transition", expect.objectContaining({ p_from: "desk_review", p_to: "approved", p_fields: { approved_by: "u-2" } }));
  });
});

test.each([
  ["40001", 409],
  ["P0002", 404],
  ["23514", 422],
  ["23503", 422],
  ["22P02", 422],
  ["XX000", 500],
  [undefined, 500],
])("database error %s answers %d", (code, status) => {
  const e = storeError({ code, message: "m" });
  expect(e).toBeInstanceOf(DeskStoreError);
  expect(e.status).toBe(status);
});
