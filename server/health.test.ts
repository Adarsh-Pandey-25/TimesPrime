/**
 * @jest-environment node
 */

jest.mock("@/backend/lib/supabase", () => {
  const query = { select: jest.fn(), limit: jest.fn(), abortSignal: jest.fn() };
  query.select.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return { supabase: { from: jest.fn(() => query) }, isSupabaseConfigured: jest.fn(), __query: query };
});
jest.mock("@/backend/lib/cache", () => ({ cache: { ping: jest.fn() } }));
jest.mock("@/backend/lib/reportFallback", () => ({ reportFallback: jest.fn(() => true) }));

import { getHealth, HEALTH_CACHE_MS, reportSupabaseFallback } from "./health";

const { reportFallback } = jest.requireMock("@/backend/lib/reportFallback") as { reportFallback: jest.Mock };

const supabaseMock = jest.requireMock("@/backend/lib/supabase") as {
  supabase: { from: jest.Mock };
  isSupabaseConfigured: jest.Mock;
  __query: { abortSignal: jest.Mock };
};
const cacheMock = jest.requireMock("@/backend/lib/cache") as { cache: { ping: jest.Mock } };

const saved = { NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
let clock = Date.parse("2026-10-30T00:00:00Z");

beforeEach(() => {
  jest.useFakeTimers();
  // Step well past the shared result from the previous test, including one a
  // test produced after moving the clock forward itself.
  clock += 10 * HEALTH_CACHE_MS;
  jest.setSystemTime(clock);
  supabaseMock.supabase.from.mockClear();
  supabaseMock.isSupabaseConfigured.mockReturnValue(true);
  supabaseMock.__query.abortSignal.mockResolvedValue({ error: null });
  cacheMock.cache.ping.mockResolvedValue("not-configured");
  process.env.NEWSDATA_API_KEY = "newsdata-test-key-123456";
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  jest.useRealTimers();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("getHealth", () => {
  test("is ok when every required dependency answers", async () => {
    const report = await getHealth();
    expect(report.status).toBe("ok");
    expect(report.dependencies.supabase).toMatchObject({ configured: true, ok: true });
    expect(typeof report.dependencies.supabase.latencyMs).toBe("number");
    // Optional and absent is not a failure.
    expect(report.dependencies.redis).toEqual({ configured: false, ok: true });
    expect(report.dependencies.anthropic).toEqual({ configured: false, ok: true });
  });

  test("is degraded when Supabase is unreachable, and never carries the host", async () => {
    supabaseMock.__query.abortSignal.mockResolvedValue({
      error: {
        message: "TypeError: fetch failed",
        details: "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND abcdefghijklmnop.supabase.co",
        hint: "",
        code: "",
      },
    });
    const report = await getHealth();
    expect(report.status).toBe("degraded");
    expect(report.dependencies.supabase).toMatchObject({ configured: true, ok: false, error: "fetch-failed" });
    expect(JSON.stringify(report)).not.toMatch(/supabase\.co|getaddrinfo|abcdefghijklmnop/);
  });

  test("reports a PostgREST error by its code, not its message", async () => {
    supabaseMock.__query.abortSignal.mockResolvedValue({ error: { code: "PGRST301", message: "JWT expired for user x" } });
    const report = await getHealth();
    expect(report.dependencies.supabase.error).toBe("PGRST301");
    expect(JSON.stringify(report)).not.toContain("JWT expired");
  });

  test("reduces a thrown timeout to a code", async () => {
    supabaseMock.__query.abortSignal.mockRejectedValue(Object.assign(new Error("The operation timed out."), { name: "TimeoutError" }));
    const report = await getHealth();
    expect(report.status).toBe("degraded");
    expect(report.dependencies.supabase.error).toBe("timeout");
  });

  test("is degraded, without querying, when Supabase is not configured", async () => {
    supabaseMock.isSupabaseConfigured.mockReturnValue(false);
    const report = await getHealth();
    expect(report.status).toBe("degraded");
    expect(report.dependencies.supabase).toEqual({ configured: false, ok: false, error: "not-configured" });
    expect(supabaseMock.supabase.from).not.toHaveBeenCalled();
  });

  test("is degraded when the NewsData key is missing", async () => {
    delete process.env.NEWSDATA_API_KEY;
    const report = await getHealth();
    expect(report.status).toBe("degraded");
    expect(report.dependencies.newsdata).toEqual({ configured: false, ok: false, error: "not-configured" });
  });

  test("is degraded when a configured Redis fails PING", async () => {
    cacheMock.cache.ping.mockResolvedValue("error");
    const report = await getHealth();
    expect(report.status).toBe("degraded");
    expect(report.dependencies.redis).toMatchObject({ configured: true, ok: false, error: "ping-failed" });
  });

  test("shares one result for HEALTH_CACHE_MS, then checks again", async () => {
    await getHealth();
    await getHealth();
    expect(supabaseMock.supabase.from).toHaveBeenCalledTimes(1);

    jest.setSystemTime(clock + HEALTH_CACHE_MS + 1);
    await getHealth();
    expect(supabaseMock.supabase.from).toHaveBeenCalledTimes(2);
  });

  test("reports a Supabase fallback (D5) only when Supabase is down", async () => {
    reportFallback.mockClear();
    supabaseMock.__query.abortSignal.mockResolvedValue({ error: { message: "TypeError: fetch failed", code: "" } });
    await expect(reportSupabaseFallback({ category: "general", language: "en" })).resolves.toBe(true);
    expect(reportFallback).toHaveBeenCalledWith("supabase->newsdata", { error: "fetch-failed", category: "general", language: "en" });
  });

  test("stays quiet when Supabase is healthy — a stale table or a search is not a fallback", async () => {
    reportFallback.mockClear();
    await expect(reportSupabaseFallback({ category: "general", language: "en" })).resolves.toBe(false);
    expect(reportFallback).not.toHaveBeenCalled();
  });

  test("never includes a secret value", async () => {
    process.env.NEWSDATA_API_KEY = "sentinel-newsdata-secret-123456";
    process.env.ANTHROPIC_API_KEY = "sentinel-anthropic-secret-123456";
    const report = JSON.stringify(await getHealth());
    expect(report).not.toContain("sentinel-newsdata-secret-123456");
    expect(report).not.toContain("sentinel-anthropic-secret-123456");
  });
});
