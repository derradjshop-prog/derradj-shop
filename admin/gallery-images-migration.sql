-- ================================================================
-- admin/gallery-images-migration.sql — Derradj Shop
--
-- STEP 1 of Image Migration:
--   1. Adds gallery_images JSONB column to admin_products_catalog
--   2. Updates all 5 visible electronics products with their full
--      image arrays using current local file paths
--
-- Run this NOW in Supabase SQL Editor:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
--
-- After running upload-to-supabase-storage.ps1, run:
--   admin/update-supabase-image-urls.sql
-- ================================================================

-- ── Add gallery_images column if not already present ──────────────
ALTER TABLE admin_products_catalog
  ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb;


-- ══════════════════════════════════════════════════════════════════
-- Product 83 — حامل اللابتوب القابل للتعديل
--
-- Files found on disk:
--   main.webp     153 KB  ← MAIN IMAGE (= main1.webp, exact duplicate)
--   main1.webp    153 KB  ← duplicate of main.webp — skip
--   main2.png   1,741 KB  ← gallery image 1
--   main3.png   1,081 KB  ← gallery image 2
--   main1.png   2,228 KB  ← gallery image 3 (high-res PNG)
--   main4.png             ← referenced in old JS but does NOT exist
-- ══════════════════════════════════════════════════════════════════
UPDATE admin_products_catalog SET
  main_image     = '/Electronique/laptop/main.webp',
  gallery_images = '[
    "/Electronique/laptop/main2.png",
    "/Electronique/laptop/main3.png",
    "/Electronique/laptop/main1.png"
  ]'::jsonb
WHERE catalog_id = 83;


-- ══════════════════════════════════════════════════════════════════
-- Product 84 — ساعة ذكية Modio ST11 مع 3 أزواج أساور
--
-- Files found on disk:
--   main.webp     1,721 KB  ← MAIN IMAGE
--   image-2.webp  1,631 KB  ← gallery image 1
--   image-3.webp  1,805 KB  ← gallery image 2
--   image-4.webp  1,639 KB  ← gallery image 3
-- ══════════════════════════════════════════════════════════════════
UPDATE admin_products_catalog SET
  main_image     = '/Electronique/smart-watch/modio-st11-smart-watch/main.webp',
  gallery_images = '[
    "/Electronique/smart-watch/modio-st11-smart-watch/image-2.webp",
    "/Electronique/smart-watch/modio-st11-smart-watch/image-3.webp",
    "/Electronique/smart-watch/modio-st11-smart-watch/image-4.webp"
  ]'::jsonb
WHERE catalog_id = 84;


-- ══════════════════════════════════════════════════════════════════
-- Product 85 — Anker SoundCore R50i VG Earbuds (Black)
--
-- Files found on disk:
--   main.png           36 KB  ← MAIN IMAGE (= images/main.png, exact duplicate)
--   images/main.png    36 KB  ← duplicate of main.png — skip
--   images/1.png       30 KB  ← gallery image 1
--   images/2.png       13 KB  ← gallery image 2
--   images/3.png       38 KB  ← gallery image 3
-- ══════════════════════════════════════════════════════════════════
UPDATE admin_products_catalog SET
  main_image     = '/Electronique/earbuds/anker-soundcore-r50i-vg/main.png',
  gallery_images = '[
    "/Electronique/earbuds/anker-soundcore-r50i-vg/images/1.png",
    "/Electronique/earbuds/anker-soundcore-r50i-vg/images/2.png",
    "/Electronique/earbuds/anker-soundcore-r50i-vg/images/3.png"
  ]'::jsonb
WHERE catalog_id = 85;


-- ══════════════════════════════════════════════════════════════════
-- Product 87 — Airpods 4 Type-C Vrac (Garantie)
--
-- Files found on disk:
--   main.webp   1,033 KB  ← MAIN IMAGE (only image)
-- ══════════════════════════════════════════════════════════════════
UPDATE admin_products_catalog SET
  main_image     = '/Electronique/earbuds/airpods-4-type-c-vrac/main.webp',
  gallery_images = '[]'::jsonb
WHERE catalog_id = 87;


-- ══════════════════════════════════════════════════════════════════
-- Product 88 — Hoco J132A 20000mAh Power Bank
--
-- Files found on disk:
--   main.webp  1,357 KB  ← MAIN IMAGE (= main.png, exact duplicate)
--   main.png   1,357 KB  ← duplicate of main.webp — skip
-- ══════════════════════════════════════════════════════════════════
UPDATE admin_products_catalog SET
  main_image     = '/Electronique/power-bank/hoco-j132a-20000mah-power-bank/main.webp',
  gallery_images = '[]'::jsonb
WHERE catalog_id = 88;


-- ── Verify — should return 5 rows with correct image counts ───────
SELECT
  catalog_id,
  product_name,
  main_image,
  jsonb_array_length(gallery_images) AS gallery_count,
  gallery_images
FROM admin_products_catalog
WHERE catalog_id IN (83, 84, 85, 87, 88)
ORDER BY catalog_id;
