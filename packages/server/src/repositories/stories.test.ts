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
  inScopes,
  listCredits,
  listDueScheduled,
  listHistory,
  listStories,
  listTakedowns,
  requestCorrection,
  saveRevision,
  scopeFilter,
  setCredits,
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

describe("listTakedowns: the Desk's alert list", () => {
  const NOW = new Date("2026-11-17T12:00:00.000Z");
  const move = (id: number, story: string, action = "unpublish", actor: string | null = "u-1") => ({
    id, story_id: story, action, actor_id: actor, actor_label: `staff:${actor}`, reason: "legal: Court order.", at: `2026-11-1${id}T09:00:00Z`,
  });
  const storyRow = (id: string, language: string, section: string, state = "unpublished") => ({
    id, language, section, workflow_state: state, current: { headline: `Story ${id}` },
  });
  function serveTables(tables: Record<string, unknown>, calls: Array<[string, unknown[]]> = []) {
    supabase.from.mockImplementation((table: string) => query({ data: tables[table] ?? [], error: null }, calls));
    return calls;
  }

  test("unpublish and retract of the last 30 days, newest first", async () => {
    const calls = serveTables({ workflow_transitions: [move(2, "s-1")], stories: [storyRow("s-1", "hi", "sports")], staff_profiles: [] });
    await listTakedowns([{ language: null, section: null }], NOW);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["in", ["action", ["unpublish", "retract"]]],
        ["gte", ["at", "2026-10-18T12:00:00.000Z"]],
        ["order", ["at", { ascending: false }]],
      ])
    );
  });

  test("only stories inside the caller's scopes, with the headline, the state now and who took it down", async () => {
    serveTables({
      workflow_transitions: [move(3, "s-1", "retract", "u-1"), move(2, "s-2"), move(1, "s-3", "unpublish", null)],
      stories: [storyRow("s-1", "hi", "sports", "published"), storyRow("s-2", "en", "sports"), storyRow("s-3", "hi", "india")],
      staff_profiles: [{ user_id: "u-1", display_name: "Asha" }],
    });
    const alerts = await listTakedowns([{ language: "hi", section: null }], NOW);
    expect(alerts.map((a) => [a.id, a.action, a.by, a.story.headline, a.story.workflow_state])).toEqual([
      [3, "retract", "Asha", "Story s-1", "published"],
      [1, "unpublish", "staff:null", "Story s-3", "unpublished"],
    ]);
  });

  test("a name not known falls back to the history label", async () => {
    serveTables({ workflow_transitions: [move(2, "s-1", "unpublish", "u-7")], stories: [storyRow("s-1", "hi", "sports")], staff_profiles: [] });
    expect((await listTakedowns([{ language: null, section: null }], NOW))[0].by).toBe("staff:u-7");
  });

  test("no scope, nothing read; no takedown, no further read", async () => {
    expect(await listTakedowns([], NOW)).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
    serveTables({ workflow_transitions: [] });
    expect(await listTakedowns([{ language: null, section: null }], NOW)).toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  test("inScopes: a null field means all", () => {
    expect(inScopes({ language: "hi", section: "sports" }, [{ language: null, section: null }])).toBe(true);
    expect(inScopes({ language: "hi", section: "sports" }, [{ language: "hi", section: "india" }, { language: "en", section: null }])).toBe(false);
    expect(inScopes({ language: "hi", section: "sports" }, [{ language: "en", section: null }, { language: null, section: "sports" }])).toBe(true);
  });

  test("a database error is thrown", async () => {
    supabase.from.mockReturnValue(query({ data: null, error: { code: "57014", message: "timeout" } }, []));
    await expect(listTakedowns([{ language: null, section: null }], NOW)).rejects.toBeInstanceOf(DeskStoreError);
  });
});

describe("a story's credits", () => {
  test("listed in order, with each author's names", async () => {
    const calls: Array<[string, unknown[]]> = [];
    supabase.from.mockReturnValue(query({ data: [{ author_id: "a-1", role: "byline", position: 0 }], error: null }, calls));
    expect(await listCredits("s-1")).toEqual([{ author_id: "a-1", role: "byline", position: 0 }]);
    expect(supabase.from).toHaveBeenCalledWith("story_authors");
    expect(String(calls.find(([m]) => m === "select")?.[1][0])).toContain("author:authors(display_name_en, display_name_hi, active)");
    expect(calls).toEqual(expect.arrayContaining([["eq", ["story_id", "s-1"]], ["order", ["position", { ascending: true }]]]));
  });

  test("set through desk_set_credits, naming the state the story was read in", async () => {
    supabase.rpc.mockResolvedValue({ data: { id: "s-1" }, error: null });
    await setCredits({ storyId: "s-1", from: "approved", actorId: "u-1", actorLabel: "staff:u-1", credits: [{ author_id: "a-1", role: "byline" }] });
    expect(supabase.rpc).toHaveBeenCalledWith("desk_set_credits", {
      p_story: "s-1",
      p_from: "approved",
      p_actor: "u-1",
      p_actor_label: "staff:u-1",
      p_credits: [{ author_id: "a-1", role: "byline" }],
    });
  });

  test("a story that moved meanwhile answers 409; a retired author 422", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "moved" } });
    await expect(setCredits({ storyId: "s-1", from: "draft", actorId: "u-1", actorLabel: "l", credits: [] })).rejects.toMatchObject({ status: 409 });
    supabase.rpc.mockResolvedValue({ data: null, error: { code: "23503", message: "not an active author" } });
    await expect(setCredits({ storyId: "s-1", from: "draft", actorId: "u-1", actorLabel: "l", credits: [] })).rejects.toMatchObject({ status: 422 });
  });
});
