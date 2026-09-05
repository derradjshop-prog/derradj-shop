-- ================================================================
-- Derradj Shop — Seller Marketplace (Stage 1: schema + RLS + RPC)
-- Adds third-party seller applications/profiles and lets an approved
-- marketplace seller list their own products in admin_products_catalog,
-- reusing the existing staff_accounts (role='seller') account system --
-- no second auth system, no client-facing INSERT on staff_accounts.
-- Safe to run multiple times (every statement is idempotent).
-- ================================================================


-- ----------------------------------------------------------------
-- 1. seller_applications -- public registration submissions, pending
--    admin review. Anonymous INSERT only (same idiom as
--    anon_insert_orders/anon_insert_order_items in supabase-setup.sql);
--    no SELECT policy for anon/authenticated-non-admin -- applicants get
--    a client-side "submitted" confirmation, not a status page.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seller_applications (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name            TEXT        NOT NULL,
  email                TEXT        NOT NULL,
  phone                TEXT        NOT NULL,
  boutique_name        TEXT        NOT NULL,
  boutique_description TEXT,
  wilaya               TEXT        NOT NULL,
  commune              TEXT        NOT NULL,
  whatsapp             TEXT        NOT NULL,
  social_link          TEXT,
  product_type         TEXT        NOT NULL,
  notes                TEXT,
  status               TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','approved','rejected')),
  admin_notes          TEXT,
  reviewed_by          UUID        REFERENCES public.staff_accounts(id),
  reviewed_at          TIMESTAMPTZ,
  auth_user_id         UUID        NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_applications_pending_email_uq
  ON public.seller_applications (lower(email)) WHERE status = 'pending';

ALTER TABLE public.seller_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seller_applications_anon_insert" ON public.seller_applications;
CREATE POLICY "seller_applications_anon_insert"
  ON public.seller_applications FOR INSERT TO anon
  WITH CHECK (status = 'pending');

-- If this project's Auth "Confirm email" setting is off, supabase.auth.signUp()
-- returns an active session immediately, so the registration page's very next
-- insert (seller_applications) executes as `authenticated`, not `anon`. Without
-- this policy that insert would have no matching WITH CHECK and every
-- registration would fail. Scoped to the caller's own fresh auth user only.
DROP POLICY IF EXISTS "seller_applications_self_insert" ON public.seller_applications;
CREATE POLICY "seller_applications_self_insert"
  ON public.seller_applications FOR INSERT TO authenticated
  WITH CHECK (status = 'pending' AND auth_user_id = auth.uid());

DROP POLICY IF EXISTS "seller_applications_admin_all" ON public.seller_applications;
CREATE POLICY "seller_applications_admin_all"
  ON public.seller_applications FOR ALL TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());


-- ----------------------------------------------------------------
-- 2. seller_profiles -- one row per approved marketplace seller,
--    keyed to the SAME staff_accounts.id used for auth/login. Written
--    only by approve_seller_application() below (SECURITY DEFINER);
--    no client-facing INSERT policy.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seller_profiles (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id             UUID        NOT NULL UNIQUE REFERENCES public.staff_accounts(id) ON DELETE CASCADE,
  boutique_name         TEXT        NOT NULL,
  boutique_description  TEXT,
  wilaya                TEXT,
  commune               TEXT,
  whatsapp              TEXT,
  social_link           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seller_profiles_self_select" ON public.seller_profiles;
CREATE POLICY "seller_profiles_self_select"
  ON public.seller_profiles FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "seller_profiles_self_update" ON public.seller_profiles;
CREATE POLICY "seller_profiles_self_update"
  ON public.seller_profiles FOR UPDATE TO authenticated
  USING      (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "seller_profiles_admin_all" ON public.seller_profiles;
CREATE POLICY "seller_profiles_admin_all"
  ON public.seller_profiles FOR ALL TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());
-- No anon/public policy on this table directly -- public reads go
-- through public.seller_public_profiles below only.


-- ----------------------------------------------------------------
-- 3. seller_public_profiles -- the ONLY thing storefront pages may read
--    about a seller: seller_id + boutique_name, nothing else.
--
--    seller_profiles has no anon SELECT policy (by design, section 2
--    above), so an anon querying a plain view over it would get zero
--    rows -- Postgres views without security_invoker=true execute
--    their underlying scan AS THE VIEW OWNER (this migration's runner
--    is the postgres role, which owns admin_products_catalog and
--    seller_profiles and, being the Supabase project's superuser-like
--    migration role, already bypasses RLS entirely on tables it
--    owns). That means the DEFAULT view behavior already achieves what
--    we want here with zero extra syntax. The explicit
--    SET (security_invoker = false) below is not strictly required on
--    this Postgres version -- it is added purely as self-documenting,
--    forward-compatible belt-and-suspenders in case a future Postgres
--    or Supabase default ever flips, and is wrapped in a DO block so
--    this migration does not fail outright if that view option syntax
--    is unavailable on the target Postgres version. Do NOT set
--    security_invoker = true here -- that would make the view apply
--    seller_profiles RLS as the actual anon/authenticated caller,
--    which has no matching policy and would silently return 0 rows.
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW public.seller_public_profiles AS
SELECT sp.seller_id, sp.boutique_name
FROM public.seller_profiles sp
JOIN public.staff_accounts sa ON sa.id = sp.seller_id
WHERE sa.is_active = true;

GRANT SELECT ON public.seller_public_profiles TO anon, authenticated;

DO $$
BEGIN
  EXECUTE 'ALTER VIEW public.seller_public_profiles SET (security_invoker = false)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'seller_public_profiles: security_invoker view option unsupported on this Postgres version -- relying on default view-owner execution (already correct, see comment above).';
END $$;


-- ----------------------------------------------------------------
-- 4. admin_products_catalog -- add seller_id, widen status CHECK.
--
--    The current status constraint is an UNNAMED inline column CHECK
--    added by 20260709111413_seller_quick_add_books.sql
--    ("status TEXT DEFAULT 'published' CHECK (status IN
--    ('pending_review','published'))") -- Postgres auto-names an
--    unnamed column CHECK constraint "{table}_{column}_check", so its
--    real name is admin_products_catalog_status_check. Dropped with
--    IF EXISTS as a safety net regardless.
-- ----------------------------------------------------------------
ALTER TABLE public.admin_products_catalog
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.staff_accounts(id);

CREATE INDEX IF NOT EXISTS idx_apc_seller_id ON public.admin_products_catalog (seller_id);

ALTER TABLE public.admin_products_catalog
  DROP CONSTRAINT IF EXISTS admin_products_catalog_status_check;

ALTER TABLE public.admin_products_catalog
  ADD CONSTRAINT admin_products_catalog_status_check
  CHECK (status IN ('draft','pending_review','published','rejected'));


-- ----------------------------------------------------------------
-- 5. RLS -- new marketplace-seller policies on admin_products_catalog.
--    ADDITIVE ONLY -- admin_products_admin_manage,
--    admin_products_seller_insert_pending_book (legacy quick-add-book)
--    and admin_products_agent_insert_pending are all left untouched.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "admin_products_seller_insert_own" ON public.admin_products_catalog;
CREATE POLICY "admin_products_seller_insert_own"
  ON public.admin_products_catalog FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() = 'seller'
    AND category   IN ('electronics','books')
    AND seller_id   = auth.uid()
    AND status     IN ('draft','pending_review')
    AND is_active   = false
  );

DROP POLICY IF EXISTS "admin_products_seller_update_own" ON public.admin_products_catalog;
CREATE POLICY "admin_products_seller_update_own"
  ON public.admin_products_catalog FOR UPDATE TO authenticated
  USING      (seller_id = auth.uid() AND status IN ('draft','pending_review','rejected'))
  WITH CHECK (seller_id = auth.uid());
-- NOTE: this WITH CHECK deliberately does not re-check status (matching
-- the exact clause given in this migration's spec) -- the actual gate
-- against a seller silently setting status='published' via UPDATE is
-- guard_seller_marketplace_product_write() below, not RLS. RLS alone
-- would NOT be enough here.

DROP POLICY IF EXISTS "admin_products_seller_select_own" ON public.admin_products_catalog;
CREATE POLICY "admin_products_seller_select_own"
  ON public.admin_products_catalog FOR SELECT TO authenticated
  USING (seller_id = auth.uid());


-- ----------------------------------------------------------------
-- 6. Guard triggers -- column-level enforcement RLS above cannot
--    provide on its own (WITH CHECK cannot compare NEW to OLD, and
--    cannot stop a client smuggling extra fields into an otherwise-
--    valid row).
--
--    DESIGN NOTE -- avoiding a conflict with the pre-existing
--    guard_seller_product_insert() trigger (from
--    20260709111413_seller_quick_add_books.sql, extended by
--    20260904020000_agent_quick_add_products.sql):
--
--    That trigger already fires BEFORE INSERT for every non-admin,
--    non-agent caller (i.e. any role='seller' caller) UNCONDITIONALLY,
--    and force-nulls price/stock/slug/SEO/etc down to a "title+image
--    only" quick-add-book submission. A marketplace seller is ALSO
--    role='seller' and lists a REAL product with a real price/stock/
--    description -- if a second, independent BEFORE INSERT trigger
--    were attached for the marketplace flow, Postgres would fire BOTH
--    triggers on every seller INSERT (in trigger-name alphabetical
--    order) no matter which RLS policy the row is actually aimed at,
--    and the legacy trigger's unconditional nulling would silently
--    wipe out every marketplace listing's real commercial data -- a
--    correctness bug, not just a style one.
--
--    Fix: for the INSERT case, the marketplace behavior is added as a
--    NEW BRANCH INSIDE guard_seller_product_insert() itself (single
--    trigger, single firing per row), tried BEFORE the legacy nulling
--    branch, so the two can never both apply to the same row. The
--    branch is selected by NEW.seller_id IS NOT NULL -- a genuine
--    marketplace INSERT must supply seller_id (required by
--    admin_products_seller_insert_own's WITH CHECK anyway), while the
--    legacy quick-add-book client never sets that column. CONTRACT:
--    any future seller product-submission UI MUST explicitly send
--    seller_id (its own auth uid) on INSERT, or its row will instead
--    be treated as a legacy quick-add-book submission and have its
--    price/stock/description nulled.
--
--    For UPDATE, there is no pre-existing seller UPDATE trigger/policy
--    on this table at all (the legacy flow only ever supports INSERT),
--    so a brand-new, separate BEFORE UPDATE trigger
--    (guard_seller_marketplace_product_write(), attached further down)
--    is safe -- it cannot double-fire against anything that already
--    exists. Keep its logic in sync with the marketplace INSERT branch
--    below if either ever changes.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_seller_product_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF public.current_staff_role() = 'agent' THEN
    NEW.category          := 'electronics';
    NEW.product_name_ar   := NULL;
    NEW.product_name_fr   := NULL;
    NEW.brand              := NULL;
    NEW.short_description  := NULL;
    NEW.full_description   := NULL;
    NEW.old_price           := NULL;
    NEW.discount_enabled    := false;
    NEW.stock_status        := 'available';
    NEW.quantity             := 0;
    NEW.slug                 := NULL;
    NEW.product_url          := NULL;
    NEW.gallery_images       := '[]'::jsonb;
    NEW.seo_title            := NULL;
    NEW.seo_description      := NULL;
    NEW.keywords              := NULL;
    NEW.display_order         := NULL;

    NEW.status       := 'pending_review';
    NEW.is_active    := false;
    NEW.submitted_by := auth.uid();
    NEW.submitted_at := now();

    RETURN NEW;
  END IF;

  -- Seller MARKETPLACE branch (NEW -- part of the Seller Marketplace
  -- feature). Identified by the client explicitly supplying seller_id;
  -- see the design note above the function for why. Real commercial
  -- fields (price/stock/description/etc) are intentionally NOT nulled
  -- here, unlike the legacy branch below -- that is the entire point
  -- of a marketplace listing. Only ownership/publishing columns are
  -- force-corrected server-side. Keep in sync with
  -- guard_seller_marketplace_product_write() (its UPDATE-side twin).
  IF NEW.seller_id IS NOT NULL AND public.current_staff_role() = 'seller' THEN
    IF NEW.status = 'published' THEN
      RAISE EXCEPTION 'Sellers may not publish a product directly - it must be approved by an admin first';
    END IF;

    NEW.seller_id := auth.uid();
    IF NEW.status IS DISTINCT FROM 'published' THEN
      NEW.is_active := false;
    END IF;

    RETURN NEW;
  END IF;

  -- Seller quick-add-book branch -- UNCHANGED, byte-for-byte identical
  -- to 20260709111413_seller_quick_add_books.sql /
  -- 20260904020000_agent_quick_add_products.sql.
  NEW.product_name_ar   := NULL;
  NEW.product_name_fr   := NULL;
  NEW.brand              := NULL;
  NEW.subcategory        := NULL;
  NEW.short_description  := NULL;
  NEW.full_description   := NULL;
  NEW.price              := 0;
  NEW.old_price          := NULL;
  NEW.discount_enabled   := false;
  NEW.stock_status       := 'available';
  NEW.quantity           := 0;
  NEW.slug               := NULL;
  NEW.product_url        := NULL;
  NEW.gallery_images     := '[]'::jsonb;
  NEW.seo_title          := NULL;
  NEW.seo_description    := NULL;
  NEW.keywords           := NULL;
  NEW.display_order      := NULL;

  NEW.submitted_by := auth.uid();
  NEW.submitted_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_products_guard_seller_insert ON public.admin_products_catalog;
CREATE TRIGGER trg_admin_products_guard_seller_insert
  BEFORE INSERT ON public.admin_products_catalog
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_product_insert();


CREATE OR REPLACE FUNCTION public.guard_seller_marketplace_product_write()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    RAISE EXCEPTION 'Sellers may not reassign a product to another seller';
  END IF;

  IF NEW.status = 'published' THEN
    RAISE EXCEPTION 'Sellers may not publish a product directly - it must be approved by an admin first';
  END IF;

  NEW.seller_id := auth.uid();
  IF NEW.status IS DISTINCT FROM 'published' THEN
    NEW.is_active := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_products_guard_seller_marketplace_update ON public.admin_products_catalog;
CREATE TRIGGER trg_admin_products_guard_seller_marketplace_update
  BEFORE UPDATE ON public.admin_products_catalog
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_marketplace_product_write();


-- ----------------------------------------------------------------
-- 7. RPC -- approve_seller_application(). The ONLY way a
--    seller_applications row ever produces a staff_accounts +
--    seller_profiles pair. SECURITY DEFINER so it can write
--    staff_accounts despite that table having zero client-facing
--    INSERT policy (matching mark_order_delivered() in
--    20260827030100_add_agent_order_workflow_rls_and_functions.sql).
--    The real gate is the is_admin() check on the first line, not RLS.
-- ----------------------------------------------------------------
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
      admin_notes = notes,
      reviewed_by = public.current_staff_id(),
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = app_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_seller_application(UUID, TEXT) TO authenticated;


-- ----------------------------------------------------------------
-- 8. Reload PostgREST's schema cache (new tables/columns/policies).
-- ----------------------------------------------------------------
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- Done -- verify with:
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN
--   ('seller_applications','seller_profiles','admin_products_catalog');
--
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'public.admin_products_catalog'::regclass
--   AND conname = 'admin_products_catalog_status_check';
--
-- -- Regression -- the existing seller quick-add-book flow (no
-- -- seller_id in the payload) must still land nulled out exactly as
-- -- before. As a logged-in legacy seller:
-- INSERT INTO public.admin_products_catalog
--   (product_name, main_image, category, status, is_active)
-- VALUES ('kitab tijribi', 'https://example.com/x.jpg', 'books', 'pending_review', false);
-- -- expect: price=0, quantity=0, slug=NULL, submitted_by=auth.uid() -- unchanged.
--
-- -- New marketplace flow -- as a logged-in marketplace seller:
-- INSERT INTO public.admin_products_catalog
--   (product_name, main_image, category, price, quantity, status, is_active, seller_id)
-- VALUES ('outside seller product', 'https://example.com/y.jpg', 'electronics', 2500, 10,
--         'pending_review', false, auth.uid());
-- -- expect: price=2500, quantity=10 preserved (NOT nulled), seller_id=auth.uid(),
-- -- is_active forced false.
--
-- -- As that same seller, try to self-publish (should FAIL):
-- UPDATE public.admin_products_catalog SET status = 'published'
-- WHERE seller_id = auth.uid() AND product_name = 'outside seller product';
--
-- -- As admin, approve an application:
-- SELECT public.approve_seller_application('<APPLICATION_ID>', 'looks good');
-- SELECT * FROM public.staff_accounts WHERE role = 'seller' ORDER BY created_at DESC LIMIT 1;
-- SELECT * FROM public.seller_profiles ORDER BY created_at DESC LIMIT 1;
--
-- -- Public view -- as anon:
-- SELECT * FROM public.seller_public_profiles LIMIT 5; -- should return rows, not 0
-- ================================================================
