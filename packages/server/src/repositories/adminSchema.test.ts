/**
 * @jest-environment node
 *
 * Panel 1's migration admin-1, read as text (design §2): what it guarantees in the database
 * whatever the app does. jest has no database; the owner runs the file's check query against the
 * real one (definition of done, item 7).
 */

import fs from "fs";
import path from "path";

const sql = fs
  .readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-19-admin-1-access-requests.sql"), "utf8")
  .replace(/\r\n/g, "\n");
const code = sql.slice(0, sql.indexOf("-- ---- Verify")).replace(/--[^\n]*/g, "");
const fn = (name: string) => {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`no function ${name}`);
  return code.slice(start, code.indexOf("$$;", start));
};
const foundation = fs.readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-02-access-1-foundation.sql"), "utf8").replace(/\r\n/g, "\n");

test("one transaction", () => {
  expect(code.match(/^BEGIN;$/gm)).toHaveLength(1);
  expect(code.match(/^COMMIT;$/gm)).toHaveLength(1);
});

test("the one-row index is recreated with is_break_glass, and dropped first so a re-run works", () => {
  expect(code).toContain("DROP INDEX IF EXISTS public.role_assignments_one_active;");
  expect(code).toMatch(/CREATE UNIQUE INDEX role_assignments_one_active\n\s+ON public\.role_assignments \(user_id, role_key, COALESCE\(language, '\*'\), COALESCE\(section, '\*'\), is_break_glass\)\n\s+WHERE revoked_at IS NULL;/);
});

test("a break-glass row never makes someone a Super Admin for the two-admin rule", () => {
  expect(fn("is_active_super_admin")).toContain("AND NOT a.is_break_glass");
});

describe("the guard trigger", () => {
  const guard = fn("role_assignments_guard");
  const original = foundation.slice(foundation.indexOf("CREATE OR REPLACE FUNCTION public.role_assignments_guard()"), foundation.indexOf("$$;", foundation.indexOf("CREATE OR REPLACE FUNCTION public.role_assignments_guard()")));

  test("keeps every rule of access-1: history, scope, bootstrap as postgres only, the two-admin rule", () => {
    for (const line of [
      "RAISE EXCEPTION 'role_assignments: rows are history and are never deleted; revoke instead';",
      "RAISE EXCEPTION 'role_assignments %: only revoked_at, revoked_by and revoke_reason may change', OLD.id;",
      "IF v_role.scope_required AND NEW.language IS NULL THEN",
      "AND current_user = 'postgres' THEN",
      "IF NEW.approved_by IS NULL OR NEW.approved_by = NEW.granted_by THEN",
      "IF NOT public.is_active_super_admin(NEW.granted_by) OR NOT public.is_active_super_admin(NEW.approved_by) THEN",
    ]) {
      expect(original).toContain(line);
      expect(guard).toContain(line);
    }
  });

  test("break-glass: only super_admin, granted by the person themself, an active Super Admin, with no approver", () => {
    expect(guard).toMatch(/IF NEW\.is_break_glass THEN\n\s+IF NEW\.role_key = 'super_admin' AND NEW\.granted_by = NEW\.user_id AND NEW\.approved_by IS NULL\n\s+AND public\.is_active_super_admin\(NEW\.user_id\) THEN\n\s+RETURN NEW;/);
    // Before the two-admin rule, and after the granter must be an active staff member.
    expect(guard.indexOf("IF NEW.is_break_glass THEN")).toBeGreaterThan(guard.indexOf("the granter is not an active staff member"));
    expect(guard.indexOf("IF NEW.is_break_glass THEN")).toBeLessThan(guard.indexOf("IF v_role.is_privileged THEN"));
  });

  test("a bootstrap grant is never break-glass", () => {
    expect(guard).toMatch(/AND NEW\.reason LIKE 'bootstrap:%'\n\s+AND NOT NEW\.is_break_glass/);
  });
});

describe("access_requests", () => {
  const table = code.slice(code.indexOf("CREATE TABLE IF NOT EXISTS public.access_requests"), code.indexOf(");\n", code.indexOf("CREATE TABLE IF NOT EXISTS public.access_requests")));

  test("nobody asks about themselves, decides their own request or one about themselves; only the asker cancels", () => {
    expect(table).toContain("CHECK (requested_by IS DISTINCT FROM user_id)");
    expect(table).toContain("CHECK (outcome = 'cancelled' OR decided_by IS NULL OR (decided_by <> requested_by AND decided_by IS DISTINCT FROM user_id))");
    expect(table).toContain("CHECK (outcome IS DISTINCT FROM 'cancelled' OR decided_by = requested_by)");
  });

  test("a request lapses 72 hours after it is made, and carries a reason", () => {
    expect(table).toContain("lapses_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now() + interval '72 hours'");
    expect(table).toContain("reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0)");
  });

  test("decided once, never edited after, never deleted or truncated", () => {
    const guard = fn("access_requests_guard");
    expect(guard).toContain("RAISE EXCEPTION 'access_requests: requests are history and are never deleted';");
    expect(guard).toContain("IF OLD.decided_at IS NOT NULL THEN");
    expect(code).toMatch(/DROP TRIGGER IF EXISTS access_requests_guard ON public\.access_requests;\nCREATE TRIGGER access_requests_guard\n\s+BEFORE UPDATE OR DELETE/);
    expect(code).toMatch(/CREATE TRIGGER access_requests_no_truncate\n\s+BEFORE TRUNCATE/);
  });

  test("starts from no rights; the app may read, ask and decide, never delete", () => {
    expect(code).toContain("REVOKE ALL ON public.access_requests FROM anon, authenticated, service_role;");
    expect(code).toContain("GRANT SELECT, INSERT, UPDATE ON public.access_requests TO service_role;");
    expect(code).not.toMatch(/GRANT[^;]*DELETE[^;]*access_requests/);
    expect(code).toContain("ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;");
  });
});

describe("the functions", () => {
  test("access_grant: 1 to 365 days, never for oneself, a renewal revokes the row it replaces first", () => {
    const grant = fn("access_grant");
    expect(grant).toContain("IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN");
    expect(grant).toContain("IF p_user = p_granted_by OR p_user = p_approved_by THEN");
    expect(grant.indexOf("revoke_reason = 'renewed'")).toBeLessThan(grant.indexOf("INSERT INTO public.role_assignments"));
    expect(grant).toContain("revoke_reason = 'expired'");
  });

  test("access_decide: by an active Super Admin who neither asked nor is the subject, before it lapses; approved, the asker must still be one", () => {
    const decide = fn("access_decide");
    expect(decide).toContain("IF p_decider = r.requested_by OR p_decider = r.user_id THEN");
    expect(decide).toContain("IF r.lapses_at <= now() THEN");
    expect(decide).toContain("IF NOT public.is_active_super_admin(p_decider) THEN");
    expect(decide).toContain("IF NOT public.is_active_super_admin(r.requested_by) THEN");
    expect(decide).toContain("FOR UPDATE");
  });

  test("access_decide makes an approved grant with the asker as granter and the decider as approver", () => {
    expect(fn("access_decide")).toMatch(/\(r\.details->>'days'\)::INT, r\.reason, r\.requested_by, p_decider, NULL\);/);
  });

  test("only staff_end_sessions is SECURITY DEFINER, and it touches only a staff member's sessions", () => {
    expect(code.match(/SECURITY DEFINER/g)).toHaveLength(1);
    const end = fn("staff_end_sessions");
    expect(end).toContain("SECURITY DEFINER SET search_path = ''");
    expect(end).toContain("IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE user_id = p_user) THEN");
    expect(end).toContain("DELETE FROM auth.sessions WHERE user_id = p_user;");
  });

  test("every function pins its search_path", () => {
    const defs = code.match(/CREATE OR REPLACE FUNCTION[\s\S]*?AS \$\$/g) ?? [];
    expect(defs.length).toBe(6);
    for (const def of defs) expect(def).toContain("SET search_path = ''");
  });

  test("no function is callable by readers or signed-in users; the app's role may call the four it needs", () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION[^;]*public\.staff_end_sessions\(UUID\)[^;]*FROM PUBLIC, anon, authenticated;/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION[^;]*public\.access_decide\(UUID, UUID, TEXT, TEXT, UUID\)[^;]*FROM PUBLIC, anon, authenticated;/);
    const granted = code.slice(code.indexOf("GRANT EXECUTE ON FUNCTION"), code.indexOf("TO service_role;", code.indexOf("GRANT EXECUTE ON FUNCTION")));
    for (const f of ["access_grant", "access_decide", "staff_end_sessions", "is_active_super_admin"]) expect(granted).toContain(`public.${f}(`);
    expect(code).not.toMatch(/GRANT[^;]*TO (anon|authenticated)/);
  });
});

test("the rollback drops what the file adds and puts the index back as it was", () => {
  const rollback = sql.slice(sql.indexOf("-- ---- Rollback"));
  for (const part of ["DROP FUNCTION IF EXISTS public.access_decide", "public.access_grant", "public.staff_end_sessions", "DROP TABLE IF EXISTS public.access_requests", "DROP FUNCTION IF EXISTS public.access_requests_guard()"]) {
    expect(rollback).toContain(part);
  }
  expect(rollback).toMatch(/COALESCE\(section, '\*'\)\)\n--\s+WHERE revoked_at IS NULL;/);
});
