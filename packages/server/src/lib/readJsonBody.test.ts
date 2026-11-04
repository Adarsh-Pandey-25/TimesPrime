/**
 * @jest-environment node
 *
 * readJsonBody (F-010): reads a request body up to a byte limit and stops
 * reading past it, so an oversized body is refused without being buffered
 * whole, whether or not Content-Length declares it.
 */

import { readJsonBody } from "./readJsonBody";

const streamOf = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });

const request = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);

test("parses a body within the limit", async () => {
  await expect(readJsonBody(request('{"a":1}'), 100)).resolves.toEqual({ ok: true, value: { a: 1 } });
});

test("a body of exactly the limit is accepted", async () => {
  const body = JSON.stringify({ p: "x".repeat(92) }); // 100 bytes
  expect(new TextEncoder().encode(body).length).toBe(100);
  await expect(readJsonBody(request(body), 100)).resolves.toMatchObject({ ok: true });
});

test("a body one byte over is refused as too large", async () => {
  const body = JSON.stringify({ p: "x".repeat(93) }); // 101 bytes
  await expect(readJsonBody(request(body), 100)).resolves.toEqual({ ok: false, tooLarge: true });
});

test("a declared Content-Length over the limit is refused before reading", async () => {
  await expect(readJsonBody(request("{}", { "content-length": "5000" }), 100)).resolves.toEqual({ ok: false, tooLarge: true });
});

test("a streamed body with no Content-Length is cut off once it passes the limit", async () => {
  let pulled = 0;
  const endless = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled++;
      controller.enqueue(new TextEncoder().encode("x".repeat(64)));
    },
  });
  await expect(readJsonBody(request(endless), 1000)).resolves.toEqual({ ok: false, tooLarge: true });
  expect(pulled).toBeLessThan(40); // stopped near 1,000 bytes, not drained
});

test("multi-byte characters are counted in bytes, not characters", async () => {
  const body = JSON.stringify({ p: "न".repeat(40) }); // 40 characters, 120 bytes of them
  await expect(readJsonBody(request(body), 100)).resolves.toEqual({ ok: false, tooLarge: true });
});

test.each(["{not json", "", "   "])("an unparseable body %j is refused as invalid, not too large", async (body) => {
  await expect(readJsonBody(request(streamOf([body])), 100)).resolves.toEqual({ ok: false, tooLarge: false });
});
