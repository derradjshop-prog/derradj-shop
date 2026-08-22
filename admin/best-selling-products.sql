-- ================================================================
-- Derradj Shop - Manually-curated Best-Selling Products section
--
-- Adds:
--   1. bestseller_picks table — references admin_products_catalog,
--      stores only the manual display order (no product data
--      duplicated).
--   2. site_settings row for the section's enable/disable flag
--      (site_settings table already exists — see book-sorting-mode.sql).
--
-- Safe: does not change product names, prices, stock, categories,
-- orders, or the existing book_sort_mode setting.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.bestseller_picks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES public.admin_products_catalog(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id)
);

CREATE INDEX IF NOT EXISTS idx_bestseller_picks_display_order
  ON public.bestseller_picks (display_order ASC);

ALTER TABLE public.bestseller_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_bestseller_picks" ON public.bestseller_picks;
CREATE POLICY "public_read_bestseller_picks"
  ON public.bestseller_picks
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_manage_bestseller_picks" ON public.bestseller_picks;
CREATE POLICY "authenticated_manage_bestseller_picks"
  ON public.bestseller_picks
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO public.site_settings (key, value)
VALUES ('bestsellers_section_enabled', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- Verify:
-- SELECT * FROM public.bestseller_picks ORDER BY display_order ASC;
-- SELECT * FROM public.site_settings WHERE key = 'bestsellers_section_enabled';
