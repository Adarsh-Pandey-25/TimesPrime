import "server-only";

import { supabase, isSupabaseConfigured } from "@/backend/lib/supabase";
import { cache } from "@/backend/lib/cache";
import { reportFallback } from "@/backend/lib/reportFallback";

/**
 * Dependency health behind /api/health (public: overall status only) and
 * /api/admin/health (admin session: per-dependency detail). Owner decision D4.
 *
 * Required: Supabase, the store every read and write depends on — its silent
 * failure is exactly what F-002 was — and the NewsData.io key, without which
 * the feed serves built-in mock articles. Optional: Upstash Redis (the cache
 * falls back to memory when it is not configured, but a configured Redis that
 * fails is degraded) and the Anthropic key (only the chat panel needs it).
 *
 * `ok` means "not degrading the app": an optional dependency that is not
 * configured is ok. `error` is a short code (ENOTFOUND, PGRST301, timeout…),
 * never an error message, hostname or key, even here.
 *
 * NewsData.io and Anthropic are checked for configuration only: a live call
 * would spend API quota on every probe.
 *
 * One result is shared for HEALTH_CACHE_MS, and concurrent callers share the
 * same in-flight check, so the public endpoint cannot be used to multiply
 * load on Supabase.
 */

export interface DependencyHealth {
  configured: boolean;
  ok: boolean;
  error?: string;
  latencyMs?: number;
}

export interface HealthReport {
  status: "ok" | "degraded";
  checkedAt: string;
  dependencies: {
    supabase: DependencyHealth;
    redis: DependencyHealth;
    newsdata: DependencyHealth;
    anthropic: DependencyHealth;
  };
}

export const SUPABASE_TIMEOUT_MS = 3000;
export const HEALTH_CACHE_MS = 15_000;

let memo: { at: number; report: Promise<HealthReport> } | null = null;

const SAFE_CODE = /^[A-Za-z0-9_-]{1,32}$/;

/** Reduces an error to a short code. Never returns a message, host or key. */
function errorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; name?: unknown; message?: unknown; cause?: { code?: unknown } };
    if (typeof e.cause?.code === "string" && SAFE_CODE.test(e.cause.code)) return e.cause.code;
    if (typeof e.code === "string" && SAFE_CODE.test(e.code)) return e.code;
    if (e.name === "AbortError" || e.name === "TimeoutError") return "timeout";
    if (typeof e.message === "string" && /abort/i.test(e.message)) return "timeout";
    if (typeof e.message === "string" && /fetch failed/i.test(e.message)) return "fetch-failed";
  }
  return "error";
}

async function checkSupabase(): Promise<DependencyHealth> {
  if (!isSupabaseConfigured()) return { configured: false, ok: false, error: "not-configured" };
  const started = Date.now();
  try {
    const { error } = await supabase
      .from("articles")
      .select("id", { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(SUPABASE_TIMEOUT_MS));
    const latencyMs = Date.now() - started;
    return error ? { configured: true, ok: false, error: errorCode(error), latencyMs } : { configured: true, ok: true, latencyMs };
  } catch (err) {
    return { configured: true, ok: false, error: errorCode(err), latencyMs: Date.now() - started };
  }
}

async function checkRedis(): Promise<DependencyHealth> {
  const started = Date.now();
  const result = await cache.ping();
  if (result === "not-configured") return { configured: false, ok: true };
  const latencyMs = Date.now() - started;
  return result === "ok" ? { configured: true, ok: true, latencyMs } : { configured: true, ok: false, error: "ping-failed", latencyMs };
}

function checkKey(name: string, required: boolean): DependencyHealth {
  const configured = !!process.env[name];
  if (configured) return { configured: true, ok: true };
  return required ? { configured: false, ok: false, error: "not-configured" } : { configured: false, ok: true };
}

async function runChecks(): Promise<HealthReport> {
  const [supabaseHealth, redisHealth] = await Promise.all([checkSupabase(), checkRedis()]);
  const dependencies = {
    supabase: supabaseHealth,
    redis: redisHealth,
    newsdata: checkKey("NEWSDATA_API_KEY", true),
    anthropic: checkKey("ANTHROPIC_API_KEY", false),
  };
  const degraded = Object.values(dependencies).some((d) => !d.ok);
  return { status: degraded ? "degraded" : "ok", checkedAt: new Date().toISOString(), dependencies };
}

export function getHealth(): Promise<HealthReport> {
  const now = Date.now();
  if (memo && now - memo.at < HEALTH_CACHE_MS) return memo.report;
  memo = { at: now, report: runChecks() };
  return memo.report;
}

/**
 * Owner decision D5: called when a feed request was not answered from the
 * cache or Supabase. Reports a fallback only if Supabase is actually down —
 * a stale table, a search or a page request reaching NewsData.io is normal
 * and stays quiet. Uses the shared health result, so it adds no load.
 */
export async function reportSupabaseFallback(context: { category: string; language: string }): Promise<boolean> {
  const { dependencies } = await getHealth();
  if (dependencies.supabase.ok) return false;
  return reportFallback("supabase->newsdata", { error: dependencies.supabase.error ?? "error", ...context });
}
