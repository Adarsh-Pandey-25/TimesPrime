import type { RoleKey } from "../config/permissions";

/**
 * Where a staff member lands after signing in (the owner's choice, 18 Nov 2026): one sign-in page for
 * everyone, then the page of their work. A newsroom role goes to the Desk; the Super Admin, and
 * every other role, to the dashboard. The page only chooses where to go: what each person may do
 * there is decided by the server on every request, as before.
 */

/** The newsroom's roles: their work is on the Desk (Panel 2). */
export const DESK_ROLES: readonly RoleKey[] = ["writer", "sub_editor", "desk_editor", "managing_editor"];

export type LandingPath = "/admin" | "/admin/desk";

/** The page for a person holding these live roles. The Super Admin keeps the dashboard, even with a Desk role. */
export function landingPath(roles: ReadonlyArray<{ role: string }> | null | undefined): LandingPath {
  const held = new Set((roles ?? []).map((r) => r.role));
  if (held.has("super_admin")) return "/admin";
  return DESK_ROLES.some((role) => held.has(role)) ? "/admin/desk" : "/admin";
}
