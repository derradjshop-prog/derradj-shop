-- ================================================================
-- admin/add-order-items-select-policy.sql — Derradj Shop
--
-- ROOT CAUSE FIX for: book sales ranking (products-manager.js
-- syncBookSalesRanking) and the "📚 الكتب المباعة" tab (bestsellers.js)
-- never showing any sales / never changing display_order.
--
-- order_items has RLS ENABLED (supabase-setup.sql) but, until now, its
-- ONLY policy was "anon_insert_order_items" (INSERT, for checkout).
-- There has never been a SELECT policy for authenticated/admin — so
-- every `sb.from('order_items').select(...)` from the admin panel
-- silently returned 0 rows (RLS default-deny, no error thrown), which
-- made every book look like it had 0 sales.
--
-- This mirrors the existing "orders_admin_select" policy pattern
-- introduced for the `orders` table in supabase-assignment-system.sql,
-- just applied to order_items, which never got the same treatment.
--
-- Safe to run multiple times.
-- HOW TO RUN:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
-- ================================================================

DROP POLICY IF EXISTS "order_items_admin_select" ON public.order_items;
CREATE POLICY "order_items_admin_select"
  ON public.order_items FOR SELECT TO authenticated
  USING (public.is_admin());

-- ── Verify ────────────────────────────────────────────────────────────
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'order_items';
-- ↑ should now show 2 rows: anon_insert_order_items (INSERT) and
--   order_items_admin_select (SELECT)
