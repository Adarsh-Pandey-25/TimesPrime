/**
 * @jest-environment node
 *
 * The admin article list (GET /api/admin/articles): characterization, written
 * before its search term was escaped. Supabase is replaced by a builder that
 * records every call in the chain and resolves to `result`.
 */

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("@/server/lib/supabase", () => ({ supabase: { from: jest.fn() }, isSupabaseConfigured: jest.fn(() => true) }));
// The gate is tested in access.test.ts; here it lets every request through, so these tests keep
// describing the list itself.
jest.mock("@/server/auth/requirePermission", () => ({ requirePermission: jest.fn(async () => ({ ok: true, actor: {} })) }));

import { NextRequest } from "next/server";
import { GET } from "./route";

const { supabase, isSupabaseConfigured } = jest.requireMock("@/server/lib/supabase") as {
  supabase: { from: jest.Mock };
  isSupabaseConfigured: jest.Mock;
};

let calls: Array<[string, unknown[]]>;
let result: object;

function recorder(): object {
  const proxy: object = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "then") return (resolve: (value: object) => void) => resolve(result);
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return proxy;
        };
      },
    }
  );
  return proxy;
}

beforeEach(() => {
  calls = [];
  result = { data: [{ article_id: "a1", title: "Budget passes" }], count: 45, error: null };
  supabase.from.mockReset();
  supabase.from.mockImplementation((table: string) => {
    calls.push(["from", [table]]);
    return recorder();
  });
  isSupabaseConfigured.mockReturnValue(true);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const list = (query = "") => GET(new NextRequest(`http://localhost:3000/api/admin/articles${query}`));
const call = (name: string) => calls.filter(([n]) => n === name).map(([, args]) => args);

describe("GET /api/admin/articles (characterization)", () => {
  test("defaults: page 1 of 20, newest first, with the total and page count", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ articles: [{ article_id: "a1", title: "Budget passes" }], total: 45, page: 1, totalPages: 3 });
    expect(call("from")).toEqual([["articles"]]);
    expect(call("order")).toEqual([["created_at", { ascending: false }]]);
    expect(call("range")).toEqual([[0, 19]]);
  });

  test("the limit is capped at 100, and the page offsets the range", async () => {
    await list("?page=3&limit=500");
    expect(call("range")).toEqual([[200, 299]]);
  });

  test("category 'general' is no filter; any other category is a contains-match", async () => {
    await list("?category=general");
    expect(call("contains")).toEqual([]);
    calls = [];
    await list("?category=sports");
    expect(call("contains")).toEqual([["category", ["sports"]]]);
  });

  test("a 2-letter country code is translated to the stored name; an unknown one passes through", async () => {
    await list("?country=IN");
    expect(call("contains")).toEqual([["country", ["india"]]]);
    calls = [];
    await list("?country=fr");
    expect(call("contains")).toEqual([["country", ["fr"]]]);
  });

  test("a plain search term is a title ilike, wrapped in %", async () => {
    await list("?search=%20budget%20");
    expect(call("ilike")).toEqual([["title", "%budget%"]]);
  });

  test("no search term, no ilike", async () => {
    await list();
    expect(call("ilike")).toEqual([]);
  });

  test("a Supabase error is a 500 with its message", async () => {
    result = { data: null, count: null, error: { message: "boom" } };
    const res = await list();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });

  test("without Supabase configured: 503", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    expect((await list()).status).toBe(503);
  });
});

// The term went in raw, so % and _ in it were wildcards, and PostgREST turns
// * into % too: "a_b" matched "axb", and "*" or "%" matched every title. Same
// escape as the feed search (F-006). .ilike() sends the value as one query
// parameter, so it needs no quoting: , ( ) cannot add filter clauses here.
describe("GET /api/admin/articles — the search term is LIKE-escaped (F-006)", () => {
  test.each([
    ["% and _ are literal", "50%_off", "%50\\%\\_off%"],
    ["a backslash is literal", "C:\\temp", "%C:\\\\temp%"],
    ["PostgREST's * wildcard is dropped", "bud*get", "%budget%"],
    ["a term of wildcards alone matches only itself", "%", "%\\%%"],
    ["commas and parentheses stay in the value", "a,b(c)", "%a,b(c)%"],
  ])("%s", async (_label, term, pattern) => {
    await list(`?search=${encodeURIComponent(term)}`);
    expect(call("ilike")).toEqual([["title", pattern]]);
  });
});
