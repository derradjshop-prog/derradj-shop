-- ============================================================
-- supabase-setup-products.sql â€” Derradj Shop
-- Ø¥Ø¯Ø§Ø±Ø© ØªÙˆÙØ± Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª
-- Ø´ØºÙ‘Ù„ Ù‡Ø°Ø§ Ø§Ù„Ù…Ù„Ù ÙÙŠ Supabase SQL Editor Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø© ÙÙ‚Ø·
-- ============================================================

-- 1. Ø¥Ù†Ø´Ø§Ø¡ Ø¬Ø¯ÙˆÙ„ Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª
CREATE TABLE IF NOT EXISTS public.product_availability (
  catalog_id  INTEGER       PRIMARY KEY,
  name        TEXT          NOT NULL,
  available   BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 2. ØªÙØ¹ÙŠÙ„ RLS
ALTER TABLE public.product_availability ENABLE ROW LEVEL SECURITY;

-- 3. ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø¹Ø§Ù…Ø© (Ø§Ù„Ø²ÙˆØ§Ø± ÙŠÙ‚Ø±Ø¤ÙˆÙ† Ø§Ù„ØªÙˆÙØ±)
DROP POLICY IF EXISTS "Public read products" ON public.product_availability;
CREATE POLICY "Public read products"
  ON public.product_availability FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4. ØµÙ„Ø§Ø­ÙŠØ© Ø§Ù„ØªØ­Ø¯ÙŠØ« Ù„Ù„Ù…Ø´Ø±ÙÙŠÙ† Ø§Ù„Ù…Ø³Ø¬Ù‘Ù„ÙŠÙ† ÙÙ‚Ø·
DROP POLICY IF EXISTS "Staff update products" ON public.product_availability;
CREATE POLICY "Staff update products"
  ON public.product_availability FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Ø¥Ø¯Ø±Ø§Ø¬ Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ© (Ø¬Ù…ÙŠØ¹Ù‡Ø§ Ù…ØªÙˆÙØ±Ø© ÙÙŠ Ø§Ù„Ø¨Ø¯Ø§ÙŠØ©)
--    catalog_id ÙŠØ¬Ø¨ Ø£Ù† ÙŠØªØ·Ø§Ø¨Ù‚ Ù…Ø¹ SHOP_CATALOG ÙÙŠ cart.js
INSERT INTO public.product_availability (catalog_id, name, available) VALUES
  (2,  'Ø§Ù„Ø¹Ø§Ø¯Ø§Øª Ø§Ù„Ø³Ø¨Ø¹ Ù„Ù„Ù†Ø§Ø³ Ø§Ù„Ø£ÙƒØ«Ø± ÙØ¹Ø§Ù„ÙŠØ©',   true),
  (3,  'Ø§Ù„Ø¹Ø§Ø¯Ø§Øª Ø§Ù„Ø°Ø±ÙŠØ©',                       true),
  (4,  'Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ù€ 333',                        true),
  (5,  'Ø§Ù„Ø£Ø«Ø± Ø§Ù„Ù…Ø°Ù‡Ù„ Ù„Ù„Ø¹Ø§Ø¯Ø§Øª Ø§Ù„Ø¨Ø³ÙŠØ·Ø©',         true),
  (6,  'Ù…ØªØ¹Ø© Ø¹Ø¯Ù… Ø§Ù„ÙƒÙ…Ø§Ù„',                      true),
  (7,  'Ø§Ù„Ø´Ø¬Ø§Ø¹Ø© ØªÙ†Ø§Ø¯ÙŠ',                        true),
  (8,  'Ù‚ÙˆØ© Ø§Ù„Ø¢Ù†',                             true),
  (9,  'Ø¨Ø±ÙˆØ¨Ø§ØºÙ†Ø¯Ø§',                            true),
  (10, 'ÙÙˆØ¶Ù‰ Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©',                         true),
  (11, 'Ø§Ù„Ø³Ø¹Ø§Ø¯Ø© Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠØ© ÙˆØ§Ù„Ø³Ø¹Ø§Ø¯Ø© Ø§Ù„Ø²Ø§Ø¦ÙØ©',    true),
  (12, 'Ù…Ø³Ø§Ø±Ø§Øª Ø§Ù„Ø³Ø¹Ø§Ø¯Ø©',                       true),
  (13, 'ÙÙŠ Ø¹Ø§Ù„Ù… Ø§Ù„Ø£Ø´Ø¨Ø§Ø­ Ø§Ù„Ø¬Ø§Ø¦Ø¹Ø©',              true),
  (14, 'ØªØ§Ø±ÙŠØ® Ù…ÙˆØ¬Ø² Ù„Ù„Ø²Ù…Ø§Ù†',                    true),
  (16, 'Ù…ØªØ¹Ø© Ø£Ù† ØªÙƒÙˆÙ† ÙÙŠ Ø§Ù„Ø«Ù„Ø§Ø«ÙŠÙ†',             true),
  (17, 'ÙƒÙ† Ù…Ø¹ Ø§Ù„Ø´Ø®Øµ Ø§Ù„Ø°ÙŠ ÙŠØ¬Ø¹Ù„Ùƒ Ø³Ø¹ÙŠØ¯Ø§Ù‹',       true),
  (20, 'Ø§Ù„Ø°ÙƒØ§Ø¡ Ø§Ù„Ø¹Ø§Ø·ÙÙŠ',                       true),
  (21, 'ÙƒÙŠÙ ØªØ¨ÙŠØ¹ Ø£ÙŠ Ø´ÙŠØ¡ Ù„Ø£ÙŠ Ø¥Ù†Ø³Ø§Ù†',           true)
ON CONFLICT (catalog_id) DO NOTHING;

-- ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„Ù†ØªÙŠØ¬Ø©
SELECT catalog_id, name, available FROM public.product_availability ORDER BY catalog_id;
