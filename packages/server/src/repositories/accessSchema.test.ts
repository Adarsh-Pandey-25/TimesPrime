/**
 * @jest-environment node
 *
 * The Panel 0 SQL the owner applies (design §1, Appendix A). Nothing here touches a database: jest
 * has none. These read the files and pin the guarantees the design relies on, so an edit that drops
 * one fails here before the owner runs it. What only a database can prove (the triggers firing, the
 * chain verifying) is in each file's verification queries, which the owner runs.
 */

import fs from "fs";
import path from "path";

const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), "database", ...p), "utf8").replace(/\r\n/g, "\n");
const foundation = read("migrations", "2026-11-02-access-1-foundation.sql");
const catalog = read("migrations", "2026-11-02-access-2-catalog.sql");
const freeze = read("migrations", "2026-11-02-access-3-freeze-admin-logs.sql");
const bootstrap = read("bootstrap", "super-admin.sql");

/** The file without its comment lines: what Postgres actually runs. */
const code = (sql: string) => sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
/** The commented rollback section (everything after the "Rollback" heading). */
const rollback = (sql: string) => sql.slice(sql.indexOf("-- ---- Rollback"));

const TABLES = ["staff_profiles", "roles", "permissions", "role_permissions", "role_assignments", "audit_log"];

describe("2026-11-02-access-1-foundation.sql", () => {
  const body = code(foundation);

  test("creates exactly the six tables, IF NOT EXISTS, each with RLS enabled", () => {
    const created = [...body.matchAll(/CREATE TABLE (IF NOT EXISTS )?public\.(\w+)/g)];
    expect(created.map((m) => m[2]).sort()).toEqual([...TABLES].sort());
    for (const m of created) {
      expect(m[1]).toBe("IF NOT EXISTS ");
      expect(body).toContain(`ALTER TABLE public.${m[2]} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  test("anon and authenticated get nothing: everything is revoked, and nothing is granted to them", () => {
    const revoke = body.match(/REVOKE ALL ON ([^;]*?)\s+FROM anon, authenticated, service_role;/);
    expect(revoke).not.toBeNull();
    for (const t of TABLES) expect(revoke![1]).toContain(`public.${t}`);
    expect(body).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/);
    expect(body).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated;/);
  });

  test("the app (service_role) can insert and read audit_log, never update, delete or truncate it", () => {
    const grants = [...body.matchAll(/GRANT ([A-Z, ]+) ON (?!FUNCTION)([^;]+?) TO service_role;/g)];
    const onAudit = grants.filter(([, , on]) => /public\.audit_log\b/.test(on)).map(([, privs]) => privs);
    expect(onAudit).toEqual(["SELECT, INSERT"]);
    expect(body).toMatch(/BEFORE UPDATE OR DELETE ON public\.audit_log\s+FOR EACH ROW EXECUTE FUNCTION public\.reject_change\(\)/);
    expect(body).toMatch(/BEFORE TRUNCATE ON public\.audit_log\s+FOR EACH STATEMENT EXECUTE FUNCTION public\.reject_change\(\)/);
  });

  test("no grant of DELETE anywhere; role_assignments rows are history", () => {
    expect(body).not.toMatch(/GRANT[^;]*\bDELETE\b/);
    expect(body).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON public\.role_assignments/);
    expect(body).toContain("an update may only revoke");
  });

  test("every row is chained: the trigger sets seq, at, prev_hash and row_hash under a lock", () => {
    expect(body).toMatch(/BEFORE INSERT ON public\.audit_log\s+FOR EACH ROW EXECUTE FUNCTION public\.audit_log_chain\(\)/);
    for (const step of ["pg_advisory_xact_lock", "NEW.seq :=", "NEW.at := clock_timestamp()", "NEW.prev_hash := v_hash", "NEW.row_hash := public.audit_log_row_hash(NEW)"]) {
      expect(body).toContain(step);
    }
    expect(body).toContain("CREATE OR REPLACE FUNCTION public.audit_verify_chain()");
  });

  test("the bootstrap exception is the only grant without a granter: super_admin, 'bootstrap:', as postgres", () => {
    const bootstrapRule = body.match(/IF NEW\.granted_by IS NULL AND NEW\.approved_by IS NULL[\s\S]*?THEN\s+RETURN NEW;/);
    expect(bootstrapRule).not.toBeNull();
    expect(bootstrapRule![0]).toContain("NEW.role_key = 'super_admin'");
    expect(bootstrapRule![0]).toContain("NEW.reason LIKE 'bootstrap:%'");
    expect(bootstrapRule![0]).toContain("current_user = 'postgres'");
    expect(body.match(/current_user = 'postgres'/g)).toHaveLength(1);
  });

  test("a privileged role needs two different, active Super Admins (D3, D4)", () => {
    expect(body).toMatch(/IF v_role\.is_privileged THEN\s+IF NEW\.approved_by IS NULL OR NEW\.approved_by = NEW\.granted_by THEN/);
    expect(body).toContain("NOT public.is_active_super_admin(NEW.granted_by) OR NOT public.is_active_super_admin(NEW.approved_by)");
  });

  test("no function is SECURITY DEFINER, so current_user is always the caller", () => {
    expect(body).not.toMatch(/SECURITY DEFINER/);
    const functions = [...body.matchAll(/CREATE OR REPLACE FUNCTION (public\.\w+)/g)].map((m) => m[1]);
    expect(functions.length).toBe(6);
    expect(body.match(/SECURITY INVOKER SET search_path = ''/g)).toHaveLength(functions.length);
  });

  test("every trigger is dropped before it is created, so a re-run cannot fail", () => {
    const triggers = [...body.matchAll(/CREATE TRIGGER (\w+)\s+[\s\S]*? ON (public\.\w+)/g)];
    expect(triggers.length).toBe(4);
    for (const [, name, table] of triggers) expect(body).toContain(`DROP TRIGGER IF EXISTS ${name} ON ${table};`);
  });

  test("the rollback drops every table and function the file creates", () => {
    const drops = rollback(foundation);
    for (const t of TABLES) expect(drops).toContain(`public.${t}`);
    for (const [, fn] of body.matchAll(/CREATE OR REPLACE FUNCTION (public\.\w+)/g)) expect(drops).toContain(fn);
    expect(drops).toContain("ONLY before go-live");
  });
});

describe("2026-11-02-access-2-catalog.sql", () => {
  test("is generated, transactional, and replaces role_permissions as a whole", () => {
    expect(catalog).toContain("GENERATED by scripts/generate-access-catalog.mjs");
    expect(code(catalog)).toMatch(/^\s*BEGIN;[\s\S]*DELETE FROM public\.role_permissions;[\s\S]*COMMIT;\s*$/);
  });
});

describe("2026-11-02-access-3-freeze-admin-logs.sql (Q7)", () => {
  const body = code(freeze);
  test("stops every write to admin_logs and keeps it readable", () => {
    expect(body).toContain("REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.admin_logs FROM service_role;");
    expect(body).toContain("GRANT SELECT ON public.admin_logs TO service_role;");
  });
});

describe("database/bootstrap/super-admin.sql (D4)", () => {
  const body = code(bootstrap);
  test("runs only as postgres, and refuses its placeholders", () => {
    expect(body).toContain("IF current_user <> 'postgres' THEN");
    expect(body).toContain("IF v_email LIKE 'REPLACE_ME%' OR v_name = 'REPLACE ME' THEN");
  });
  test("grants only super_admin, with a 'bootstrap:' reason, and audits it", () => {
    expect(body).toContain("v_reason    TEXT := 'bootstrap:");
    expect(body).toMatch(/INSERT INTO public\.role_assignments \(user_id, role_key, language, section, reason, expires_at\)\s+VALUES \(v_user, 'super_admin'/);
    expect(body).toMatch(/INSERT INTO public\.audit_log[\s\S]*?VALUES \('bootstrap'/);
  });
  test("never deletes: its rollback revokes", () => {
    expect(bootstrap).not.toMatch(/\bDELETE FROM\b/);
    expect(rollback(bootstrap)).toContain("SET revoked_at = now()");
  });
});
