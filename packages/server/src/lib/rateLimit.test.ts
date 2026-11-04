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

describe("getClientIp", () => {
  const req = (headers: Record<string, string>) => new Request("http://localhost/", { headers });
  test("first X-Forwarded-For entry, then X-Real-IP, then unknown", () => {
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(getClientIp(req({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(getClientIp(req({}))).toBe("unknown");
  });
});
