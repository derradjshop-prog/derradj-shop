-- ================================================================
-- admin/add-blocked-customers-system.sql — Derradj Shop
--
-- Customer blocking, enforced at the database layer.
--
-- ARCHITECTURE REALITY CHECK (read before relying on this) ────────
-- This site has NO customer accounts and NO sign-up flow of any
-- kind. Checkout (ordre/app.js) is fully anonymous/guest — it
-- inserts directly into `orders` using the public anon key, under
-- the "anon_insert_orders" RLS policy (supabase-setup.sql), which is
-- WITH CHECK (true) — no identity check of any kind exists today.
-- There is also no IP-address capture anywhere in the pipeline
-- (browser JS cannot see the real client IP, and no server-side
-- function/trigger reads it), and no device fingerprint mechanism.
-- So the only identifier that persists across a blocked person's
-- orders is the phone number they type at checkout — that's what
-- this migration blocks on. It does NOT and CANNOT block "sign-up,"
-- "accounts," "IP," or "device," because none of those exist in this
-- codebase. If real IP/device blocking is wanted later, it requires
-- new infrastructure (e.g. a checkout-time Edge Function) — out of
-- scope here by explicit decision.
--
-- WHAT THIS ADDS ───────────────────────────────────────────────────
-- 1. blocked_customers — one row per block (kept on unblock, just
--    flagged inactive, so history is never lost).
-- 2. public.normalize_phone() — strips everything but digits, so
--    "0555 49 13 16" / "0555-49-13-16" / "0555491316" all match.
--    (Checkout already stores phone as digits-only via
--    onlyDigits10() in ordre/app.js — this is mainly defensive.)
-- 3. public.is_phone_blocked(text) — SECURITY DEFINER helper.
-- 4. Trigger on orders: BEFORE INSERT, rejects the row if its phone
--    matches an active block. This runs inside Postgres itself, so
--    it cannot be bypassed by DevTools, editing client JS, clearing
--    localStorage, switching browsers, or calling the API directly —
--    the row is never written, full stop.
-- 5. RLS on blocked_customers:
--      SELECT — any active staff (admin or seller).
--      INSERT — admin can block any phone; a seller may only block a
--        phone that appears on one of their own assigned orders
--        (mirrors orders_seller_select_assigned's scoping).
--      UPDATE (used only to unblock) — main admin only, via the
--        existing public.is_main_admin() from
--        add-seller-show-amount-owed-setting.sql.
--      No DELETE policy — a block is deactivated, never removed, so
--        history survives.
--
-- Safe to run multiple times.
-- HOW TO RUN:
--   https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
-- ================================================================

-- ── 1. Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blocked_customers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        TEXT NOT NULL,
  reason       TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  blocked_by   UUID REFERENCES public.staff_accounts(id),
  blocked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  unblocked_by UUID REFERENCES public.staff_accounts(id),
  unblocked_at TIMESTAMPTZ
);

-- ── 2. Phone normalization ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.normalize_blocked_customer_phone()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.phone := public.normalize_phone(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_blocked_customer_phone ON public.blocked_customers;
CREATE TRIGGER trg_normalize_blocked_customer_phone
  BEFORE INSERT OR UPDATE ON public.blocked_customers
  FOR EACH ROW EXECUTE FUNCTION public.normalize_blocked_customer_phone();

-- Only one ACTIVE block per phone at a time (re-blocking after an
-- unblock is fine — the earlier row is inactive and doesn't conflict).
CREATE UNIQUE INDEX IF NOT EXISTS blocked_customers_active_phone_uq
  ON public.blocked_customers (phone) WHERE is_active = TRUE;

-- ── 3. Lookup helper ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_phone_blocked(p_phone TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_customers
    WHERE phone = public.normalize_phone(p_phone)
      AND is_active = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_phone_blocked(TEXT) TO anon, authenticated;

-- ── 4. Enforcement — reject the order itself, not just hide a button ─
CREATE OR REPLACE FUNCTION public.reject_order_if_phone_blocked()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF public.is_phone_blocked(NEW.phone) THEN
    RAISE EXCEPTION 'BLOCKED_PHONE: this phone number is blocked from placing orders'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_order_if_phone_blocked ON public.orders;
CREATE TRIGGER trg_reject_order_if_phone_blocked
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.reject_order_if_phone_blocked();

-- ── 5. RLS ──────────────────────────────────────────────────────
ALTER TABLE public.blocked_customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_customers_staff_select" ON public.blocked_customers;
CREATE POLICY "blocked_customers_staff_select"
  ON public.blocked_customers FOR SELECT TO authenticated
  USING (public.current_staff_role() IN ('admin', 'seller'));

DROP POLICY IF EXISTS "blocked_customers_staff_insert" ON public.blocked_customers;
CREATE POLICY "blocked_customers_staff_insert"
  ON public.blocked_customers FOR INSERT TO authenticated
  WITH CHECK (
    blocked_by = public.current_staff_id()
    AND is_active = TRUE
    AND unblocked_by IS NULL
    AND unblocked_at IS NULL
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.assigned_to = public.current_staff_id()
          AND public.normalize_phone(o.phone) = public.normalize_phone(phone)
      )
    )
  );

DROP POLICY IF EXISTS "blocked_customers_main_admin_update" ON public.blocked_customers;
CREATE POLICY "blocked_customers_main_admin_update"
  ON public.blocked_customers FOR UPDATE TO authenticated
  USING      (public.is_main_admin())
  WITH CHECK (public.is_main_admin());

-- ── Verify ──────────────────────────────────────────────────────
-- SELECT policyname, cmd, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'blocked_customers';
--
-- -- Should reject (run as the anon role via the app, not the SQL editor):
-- INSERT INTO public.blocked_customers (phone, blocked_by) VALUES ('0555000000', NULL); -- fails: RLS
--
-- -- After blocking a phone as a real seller/admin session, confirm the trigger fires:
-- INSERT INTO public.orders (id, full_name, phone, address, wilaya, wilaya_code, commune,
--   delivery_type, shipping_fee, subtotal, total_price, payment_method)
-- VALUES (gen_random_uuid(), 'test', '0555000000', 'x', 'x', '01', 'x', 'home', 0, 0, 0, 'cash_on_delivery');
-- -- ↑ should raise: BLOCKED_PHONE: this phone number is blocked from placing orders
