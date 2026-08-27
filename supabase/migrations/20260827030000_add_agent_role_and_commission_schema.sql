-- ================================================================
-- Derradj Shop — Call Agent role: schema (columns, tables, base RLS)
-- موظفة تتبع الطلبيات — عمود التعيين، جدول العمولات، وسياسات القراءة
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (every statement is idempotent).
--
-- Adds a THIRD staff_accounts role, 'agent' — a call agent who confirms
-- orders by phone and tracks them through delivery, earning 100 DZD per
-- delivered order. This file is additive only:
--   - orders.is_confirmed (admin's own "تم الاستلام" flag) is untouched.
--   - orders.assignment_status / assigned_to (the seller workflow from
--     supabase-assignment-system.sql) is untouched.
--   - blocked_customers (admin/add-blocked-customers-system.sql) is
--     REUSED, not duplicated — a call agent blocks a number into the
--     exact same table a seller already blocks into, which already
--     rejects the phone at checkout (trg_reject_order_if_phone_blocked)
--     and already shows the customer a friendly Arabic message
--     (ordre/app.js friendlyError() "blocked_phone" branch) — nothing
--     to add on the storefront side.
--
-- Depends on: public.is_admin(), public.current_staff_id(),
-- public.current_staff_role() from supabase-assignment-system.sql, and
-- public.normalize_phone()/is_phone_blocked() from
-- admin/add-blocked-customers-system.sql. Run those first if you haven't.
--
-- Companion file: 20260827030100_add_agent_order_workflow_rls_and_functions.sql
-- (transition-guard trigger, agent-scoped orders RLS, payout function) —
-- run this file first, then that one.
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- 1. staff_accounts.role — widen to include 'agent'.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.staff_accounts DROP CONSTRAINT IF EXISTS staff_accounts_role_check;
ALTER TABLE public.staff_accounts
  ADD CONSTRAINT staff_accounts_role_check CHECK (role IN ('admin', 'seller', 'agent'));


-- ──────────────────────────────────────────────────────────────
-- 2. orders — agent assignment, commission, and a NEW independent
--    delivery-lifecycle column. delivery_status is deliberately
--    separate from is_confirmed (different concept, different owner)
--    — see the file header above.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID
    CONSTRAINT orders_assigned_agent_id_fkey REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_commission NUMERIC NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS commission_paid BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_delivery_status_check
  CHECK (delivery_status IN ('pending', 'confirmed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_orders_assigned_agent_id ON public.orders (assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status    ON public.orders (delivery_status);

COMMENT ON COLUMN public.orders.delivery_status IS
  'Call-agent delivery lifecycle: pending -> confirmed -> shipped -> out_for_delivery -> delivered, or -> cancelled. Independent of is_confirmed and assignment_status.';


-- ──────────────────────────────────────────────────────────────
-- 3. agent_earnings — one row per PAID commission. The UNIQUE on
--    order_id is what makes the admin "تم أخذ الطلبية" payout
--    idempotent (see mark_order_delivered() in the companion file).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_earnings (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID        NOT NULL REFERENCES public.staff_accounts(id) ON DELETE CASCADE,
  order_id   UUID        NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  amount     NUMERIC     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_earnings_agent_id ON public.agent_earnings (agent_id);


-- ──────────────────────────────────────────────────────────────
-- 4. blocked_customers — let an 'agent' see the block list and block
--    a number that appears on one of HER assigned orders, mirroring
--    the existing seller branch exactly.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "blocked_customers_staff_select" ON public.blocked_customers;
CREATE POLICY "blocked_customers_staff_select"
  ON public.blocked_customers FOR SELECT TO authenticated
  USING (public.current_staff_role() IN ('admin', 'seller', 'agent'));

DROP POLICY IF EXISTS "blocked_customers_staff_insert" ON public.blocked_customers;
CREATE POLICY "blocked_customers_staff_insert"
  ON public.blocked_customers FOR INSERT TO authenticated
  WITH CHECK (
    blocked_by = public.current_staff_id()
    AND is_active = TRUE
    AND unblocked_by IS NULL
    AND unblocked_at IS NULL
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.assigned_to = public.current_staff_id()
          AND public.normalize_phone(o.phone) = public.normalize_phone(phone)
      )
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.assigned_agent_id = public.current_staff_id()
          AND public.normalize_phone(o.phone) = public.normalize_phone(phone)
      )
    )
  );


-- ──────────────────────────────────────────────────────────────
-- 5. messages — new SELECT policy for the agent's shared inbox
--    (all messages, minus blocked numbers, per product decision —
--    unlike orders, messages are NOT scoped to a specific agent).
--    Additive: doesn't touch messages_admin_select or
--    messages_seller_select_assigned from supabase-assignment-system.sql.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "messages_agent_select_unblocked" ON public.messages;
CREATE POLICY "messages_agent_select_unblocked"
  ON public.messages FOR SELECT TO authenticated
  USING (public.current_staff_role() = 'agent' AND NOT public.is_phone_blocked(contact));


-- ──────────────────────────────────────────────────────────────
-- 6. order_items — agent can see line items for orders assigned to
--    her, mirroring order_items_seller_select_assigned
--    (admin/add-order-items-cost-partner-edit.sql).
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "order_items_agent_select_assigned" ON public.order_items;
CREATE POLICY "order_items_agent_select_assigned"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.assigned_agent_id = public.current_staff_id()
    )
  );


-- ──────────────────────────────────────────────────────────────
-- 7. Reload PostgREST's schema cache (new columns/table/policies).
-- ──────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- ✅ Done — verify with:
--
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conname IN ('staff_accounts_role_check', 'orders_delivery_status_check');
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'orders'
--   AND column_name IN ('assigned_agent_id','agent_commission','commission_paid','delivery_status');
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('blocked_customers','messages','order_items','agent_earnings');
--
-- Now run 20260827030100_add_agent_order_workflow_rls_and_functions.sql.
-- ================================================================
