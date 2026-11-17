/**
 * @jest-environment node
 *
 * The Desk's corrections migration (database/migrations/2026-11-17-desk-3-corrections.sql), read as
 * text: what the owner applies teaches desk_decide_pending to decide a correction request, keeps
 * the restore it decided before, and keeps the function out of readers' reach. The owner runs its
 * check queries against the real database (definition of done, item 7).
 */

import fs from "fs";
import path from "path";

const migration = fs
  .readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-17-desk-3-corrections.sql"), "utf8")
  .replace(/\r\n/g, "\n");
const restoreOnly = fs.readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-17-desk-2-restore.sql"), "utf8");
const body = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.desk_decide_pending"), migration.indexOf("COMMIT;"));

test("one transaction, replacing the function the restore migration created, with the same signature", () => {
  expect(migration).toMatch(/^BEGIN;$/m);
  expect(migration).toMatch(/^COMMIT;$/m);
  const signature = "public.desk_decide_pending(\n  p_action UUID, p_decider UUID, p_decider_label TEXT, p_outcome TEXT, p_reason TEXT\n)";
  expect(migration).toContain(signature);
  expect(restoreOnly.replace(/\r\n/g, "\n")).toContain(signature);
});

test("it decides restores and corrections, and nothing else", () => {
  expect(body).toContain("IF a.action NOT IN ('restore', 'correction') THEN");
  expect(body).toContain("ELSIF p_outcome = 'approved' AND a.action = 'correction' THEN");
});

test("still refuses a decided request and the person who asked", () => {
  expect(body).toContain("IF a.decided_at IS NOT NULL THEN");
  expect(body).toContain("IF a.requested_by = p_decider THEN");
});

test("an approved correction sets the note from the request, only on a live story, with its history row", () => {
  expect(body).toContain("v_note := btrim(a.payload ->> 'note');");
  expect(body).toMatch(/SET correction_note = v_note, updated_at = now\(\)\n\s+WHERE id = a\.story_id AND workflow_state = 'published'/);
  expect(body).toContain("'desk: story % is not published any more'");
  expect(body).toContain("VALUES (a.story_id, 'correct', 'published', 'published', p_decider, p_decider_label, s.published_revision_id, v_note);");
});

test("the restore it decided before is unchanged", () => {
  const branch = (sql: string, from: string) => sql.slice(sql.indexOf(from), sql.indexOf("ELS", sql.indexOf(from)));
  expect(branch(body, "UPDATE public.stories\n       SET workflow_state = 'published'")).toBe(
    branch(restoreOnly.replace(/\r\n/g, "\n"), "UPDATE public.stories\n       SET workflow_state = 'published'")
  );
});

test("runs as the caller, on an empty search path, and only service_role may call it", () => {
  expect(body).toContain("LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''");
  expect(migration).toContain("REVOKE ALL ON FUNCTION public.desk_decide_pending(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;");
  expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.desk_decide_pending(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;");
});
