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

/** Break-glass (design §5): a Super Admin's own emergency access, for at most this long (the database's CHECK). */
export const BREAK_GLASS_HOURS = 2;
/** The access review (design §6): one every 90 days. */
export const REVIEW_EVERY_DAYS = 90;
/** In the review, someone who has not signed in for this long is flagged. */
export const STALE_SIGN_IN_DAYS = 60;
/** Roles ending within this many days are listed, to renew in time. */
export const ENDING_SOON_DAYS = 14;

/** What a Super Admin's request may ask for (access_requests.kind). */
export const REQUEST_KINDS = ["add_person", "grant", "renew", "reactivate", "rename", "password_link", "mfa_reset"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

const includes = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

export const isGrantableRole = (role: string): role is (typeof GRANTABLE_ROLES)[number] => includes(GRANTABLE_ROLES, role);
export const isPrivilegedRole = (role: string) => includes(PRIVILEGED_ROLES, role);
export const needsLanguage = (role: string) => includes(SCOPE_REQUIRED_ROLES, role);
export const isExpiryDays = (days: unknown): days is ExpiryDays => typeof days === "number" && (EXPIRY_DAYS as readonly number[]).includes(days);
export const defaultDays = (role: string): ExpiryDays => (role === "super_admin" ? SUPER_ADMIN_EXPIRY_DAYS : DEFAULT_EXPIRY_DAYS);

/**
 * Where a one-time "set your password" link lands (Panel 1 design §4, M2): the back office's own
 * welcome page, with the token Supabase's generateLink gave (never its own redirect). A path only:
 * the screen that shows it adds its own origin, the back office the person will use.
 */
export function welcomePath(tokenHash: string): string {
  return `/admin/welcome?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
}

/**
 * How long a one-time link works, as the screens say it. It mirrors a Supabase setting the owner
 * keeps (Authentication → Email → Email OTP Expiration: 3600 seconds, 19 Nov 2026, after Supabase
 * warned that 24 hours is more than it recommends); change both together.
 */
export const LINK_VALID_FOR = "1 hour";

/** A staff password: long enough to resist guessing; Supabase may ask for more. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** What is wrong with a new password, or null. */
export function passwordProblem(password: unknown, email?: string | null): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "Do not use your email in the password.";
  return null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** An email as Supabase Auth keeps it: trimmed, lower case; or null if it is not one. */
export function readEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

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
