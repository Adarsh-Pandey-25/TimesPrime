/**
 * @jest-environment node
 *
 * Panel 3's migrations, read as text (design §2): what each guarantees in the database whatever the
 * app does. jest has no database; the owner runs each file's check query against the real one.
 */

import fs from "fs";
import path from "path";

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), "database", "migrations", file), "utf8").replace(/\r\n/g, "\n");
const codeOf = (sql: string) => sql.slice(0, sql.indexOf("-- ---- Verify")).replace(/--[^\n]*/g, "");

describe("front-1: the banner's language (M1)", () => {
  const sql = read("2026-11-19-front-1-banner-language.sql");
  const code = codeOf(sql);

  test("one transaction", () => {
    expect(code.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(code.match(/^COMMIT;$/gm)).toHaveLength(1);
  });

  test("a nullable language, en or hi: NULL is both, so existing items are unchanged", () => {
    expect(code).toContain("ALTER TABLE public.breaking_news ADD COLUMN IF NOT EXISTS language TEXT NULL;");
    expect(code).toMatch(/CHECK \(language IS NULL OR language IN \('en', 'hi'\)\)/);
    expect(code).not.toMatch(/UPDATE public\.breaking_news/);
  });

  test("re-runnable: the constraint is dropped before it is added", () => {
    expect(code.indexOf("DROP CONSTRAINT IF EXISTS breaking_news_language_check")).toBeLessThan(code.indexOf("ADD CONSTRAINT breaking_news_language_check"));
  });

  test("grants and policies are left alone", () => {
    expect(code).not.toMatch(/\b(GRANT|REVOKE|POLICY)\b/);
  });

  test("a check query and a rollback that drops the column", () => {
    expect(sql).toContain("-- ---- Verify (one query; expect true, true, 0)");
    expect(sql).toContain("--   ALTER TABLE public.breaking_news DROP COLUMN IF EXISTS language;");
  });
});
