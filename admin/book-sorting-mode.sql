-- ================================================================
-- Derradj Shop - Book sorting mode
--
-- Adds:
--   1. site_settings row for the persistent book sorting mode
--   2. public book_sales_summary view grouped from order_items.quantity
--
-- Safe: does not change product names, prices, stock, orders, or sales data.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.update_site_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS site_settings_updated_at ON public.site_settings;
CREATE TRIGGER site_settings_updated_at
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_site_settings_updated_at();

INSERT INTO public.site_settings (key, value)
VALUES ('book_sort_mode', '{"mode":"manual"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_site_settings" ON public.site_settings;
CREATE POLICY "public_read_site_settings"
  ON public.site_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_manage_site_settings" ON public.site_settings;
CREATE POLICY "authenticated_manage_site_settings"
  ON public.site_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE VIEW public.book_sales_summary AS
SELECT
  oi.product_name,
  COALESCE(SUM(oi.quantity), 0)::INTEGER AS sold
FROM public.order_items oi
WHERE oi.product_name IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.admin_products_catalog p
    WHERE p.category = 'books'
      AND p.is_active = true
      AND (
        oi.product_name = p.product_name
        OR oi.product_name = p.product_name_ar
      )
  )
GROUP BY oi.product_name;

GRANT SELECT ON public.book_sales_summary TO anon, authenticated;

-- Verify:
-- SELECT * FROM public.site_settings WHERE key = 'book_sort_mode';
-- SELECT * FROM public.book_sales_summary ORDER BY sold DESC, product_name ASC LIMIT 20;
