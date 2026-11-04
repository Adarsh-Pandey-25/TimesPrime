import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Shared cache used by the news feed (15 min TTL) and the article scraper
 * (1 hr TTL). Backed by Upstash Redis when configured — required for
 * correctness on serverless, where each function instance would otherwise
 * have its own private in-memory cache and most requests would miss. Falls
 * back to an in-memory Map when Upstash isn't configured (e.g. local dev)
 * so nothing crashes — just degrades to per-instance caching like before.
 */

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = upstashUrl && upstashToken ? new Redis({ url: upstashUrl, token: upstashToken }) : null;

if (!redis) {
  console.warn(
    "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not configured — falling back to an " +
      "in-memory cache. Fine for local dev; on serverless this cache will NOT be shared across " +
      "function instances."
  );
}

interface MemoryCacheEntry<T> {
  data: T;
  expiresAt: number;
}

// Insertion order is recency order: a key is re-inserted on every set.
const memoryStore = new Map<string, MemoryCacheEntry<unknown>>();

// BL-013: an expired entry used to leave only when its key was read again,
// so keys never re-read (every distinct scraped URL, every search) piled up.
// Now each set sweeps expired entries at most once a minute, and the store
// holds at most MEMORY_MAX_ENTRIES, dropping the least recently set first.
const MEMORY_SWEEP_INTERVAL_MS = 60_000;
const MEMORY_MAX_ENTRIES = 1_000;
let lastMemorySweep = 0;

function sweepMemory(now: number): void {
  for (const [key, entry] of memoryStore) {
    if (now > entry.expiresAt) memoryStore.delete(key);
  }
  lastMemorySweep = now;
}

function memoryGet<T>(key: string): T | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.data as T;
}

function memorySet<T>(key: string, data: T, ttlSeconds: number): void {
  const now = Date.now();
  if (now - lastMemorySweep >= MEMORY_SWEEP_INTERVAL_MS) sweepMemory(now);
  memoryStore.delete(key);
  memoryStore.set(key, { data, expiresAt: now + ttlSeconds * 1000 });
  while (memoryStore.size > MEMORY_MAX_ENTRIES) {
    memoryStore.delete(memoryStore.keys().next().value as string);
  }
}

/** How many entries the in-memory fallback is holding. For tests. */
export function memoryEntryCount(): number {
  return memoryStore.size;
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (redis) {
      try {
        const value = await redis.get<T>(key);
        return value ?? null;
      } catch (err) {
        console.error("Upstash Redis get() failed, falling back to in-memory cache:", err);
      }
    }
    return memoryGet<T>(key);
  },

  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    if (redis) {
      try {
        await redis.set(key, data as unknown as string | number, { ex: ttlSeconds });
        return;
      } catch (err) {
        console.error("Upstash Redis set() failed, falling back to in-memory cache:", err);
      }
    }
    memorySet(key, data, ttlSeconds);
  },

  /** Health probe: "not-configured" without Upstash, otherwise whether Redis answered a PING. */
  async ping(): Promise<"ok" | "error" | "not-configured"> {
    if (!redis) return "not-configured";
    try {
      await redis.ping();
      return "ok";
    } catch {
      return "error";
    }
  },
};

export const CACHE_TTL_NEWS_SECONDS = 15 * 60; // 15 minutes — top-headlines route
export const CACHE_TTL_SCRAPE_SECONDS = 60 * 60; // 1 hour — scrape-article route
