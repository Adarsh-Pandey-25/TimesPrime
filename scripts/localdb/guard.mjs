// The guard every local run passes (dev:local, start:local, test:db, test:e2e): it refuses any
// database that is not the local Supabase stack. `.env.local` may point at production, so nothing
// that writes may ever run against what it names (CLAUDE.md, "Deployment"). This file never reads
// `.env.local`; it judges only the values the launcher is about to use, from `.env.localdb`.
//
// It prints a host and a verdict, never a key.

import path from "path";
import { fileURLToPath } from "url";

// The project `.env.local` names (HANDOFF §11). Refused by name even before the general rule below.
export const KNOWN_PRODUCTION_REFS = ["yhjotyxrdaqtcgsxigok"];
// Option B (a separate hosted dev project) would list its ref here. Option A is in use: empty.
export const ALLOWED_DEV_REFS = [];
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** Is this URL (API or Postgres) the local stack? Returns { ok, host, reason }. */
export function checkTarget(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return { ok: false, host: "(none)", reason: "no URL is set" };
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, host: "(unparseable)", reason: "the URL cannot be parsed" };
  }
  const host = url.hostname.toLowerCase();
  if (KNOWN_PRODUCTION_REFS.some((ref) => host.includes(ref))) {
    return { ok: false, host, reason: "this is the project .env.local names, which may be production" };
  }
  if (LOCAL_HOSTS.has(host)) return { ok: true, host, reason: "the local stack" };
  const ref = host.endsWith(".supabase.co") ? host.split(".")[0] : null;
  if (ref && ALLOWED_DEV_REFS.includes(ref)) return { ok: true, host, reason: "an allowlisted dev project" };
  return { ok: false, host, reason: ref ? "a hosted Supabase project that is not allowlisted" : "not a local address" };
}

/** Checks the Supabase API URL and, when set, the Postgres URL. Returns the first refusal, or ok. */
export function checkEnv(env) {
  const targets = [["NEXT_PUBLIC_SUPABASE_URL", env.NEXT_PUBLIC_SUPABASE_URL]];
  if (env.LOCAL_DB_URL !== undefined) targets.push(["LOCAL_DB_URL", env.LOCAL_DB_URL]);
  for (const [name, value] of targets) {
    const verdict = checkTarget(value);
    if (!verdict.ok) return { ok: false, message: `REFUSED: ${name} -> ${verdict.host}: ${verdict.reason}.` };
  }
  return { ok: true, message: `ok: ${targets.map(([name, value]) => `${name} -> ${checkTarget(value).host}`).join(", ")} (local)` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const verdict = checkTarget(process.argv[2]);
  console.log(`${verdict.ok ? "ok" : "REFUSED"}: ${verdict.host}: ${verdict.reason}`);
  process.exit(verdict.ok ? 0 : 1);
}
