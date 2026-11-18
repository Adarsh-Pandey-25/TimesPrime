/**
 * @jest-environment node
 *
 * The Desk's migrations, read as text. desk-3 (corrections) teaches desk_decide_pending to decide a
 * correction request and keeps the restore it decided before; desk-4 (credits) sets a story's
 * credits in one transaction with its history. Both keep their functions out of readers' reach. The
 * owner runs the check queries against the real database (definition of done, item 7).
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

describe("migration desk-4: a story's credits (desk_set_credits)", () => {
  const credits = fs
    .readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-18-desk-4-credits.sql"), "utf8")
    .replace(/\r\n/g, "\n");
  const fn = credits.slice(credits.indexOf("CREATE OR REPLACE FUNCTION public.desk_set_credits"), credits.indexOf("COMMIT;"));

  test("one transaction, running as the caller on an empty search path, callable by service_role only", () => {
    expect(credits).toMatch(/^BEGIN;$/m);
    expect(credits).toMatch(/^COMMIT;$/m);
    expect(fn).toContain("LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''");
    expect(credits).toContain("REVOKE ALL ON FUNCTION public.desk_set_credits(UUID, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;");
    expect(credits).toContain("GRANT EXECUTE ON FUNCTION public.desk_set_credits(UUID, TEXT, UUID, TEXT, JSONB) TO service_role;");
  });

  test("only before publication, and only on a story that has not moved since it was read", () => {
    expect(fn).toContain("IF p_from NOT IN ('pitch', 'assigned', 'draft', 'in_review', 'desk_review', 'approved') THEN");
    expect(fn).toContain("WHERE id = p_story AND workflow_state = p_from");
    expect(fn).toContain("USING ERRCODE = 'serialization_failure'");
  });

  test("an approved story goes back to desk review, its approval cleared, in the same transaction", () => {
    expect(fn).toContain("v_to := CASE WHEN p_from = 'approved' THEN 'desk_review' ELSE p_from END;");
    expect(fn).toContain("approved_by = CASE WHEN p_from = 'approved' THEN NULL ELSE approved_by END");
    expect(fn).toContain("approved_revision_id = CASE WHEN p_from = 'approved' THEN NULL ELSE approved_revision_id END");
  });

  test("the credits replace the old ones, in order, each naming an active author; at most 20", () => {
    expect(fn).toContain("jsonb_array_length(p_credits) > 20");
    expect(fn).toContain("DELETE FROM public.story_authors WHERE story_id = p_story;");
    expect(fn).toContain("WHERE a.id = (c->>'author_id')::uuid AND a.active");
    expect(fn).toContain("VALUES (p_story, (c->>'author_id')::uuid, c->>'role', v_position);");
  });

  test("the change is in the story's history", () => {
    expect(fn).toContain("VALUES (p_story, 'credits', p_from, v_to, p_actor, p_actor_label, s.current_revision_id, NULL);");
  });
});

describe("migration desk-5: the media library (media_assets, asset_usages)", () => {
  const media = fs
    .readFileSync(path.join(process.cwd(), "database", "migrations", "2026-11-18-desk-5-media.sql"), "utf8")
    .replace(/\r\n/g, "\n");

  test("one transaction; both tables with row-level security", () => {
    expect(media).toMatch(/^BEGIN;$/m);
    expect(media).toMatch(/^COMMIT;$/m);
    expect(media).toContain("ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;");
    expect(media).toContain("ALTER TABLE public.asset_usages ENABLE ROW LEVEL SECURITY;");
  });

  test("the app's own limits: the key's shape, the four types, 15 MB, a desk, rights cleared by someone at a time", () => {
    expect(media).toContain("CHECK (storage_key ~ '^originals/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp|avif)$')");
    expect(media).toContain("CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif'))");
    expect(media).toContain("CHECK (bytes > 0 AND bytes <= 15728640)");
    expect(media).toContain("section TEXT NOT NULL REFERENCES public.sections (key)");
    expect(media).toContain("CHECK (source IN ('staff', 'agency', 'stock', 'handout', 'social'))");
    expect(media).toContain("CHECK ((rights_cleared_by IS NULL) = (rights_cleared_at IS NULL))");
  });

  test("the app never deletes: no DELETE on either table, and usages are never changed", () => {
    expect(media).toContain("REVOKE ALL ON public.media_assets, public.asset_usages FROM PUBLIC, anon, authenticated;");
    expect(media).toContain("GRANT SELECT, INSERT, UPDATE ON public.media_assets TO service_role;");
    expect(media).toContain("GRANT SELECT, INSERT ON public.asset_usages TO service_role;");
  });

  test("readers see only an image a live story's published revision uses, and never who uploaded or cleared it", () => {
    const columns = /GRANT SELECT \(([^)]*)\)\n  ON public\.media_assets TO anon, authenticated;/.exec(media)?.[1] ?? "";
    expect(columns).not.toMatch(/uploaded_by|rights_cleared_by|licence/);
    expect(media).toContain("s.published_revision_id = u.revision_id");
    expect(media).toContain("s.workflow_state = 'published'");
    expect(media).toContain("(s.embargo_until IS NULL OR s.embargo_until <= now())");
  });
});
