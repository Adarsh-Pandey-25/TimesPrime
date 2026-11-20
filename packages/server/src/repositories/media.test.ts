/**
 * @jest-environment node
 *
 * The media library's records (Panel 2 design §7): created as given, listed inside the caller's
 * scopes (active only unless retired ones are asked for), changed with a time, never deleted.
 */

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { createMedia, getMedia, getMediaByIds, listAuthorPhotos, listLiveImages, listMedia, listPendingRenditions, listPublishedImages, recordRenditions, updateMedia } from "./media";
import { DeskStoreError } from "./stories";

const { supabase } = jest.requireMock("../lib/supabase") as { supabase: { from: jest.Mock } };

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

test("the list keeps to the scopes, newest first, active only unless retired ones are asked for", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [{ id: "m-1" }], error: null, count: 1 }, calls));
  expect(await listMedia({ language: "hi" }, [{ language: "hi", section: "sports" }])).toEqual({ media: [{ id: "m-1" }], total: 1 });
  expect(supabase.from).toHaveBeenCalledWith("media_assets");
  expect(calls).toEqual(
    expect.arrayContaining([
      ["order", ["created_at", { ascending: false }]],
      ["eq", ["language", "hi"]],
      ["eq", ["active", true]],
      ["or", ["and(language.eq.hi,section.eq.sports)"]],
      ["range", [0, 47]],
    ])
  );

  const all: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [], error: null, count: 0 }, all));
  await listMedia({ includeRetired: true }, [{ language: null, section: null }]);
  expect(all.some(([m, a]) => m === "eq" && a[0] === "active")).toBe(false);
  expect(all.some(([m]) => m === "or")).toBe(false);
});

test("no scope reads nothing", async () => {
  expect(await listMedia({}, [])).toEqual({ media: [], total: 0 });
  expect(supabase.from).not.toHaveBeenCalled();
});

test("create inserts the record given; an update sets a time and finds no one for an unknown id; nothing is deleted", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: { id: "m-1" }, error: null }, calls));
  const row = { id: "m-1", storage_key: "originals/x.jpg", content_type: "image/jpeg" as const, bytes: 10, language: "en" as const, section: "india", uploaded_by: "u-1", credit: "AP" };
  await createMedia(row);
  expect(calls.find(([m]) => m === "insert")?.[1][0]).toEqual(row);

  const edit: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: null, error: null }, edit));
  expect(await updateMedia("m-9", { active: false }, new Date("2026-11-18T10:00:00.000Z"))).toBeNull();
  expect(edit).toEqual(expect.arrayContaining([["update", [{ active: false, updated_at: "2026-11-18T10:00:00.000Z" }]], ["eq", ["id", "m-9"]]]));
  expect(edit.some(([m]) => m === "delete")).toBe(false);
});

test("the Desk reads images by id, whole; no ids reads nothing", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [{ id: "m-1" }], error: null }, calls));
  expect(await getMediaByIds(["m-1", "m-2"])).toEqual([{ id: "m-1" }]);
  expect(calls).toEqual([["select", ["*"]], ["in", ["id", ["m-1", "m-2"]]]]);
  supabase.from.mockClear();
  expect(await getMediaByIds([])).toEqual([]);
  expect(supabase.from).not.toHaveBeenCalled();
});

test("readers get a published revision's images only through its usages, active, with the readers' columns", async () => {
  const usageCalls: Array<[string, unknown[]]> = [];
  const mediaCalls: Array<[string, unknown[]]> = [];
  supabase.from.mockImplementation((table: string) =>
    table === "asset_usages"
      ? query({ data: [{ asset_id: "m-1" }], error: null }, usageCalls)
      : query({ data: [{ id: "m-1", active: true }, { id: "m-9", active: true }], error: null }, mediaCalls)
  );
  expect(await listPublishedImages("rev-1", ["m-1", "m-2"])).toEqual([{ id: "m-1", active: true }]);
  expect(usageCalls).toEqual([["select", ["asset_id"]], ["eq", ["revision_id", "rev-1"]], ["in", ["asset_id", ["m-1", "m-2"]]]]);
  expect(mediaCalls).toEqual([
    ["select", ["id, storage_key, width, height, credit, alt_en, alt_hi, caption_en, caption_hi, renditions, active"]],
    ["in", ["id", ["m-1"]]],
    ["eq", ["active", true]],
  ]);

  supabase.from.mockImplementation(() => query({ data: [], error: null }, []));
  expect(await listPublishedImages("rev-1", ["m-1"])).toEqual([]);
});

test("readers get an author's photo only when an active author has it, the image active, with the readers' columns", async () => {
  const authorCalls: Array<[string, unknown[]]> = [];
  const mediaCalls: Array<[string, unknown[]]> = [];
  supabase.from.mockImplementation((table: string) =>
    table === "authors"
      ? query({ data: [{ photo_id: "m-1" }, { photo_id: "m-1" }], error: null }, authorCalls)
      : query({ data: [{ id: "m-1", active: true }, { id: "m-7", active: true }], error: null }, mediaCalls)
  );
  expect(await listAuthorPhotos(["m-1", "m-2"])).toEqual([{ id: "m-1", active: true }]);
  expect(authorCalls).toEqual([["select", ["photo_id"]], ["in", ["photo_id", ["m-1", "m-2"]]], ["eq", ["active", true]]]);
  expect(mediaCalls).toEqual([
    ["select", ["id, storage_key, width, height, credit, alt_en, alt_hi, caption_en, caption_hi, renditions, active"]],
    ["in", ["id", ["m-1"]]],
    ["eq", ["active", true]],
  ]);
  supabase.from.mockClear();
  expect(await listAuthorPhotos([])).toEqual([]);
  expect(supabase.from).not.toHaveBeenCalled();
});

test("a live update's image (Panel 3, M3): only an active image with cleared rights, of those asked for", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(
    query({ data: [{ id: "m-1", active: true, rights_cleared_at: "2026-11-19T00:00:00Z" }, { id: "m-2", active: true, rights_cleared_at: null }, { id: "m-9", active: true, rights_cleared_at: "t" }], error: null }, calls)
  );
  expect((await listLiveImages(["m-1", "m-2"])).map((row) => row.id)).toEqual(["m-1"]);
  expect(calls).toEqual([
    ["select", ["id, storage_key, width, height, credit, alt_en, alt_hi, caption_en, caption_hi, renditions, active, rights_cleared_at"]],
    ["in", ["id", ["m-1", "m-2"]]],
    ["eq", ["active", true]],
  ]);
  supabase.from.mockClear();
  expect(await listLiveImages([])).toEqual([]);
  expect(supabase.from).not.toHaveBeenCalled();
});

test("a database error is thrown", async () => {
  supabase.from.mockReturnValue(query({ data: null, error: { code: "57014", message: "timeout" } }, []));
  await expect(getMedia("m-1")).rejects.toBeInstanceOf(DeskStoreError);
});

test("the worker's list: images with no renditions yet, oldest first, a batch at a time", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [{ id: "m-1", storage_key: "originals/x.jpg" }], error: null }, calls));
  expect(await listPendingRenditions(21)).toEqual([{ id: "m-1", storage_key: "originals/x.jpg" }]);
  expect(calls).toEqual([
    ["select", ["id, storage_key"]],
    ["is", ["renditions_at", null]],
    ["order", ["created_at", { ascending: true }]],
    ["limit", [21]],
  ]);
});

test("renditions are recorded once, with the upright size; a failed image gets none and keeps its size unknown", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: { id: "m-1" }, error: null }, calls));
  const at = new Date("2026-11-18T10:05:00.000Z");
  const renditions = [{ key: "renditions/x/4x3-480.webp", ratio: "4x3" as const, format: "webp" as const, width: 480, height: 360, bytes: 9 }];
  expect(await recordRenditions("m-1", { renditions, width: 3000, height: 4000 }, at)).toBe(true);
  expect(calls).toEqual(
    expect.arrayContaining([
      ["update", [{ renditions, renditions_at: "2026-11-18T10:05:00.000Z", width: 3000, height: 4000 }]],
      ["eq", ["id", "m-1"]],
      ["is", ["renditions_at", null]],
    ])
  );

  const failed: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: null, error: null }, failed));
  expect(await recordRenditions("m-2", { renditions: [] }, at)).toBe(false);
  expect(failed.find(([m]) => m === "update")?.[1][0]).toEqual({ renditions: [], renditions_at: "2026-11-18T10:05:00.000Z" });
});
