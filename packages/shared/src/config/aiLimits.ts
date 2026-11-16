/**
 * How much of the two paid upstreams readers may use: the chat model (/api/chat) and the
 * translator (/api/translate). Every count is kept in the shared Redis, so all instances see one
 * count (packages/server/src/lib/rateLimit.ts); a day is the UTC day, which resets at 05:30 IST.
 *
 * - Per IP, a minute and a day (R1-05; owner, STOP R1): one reader, or one script, cannot spend
 *   the day.
 * - Every reader together, a day (owner, STOP R1): the cap that bounds the total whatever the IPs.
 *   Mobile carriers in India put many readers behind one address (CGNAT), and a script can use
 *   many addresses. Only a request that passes validation and is about to reach the upstream
 *   counts, so malformed requests cannot spend it. Each endpoint's is one value, `globalPerDay`.
 *
 * Behind these, the Anthropic account's monthly spend limit is the last guard (the owner runbook,
 * docs/OPERATIONS.md).
 */
export const CHAT_LIMITS = {
  perIpPerMinute: 10,
  perIpPerDay: 100,
  globalPerDay: 500,
} as const;

export const TRANSLATE_LIMITS = {
  perIpPerMinute: 10,
  perIpPerDay: 300,
  globalPerDay: 1000,
} as const;
