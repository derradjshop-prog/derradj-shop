-- ================================================================
-- FIX — approve_seller_application(): "column reference notes is
-- ambiguous".
--
-- Root cause: public.seller_applications has its own "notes" column
-- (the applicant's free-text field, e.g. "أبيع مكونات أردوينو...",
-- distinct from admin_notes). The RPC's second parameter is ALSO
-- named "notes". Inside the closing UPDATE statement:
--
--   UPDATE public.seller_applications
--   SET admin_notes = notes, ...
--
-- both the table's own "notes" column and the function parameter
-- "notes" are in scope for that SET expression, so Postgres cannot
-- tell which one is meant and raises "column reference notes is
-- ambiguous" at call time. This slipped past static review because
-- nobody had cross-checked the parameter name against the actual
-- column list of the table being written to in that specific
-- statement.
--
-- Fix: qualify the parameter with the function's own name
-- (approve_seller_application.notes) -- Postgres's standard way to
-- disambiguate a PL/pgSQL parameter from a same-named column without
-- renaming the parameter. This keeps the RPC's external signature
-- byte-identical (app_id, notes) -- admin.js's existing
-- supabase.rpc("approve_seller_application", { app_id, notes }) call
-- needs no change, and PostgREST resolves it by the same name+shape
-- as before.
--
-- ADDITIVE / MINIMAL -- everything else in the function body is
-- copied byte-for-byte from 20260905194233_seller_marketplace.sql:
-- same admin-only guard, same FOR UPDATE row lock + pending check
-- (atomic, prevents double approval), same staff_accounts insert
-- (role='seller', is_active=true) and seller_profiles insert, same
-- reviewed_by/reviewed_at stamping. The separate, already-flagged
-- is_admin() NULL-vs-false fix (20260905201500_fix_is_admin_null_bypass.sql)
-- is NOT duplicated here -- that migration fixes is_admin() itself,
-- which this function already calls, so applying both migrations
-- together covers this function without touching its guard line
-- twice. RLS on seller_applications/staff_accounts/seller_profiles is
-- untouched -- this migration only replaces the one function body.
-- ================================================================

CREATE OR REPLACE FUNCTION public.approve_seller_application(app_id UUID, notes TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_app public.seller_applications%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
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

  INSERT INTO public.staff_accounts (id, email, full_name, role, is_active)
  VALUES (v_app.auth_user_id, v_app.email, v_app.full_name, 'seller', true);

  INSERT INTO public.seller_profiles
    (seller_id, boutique_name, boutique_description, wilaya, commune, whatsapp, social_link)
  VALUES
    (v_app.auth_user_id, v_app.boutique_name, v_app.boutique_description,
     v_app.wilaya, v_app.commune, v_app.whatsapp, v_app.social_link);

  UPDATE public.seller_applications
  SET status      = 'approved',
      admin_notes = approve_seller_application.notes,
      reviewed_by = public.current_staff_id(),
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = app_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_seller_application(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ================================================================
-- Done -- verify with:
--
-- SELECT public.approve_seller_application('<a pending application id>', 'looks good');
-- -- expect: no error, application now status='approved', admin_notes='looks good'
--
-- SELECT status, admin_notes, reviewed_by, reviewed_at FROM public.seller_applications
-- WHERE id = '<that same id>';
--
-- -- Regression: calling it again on the same (now-approved) row must
-- -- still fail with "is not pending", not the ambiguity error:
-- SELECT public.approve_seller_application('<that same id>', null);
-- ================================================================
