import "server-only";

/**
 * A "contains" pattern for a PostgREST like/ilike filter, from a user's term
 * (F-006):
 * - \ % _ are backslash-escaped, so only the outer % are wildcards;
 * - PostgREST's own wildcard * is dropped (it turns * into % in LIKE).
 * The caller still quotes the result where PostgREST parses it as part of a
 * larger filter, as in an or=(...) list.
 */
export function containsPattern(term: string): string {
  return `%${term.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
