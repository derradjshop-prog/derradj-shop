-- Lets a seller "quick add" a book (Arabic title + image only) into
-- admin_products_catalog as a pending_review row for the admin to complete
-- and publish. Sellers must never be able to set price/stock/category
-- details or publish directly — enforced by RLS (row-level) below plus a
-- guard trigger (column-level), same split used by
-- guard_assignment_columns()/guard_order_items_cost_edit() elsewhere in
-- this repo.
--
-- NOTE ON NAMING: the real product table here is `admin_products_catalog`
-- (there is a separate, unrelated legacy `products` table this repo does
-- not use for the storefront catalog — see supabase-products-setup.sql).
-- Its "Arabic name" field is `product_name` (not `name_ar`), its
-- availability flag is `is_active` (not `is_available`), and its category
-- values are English slugs — books live under category = 'books', not
-- 'كتب'. This migration reuses those exact existing names/values.

-- ── 1. New columns — quick-add submission metadata ────────────────
ALTER TABLE public.admin_products_catalog
  ADD COLUMN IF NOT EXISTS status          TEXT DEFAULT 'published'
                                            CHECK (status IN ('pending_review','published')),
  ADD COLUMN IF NOT EXISTS submitted_by    UUID REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submission_note TEXT;

-- Existing rows default to 'published' — behavior for the current catalog
-- is unchanged.

CREATE INDEX IF NOT EXISTS idx_apc_status ON public.admin_products_catalog (status);

-- Named so it can be targeted by a PostgREST embed, same convention as
-- orders_assigned_to_fkey / order_items_updated_by_fkey elsewhere.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_products_catalog_submitted_by_fkey'
  ) THEN
    ALTER TABLE public.admin_products_catalog
      ADD CONSTRAINT admin_products_catalog_submitted_by_fkey
      FOREIGN KEY (submitted_by) REFERENCES public.staff_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ── 2. RLS — tighten the old blanket "any authenticated user" policy ──
--    Previously "authenticated_manage_admin_products" (FOR ALL, USING
--    auth.role() = 'authenticated') let ANY logged-in staff — including
--    sellers — insert/update/delete ANY product. That has to go before a
--    seller-scoped INSERT policy means anything: RLS policies are OR'd,
--    so leaving the old one in place would let a seller bypass every
--    restriction added below just by using a different query shape.
ALTER TABLE public.admin_products_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_manage_admin_products" ON public.admin_products_catalog;

DROP POLICY IF EXISTS "admin_products_admin_manage" ON public.admin_products_catalog;
CREATE POLICY "admin_products_admin_manage"
  ON public.admin_products_catalog FOR ALL TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());

-- "admin_read_all_products" (SELECT, USING true) from
-- admin/supabase-admin-products-rls-fix.sql is untouched — sellers still
-- need it to read back their own pending_review rows (is_active = false
-- rows are hidden from "public_read_active_admin_products").

-- Seller quick-add: INSERT only a pending, unpublished, books row that
-- names itself as the submitter. No UPDATE/DELETE policy for sellers —
-- once submitted, only the admin (via admin_products_admin_manage above)
-- can change or publish it.
DROP POLICY IF EXISTS "admin_products_seller_insert_pending_book" ON public.admin_products_catalog;
CREATE POLICY "admin_products_seller_insert_pending_book"
  ON public.admin_products_catalog FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() = 'seller'
    AND category      = 'books'
    AND status         = 'pending_review'
    AND is_active       = false
    AND submitted_by   = auth.uid()
  );


-- ── 3. TRIGGER FUNCTION — guard_seller_product_insert()
--    RLS above is row-level only — nothing stops a seller INSERT from
--    also smuggling in a real price/stock/slug/SEO payload on that same
--    row. This BEFORE INSERT trigger closes that gap:
--      • admin → unrestricted, passes through untouched.
--      • seller (the only other role an INSERT policy exists for) →
--        every commercial/publishing field is forced to its neutral
--        default no matter what the client sent, and submitted_by/
--        submitted_at are stamped server-side so they can't be forged
--        to impersonate another seller or backdate a submission.
--        Only product_name (the Arabic title), main_image, category,
--        status, is_active, submission_note, submitted_by/at survive.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_seller_product_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

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

-- ── 4. Reload PostgREST's schema cache (new columns/policies above) ───
NOTIFY pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'admin_products_catalog'
--   AND column_name IN ('status','submitted_by','submitted_at','submission_note');
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'admin_products_catalog';
-- ↑ should show: public_read_active_admin_products (SELECT),
--   admin_read_all_products (SELECT), admin_products_admin_manage (ALL),
--   admin_products_seller_insert_pending_book (INSERT)
