/**
 * @jest-environment node
 *
 * Where a staff member lands after signing in (the owner's choice, 18 Nov 2026): the Desk for a
 * newsroom role, the dashboard for the Super Admin and every other role.
 */

import { landingPath } from "./staffLanding";

const roles = (...keys: string[]) => keys.map((role) => ({ role }));

test.each([
  ["a Writer", roles("writer"), "/admin/desk"],
  ["a Sub-editor", roles("sub_editor"), "/admin/desk"],
  ["a Desk Editor in two languages", roles("desk_editor", "desk_editor"), "/admin/desk"],
  ["a Managing Editor", roles("managing_editor"), "/admin/desk"],
  ["the Super Admin", roles("super_admin"), "/admin"],
  ["the Super Admin who is also a Desk Editor", roles("desk_editor", "super_admin"), "/admin"],
  ["an Analyst", roles("analyst"), "/admin"],
  ["Legal and a Writer", roles("legal_compliance", "writer"), "/admin/desk"],
  ["no live role", roles(), "/admin"],
  ["nothing known", undefined, "/admin"],
])("%s lands on %s", (_who, held, path) => {
  expect(landingPath(held)).toBe(path);
});
