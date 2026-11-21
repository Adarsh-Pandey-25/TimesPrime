/**
 * @jest-environment node
 *
 * Panel 7's migrations, read as text (design §2): what each guarantees in the database whatever the
 * app does. jest has no database; the owner runs each file's check query against the real one.
 */

import fs from "fs";
import path from "path";

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), "database", "migrations", file), "utf8").replace(/\r\n/g, "\n");
const codeOf = (sql: string) => sql.slice(0, sql.indexOf("-- ---- Verify")).replace(/--[^\n]*/g, "");

describe("compliance-1: grievances (M1)", () => {
  const sql = read("2026-11-20-compliance-1-grievances.sql");
  const code = codeOf(sql);
  const fn = (name: string) => {
    const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    expect(start).toBeGreaterThan(-1);
    return code.slice(start, code.indexOf("$$;", start));
  };
  const STAFF = ["grievance_enter", "grievance_acknowledge", "grievance_assign", "grievance_note", "grievance_decide"];

  test("one transaction, re-runnable", () => {
    expect(code.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(code.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(code).toContain("CREATE SEQUENCE IF NOT EXISTS public.grievance_tickets;");
    expect(code).toContain("CREATE TABLE IF NOT EXISTS public.grievances (");
    expect(code).toContain("CREATE TABLE IF NOT EXISTS public.grievance_notes (");
    for (const [name, table] of [
      ["grievances_guard", "grievances"],
      ["grievances_no_truncate", "grievances"],
      ["grievance_notes_append_only", "grievance_notes"],
      ["grievance_notes_no_truncate", "grievance_notes"],
    ]) {
      expect(code.indexOf(`DROP TRIGGER IF EXISTS ${name} ON public.${table};`)).toBeLessThan(code.indexOf(`CREATE TRIGGER ${name}`));
    }
  });

  test("the clocks are set once, from when it arrived: 24 hours to acknowledge, 15 days to decide", () => {
    expect(code).toContain("CHECK (ack_due_at = received_at + interval '24 hours' AND decide_due_at = received_at + interval '15 days')");
    expect(code).toContain("CHECK (received_at <= entered_at)");
    expect(fn("grievance_submit")).toContain("now(), now(), now() + interval '24 hours', now() + interval '15 days', now()");
    expect(fn("grievance_enter")).toContain("v_at, p_actor, now(), v_at + interval '24 hours', v_at + interval '15 days'");
    expect(fn("grievance_enter")).toMatch(/IF v_at > now\(\) THEN\s+RAISE EXCEPTION/);
  });

  test("the form's grievances are acknowledged on the spot; an officer's are typed in and acknowledged by a named person", () => {
    expect(code).toContain("CHECK ((channel = 'web') = (entered_by IS NULL))");
    expect(code).toContain("CHECK (channel <> 'web' OR (acknowledged_at IS NOT NULL AND acknowledged_by IS NULL))");
    expect(code).toContain("CHECK (channel = 'web' OR (acknowledged_at IS NULL) = (acknowledged_by IS NULL))");
    expect(fn("grievance_enter")).toMatch(/IF p_channel IS NULL OR p_channel NOT IN \('email', 'post', 'other'\) THEN\s+RAISE EXCEPTION/);
  });

  test("a decision comes with its outcome, its reply, who and when, and an acknowledgement", () => {
    expect(code).toMatch(/CONSTRAINT grievances_decided_together CHECK \(\s+\(state = 'decided'\) = \(outcome IS NOT NULL\)\s+AND \(outcome IS NULL\) = \(reply IS NULL\)/);
    expect(code).toContain("CHECK (state <> 'decided' OR acknowledged_at IS NOT NULL)");
    const decide = fn("grievance_decide");
    expect(decide).toContain("SET state = 'decided', outcome = p_outcome, reply = trim(p_reply), decided_by = p_actor, decided_at = now(),");
    expect(decide).toContain("acknowledged_at = coalesce(acknowledged_at, now())");
  });

  test("history: never deleted or truncated; what was sent and its clocks never change; an acknowledgement stands; a decision is final", () => {
    const guard = fn("grievances_guard");
    expect(guard).toMatch(/IF TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION/);
    expect(guard).toMatch(/IF OLD\.state = 'decided' THEN\s+RAISE EXCEPTION/);
    for (const column of ["ticket", "channel", "name", "email", "about_url", "story_id", "category", "body", "received_at", "entered_by", "ack_due_at", "decide_due_at"]) {
      expect(guard).toContain(`NEW.${column}`);
      expect(guard).toContain(`OLD.${column}`);
    }
    expect(guard).toMatch(/IF OLD\.acknowledged_at IS NOT NULL\s+AND \(NEW\.acknowledged_at, NEW\.acknowledged_by\) IS DISTINCT FROM/);
    expect(code).toMatch(/BEFORE UPDATE OR DELETE ON public\.grievances\s+FOR EACH ROW EXECUTE FUNCTION public\.grievances_guard\(\);/);
    expect(code).toMatch(/BEFORE TRUNCATE ON public\.grievances\s+FOR EACH STATEMENT EXECUTE FUNCTION public\.reject_change\(\);/);
    expect(code).toMatch(/BEFORE UPDATE OR DELETE ON public\.grievance_notes\s+FOR EACH ROW EXECUTE FUNCTION public\.reject_change\(\);/);
    expect(code).toMatch(/BEFORE TRUNCATE ON public\.grievance_notes\s+FOR EACH STATEMENT EXECUTE FUNCTION public\.reject_change\(\);/);
  });

  test("the officers' changes lock the grievance and refuse the wrong state", () => {
    for (const name of ["grievance_acknowledge", "grievance_assign", "grievance_decide"]) {
      expect(fn(name)).toContain("FROM public.grievances WHERE id = p_grievance FOR UPDATE;");
      expect(fn(name)).toMatch(/ERRCODE = 'object_not_in_prerequisite_state'/);
    }
    expect(fn("grievance_assign")).toContain("p.user_id = p_assignee AND p.status = 'active'");
  });

  test("decision 1: readers reach grievances only through the two functions, which run as their owner", () => {
    for (const name of ["grievance_submit", "grievance_status"]) expect(fn(name)).toContain("SECURITY DEFINER SET search_path = ''");
    for (const name of [...STAFF, "grievance_ticket", "grievances_guard"]) expect(fn(name)).toContain("SECURITY INVOKER SET search_path = ''");
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION\s+public\.grievance_submit\(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT\),\s+public\.grievance_status\(TEXT, TEXT\)\s+TO anon, service_role;/);
    const toApp = code.slice(code.lastIndexOf("GRANT EXECUTE ON FUNCTION"), code.indexOf("TO service_role;", code.lastIndexOf("GRANT EXECUTE ON FUNCTION")));
    for (const name of STAFF) expect(toApp).toContain(`public.${name}(`);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*?public\.grievance_decide\(UUID, UUID, TEXT, TEXT\)\s+FROM PUBLIC, anon, authenticated;/);
  });

  test("the form holds 500 a day across the site, keeps a story only when it is published, and answers a status only to ticket and email together", () => {
    const submit = fn("grievance_submit");
    expect(submit).toMatch(/x\.channel = 'web' AND x\.received_at > now\(\) - interval '24 hours'\) >= 500 THEN\s+RAISE EXCEPTION[^;]*ERRCODE = 'program_limit_exceeded'/);
    expect(submit).toContain("s.id = p_story AND s.workflow_state = 'published'");
    expect(submit).toContain("'web'");
    const status = fn("grievance_status");
    expect(status).toContain("WHERE x.ticket = upper(trim(p_ticket)) AND lower(x.email) = lower(trim(p_email));");
    expect(status).toMatch(/IF NOT FOUND THEN\s+RETURN NULL;/);
    expect(status).not.toMatch(/'(name|email|body)'/);
  });

  test("RLS on, no reader grant or policy on either table; the app may read, enter and decide but never DELETE", () => {
    expect(code).toContain("ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;");
    expect(code).toContain("ALTER TABLE public.grievance_notes ENABLE ROW LEVEL SECURITY;");
    expect(code).toContain("REVOKE ALL ON public.grievances, public.grievance_notes FROM anon, authenticated, service_role;");
    expect(code).toContain("REVOKE ALL ON SEQUENCE public.grievance_tickets FROM PUBLIC, anon, authenticated, service_role;");
    expect(code).toContain("GRANT SELECT, INSERT, UPDATE ON public.grievances TO service_role;");
    expect(code).toContain("GRANT SELECT, INSERT ON public.grievance_notes TO service_role;");
    expect(code).not.toMatch(/GRANT[^;]*DELETE/);
    expect(code).not.toMatch(/GRANT[^;]*ON public\.grievance[^;]*TO[^;]*\b(anon|authenticated)\b/);
    expect(code).not.toMatch(/CREATE POLICY/);
  });

  test("a check query and a rollback that drops the tables, the functions and the sequence", () => {
    expect(sql).toContain("-- ---- Verify (one query; expect true, true, false, false, false, true, true, false, true, 0)");
    expect(sql).toContain("--   DROP TABLE IF EXISTS public.grievances;");
    expect(sql).toContain("--   DROP TABLE IF EXISTS public.grievance_notes;");
    expect(sql).toContain("--   DROP SEQUENCE IF EXISTS public.grievance_tickets;");
  });
});

describe("compliance-2: the corrections log (M2)", () => {
  const sql = read("2026-11-21-compliance-2-corrections.sql");
  const code = codeOf(sql);
  const fn = (name: string) => {
    const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    expect(start).toBeGreaterThan(-1);
    return code.slice(start, code.indexOf("$$;", start));
  };

  test("one transaction, re-runnable: the copy of earlier corrections skips what it already copied", () => {
    expect(code.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(code.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(code).toContain("CREATE TABLE IF NOT EXISTS public.corrections (");
    for (const name of ["corrections_append_only", "corrections_no_truncate"]) {
      expect(code.indexOf(`DROP TRIGGER IF EXISTS ${name} ON public.corrections;`)).toBeLessThan(code.indexOf(`CREATE TRIGGER ${name}`));
    }
    expect(code).toMatch(/FROM public\.workflow_transitions t[\s\S]*WHERE t\.action = 'correct'[\s\S]*ON CONFLICT \(transition_id\) DO NOTHING;/);
  });

  test("decision 6: five kinds, the text to 600 characters, one history row each, a request names who asked", () => {
    expect(code).toContain("kind IN ('correction', 'clarification', 'update', 'editors_note', 'retraction')");
    expect(code).toContain("char_length(text) <= 600");
    expect(code).toContain("transition_id BIGINT NOT NULL UNIQUE REFERENCES public.workflow_transitions (id)");
    expect(code).toContain("grievance_id UUID NULL REFERENCES public.grievances (id)");
    expect(code).toContain("CHECK (requested_by IS NULL OR requested_by <> published_by)");
  });

  test("history: never changed, deleted or truncated", () => {
    expect(code).toMatch(/BEFORE UPDATE OR DELETE ON public\.corrections\s+FOR EACH ROW EXECUTE FUNCTION public\.reject_change\(\);/);
    expect(code).toMatch(/BEFORE TRUNCATE ON public\.corrections\s+FOR EACH STATEMENT EXECUTE FUNCTION public\.reject_change\(\);/);
  });

  test("desk_correct: only a live story; the note, its history row and the log's row in one transaction", () => {
    const correct = fn("desk_correct");
    expect(correct).toContain("WHERE id = p_story AND workflow_state = 'published'");
    expect(correct).toMatch(/IF NOT FOUND THEN\s+RAISE EXCEPTION[^;]*ERRCODE = 'serialization_failure'/);
    expect(correct).toContain("SET correction_note = v_text");
    expect(correct).toMatch(/INSERT INTO public\.workflow_transitions[\s\S]*'correct', 'published', 'published'[\s\S]*RETURNING id INTO v_transition;/);
    expect(correct).toMatch(/INSERT INTO public\.corrections[\s\S]*p_grievance, v_transition, p_actor\)/);
  });

  test("an approved request writes the log's row with its kind, grievance and who asked; a restore is unchanged", () => {
    const decide = fn("desk_decide_pending");
    expect(decide).toContain("v_kind := coalesce(a.payload ->> 'kind', 'correction');");
    expect(decide).toContain("v_grievance := nullif(a.payload ->> 'grievance_id', '')::uuid;");
    expect(decide).toMatch(/v_grievance, v_transition, p_decider, a\.requested_by\);/);
    expect(decide).toContain("IF a.requested_by = p_decider THEN");
    expect(decide).toContain("WHERE id = a.story_id AND workflow_state = 'unpublished' AND published_revision_id IS NOT NULL");
  });

  test("readers' log: one function, run as its owner; headline and address only while the story is live; no staff", () => {
    const log = fn("corrections_log");
    expect(log).toContain("SECURITY DEFINER SET search_path = ''");
    expect(log).toContain("(s.workflow_state = 'published' AND (s.embargo_until IS NULL OR s.embargo_until <= now())) AS live");
    for (const column of ["live_headline", "section", "slug", "public_id"]) expect(log).toContain(`CASE WHEN p.live THEN p.${column} END`);
    expect(log).toContain("LIMIT least(greatest(coalesce(p_limit, 30), 1), 100)");
    expect(log).not.toMatch(/published_by|requested_by|grievance_id/);
    for (const name of ["desk_correct", "desk_decide_pending"]) expect(fn(name)).toContain("SECURITY INVOKER SET search_path = ''");
  });

  test("RLS on, no reader grant or policy on the table; the app reads and adds only; readers run the log alone", () => {
    expect(code).toContain("ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;");
    expect(code).toContain("REVOKE ALL ON public.corrections FROM anon, authenticated, service_role;");
    expect(code).toContain("GRANT SELECT, INSERT ON public.corrections TO service_role;");
    expect(code).not.toMatch(/GRANT[^;]*(UPDATE|DELETE)[^;]*corrections/);
    expect(code).not.toMatch(/CREATE POLICY/);
    expect(code).toContain("GRANT EXECUTE ON FUNCTION public.corrections_log(UUID, TIMESTAMPTZ, INTEGER) TO anon, service_role;");
    expect(code).toMatch(/GRANT EXECUTE ON FUNCTION\s+public\.desk_correct\(UUID, UUID, TEXT, TEXT, TEXT, UUID\),\s+public\.desk_decide_pending\(UUID, UUID, TEXT, TEXT, TEXT\)\s+TO service_role;/);
  });

  test("a check query and a rollback that drops the table and functions, and puts desk-3's function back", () => {
    expect(sql).toContain("-- ---- Verify (one query; expect true, false, false, false, true, false, true, true)");
    expect(sql).toContain("--   DROP TABLE IF EXISTS public.corrections;");
    expect(sql).toContain("--   -- then run 2026-11-17-desk-3-corrections.sql whole.");
  });
});
