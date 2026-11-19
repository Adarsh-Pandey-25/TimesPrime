import type { RoleKey, ScopeLanguage } from "./permissions";
import { SECTION_IDS } from "./sections";

// Panel 1 (Administration): the rules for granting roles, as data both the back office's API and
// its screens use. The database enforces its own share (the two-admin rule, the scope a role needs,
// break-glass's 2 hours: migrations 2026-11-02-access-1 and 2026-11-19-admin-1); these are the
// rules the app adds. Design: Panel 1's design in docs/PANEL_DOCS.md, §3, as approved on
// 19 Nov 2026. people.test.ts checks the role lists against the catalogue SQL.

/** How long a grant lasts, in days: the form's choices (design §3, the owner's decision 5). */
export const EXPIRY_DAYS = [30, 90, 180, 365] as const;
export type ExpiryDays = (typeof EXPIRY_DAYS)[number];
export const DEFAULT_EXPIRY_DAYS: ExpiryDays = 180;
/** A Super Admin's grant: renewed at the access review. */
export const SUPER_ADMIN_EXPIRY_DAYS: ExpiryDays = 365;

/** A Super Admin's request lapses if nobody decides it within this many hours (design §3). */
export const REQUEST_LAPSE_HOURS = 72;

/** The roles that can be granted in the app now: the matrix's Phase 1 to 3 columns. The commercial
 * roles (P4) come with Panel 9. */
export const GRANTABLE_ROLES = [
  "super_admin",
  "managing_editor",
  "desk_editor",
  "sub_editor",
  "writer",
  "ingestion_ops",
  "analyst",
  "grievance_officer",
  "legal_compliance",
  "privacy_officer",
  "security_lead",
] as const satisfies readonly RoleKey[];

/** What a Managing Editor grants alone: "assign ≤ Desk Editor in own scope" (the matrix). */
export const MANAGING_EDITOR_GRANTS = ["desk_editor", "sub_editor", "writer"] as const satisfies readonly RoleKey[];

/** Granted only by two different Super Admins (roles.is_privileged; the database enforces it). */
export const PRIVILEGED_ROLES = ["super_admin", "managing_editor", "legal_compliance", "privacy_officer"] as const satisfies readonly RoleKey[];

/** Granted only for one language (roles.scope_required; the database enforces it). */
export const SCOPE_REQUIRED_ROLES = ["desk_editor", "sub_editor", "writer"] as const satisfies readonly RoleKey[];

/** What a Super Admin's request may ask for (access_requests.kind). */
export const REQUEST_KINDS = ["add_person", "grant", "renew", "reactivate", "rename", "password_link", "mfa_reset"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

const includes = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

export const isGrantableRole = (role: string): role is (typeof GRANTABLE_ROLES)[number] => includes(GRANTABLE_ROLES, role);
export const isPrivilegedRole = (role: string) => includes(PRIVILEGED_ROLES, role);
export const needsLanguage = (role: string) => includes(SCOPE_REQUIRED_ROLES, role);
export const isExpiryDays = (days: unknown): days is ExpiryDays => typeof days === "number" && (EXPIRY_DAYS as readonly number[]).includes(days);
export const defaultDays = (role: string): ExpiryDays => (role === "super_admin" ? SUPER_ADMIN_EXPIRY_DAYS : DEFAULT_EXPIRY_DAYS);

/** A role's scope: a NULL field means "all". */
export interface RoleScope {
  language: ScopeLanguage | null;
  section: string | null;
}

/** True when `inner` lies inside `outer`: each field of `outer` is "all", or the same as `inner`'s. */
export function scopeWithin(inner: RoleScope, outer: RoleScope): boolean {
  const field = (i: string | null, o: string | null) => o === null || i === o;
  return field(inner.language, outer.language) && field(inner.section, outer.section);
}

/**
 * The scope a grant asks for, checked: a language of `en` or `hi` (or none), a known section (or
 * none), and a language where the role needs one. Returns the scope, or what is wrong with it.
 */
export function readScope(role: string, language: unknown, section: unknown): RoleScope | { error: string } {
  const lang = language === null || language === undefined || language === "" ? null : language;
  const sec = section === null || section === undefined || section === "" ? null : section;
  if (lang !== null && lang !== "en" && lang !== "hi") return { error: "language must be en, hi or empty (all)." };
  if (sec !== null && (typeof sec !== "string" || !includes(SECTION_IDS, sec))) {
    return { error: `section must be one of ${SECTION_IDS.join(", ")}, or empty (all).` };
  }
  if (lang === null && needsLanguage(role)) return { error: "This role is granted for one language: en or hi." };
  return { language: lang, section: sec as string | null };
}
