/**
 * @jest-environment node
 *
 * The audit row's request ID (R1-05, E-03): CloudFront's for the reader site, Nginx's for the
 * back office, else a UUID.
 */

import { getRequestId } from "./requestId";

const req = (headers: Record<string, string>) => new Request("http://localhost/", { headers });

test("CloudFront's X-Amz-Cf-Id first: its access and WAF logs carry the same ID", () => {
  expect(getRequestId(req({ "x-amz-cf-id": "cf-1", "x-request-id": "ngx-1" }))).toBe("cf-1");
});

test("then Nginx's X-Request-Id: the back office does not go through CloudFront", () => {
  expect(getRequestId(req({ "x-request-id": "0f3c9a5e1b2d4c6e8a9b0c1d2e3f4a5b" }))).toBe(
    "0f3c9a5e1b2d4c6e8a9b0c1d2e3f4a5b"
  );
});

test("then a random UUID; the ALB's X-Amzn-Trace-Id and Vercel's x-vercel-id are no longer read", () => {
  const cases: Record<string, string>[] = [{ "x-amzn-trace-id": "Root=1-abc" }, { "x-vercel-id": "bom1::abc" }];
  for (const headers of cases) {
    const id = getRequestId(req(headers));
    expect(Object.values(headers)).not.toContain(id);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  }
});
