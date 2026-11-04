/**
 * @jest-environment node
 *
 * The committed SQL against the code that uses it (F-008, F-018). Nothing
 * here touches a database: these read the files the owner applies, and
 * check the columns, idempotence and indexes the code depends on.
 */

import fs from "fs";
import path from "path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), "database", file), "utf8");
const schema = read("schema.sql");
const policies = read("policies.sql");

/** The column names in `CREATE TABLE IF NOT EXISTS public.<table> ( ... );`. */
function columns(table: string): string[] {
  const match = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!match) throw new Error(`no CREATE TABLE IF NOT EXISTS for ${table}`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("--"))
    .map((line) => line.split(/\s+/)[0]);
}

describe("database/schema.sql (F-008)", () => {
  // What the code selects, inserts, updates and filters on.
  test.each([
    // src/app/api/admin/breaking-news/route.ts: select, insert, update, the active/expiry filter
    ["breaking_news", ["id", "text", "is_active", "expires_at", "created_at"]],
    // src/app/api/admin/logs/route.ts reads it (?source=legacy); nothing writes it since Panel 0
    ["admin_logs", ["id", "action", "details", "metadata", "created_at"]],
    // src/server/repositories/db.ts: the row mapping, the feed filters, the link lookup (F-005)
    ["articles", ["article_id", "title", "link", "description", "content", "pub_date", "image_url", "source_id", "source_name", "category", "country", "language", "created_at", "category_mismatches"]],
  ])("defines %s with every column the code uses", (table, used) => {
    expect(columns(table)).toEqual(expect.arrayContaining(used as string[]));
  });

  test("every table is created IF NOT EXISTS, and has RLS enabled", () => {
    const created = [...schema.matchAll(/CREATE TABLE (IF NOT EXISTS )?public\.(\w+)/g)];
    expect(created.map((m) => m[2]).sort()).toEqual(["admin_logs", "articles", "breaking_news"]);
    for (const m of created) {
      expect(m[1]).toBe("IF NOT EXISTS ");
      expect(schema).toContain(`ALTER TABLE public.${m[2]} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  test("holds no policies (they are not idempotent there; database/policies.sql has them)", () => {
    expect(schema).not.toMatch(/CREATE POLICY/);
  });
});

describe("database/policies.sql (F-008)", () => {
  test("drops every policy before creating it, so a re-run cannot fail", () => {
    const created = [...policies.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.(\w+)/g)];
    expect(created.length).toBeGreaterThanOrEqual(7);
    for (const [, name, table] of created) {
      expect(policies).toContain(`DROP POLICY IF EXISTS "${name}" ON public.${table};`);
    }
  });

  test("breaking_news is publicly readable (the banner, CR-08); admin_logs is service_role only", () => {
    expect(policies).toMatch(/CREATE POLICY "Public read access"\s+ON public\.breaking_news\s+FOR SELECT\s+TO anon, authenticated/);
    expect(policies).not.toMatch(/ON public\.admin_logs\s+FOR \w+\s+TO anon/);
    expect(policies).toContain("REVOKE ALL ON public.admin_logs FROM anon, authenticated;");
  });
});

describe("database/migrations/2026-11-02-indexes.sql (F-018)", () => {
  const migration = read("migrations/2026-11-02-indexes.sql");

  test.each([
    ["the feed's category containment", /CREATE INDEX IF NOT EXISTS \w+ ON public\.articles USING GIN \(category\);/],
    ["the country containment", /CREATE INDEX IF NOT EXISTS \w+ ON public\.articles USING GIN \(country\);/],
    ["trigram search on title", /CREATE INDEX IF NOT EXISTS \w+ ON public\.articles USING GIN \(title gin_trgm_ops\);/],
    ["trigram search on description", /CREATE INDEX IF NOT EXISTS \w+ ON public\.articles USING GIN \(description gin_trgm_ops\);/],
    ["the F-005 and public-scrape lookup on link", /CREATE INDEX IF NOT EXISTS \w+ ON public\.articles \(link\);/],
  ])("indexes %s", (_label, pattern) => {
    expect(migration).toMatch(pattern);
  });

  test("enables pg_trgm before the trigram indexes, and is idempotent throughout", () => {
    expect(migration.indexOf("CREATE EXTENSION IF NOT EXISTS pg_trgm;")).toBeLessThan(migration.indexOf("gin_trgm_ops"));
    const statements = migration.split("\n").filter((l) => /^CREATE /.test(l));
    expect(statements.length).toBe(6);
    for (const s of statements) expect(s).toMatch(/IF NOT EXISTS/);
  });

  test("the link index is not UNIQUE: stored rows can share the '#' placeholder link", () => {
    expect(migration).not.toMatch(/CREATE UNIQUE INDEX[^;]*\(link\)/);
  });

  test("the owner runbook's rollback drops every index the migration creates", () => {
    const runbook = fs.readFileSync(path.join(process.cwd(), "docs", "runbooks", "apply-database.md"), "utf8");
    const created = [...migration.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    expect(created.length).toBe(5);
    for (const name of created) expect(runbook).toContain(`DROP INDEX IF EXISTS public.${name};`);
  });
});
