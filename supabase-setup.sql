-- ================================================================
-- Derradj Shop — Supabase Setup (RLS + Constraints)
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (all statements use IF EXISTS / OR REPLACE).
-- ================================================================

-- ── 1. Ensure RLS is enabled ────────────────────────────────────
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ── 2. DROP old policies (safe to run multiple times) ───────────
DROP POLICY IF EXISTS "anon_insert_orders"      ON public.orders;
DROP POLICY IF EXISTS "anon_insert_order_items" ON public.order_items;

-- ── 3. Allow anonymous (public) users to INSERT new orders ──────
--    The checkout page uses the anon key — no SELECT/UPDATE/DELETE.
CREATE POLICY "anon_insert_orders"
  ON public.orders
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ── 4. Allow anonymous users to INSERT order line items ─────────
CREATE POLICY "anon_insert_order_items"
  ON public.order_items
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- ── 5. Fix payment_method CHECK constraint ───────────────────────
--    The original constraint only allowed ('ccp','baridimob').
--    The frontend now sends 'prepaid' (prepay via CCP/BaridiMob)
--    and 'cash_on_delivery' (COD). This widens the constraint to
--    accept all four values so both payment flows work.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('ccp', 'baridimob', 'prepaid', 'cash_on_delivery'));

-- ── Done! Orders should now submit without errors. ──────────────
