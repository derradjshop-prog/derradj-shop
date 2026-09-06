-- ================================================================
-- Derradj Shop — Seller "Add Product": user-facing product_category
-- ================================================================
-- Generalizes the seller dashboard's "quick add book" flow into a
-- generic "add product" flow. A seller still submits only
-- product_name + main_image (+ optional note) into
-- admin_products_catalog as a pending_review row for the admin to
-- complete and publish later — that mechanism, and the
-- admin_products_seller_insert_pending_book policy that gates it
-- (20260709111413_seller_quick_add_books.sql), are unchanged.
--
-- NEW: sellers must now also pick a broad, user-facing marketplace
-- category ("الفئة") from a fixed list of 10 options in the UI.
--
-- IMPORTANT — this is intentionally a BRAND NEW column, product_category,
-- fully decoupled from the pre-existing `category` column. `category` is
-- an internal discriminator that controls which storefront template a
-- product renders with (see admin/products-manager.js's isElec()/isSub()
-- helpers, which branch on category !== 'books' / === 'subscriptions').
-- The legacy quick-add-book flow keeps sending category = 'books'
-- untouched by this migration — product_category is an additional,
-- independent, user-facing marketplace-taxonomy field layered on top,
-- not a repurposing or rename of `category`. Mixing the two would have
-- silently broken storefront template selection.
--
-- Safe to run multiple times (every statement is idempotent).
-- ================================================================


-- ----------------------------------------------------------------
-- 1. New column — nullable, so existing rows (which predate this
--    field and have no value for it) are not broken.
-- ----------------------------------------------------------------
ALTER TABLE public.admin_products_catalog
  ADD COLUMN IF NOT EXISTS product_category TEXT;


-- ----------------------------------------------------------------
-- 2. CHECK constraint — restrict to NULL or exactly one of the 10
--    fixed marketplace-category slugs. Named so it can be dropped/
--    reapplied safely, same convention as
--    admin_products_catalog_status_check
--    (20260905194233_seller_marketplace.sql).
-- ----------------------------------------------------------------
ALTER TABLE public.admin_products_catalog
  DROP CONSTRAINT IF EXISTS admin_products_catalog_product_category_check;

ALTER TABLE public.admin_products_catalog
  ADD CONSTRAINT admin_products_catalog_product_category_check
  CHECK (
    product_category IS NULL
    OR product_category IN (
      'phones_tablets',
      'electronics_computing',
      'games_entertainment',
      'clothing_shoes_accessories',
      'home_kitchen_furniture',
      'beauty_personal_care',
      'automotive_motorcycle_accessories',
      'sports_fitness',
      'books_education_digital',
      'other_misc'
    )
  );


-- ----------------------------------------------------------------
-- 3. RLS — admin_products_seller_insert_pending_book (the legacy
--    quick-add flow, now generalized to "add product" in the UI):
--    keep every existing WITH CHECK condition verbatim, including
--    category = 'books' (untouched — see header note above), and
--    additionally require the new product_category to be present
--    and one of the 10 fixed slugs. This makes the new "الفئة" field
--    mandatory for every seller submission through this flow.
--
--    admin_products_seller_insert_own (20260905194233_seller_marketplace.sql,
--    the separate seller_id-based marketplace-listing feature) is a
--    different policy entirely and is NOT touched by this migration.
-- ----------------------------------------------------------------
DROP POLICY IF EXISTS "admin_products_seller_insert_pending_book" ON public.admin_products_catalog;
CREATE POLICY "admin_products_seller_insert_pending_book"
  ON public.admin_products_catalog FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() = 'seller'
    AND category      = 'books'
    AND status         = 'pending_review'
    AND is_active       = false
    AND submitted_by   = auth.uid()
    AND product_category IS NOT NULL
    AND product_category IN (
      'phones_tablets',
      'electronics_computing',
      'games_entertainment',
      'clothing_shoes_accessories',
      'home_kitchen_furniture',
      'beauty_personal_care',
      'automotive_motorcycle_accessories',
      'sports_fitness',
      'books_education_digital',
      'other_misc'
    )
  );


-- ----------------------------------------------------------------
-- 4. Reload PostgREST's schema cache (new column/constraint/policy).
-- ----------------------------------------------------------------
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- Done — verify with:
--
-- SELECT column_name, is_nullable, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'admin_products_catalog'
--   AND column_name = 'product_category';
--
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'public.admin_products_catalog'::regclass
--   AND conname = 'admin_products_catalog_product_category_check';
--
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'admin_products_catalog'
--   AND policyname = 'admin_products_seller_insert_pending_book';
--
-- -- Regression — existing rows with no product_category must still
-- -- be readable/updatable (column is nullable, no NOT NULL added):
-- SELECT id, product_name, product_category FROM public.admin_products_catalog
-- ORDER BY created_at DESC LIMIT 5;
--
-- -- As a logged-in seller, missing product_category must now FAIL:
-- INSERT INTO public.admin_products_catalog
--   (product_name, main_image, category, status, is_active)
-- VALUES ('kitab tijribi', 'https://example.com/x.jpg', 'books', 'pending_review', false);
-- -- expect: ERROR — new row violates row-level security policy
-- -- (product_category IS NULL fails the WITH CHECK above)
--
-- -- As that same seller, a valid submission with product_category set
-- -- must SUCCEED:
-- INSERT INTO public.admin_products_catalog
--   (product_name, main_image, category, status, is_active, product_category)
-- VALUES ('kitab tijribi 2', 'https://example.com/y.jpg', 'books', 'pending_review', false,
--         'books_education_digital');
-- -- expect: row inserted, product_category = 'books_education_digital'.
--
-- -- An invalid slug must FAIL the CHECK constraint regardless of role:
-- INSERT INTO public.admin_products_catalog
--   (product_name, main_image, category, status, is_active, product_category, submitted_by)
-- VALUES ('bad slug test', 'https://example.com/z.jpg', 'books', 'pending_review', false,
--         'not_a_real_slug', auth.uid());
-- -- expect: ERROR — violates check constraint
-- -- "admin_products_catalog_product_category_check"
-- ================================================================
