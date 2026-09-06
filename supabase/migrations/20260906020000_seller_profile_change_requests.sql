-- ================================================================
-- Derradj Shop -- Seller Profile Change Requests (admin-approval-gated)
-- ================================================================
-- Adds an "edit my seller profile" workflow. A seller's editable
-- identity today lives across two tables:
--   - public.staff_accounts (full_name, email, role, is_active) --
--     no client UPDATE policy exists for sellers, only
--     staff_accounts_main_admin_update
--     (admin/add-seller-show-amount-owed-setting.sql) can write it.
--   - public.seller_profiles (boutique_name, boutique_description,
--     wilaya, commune, whatsapp, social_link) -- created by
--     20260905194233_seller_marketplace.sql, populated only for
--     sellers who went through the marketplace application+approval
--     flow; older/legacy sellers have no row here at all.
--
-- seller_profiles already has seller_profiles_self_update (seller can
-- UPDATE own row directly) and seller_profiles_self_select RLS
-- policies from that same migration. Those are pre-existing,
-- currently unused by any UI, and OUT OF SCOPE -- this migration does
-- NOT touch, remove, or rely on them. This feature deliberately does
-- NOT let a seller write directly to seller_profiles or
-- staff_accounts; it always goes through this new pending-request
-- table + admin-approval RPCs below, so direct self-service on those
-- two tables stays bypassed exactly as it is today.
--
-- There is no dedicated "phone" column anywhere for a seller --
-- seller_profiles.whatsapp is the closest existing phone-like field
-- and is what the seller-facing UI labels the phone number; this
-- migration threads requested_phone through to that same
-- whatsapp column on approval, nothing new is added to seller_profiles.
--
-- Safe to run multiple times (every statement is idempotent).
-- ================================================================


-- ----------------------------------------------------------------
-- 1. Loosen a pre-existing NOT NULL on seller_profiles.boutique_name.
--
--    A legacy (non-marketplace) seller has no seller_profiles row at
--    all yet. When their first-ever profile-change request is
--    approved (see approve_seller_profile_change() below), the
--    INSERT ... ON CONFLICT DO UPDATE needs to be able to create that
--    row even if the seller never supplied a store name in their
--    request (they may only want to change their phone/wilaya/etc,
--    or may not have decided on a boutique name yet). Dropping the
--    NOT NULL is a pure loosening -- every existing row already has a
--    non-null boutique_name (the marketplace application flow that
--    populated them still requires it, unchanged), so no existing row
--    or existing constraint behavior is affected. This does not
--    relax anything for the marketplace-application path itself.
-- ----------------------------------------------------------------
ALTER TABLE public.seller_profiles
  ALTER COLUMN boutique_name DROP NOT NULL;


-- ----------------------------------------------------------------
-- 2. seller_profile_change_requests -- one row per submitted request.
--    Rows are NEVER deleted by the approve/reject RPCs below; status
--    transitions from 'pending' to 'approved'/'rejected' and the row
--    is kept as history so the seller-facing UI can read back a
--    rejected row's admin_notes to show the seller why their last
--    request was rejected.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seller_profile_change_requests (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id                       UUID        NOT NULL REFERENCES public.staff_accounts(id) ON DELETE CASCADE,
  status                          TEXT        NOT NULL DEFAULT 'pending'
                                               CHECK (status IN ('pending','approved','rejected')),
  requested_full_name             TEXT,
  requested_phone                 TEXT,
  requested_boutique_name         TEXT,
  requested_boutique_description  TEXT,
  requested_wilaya                TEXT,
  requested_commune               TEXT,
  requested_social_link           TEXT,
  admin_notes                     TEXT,
  reviewed_by                     UUID        REFERENCES public.staff_accounts(id),
  reviewed_at                     TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A seller may have at most ONE active pending request at a time.
CREATE UNIQUE INDEX IF NOT EXISTS seller_profile_change_requests_pending_uq
  ON public.seller_profile_change_requests (seller_id) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_seller_profile_change_requests_seller_id
  ON public.seller_profile_change_requests (seller_id);


-- ----------------------------------------------------------------
-- 3. RLS -- seller can insert/read only their own requests; only an
--    admin (via is_admin()) can do anything else. Deliberately NO
--    update/delete policy for sellers -- once submitted, only the
--    approve/reject RPCs below (both admin-gated, SECURITY DEFINER)
--    can ever transition a request's status.
-- ----------------------------------------------------------------
ALTER TABLE public.seller_profile_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seller_profile_change_requests_self_insert" ON public.seller_profile_change_requests;
CREATE POLICY "seller_profile_change_requests_self_insert"
  ON public.seller_profile_change_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() = 'seller'
    AND seller_id    = auth.uid()
    AND status       = 'pending'
    AND reviewed_by  IS NULL
    AND reviewed_at  IS NULL
    AND admin_notes  IS NULL
  );
-- The reviewed_by/reviewed_at/admin_notes IS NULL checks close off a
-- client trying to smuggle in an already-reviewed-looking row on
-- INSERT -- only the admin-gated RPCs below are ever allowed to set
-- those columns.

DROP POLICY IF EXISTS "seller_profile_change_requests_self_select" ON public.seller_profile_change_requests;
CREATE POLICY "seller_profile_change_requests_self_select"
  ON public.seller_profile_change_requests FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "seller_profile_change_requests_admin_all" ON public.seller_profile_change_requests;
CREATE POLICY "seller_profile_change_requests_admin_all"
  ON public.seller_profile_change_requests FOR ALL TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());


-- ----------------------------------------------------------------
-- 4. RPC -- approve_seller_profile_change(). The ONLY way a pending
--    request's requested_* fields are ever written into staff_accounts
--    / seller_profiles. SECURITY DEFINER so it can write staff_accounts
--    despite that table having no client-facing UPDATE policy for
--    sellers, and can INSERT/UPDATE seller_profiles for a seller who
--    has no row there yet. The real gate is the is_admin() check on
--    the first line, not RLS.
--
--    Note -- explicitly does NOT touch staff_accounts.role,
--    staff_accounts.is_active, or staff_accounts.email anywhere in
--    this function; only full_name is ever written back to
--    staff_accounts. requested_phone is written to
--    seller_profiles.whatsapp -- see header note above.
--
--    seller_profiles.seller_id already has a UNIQUE constraint from
--    its original migration (20260905194233_seller_marketplace.sql),
--    so ON CONFLICT (seller_id) below is valid.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_seller_profile_change(request_id UUID, notes TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.seller_profile_change_requests%ROWTYPE;
BEGIN
  IF public.is_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_req
  FROM public.seller_profile_change_requests
  WHERE id = request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request % not found', request_id;
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request % is not pending (current status: %)', request_id, v_req.status;
  END IF;

  UPDATE public.staff_accounts
  SET full_name = COALESCE(v_req.requested_full_name, full_name)
  WHERE id = v_req.seller_id;

  INSERT INTO public.seller_profiles
    (seller_id, boutique_name, boutique_description, wilaya, commune, whatsapp, social_link)
  VALUES
    (v_req.seller_id, v_req.requested_boutique_name, v_req.requested_boutique_description,
     v_req.requested_wilaya, v_req.requested_commune, v_req.requested_phone, v_req.requested_social_link)
  ON CONFLICT (seller_id) DO UPDATE SET
    boutique_name         = EXCLUDED.boutique_name,
    boutique_description  = EXCLUDED.boutique_description,
    wilaya                = EXCLUDED.wilaya,
    commune               = EXCLUDED.commune,
    whatsapp              = EXCLUDED.whatsapp,
    social_link           = EXCLUDED.social_link,
    updated_at            = now();

  UPDATE public.seller_profile_change_requests
  SET status      = 'approved',
      admin_notes = notes,
      reviewed_by = public.current_staff_id(),
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_seller_profile_change(UUID, TEXT) TO authenticated;


-- ----------------------------------------------------------------
-- 5. RPC -- reject_seller_profile_change(). Same admin-gate/lock/
--    pending-check shape as approve above, but applies nothing to
--    staff_accounts/seller_profiles -- it only marks the request
--    rejected, keeping the row (with admin_notes) as history so the
--    seller-facing UI can show why their last request was rejected.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_seller_profile_change(request_id UUID, notes TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.seller_profile_change_requests%ROWTYPE;
BEGIN
  IF public.is_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_req
  FROM public.seller_profile_change_requests
  WHERE id = request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request % not found', request_id;
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request % is not pending (current status: %)', request_id, v_req.status;
  END IF;

  UPDATE public.seller_profile_change_requests
  SET status      = 'rejected',
      admin_notes = notes,
      reviewed_by = public.current_staff_id(),
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_seller_profile_change(UUID, TEXT) TO authenticated;


-- ----------------------------------------------------------------
-- 6. Reload PostgREST's schema cache (new table/columns/policies/RPCs).
-- ----------------------------------------------------------------
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- Done -- verify with:
--
-- SELECT column_name, is_nullable FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'seller_profiles'
--   AND column_name = 'boutique_name';
-- -- expect: is_nullable = 'YES'
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'seller_profile_change_requests';
--
-- -- (a) As a logged-in seller, submit a pending request:
-- INSERT INTO public.seller_profile_change_requests
--   (seller_id, requested_full_name, requested_phone, requested_boutique_name,
--    requested_wilaya, requested_commune)
-- VALUES
--   (auth.uid(), 'Ahmed Benali', '0555123456', 'My Electronics Store',
--    'Alger', 'Bab Ezzouar');
-- -- expect: row inserted, status = 'pending'.
--
-- -- (b) As that same seller, try to submit a second pending request
-- -- before the first is reviewed -- must FAIL the unique index:
-- INSERT INTO public.seller_profile_change_requests (seller_id, requested_phone)
-- VALUES (auth.uid(), '0555999999');
-- -- expect: ERROR -- duplicate key value violates unique constraint
-- -- "seller_profile_change_requests_pending_uq"
--
-- -- (c) As admin, approve the first request:
-- SELECT public.approve_seller_profile_change('<REQUEST_ID>', 'approved');
-- SELECT full_name FROM public.staff_accounts WHERE id = '<SELLER_ID>';
-- -- expect: full_name = 'Ahmed Benali'
-- SELECT boutique_name, wilaya, commune, whatsapp FROM public.seller_profiles
-- WHERE seller_id = '<SELLER_ID>';
-- -- expect: boutique_name = 'My Electronics Store', wilaya = 'Alger',
-- -- commune = 'Bab Ezzouar', whatsapp = '0555123456'
-- SELECT status, reviewed_by, reviewed_at FROM public.seller_profile_change_requests
-- WHERE id = '<REQUEST_ID>';
-- -- expect: status = 'approved'
--
-- -- (d) A separate reject example -- as that same seller, submit a new
-- -- request (now allowed again since the previous one is no longer
-- -- pending), then as admin:
-- SELECT public.reject_seller_profile_change('<NEW_REQUEST_ID>', 'boutique name unclear, please clarify');
-- SELECT status, admin_notes FROM public.seller_profile_change_requests
-- WHERE id = '<NEW_REQUEST_ID>';
-- -- expect: status = 'rejected', admin_notes = 'boutique name unclear, please clarify'
--
-- -- (e) Regression -- a non-admin (including the seller themselves)
-- -- calling either RPC must fail with 'not authorized':
-- SELECT public.approve_seller_profile_change('<REQUEST_ID>', null); -- as seller/agent
-- SELECT public.reject_seller_profile_change('<REQUEST_ID>', null);  -- as seller/agent
-- -- expect: ERROR -- not authorized
--
-- -- Regression -- calling approve/reject twice on the same row must
-- -- fail the second time ("... is not pending ...").
-- ================================================================
