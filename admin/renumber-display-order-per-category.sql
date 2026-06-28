-- ================================================================
-- admin/renumber-display-order-per-category.sql — Derradj Shop
--
-- PURPOSE — switches display_order from one GLOBAL sequence shared by
-- every product to a separate sequence PER category:
--   - electronics: 1..N (currently already 1..7 — no change expected)
--   - books:       1..N (currently 8..90 — becomes 1..83)
-- Relative order within each category is preserved exactly; only the
-- numbers are renumbered, no gaps, no duplicates, never <= 0.
--
-- HOW TO RUN:
--   1. Run STEP 1 (preview) first — read-only, makes no changes.
--   2. Check old_order -> new_order looks right.
--   3. Run STEP 2 (the actual UPDATE).
--   4. Run STEP 3 (verify) to confirm the new state.
-- https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
-- ================================================================

-- ── STEP 1: PREVIEW (read-only — run this first, no writes) ─────────────
WITH ranked AS (
  SELECT id,
         catalog_id,
         product_name,
         category,
         display_order AS old_order,
         ROW_NUMBER() OVER (
           PARTITION BY category
           ORDER BY display_order ASC NULLS LAST, created_at ASC
         ) AS new_order
  FROM admin_products_catalog
)
SELECT catalog_id, product_name, category, old_order, new_order
FROM ranked
WHERE old_order IS DISTINCT FROM new_order
ORDER BY category, new_order;

-- ── STEP 2: APPLY (writes — run only after checking the preview) ────────
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY category
           ORDER BY display_order ASC NULLS LAST, created_at ASC
         ) AS new_order
  FROM admin_products_catalog
)
UPDATE admin_products_catalog AS apc
SET display_order = ranked.new_order
FROM ranked
WHERE apc.id = ranked.id;

-- ── STEP 3: VERIFY — each category should start at 1, no gaps/dupes ─────
SELECT category,
       MIN(display_order) AS min_order,
       MAX(display_order) AS max_order,
       COUNT(*)           AS product_count,
       COUNT(DISTINCT display_order) AS distinct_orders
FROM admin_products_catalog
GROUP BY category;

SELECT catalog_id, product_name, category, display_order
FROM admin_products_catalog
ORDER BY category, display_order
LIMIT 100;
