-- ================================================================
-- Derradj Shop — Call Agent digital-sale commission (WhatsApp sales)
-- عمولة الوكيلة على مبيعات المنتجات/الاشتراكات الرقمية عبر واتساب
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
-- Safe to run multiple times (every statement is idempotent).
--
-- WHY A NEW TABLE — digital subscription/product sales (catalog
-- category='subscriptions', which per product decision covers BOTH
-- "digital product" and "digital subscription" listings — there is no
-- separate catalog category for those) are sold entirely over WhatsApp
-- and are explicitly excluded from cart/checkout (see cart.js ~L265-292
-- and ordre/app.js). There is therefore never an orders/order_items row
-- for a digital sale, so agent_earnings (which is keyed 1:1 to
-- orders.id via a UNIQUE order_id) cannot be reused. This file adds a
-- manual-entry table the agent fills in herself when she closes a
-- WhatsApp sale, with a flat 200 DZD commission PER ITEM (not tied to
-- price), that is only ever payable once an admin confirms the sale
-- was actually completed and paid.
--
-- Depends on: public.is_admin(), public.current_staff_id() from
-- supabase-assignment-system.sql / 20260827030000_add_agent_role_and_commission_schema.sql.
-- Run those first if you have not already.
--
-- WHAT THIS ADDS ───────────────────────────────────────────────────
-- 1. agent_digital_sales — one row per WhatsApp-closed digital sale,
--    manually entered by the agent. total_commission is a GENERATED
--    STORED column (quantity * unit_commission), so it can never drift
--    from its inputs.
-- 2. RLS: an agent can INSERT and SELECT only her own rows, and may
--    only insert a row that is still fully "untouched" (pending/unpaid/
--    pending, no approver, no timestamps) — this is what stops her
--    from crediting her own commission at creation time. She may
--    DELETE her own row only while it is still 'pending' (fixing a
--    typo before an admin has acted on it).
--    Deliberately NO agent UPDATE policy at all — RLS has no policy
--    permitting an 'agent'-owned UPDATE on this table, so once a row
--    exists she cannot transition order_status/payment_status/
--    commission_status/approved_*/commission_paid_at on it herself,
--    full stop, at the database layer — not just an app-level
--    restraint. Only an admin (via the admin-only policies below) can
--    move a row to completed/paid and mark the commission paid,
--    mirroring the fraud-safety property of mark_order_delivered().
-- 3. Realtime — added to supabase_realtime so the agent dashboard can
--    live-update her balance the moment an admin approves a sale, same
--    pattern as agent_earnings/orders in the companion agent-role file.
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- 1. agent_digital_sales table.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_digital_sales (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID        NOT NULL REFERENCES public.staff_accounts(id) ON DELETE CASCADE,
  item_type           TEXT        NOT NULL CHECK (item_type IN ('digital_product', 'digital_subscription')),
  product_id          UUID        REFERENCES public.admin_products_catalog(id) ON DELETE SET NULL,
  product_name        TEXT        NOT NULL,
  customer_name       TEXT        NOT NULL,
  customer_phone      TEXT,
  quantity            INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_commission     NUMERIC     NOT NULL DEFAULT 200,
  total_commission    NUMERIC     GENERATED ALWAYS AS (quantity * unit_commission) STORED,
  order_status        TEXT        NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'completed', 'cancelled', 'refunded')),
  payment_status      TEXT        NOT NULL DEFAULT 'unpaid'  CHECK (payment_status IN ('unpaid', 'paid', 'failed')),
  commission_status   TEXT        NOT NULL DEFAULT 'pending' CHECK (commission_status IN ('pending', 'paid')),
  notes               TEXT,
  created_by          UUID        NOT NULL REFERENCES public.staff_accounts(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by         UUID        REFERENCES public.staff_accounts(id),
  approved_at         TIMESTAMPTZ,
  commission_paid_at  TIMESTAMPTZ
);

COMMENT ON TABLE public.agent_digital_sales IS
  'Manual-entry WhatsApp digital sale, logged by a call agent. Commission is only "earned" (eligible for admin payout) when order_status = ''completed'' AND payment_status = ''paid'' - this is an app-layer/query-layer eligibility rule (plain WHERE clause), deliberately not a generated/computed column, since payment confirmation is a separate admin action from marking the order completed.';

CREATE INDEX IF NOT EXISTS idx_agent_digital_sales_agent_id ON public.agent_digital_sales (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_digital_sales_status    ON public.agent_digital_sales (order_status, payment_status);


-- ──────────────────────────────────────────────────────────────
-- 2. RLS.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.agent_digital_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_digital_sales_agent_select_own" ON public.agent_digital_sales;
CREATE POLICY "agent_digital_sales_agent_select_own"
  ON public.agent_digital_sales FOR SELECT TO authenticated
  USING (agent_id = public.current_staff_id());

DROP POLICY IF EXISTS "agent_digital_sales_admin_select" ON public.agent_digital_sales;
CREATE POLICY "agent_digital_sales_admin_select"
  ON public.agent_digital_sales FOR SELECT TO authenticated
  USING (public.is_admin());

-- An agent may only insert a row for herself that is still fully
-- "untouched" — pending/unpaid/pending, no approver, no approval or
-- payout timestamps. This is what stops her from inserting a
-- pre-approved / pre-paid row and crediting her own commission.
DROP POLICY IF EXISTS "agent_digital_sales_agent_insert_own" ON public.agent_digital_sales;
CREATE POLICY "agent_digital_sales_agent_insert_own"
  ON public.agent_digital_sales FOR INSERT TO authenticated
  WITH CHECK (
    agent_id = public.current_staff_id()
    AND created_by = public.current_staff_id()
    AND order_status = 'pending'
    AND payment_status = 'unpaid'
    AND commission_status = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND commission_paid_at IS NULL
  );

-- Lets her delete her own mistakes before an admin has acted on them.
DROP POLICY IF EXISTS "agent_digital_sales_agent_delete_own_pending" ON public.agent_digital_sales;
CREATE POLICY "agent_digital_sales_agent_delete_own_pending"
  ON public.agent_digital_sales FOR DELETE TO authenticated
  USING (agent_id = public.current_staff_id() AND order_status = 'pending');

-- Deliberately NO agent UPDATE policy anywhere in this file. Once a row
-- exists, an agent has no RLS path to change order_status,
-- payment_status, commission_status, approved_by/approved_at, or
-- commission_paid_at on her own row — the database rejects the UPDATE
-- outright regardless of what the UI does or does not render. Only the
-- admin policy below can move a sale to completed/paid and pay out the
-- commission. This is the real security boundary for this feature,
-- mirroring mark_order_delivered() admin-only, agent-cannot-self-pay
-- guarantee for physical orders.
DROP POLICY IF EXISTS "agent_digital_sales_admin_insert" ON public.agent_digital_sales;
CREATE POLICY "agent_digital_sales_admin_insert"
  ON public.agent_digital_sales FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "agent_digital_sales_admin_update" ON public.agent_digital_sales;
CREATE POLICY "agent_digital_sales_admin_update"
  ON public.agent_digital_sales FOR UPDATE TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "agent_digital_sales_admin_delete" ON public.agent_digital_sales;
CREATE POLICY "agent_digital_sales_admin_delete"
  ON public.agent_digital_sales FOR DELETE TO authenticated
  USING (public.is_admin());


-- ──────────────────────────────────────────────────────────────
-- 3. Realtime — powers the agent dashboard live balance update the
--    moment an admin approves/pays a digital sale (same ALTER
--    PUBLICATION pattern as agent_earnings/orders in
--    20260827030100_add_agent_order_workflow_rls_and_functions.sql).
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_digital_sales;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 4. Reload PostgREST schema cache.
-- ──────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- Done — verify with:
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'agent_digital_sales'
-- ORDER BY ordinal_position;
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'agent_digital_sales';
--
-- SELECT indexname, indexdef FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'agent_digital_sales';
--
-- -- As a logged-in agent:
-- INSERT INTO public.agent_digital_sales
--   (agent_id, item_type, product_name, customer_name, quantity, created_by)
-- VALUES
--   (public.current_staff_id(), 'digital_subscription', 'test sub', 'test customer', 1, public.current_staff_id());
-- -- should succeed (row starts pending/unpaid/pending)
--
-- UPDATE public.agent_digital_sales SET order_status = 'completed' WHERE agent_id = public.current_staff_id();
-- -- should FAIL for the agent — no UPDATE policy grants this
--
-- -- As admin, from the SQL editor:
-- UPDATE public.agent_digital_sales
-- SET order_status = 'completed', payment_status = 'paid',
--     approved_by = <ADMIN_STAFF_ID>, approved_at = now()
-- WHERE id = '<ROW_ID>'; -- should succeed
-- ================================================================
