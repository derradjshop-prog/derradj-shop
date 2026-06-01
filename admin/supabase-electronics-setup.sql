-- ================================================================
-- Derradj Shop — Electronics Products Setup
-- Run this in: Supabase Dashboard → SQL Editor
-- ================================================================

-- ── STEP 1: Check if product_availability has a category column ──
-- If the query below shows "column does not exist" → run STEP 2
SELECT catalog_id, name, available
FROM product_availability
WHERE catalog_id IN (83, 84, 85)
ORDER BY catalog_id;

-- ── STEP 2 (optional): Add category & price columns if missing ──
-- Only run these if you want to store category/price in Supabase.
-- The admin dashboard reads category & price from local JS (BOOKS_META),
-- so these columns are NOT required for the admin to work.
-- They are optional for reporting or future use.

ALTER TABLE product_availability
  ADD COLUMN IF NOT EXISTS category  TEXT,
  ADD COLUMN IF NOT EXISTS price     INTEGER;

-- ── STEP 3: Insert / upsert the three electronics products ──
-- ON CONFLICT DO UPDATE means it is safe to run multiple times.

INSERT INTO product_availability (catalog_id, name, available, category, price)
VALUES
  (83, 'حامل اللابتوب القابل للتعديل',                          true, 'إلكترونيات', 1500),
  (84, 'ساعة ذكية Modio ST11 مع 3 أزواج أساور',                true, 'إلكترونيات', 9800),
  (85, 'Anker SoundCore R50i VG Original – Bluetooth 5.3 Earbuds', true, 'إلكترونيات', 5300)
ON CONFLICT (catalog_id) DO UPDATE
  SET name      = EXCLUDED.name,
      available = EXCLUDED.available,
      category  = EXCLUDED.category,
      price     = EXCLUDED.price;

-- ── STEP 4: Verify ──
SELECT catalog_id, name, available
FROM product_availability
WHERE catalog_id IN (83, 84, 85)
ORDER BY catalog_id;

-- ── STEP 5: RLS — allow authenticated staff to upsert availability ──
-- If the admin toggle is still not saving, the RLS policy may be blocking
-- INSERT/UPDATE from the client. Run this to allow it for authenticated users:

-- Check current policies:
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'product_availability';

-- If INSERT is blocked for authenticated role, add this policy:
CREATE POLICY "staff can upsert product_availability"
  ON product_availability
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- If you only want UPDATE (not INSERT) for authenticated users:
-- CREATE POLICY "staff can update product_availability"
--   ON product_availability
--   FOR UPDATE
--   TO authenticated
--   USING (true)
--   WITH CHECK (true);

-- CREATE POLICY "staff can insert product_availability"
--   ON product_availability
--   FOR INSERT
--   TO authenticated
--   WITH CHECK (true);
