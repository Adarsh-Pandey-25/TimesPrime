/**
 * @jest-environment node
 *
 * The media library's records (Panel 2 design §7): created as given, listed inside the caller's
 * scopes (active only unless retired ones are asked for), changed with a time, never deleted.
 */

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { createMedia, getMedia, listMedia, updateMedia } from "./media";
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

test("a database error is thrown", async () => {
  supabase.from.mockReturnValue(query({ data: null, error: { code: "57014", message: "timeout" } }, []));
  await expect(getMedia("m-1")).rejects.toBeInstanceOf(DeskStoreError);
});
