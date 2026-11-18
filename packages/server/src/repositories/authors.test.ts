/**
 * @jest-environment node
 *
 * Author records (Panel 2 design §7): listed by name, retired ones only on request; created and
 * changed as service_role; never deleted.
 */

jest.mock("../lib/supabase", () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

import { createAuthor, getAuthor, listAuthors, updateAuthor } from "./authors";
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

test("the list is by English name, active authors only unless retired ones are asked for", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [{ id: "a-1" }], error: null }, calls));
  expect(await listAuthors(false)).toEqual([{ id: "a-1" }]);
  expect(supabase.from).toHaveBeenCalledWith("authors");
  expect(calls).toEqual(expect.arrayContaining([["order", ["display_name_en", { ascending: true }]], ["eq", ["active", true]]]));

  const all: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: [], error: null }, all));
  await listAuthors(true);
  expect(all.some(([m]) => m === "eq")).toBe(false);
});

test("create inserts the fields given; update changes only those, and finds no one for an unknown id", async () => {
  const calls: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: { id: "a-1" }, error: null }, calls));
  await createAuthor({ display_name_en: "Asha Rao", kind: "staff" });
  expect(calls.find(([m]) => m === "insert")?.[1][0]).toEqual({ display_name_en: "Asha Rao", kind: "staff" });

  const edit: Array<[string, unknown[]]> = [];
  supabase.from.mockReturnValue(query({ data: null, error: null }, edit));
  expect(await updateAuthor("a-9", { active: false })).toBeNull();
  expect(edit).toEqual(expect.arrayContaining([["update", [{ active: false }]], ["eq", ["id", "a-9"]]]));
  expect(edit.some(([m]) => m === "delete")).toBe(false);
});

test("a database error is thrown", async () => {
  supabase.from.mockReturnValue(query({ data: null, error: { code: "57014", message: "timeout" } }, []));
  await expect(getAuthor("a-1")).rejects.toBeInstanceOf(DeskStoreError);
});
