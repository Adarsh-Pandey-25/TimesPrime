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
  DUE_BATCH,
  getPublishedStory,
  hasCounterpart,
  listDueScheduled,
  listHistory,
  listStories,
  requestCorrection,
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

describe("getPublishedStory: the reader's read", () => {
  const NOW = new Date("2026-11-17T10:00:00.000Z");
  const row = (over: Record<string, unknown> = {}) => ({
    id: "s-1",
    public_id: 1024,
    language: "hi",
    section: "india",
    format: "news",
    slug: "sansad-mein-bajat",
    correction_note: null,
    first_published_at: "2026-11-17T08:00:00Z",
    published_at: "2026-11-17T09:00:00Z",
    workflow_state: "published",
    embargo_until: null,
    published_revision_id: "r-2",
    revision: { id: "r-2", story_id: "s-1", headline: "संसद में बजट पास", dek: "d", seo_title: null, seo_description: null, body: { type: "doc", content: [] } },
    bylines: [
      { role: "byline", position: 1, author: { display_name_en: "Vikram Singh", display_name_hi: "विक्रम सिंह", active: true } },
      { role: "byline", position: 0, author: { display_name_en: "Asha Rao", display_name_hi: null, active: true } },
      { role: "byline", position: 2, author: { display_name_en: "Gone", display_name_hi: null, active: false } },
    ],
    ...over,
  });
  const read = (rows: unknown[], calls: Array<[string, unknown[]]> = []) => {
    supabase.from.mockReturnValue(query({ data: rows, error: null }, calls));
    return getPublishedStory(1024, NOW);
  };

  test("asks for one published story past its embargo, with the reader's columns only", async () => {
    const calls: Array<[string, unknown[]]> = [];
    await read([row()], calls);
    expect(supabase.from).toHaveBeenCalledWith("stories");
    const select = String(calls.find(([m]) => m === "select")![1][0]);
    expect(select).not.toContain("*");
    expect(select).toContain("story_revisions!stories_published_revision_fk(");
    for (const hidden of ["created_by", "approved_by", "current_revision_id", "legal_review_required", "editor_id"]) expect(select).not.toContain(hidden);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["eq", ["public_id", 1024]],
        ["eq", ["workflow_state", "published"]],
        ["or", ['embargo_until.is.null,embargo_until.lte."2026-11-17T10:00:00.000Z"']],
        ["limit", [1]],
      ])
    );
  });

  test("returns the published revision, and the active bylines in order, in the story's language", async () => {
    const story = await read([row()]);
    expect(story).toEqual({
      id: "s-1",
      public_id: 1024,
      language: "hi",
      section: "india",
      format: "news",
      slug: "sansad-mein-bajat",
      correction_note: null,
      first_published_at: "2026-11-17T08:00:00Z",
      published_at: "2026-11-17T09:00:00Z",
      revision: { headline: "संसद में बजट पास", dek: "d", seo_title: null, seo_description: null, body: { type: "doc", content: [] } },
      bylines: [
        { role: "byline", name: "Asha Rao" },
        { role: "byline", name: "विक्रम सिंह" },
      ],
    });
  });

  test.each([
    ["no such story", []],
    ["another story's row", [row({ public_id: 1025 })]],
    ["a draft", [row({ workflow_state: "draft" })]],
    ["a story taken down", [row({ workflow_state: "unpublished" })]],
    ["a story under embargo", [row({ embargo_until: "2026-11-17T10:00:01Z" })]],
    ["a revision that is not the published one", [row({ published_revision_id: "r-3" })]],
    ["another story's revision", [row({ revision: { ...row().revision, story_id: "s-9" } })]],
    ["no revision", [row({ revision: null })]],
  ])("%s is not shown (null), even if the store ignored a filter", async (_case, rows) => {
    expect(await read(rows)).toBeNull();
  });

  test("an embargo that has passed does not hide the story", async () => {
    expect(await read([row({ embargo_until: "2026-11-17T09:59:59Z" })])).not.toBeNull();
  });

  test("a number that cannot be a story is not looked up", async () => {
    for (const n of [0, -1, 1.5, Number.NaN, 2 ** 60]) expect(await getPublishedStory(n, NOW)).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  test("a database error is thrown, not shown as a missing story", async () => {
    supabase.from.mockReturnValue(query({ data: null, error: { code: "57014", message: "timeout" } }, []));
    await expect(getPublishedStory(1024, NOW)).rejects.toBeInstanceOf(DeskStoreError);
  });
});

describe("listDueScheduled: the publish-scheduled job's read", () => {
  test("scheduled stories whose time has come, oldest first, a batch at a time", async () => {
    const calls: Array<[string, unknown[]]> = [];
    supabase.from.mockReturnValue(query({ data: [{ id: "s-1" }], error: null }, calls));
    const now = new Date("2026-11-17T10:00:00.000Z");
    expect(await listDueScheduled(now)).toEqual([{ id: "s-1" }]);
    expect(supabase.from).toHaveBeenCalledWith("stories");
    expect(calls).toEqual(
      expect.arrayContaining([
        ["eq", ["workflow_state", "scheduled"]],
        ["lte", ["scheduled_at", "2026-11-17T10:00:00.000Z"]],
        ["order", ["scheduled_at", { ascending: true }]],
        ["limit", [DUE_BATCH]],
      ])
    );
  });

  test("a database error is thrown", async () => {
    supabase.from.mockReturnValue(query({ data: null, error: { code: "57014", message: "timeout" } }, []));
    await expect(listDueScheduled(new Date())).rejects.toBeInstanceOf(DeskStoreError);
  });
});

describe("requestCorrection: a Sub-editor's request (the matrix's A)", () => {
  test("a correction request, the note as its payload and its reason", async () => {
    const calls: Array<[string, unknown[]]> = [];
    supabase.from.mockReturnValue(query({ data: { id: "p-2" }, error: null }, calls));
    expect(await requestCorrection("s-1", "u-3", "An earlier version gave the wrong score.")).toEqual({ id: "p-2" });
    expect(supabase.from).toHaveBeenCalledWith("pending_actions");
    expect(calls.find(([m]) => m === "insert")?.[1][0]).toEqual({
      story_id: "s-1",
      action: "correction",
      requested_by: "u-3",
      reason: "An earlier version gave the wrong score.",
      payload: { note: "An earlier version gave the wrong score." },
    });
  });

  test("a second open correction request answers 409", async () => {
    supabase.from.mockReturnValue(query({ data: null, error: { code: "23505", message: "duplicate key" } }, []));
    await expect(requestCorrection("s-1", "u-3", "n")).rejects.toMatchObject({ status: 409 });
  });
});
