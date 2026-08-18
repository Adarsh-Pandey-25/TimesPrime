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

const memoryStore = new Map<string, MemoryCacheEntry<unknown>>();

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
  memoryStore.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
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
};

export const CACHE_TTL_NEWS_SECONDS = 15 * 60; // 15 minutes — top-headlines route
export const CACHE_TTL_SCRAPE_SECONDS = 60 * 60; // 1 hour — scrape-article route
