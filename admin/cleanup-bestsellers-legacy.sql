-- ================================================================
-- admin/cleanup-bestsellers-legacy.sql — Derradj Shop
--
-- Removes the abandoned stored-counter design for "best sellers"
-- (triggers on orders, the total_sold/is_pinned_bestseller columns
-- on admin_products_catalog, and the get_top_sellers() RPC).
--
-- The "📚 الكتب المباعة" feature now reads order_items directly and
-- aggregates client-side (see admin/bestsellers.js) — no triggers,
-- no RPC, no stored counters needed.
--
-- order_items.product_id is NOT touched — it's a real column with
-- real data, unrelated to this cleanup.
--
-- Safe to run multiple times.
-- HOW TO RUN:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
-- ================================================================

DROP TRIGGER IF EXISTS trg_orders_total_sold        ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_total_sold_delete ON public.orders;
DROP FUNCTION IF EXISTS public.trg_orders_total_sold();
DROP FUNCTION IF EXISTS public.trg_orders_total_sold_on_delete();
DROP FUNCTION IF EXISTS public.apply_order_total_sold(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.get_top_sellers(TEXT, INT);

DROP INDEX IF EXISTS idx_admin_products_catalog_total_sold;

ALTER TABLE public.admin_products_catalog
  DROP COLUMN IF EXISTS total_sold,
  DROP COLUMN IF EXISTS is_pinned_bestseller;

NOTIFY pgrst, 'reload schema';

-- ── Verify ────────────────────────────────────────────────────────────
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_products_catalog'
  AND column_name IN ('total_sold', 'is_pinned_bestseller');
-- ↑ should return 0 rows
