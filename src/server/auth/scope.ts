import "server-only";

import type { ScopeLanguage } from "@/config/permissions";

// The one place that turns an article into a permission scope (design §3).
//
// Language (owner decision D5): articles.language stores "english" / "hindi"; role assignments use
// "en" / "hi". The column is not changed; it is mapped here. Any other stored value has no scope
// language, so only an all-language assignment covers it (deny by default).
//
// Section (D6, ADR 0003): an article's section is category[0], as stored. Not "any category", which
// would let an editor bring any article into scope by adding their section to it.

/** A permission target. A NULL field is covered only by an assignment with no limit on it. */
export interface Target {
  language: ScopeLanguage | null;
  section: string | null;
}

/** An assignment's scope: a NULL field means "all". */
export interface Scope {
  language: ScopeLanguage | null;
  section: string | null;
}

/** For objects that belong to no desk, such as the breaking banner or a full sync. */
export const SITE_WIDE: Target = { language: null, section: null };

const TO_SCOPE: Record<string, ScopeLanguage> = { english: "en", hindi: "hi" };
const TO_STORED: Record<ScopeLanguage, string> = { en: "english", hi: "hindi" };

export function toScopeLanguage(stored: string | null | undefined): ScopeLanguage | null {
  if (typeof stored !== "string") return null;
  return TO_SCOPE[stored.trim().toLowerCase()] ?? null;
}

export function toStoredLanguage(scope: ScopeLanguage): string {
  return TO_STORED[scope];
}

export function articleScope(article: { language?: string | null; category?: string[] | null }): Target {
  const first = article.category?.[0];
  return { language: toScopeLanguage(article.language), section: typeof first === "string" && first ? first : null };
}

export function covers(scope: Scope, target: Target): boolean {
  const field = (limit: string | null, value: string | null) => limit === null || limit === value;
  return field(scope.language, target.language) && field(scope.section, target.section);
}
