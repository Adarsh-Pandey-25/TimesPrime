-- TimesPrime: Panel 7 (Compliance), M4, first part. The legal-orders register: court, government,
-- police and self-regulatory orders, what each asks, its deadline, its state, and what was done.
-- Confidential: only the back office reads it, for holders of legal_order.manage (Legal acts, the
-- Managing Editor reads). Design: Panel 7's design in docs/PANEL_DOCS.md, §2 and §3 (decision 8).
-- The design named one file, compliance-4-records, for all of M4; it is two: this one, and
-- compliance-5 for the content record.
--
-- The owner applies this in Dashboard -> SQL Editor (as postgres), AFTER Panel 0's
-- 2026-11-02-access-1-foundation.sql (public.staff_profiles, public.reject_change()). The catalogue
-- does not change: legal_order.manage is in it since Panel 0. Steps, the check and the rollback:
-- docs/OPERATIONS.md, Runbooks.
-- Idempotent: tables and indexes are IF NOT EXISTS, functions are CREATE OR REPLACE, triggers are
-- dropped before they are created, and the grants are restated in full. Safe to re-run.
--
-- What it guarantees, in the database, whatever the app does:
--   - an order is history: never deleted; what it is (its reference, authority, date, how and when
--     it arrived, what it asks, its summary, who entered it) never changes; a closed order is final;
--     each change says who made it and when;
--   - what was done about an order is an append-only list of actions;
--   - no reader reaches either table: no grant and no policy for anon or authenticated.
--
-- The app reads and writes as service_role, which bypasses RLS. Its gate is requirePermission
-- (packages/server/src/auth); RLS here protects direct reads with the anon key.

BEGIN;

-- ---- legal_orders -----------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.legal_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL CHECK (length(trim(reference)) > 0 AND char_length(reference) <= 200),
  authority_type TEXT NOT NULL CHECK (authority_type IN ('court', 'government', 'police', 'self_regulatory_body', 'other')),
  authority TEXT NOT NULL CHECK (length(trim(authority)) > 0 AND char_length(authority) <= 200),
  order_date DATE NULL,
  received_at TIMESTAMPTZ NOT NULL,
  received_via TEXT NOT NULL CHECK (received_via IN ('email', 'post', 'portal', 'in_person', 'other')),
  asks TEXT[] NOT NULL CHECK (
    cardinality(asks) >= 1
    AND asks <@ ARRAY['remove_or_block', 'preserve_records', 'give_information', 'publish_correction_or_apology', 'other']::TEXT[]
  ),
  summary TEXT NOT NULL CHECK (length(trim(summary)) > 0 AND char_length(summary) <= 4000),
  story_ids UUID[] NOT NULL DEFAULT '{}',
  due_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complied', 'partly_complied', 'challenged', 'closed')),
  -- Decision 8: no uploads; where the paper or file is kept.
  original_kept_at TEXT NOT NULL CHECK (length(trim(original_kept_at)) > 0 AND char_length(original_kept_at) <= 500),
  created_by UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID NULL REFERENCES public.staff_profiles (user_id),
  updated_at TIMESTAMPTZ NULL,
  CONSTRAINT legal_orders_received_before_entered CHECK (received_at <= created_at),
  CONSTRAINT legal_orders_updated_together CHECK ((updated_by IS NULL) = (updated_at IS NULL))
);

-- The register: open orders by their deadline; the rest newest first.
CREATE INDEX IF NOT EXISTS legal_orders_open ON public.legal_orders (due_at NULLS LAST) WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS legal_orders_received ON public.legal_orders (received_at DESC);

-- ---- history: never deleted; what an order is never changes; a closed order is final -------------

CREATE OR REPLACE FUNCTION public.legal_orders_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'legal_orders: DELETE is not allowed; an order is closed, never deleted';
  END IF;
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'legal_orders: order % is closed', OLD.id;
  END IF;
  IF (NEW.id, NEW.reference, NEW.authority_type, NEW.authority, NEW.order_date, NEW.received_at, NEW.received_via,
      NEW.asks, NEW.summary, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.reference, OLD.authority_type, OLD.authority, OLD.order_date, OLD.received_at, OLD.received_via,
      OLD.asks, OLD.summary, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'legal_orders: what an order is, and who entered it, never changes';
  END IF;
  IF NEW.updated_by IS NULL OR NEW.updated_at IS NULL THEN
    RAISE EXCEPTION 'legal_orders: a change names who made it, and when';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS legal_orders_guard ON public.legal_orders;
CREATE TRIGGER legal_orders_guard
  BEFORE UPDATE OR DELETE ON public.legal_orders
  FOR EACH ROW EXECUTE FUNCTION public.legal_orders_guard();

DROP TRIGGER IF EXISTS legal_orders_no_truncate ON public.legal_orders;
CREATE TRIGGER legal_orders_no_truncate
  BEFORE TRUNCATE ON public.legal_orders
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

-- ---- legal_order_actions: what was done, append-only ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.legal_order_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.legal_orders (id),
  body TEXT NOT NULL CHECK (length(trim(body)) > 0 AND char_length(body) <= 2000),
  author_id UUID NOT NULL REFERENCES public.staff_profiles (user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legal_order_actions_order ON public.legal_order_actions (order_id, created_at);

DROP TRIGGER IF EXISTS legal_order_actions_append_only ON public.legal_order_actions;
CREATE TRIGGER legal_order_actions_append_only
  BEFORE UPDATE OR DELETE ON public.legal_order_actions
  FOR EACH ROW EXECUTE FUNCTION public.reject_change();

DROP TRIGGER IF EXISTS legal_order_actions_no_truncate ON public.legal_order_actions;
CREATE TRIGGER legal_order_actions_no_truncate
  BEFORE TRUNCATE ON public.legal_order_actions
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_change();

-- ---- RLS, grants: the back office only --------------------------------------------------------------

ALTER TABLE public.legal_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_order_actions ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges grant everything on new public tables. Start from nothing.
REVOKE ALL ON public.legal_orders, public.legal_order_actions FROM anon, authenticated, service_role;

-- The app (service_role): read, enter and update orders, read and add actions; never DELETE (the
-- guards refuse it too). No grant and no policy for anon or authenticated: the register is
-- confidential.
GRANT SELECT, INSERT, UPDATE ON public.legal_orders TO service_role;
GRANT SELECT, INSERT ON public.legal_order_actions TO service_role;

REVOKE ALL ON FUNCTION public.legal_orders_guard() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ---- Verify (one query; expect true, true, false, false, false, 0) ---------------------------------
--   SELECT (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'legal_orders') AS rls_on,
--          (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'legal_order_actions') AS actions_rls_on,
--          has_table_privilege('service_role', 'public.legal_orders', 'DELETE') AS app_can_delete,
--          has_table_privilege('anon', 'public.legal_orders', 'SELECT') AS readers_can_read,
--          has_table_privilege('authenticated', 'public.legal_order_actions', 'SELECT') AS signed_in_can_read_actions,
--          (SELECT count(*) FROM public.legal_orders) AS orders;
--
-- ---- Rollback: before the first order ---------------------------------------------------------------
-- The register is a legal record. Once the first order is entered, the tables are kept. Before that,
-- this undoes the file:
--   BEGIN;
--   DROP TABLE IF EXISTS public.legal_order_actions;
--   DROP TABLE IF EXISTS public.legal_orders;
--   DROP FUNCTION IF EXISTS public.legal_orders_guard();
--   COMMIT;
-- Then confirm nothing is left:
--   SELECT to_regclass('public.legal_orders') IS NULL AS table_gone,
--          to_regclass('public.legal_order_actions') IS NULL AS actions_gone;   -- true, true
