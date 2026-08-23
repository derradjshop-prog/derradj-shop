-- ================================================================
-- admin/add-order-items-cost-partner-edit.sql — Derradj Shop
--
-- Extends the purchase-cost/profit-split feature (see
-- admin/add-order-items-purchase-cost.sql) so the PARTNER (seller)
-- can also enter/edit order_items.purchase_cost for their own
-- assigned orders — not just the admin.
--
-- 1. Adds order_items.updated_by / updated_at so both dashboards can
--    show who last touched the cost and when.
-- 2. New RLS UPDATE policy lets a seller update order_items rows that
--    belong to an order assigned to them.
-- 3. RLS is row-level only — nothing stops a seller UPDATE from also
--    changing product_name/unit_price/subtotal on that same row.
--    A BEFORE UPDATE trigger (same pattern as guard_assignment_columns()
--    in supabase-assignment-system.sql) closes that gap:
--      • admin  → unrestricted, any column, any time (final say — a
--                 later admin save always overwrites a partner's entry,
--                 there is no separate "lock" or conflict check).
--      • seller → may ONLY change purchase_cost, and only on an
--                 order_item whose order is assigned to them.
--    Both cases auto-stamp updated_by/updated_at — the client never
--    sends these, so nobody can forge who made an edit.
--
-- Safe to run multiple times.
-- HOW TO RUN:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
--   (run admin/add-order-items-purchase-cost.sql FIRST if you haven't)
-- ================================================================

-- ── 1. New columns — who/when the cost was last edited ────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ── 2. Seller can UPDATE order_items for their own assigned orders ─
--    (row-level only — see trigger below for the column-level guard)
DROP POLICY IF EXISTS "order_items_seller_update_assigned" ON public.order_items;
CREATE POLICY "order_items_seller_update_assigned"
  ON public.order_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.assigned_to = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.assigned_to = auth.uid()
    )
  );

-- ── 3. TRIGGER FUNCTION — guard_order_items_cost_edit()
--    Admin passes through untouched (full control, always wins).
--    Non-admin (seller) callers may ONLY change purchase_cost, and
--    only on a row belonging to one of their own assigned orders.
--    Both branches stamp updated_by/updated_at server-side.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_order_items_cost_edit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    IF NEW.purchase_cost IS DISTINCT FROM OLD.purchase_cost THEN
      NEW.updated_by := public.current_staff_id();
      NEW.updated_at := now();
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'purchase_cost' - 'updated_by' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'purchase_cost' - 'updated_by' - 'updated_at') THEN
    RAISE EXCEPTION 'Sellers may only update purchase_cost';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = OLD.order_id AND o.assigned_to = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You may only edit purchase cost for your own assigned orders';
  END IF;

  NEW.updated_by := public.current_staff_id();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_guard_cost_edit ON public.order_items;
CREATE TRIGGER trg_order_items_guard_cost_edit
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_items_cost_edit();

-- ── 4. Reload PostgREST's schema cache (new columns above) ────────
NOTIFY pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name IN ('updated_by','updated_at');
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'order_items';
-- ↑ should now show 5 rows: anon_insert_order_items (INSERT),
--   order_items_admin_select (SELECT), order_items_admin_update (UPDATE),
--   order_items_seller_select_assigned (SELECT),
--   order_items_seller_update_assigned (UPDATE)
