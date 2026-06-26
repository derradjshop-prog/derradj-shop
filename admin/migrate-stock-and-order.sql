-- ================================================================
-- admin/migrate-stock-and-order.sql — Derradj Shop
--
-- PURPOSE — Products Management redesign:
--   1. stock_status becomes a simple 2-state field: 'available' | 'out_of_stock'
--      (drops the unused 'low_stock' state)
--   2. is_active is retired as a "hide product" switch — every product
--      stays active forever; products that were hidden become out_of_stock
--      instead, so they keep showing on the site but can't be purchased.
--   3. display_order is renumbered to a clean, gap-free, duplicate-free
--      sequence (1..N) so it can be safely used as the live "sort order"
--      controlled from the admin Products tab (drag & drop / inline edit).
--
-- Safe to run multiple times.
-- HOW TO RUN:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
-- ================================================================

-- ── STEP 1: Drop the OLD CHECK constraint BEFORE backfilling ────────────
-- (must happen first — the old constraint only allows 'in_stock'/'low_stock'/
--  'out_of_stock', so writing 'available' below would violate it otherwise)
DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT con.conname INTO c_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'admin_products_catalog'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%stock_status%';

  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE admin_products_catalog DROP CONSTRAINT %I', c_name);
  END IF;
END $$;

-- ── STEP 2: Backfill stock_status to the new 2-state values ─────────────
UPDATE admin_products_catalog
SET stock_status = CASE
  WHEN is_active = false        THEN 'out_of_stock'
  WHEN stock_status = 'out_of_stock' THEN 'out_of_stock'
  ELSE 'available'
END;

ALTER TABLE admin_products_catalog
  ALTER COLUMN stock_status SET DEFAULT 'available';

ALTER TABLE admin_products_catalog
  ADD CONSTRAINT admin_products_catalog_stock_status_check
  CHECK (stock_status IN ('available', 'out_of_stock'));

-- ── STEP 3: Retire is_active as a hide switch — everything stays active ──
UPDATE admin_products_catalog SET is_active = true WHERE is_active IS DISTINCT FROM true;

ALTER TABLE admin_products_catalog
  ALTER COLUMN is_active SET DEFAULT true;

-- ── STEP 4: Renumber display_order to a clean 1..N sequence ─────────────
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY display_order ASC NULLS LAST, created_at ASC) AS rn
  FROM admin_products_catalog
)
UPDATE admin_products_catalog AS apc
SET display_order = ranked.rn
FROM ranked
WHERE apc.id = ranked.id;

-- ── Verify ────────────────────────────────────────────────────────────
SELECT
  catalog_id,
  display_order,
  product_name,
  is_active,
  stock_status,
  created_at::date AS created
FROM admin_products_catalog
ORDER BY display_order ASC
LIMIT 50;
