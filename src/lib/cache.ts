interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class SimpleMemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  get<T>(key: string, ttlMs: number): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > ttlMs;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const memoryCache = new SimpleMemoryCache();
