-- ================================================================
-- supabase-order-delivery-fix.sql — Derradj Shop
--
-- Fixes the partner/seller dashboard "✅ تسليم" button, which updates
-- orders.assignment_status: 'assigned' → 'completed' (this is the
-- SELLER's own "I delivered this" tracking — separate from the
-- admin-side orders.is_confirmed "تم التسليم" status set from
-- admin.html).
--
-- ROOT CAUSE: seller/dashboard.html's markOrderCompleted() sends
-- completed_by + completed_at in the same UPDATE as assignment_status.
-- The ORIGINAL guard_assignment_columns() trigger (from
-- supabase-assignment-system.sql) only ever allow-listed the
-- 'assignment_status' column — completed_by/completed_at were NOT
-- excluded from its diff check, so it rejected every seller
-- "تسليم" click with "Sellers may only update assignment_status".
-- (A later file, supabase-order-completion-system.sql, patched this
-- by widening the allow-list — but only if that file was actually
-- run against this project. This migration removes the fragility
-- entirely instead of depending on migration order.)
--
-- FIX: the trigger below now STAMPS completed_by/completed_at itself
-- (server-side, from auth.uid() / now()) whenever it sees a genuine
-- assigned→completed transition, and silently ignores/overwrites
-- anything the client sent for those two columns. The client
-- (seller/dashboard.html) has been simplified to send ONLY
-- { assignment_status: 'completed' } — so this now works regardless
-- of which older trigger version (if any) is currently live.
--
-- ALSO: the reverse transition (completed → assigned) is now allowed
-- too, for the "↩️ تراجع" undo button — a seller who clicked "تسليم"
-- by mistake can revert it back to "معيّن لك". On that transition the
-- trigger clears completed_by/completed_at back to NULL server-side
-- (an order that's no longer completed shouldn't keep a stale
-- completed-by/at stamp).
--
-- Safe to run multiple times. Supersedes the guard_assignment_columns()
-- definitions in both supabase-assignment-system.sql and
-- supabase-order-completion-system.sql (CREATE OR REPLACE — no need
-- to have run either first, this file is self-contained).
-- HOW TO RUN:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
-- ================================================================

-- ── 1. Columns this trigger stamps — belt-and-suspenders in case
--    supabase-order-completion-system.sql was never run. ──────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_by UUID
    CONSTRAINT orders_completed_by_fkey REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ── 2. RLS — seller can UPDATE orders assigned to them. Belt-and-
--    suspenders re-creation in case supabase-assignment-system.sql
--    was never run in this project. ─────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_seller_update_assigned" ON public.orders;
CREATE POLICY "orders_seller_update_assigned"
  ON public.orders FOR UPDATE TO authenticated
  USING      (assigned_to = public.current_staff_id())
  WITH CHECK (assigned_to = public.current_staff_id());

-- ── 3. TRIGGER FUNCTION — guard_assignment_columns()
--    Shared by orders + messages (both have assignment_status; only
--    orders has completed_by/completed_at, guarded per-table below
--    since a shared trigger's NEW/OLD are RECORD — referencing a
--    field that doesn't exist on `messages` would error at runtime).
--
--    Admin / service_role / unauthenticated (SQL editor, cron, etc.)
--    callers pass through untouched, full control, always wins.
--
--    Non-admin (seller) callers may ONLY toggle assignment_status
--    between 'assigned' and 'completed' (either direction — the
--    "تسليم" / "↩️ تراجع" pair). On orders, completed_by/completed_at
--    are reset to their OLD values first (undoing anything the client
--    sent), then re-stamped server-side ONLY on a genuine assigned→
--    completed transition (or cleared back to NULL on the reverse) —
--    so the client literally cannot set them to anything but the
--    correct calling seller / current time / NULL.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_assignment_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin()
     OR auth.uid() IS NULL
     OR current_user IN ('postgres', 'service_role')
  THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'orders' THEN
    NEW.completed_by := OLD.completed_by;
    NEW.completed_at := OLD.completed_at;
  END IF;

  IF NEW.assignment_status IS DISTINCT FROM OLD.assignment_status THEN
    IF OLD.assignment_status = 'assigned' AND NEW.assignment_status = 'completed' THEN
      IF TG_TABLE_NAME = 'orders' THEN
        NEW.completed_by := public.current_staff_id();
        NEW.completed_at := now();
      END IF;
    ELSIF TG_TABLE_NAME = 'orders' AND OLD.assignment_status = 'completed' AND NEW.assignment_status = 'assigned' THEN
      NEW.completed_by := NULL;
      NEW.completed_at := NULL;
    ELSE
      RAISE EXCEPTION 'Sellers may only toggle assignment_status between assigned and completed';
    END IF;
  END IF;

  IF (to_jsonb(NEW) - 'assignment_status' - 'completed_by' - 'completed_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'assignment_status' - 'completed_by' - 'completed_at') THEN
    RAISE EXCEPTION 'Sellers may only update assignment_status';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. Attach triggers (idempotent — CREATE OR REPLACE FUNCTION
--    above already updates the body in place if these already
--    exist, this just guarantees they exist at all). ────────────
DROP TRIGGER IF EXISTS trg_orders_guard_assignment ON public.orders;
CREATE TRIGGER trg_orders_guard_assignment
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_columns();

DROP TRIGGER IF EXISTS trg_messages_guard_assignment ON public.messages;
CREATE TRIGGER trg_messages_guard_assignment
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_columns();

-- ── 5. Reload PostgREST's schema cache (columns may have just been added) ──
NOTIFY pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'orders' AND policyname = 'orders_seller_update_assigned';
--
-- As a logged-in seller, from the app: click "تسليم" on an order
-- assigned to you → should succeed with no error toast, badge flips
-- to "مكتملة", stat cards update immediately, no page reload needed.
-- Then click "↩️ تراجع" on that same order → should succeed and flip
-- it back to "معيّن لك", with completed_by/completed_at cleared.
-- ================================================================
