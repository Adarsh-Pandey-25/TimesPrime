import "server-only";

import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type { Assignment, Grant, StaffRecord } from "../auth/decide";
import { ACCESS_CODES, PERMISSION_KEYS, ROLE_KEYS, SCOPE_LANGUAGES, type AccessCode, type PermissionKey, type RoleKey, type ScopeLanguage } from "@timesprime/shared/config/permissions";

// The staff record decide() needs: the profile, and the user's unrevoked, unexpired assignments
// with their roles' grants. Read from Supabase on every request and never cached (design,
// "Approval"), so a revocation, an expiry or a suspension applies to the very next request, whether
// it was made in the app or in the SQL editor. Tables: database/migrations/2026-11-02-access-1-
// foundation.sql.
//
// What comes back is narrowed field by field. Anything unknown or malformed is dropped (an
// assignment with an unknown role or language, a grant with an unknown key or code), so bad data
// can only take access away, never add it.

export class StaffLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffLookupError";
  }
}

const isRole = (v: unknown): v is RoleKey => typeof v === "string" && (ROLE_KEYS as readonly string[]).includes(v);
const isPermission = (v: unknown): v is PermissionKey => typeof v === "string" && (PERMISSION_KEYS as readonly string[]).includes(v);
const isAccess = (v: unknown): v is AccessCode => typeof v === "string" && (ACCESS_CODES as readonly string[]).includes(v);
const isLanguage = (v: unknown): v is ScopeLanguage | null => v === null || (typeof v === "string" && (SCOPE_LANGUAGES as readonly string[]).includes(v));
const record = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function toGrants(rows: unknown): Grant[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((raw) => {
    const r = record(raw);
    if (!r || !isPermission(r.permission_key) || !isAccess(r.access)) return [];
    return [{ permission: r.permission_key, access: r.access, breakGlassOnly: r.break_glass_only === true }];
  });
}

function toAssignment(raw: unknown): Assignment | null {
  const r = record(raw);
  if (!r || typeof r.id !== "string" || !isRole(r.role_key) || !isLanguage(r.language)) return null;
  if (typeof r.expires_at !== "string") return null;
  const section = r.section === null || typeof r.section === "string" ? r.section : undefined;
  if (section === undefined) return null;
  const role = record(r.roles);
  return {
    id: r.id,
    role: r.role_key,
    language: r.language,
    section,
    isBreakGlass: r.is_break_glass === true,
    expiresAt: r.expires_at,
    revokedAt: typeof r.revoked_at === "string" ? r.revoked_at : null,
    // A missing flag reads as "needs MFA": the stricter of the two.
    requiresAal2: role?.requires_aal2 !== false,
    grants: toGrants(role?.role_permissions),
  };
}

/**
 * Notes the time of a staff sign-in on the profile (staff_profiles.last_sign_in_at). Written at
 * sign-in only, not per request. Best-effort: a missed timestamp must not refuse a sign-in.
 */
export async function markSignedIn(userId: string): Promise<void> {
  try {
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.from("staff_profiles").update({ last_sign_in_at: new Date().toISOString() }).eq("user_id", userId);
    if (error) console.error("last_sign_in_at update failed:", error.message);
  } catch (err) {
    console.error("last_sign_in_at update failed:", err);
  }
}

/** The staff record, or null when the user has no staff profile. Throws StaffLookupError on any failure. */
export async function loadStaffRecord(userId: string, now: Date = new Date()): Promise<StaffRecord | null> {
  if (!isSupabaseConfigured()) throw new StaffLookupError("Supabase is not configured");

  const profileQuery = await supabase
    .from("staff_profiles")
    .select("user_id, display_name, status, mfa_required")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileQuery.error) throw new StaffLookupError(`staff_profiles: ${profileQuery.error.message}`);
  const profile = record(profileQuery.data);
  if (!profile) return null;

  const assignmentQuery = await supabase
    .from("role_assignments")
    .select(
      "id, role_key, language, section, is_break_glass, expires_at, revoked_at, roles(requires_aal2, role_permissions(permission_key, access, break_glass_only))"
    )
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString());
  if (assignmentQuery.error) throw new StaffLookupError(`role_assignments: ${assignmentQuery.error.message}`);

  const rows: unknown[] = Array.isArray(assignmentQuery.data) ? assignmentQuery.data : [];
  return {
    userId,
    displayName: typeof profile.display_name === "string" ? profile.display_name : userId,
    status: profile.status === "active" ? "active" : "suspended",
    mfaRequired: profile.mfa_required !== false,
    assignments: rows.map(toAssignment).filter((a): a is Assignment => a !== null),
  };
}
