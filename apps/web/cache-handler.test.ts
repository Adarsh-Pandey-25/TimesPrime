/**
 * @jest-environment node
 *
 * The shared Next.js cache handler (cache-handler.mjs, R1-02). Upstash is never configured
 * locally, so @upstash/redis is mocked with one store that every module load shares: each
 * jest.resetModules() load is one more server instance pointed at the same Redis.
 */

import fs from "fs";
import os from "os";
import path from "path";

const mockStore = new Map<string, string>();
const mockHashes = new Map<string, Map<string, string>>();
const mockFail = { get: false, set: false, hang: false };
const mockCalls: { set: Array<{ key: string; ex?: number }> } = { set: [] };

jest.mock("@upstash/redis", () => ({
  Redis: jest.fn(() => ({
    get: async (key: string) => {
      if (mockFail.hang) return new Promise(() => {});
      if (mockFail.get) throw new Error("connection reset");
      return mockStore.get(key) ?? null;
    },
    set: async (key: string, value: string, opts?: { ex?: number }) => {
      if (mockFail.set) throw new Error("connection reset");
      mockCalls.set.push({ key, ex: opts?.ex });
      mockStore.set(key, value);
      return "OK";
    },
    del: async (key: string) => (mockStore.delete(key) ? 1 : 0),
    hset: async (key: string, fields: Record<string, number>) => {
      const hash = mockHashes.get(key) ?? new Map<string, string>();
      for (const [f, v] of Object.entries(fields)) hash.set(f, String(v));
      mockHashes.set(key, hash);
      return Object.keys(fields).length;
    },
    hmget: async (key: string, ...fields: string[]) => {
      const hash = mockHashes.get(key);
      return hash ? Object.fromEntries(fields.map((f) => [f, hash.get(f) ?? null])) : null;
    },
  })),
}));

type HandlerModule = typeof import("./cache-handler.mjs");
type Handler = InstanceType<HandlerModule["default"]>;
const env = { ...process.env };

/** A build folder whose runtime config names a deployment, as `next build` writes it. */
function buildDir(deploymentId: string): string {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "next-dist-"));
  fs.writeFileSync(path.join(dist, "required-server-files.json"), JSON.stringify({ config: { deploymentId } }));
  fs.mkdirSync(path.join(dist, "server"));
  return path.join(dist, "server");
}

async function instance(opts: { redis: boolean; deploymentId?: string }): Promise<{ handler: Handler; mod: HandlerModule }> {
  jest.resetModules();
  if (opts.redis) {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  } else {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  const mod = (await import("./cache-handler.mjs")) as HandlerModule;
  const Handler = mod.default;
  return { mod, handler: new Handler({ serverDistDir: buildDir(opts.deploymentId ?? "deploy-1") }) };
}

const fetchEntry = (body: string) => ({
  kind: "FETCH",
  data: { headers: {}, body, status: 200, url: "https://newsdata.io/api/1/latest" },
  revalidate: 900,
});
const pageEntry = () => ({
  kind: "APP_PAGE",
  html: "<html></html>",
  rscData: Buffer.from("rsc payload"),
  segmentData: new Map([["/_tree", Buffer.from("tree")]]),
  headers: { "x-next-cache-tags": "_N_T_/layout,articles" },
  status: 200,
});

let warn: jest.SpyInstance;
beforeEach(() => {
  mockStore.clear();
  mockHashes.clear();
  mockCalls.set = [];
  Object.assign(mockFail, { get: false, set: false, hang: false });
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  process.env = { ...env };
});

describe("serialize", () => {
  test("Buffer and Map values survive the round trip, nested inside an entry", async () => {
    const { mod } = await instance({ redis: false });
    const back = mod.deserialize(mod.serialize({ value: pageEntry(), n: 1, s: "x" }));
    expect(Buffer.isBuffer(back.value.rscData)).toBe(true);
    expect(back.value.rscData.toString()).toBe("rsc payload");
    expect(back.value.segmentData).toBeInstanceOf(Map);
    expect(back.value.segmentData.get("/_tree").toString()).toBe("tree");
    expect(back).toMatchObject({ n: 1, s: "x" });
  });
});

describe("two instances, one Redis", () => {
  test("a fetch one instance cached is a hit on the other: the upstream is called once", async () => {
    const a = (await instance({ redis: true })).handler;
    await a.set("k1", fetchEntry("feed"), { fetchCache: true, tags: [] });
    const b = (await instance({ redis: true })).handler;
    const hit = await b.get("k1", { kind: "FETCH", tags: [] });
    expect(hit?.value).toEqual(fetchEntry("feed"));
    expect(typeof hit?.lastModified).toBe("number");
  });

  test("fetch entries are shared across deployments; page entries are not", async () => {
    const a = (await instance({ redis: true, deploymentId: "deploy-1" })).handler;
    await a.set("k1", fetchEntry("feed"), { fetchCache: true, tags: [] });
    await a.set("/about", pageEntry(), { cacheControl: { revalidate: false } });
    const next = (await instance({ redis: true, deploymentId: "deploy-2" })).handler;
    expect(await next.get("k1", { kind: "FETCH", tags: [] })).not.toBeNull();
    expect(await next.get("/about", { kind: "APP_PAGE" })).toBeNull();
    const same = (await instance({ redis: true, deploymentId: "deploy-1" })).handler;
    const page = await same.get("/about", { kind: "APP_PAGE" });
    expect(Buffer.isBuffer(page?.value.rscData)).toBe(true);
    expect(page?.cacheControl).toEqual({ revalidate: false });
  });

  test("revalidateTag on one instance invalidates the entry on the other", async () => {
    jest.useFakeTimers({ now: Date.parse("2026-11-04T10:00:00Z") });
    const a = (await instance({ redis: true })).handler;
    await a.set("/about", pageEntry(), { cacheControl: { revalidate: 60 } });
    jest.setSystemTime(Date.parse("2026-11-04T10:01:00Z"));
    await a.revalidateTag("articles");
    const b = (await instance({ redis: true })).handler;
    expect(await b.get("/about", { kind: "APP_PAGE" })).toBeNull();
  });

  test("every key expires: twice the revalidate window, at least a minute, at most a day", async () => {
    const { handler } = await instance({ redis: true });
    await handler.set("k1", fetchEntry("feed"), { fetchCache: true, tags: [] });
    await handler.set("/about", pageEntry(), { cacheControl: { revalidate: false } });
    await handler.set("/fast", pageEntry(), { cacheControl: { revalidate: 5 } });
    expect(mockCalls.set.map((c) => c.ex)).toEqual([1800, 86400, 60]);
  });

  test("set(key, null) removes the entry", async () => {
    const { handler } = await instance({ redis: true });
    await handler.set("k1", fetchEntry("feed"), { fetchCache: true, tags: [] });
    await handler.set("k1", null, { fetchCache: true });
    expect(mockStore.size).toBe(0);
  });
});

describe("when Redis fails", () => {
  test("a failed read is a miss and a failed write is dropped: the page still renders", async () => {
    const { handler } = await instance({ redis: true });
    mockFail.set = true;
    await expect(handler.set("k1", fetchEntry("feed"), { fetchCache: true, tags: [] })).resolves.toBeUndefined();
    mockFail.get = true;
    await expect(handler.get("k1", { kind: "FETCH", tags: [] })).resolves.toBeNull();
    // One warning a minute at most, however many calls fail.
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test("a read that hangs is a miss after one second, not a stuck request", async () => {
    jest.useFakeTimers();
    const { handler } = await instance({ redis: true });
    mockFail.hang = true;
    const pending = handler.get("k1", { kind: "FETCH", tags: [] });
    jest.advanceTimersByTime(1_000);
    await expect(pending).resolves.toBeNull();
  });
});

describe("without Upstash", () => {
  test("one process keeps a bounded in-memory cache", async () => {
    const { handler } = await instance({ redis: false });
    await handler.set("k1", fetchEntry("feed"), { fetchCache: true, tags: [] });
    expect((await handler.get("k1", { kind: "FETCH", tags: [] }))?.value).toEqual(fetchEntry("feed"));
    for (let i = 0; i < 600; i++) await handler.set(`k${i + 2}`, fetchEntry(String(i)), { fetchCache: true, tags: [] });
    expect(await handler.get("k1", { kind: "FETCH", tags: [] })).toBeNull();
  });
});

describe("the build's scope", () => {
  test("falls back to the build ID when the runtime config names no deployment", async () => {
    const { mod } = await instance({ redis: false });
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), "next-dist-"));
    fs.writeFileSync(path.join(dist, "BUILD_ID"), "build-abc\n");
    fs.mkdirSync(path.join(dist, "server"));
    expect(new mod.default({ serverDistDir: path.join(dist, "server") }).scope).toBe("build-abc");
  });
});
