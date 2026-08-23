-- ================================================================
-- admin/update-supabase-image-urls.sql — Derradj Shop
--
-- STEP 3 of Image Migration:
--   Updates main_image and gallery_images for all 5 visible
--   electronics products with their final Supabase Storage URLs.
--
-- Run this ONLY AFTER upload-to-supabase-storage.ps1 has completed
-- successfully (all 14 images uploaded without errors).
--
-- Run in Supabase SQL Editor:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
-- ================================================================

-- ── Storage base URL (all images are public, no auth required) ───────
-- https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/


-- ══════════════════════════════════════════════════════════════════════
-- Product 83 — حامل اللابتوب القابل للتعديل
-- Uploaded: main.webp, gallery-1.png, gallery-2.png, gallery-3.png
-- ══════════════════════════════════════════════════════════════════════
UPDATE admin_products_catalog SET
  main_image     = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/adjustable-laptop-stand/main.webp',
  gallery_images = '[
    "https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/adjustable-laptop-stand/gallery-1.png",
    "https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/adjustable-laptop-stand/gallery-2.png",
    "https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/adjustable-laptop-stand/gallery-3.png"
  ]'::jsonb
WHERE catalog_id = 83;


-- ══════════════════════════════════════════════════════════════════════
-- Product 84 — ساعة ذكية Modio ST11 مع 3 أزواج أساور
-- Uploaded: main.webp, gallery-1.webp, gallery-2.webp, gallery-3.webp
-- ══════════════════════════════════════════════════════════════════════
UPDATE admin_products_catalog SET
  main_image     = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/modio-st11-smart-watch/main.webp',
  gallery_images = '[
    "https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/modio-st11-smart-watch/gallery-1.webp",
    "https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/modio-st11-smart-watch/gallery-2.webp",
    "https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/modio-st11-smart-watch/gallery-3.webp"
  ]'::jsonb
WHERE catalog_id = 84;


-- ══════════════════════════════════════════════════════════════════════
-- Product 85 — Anker SoundCore R50i VG Earbuds (Black)
-- Uploaded: main.png, gallery-1.png, gallery-2.png, gallery-3.png
-- ══════════════════════════════════════════════════════════════════════
UPDATE admin_products_catalog SET
  main_image     = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/anker-soundcore-r50i-vg/main.png',
  gallery_images = '[
    "https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/anker-soundcore-r50i-vg/gallery-1.png",
    "https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/anker-soundcore-r50i-vg/gallery-2.png",
    "https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/anker-soundcore-r50i-vg/gallery-3.png"
  ]'::jsonb
WHERE catalog_id = 85;


-- ══════════════════════════════════════════════════════════════════════
-- Product 87 — Airpods 4 Type-C Vrac (Garantie)
-- Uploaded: main.webp (only image)
-- ══════════════════════════════════════════════════════════════════════
UPDATE admin_products_catalog SET
  main_image     = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/airpods-4-type-c-vrac/main.webp',
  gallery_images = '[]'::jsonb
WHERE catalog_id = 87;


-- ══════════════════════════════════════════════════════════════════════
-- Product 88 — Hoco J132A 20000mAh Power Bank
-- Uploaded: main.webp (main.png was identical — skipped)
-- ══════════════════════════════════════════════════════════════════════
UPDATE admin_products_catalog SET
  main_image     = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/storage/v1/object/public/product-images/electronics/hoco-j132a-20000mah-power-bank/main.webp',
  gallery_images = '[]'::jsonb
WHERE catalog_id = 88;


-- ── Verify — should return 5 rows ─────────────────────────────────────
SELECT
  catalog_id,
  product_name,
  LEFT(main_image, 80)                  AS main_image_preview,
  jsonb_array_length(gallery_images)    AS gallery_count
FROM admin_products_catalog
WHERE catalog_id IN (83, 84, 85, 87, 88)
ORDER BY catalog_id;
