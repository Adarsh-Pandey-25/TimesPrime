/**
 * @jest-environment node
 *
 * The homepage banner's read is public and lives on the reader site (CR-08): it answers with
 * whatever the shared read returns, and needs no session. Panel 3, M1: `?language=en|hi` asks for
 * that language's items; anything else asks for every item.
 */

jest.mock("@timesprime/server/services/news/breakingNews", () => ({ listActiveBreakingNews: jest.fn() }));

import { NextRequest } from "next/server";
import { GET } from "./route";

const { listActiveBreakingNews } = jest.requireMock("@timesprime/server/services/news/breakingNews") as {
  listActiveBreakingNews: jest.Mock;
};

const get = (query = "") => GET(new NextRequest(`http://localhost/api/news/breaking-news${query}`));

beforeEach(() => listActiveBreakingNews.mockReset());

test("answers 200 with the active items", async () => {
  const items = [{ id: "b-1", text: "Flood alert", is_active: true, expires_at: null, created_at: "2026-11-04T00:00:00Z", language: null }];
  listActiveBreakingNews.mockResolvedValue({ status: 200, body: { items } });
  const res = await get();
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ items });
});

test("passes a failure's status and message through", async () => {
  listActiveBreakingNews.mockResolvedValue({ status: 503, body: { error: "Supabase is not configured on the server." } });
  const res = await get();
  expect(res.status).toBe(503);
  await expect(res.json()).resolves.toEqual({ error: "Supabase is not configured on the server." });
});

test("asks for the reader's language when it is en or hi, and for every item otherwise", async () => {
  listActiveBreakingNews.mockResolvedValue({ status: 200, body: { items: [] } });
  await get("?language=hi");
  await get("?language=en");
  await get("?language=fr");
  await get();
  expect(listActiveBreakingNews.mock.calls).toEqual([["hi"], ["en"], [undefined], [undefined]]);
});
