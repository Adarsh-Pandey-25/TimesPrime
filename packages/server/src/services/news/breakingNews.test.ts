/**
 * @jest-environment node
 *
 * The breaking-news read shared by the reader's banner and the admin's manager: active,
 * unexpired items, newest first, and a clear status when Supabase is missing or fails.
 */

let result: { data: unknown; error: { message: string; code?: string } | null } = { data: [], error: null };
/** A first answer, before `result` (front-1 not applied yet: the column is missing). */
let first: typeof result | null = null;
let configured = true;
const calls: string[] = [];

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("../../lib/supabase", () => {
  const chain = {
    select: (cols: string) => (calls.push(`select ${cols}`), chain),
    eq: (col: string, value: unknown) => (calls.push(`eq ${col} ${value}`), chain),
    or: (filter: string) => (calls.push(`or ${filter.split(",")[0]}`), chain),
    order: (col: string, opts: { ascending: boolean }) => {
      calls.push(`order ${col} ${opts.ascending}`);
      const answer = first ?? result;
      first = null;
      return Promise.resolve(answer);
    },
  };
  return {
    supabase: { from: (table: string) => (calls.push(`from ${table}`), chain) },
    isSupabaseConfigured: () => configured,
  };
});

import { listActiveBreakingNews } from "./breakingNews";

beforeEach(() => {
  result = { data: [], error: null };
  first = null;
  configured = true;
  calls.length = 0;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

test("reads active, unexpired items, newest first, with their language", async () => {
  const item = { id: "b-1", text: "Flood alert", is_active: true, expires_at: null, created_at: "2026-11-04T00:00:00Z", language: "en" };
  result = { data: [item], error: null };
  await expect(listActiveBreakingNews()).resolves.toEqual({ status: 200, body: { items: [item] } });
  expect(calls).toEqual([
    "from breaking_news",
    "select id, text, is_active, expires_at, created_at, language",
    "eq is_active true",
    "or expires_at.is.null",
    "order created_at false",
  ]);
});

test("no rows is an empty list, not an error", async () => {
  result = { data: null, error: null };
  await expect(listActiveBreakingNews()).resolves.toEqual({ status: 200, body: { items: [] } });
});

test("a database error is a 500 with its message", async () => {
  result = { data: null, error: { message: "boom" } };
  await expect(listActiveBreakingNews()).resolves.toEqual({ status: 500, body: { error: "boom" } });
});

test("without Supabase configured: 503, and nothing is queried", async () => {
  configured = false;
  const r = await listActiveBreakingNews();
  expect(r.status).toBe(503);
  expect(calls).toEqual([]);
});

describe("the banner's language (Panel 3, M1)", () => {
  const item = (id: string, language: "en" | "hi" | null) => ({ id, text: id, is_active: true, expires_at: null, created_at: "2026-11-19T00:00:00Z", language });

  test("a reader's language: that language's items and those for both, in order", async () => {
    result = { data: [item("en-1", "en"), item("both", null), item("hi-1", "hi")], error: null };
    const hindi = await listActiveBreakingNews("hi");
    expect(hindi.body).toEqual({ items: [item("both", null), item("hi-1", "hi")] });
    result = { data: [item("en-1", "en"), item("both", null), item("hi-1", "hi")], error: null };
    const english = await listActiveBreakingNews("en");
    expect(english.body).toEqual({ items: [item("en-1", "en"), item("both", null)] });
  });

  test("before front-1 is applied: read again without the column, and every item is for both languages", async () => {
    first = { data: null, error: { message: 'column breaking_news.language does not exist', code: "42703" } };
    result = { data: [{ id: "old", text: "old", is_active: true, expires_at: null, created_at: "2026-11-01T00:00:00Z" }], error: null };
    const r = await listActiveBreakingNews("hi");
    expect(r).toEqual({ status: 200, body: { items: [{ ...item("old", null), text: "old", created_at: "2026-11-01T00:00:00Z" }] } });
    expect(calls.filter((c) => c.startsWith("select"))).toEqual([
      "select id, text, is_active, expires_at, created_at, language",
      "select id, text, is_active, expires_at, created_at",
    ]);
  });

  test("any other database error is not retried", async () => {
    first = { data: null, error: { message: "boom", code: "XX000" } };
    await expect(listActiveBreakingNews()).resolves.toEqual({ status: 500, body: { error: "boom" } });
  });
});
