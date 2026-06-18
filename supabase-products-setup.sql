-- =============================================================
-- Derradj Shop — Admin Products Catalog Setup
-- Run this ONCE in your Supabase SQL editor:
-- https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
--
-- SAFE: does NOT touch your existing tables:
--   products, orders, order_items, product_availability,
--   customer_reviews, messages, staff_accounts, categories
-- =============================================================

-- 1. Sequence for catalog_id
--    Starts at 200 — avoids conflicts with legacy catalogIds 0–88
CREATE SEQUENCE IF NOT EXISTS admin_products_catalog_id_seq
  START WITH 200 INCREMENT BY 1;

-- 2. New products table (completely separate from existing `products`)
CREATE TABLE IF NOT EXISTS admin_products_catalog (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id         INTEGER     UNIQUE DEFAULT nextval('admin_products_catalog_id_seq'),
  product_name       TEXT        NOT NULL,
  product_name_ar    TEXT,
  short_description  TEXT,
  full_description   TEXT,
  category           TEXT        NOT NULL DEFAULT 'electronics',
  subcategory        TEXT,
  price              INTEGER     NOT NULL DEFAULT 0,
  old_price          INTEGER,
  discount_enabled   BOOLEAN     DEFAULT false,
  stock_status       TEXT        DEFAULT 'in_stock'
                                 CHECK (stock_status IN ('in_stock','low_stock','out_of_stock')),
  quantity           INTEGER     DEFAULT 0,
  slug               TEXT        UNIQUE,
  product_url        TEXT,
  main_image         TEXT,
  gallery_images     JSONB       DEFAULT '[]'::jsonb,
  seo_title          TEXT,
  seo_description    TEXT,
  keywords           TEXT,
  is_active          BOOLEAN     DEFAULT true,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- 3. Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION update_admin_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_products_catalog_updated_at ON admin_products_catalog;
CREATE TRIGGER admin_products_catalog_updated_at
  BEFORE UPDATE ON admin_products_catalog
  FOR EACH ROW EXECUTE FUNCTION update_admin_products_updated_at();

-- 4. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_apc_slug       ON admin_products_catalog (slug);
CREATE INDEX IF NOT EXISTS idx_apc_category   ON admin_products_catalog (category);
CREATE INDEX IF NOT EXISTS idx_apc_is_active  ON admin_products_catalog (is_active);
CREATE INDEX IF NOT EXISTS idx_apc_catalog_id ON admin_products_catalog (catalog_id);

-- =============================================================
-- 5. Row Level Security
-- =============================================================
ALTER TABLE admin_products_catalog ENABLE ROW LEVEL SECURITY;

-- Public visitors can read active products
DROP POLICY IF EXISTS "public_read_active_admin_products" ON admin_products_catalog;
CREATE POLICY "public_read_active_admin_products" ON admin_products_catalog
  FOR SELECT
  USING (is_active = true);

-- Authenticated admin/staff can do full CRUD
DROP POLICY IF EXISTS "authenticated_manage_admin_products" ON admin_products_catalog;
CREATE POLICY "authenticated_manage_admin_products" ON admin_products_catalog
  FOR ALL
  USING      (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================================
-- 6. Storage bucket for product images
--    Name: admin-product-images (separate from any existing bucket)
-- =============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'admin-product-images',
  'admin-product-images',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "public_view_admin_product_images"  ON storage.objects;
DROP POLICY IF EXISTS "auth_upload_admin_product_images"  ON storage.objects;
DROP POLICY IF EXISTS "auth_update_admin_product_images"  ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_admin_product_images"  ON storage.objects;

CREATE POLICY "public_view_admin_product_images" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'admin-product-images');

CREATE POLICY "auth_upload_admin_product_images" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'admin-product-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "auth_update_admin_product_images" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'admin-product-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "auth_delete_admin_product_images" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'admin-product-images'
    AND auth.role() = 'authenticated'
  );

-- =============================================================
-- Verify after running:
--   SELECT * FROM admin_products_catalog LIMIT 5;
--   SELECT * FROM storage.buckets WHERE id = 'admin-product-images';
-- =============================================================
