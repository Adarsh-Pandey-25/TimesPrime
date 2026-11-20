/**
 * @jest-environment node
 *
 * The front page's pins (Panel 3 design §2): pins are made and ended only through the database's
 * front_pin and front_unpin; every read applies the database's rules again on its rows; the database's
 * refusals become the statuses the routes answer.
 */

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { describePins, frontError, listPagePins, listPinnable, livePins, pinStory, pinUntil, unpin, type PinRow } from "./frontPage";
import { DeskStoreError } from "./stories";

const { supabase } = jest.requireMock("../lib/supabase") as { supabase: { from: jest.Mock; rpc: jest.Mock } };

/** A query builder that records every call and resolves to `result`. */
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

const NOW = new Date("2026-11-20T10:00:00.000Z");
const pin = (over: Partial<PinRow> = {}): PinRow => ({
  id: "p-1",
  language: "hi",
  section: null,
  slot: 1,
  story_id: "s-1",
  starts_at: "2026-11-20T08:00:00Z",
  ends_at: "2026-11-21T08:00:00Z",
  pinned_by: "u-1",
  pinned_at: "2026-11-20T08:00:00Z",
  ended_by: null,
  ended_at: null,
  end_reason: null,
  ...over,
});

beforeEach(() => jest.resetAllMocks());

test("pinUntil: its end, or the earlier time it was replaced or unpinned at", () => {
  expect(pinUntil(pin())).toBe("2026-11-21T08:00:00Z");
  expect(pinUntil(pin({ ended_at: "2026-11-20T12:00:00Z" }))).toBe("2026-11-20T12:00:00Z");
  expect(pinUntil(pin({ ended_at: "2026-11-22T00:00:00Z" }))).toBe("2026-11-21T08:00:00Z");
});

test.each([
  ["P0002", 404],
  ["55000", 409],
  ["23505", 409],
  ["23514", 422],
  ["22023", 422],
  ["22P02", 422],
  ["57014", 500],
])("the database's %s is answered %d", (code, status) => {
  const err = frontError({ code, message: "m" }, "pin");
  expect(err).toBeInstanceOf(DeskStoreError);
  expect(err.status).toBe(status);
});

test("an unpin's refusals speak of the pin", () => {
  expect(frontError({ code: "P0002", message: "m" }, "unpin").message).toBe("Pin not found.");
  expect(frontError({ code: "55000", message: "m" }, "unpin").message).toBe("This pin has already ended.");
});

describe("listPagePins: the screen's list", () => {
  test("one page, not run out, by slot and start; the home page is section IS NULL", async () => {
    const calls: Array<[string, unknown[]]> = [];
    supabase.from.mockReturnValue(query({ data: [pin({ id: "b", slot: 2 }), pin({ id: "a" })], error: null }, calls));
    expect((await listPagePins({ language: "hi", section: null }, NOW)).map((p) => p.id)).toEqual(["a", "b"]);
    expect(calls).toEqual(
      expect.arrayContaining([
        ["eq", ["language", "hi"]],
        ["is", ["section", null]],
        ["gt", ["ends_at", "2026-11-20T10:00:00.000Z"]],
        ["or", ['ended_at.is.null,ended_at.gt."2026-11-20T10:00:00.000Z"']],
      ])
    );
  });

  test("the rules again on the rows: another page's pin, or one that has ended, is left out", async () => {
    const rows = [pin({ id: "a" }), pin({ id: "b", section: "sports" }), pin({ id: "c", language: "en" }), pin({ id: "d", ended_at: "2026-11-20T09:00:00Z" }), pin({ id: "e", ends_at: "2026-11-20T09:00:00Z" })];
    supabase.from.mockReturnValue(query({ data: rows, error: null }));
    expect((await listPagePins({ language: "hi", section: null }, NOW)).map((p) => p.id)).toEqual(["a"]);
  });

  test("a section page is that section", async () => {
    const calls: Array<[string, unknown[]]> = [];
    supabase.from.mockReturnValue(query({ data: [], error: null }, calls));
    await listPagePins({ language: "en", section: "sports" }, NOW);
    expect(calls).toEqual(expect.arrayContaining([["eq", ["section", "sports"]]]));
    expect(calls.some(([m]) => m === "is")).toBe(false);
  });
});

describe("livePins: what readers see", () => {
  test("pins showing now, one per slot: the latest start wins", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const rows = [
      pin({ slot: 1, story_id: "late", starts_at: "2026-11-20T09:00:00Z" }),
      pin({ slot: 1, story_id: "early", starts_at: "2026-11-20T08:00:00Z" }),
      pin({ slot: 3, story_id: "third", ended_at: "2026-11-20T12:00:00Z" }),
      pin({ slot: 2, story_id: "later", starts_at: "2026-11-20T11:00:00Z" }),
    ];
    supabase.from.mockReturnValue(query({ data: rows, error: null }, calls));
    expect(await livePins({ language: "hi", section: null }, NOW)).toEqual([
      { slot: 1, story_id: "late", until: "2026-11-21T08:00:00Z" },
      { slot: 3, story_id: "third", until: "2026-11-20T12:00:00Z" },
    ]);
    expect(calls).toEqual(expect.arrayContaining([["lte", ["starts_at", "2026-11-20T10:00:00.000Z"]]]));
    // Only the columns readers are granted, and the end the policy reads.
    expect(String(calls.find(([m]) => m === "select")![1][0])).not.toMatch(/pinned_by|ended_by/);
  });
});

test("livePins: before front-2 is applied there is no table, and no pin; any other error is thrown", async () => {
  for (const code of ["42P01", "PGRST205"]) {
    supabase.from.mockReturnValue(query({ data: null, error: { code, message: "relation public.front_page_pins does not exist" } }));
    expect(await livePins({ language: "en", section: null }, NOW)).toEqual([]);
  }
  supabase.from.mockReturnValue(query({ data: null, error: { code: "57014", message: "timeout" } }));
  await expect(livePins({ language: "en", section: null }, NOW)).rejects.toMatchObject({ status: 500 });
});

describe("the writes go through the database's functions", () => {
  test("pinStory calls front_pin with the page, slot, story, start and length, and returns what it replaced", async () => {
    supabase.rpc.mockResolvedValue({ data: { pin: pin(), replaced: ["p-0"] }, error: null });
    const result = await pinStory({ actorId: "u-1", page: { language: "hi", section: "sports" }, slot: 2, storyId: "s-1", startsAt: null, hours: 72 });
    expect(supabase.rpc).toHaveBeenCalledWith("front_pin", { p_actor: "u-1", p_language: "hi", p_section: "sports", p_slot: 2, p_story: "s-1", p_starts_at: null, p_hours: 72 });
    expect(result).toEqual({ pin: pin(), replaced: ["p-0"] });
  });

  test("a refusal of front_pin becomes its status", async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "front_pin: story s-1 is not of this page" } });
    await expect(pinStory({ actorId: "u-1", page: { language: "hi", section: null }, slot: 1, storyId: "s-1", startsAt: null, hours: 24 })).rejects.toMatchObject({ status: 422 });
  });

  test("unpin calls front_unpin", async () => {
    supabase.rpc.mockResolvedValue({ data: pin({ ended_at: "2026-11-20T10:00:00Z", ended_by: "u-2", end_reason: "unpinned" }), error: null });
    expect((await unpin("p-1", "u-2")).end_reason).toBe("unpinned");
    expect(supabase.rpc).toHaveBeenCalledWith("front_unpin", { p_pin: "p-1", p_actor: "u-2" });
  });
});

describe("listPinnable: the picker", () => {
  const story = (id: string, headline: string, over: Record<string, unknown> = {}) => ({
    id, public_id: 1, language: "hi", section: "sports", slug: null, published_at: "2026-11-20T08:00:00Z", embargo_until: null, workflow_state: "published", revision: { headline }, ...over,
  });

  test("published stories of the page, newest first; every word of the search in the headline, any case", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const rows = [story("a", "India win the Final"), story("b", "Final draw"), story("c", "Win for India", { embargo_until: "2026-11-21T00:00:00Z" }), story("d", "india WIN", { section: "india" })];
    supabase.from.mockReturnValue(query({ data: rows, error: null }, calls));
    expect((await listPinnable({ language: "hi", section: "sports" }, "india win", NOW)).map((s) => s.id)).toEqual(["a"]);
    expect(calls).toEqual(expect.arrayContaining([["eq", ["workflow_state", "published"]], ["eq", ["language", "hi"]], ["eq", ["section", "sports"]], ["order", ["published_at", { ascending: false }]]]));
  });

  test("the home page takes every section; no search takes every story", async () => {
    const rows = [story("a", "One"), story("b", "Two", { section: "india" })];
    supabase.from.mockReturnValue(query({ data: rows, error: null }));
    expect((await listPinnable({ language: "hi", section: null }, "", NOW)).map((s) => s.id)).toEqual(["a", "b"]);
  });
});

test("describePins adds the live headline and who pinned", async () => {
  supabase.from.mockImplementation((table: string) =>
    table === "stories"
      ? query({ data: [{ id: "s-1", workflow_state: "published", revision: { headline: "Final" } }], error: null })
      : query({ data: [{ user_id: "u-1", display_name: "Asha" }], error: null })
  );
  expect(await describePins([pin(), pin({ id: "p-2", story_id: "s-9", pinned_by: "u-9" })])).toEqual([
    expect.objectContaining({ id: "p-1", headline: "Final", story_state: "published", pinned_by_name: "Asha" }),
    expect.objectContaining({ id: "p-2", headline: null, story_state: null, pinned_by_name: "a staff member" }),
  ]);
});
