/**
 * @jest-environment node
 *
 * Panel 1's rules for granting roles (design §3): the role lists agree with the catalogue SQL the
 * owner applied (is_privileged, scope_required, phase), and the scope checks.
 */

import fs from "fs";
import path from "path";
import {
  passwordProblem,
  readEmail,
  welcomePath,
  defaultDays,
  EXPIRY_DAYS,
  GRANTABLE_ROLES,
  isExpiryDays,
  MANAGING_EDITOR_GRANTS,
  PRIVILEGED_ROLES,
  readScope,
  SCOPE_REQUIRED_ROLES,
  scopeWithin,
} from "./people";

const sql = fs.readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-02-access-2-catalog.sql"), "utf8");
// ('super_admin', 'Super Admin', true, true, false, 1): key, label, privileged, aal2, scope, phase
const ROLES = [...sql.matchAll(/\('(\w+)', '[^']*', (true|false), (true|false), (true|false), (\d)\)/g)].map((m) => ({
  key: m[1],
  privileged: m[2] === "true",
  scopeRequired: m[4] === "true",
  phase: Number(m[5]),
}));

test("the catalogue was read (15 roles)", () => {
  expect(ROLES).toHaveLength(15);
});

test("the privileged roles are the catalogue's is_privileged", () => {
  expect([...PRIVILEGED_ROLES].sort()).toEqual(ROLES.filter((r) => r.privileged).map((r) => r.key).sort());
});

test("the roles that need a language are the catalogue's scope_required", () => {
  expect([...SCOPE_REQUIRED_ROLES].sort()).toEqual(ROLES.filter((r) => r.scopeRequired).map((r) => r.key).sort());
});

test("the grantable roles are the matrix's Phase 1 to 3 columns; the commercial ones wait for Panel 9", () => {
  expect([...GRANTABLE_ROLES].sort()).toEqual(ROLES.filter((r) => r.phase <= 3).map((r) => r.key).sort());
});

test("a Managing Editor grants up to Desk Editor: never a privileged role", () => {
  expect(MANAGING_EDITOR_GRANTS).toEqual(["desk_editor", "sub_editor", "writer"]);
  for (const role of MANAGING_EDITOR_GRANTS) expect(PRIVILEGED_ROLES).not.toContain(role);
});

test("expiry: the form's choices, 180 days by default, 365 for a Super Admin, never more than 365", () => {
  expect(EXPIRY_DAYS).toEqual([30, 90, 180, 365]);
  expect(defaultDays("writer")).toBe(180);
  expect(defaultDays("super_admin")).toBe(365);
  expect(isExpiryDays(365)).toBe(true);
  expect(isExpiryDays(366)).toBe(false);
  expect(isExpiryDays("180")).toBe(false);
});

test("scopeWithin: 'all' holds every scope; a desk holds only itself and its sections", () => {
  const ALL = { language: null, section: null };
  const HI = { language: "hi" as const, section: null };
  const HI_SPORTS = { language: "hi" as const, section: "sports" };
  expect(scopeWithin(HI_SPORTS, ALL)).toBe(true);
  expect(scopeWithin(HI_SPORTS, HI)).toBe(true);
  expect(scopeWithin(HI, HI_SPORTS)).toBe(false);
  expect(scopeWithin({ language: "en", section: "sports" }, HI)).toBe(false);
  expect(scopeWithin(ALL, HI)).toBe(false);
});

test("readScope: a known language and section, or all; a desk role needs a language", () => {
  expect(readScope("writer", "hi", "sports")).toEqual({ language: "hi", section: "sports" });
  expect(readScope("analyst", null, "")).toEqual({ language: null, section: null });
  expect(readScope("writer", null, null)).toEqual({ error: expect.stringMatching(/one language/) });
  expect(readScope("writer", "fr", null)).toEqual({ error: expect.stringMatching(/language/) });
  expect(readScope("writer", "hi", "politics")).toEqual({ error: expect.stringMatching(/section/) });
});

test("the welcome link is the back office's own page, with the token encoded, never Supabase's redirect", () => {
  expect(welcomePath("ab/c+d")).toBe("/admin/welcome?token_hash=ab%2Fc%2Bd&type=recovery");
});

test("a password: 12 to 128 characters, without the email's name", () => {
  expect(passwordProblem("short")).toMatch(/12/);
  expect(passwordProblem("x".repeat(129))).toMatch(/128/);
  expect(passwordProblem("ravi-kumar-2026!", "ravi@example.com")).toMatch(/email/);
  expect(passwordProblem("correct horse battery", "ravi@example.com")).toBeNull();
  expect(passwordProblem(undefined)).not.toBeNull();
});

test("an email is trimmed and lower-cased, or refused", () => {
  expect(readEmail("  Ravi@Example.COM ")).toBe("ravi@example.com");
  expect(readEmail("not an email")).toBeNull();
  expect(readEmail(42)).toBeNull();
});
