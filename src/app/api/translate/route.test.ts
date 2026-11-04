/**
 * @jest-environment node
 *
 * POST /api/translate. F-010: it took any number of strings of any length
 * and passed them all to the unofficial Google endpoint. The caps follow what
 * the article page actually sends: [title, description, ...paragraphs], where
 * the scraper caps the paragraphs at 5,000 characters in total.
 */

jest.mock("@sentry/nextjs", () => ({ captureException: jest.fn() }));
jest.mock("@/server/services/translate/googleTranslate", () => ({
  translateBatch: jest.fn((texts: string[]) => Promise.resolve(texts.map((t) => `hi:${t}`))),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const { translateBatch } = jest.requireMock("@/server/services/translate/googleTranslate") as { translateBatch: jest.Mock };

let ip = 0;
const post = (body: unknown, raw = false) =>
  POST(
    new NextRequest("http://localhost:3000/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${++ip}` },
      body: raw ? (body as string) : JSON.stringify(body),
    })
  );

beforeEach(() => translateBatch.mockClear());

describe("POST /api/translate — unchanged behaviour", () => {
  test("translates a batch, in order", async () => {
    const res = await post({ texts: ["Title", "Description", "Paragraph"], target: "hi" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ translated: ["hi:Title", "hi:Description", "hi:Paragraph"] });
  });

  test("the article page's largest real request passes: 2 + 48 items, 5,000 characters of content", async () => {
    const paragraphs = Array.from({ length: 48 }, () => "x".repeat(100));
    paragraphs[0] = "x".repeat(200);
    const res = await post({ texts: ["A title of ordinary length", "x".repeat(1000), ...paragraphs], target: "hi" });
    expect(res.status).toBe(200);
  });

  test.each([
    [{ texts: [], target: "hi" }, "an empty array"],
    [{ texts: ["a", 1], target: "hi" }, "a non-string item"],
    [{ texts: ["a"], target: "fr" }, "an unsupported target"],
  ])("rejects %j (%s) with 400", async (body) => {
    expect((await post(body)).status).toBe(400);
  });

  test("rejects a body that is not JSON with 400", async () => {
    expect((await post("{not json", true)).status).toBe(400);
  });
});

describe("POST /api/translate — input caps (F-010)", () => {
  test("more than 50 items: 400, nothing translated", async () => {
    const res = await post({ texts: Array.from({ length: 51 }, () => "x"), target: "hi" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/50/);
    expect(translateBatch).not.toHaveBeenCalled();
  });

  test("an item over 5,000 characters: 400", async () => {
    const res = await post({ texts: ["x".repeat(5001)], target: "hi" });
    expect(res.status).toBe(400);
    expect(translateBatch).not.toHaveBeenCalled();
  });

  test("more than 10,000 characters in total: 400", async () => {
    const res = await post({ texts: ["x".repeat(5000), "x".repeat(5000), "x"], target: "hi" });
    expect(res.status).toBe(400);
    expect(translateBatch).not.toHaveBeenCalled();
  });

  test("a body over 64 KB: 413 with a JSON error, before parsing", async () => {
    const res = await post(JSON.stringify({ texts: ["x"], target: "hi", pad: "x".repeat(70_000) }), true);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/too large/i);
    expect(translateBatch).not.toHaveBeenCalled();
  });
});

describe("POST /api/translate — rate limit", () => {
  test("the 11th request in a minute is 429 with Retry-After", async () => {
    const send = () =>
      POST(
        new NextRequest("http://localhost:3000/api/translate", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "10.1.9.9" },
          body: JSON.stringify({ texts: ["a"], target: "hi" }),
        })
      );
    for (let i = 0; i < 10; i++) expect((await send()).status).toBe(200);
    const res = await send();
    expect(res.status).toBe(429);
    const retryAfter = Number(res.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });
});
