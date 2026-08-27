-- ================================================================
-- Derradj Shop — Seller physical book inventory registry
-- Run in: Supabase Dashboard → SQL Editor → New Query
--
-- Lets a seller register that they physically hold N copies of a book
-- that ALREADY exists in admin_products_catalog (category = 'books').
-- This is a pure seller_id + book_id + quantity relation — no book
-- data is duplicated, and it never touches the public catalog, price,
-- stock, or storefront availability. See seller/dashboard.html
-- ("📚 الكتب التي لدينا") and admin/seller-books.js ("📚 كتب البائعين").
-- ================================================================

-- ── 1. Table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seller_book_inventory (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID        NOT NULL REFERENCES public.staff_accounts(id)        ON DELETE CASCADE,
  book_id     UUID        NOT NULL REFERENCES public.admin_products_catalog(id) ON DELETE CASCADE,
  quantity    INTEGER     NOT NULL CHECK (quantity >= 1),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (seller_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_book_inventory_seller ON public.seller_book_inventory (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_book_inventory_book   ON public.seller_book_inventory (book_id);

-- ── 2. updated_at trigger ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_seller_book_inventory_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_book_inventory_updated_at ON public.seller_book_inventory;
CREATE TRIGGER trg_seller_book_inventory_updated_at
  BEFORE UPDATE ON public.seller_book_inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_seller_book_inventory_updated_at();

-- ── 3. RLS — seller sees/manages only their own rows, admin sees/
--    manages all. Reuses public.is_admin()/current_staff_role()
--    from supabase-assignment-system.sql (same helpers every other
--    RLS policy in this repo is built on). ────────────────────────
ALTER TABLE public.seller_book_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sbi_seller_select" ON public.seller_book_inventory;
CREATE POLICY "sbi_seller_select"
  ON public.seller_book_inventory FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "sbi_admin_select" ON public.seller_book_inventory;
CREATE POLICY "sbi_admin_select"
  ON public.seller_book_inventory FOR SELECT TO authenticated
  USING (public.is_admin());

-- INSERT: only a seller, only into their own seller_id, and only for a
-- book that is an existing, active, published book row — closes the
-- gap where a seller could otherwise register inventory against a
-- pending_review/inactive/non-book product id.
DROP POLICY IF EXISTS "sbi_seller_insert" ON public.seller_book_inventory;
CREATE POLICY "sbi_seller_insert"
  ON public.seller_book_inventory FOR INSERT TO authenticated
  WITH CHECK (
    public.current_staff_role() = 'seller'
    AND seller_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.admin_products_catalog b
      WHERE b.id = book_id AND b.category = 'books' AND b.is_active = TRUE
    )
  );

-- UPDATE: a seller may only ever touch their own row, and the result
-- must still be their own row (can't reassign it to another seller).
DROP POLICY IF EXISTS "sbi_seller_update" ON public.seller_book_inventory;
CREATE POLICY "sbi_seller_update"
  ON public.seller_book_inventory FOR UPDATE TO authenticated
  USING      (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "sbi_seller_delete" ON public.seller_book_inventory;
CREATE POLICY "sbi_seller_delete"
  ON public.seller_book_inventory FOR DELETE TO authenticated
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "sbi_admin_manage" ON public.seller_book_inventory;
CREATE POLICY "sbi_admin_manage"
  ON public.seller_book_inventory FOR ALL TO authenticated
  USING      (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── 4. Reload PostgREST's schema cache (new table/policies above) ──
NOTIFY pgrst, 'reload schema';

-- ── Verify ──────────────────────────────────────────────────────
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'seller_book_inventory';
--
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'public.seller_book_inventory'::regclass AND contype = 'f';
-- ↑ expect seller_book_inventory_seller_id_fkey, seller_book_inventory_book_id_fkey
--   (used by the PostgREST embeds in seller/dashboard.html + admin/seller-books.js)
