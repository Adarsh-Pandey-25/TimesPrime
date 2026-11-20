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

describe("front-2: pinned slots (M2)", () => {
  const sql = read("2026-11-20-front-2-pins.sql");
  const code = codeOf(sql);
  const fn = (name: string) => {
    const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    return code.slice(start, code.indexOf("$$;", start));
  };

  test("one transaction, re-runnable", () => {
    expect(code.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(code.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(code).toContain("CREATE TABLE IF NOT EXISTS public.front_page_pins (");
    for (const name of ["front_page_pins_guard", "front_page_pins_no_truncate"]) {
      expect(code.indexOf(`DROP TRIGGER IF EXISTS ${name} ON public.front_page_pins;`)).toBeLessThan(code.indexOf(`CREATE TRIGGER ${name}`));
    }
    expect(code.indexOf("DROP POLICY IF EXISTS front_page_pins_read_live")).toBeLessThan(code.indexOf("CREATE POLICY front_page_pins_read_live"));
  });

  test("a pin always ends, at most 7 days on; 3 slots on the home page (no section), 2 on a section page", () => {
    expect(code).toContain("ends_at TIMESTAMPTZ NOT NULL,");
    expect(code).toContain("CHECK (ends_at > starts_at AND ends_at <= starts_at + interval '7 days')");
    expect(code).toContain("CHECK (slot >= 1 AND slot <= CASE WHEN section IS NULL THEN 3 ELSE 2 END)");
    expect(code).toContain("section TEXT NULL REFERENCES public.sections (key),");
    expect(code).toContain("story_id UUID NOT NULL REFERENCES public.stories (id),");
  });

  test("history: never deleted or truncated, and only the end of a pin may be set, moved only earlier", () => {
    const guard = fn("front_page_pins_guard");
    expect(guard).toMatch(/IF TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION/);
    expect(guard).toContain("NEW.ended_at > OLD.ended_at");
    expect(guard).toContain("only the end of a pin may be set");
    expect(code).toMatch(/BEFORE UPDATE OR DELETE ON public\.front_page_pins\s+FOR EACH ROW EXECUTE FUNCTION public\.front_page_pins_guard\(\);/);
    expect(code).toMatch(/BEFORE TRUNCATE ON public\.front_page_pins\s+FOR EACH STATEMENT EXECUTE FUNCTION public\.reject_change\(\);/);
  });

  test("front_pin: the four lengths, the page's slots, one change per page at a time", () => {
    const pin = fn("front_pin");
    expect(pin).toContain("p_hours NOT IN (6, 24, 72, 168)");
    expect(pin).toContain("p_slot > (CASE WHEN p_section IS NULL THEN 3 ELSE 2 END) THEN");
    expect(pin).toContain("pg_advisory_xact_lock(");
    expect(pin).toContain("greatest(coalesce(p_starts_at, now()), now())");
  });

  test("front_pin: the story must be published, of the page's language and section, and not pinned twice on it", () => {
    const pin = fn("front_pin");
    expect(pin).toMatch(/IF s\.workflow_state <> 'published' THEN\s+RAISE EXCEPTION[^;]*ERRCODE = 'object_not_in_prerequisite_state'/);
    expect(pin).toMatch(/IF s\.language <> p_language OR \(p_section IS NOT NULL AND s\.section <> p_section\) THEN\s+RAISE EXCEPTION[^;]*ERRCODE = 'check_violation'/);
    expect(pin).toMatch(/p\.slot <> p_slot\s+AND p\.story_id = p_story/);
  });

  test("front_pin: the slot's overlapping pins are ended (replaced), then the new one is inserted", () => {
    const pin = fn("front_pin");
    expect(pin).toContain("end_reason = 'replaced'");
    expect(pin).toContain("CASE WHEN p.starts_at < v_start THEN v_start ELSE now() END");
    expect(pin.indexOf("UPDATE public.front_page_pins p")).toBeLessThan(pin.indexOf("INSERT INTO public.front_page_pins"));
    expect(pin).toContain("jsonb_build_object('pin', to_jsonb(pin), 'replaced', to_jsonb(v_replaced))");
  });

  test("front_unpin ends a pin now, and refuses one that has already ended", () => {
    const unpin = fn("front_unpin");
    expect(unpin).toContain("SET ended_at = now(), ended_by = p_actor, end_reason = 'unpinned'");
    expect(unpin).toContain("WHERE id = p_pin AND ends_at > now() AND (ended_at IS NULL OR ended_at > now())");
    expect(unpin).toContain("ERRCODE = 'object_not_in_prerequisite_state'");
  });

  test("RLS on; the app may read, pin and end but never DELETE; readers see six columns of the pins showing now", () => {
    expect(code).toContain("ALTER TABLE public.front_page_pins ENABLE ROW LEVEL SECURITY;");
    expect(code).toContain("REVOKE ALL ON public.front_page_pins FROM anon, authenticated, service_role;");
    expect(code).toContain("GRANT SELECT, INSERT, UPDATE ON public.front_page_pins TO service_role;");
    expect(code).not.toMatch(/GRANT[^;]*DELETE[^;]*front_page_pins/);
    expect(code).toContain("GRANT SELECT (language, section, slot, story_id, starts_at, ends_at) ON public.front_page_pins TO anon, authenticated;");
    expect(code).toContain("USING (starts_at <= now() AND ends_at > now() AND (ended_at IS NULL OR ended_at > now()));");
  });

  test("the functions are not RPC for readers: only the app may call them", () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*?public\.front_pin\(UUID, TEXT, TEXT, INT, UUID, TIMESTAMPTZ, INT\),[\s\S]*?FROM PUBLIC, anon, authenticated;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION\s+public\.front_pin\(UUID, TEXT, TEXT, INT, UUID, TIMESTAMPTZ, INT\),\s+public\.front_unpin\(UUID, UUID\)\s+TO service_role;/);
    for (const name of ["front_page_pins_guard", "front_pin", "front_unpin"]) expect(fn(name)).toContain("SECURITY INVOKER SET search_path = ''");
  });

  test("a check query and a rollback that drops the table and its functions", () => {
    expect(sql).toContain("-- ---- Verify (one query; expect true, false, false, true, false, true, 0)");
    expect(sql).toContain("--   DROP TABLE IF EXISTS public.front_page_pins;");
    expect(sql).toContain("--   DROP FUNCTION IF EXISTS public.front_page_pins_guard();");
  });
});

describe("front-3: live blogs (M3)", () => {
  const sql = read("2026-11-20-front-3-live.sql");
  const code = codeOf(sql);
  const fn = (name: string) => {
    const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    return code.slice(start, code.indexOf("$$;", start));
  };
  const OPEN = /IF s\.format <> 'live_blog' OR s\.workflow_state <> 'published' OR s\.live_ended_at IS NOT NULL THEN\s+RAISE EXCEPTION[^;]*ERRCODE = 'object_not_in_prerequisite_state'/;

  test("one transaction, re-runnable", () => {
    expect(code.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(code.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(code).toContain("ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS live_ended_at TIMESTAMPTZ NULL;");
    expect(code).toContain("CREATE TABLE IF NOT EXISTS public.live_updates (");
    for (const name of ["live_updates_guard", "live_updates_no_truncate"]) {
      expect(code.indexOf(`DROP TRIGGER IF EXISTS ${name} ON public.live_updates;`)).toBeLessThan(code.indexOf(`CREATE TRIGGER ${name}`));
    }
    expect(code.indexOf("DROP POLICY IF EXISTS live_updates_read_published")).toBeLessThan(code.indexOf("CREATE POLICY live_updates_read_published"));
  });

  test("the table: a headline to 110 characters, a removal with who, when and why, one pinned update per story", () => {
    expect(code).toContain("CHECK (headline IS NULL OR (length(trim(headline)) > 0 AND char_length(headline) <= 110))");
    expect(code).toContain("CHECK ((removed_by IS NULL) = (removed_at IS NULL) AND (removed_at IS NULL) = (removed_reason IS NULL))");
    expect(code).toContain("CHECK (removed_at IS NULL OR NOT is_pinned)");
    expect(code).toContain("CREATE UNIQUE INDEX IF NOT EXISTS live_updates_one_pinned ON public.live_updates (story_id) WHERE is_pinned;");
  });

  test("history: never deleted or truncated; a removed update stays removed; its story, author and time never change", () => {
    const guard = fn("live_updates_guard");
    expect(guard).toMatch(/IF TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION/);
    expect(guard).toMatch(/IF OLD\.removed_at IS NOT NULL THEN\s+RAISE EXCEPTION/);
    expect(guard).toContain("(NEW.id, NEW.story_id, NEW.posted_by, NEW.posted_at) IS DISTINCT FROM (OLD.id, OLD.story_id, OLD.posted_by, OLD.posted_at)");
    expect(code).toMatch(/BEFORE UPDATE OR DELETE ON public\.live_updates\s+FOR EACH ROW EXECUTE FUNCTION public\.live_updates_guard\(\);/);
    expect(code).toMatch(/BEFORE TRUNCATE ON public\.live_updates\s+FOR EACH STATEMENT EXECUTE FUNCTION public\.reject_change\(\);/);
  });

  test("posting, editing and ending need an open live blog, with the story's row locked", () => {
    for (const name of ["live_post", "live_edit", "live_end"]) {
      expect(fn(name)).toMatch(OPEN);
      expect(fn(name)).toMatch(/FROM public\.stories WHERE id = [\w.]+ FOR UPDATE;/);
    }
  });

  test("pinning an update unpins the story's other one; an edit of a removed update is refused", () => {
    expect(fn("live_post")).toContain("UPDATE public.live_updates SET is_pinned = false WHERE story_id = p_story AND is_pinned;");
    expect(fn("live_edit")).toContain("UPDATE public.live_updates SET is_pinned = false WHERE story_id = u.story_id AND is_pinned AND id <> p_update;");
    expect(fn("live_edit")).toMatch(/IF u\.removed_at IS NOT NULL THEN\s+RAISE EXCEPTION/);
  });

  test("decision 7: removing keeps the update, with who, when and why, unpinned; at any time, also after the end", () => {
    const remove = fn("live_remove");
    expect(remove).toContain("SET removed_by = p_actor, removed_at = now(), removed_reason = p_reason, is_pinned = false");
    expect(remove).not.toMatch(/live_ended_at/);
  });

  test("ending records the end on the story and in its history", () => {
    const end = fn("live_end");
    expect(end).toContain("UPDATE public.stories SET live_ended_at = now(), updated_at = now() WHERE id = p_story");
    expect(end).toMatch(/INSERT INTO public\.workflow_transitions[\s\S]*'end_live', 'published', 'published'/);
  });

  test("RLS on; the app may read, post, change and remove but never DELETE; readers see a live story's updates, not who wrote them", () => {
    expect(code).toContain("ALTER TABLE public.live_updates ENABLE ROW LEVEL SECURITY;");
    expect(code).toContain("REVOKE ALL ON public.live_updates FROM anon, authenticated, service_role;");
    expect(code).toContain("GRANT SELECT, INSERT, UPDATE ON public.live_updates TO service_role;");
    expect(code).not.toMatch(/GRANT[^;]*DELETE[^;]*live_updates/);
    expect(code).toMatch(/GRANT SELECT \(id, story_id, headline, body, is_key_event, is_pinned, posted_at, edited_at\)\s+ON public\.live_updates TO anon, authenticated;/);
    expect(code).toContain("GRANT SELECT (live_ended_at) ON public.stories TO anon, authenticated;");
    expect(code).toMatch(/USING \(removed_at IS NULL AND EXISTS \(SELECT 1 FROM public\.stories s[\s\S]*s\.workflow_state = 'published'[\s\S]*s\.embargo_until <= now\(\)\)\)\);/);
  });

  test("the functions are not RPC for readers: only the app may call them", () => {
    expect(code).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*?public\.live_end\(UUID, UUID\)\s+FROM PUBLIC, anon, authenticated;/);
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*?public\.live_end\(UUID, UUID\)\s+TO service_role;/);
    for (const name of ["live_updates_guard", "live_post", "live_edit", "live_remove", "live_end"]) expect(fn(name)).toContain("SECURITY INVOKER SET search_path = ''");
  });

  test("a check query and a rollback that drops the table, the functions and the column", () => {
    expect(sql).toContain("-- ---- Verify (one query; expect true, true, false, false, true, false, true, 0)");
    expect(sql).toContain("--   DROP TABLE IF EXISTS public.live_updates;");
    expect(sql).toContain("--   ALTER TABLE public.stories DROP COLUMN IF EXISTS live_ended_at;");
  });
});
