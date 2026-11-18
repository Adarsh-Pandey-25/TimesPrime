/**
 * @jest-environment node
 *
 * The staff roles as people read them, for the back office's top bar.
 */

import { ROLE_KEYS } from "../config/permissions";
import { describeRoles, ROLE_LABELS } from "./staffRoles";

const r = (role: string, language: string | null = null, section: string | null = null) => ({ role, language, section });

test("every role of the catalogue has a name", () => {
  expect(Object.keys(ROLE_LABELS).sort()).toEqual([...ROLE_KEYS].sort());
});

test("the Super Admin who is also a Desk Editor in both languages", () => {
  expect(describeRoles([r("desk_editor", "hi"), r("super_admin"), r("desk_editor", "en")])).toBe("Super Admin · Desk Editor (Hindi, English)");
});

test("a Writer for one desk, and one narrowed to a section", () => {
  expect(describeRoles([r("writer", "en")])).toBe("Writer (English)");
  expect(describeRoles([r("writer", "en", "sports")])).toBe("Writer (English sports)");
});

test("each role once, in the catalogue's order; no roles, nothing", () => {
  expect(describeRoles([r("writer", "en"), r("writer", "en"), r("analyst")])).toBe("Writer (English) · Analyst");
  expect(describeRoles([])).toBe("");
});
