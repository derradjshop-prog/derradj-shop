-- ================================================================
-- Derradj Shop — Agent "quick add" product submission
-- الوكيلة تقترح منتج جديد (فئة/اسم/صورة/سعر) بانتظار موافقة الأدمن
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
-- Safe to run multiple times (every statement is idempotent).
--
-- Mirrors the existing seller "quick add" pattern EXACTLY (see
-- 20260709111413_seller_quick_add_books.sql): a role-scoped RLS INSERT
-- policy (row-level) plus a BEFORE INSERT trigger (column-level) that
-- forces every commercial/publishing column to a safe default no
-- matter what the client sends, and stamps submitted_by/submitted_at
-- server-side. Business decision (explicitly confirmed after the
-- security tradeoff was flagged): agent-submitted products must NOT
-- go live immediately — they follow the same submit-for-review path
-- already built for sellers, landing as status='pending_review',
-- is_active=false, for an admin to complete and publish.
--
-- UNLIKE the seller policy, this one does NOT restrict category —
-- an agent submission is always forced server-side to
-- category = 'electronics' (see trigger below), and the agent's
-- freely-chosen category/subcategory tag (e.g. "تجميل"، "ملابس") is
-- stored in the existing `subcategory` TEXT column. Per product
-- decision, these are subcategory TAGS inside the single existing
-- catalog, not new top-level shop sections — admin_products_catalog
-- stays a single table with one 'electronics'/'books'/'subscriptions'
-- category axis; this migration does not revisit or change that.
--
-- NO CHANGE NEEDED — confirmed by reading, not assumed — for either
-- of the two dependencies this feature relies on:
--   1. categories table (admin/setup-categories.sql) — RLS policy
--      "authenticated_manage_categories" is already
--      FOR ALL USING/WITH CHECK (auth.role() = 'authenticated'), i.e.
--      ANY authenticated staff account (admin/seller/agent alike) can
--      already insert a new category row there. An agent creating a
--      brand-new subcategory tag needs no RLS change on `categories`.
--   2. admin-product-images Storage bucket (supabase-products-setup.sql)
--      — its INSERT/UPDATE/DELETE storage.objects policies
--      ("auth_upload_admin_product_images" etc.) key off
--      auth.role() = 'authenticated' broadly, not a specific
--      staff_accounts.role value. This is the exact same bucket
--      seller/dashboard.html's own upload flow already uses. An
--      'agent' account can therefore already upload product images to
--      this bucket today with no storage policy change required.
--
-- Depends on: public.is_admin(), public.current_staff_role() from
-- supabase-assignment-system.sql, and the trigger function
-- guard_seller_product_insert() first created in
-- 20260709111413_seller_quick_add_books.sql (this file CREATE OR
-- REPLACEs it, adding an agent branch — the admin branch and the
-- seller branch are both left completely untouched).
-- ================================================================


-- === 1. RLS - agent-scoped INSERT policy, no category restriction ==
--    (unlike admin_products_seller_insert_pending_book, which pins
--    category = 'books' — agent submissions can be any category tag,
--    the real category value is forced server-side by the trigger
--    below regardless of what this WITH CHECK or the client allows).
DROP POLICY IF EXISTS "admin_products_agent_insert_pending" ON public.admin_products_catalog;
CREATE POLICY "admin_products_agent_insert_pending"
  ON public.admin_products_catalog FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() = 'agent'
    AND status      = 'pending_review'
    AND is_active   = false
    AND submitted_by = auth.uid()
  );


-- === 2. TRIGGER FUNCTION - guard_seller_product_insert(), extended
--    with an agent branch. RLS above is row-level only - nothing
--    stops an agent INSERT from also smuggling in a real slug/SEO/
--    publishing payload, or a category outside 'electronics', on
--    that same row. This closes that gap:
--      - admin  -> unrestricted, passes through untouched (unchanged).
--      - seller -> UNCHANGED, byte-for-byte identical to the original
--        20260709111413_seller_quick_add_books.sql behavior.
--      - agent (new) -> category is FORCED to 'electronics' server-
--        side regardless of what the client sends - this is the
--        actual security boundary enforcing the "tag under the
--        existing catalog, not a new shop section" decision; the
--        client/UI is never trusted for this value. product_name,
--        main_image, subcategory (the agent's chosen category tag),
--        and price pass through as sent. Every other commercial/
--        publishing column is nulled or forced to a neutral default,
--        and submitted_by/submitted_at are stamped server-side so
--        they can't be forged to impersonate another agent or
--        backdate a submission.
-- ------------------------------------------------------------------
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

  -- Seller branch - UNCHANGED from 20260709111413_seller_quick_add_books.sql.
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

-- Trigger itself is unchanged - it already fires BEFORE INSERT for
-- every role and calls this same function; only the function body
-- above changed.
DROP TRIGGER IF EXISTS trg_admin_products_guard_seller_insert ON public.admin_products_catalog;
CREATE TRIGGER trg_admin_products_guard_seller_insert
  BEFORE INSERT ON public.admin_products_catalog
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_product_insert();


-- === 3. Reload PostgREST's schema cache (new policy above). =======
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- Verify --------------------------------------------------------
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'admin_products_catalog';
-- -- should now also show: admin_products_agent_insert_pending (INSERT)
--    alongside admin_products_seller_insert_pending_book (INSERT),
--    admin_products_admin_manage (ALL), and the existing SELECT policies.
--
-- SELECT prosrc FROM pg_proc WHERE proname = 'guard_seller_product_insert';
-- -- eyeball that the agent branch and the untouched seller branch are
--    both present.
--
-- -- As a logged-in agent (auth.uid() must map to an active
-- -- staff_accounts row with role = 'agent'):
-- INSERT INTO public.admin_products_catalog
--   (product_name, main_image, subcategory, price, category, status, is_active, submitted_by)
-- VALUES
--   ('Test Agent Product', 'https://example.com/x.jpg', 'تجميل', 1500,
--    'clothing', 'pending_review', false, auth.uid());
-- -- Expect: row inserted with category forced to 'electronics'
-- -- (NOT 'clothing'), subcategory = 'تجميل', price = 1500,
-- -- stock_status = 'available', quantity = 0, is_active = false,
-- -- status = 'pending_review', submitted_by/submitted_at stamped,
-- -- and every nulled column (product_name_ar, brand, slug, seo_*,
-- -- gallery_images = '[]', etc.) confirmed empty.
--
-- SELECT category, subcategory, price, status, is_active, submitted_by, submitted_at
-- FROM public.admin_products_catalog
-- WHERE product_name = 'Test Agent Product'
-- ORDER BY created_at DESC LIMIT 1;
-- ================================================================
