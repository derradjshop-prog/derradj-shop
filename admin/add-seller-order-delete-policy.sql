-- ================================================================
-- admin/add-seller-order-delete-policy.sql — Derradj Shop
--
-- Lets a seller (e.g. Mehdi) delete orders assigned to them from
-- their own dashboard (seller/dashboard.html "🗑 حذف" button).
--
-- Until now, orders had exactly one DELETE policy — "orders_admin_delete"
-- (admin only), per supabase-assignment-system.sql. Sellers had no
-- DELETE policy at all, so a seller-initiated delete would be denied
-- by RLS (deny-by-default). This adds a second DELETE policy scoped
-- the same way as the existing seller SELECT/UPDATE policies
-- (orders_seller_select_assigned / orders_seller_update_assigned):
-- a seller may only delete an order currently assigned to them.
--
-- Safe to run multiple times.
-- HOW TO RUN:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
-- ================================================================

DROP POLICY IF EXISTS "orders_seller_delete_assigned" ON public.orders;
CREATE POLICY "orders_seller_delete_assigned"
  ON public.orders FOR DELETE TO authenticated
  USING (assigned_to = public.current_staff_id());

-- ── Verify ──────────────────────────────────────────────────────
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'orders' AND cmd = 'DELETE';
-- ↑ should now show 2 rows: orders_admin_delete, orders_seller_delete_assigned
