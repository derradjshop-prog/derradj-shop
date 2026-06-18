-- ================================================================
-- admin/add-display-order.sql — Derradj Shop
--
-- Adds the display_order column to admin_products_catalog.
-- Run this ONCE in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
--
-- Safe to run multiple times — IF NOT EXISTS prevents duplicates.
-- ================================================================

-- 1. Add column
ALTER TABLE admin_products_catalog
  ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- 2. Add index so the ORDER BY is fast
CREATE INDEX IF NOT EXISTS idx_apc_display_order
  ON admin_products_catalog (display_order ASC NULLS LAST);

-- 3. Verify — should show all your products with display_order column
SELECT
  catalog_id,
  display_order,
  product_name,
  slug,
  is_active,
  created_at::date AS created
FROM admin_products_catalog
ORDER BY display_order ASC NULLS LAST, created_at DESC
LIMIT 20;
