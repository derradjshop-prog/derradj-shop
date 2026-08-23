-- ================================================================
-- admin/setup-categories.sql — Derradj Shop
--
-- Turns the existing (already-created, currently empty, currently
-- unused — confirmed via `git grep` for `.from('categories')` /
-- `rest/v1/categories` across the whole repo: zero hits) `categories`
-- table into the single source of truth for electronics subcategories
-- (Prise Chargeur, Power Bank, AirPods, ...), replacing the free-text
-- "type it yourself" subcategory field in the admin panel.
--
-- Existing columns confirmed live (id, name, slug, description,
-- sort_order, is_active, image_url, created_at) are reused as-is.
-- The only schema change is one additive nullable `icon` column —
-- there's no existing field for the emoji shown next to each category.
--
-- admin_products_catalog.category ('electronics' | 'books') and the
-- existing `subcategory` TEXT column are NOT touched by this file —
-- see admin/products-manager.js for how the app maps between them.
--
-- HOW TO RUN:
--   1. Go to https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
--   2. Paste this file and click "Run"
--
-- SAFE to run more than once — every statement is idempotent.
-- ================================================================


-- ── STEP 1: icon column + slug uniqueness (needed for ON CONFLICT) ──
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON categories (slug);


-- ── STEP 2: seed the 17 electronics subcategories ───────────────────
-- This is a flat list (no group headers) — `description` is left NULL,
-- the admin dropdown renders it ungrouped.
INSERT INTO categories (name, slug, icon, sort_order, is_active) VALUES
  ('Prise Chargeur — شاحن الهاتف',   'prise-chargeur',     '⚡', 10,  true),
  ('Power Bank — بنك الطاقة',        'power-bank',         '🔋', 20,  true),
  ('AirPods — سماعات بلوتوث',        'airpods',            '🎧', 30,  true),
  ('Chargeurs — شواحن',              'chargeurs',          '🔌', 40,  true),
  ('Câbles USB — كابلات USB',        'cables-usb',         '🔗', 50,  true),
  ('Autre — منتجات أخرى',            'autre',              '📱', 60,  true),
  ('Kit Main Libre — سماعات سلكية',  'kit-main-libre',     '🎧', 70,  true),
  ('Flash Disk & SD Card — ذاكرة',   'flash-disk-sd-card', '💾', 80,  true),
  ('Support Téléphone — حامل الهاتف','support-telephone',  '📱', 90,  true),
  ('OTG',                            'otg',                '🔌', 100, true),
  ('Cable AUX',                      'cable-aux',          '🎵', 110, true),
  ('Glass — زجاج الحماية',           'glass',              '🛡️', 120, true),
  ('Modulateur',                     'modulateur',         '🚗', 130, true),
  ('Chargeurs Auto — شواحن السيارة', 'chargeurs-auto',     '🚘', 140, true),
  ('Battery — بطاريات',              'battery',            '🔋', 150, true),
  ('Baffle — مكبرات الصوت',          'baffle',             '🔊', 160, true),
  ('Smartwatch — الساعات الذكية',    'smartwatch',         '⌚', 170, true)
ON CONFLICT (slug) DO NOTHING;


-- ── STEP 3: RLS — mirrors admin_products_catalog exactly
--    (see supabase-products-setup.sql) — public reads active rows,
--    only authenticated (admin) users can create/edit/delete. ────────
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_active_categories" ON categories;
CREATE POLICY "public_read_active_categories"
  ON categories
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "authenticated_manage_categories" ON categories;
CREATE POLICY "authenticated_manage_categories"
  ON categories
  FOR ALL
  USING      (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');


-- ── STEP 4: verify — should return 17 rows ───────────────────────────
SELECT icon, name, slug, sort_order, is_active
FROM   categories
ORDER  BY sort_order;
