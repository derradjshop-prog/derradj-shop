-- ================================================================
-- Derradj Shop — Products Admin Fix
-- Run every statement in order in:
--   Supabase Dashboard → SQL Editor → New Query
-- Each block is safe to run multiple times (idempotent).
-- ================================================================


-- ── STEP 1 ──────────────────────────────────────────────────────
-- Add UNIQUE constraint on catalog_id so ON CONFLICT works.
-- Uses CREATE UNIQUE INDEX because it is safe when the column
-- already has a unique index under a different name.
-- ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_availability_catalog_id
  ON public.product_availability (catalog_id);


-- ── STEP 2 ──────────────────────────────────────────────────────
-- Add category (text) and price (integer) columns if they do not
-- already exist.  ADD COLUMN IF NOT EXISTS is safe to run again.
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.product_availability
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS price    INTEGER;


-- ── STEP 3 ──────────────────────────────────────────────────────
-- Tag every existing book row with category = 'كتب'.
-- Runs only on rows that still have NULL category.
-- ────────────────────────────────────────────────────────────────
UPDATE public.product_availability
SET    category = 'كتب'
WHERE  catalog_id BETWEEN 2 AND 82
  AND  (category IS NULL OR category = '');


-- ── STEP 4 ──────────────────────────────────────────────────────
-- Upsert the three electronics products.
-- ON CONFLICT DO UPDATE keeps the existing "available" value
-- (respects any admin setting already saved) but sets the correct
-- name, category, and price every time.
-- ────────────────────────────────────────────────────────────────
INSERT INTO public.product_availability
  (catalog_id, name, available, category, price)
VALUES
  (83, 'حامل اللابتوب القابل للتعديل',
       true, 'إلكترونيات', 1500),
  (84, 'Modio ST11 Smart Watch',
       true, 'إلكترونيات', 9800),
  (85, 'Anker SoundCore R50i VG Original – Bluetooth 5.3 Earbuds',
       true, 'إلكترونيات', 5300)
ON CONFLICT (catalog_id) DO UPDATE
  SET  name     = EXCLUDED.name,
       category = EXCLUDED.category,
       price    = EXCLUDED.price;
-- "available" is intentionally NOT overwritten so existing
-- admin availability settings are preserved.


-- ── STEP 5 ──────────────────────────────────────────────────────
-- RLS: allow authenticated admins to read and write the table.
-- Only run this if the toggle is still not saving after Step 4.
-- Check existing policies first:
-- ────────────────────────────────────────────────────────────────
/*
SELECT policyname, cmd, roles
FROM   pg_policies
WHERE  tablename = 'product_availability';

-- If INSERT or UPDATE is blocked for authenticated users, add:
CREATE POLICY "staff_full_access"
  ON public.product_availability
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
*/


-- ── STEP 6 — Verify ─────────────────────────────────────────────
SELECT catalog_id, name, category, price, available
FROM   public.product_availability
ORDER  BY catalog_id;
-- You should see all books with category='كتب' and the three
-- electronics rows with category='إلكترونيات'.
-- ================================================================
