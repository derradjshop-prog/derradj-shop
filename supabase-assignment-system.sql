-- ================================================================
-- Derradj Shop — Order & Message Assignment System
-- نظام تعيين الطلبات والرسائل للبائعين
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (every statement is idempotent).
--
-- ⚠️  BEFORE RUNNING — read this:
-- This file adds RESTRICTIVE policies on orders / messages / staff_accounts.
-- Postgres OR's all policies that apply to the same command together, so if
-- an older, more permissive policy is still sitting on any of these three
-- tables (e.g. something like `USING (auth.role() = 'authenticated')` with
-- no further restriction — none of that is committed anywhere in this repo,
-- which means it was created by hand in the dashboard at some point), it
-- will silently let a seller bypass everything created below.
--
-- → AFTER running this file, open Supabase Dashboard → Authentication →
--   Policies and check `orders`, `messages`, `staff_accounts` for any
--   leftover catch-all policy from before this migration. Remove/tighten it.
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- 1. HELPER FUNCTIONS — SECURITY DEFINER so they can read
--    staff_accounts regardless of the caller's own row visibility,
--    and so RLS policies/triggers below never recurse into RLS-
--    checked queries against staff_accounts themselves.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_staff_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.staff_accounts
  WHERE id = auth.uid() AND is_active = TRUE
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_staff_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.current_staff_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.staff_accounts
  WHERE id = auth.uid() AND is_active = TRUE
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_id()     TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- 2. staff_accounts — enable RLS (currently uncommitted/unknown)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.staff_accounts ENABLE ROW LEVEL SECURITY;

-- Every staff member can read their own row (needed by every login/authGuard
-- check in admin/login.js, seller login, admin.js, seller/books.html).
-- Admin can read everyone (needed for Assignment History display names).
DROP POLICY IF EXISTS "staff_accounts_self_or_admin_select" ON public.staff_accounts;
CREATE POLICY "staff_accounts_self_or_admin_select"
  ON public.staff_accounts
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

-- Any logged-in staff member can list active sellers — powers the dynamic
-- "Assign to Seller" dropdown. Never hardcode seller names/ids in the app;
-- this is the single source of truth for "who can an order be assigned to."
DROP POLICY IF EXISTS "staff_accounts_sellers_listing_select" ON public.staff_accounts;
CREATE POLICY "staff_accounts_sellers_listing_select"
  ON public.staff_accounts
  FOR SELECT
  TO authenticated
  USING (role = 'seller' AND is_active = TRUE);

-- No INSERT/UPDATE/DELETE policy added — staff account management is a
-- separate concern from this feature and is left exactly as it was.


-- ──────────────────────────────────────────────────────────────
-- 3. orders — new assignment columns
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_to UUID
    CONSTRAINT orders_assigned_to_fkey REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by UUID
    CONSTRAINT orders_assigned_by_fkey REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assignment_status TEXT NOT NULL DEFAULT 'pending_admin';

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_assignment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_assignment_status_check
  CHECK (assignment_status IN ('pending_admin', 'assigned', 'completed'));

CREATE INDEX IF NOT EXISTS idx_orders_assigned_to        ON public.orders (assigned_to);
CREATE INDEX IF NOT EXISTS idx_orders_assignment_status  ON public.orders (assignment_status);

COMMENT ON COLUMN public.orders.assignment_status IS
  'pending_admin = not yet assigned (admin-only visibility) | assigned = visible to assigned_to seller | completed = seller marked done';


-- ──────────────────────────────────────────────────────────────
-- 4. messages — same assignment columns
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS assigned_to UUID
    CONSTRAINT messages_assigned_to_fkey REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_by UUID
    CONSTRAINT messages_assigned_by_fkey REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assignment_status TEXT NOT NULL DEFAULT 'pending_admin';

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_assignment_status_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_assignment_status_check
  CHECK (assignment_status IN ('pending_admin', 'assigned', 'completed'));

CREATE INDEX IF NOT EXISTS idx_messages_assigned_to       ON public.messages (assigned_to);
CREATE INDEX IF NOT EXISTS idx_messages_assignment_status ON public.messages (assignment_status);


-- ──────────────────────────────────────────────────────────────
-- 5. assignment_history — audit trail, written ONLY by the trigger
--    below (no client INSERT/UPDATE/DELETE policy exists for it).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_history (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT         NOT NULL CHECK (entity_type IN ('order', 'message')),
  entity_id     TEXT         NOT NULL,  -- TEXT so it works regardless of the orders/messages id column type
  action        TEXT         NOT NULL CHECK (action IN ('assigned', 'reassigned', 'unassigned', 'completed')),
  from_staff_id UUID         REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  to_staff_id   UUID         REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  performed_by  UUID         REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_history_entity
  ON public.assignment_history (entity_type, entity_id, created_at DESC);

ALTER TABLE public.assignment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignment_history_admin_select" ON public.assignment_history;
CREATE POLICY "assignment_history_admin_select"
  ON public.assignment_history
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policy for ANY client role. Rows are written only
-- by log_assignment_history() below, which (being SECURITY DEFINER, owned
-- by the table owner) bypasses RLS the same way any table-owner write does.


-- ──────────────────────────────────────────────────────────────
-- 6. TRIGGER FUNCTION — guard_assignment_columns()
--    Shared by orders + messages. RLS is row-based, not column-based:
--    a seller's UPDATE policy lets them write to a row they own, but
--    nothing stops them writing any COLUMN on that row without this.
--    Admin passes through untouched. Non-admin (seller) callers may
--    ONLY flip assignment_status from 'assigned' to 'completed' —
--    every other column, including assigned_to/assigned_by/assigned_at,
--    is read-only to them.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_assignment_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'assignment_status') IS DISTINCT FROM (to_jsonb(OLD) - 'assignment_status') THEN
    RAISE EXCEPTION 'Sellers may only update assignment_status';
  END IF;

  IF NEW.assignment_status IS DISTINCT FROM OLD.assignment_status
     AND NOT (OLD.assignment_status = 'assigned' AND NEW.assignment_status = 'completed') THEN
    RAISE EXCEPTION 'Sellers may only mark an assigned item as completed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_guard_assignment ON public.orders;
CREATE TRIGGER trg_orders_guard_assignment
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_columns();

DROP TRIGGER IF EXISTS trg_messages_guard_assignment ON public.messages;
CREATE TRIGGER trg_messages_guard_assignment
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_columns();


-- ──────────────────────────────────────────────────────────────
-- 7. TRIGGER FUNCTION — log_assignment_history()
--    Shared by orders + messages. Fires AFTER the row is actually
--    updated, so it records what really happened — can't be skipped
--    by a UI bug since it's never written by client code directly.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_assignment_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entity_type TEXT;
  v_action      TEXT;
BEGIN
  v_entity_type := CASE TG_TABLE_NAME
                     WHEN 'orders'   THEN 'order'
                     WHEN 'messages' THEN 'message'
                   END;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    v_action := CASE
                  WHEN OLD.assigned_to IS NULL THEN 'assigned'
                  WHEN NEW.assigned_to IS NULL THEN 'unassigned'
                  ELSE 'reassigned'
                END;
  ELSIF NEW.assignment_status IS DISTINCT FROM OLD.assignment_status
        AND NEW.assignment_status = 'completed' THEN
    v_action := 'completed';
  ELSE
    RETURN NEW; -- nothing assignment-related changed — nothing to log
  END IF;

  INSERT INTO public.assignment_history
    (entity_type, entity_id, action, from_staff_id, to_staff_id, performed_by)
  VALUES
    (v_entity_type, NEW.id::text, v_action, OLD.assigned_to, NEW.assigned_to, public.current_staff_id());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_log_assignment ON public.orders;
CREATE TRIGGER trg_orders_log_assignment
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_assignment_history();

DROP TRIGGER IF EXISTS trg_messages_log_assignment ON public.messages;
CREATE TRIGGER trg_messages_log_assignment
  AFTER UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.log_assignment_history();


-- ──────────────────────────────────────────────────────────────
-- 8. RLS — orders
--    Existing anon INSERT policy (supabase-setup.sql) is untouched —
--    the live checkout flow keeps working exactly as before.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_admin_select" ON public.orders;
CREATE POLICY "orders_admin_select"
  ON public.orders FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "orders_seller_select_assigned" ON public.orders;
CREATE POLICY "orders_seller_select_assigned"
  ON public.orders FOR SELECT TO authenticated
  USING (assigned_to = public.current_staff_id());

DROP POLICY IF EXISTS "orders_admin_update" ON public.orders;
CREATE POLICY "orders_admin_update"
  ON public.orders FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "orders_seller_update_assigned" ON public.orders;
CREATE POLICY "orders_seller_update_assigned"
  ON public.orders FOR UPDATE TO authenticated
  USING (assigned_to = public.current_staff_id())
  WITH CHECK (assigned_to = public.current_staff_id());

DROP POLICY IF EXISTS "orders_admin_delete" ON public.orders;
CREATE POLICY "orders_admin_delete"
  ON public.orders FOR DELETE TO authenticated
  USING (public.is_admin());
-- No seller DELETE policy — absence of a policy means denied by default.


-- ──────────────────────────────────────────────────────────────
-- 9. RLS — messages
--    Existing anon INSERT policy/path used by contact.html's raw
--    fetch() POST is untouched.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_admin_select" ON public.messages;
CREATE POLICY "messages_admin_select"
  ON public.messages FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "messages_seller_select_assigned" ON public.messages;
CREATE POLICY "messages_seller_select_assigned"
  ON public.messages FOR SELECT TO authenticated
  USING (assigned_to = public.current_staff_id());

DROP POLICY IF EXISTS "messages_admin_update" ON public.messages;
CREATE POLICY "messages_admin_update"
  ON public.messages FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "messages_seller_update_assigned" ON public.messages;
CREATE POLICY "messages_seller_update_assigned"
  ON public.messages FOR UPDATE TO authenticated
  USING (assigned_to = public.current_staff_id())
  WITH CHECK (assigned_to = public.current_staff_id());

DROP POLICY IF EXISTS "messages_admin_delete" ON public.messages;
CREATE POLICY "messages_admin_delete"
  ON public.messages FOR DELETE TO authenticated
  USING (public.is_admin());
-- No seller DELETE policy — absence of a policy means denied by default.


-- ──────────────────────────────────────────────────────────────
-- 10. REALTIME — add orders/messages to the realtime publication so
--     the in-dashboard live badge/toast notifications can subscribe.
--     Still confirm in Supabase Dashboard → Database → Replication
--     that both tables show as enabled — this statement alone isn't
--     a substitute for checking that toggle.
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ================================================================
-- ✅ Done — verify with:
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'orders'
--   AND column_name IN ('assigned_to','assigned_by','assigned_at','assignment_status');
--
-- SELECT * FROM public.assignment_history ORDER BY created_at DESC LIMIT 20;
--
-- ⚠️  Reminder: now check Supabase Dashboard → Authentication → Policies
-- for `orders`, `messages`, `staff_accounts` and remove any leftover
-- permissive policy that predates this migration (see warning at top).
-- ================================================================
