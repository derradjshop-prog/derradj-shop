-- ================================================================
-- Derradj Shop — Seller "Add Product": required price field
-- ================================================================
-- The seller "quick add product" form (seller/dashboard.html,
-- submitQuickAddBook()) now collects a price. No new column is
-- needed for this — public.admin_products_catalog.price already
-- exists (INTEGER NOT NULL DEFAULT 0, supabase-products-setup.sql)
-- and is already read everywhere the storefront/admin displays a
-- product's price.
--
-- THE ACTUAL PROBLEM this migration fixes: guard_seller_product_insert()
-- (BEFORE INSERT trigger on admin_products_catalog, most recently
-- defined in 20260905194233_seller_marketplace.sql) has a branch for
-- the legacy seller quick-add flow (the one this exact form goes
-- through — no seller_id in the payload) that unconditionally does
-- `NEW.price := 0;`, discarding whatever price the client sends. That
-- line has been carried forward byte-for-byte since
-- 20260709111413_seller_quick_add_books.sql, from back when this form
-- only ever submitted a title + cover image. Without changing it, a
-- seller-entered price would always be silently zeroed on insert.
--
-- Fix: CREATE OR REPLACE the whole function (the only way to change
-- one branch of a plpgsql function), replacing that single
-- `NEW.price := 0;` line with a NOT NULL/positive check that lets the
-- client-sent price through instead of discarding it. Every other
-- line, in every other branch (admin passthrough, agent, marketplace
-- seller), is reproduced BYTE-FOR-BYTE unchanged from
-- 20260905194233_seller_marketplace.sql — this migration touches
-- nothing else about product submission, review, or category
-- handling.
--
-- Safe to run multiple times (CREATE OR REPLACE FUNCTION).
-- ================================================================

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

  -- Seller MARKETPLACE branch — unchanged from 20260905194233_seller_
  -- marketplace.sql. Real commercial fields (price/stock/description/
  -- etc) are intentionally NOT nulled here, and price was never forced
  -- to 0 on this branch — nothing to fix for it.
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

  -- Seller quick-add-product branch (the plain "no seller_id" flow —
  -- this is the one seller/dashboard.html's "إضافة منتج" form uses).
  -- UNCHANGED from 20260709111413_seller_quick_add_books.sql except
  -- for price: previously `NEW.price := 0;` unconditionally discarded
  -- whatever the client sent; now the client-sent price is kept, but
  -- only after being validated as a positive number — a seller can no
  -- longer submit a product with no price or a price of 0 or less.
  NEW.product_name_ar   := NULL;
  NEW.product_name_fr   := NULL;
  NEW.brand              := NULL;
  NEW.subcategory        := NULL;
  NEW.short_description  := NULL;
  NEW.full_description   := NULL;
  IF NEW.price IS NULL OR NEW.price <= 0 THEN
    RAISE EXCEPTION 'A valid price greater than 0 is required';
  END IF;
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

-- Trigger attachment itself is unchanged (same function name, same
-- BEFORE INSERT timing) — CREATE OR REPLACE FUNCTION above is
-- sufficient, no need to re-run DROP/CREATE TRIGGER.

NOTIFY pgrst, 'reload schema';


-- ================================================================
-- Done — verify with:
--
-- SELECT prosrc FROM pg_proc WHERE proname = 'guard_seller_product_insert';
-- -- confirm the legacy branch no longer contains `NEW.price := 0;`
-- -- and instead has the IF NEW.price IS NULL OR NEW.price <= 0 check.
--
-- -- As a logged-in legacy seller, a submission with no/zero/negative
-- -- price must now FAIL:
-- INSERT INTO public.admin_products_catalog
--   (product_name, main_image, category, product_category, status, is_active)
-- VALUES ('test product', 'https://example.com/x.jpg', 'books', 'other_misc',
--         'pending_review', false);
-- -- expect: ERROR — A valid price greater than 0 is required
--
-- -- A submission with a valid positive price must SUCCEED and the
-- -- price must survive (not be zeroed):
-- INSERT INTO public.admin_products_catalog
--   (product_name, main_image, category, product_category, price, status, is_active)
-- VALUES ('test product 2', 'https://example.com/y.jpg', 'books', 'other_misc', 2500,
--         'pending_review', false);
-- -- expect: row inserted, price = 2500 (not 0).
--
-- -- Regression — admin inserts/updates are still completely unaffected
-- -- (public.is_admin() branch returns NEW untouched, first line of the
-- -- function, unchanged).
--
-- -- Regression — the agent quick-add-electronics flow and the
-- -- marketplace-seller flow are unaffected (neither branch was
-- -- modified; the marketplace-seller branch never zeroed price to
-- -- begin with, so it's unaffected by this migration's fix).
-- ================================================================
