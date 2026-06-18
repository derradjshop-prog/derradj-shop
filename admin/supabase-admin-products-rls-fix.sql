-- ================================================================
-- admin/supabase-admin-products-rls-fix.sql — Derradj Shop
--
-- PURPOSE: Fix admin_products_catalog so that:
--   1. All products (active AND inactive) are visible to admin
--   2. Missing columns (brand, product_name_fr) are added safely
--   3. Diagnostic query confirms products exist in DB
--
-- HOW TO RUN:
--   1. Go to https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
--   2. Paste this file and click "Run"
-- ================================================================


-- ── STEP 1: Add missing columns (safe — skipped if already exists) ─
DO $$
BEGIN
  -- French product name (used for SEO)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'admin_products_catalog'
      AND  column_name  = 'product_name_fr'
  ) THEN
    ALTER TABLE admin_products_catalog ADD COLUMN product_name_fr TEXT;
    RAISE NOTICE '✅ Column product_name_fr added.';
  ELSE
    RAISE NOTICE '⏭  Column product_name_fr already exists — skipped.';
  END IF;

  -- Brand / manufacturer name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'admin_products_catalog'
      AND  column_name  = 'brand'
  ) THEN
    ALTER TABLE admin_products_catalog ADD COLUMN brand TEXT;
    RAISE NOTICE '✅ Column brand added.';
  ELSE
    RAISE NOTICE '⏭  Column brand already exists — skipped.';
  END IF;

  -- display_order: controls sort priority on the website
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'admin_products_catalog'
      AND  column_name  = 'display_order'
  ) THEN
    ALTER TABLE admin_products_catalog ADD COLUMN display_order INTEGER;
    RAISE NOTICE '✅ Column display_order added.';
  ELSE
    RAISE NOTICE '⏭  Column display_order already exists — skipped.';
  END IF;
END $$;

-- Index for fast ordering by display_order
CREATE INDEX IF NOT EXISTS idx_apc_display_order
  ON admin_products_catalog (display_order ASC NULLS LAST);


-- ── STEP 2: Fix RLS so admin can always read ALL products ───────────
--
-- The original FOR ALL policy should work, but this adds an explicit
-- belt-and-suspenders SELECT policy for authenticated users so that
-- inactive/draft products are never hidden from the admin panel.
--

DROP POLICY IF EXISTS "admin_read_all_products" ON admin_products_catalog;

CREATE POLICY "admin_read_all_products"
  ON admin_products_catalog
  FOR SELECT
  TO authenticated
  USING (true);   -- no is_active filter — admin sees ALL products

-- Keep the public read policy (visitors only see active products)
-- Keep the full CRUD policy for authenticated users


-- ── STEP 3: Verify — shows ALL products in the table ───────────────
SELECT
  id,
  catalog_id,
  display_order,
  product_name,
  slug,
  category,
  is_active,
  stock_status,
  created_at::date  AS created_date,
  updated_at::date  AS updated_date
FROM admin_products_catalog
ORDER BY display_order ASC NULLS LAST, created_at DESC
LIMIT 50;
