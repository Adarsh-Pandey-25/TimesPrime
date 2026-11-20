/**
 * @jest-environment node
 *
 * The pinned row's JSON (Panel 3, M2): public, for a Hindi reader's browser. It asks for the page
 * the query names, and a failure answers an empty row, never the page's error.
 */

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@timesprime/server/services/front/pins", () => ({ pinnedStories: jest.fn() }));

import { NextRequest } from "next/server";
import { GET } from "./route";

const { pinnedStories } = jest.requireMock("@timesprime/server/services/front/pins") as { pinnedStories: jest.Mock };
const get = (query = "") => GET(new NextRequest(`http://localhost/api/news/pins${query}`));

beforeEach(() => {
  pinnedStories.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test("the page the query names: a language, and a section or none for the home page", async () => {
  const pins = [{ slot: 1, path: "/hi/sports/final-7", headline: "फाइनल" }];
  pinnedStories.mockResolvedValue(pins);
  const res = await get("?language=hi&section=sports");
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ pins });
  expect(pinnedStories).toHaveBeenCalledWith({ language: "hi", section: "sports" });
  await get("?language=hi");
  expect(pinnedStories).toHaveBeenLastCalledWith({ language: "hi", section: null });
  await get();
  expect(pinnedStories).toHaveBeenLastCalledWith({ language: "en", section: null });
});

test("another language or an unknown section is 400, and nothing is read", async () => {
  for (const query of ["?language=fr", "?language=hi&section=politics"]) expect((await get(query)).status).toBe(400);
  expect(pinnedStories).not.toHaveBeenCalled();
});

test("a failed read answers 503 with no pins", async () => {
  pinnedStories.mockRejectedValue(new Error("timeout"));
  const res = await get("?language=hi");
  expect(res.status).toBe(503);
  expect((await res.json()).pins).toEqual([]);
});
