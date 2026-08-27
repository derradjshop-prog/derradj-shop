-- ================================================================
-- Derradj Shop - Centralized business phone / WhatsApp number
--
-- Adds:
--   1. site_settings row 'business_phone' (reuses the existing
--      key/value settings table from admin/book-sorting-mode.sql —
--      no new table needed).
--   2. A key-aware write policy so only admins (public.is_admin(),
--      see supabase-assignment-system.sql) can change business_phone,
--      while every other existing key in site_settings (book_sort_mode,
--      bestsellers_section_enabled) keeps being writable by any
--      authenticated staff member exactly as before.
--
-- Explicitly OUT of scope: the Electronic Subscriptions WhatsApp
-- number (213555491316, WHATSAPP_NUMBER_SUBSCRIPTIONS in
-- js/product-template.js / js/products-loader.js). That number stays
-- a hardcoded literal in application code and is never read from this
-- row — the two happen to start out equal but are independent
-- settings by design (see js/business-contact.js header comment).
--
-- Safe: does not touch products, orders, customer phone numbers, or
-- staff_accounts.
-- ================================================================

-- 1. Default value — 0555491316 local / 213555491316 international.
INSERT INTO public.site_settings (key, value)
VALUES ('business_phone', '{"local":"0555491316","display":"0555 49 13 16","intl":"213555491316"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Public read (storefront needs this anonymously) — already granted
--    by the existing "public_read_site_settings" policy, nothing to add.

-- 3. Restrict writes to business_phone to admins only. Replaces the
--    single blanket "any authenticated user" policy with one that is
--    conditional on the row's key: every key except business_phone
--    keeps the old permissive behaviour (USING/WITH CHECK true),
--    business_phone additionally requires public.is_admin().
DROP POLICY IF EXISTS "authenticated_manage_site_settings" ON public.site_settings;
CREATE POLICY "authenticated_manage_site_settings"
  ON public.site_settings
  FOR ALL
  TO authenticated
  USING (key <> 'business_phone' OR public.is_admin())
  WITH CHECK (key <> 'business_phone' OR public.is_admin());

NOTIFY pgrst, 'reload schema';

-- Verify:
-- SELECT * FROM public.site_settings WHERE key = 'business_phone';
-- (as a non-admin authenticated user) UPDATE public.site_settings SET value = value WHERE key = 'business_phone'; -- should fail
-- (as an admin) UPDATE public.site_settings SET value = value WHERE key = 'business_phone'; -- should succeed
