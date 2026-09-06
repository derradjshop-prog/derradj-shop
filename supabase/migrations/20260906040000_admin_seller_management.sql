-- ================================================================
-- Derradj Shop -- Admin: full seller-account management
-- ================================================================
-- Extends the existing Seller Marketplace / seller-account system so
-- the MAIN admin (public.is_main_admin() -- 0555491316@derradjshop.com
-- only, exactly like staff_accounts_main_admin_update in
-- admin/add-seller-show-amount-owed-setting.sql) can, for ANY seller
-- account (pending-approved marketplace seller OR a legacy seller who
-- predates the marketplace flow -- not just pending applications):
--   1. View + directly edit full_name / phone / boutique fields.
--   2. Deactivate / reactivate the account (reuses the existing
--      staff_accounts.is_active column + staff_accounts_main_admin_update
--      UPDATE policy -- no new RPC needed for this part, see note below).
--   3. Permanently delete the account, but ONLY when it truly has zero
--      footprint elsewhere (no products, no order/message assignment
--      history, no commission history) -- see admin_delete_seller()
--      below for the exact list of tables checked and why a real
--      DELETE is refused otherwise.
--   4. Send the seller a direct message, surfaced in their existing
--      messages tab (seller/dashboard.html) via the new
--      seller_admin_messages table below.
--
-- Every one of these is gated the SAME way as the pre-existing
-- staff_accounts_main_admin_update / blocked_customers_main_admin_update
-- precedent: public.is_main_admin() only -- never the broader
-- public.is_admin() (any role='admin' row). The admin UI (admin.js) is
-- convenience only; every privileged write below is independently
-- enforced by RLS/RPC at the database layer.
--
-- Safe to run multiple times (every statement is idempotent).
-- ================================================================


-- ----------------------------------------------------------------
-- 1. RPC -- admin_update_seller_profile()
--
--    Writes staff_accounts.full_name and upserts seller_profiles
--    immediately for ANY seller (mirrors the ON CONFLICT (seller_id)
--    DO UPDATE upsert already used by approve_seller_profile_change(),
--    20260906020000_seller_profile_change_requests.sql) -- unlike that
--    request-then-approve workflow, this is an immediate admin-initiated
--    write with no pending row created. Does NOT touch email, role, or
--    is_active -- those are out of scope for this RPC by design (email
--    is read-only in the admin UI; is_active has its own dedicated
--    toggle below; role is never editable from this surface).
--
--    Guards against being pointed at a non-seller account (e.g. an
--    admin or agent id passed in by mistake) -- this RPC may only
--    ever write a role='seller' row.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_seller_profile(
  seller_id_in             UUID,
  full_name_in             TEXT,
  phone_in                 TEXT,
  boutique_name_in         TEXT,
  boutique_description_in  TEXT,
  wilaya_in                TEXT,
  commune_in               TEXT,
  social_link_in           TEXT
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF public.is_main_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT role INTO v_role FROM public.staff_accounts WHERE id = seller_id_in FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller % not found', seller_id_in;
  END IF;

  IF v_role <> 'seller' THEN
    RAISE EXCEPTION 'Target account % is not a seller account', seller_id_in;
  END IF;

  UPDATE public.staff_accounts
  SET full_name = full_name_in
  WHERE id = seller_id_in;

  INSERT INTO public.seller_profiles
    (seller_id, boutique_name, boutique_description, wilaya, commune, whatsapp, social_link)
  VALUES
    (seller_id_in, boutique_name_in, boutique_description_in, wilaya_in, commune_in, phone_in, social_link_in)
  ON CONFLICT (seller_id) DO UPDATE SET
    boutique_name         = EXCLUDED.boutique_name,
    boutique_description  = EXCLUDED.boutique_description,
    wilaya                = EXCLUDED.wilaya,
    commune               = EXCLUDED.commune,
    whatsapp              = EXCLUDED.whatsapp,
    social_link           = EXCLUDED.social_link,
    updated_at            = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_seller_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ----------------------------------------------------------------
-- 2. Deactivate / reactivate -- NO new RPC.
--
--    staff_accounts_main_admin_update (USING/WITH CHECK
--    public.is_main_admin(), from add-seller-show-amount-owed-setting.sql)
--    already permits the main admin client to run
--    .from("staff_accounts").update({ is_active: BOOL }).eq("id", id)
--    directly -- exactly the same policy already relied on for the
--    show_amount_owed toggle in admin.js (handleToggleShowOwed()). No
--    redundant RPC is added here; admin.js new
--    handleToggleSellerActive() just reuses that existing policy the
--    same way.
-- ----------------------------------------------------------------


-- ----------------------------------------------------------------
-- 3. RPC -- admin_delete_seller()
--
--    A genuine hard DELETE FROM staff_accounts, but ONLY when the
--    account has zero footprint in every table below -- otherwise it
--    raises a clear exception telling the admin to deactivate instead.
--    This is deliberately conservative: several of the FKs involved are
--    ON DELETE SET NULL or ON DELETE CASCADE, which means a raw DELETE
--    would technically succeed without ever hitting a constraint error
--    -- but would SILENTLY erase who fulfilled/assigned an order, who
--    owns an inventory row, or commission-earning history, which is
--    exactly the silent-data-loss outcome this project owner asked to
--    avoid. admin_products_catalog.seller_id has no ON DELETE clause
--    (defaults to RESTRICT) so a raw DELETE against a seller with
--    products would already fail with a raw FK violation; every other
--    table below is checked explicitly so the admin gets one clear,
--    friendly error instead of a raw constraint error.
--
--    Tables checked (all seller_id/agent_id/assigned_to/assigned_by/
--    submitted_by/performed_by/created_by/approved_by columns that
--    reference staff_accounts(id) and could plausibly hold this row id):
--      - admin_products_catalog (seller_id)          -- RESTRICT anyway
--      - admin_products_catalog (submitted_by)        -- SET NULL (legacy
--        quick-add-book submissions, 20260709111413_seller_quick_add_books.sql --
--        a seller with ONLY a quick-added book and no seller_id-owned
--        listing would otherwise slip past the seller_id check above and
--        get silently orphaned via ON DELETE SET NULL)
--      - seller_book_inventory  (seller_id)           -- CASCADE
--      - orders   (assigned_to, assigned_by, assigned_agent_id) -- SET NULL
--      - messages (assigned_to, assigned_by)          -- SET NULL
--      - assignment_history (from_staff_id, to_staff_id, performed_by) -- SET NULL
--      - agent_earnings (agent_id)                    -- CASCADE
--      - agent_digital_sales (agent_id, created_by, approved_by) -- CASCADE / RESTRICT
--    NOT checked (accepted as safe, low-information-loss cascade):
--      - seller_profiles (CASCADE)                    -- this IS the
--        profile being deleted along with the account; expected.
--      - seller_profile_change_requests (CASCADE)     -- historical
--        profile-edit requests, not business/financial records.
--      - seller_admin_messages (CASCADE, see section 4 below)  --
--        this account own inbox; deleted along with the account.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_seller(seller_id_in UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF public.is_main_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT role INTO v_role FROM public.staff_accounts WHERE id = seller_id_in FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller % not found', seller_id_in;
  END IF;

  IF v_role <> 'seller' THEN
    RAISE EXCEPTION 'Target account % is not a seller account', seller_id_in;
  END IF;

  IF EXISTS (SELECT 1 FROM public.admin_products_catalog WHERE seller_id = seller_id_in)
     OR EXISTS (SELECT 1 FROM public.admin_products_catalog WHERE submitted_by = seller_id_in)
     OR EXISTS (SELECT 1 FROM public.seller_book_inventory WHERE seller_id = seller_id_in)
     OR EXISTS (SELECT 1 FROM public.orders
                WHERE assigned_to = seller_id_in OR assigned_by = seller_id_in OR assigned_agent_id = seller_id_in)
     OR EXISTS (SELECT 1 FROM public.messages
                WHERE assigned_to = seller_id_in OR assigned_by = seller_id_in)
     OR EXISTS (SELECT 1 FROM public.assignment_history
                WHERE from_staff_id = seller_id_in OR to_staff_id = seller_id_in OR performed_by = seller_id_in)
     OR EXISTS (SELECT 1 FROM public.agent_earnings WHERE agent_id = seller_id_in)
     OR EXISTS (SELECT 1 FROM public.agent_digital_sales
                WHERE agent_id = seller_id_in OR created_by = seller_id_in OR approved_by = seller_id_in)
  THEN
    RAISE EXCEPTION 'Seller % has existing products/orders/history and cannot be permanently deleted - deactivate the account instead', seller_id_in;
  END IF;

  DELETE FROM public.staff_accounts WHERE id = seller_id_in;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_seller(UUID) TO authenticated;


-- ----------------------------------------------------------------
-- 4. seller_admin_messages -- minimal admin-to-seller direct message
--    inbox. A DIFFERENT table from messages (customer contact-form
--    submissions assigned to staff) -- this is a note the MAIN ADMIN
--    sends directly to one seller, surfaced inside that seller
--    existing messages tab in seller/dashboard.html as a clearly
--    labeled sub-section, not a new page/tab.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seller_admin_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID        NOT NULL REFERENCES public.staff_accounts(id) ON DELETE CASCADE,
  sender_id   UUID        NOT NULL REFERENCES public.staff_accounts(id),
  message     TEXT        NOT NULL,
  is_read     BOOLEAN     NOT NULL DEFAULT false,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_admin_messages_seller_id
  ON public.seller_admin_messages (seller_id);

ALTER TABLE public.seller_admin_messages ENABLE ROW LEVEL SECURITY;

-- Seller: read + mark-as-read only on their own rows.
DROP POLICY IF EXISTS "seller_admin_messages_self_select" ON public.seller_admin_messages;
CREATE POLICY "seller_admin_messages_self_select"
  ON public.seller_admin_messages FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "seller_admin_messages_self_update" ON public.seller_admin_messages;
CREATE POLICY "seller_admin_messages_self_update"
  ON public.seller_admin_messages FOR UPDATE TO authenticated
  USING      (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());
-- Column-level restriction (a seller may only flip is_read/read_at, never
-- rewrite message/sender_id/seller_id/created_at) is enforced by the
-- trigger below, not by RLS alone -- same idiom as
-- guard_assignment_columns() in supabase-assignment-system.sql.

-- Main admin: full control, and may only ever insert as themselves.
DROP POLICY IF EXISTS "seller_admin_messages_main_admin_all" ON public.seller_admin_messages;
CREATE POLICY "seller_admin_messages_main_admin_all"
  ON public.seller_admin_messages FOR ALL TO authenticated
  USING      (public.is_main_admin())
  WITH CHECK (public.is_main_admin() AND sender_id = auth.uid());
-- No anon access whatsoever.

CREATE OR REPLACE FUNCTION public.guard_seller_admin_message_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_main_admin() THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'is_read' - 'read_at') IS DISTINCT FROM (to_jsonb(OLD) - 'is_read' - 'read_at') THEN
    RAISE EXCEPTION 'Sellers may only update is_read/read_at on their own messages';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_admin_messages_guard_update ON public.seller_admin_messages;
CREATE TRIGGER trg_seller_admin_messages_guard_update
  BEFORE UPDATE ON public.seller_admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_admin_message_update();

-- Realtime -- so seller/dashboard.html live badge can subscribe the
-- same way it already does for orders/messages (supabase-assignment-system.sql).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.seller_admin_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ----------------------------------------------------------------
-- 5. Reload PostgREST schema cache (new table/columns/policies/RPCs).
-- ----------------------------------------------------------------
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- Done -- verify with:
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'seller_admin_messages';
--
-- -- As main admin, edit any seller profile immediately (no pending row):
-- SELECT public.admin_update_seller_profile(
--   '<SELLER_ID>', 'New Name', '0555000000', 'New Store', 'desc',
--   'Alger', 'Bab Ezzouar', 'https://instagram.com/x');
-- SELECT full_name FROM public.staff_accounts WHERE id = '<SELLER_ID>';
-- SELECT * FROM public.seller_profiles WHERE seller_id = '<SELLER_ID>';
--
-- -- As main admin, deactivate a seller (existing policy, no new RPC):
-- UPDATE public.staff_accounts SET is_active = false WHERE id = '<SELLER_ID>';
--
-- -- As main admin, try to hard-delete a seller WITH products -- must FAIL:
-- SELECT public.admin_delete_seller('<SELLER_ID_WITH_PRODUCTS>');
-- -- expect: ERROR -- has existing products/orders/history ...
--
-- -- As main admin, hard-delete a seller with NO products/orders/history --
-- -- must succeed:
-- SELECT public.admin_delete_seller('<CLEAN_SELLER_ID>');
-- SELECT * FROM public.staff_accounts WHERE id = '<CLEAN_SELLER_ID>'; -- 0 rows
--
-- -- As main admin, send a seller a message:
-- INSERT INTO public.seller_admin_messages (seller_id, sender_id, message)
-- VALUES ('<SELLER_ID>', auth.uid(), 'Please update your store description.');
--
-- -- As that seller, read own inbox:
-- SELECT * FROM public.seller_admin_messages WHERE seller_id = auth.uid();
--
-- -- As that seller, mark one read (must succeed):
-- UPDATE public.seller_admin_messages SET is_read = true, read_at = now()
-- WHERE id = '<MSG_ID>' AND seller_id = auth.uid();
--
-- -- As that seller, try to edit the message text itself (must FAIL):
-- UPDATE public.seller_admin_messages SET message = 'tampered' WHERE id = '<MSG_ID>';
-- -- expect: ERROR -- Sellers may only update is_read/read_at ...
--
-- -- Regression -- a non-main-admin (including a plain role='admin'
-- -- account, or the seller themselves) calling either RPC must fail:
-- SELECT public.admin_update_seller_profile('<ID>', null,null,null,null,null,null,null);
-- SELECT public.admin_delete_seller('<ID>');
-- -- expect: ERROR -- not authorized
-- ================================================================
