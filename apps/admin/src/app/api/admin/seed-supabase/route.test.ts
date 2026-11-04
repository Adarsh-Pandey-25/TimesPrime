/**
 * @jest-environment node
 *
 * BL-029: the seed route fell back to NEXT_PUBLIC_NEWSDATA_API_KEY when
 * NEWSDATA_API_KEY was unset. A NEXT_PUBLIC_ name is inlined into any client
 * bundle that reads it, so it must never hold the key. Only NEWSDATA_API_KEY
 * is read now.
 */

jest.mock("@timesprime/server/services/news", () => ({ saveArticlesToDB: jest.fn(async () => []) }));
// The gate is tested in access.test.ts; here it lets the request through.
jest.mock("@timesprime/server/auth/requirePermission", () => ({
  requirePermission: jest.fn(async () => ({ ok: true, actor: {} })),
  beginAudit: jest.fn(async () => "attempt-1"),
  finishAudit: jest.fn(),
  auditUnavailable: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST as handler } from "./route";

const POST = () => handler(new NextRequest("http://localhost:3000/api/admin/seed-supabase", { method: "POST" }));

const saved = { key: process.env.NEWSDATA_API_KEY, publicKey: process.env.NEXT_PUBLIC_NEWSDATA_API_KEY };

beforeEach(() => {
  delete process.env.NEWSDATA_API_KEY;
  delete process.env.NEXT_PUBLIC_NEWSDATA_API_KEY;
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 })) as typeof fetch;
});

afterAll(() => {
  if (saved.key === undefined) delete process.env.NEWSDATA_API_KEY;
  else process.env.NEWSDATA_API_KEY = saved.key;
  if (saved.publicKey === undefined) delete process.env.NEXT_PUBLIC_NEWSDATA_API_KEY;
  else process.env.NEXT_PUBLIC_NEWSDATA_API_KEY = saved.publicKey;
});

test("the public-prefixed key alone is not used: 500, and NewsData.io is never called", async () => {
  process.env.NEXT_PUBLIC_NEWSDATA_API_KEY = "public-prefixed-key";
  const res = await POST();
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ status: "error", message: "NEWSDATA_API_KEY is not configured on the server." });
  expect(global.fetch).not.toHaveBeenCalled();
});

test("NEWSDATA_API_KEY is the key sent to NewsData.io", async () => {
  process.env.NEWSDATA_API_KEY = "server-key";
  process.env.NEXT_PUBLIC_NEWSDATA_API_KEY = "public-prefixed-key";
  await POST();
  const urls = (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url));
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((url) => url.includes("apikey=server-key") && !url.includes("public-prefixed-key"))).toBe(true);
});
