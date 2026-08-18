/**
 * Recursively redacts known secret values from a Sentry event before it's
 * sent, as a defense-in-depth safety net. The primary defense is not
 * passing secrets into error contexts in the first place — this catches
 * anything that leaks in indirectly (e.g. an SDK error object that dumps
 * its own request headers).
 */

const SECRET_ENV_KEYS = ["ANTHROPIC_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEWSDATA_API_KEY"] as const;

function getSecretValues(): string[] {
  return SECRET_ENV_KEYS.map((key) => process.env[key]).filter(
    (value): value is string => typeof value === "string" && value.length >= 8
  );
}

function redactString(input: string, secrets: string[]): string {
  let out = input;
  for (const secret of secrets) {
    out = out.split(secret).join("[REDACTED]");
  }
  return out;
}

function walk(node: unknown, secrets: string[]): unknown {
  if (typeof node === "string") return redactString(node, secrets);
  if (Array.isArray(node)) return node.map((item) => walk(item, secrets));
  if (node && typeof node === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      result[key] = walk(value, secrets);
    }
    return result;
  }
  return node;
}

/** Redacts known secret env var values anywhere in a Sentry event (nested objects/arrays included). */
export function scrubSentryEvent<T>(event: T): T {
  const secrets = getSecretValues();
  if (secrets.length === 0) return event;
  return walk(event, secrets) as T;
}

/** Reduces a full URL to just its hostname, for contexts that shouldn't carry full (possibly sensitive) URLs. */
export function urlToHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid-url";
  }
}
