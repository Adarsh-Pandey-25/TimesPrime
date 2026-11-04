/**
 * @jest-environment node
 *
 * The in-memory rate limiter used by /api/chat and /api/translate. F-020: its
 * map kept a key for every client ever seen and never deleted one.
 */

import { getClientIp, isRateLimited, trackedKeyCount } from "./rateLimit";

let clock = Date.parse("2026-11-02T00:00:00Z");

beforeEach(() => {
  jest.useFakeTimers();
  clock += 24 * 60 * 60 * 1000; // a fresh day: every earlier key is long stale
  jest.setSystemTime(clock);
});

afterEach(() => jest.useRealTimers());

let n = 0;
const freshKey = () => `test-key-${++n}`;

describe("isRateLimited — unchanged behaviour", () => {
  test("10 requests a minute pass, the 11th is limited", () => {
    const key = freshKey();
    for (let i = 0; i < 10; i++) expect(isRateLimited(key)).toBe(false);
    expect(isRateLimited(key)).toBe(true);
  });

  test("the window slides: a minute later the key passes again", () => {
    const key = freshKey();
    for (let i = 0; i < 11; i++) isRateLimited(key);
    jest.setSystemTime(clock + 60_000);
    expect(isRateLimited(key)).toBe(false);
  });

  test("keys are independent", () => {
    const a = freshKey();
    for (let i = 0; i < 11; i++) isRateLimited(a);
    expect(isRateLimited(freshKey())).toBe(false);
  });
});

describe("isRateLimited — stale keys are evicted (F-020)", () => {
  test("keys idle for longer than the window are dropped", () => {
    for (let i = 0; i < 1000; i++) isRateLimited(freshKey());
    expect(trackedKeyCount()).toBeGreaterThanOrEqual(1000);
    jest.setSystemTime(clock + 61_000);
    isRateLimited(freshKey());
    expect(trackedKeyCount()).toBe(1);
  });

  test("a key still inside its window keeps its count through a sweep", () => {
    const busy = freshKey();
    for (let i = 0; i < 10; i++) isRateLimited(busy);
    jest.setSystemTime(clock + 30_000);
    for (let i = 0; i < 500; i++) isRateLimited(freshKey());
    jest.setSystemTime(clock + 59_000);
    expect(isRateLimited(busy)).toBe(true);
  });

  test("the map never holds more than 10,000 keys, even inside one window", () => {
    for (let i = 0; i < 12_000; i++) isRateLimited(freshKey());
    expect(trackedKeyCount()).toBeLessThanOrEqual(10_000);
  });
});

// R1-05: the client is the entry TRUSTED_PROXY_HOPS from the right. It used to be the leftmost,
// which the client writes itself; the first test below pinned that and changed on purpose.
describe("getClientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://localhost/", { headers });
  const env = process.env.TRUSTED_PROXY_HOPS;
  afterEach(() => {
    if (env === undefined) delete process.env.TRUSTED_PROXY_HOPS;
    else process.env.TRUSTED_PROXY_HOPS = env;
  });

  test("no proxy (hops unset): the rightmost entry, the socket's; then X-Real-IP, then unknown", () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("10.0.0.1");
    expect(getClientIp(req({ "x-forwarded-for": "127.0.0.1" }))).toBe("127.0.0.1");
    expect(getClientIp(req({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(getClientIp(req({}))).toBe("unknown");
  });

  test("on AWS (2 hops): the viewer CloudFront appended, whatever the client wrote before it", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    // viewer 198.51.100.4 via CloudFront edge 130.176.0.9, then the ALB
    expect(getClientIp(req({ "x-forwarded-for": "198.51.100.4, 130.176.0.9" }))).toBe("198.51.100.4");
    // a client that sends its own header to dodge a limit or forge the audit log's IP
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 198.51.100.4, 130.176.0.9" }))).toBe("198.51.100.4");
  });

  test("fewer entries than hops: the leftmost, which a trusted hop wrote", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(getClientIp(req({ "x-forwarded-for": "10.0.1.20" }))).toBe("10.0.1.20");
  });

  test("a hops value that is not a whole number counts as 0", () => {
    for (const bad of ["two", "-1", "1.5", ""]) {
      process.env.TRUSTED_PROXY_HOPS = bad;
      expect(getClientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("10.0.0.1");
    }
  });
});
