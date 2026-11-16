// @ts-check
// The reader site's Next.js cache handler (R1-02): every instance reads and writes one cache, in
// the existing Upstash Redis, instead of each keeping its own on local disk.
//
// Why it matters here: the home page's server render (fetchInitialNews) and the feed route call
// NewsData with `next: { revalidate: 900 }`. Next's default cache is per instance (bundled docs:
// guides/self-hosting.md "Configuring Caching"), so two ECS tasks would each call NewsData for the
// same feed every 15 minutes, and the quota spent would rise with the task count. One shared cache
// keeps it at one call per feed per window, however many tasks run. (Tailwind reads every word in
// this folder as a possible class name: comments here avoid the names of utility classes.)
//
// Next loads this file at run time from disk (it is traced into the standalone output, not
// bundled), so it is plain JavaScript. The contract is next-config-js/incrementalCacheHandlerPath.md:
// a class with get, set, revalidateTag and resetRequestCache. What a shared handler must do, per
// self-hosting.md, and where it is done here:
//   - store entries where every instance can reach them: Redis (`redis`);
//   - bound the store: every key has a TTL (`ttlSeconds`);
//   - serialize Buffer and Map values, which JSON cannot carry (`serialize`, `deserialize`);
//   - index entries by tag in the shared store (`TAGS_KEY`), so a revalidateTag on one instance
//     reaches all of them (the app calls none today; the handler is ready for it);
//   - survive storage errors: a failed or slow read is a miss, a failed write is dropped, and the
//     page renders either way (`withTimeout`, `reportOnce`).
// And one rule of this app's own: no entry may hold the NewsData API key (R1-02b, `holdsSecret`).
//
// Without UPSTASH_REDIS_REST_URL and _TOKEN (local runs, tests, the e2e builds) it keeps a bounded
// in-process Map, like packages/server/src/lib/cache.ts: one process, so nothing is lost.

import fs from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";

const PREFIX = "next-cache:";
const TAGS_KEY = `${PREFIX}tags`;
const TIMEOUT_MS = 1_000;
const MAX_TTL_SECONDS = 24 * 60 * 60;
const MEMORY_MAX_ENTRIES = 500;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
// Values are stored as the strings `serialize` writes; the client must not parse them itself.
const redis = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;

/** @type {Map<string, string>} insertion order is recency order, as in lib/cache.ts */
const memory = new Map();
/** @type {Map<string, number>} */
const memoryTags = new Map();

let lastReport = 0;
/** One line a minute at most, so a Redis outage cannot flood the logs. */
function reportOnce(/** @type {string} */ what, /** @type {unknown} */ err) {
  const now = Date.now();
  if (now - lastReport < 60_000) return;
  lastReport = now;
  console.warn(`cache-handler: ${what} failed, serving without the shared cache:`, err instanceof Error ? err.message : err);
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
function withTimeout(promise) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** JSON with Buffer (as base64) and Map (as entries), which entries hold: rscData, segmentData. */
export function serialize(/** @type {unknown} */ value) {
  return JSON.stringify(value, function (key, json) {
    // `this[key]` is the value before Buffer's own toJSON turns it into an array of bytes.
    const original = this[key];
    if (Buffer.isBuffer(original)) return { $buffer: original.toString("base64") };
    if (original instanceof Map) return { $map: [...original.entries()] };
    return json;
  });
}

export function deserialize(/** @type {string} */ text) {
  return JSON.parse(text, (_key, value) => {
    if (value && typeof value === "object") {
      if (typeof value.$buffer === "string") return Buffer.from(value.$buffer, "base64");
      if (Array.isArray(value.$map)) return new Map(value.$map);
    }
    return value;
  });
}

/**
 * True if the serialized entry holds the NewsData API key (R1-02b). A fetch entry stores its
 * request URL, and the key used to travel in it as the apikey query parameter. The callers now
 * send it in the X-ACCESS-KEY header (newsDataInit in packages/server/src/services/news/newsdata.ts);
 * this refuses any entry that would still carry it, whoever builds the request, so the key never
 * reaches Upstash.
 */
export function holdsSecret(/** @type {string} */ text) {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return false;
  return text.includes(key) || text.includes(encodeURIComponent(key));
}

/** The tags an entry is invalidated by: a fetch carries them in ctx, a response in a header. */
function tagsOf(/** @type {any} */ data, /** @type {any} */ ctx) {
  if (data?.kind === "FETCH") return Array.isArray(ctx?.tags) ? ctx.tags : [];
  const header = data?.headers?.["x-next-cache-tags"];
  return typeof header === "string" ? header.split(",").filter(Boolean) : [];
}

/** Long enough to serve stale while one instance revalidates, never longer than a day. */
export function ttlSeconds(/** @type {any} */ data, /** @type {any} */ ctx) {
  const revalidate = data?.kind === "FETCH" ? data.revalidate : ctx?.cacheControl?.revalidate;
  if (typeof revalidate !== "number" || revalidate <= 0) return MAX_TTL_SECONDS;
  return Math.min(Math.max(revalidate * 2, 60), MAX_TTL_SECONDS);
}

/**
 * Page and route entries belong to one build: a new deployment must not serve the last one's
 * HTML. Fetch entries are upstream responses and stay shared across deployments. The deployment
 * ID (NEXT_DEPLOYMENT_ID at build) is in the build's runtime config; the build ID is the fallback.
 */
function buildScope(/** @type {string | undefined} */ serverDistDir) {
  if (!serverDistDir) return "unknown";
  const distDir = path.join(serverDistDir, "..");
  try {
    const files = JSON.parse(fs.readFileSync(path.join(distDir, "required-server-files.json"), "utf8"));
    if (files?.config?.deploymentId) return String(files.config.deploymentId);
  } catch {}
  try {
    return fs.readFileSync(path.join(distDir, "BUILD_ID"), "utf8").trim();
  } catch {
    return "unknown";
  }
}

export default class CacheHandler {
  /** @param {{ serverDistDir?: string }} [options] */
  constructor(options = {}) {
    this.scope = buildScope(options.serverDistDir);
  }

  /** @param {string} key @param {any} [ctx] */
  storageKey(key, ctx) {
    return ctx?.kind === "FETCH" || ctx?.fetchCache ? `${PREFIX}fetch:${key}` : `${PREFIX}${this.scope}:${key}`;
  }

  /** @param {string} key @param {any} [ctx] */
  async get(key, ctx) {
    const storageKey = this.storageKey(key, ctx);
    try {
      const text = redis ? await withTimeout(redis.get(storageKey)) : memory.get(storageKey);
      if (typeof text !== "string") return null;
      const entry = deserialize(text);
      if (entry.tags?.length && (await this.revalidatedSince(entry.tags, entry.lastModified))) return null;
      return { value: entry.value, lastModified: entry.lastModified, cacheControl: entry.cacheControl };
    } catch (err) {
      reportOnce("get", err);
      return null;
    }
  }

  /** @param {string} key @param {any} data @param {any} [ctx] */
  async set(key, data, ctx) {
    const storageKey = this.storageKey(key, data?.kind === "FETCH" ? { kind: "FETCH" } : ctx);
    if (data === null) {
      try {
        if (redis) await withTimeout(redis.del(storageKey));
        else memory.delete(storageKey);
      } catch (err) {
        reportOnce("delete", err);
      }
      return;
    }
    const text = serialize({
      value: data,
      lastModified: Date.now(),
      tags: tagsOf(data, ctx),
      cacheControl: data?.kind === "FETCH" ? undefined : ctx?.cacheControl,
    });
    if (holdsSecret(text)) {
      reportOnce("set", new Error("an entry holding the NewsData API key was refused (R1-02b)"));
      return;
    }
    try {
      if (redis) {
        await withTimeout(redis.set(storageKey, text, { ex: ttlSeconds(data, ctx) }));
      } else {
        memory.delete(storageKey);
        memory.set(storageKey, text);
        while (memory.size > MEMORY_MAX_ENTRIES) memory.delete(/** @type {string} */ (memory.keys().next().value));
      }
    } catch (err) {
      reportOnce("set", err);
    }
  }

  /** @param {string | string[]} tags */
  async revalidateTag(tags) {
    const list = (Array.isArray(tags) ? tags : [tags]).filter(Boolean);
    if (list.length === 0) return;
    const now = Date.now();
    try {
      if (redis) await withTimeout(redis.hset(TAGS_KEY, Object.fromEntries(list.map((tag) => [tag, now]))));
      else for (const tag of list) memoryTags.set(tag, now);
    } catch (err) {
      reportOnce("revalidateTag", err);
    }
  }

  /** @param {string[]} tags @param {number} since */
  async revalidatedSince(tags, since) {
    const times = redis ? await withTimeout(redis.hmget(TAGS_KEY, ...tags)) : Object.fromEntries(tags.map((t) => [t, memoryTags.get(t)]));
    return Object.values(times ?? {}).some((at) => Number(at) > since);
  }

  // Nothing is held per request: every read goes to the shared store.
  resetRequestCache() {}
}
