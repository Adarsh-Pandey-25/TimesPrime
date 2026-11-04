/**
 * @jest-environment node
 *
 * The audit row's request ID on AWS (R1-05): CloudFront's, else the ALB's, else a UUID.
 */

import { getRequestId } from "./requestId";

const req = (headers: Record<string, string>) => new Request("http://localhost/", { headers });

test("CloudFront's X-Amz-Cf-Id first: its access and WAF logs carry the same ID", () => {
  expect(getRequestId(req({ "x-amz-cf-id": "cf-1", "x-amzn-trace-id": "Root=1-abc" }))).toBe("cf-1");
});

test("then the ALB's X-Amzn-Trace-Id", () => {
  expect(getRequestId(req({ "x-amzn-trace-id": "Root=1-abc" }))).toBe("Root=1-abc");
});

test("then a random UUID; Vercel's x-vercel-id is no longer read", () => {
  const id = getRequestId(req({ "x-vercel-id": "bom1::abc" }));
  expect(id).not.toBe("bom1::abc");
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
});
