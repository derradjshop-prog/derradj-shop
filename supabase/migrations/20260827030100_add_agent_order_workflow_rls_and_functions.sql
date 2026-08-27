-- ================================================================
-- Derradj Shop — Call Agent role: order workflow RLS + payout function
-- موظفة تتبع الطلبيات — صلاحيات الطلبيات وتابع دفع العمولة
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (every statement is idempotent).
--
-- Depends on 20260827030000_add_agent_role_and_commission_schema.sql —
-- run that file first (adds delivery_status, assigned_agent_id,
-- agent_earnings, agent_commission, commission_paid).
--
-- WHAT THIS ADDS ───────────────────────────────────────────────────
-- 1. guard_agent_order_update() — a BEFORE UPDATE trigger on orders.
--    Admin / service_role / unauthenticated callers (SQL editor, cron)
--    pass through untouched — same bypass pattern as
--    guard_assignment_columns() in supabase-assignment-system.sql.
--    For an 'agent' caller: ONLY delivery_status may change, and ONLY
--    pending->confirmed or {pending,confirmed}->cancelled — she can
--    never set shipped/out_for_delivery/delivered, matching the spec
--    exactly. This is the real security boundary; the agent dashboard
--    UI simply never renders buttons for the transitions this trigger
--    would reject anyway.
--    It ALSO stamps the matching *_at column (confirmed_at/shipped_at/
--    out_for_delivery_at/delivered_at/cancelled_at) whenever
--    delivery_status changes — for ANY caller, admin included — so the
--    "تم الشحن"/"جاري التسليم" admin buttons (plain UPDATEs, no special
--    function needed) get timestamped for free, powering the status
--    timeline in the agent's order-detail view.
-- 2. RLS on orders for 'agent': SELECT/UPDATE/DELETE scoped to
--    assigned_agent_id = current_staff_id() — mirrors the seller
--    policies (orders_seller_select_assigned / _update_assigned /
--    admin/add-seller-order-delete-policy.sql) exactly, on the new
--    column instead of assigned_to.
-- 3. RLS on agent_earnings: agent sees only her own rows, admin sees
--    all. No client INSERT/UPDATE/DELETE policy — rows are written
--    only by mark_order_delivered() below (SECURITY DEFINER bypasses
--    RLS, same pattern as assignment_history).
-- 4. mark_order_delivered(order_id) — admin-only SECURITY DEFINER
--    function powering the "تم أخذ الطلبية" admin button. Atomically:
--    sets delivery_status='delivered', inserts the agent_earnings row
--    (ON CONFLICT (order_id) DO NOTHING — this is what makes a
--    double-click never double-pay), and sets commission_paid=true.
--    "تم الشحن" / "جاري التسليم" need no function — admin already has
--    unrestricted UPDATE via orders_admin_update, so those are plain
--    `update({delivery_status: 'shipped' | 'out_for_delivery'})` calls
--    from admin.js, timestamped by the trigger in point 1.
-- 5. A REQUIRED PATCH to the PRE-EXISTING public.guard_assignment_columns()
--    (from supabase-order-delivery-fix.sql). That trigger already runs on
--    every orders/messages UPDATE and, for any caller it doesn't recognize
--    as admin/service_role/unauthenticated, allows ONLY assignment_status
--    (+ completed_by/completed_at on orders) to change — it has no idea
--    'agent' is now a valid non-admin caller. Without this patch, the very
--    first thing an agent does (confirm an order) would be rejected by
--    THIS OTHER trigger with "Sellers may only update assignment_status",
--    even though guard_agent_order_update() above already approved the
--    delivery_status change. The fix: bypass guard_assignment_columns()
--    entirely for callers whose role is 'agent' — safe, because
--    guard_agent_order_update() (point 1) is what actually restricts what
--    she can write; this function's job was always the SELLER workflow.
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- 1. guard_agent_order_update() trigger
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_agent_order_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  /* Stamp the matching timestamp column for ANY caller whenever
     delivery_status actually changes — runs before the admin bypass
     below so admin-driven transitions get timestamped too. */
  IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status THEN
    CASE NEW.delivery_status
      WHEN 'confirmed'        THEN NEW.confirmed_at        := now();
      WHEN 'shipped'          THEN NEW.shipped_at          := now();
      WHEN 'out_for_delivery' THEN NEW.out_for_delivery_at := now();
      WHEN 'delivered'        THEN NEW.delivered_at        := now();
      WHEN 'cancelled'        THEN NEW.cancelled_at        := now();
      ELSE NULL;
    END CASE;
  END IF;

  /* This trigger's restrictions are for the AGENT caller only — a
     seller updating assignment_status (guarded separately by the
     pre-existing guard_assignment_columns()) must pass through here
     untouched, or her legitimate assignment_status write would be
     rejected by this trigger for touching a column outside its
     delivery_status/*_at allow-list below. */
  IF public.is_admin()
     OR auth.uid() IS NULL
     OR current_user IN ('postgres', 'service_role')
     OR public.current_staff_role() IS DISTINCT FROM 'agent'
  THEN
    RETURN NEW;
  END IF;

  /* Only an agent with this order assigned to her may reach this point
     at all (RLS orders_agent_update_assigned below already blocks
     anyone else's UPDATE from matching a row). She may change
     delivery_status (and the *_at column this trigger just stamped
     for her) and nothing else. */
  IF (to_jsonb(NEW) - 'delivery_status' - 'confirmed_at' - 'shipped_at'
        - 'out_for_delivery_at' - 'delivered_at' - 'cancelled_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'delivery_status' - 'confirmed_at' - 'shipped_at'
        - 'out_for_delivery_at' - 'delivered_at' - 'cancelled_at')
  THEN
    RAISE EXCEPTION 'Agents may only update delivery_status';
  END IF;

  IF NEW.delivery_status IS DISTINCT FROM OLD.delivery_status THEN
    IF NOT (
      (OLD.delivery_status = 'pending' AND NEW.delivery_status = 'confirmed')
      OR (OLD.delivery_status IN ('pending', 'confirmed') AND NEW.delivery_status = 'cancelled')
    ) THEN
      RAISE EXCEPTION 'Agents may only move an order from pending to confirmed, or cancel it';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_guard_agent_update ON public.orders;
CREATE TRIGGER trg_orders_guard_agent_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_order_update();


-- ──────────────────────────────────────────────────────────────
-- 2. RLS — orders, scoped to assigned_agent_id.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "orders_agent_select_assigned" ON public.orders;
CREATE POLICY "orders_agent_select_assigned"
  ON public.orders FOR SELECT TO authenticated
  USING (assigned_agent_id = public.current_staff_id());

DROP POLICY IF EXISTS "orders_agent_update_assigned" ON public.orders;
CREATE POLICY "orders_agent_update_assigned"
  ON public.orders FOR UPDATE TO authenticated
  USING      (assigned_agent_id = public.current_staff_id())
  WITH CHECK (assigned_agent_id = public.current_staff_id());

DROP POLICY IF EXISTS "orders_agent_delete_assigned" ON public.orders;
CREATE POLICY "orders_agent_delete_assigned"
  ON public.orders FOR DELETE TO authenticated
  USING (assigned_agent_id = public.current_staff_id());


-- ──────────────────────────────────────────────────────────────
-- 3. RLS — agent_earnings.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.agent_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_earnings_agent_select_own" ON public.agent_earnings;
CREATE POLICY "agent_earnings_agent_select_own"
  ON public.agent_earnings FOR SELECT TO authenticated
  USING (agent_id = public.current_staff_id());

DROP POLICY IF EXISTS "agent_earnings_admin_select" ON public.agent_earnings;
CREATE POLICY "agent_earnings_admin_select"
  ON public.agent_earnings FOR SELECT TO authenticated
  USING (public.is_admin());
-- No INSERT/UPDATE/DELETE policy for any client role — rows are written
-- only by mark_order_delivered() (SECURITY DEFINER, bypasses RLS).

-- Realtime — powers the agent dashboard's live رصيدي/رصيد هذا الشهر
-- update the moment mark_order_delivered() inserts her commission row
-- (same ALTER PUBLICATION pattern as supabase-assignment-system.sql §10
-- for orders/messages). `orders` itself is assumed already added there.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_earnings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Belt-and-suspenders re-add for orders too, in case
-- supabase-assignment-system.sql's §10 was never run on this project —
-- the agent dashboard's live order updates depend on it.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 4. mark_order_delivered() — atomic, idempotent payout.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_order_delivered(p_order_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agent_id    UUID;
  v_commission  NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can mark an order delivered';
  END IF;

  SELECT assigned_agent_id, agent_commission
    INTO v_agent_id, v_commission
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  UPDATE public.orders
  SET delivery_status = 'delivered'
  WHERE id = p_order_id;

  IF v_agent_id IS NOT NULL THEN
    INSERT INTO public.agent_earnings (agent_id, order_id, amount)
    VALUES (v_agent_id, p_order_id, COALESCE(v_commission, 100))
    ON CONFLICT (order_id) DO NOTHING;

    UPDATE public.orders SET commission_paid = TRUE WHERE id = p_order_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_order_delivered(UUID) TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- 5. PATCH — guard_assignment_columns() must bypass for 'agent' role.
--    CREATE OR REPLACE on the exact function signature from
--    supabase-order-delivery-fix.sql (the latest of its several
--    revisions in this repo) — everything below is IDENTICAL to that
--    file's version except the added `OR public.current_staff_role()
--    = 'agent'` bypass condition. Safe to run even if that file was
--    never applied to this project (CREATE OR REPLACE either way).
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_assignment_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin()
     OR auth.uid() IS NULL
     OR current_user IN ('postgres', 'service_role')
     OR public.current_staff_role() = 'agent'
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
-- Trigger attachments (trg_orders_guard_assignment / trg_messages_guard_assignment)
-- already exist from supabase-assignment-system.sql / supabase-order-delivery-fix.sql
-- and don't need re-creating — CREATE OR REPLACE FUNCTION above updates the
-- body they point to in place. Belt-and-suspenders re-creation in case this
-- project never ran either of those files:
DROP TRIGGER IF EXISTS trg_orders_guard_assignment ON public.orders;
CREATE TRIGGER trg_orders_guard_assignment
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_columns();

DROP TRIGGER IF EXISTS trg_messages_guard_assignment ON public.messages;
CREATE TRIGGER trg_messages_guard_assignment
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_columns();


-- ──────────────────────────────────────────────────────────────
-- 6. Reload PostgREST's schema cache.
-- ──────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- ✅ Done — verify with:
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'orders' AND policyname LIKE 'orders_agent%';
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'agent_earnings';
--
-- -- As a logged-in agent with an order assigned to her (id = <ORDER_ID>):
-- UPDATE public.orders SET delivery_status = 'confirmed' WHERE id = '<ORDER_ID>'; -- should succeed
-- UPDATE public.orders SET delivery_status = 'shipped'   WHERE id = '<ORDER_ID>'; -- should FAIL (agent can't set this)
--
-- -- As admin, from the SQL editor:
-- SELECT public.mark_order_delivered('<ORDER_ID>');
-- SELECT * FROM public.agent_earnings WHERE order_id = '<ORDER_ID>'; -- 1 row
-- SELECT public.mark_order_delivered('<ORDER_ID>'); -- run again
-- SELECT count(*) FROM public.agent_earnings WHERE order_id = '<ORDER_ID>'; -- still 1 (idempotent)
--
-- -- Regression check — a seller's existing "تسليم" button must still work:
-- -- as a logged-in seller with an order assigned to her (assignment_status='assigned'):
-- UPDATE public.orders SET assignment_status = 'completed' WHERE id = '<SELLER_ORDER_ID>'; -- should still succeed
-- ================================================================
