-- ================================================================
-- admin/add-order-items-purchase-cost.sql — Derradj Shop
--
-- Profit-sharing feature: admin enters the purchase cost per book
-- (order_items line), profit = subtotal - purchase_cost is computed
-- client-side, split 70% partner (seller) / 30% admin.
--
-- 1. Adds order_items.purchase_cost (NULL = not entered yet).
-- 2. Lets admin UPDATE order_items (only "order_items_admin_select"
--    existed before — no UPDATE policy at all, so admin.js could not
--    have saved this even with the column present).
-- 3. Lets a seller SELECT order_items for orders assigned to them —
--    this policy never existed, so seller/dashboard.html's order_items
--    join has always silently returned an empty array under RLS.
--    Needed so the partner dashboard can show Purchase Cost / Profit /
--    Partner Share for their own assigned orders.
--
-- Safe to run multiple times.
-- HOW TO RUN:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
-- ================================================================

-- ── 1. New column ────────────────────────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS purchase_cost NUMERIC;

-- ── 2. Admin can update order_items (needed to save purchase_cost) ─
DROP POLICY IF EXISTS "order_items_admin_update" ON public.order_items;
CREATE POLICY "order_items_admin_update"
  ON public.order_items FOR UPDATE TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 3. Seller can read order_items for their assigned orders ──────
DROP POLICY IF EXISTS "order_items_seller_select_assigned" ON public.order_items;
CREATE POLICY "order_items_seller_select_assigned"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.assigned_to = auth.uid()
    )
  );

-- ── 4. Reload PostgREST's schema cache (new column above) ─────────
NOTIFY pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'purchase_cost';
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'order_items';
-- ↑ should now show 4 rows: anon_insert_order_items (INSERT),
--   order_items_admin_select (SELECT), order_items_admin_update (UPDATE),
--   order_items_seller_select_assigned (SELECT)
