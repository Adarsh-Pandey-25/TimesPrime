/**
 * @jest-environment node
 *
 * The breaking-news read shared by the reader's banner and the admin's manager: active,
 * unexpired items, newest first, and a clear status when Supabase is missing or fails.
 */

let result: { data: unknown; error: { message: string } | null } = { data: [], error: null };
let configured = true;
const calls: string[] = [];

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn(), captureException: jest.fn() }));
jest.mock("../../lib/supabase", () => {
  const chain = {
    select: (cols: string) => (calls.push(`select ${cols}`), chain),
    eq: (col: string, value: unknown) => (calls.push(`eq ${col} ${value}`), chain),
    or: (filter: string) => (calls.push(`or ${filter.split(",")[0]}`), chain),
    order: (col: string, opts: { ascending: boolean }) => (calls.push(`order ${col} ${opts.ascending}`), Promise.resolve(result)),
  };
  return {
    supabase: { from: (table: string) => (calls.push(`from ${table}`), chain) },
    isSupabaseConfigured: () => configured,
  };
});

import { listActiveBreakingNews } from "./breakingNews";

beforeEach(() => {
  result = { data: [], error: null };
  configured = true;
  calls.length = 0;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

test("reads active, unexpired items, newest first", async () => {
  const item = { id: "b-1", text: "Flood alert", is_active: true, expires_at: null, created_at: "2026-11-04T00:00:00Z" };
  result = { data: [item], error: null };
  await expect(listActiveBreakingNews()).resolves.toEqual({ status: 200, body: { items: [item] } });
  expect(calls).toEqual([
    "from breaking_news",
    "select id, text, is_active, expires_at, created_at",
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
