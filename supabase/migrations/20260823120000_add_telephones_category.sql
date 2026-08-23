-- ================================================================
-- Derradj Shop — Add "Téléphones — الهواتف" category
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Adds a new electronics subcategory for smartphones/mobile phones to
-- the existing `categories` table (single source of truth for the
-- admin subcategory picker and the storefront filter chips — see
-- admin/setup-categories.sql and admin/products-manager.js). No schema
-- change: reuses the existing name/slug/icon/sort_order/is_active
-- columns exactly like the other 17 seeded rows.
--
-- sort_order 5 places it before "Prise Chargeur" (10) — phones are the
-- device the other categories' accessories (chargers, cases, AirPods,
-- power banks, ...) are for, so it leads the list rather than sitting
-- among the accessory rows.
--
-- Slug 'telephones' is distinct from the existing 'support-telephone'
-- (phone holder/mount) — different product, not a rename or duplicate.
--
-- Safe to run more than once — ON CONFLICT (slug) DO NOTHING.
-- ================================================================

INSERT INTO categories (name, slug, icon, sort_order, is_active) VALUES
  ('Téléphones — الهواتف', 'telephones', '📱', 5, true)
ON CONFLICT (slug) DO NOTHING;

-- Verify — should show the new row alongside the existing 17
SELECT icon, name, slug, sort_order, is_active
FROM   categories
ORDER  BY sort_order;
