import "server-only";

import { MANAGING_EDITOR_GRANTS, scopeWithin, type RoleScope } from "@timesprime/shared/config/people";
import type { PermissionKey } from "@timesprime/shared/config/permissions";
import type { StaffRecord } from "../../auth/decide";

// Who may do what to whom in Panel 1 (design §3, approved 19 Nov 2026), as pure functions of the
// caller's staff record: the gate (requirePermission) has already checked the permission and the
// second factor; these add the matrix's notes. Two ways to hold user.manage / role.assign:
//   - A (Super Admin): a change that adds access is a request a second Super Admin decides; one
//     that removes access is done at once;
//   - S (Managing Editor): acts alone, "assign ≤ Desk Editor in own scope": Writer, Sub-editor and
//     Desk Editor, inside the scopes of their own S assignments.
// Nobody acts on their own access (the route refuses that first).

/** The parts of an assignment the rules read. */
export interface RoleRow {
  role_key: string;
  language: string | null;
  section: string | null;
  is_break_glass: boolean;
  revoked_at: string | null;
  expires_at: string;
}

const live = (r: { revoked_at: string | null; expires_at: string }, now: Date) => r.revoked_at === null && Date.parse(r.expires_at) > now.getTime();

export const liveRows = <T extends RoleRow>(rows: readonly T[], now: Date): T[] => rows.filter((r) => live(r, now));

const scopeOf = (r: { language: string | null; section: string | null }): RoleScope => ({
  language: r.language === "en" || r.language === "hi" ? r.language : null,
  section: r.section,
});

function grantsAt(record: StaffRecord | null, permission: PermissionKey, code: "A" | "S", now: Date): RoleScope[] {
  return (record?.assignments ?? [])
    .filter((a) => live({ revoked_at: a.revokedAt, expires_at: a.expiresAt }, now))
    .filter((a) => a.grants.some((g) => g.permission === permission && g.access === code && (!g.breakGlassOnly || a.isBreakGlass)))
    .map((a) => ({ language: a.language, section: a.section }));
}

/** The caller holds the permission as A: a Super Admin, who asks a second one. */
export const asks = (record: StaffRecord | null, permission: PermissionKey, now: Date) => grantsAt(record, permission, "A", now).length > 0;

/** The scopes in which the caller holds the permission as S: a Managing Editor's own scope. */
export const ownScopes = (record: StaffRecord | null, permission: PermissionKey, now: Date) => grantsAt(record, permission, "S", now);

/** A role a Managing Editor may grant, renew or revoke in one of their scopes. */
export function withinReach(scopes: readonly RoleScope[], role: string, scope: { language: string | null; section: string | null }): boolean {
  return (MANAGING_EDITOR_GRANTS as readonly string[]).includes(role) && scopes.some((s) => scopeWithin(scopeOf(scope), s));
}

/**
 * A Managing Editor's people: everyone whose every live role is one they could grant, in their
 * scope, and who holds (or held) at least one role there. Never a Super Admin or a fellow
 * Managing Editor.
 */
export function isTheirPerson(scopes: readonly RoleScope[], rows: readonly RoleRow[], now: Date): boolean {
  if (scopes.length === 0) return false;
  const current = liveRows(rows, now);
  return current.every((r) => withinReach(scopes, r.role_key, r)) && rows.some((r) => r.revoked_at === null && withinReach(scopes, r.role_key, r));
}

/** Who appears in the caller's directory: everyone for a Super Admin; a Managing Editor's desks for them. */
export function canSee(record: StaffRecord | null, rows: readonly RoleRow[], now: Date): boolean {
  if (asks(record, "user.manage", now)) return true;
  const scopes = ownScopes(record, "user.manage", now);
  return rows.some((r) => scopes.some((s) => scopeWithin(scopeOf(r), s)));
}

/**
 * How the caller may make a change:
 *   "act"     at once (a Managing Editor within reach; or anyone allowed to remove access);
 *   "ask"     a request a second Super Admin decides;
 *   null      not at all.
 * `inReach`: whether the S path covers this change (a role in scope, or "their person").
 * `removes`: the change only removes access, which takes one person (design §3, note b).
 */
export function planFor(record: StaffRecord | null, permission: PermissionKey, now: Date, inReach: (scopes: RoleScope[]) => boolean, removes = false): "act" | "ask" | null {
  const scopes = ownScopes(record, permission, now);
  if (scopes.length > 0 && inReach(scopes)) return "act";
  if (asks(record, permission, now)) return removes ? "act" : "ask";
  return null;
}
