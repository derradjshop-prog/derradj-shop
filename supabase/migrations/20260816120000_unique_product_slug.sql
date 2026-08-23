-- ================================================================
-- Derradj Shop — Prevent duplicate product slugs
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
--
-- Why: admin/products-manager.js only checked slug uniqueness
-- client-side before this (a friendly pre-save query, not a real
-- guard). Two saves racing each other, or a resubmit after a save
-- that looked like it failed, could create two rows with the same
-- slug — silently breaking whichever one loses the "which page does
-- /product/{slug}/ generate from" race in generate-product-pages.js.
-- This constraint is the actual guard; the client-side check is only
-- there to fail fast with a friendly message in the normal case.
--
-- Safe to run more than once. STEP 1 is read-only — always run it
-- first and check the result. If it returns any rows, STEP 2 will
-- report that it could not add the constraint (via RAISE NOTICE, not
-- an error that rolls back other work) instead of silently modifying
-- or removing any existing duplicate row. Resolve those duplicates by
-- hand (rename/merge/deactivate whichever is stale), then re-run this
-- file to actually add the constraint.
-- ================================================================

-- ── STEP 1 — detect existing duplicate slugs (read-only) ──────────
SELECT
  slug,
  COUNT(*)              AS how_many,
  array_agg(id)          AS product_ids,
  array_agg(product_name) AS names
FROM public.admin_products_catalog
WHERE slug IS NOT NULL
GROUP BY slug
HAVING COUNT(*) > 1;

-- ── STEP 2 — add a UNIQUE constraint on slug if one doesn't already
--    cover it under any name. (supabase-products-setup.sql declared
--    `slug TEXT UNIQUE` on the original CREATE TABLE, but that only
--    took effect if this exact table was created fresh from that
--    script, hence the existence check rather than assuming either
--    way.) ──────────────────────────────────────────────────────────
DO $$
DECLARE
  has_unique boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'admin_products_catalog'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name = 'slug'
  ) INTO has_unique;

  IF has_unique THEN
    RAISE NOTICE 'A unique constraint on admin_products_catalog.slug already exists — nothing to do.';
  ELSE
    BEGIN
      ALTER TABLE public.admin_products_catalog
        ADD CONSTRAINT admin_products_catalog_slug_unique UNIQUE (slug);
      RAISE NOTICE 'Added unique constraint admin_products_catalog_slug_unique on slug.';
    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE 'Could NOT add the unique constraint — duplicate slugs exist. Re-run STEP 1 above, resolve the duplicates by hand, then re-run this file.';
    END;
  END IF;
END $$;
