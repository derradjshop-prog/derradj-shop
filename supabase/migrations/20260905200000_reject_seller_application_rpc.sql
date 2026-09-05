-- ================================================================
-- Derradj Shop — Seller Marketplace: reject_seller_application() RPC
--
-- Symmetric counterpart to approve_seller_application() (added in
-- 20260905194233_seller_marketplace.sql). ADDITIVE ONLY -- does not
-- touch seller_applications_admin_all or any other existing policy,
-- table, trigger, or function from that migration.
--
-- WHY AN RPC INSTEAD OF A PLAIN CLIENT-SIDE UPDATE:
-- seller_applications_admin_all (FOR ALL TO authenticated
-- USING/WITH CHECK is_admin()) already technically permits an admin's
-- client to run `update({status:'rejected', ...}).eq('id', appId)`
-- directly, so a raw update would not be an RLS hole for a genuine
-- admin caller. But going through a SECURITY DEFINER RPC instead:
--   1. Keeps the security posture symmetric with approve (both
--      review actions are atomic, admin-gated, pending-checked
--      RPCs -- not "approve via RPC, reject via raw table write").
--   2. Prevents a client from ever setting reviewed_by to an
--      arbitrary staff_accounts.id -- the server always sets it to
--      current_staff_id() itself, exactly like approve.
--   3. Locks the row FOR UPDATE and requires status = 'pending'
--      before transitioning it, closing the same double-review race
--      window (e.g. two admin tabs open) that approve already closes.
--
-- The real gate against a non-admin (including the applicant
-- themselves, authenticated with their own fresh JWT) is the
-- public.is_admin() check on the first line -- exactly like
-- approve_seller_application(). Nothing here relies on the calling
-- UI hiding the button.
--
-- SECURITY NOTE -- deliberately NOT copying approve_seller_application()'s
-- exact `IF NOT public.is_admin() THEN RAISE EXCEPTION` spelling here.
-- public.is_admin() is `SELECT public.current_staff_role() = 'admin'`,
-- and public.current_staff_role() is a single-row SQL SELECT against
-- staff_accounts that returns SQL NULL (not false) whenever the caller
-- has NO matching staff_accounts row at all (or a matching but
-- is_active = false row) -- which is exactly the state of a pending
-- seller_applications submitter: they have a real authenticated
-- Supabase JWT (from seller/register.html's auth.signUp()) but are not
-- yet in staff_accounts. In that case is_admin() returns NULL, and
-- `NOT NULL` is also NULL -- and PL/pgSQL's IF-THEN treats a NULL
-- condition as false, i.e. it SILENTLY SKIPS the RAISE EXCEPTION and
-- lets execution fall through past END IF as if the check had passed.
-- `IF public.is_admin() IS NOT TRUE THEN` avoids that trap: it only
-- skips the exception when is_admin() is the literal boolean TRUE,
-- and raises for TRUE's only two alternatives, FALSE and NULL alike.
-- This is a strictly safer, behavior-preserving rewrite for genuine
-- admins/sellers/agents (all of whom get a real, non-null boolean back
-- from is_admin()) -- it only changes the outcome for the previously
-- mis-handled NULL case. See this migration's accompanying report for
-- why approve_seller_application() and other pre-existing
-- `IF NOT public.is_admin()` gates elsewhere in this project likely
-- share this same defect and should be reviewed/patched separately,
-- with explicit authorization, since that touches already-deployed
-- functions outside this migration's scope.
-- ================================================================

CREATE OR REPLACE FUNCTION public.reject_seller_application(app_id UUID, notes TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app public.seller_applications%ROWTYPE;
BEGIN
  IF public.is_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_app
  FROM public.seller_applications
  WHERE id = app_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application % not found', app_id;
  END IF;

  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'Application % is not pending (current status: %)', app_id, v_app.status;
  END IF;

  UPDATE public.seller_applications
  SET status      = 'rejected',
      admin_notes = notes,
      reviewed_by = public.current_staff_id(),
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = app_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_seller_application(UUID, TEXT) TO authenticated;

-- Reload PostgREST's schema cache so the new RPC is callable immediately.
NOTIFY pgrst, 'reload schema';

-- ================================================================
-- Done -- verify with:
--
-- SELECT public.reject_seller_application('<APPLICATION_ID>', 'not a fit right now');
-- SELECT status, admin_notes, reviewed_by, reviewed_at FROM public.seller_applications
-- WHERE id = '<APPLICATION_ID>';
--
-- Regression -- calling it twice on the same row must fail the second time
-- ("... is not pending ..."), and calling it as a non-admin (including the
-- applicant's own fresh JWT) must fail with 'not authorized'.
-- ================================================================
