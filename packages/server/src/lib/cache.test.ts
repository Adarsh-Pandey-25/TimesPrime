/**
 * @jest-environment node
 *
 * The in-memory fallback of the shared cache, used whenever Upstash is not
 * configured (as in tests and local dev). BL-013 / audit N-03: an expired
 * entry was removed only when its key was read again, so keys that are never
 * re-read — every distinct scraped URL, every search — piled up.
 */

import { cache, memoryEntryCount } from "./cache";

let clock = Date.parse("2026-11-02T00:00:00Z");

beforeEach(() => {
  jest.useFakeTimers();
  clock += 24 * 60 * 60 * 1000; // a fresh day: every earlier entry has expired
  jest.setSystemTime(clock);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

let n = 0;
const freshKey = () => `scrape:https://publisher.example/story-${++n}`;

describe("memory cache — unchanged behaviour", () => {
  test("a value is returned until its TTL passes, then null", async () => {
    const key = freshKey();
    await cache.set(key, { title: "t" }, 60);
    await expect(cache.get(key)).resolves.toEqual({ title: "t" });
    jest.setSystemTime(clock + 61_000);
    await expect(cache.get(key)).resolves.toBeNull();
  });

  test("ping reports not-configured without Upstash", async () => {
    await expect(cache.ping()).resolves.toBe("not-configured");
  });
});

describe("memory cache — expired entries are evicted without being read (BL-013)", () => {
  test("entries that expired and were never read again are dropped", async () => {
    for (let i = 0; i < 1000; i++) await cache.set(freshKey(), { i }, 60);
    jest.setSystemTime(clock + 2 * 60_000);
    await cache.set(freshKey(), { last: true }, 60);
    expect(memoryEntryCount()).toBe(1);
  });

  test("an entry still inside its TTL survives the sweep", async () => {
    const keep = freshKey();
    await cache.set(keep, { keep: true }, 3600);
    for (let i = 0; i < 100; i++) await cache.set(freshKey(), { i }, 60);
    jest.setSystemTime(clock + 2 * 60_000);
    await cache.set(freshKey(), { last: true }, 60);
    await expect(cache.get(keep)).resolves.toEqual({ keep: true });
  });

  test("the store never holds more than 1,000 entries", async () => {
    for (let i = 0; i < 1500; i++) await cache.set(freshKey(), { i }, 3600);
    expect(memoryEntryCount()).toBeLessThanOrEqual(1000);
  });
});
