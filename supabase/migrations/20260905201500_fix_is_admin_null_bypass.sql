-- ================================================================
-- SECURITY FIX — public.is_admin() NULL-vs-false bypass.
--
-- public.is_admin() was defined as:
--   SELECT public.current_staff_role() = 'admin';
-- current_staff_role() returns SQL NULL (not an error, not false) for
-- any authenticated caller with no matching staff_accounts row (or an
-- inactive one) -- e.g. a freshly-signed-up marketplace-seller
-- applicant who has a real auth.users JWT but is not yet approved.
-- NULL = 'admin' evaluates to NULL, so is_admin() returns NULL for
-- that caller, not false.
--
-- That is harmless for RLS USING/WITH CHECK clauses (a NULL condition
-- there fails closed -- the row is correctly excluded). It is NOT
-- harmless for the "IF NOT public.is_admin() THEN RAISE EXCEPTION"
-- guard idiom used inside several SECURITY DEFINER functions
-- (approve_seller_application(), mark_order_delivered(), the
-- impersonation RPCs, etc.): NOT NULL is NULL, and
-- "IF NULL THEN ... END IF" does not execute -- the exception never
-- fires, and the function silently proceeds as if the caller were an
-- admin.
--
-- Before the Seller Marketplace feature there was no public path to
-- obtain an authenticated-but-non-staff JWT, so this was latent.
-- seller/register.html's supabase.auth.signUp() is the first such
-- path, making this live-exploitable: any visitor can register, then
-- call approve_seller_application(their_own_pending_application_id)
-- directly and self-grant a staff_accounts row with role='seller',
-- bypassing admin review entirely.
--
-- Fix: make is_admin() return a real boolean in every case via
-- COALESCE. This is a pure hardening change -- for every already-legitimate
-- caller (real admin, real seller, real agent, or a genuinely
-- unauthenticated request) current_staff_role() = 'admin' already
-- evaluated to a real TRUE/FALSE, so their behavior is unchanged. Only
-- the NULL case (no matching active staff_accounts row) changes, from
-- NULL to false -- which is what every call site already assumed it
-- meant. Fixing it here fixes every "IF NOT public.is_admin()" call
-- site across the codebase at once, without editing each function.
--
-- is_main_admin() (admin/add-seller-show-amount-owed-setting.sql) is
-- NOT affected -- it's defined via SELECT EXISTS(...), which is
-- already NULL-safe (always returns a real boolean).
-- ================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.current_staff_role() = 'admin', false);
$$;

-- ================================================================
-- Verify after applying:
--
-- -- As an authenticated user with NO staff_accounts row (e.g. a
-- -- freshly signed-up seller applicant), is_admin() must now return
-- -- false, not NULL:
-- SELECT public.is_admin(); -- expect: f
--
-- -- Re-run the exact self-approval attempt described above as that
-- -- same non-staff user -- it must now raise 'not authorized':
-- SELECT public.approve_seller_application('<their own pending application id>', null);
-- ================================================================
