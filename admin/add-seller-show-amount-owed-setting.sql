-- ================================================================
-- admin/add-seller-show-amount-owed-setting.sql — Derradj Shop
--
-- Lets the MAIN admin (0555491316@derradjshop.com only — not just any
-- role='admin' account) control, per seller, whether that seller's
-- dashboard shows the "Amount Owed to Derradj Abdellah" stat card.
--
-- 1. Adds staff_accounts.show_amount_owed (default TRUE — preserves
--    today's behavior, where the card is always shown, for every
--    existing seller row until the admin explicitly changes it).
-- 2. Adds public.is_main_admin() — same SECURITY DEFINER pattern as
--    public.is_admin()/current_staff_id() in supabase-assignment-system.sql,
--    but additionally requires the caller's own staff_accounts.email to
--    match the platform owner's account exactly. This is the actual
--    security boundary: hiding the "Sellers" tab in admin.js is only
--    UI convenience — this policy is what makes it impossible for any
--    other account (including a future second 'admin' role account, or
--    Mehdi via DevTools) to change the setting.
-- 3. Adds the UPDATE policy on staff_accounts (there was none before —
--    see supabase-assignment-system.sql:81-82, "No INSERT/UPDATE/DELETE
--    policy added"), scoped by is_main_admin() in both USING and
--    WITH CHECK, so only that one account can write to staff_accounts
--    at all, and only while authenticated as themselves.
--
-- Existing SELECT policy on staff_accounts (staff_accounts_self_or_admin_select,
-- USING id = auth.uid() OR is_admin()) is untouched — any admin can still
-- read the sellers list, exactly as before this change.
--
-- Safe to run multiple times.
-- HOW TO RUN:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
-- ================================================================

-- ── 1. New column ────────────────────────────────────────────────
ALTER TABLE public.staff_accounts
  ADD COLUMN IF NOT EXISTS show_amount_owed BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 2. Helper — true only for the platform owner's own account ────
CREATE OR REPLACE FUNCTION public.is_main_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_accounts
    WHERE id = auth.uid()
      AND is_active = TRUE
      AND role = 'admin'
      AND lower(email) = '0555491316@derradjshop.com'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_main_admin() TO authenticated;

-- ── 3. Only the main admin may update staff_accounts (toggling
--       show_amount_owed is the only field the app writes today) ──
DROP POLICY IF EXISTS "staff_accounts_main_admin_update" ON public.staff_accounts;
CREATE POLICY "staff_accounts_main_admin_update"
  ON public.staff_accounts
  FOR UPDATE
  TO authenticated
  USING      (public.is_main_admin())
  WITH CHECK (public.is_main_admin());

-- ── 4. Reload PostgREST's schema cache (new column above) ─────────
NOTIFY pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'staff_accounts' AND column_name = 'show_amount_owed';
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'staff_accounts';
-- ↑ should now show staff_accounts_self_or_admin_select (SELECT) and
--   staff_accounts_main_admin_update (UPDATE)
