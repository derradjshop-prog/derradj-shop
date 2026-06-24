-- ================================================================
-- Derradj Shop — "View as User" (Read-Only Admin Preview)
-- نظام معاينة الأدمن لتجربة البائع (للقراءة فقط)
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (every statement is idempotent).
--
-- WHAT THIS IS — and is NOT:
-- This does NOT create a real login session for the target staff member.
-- That would require Supabase Auth (a signed JWT minted server-side with
-- the service_role key) — out of scope by design, per the decision to
-- keep this entirely SQL-driven with no Edge Function / secret anywhere.
--
-- Instead: admin-only, SECURITY DEFINER, READ-ONLY functions that return
-- exactly the rows the target staff member's own RLS policies would let
-- them see (see supabase-assignment-system.sql for those policies). The
-- admin's own session is the only credential used throughout — nothing
-- is ever created, stored, or transmitted on behalf of the target user.
--
-- Depends on: public.is_admin() — defined in supabase-assignment-system.sql.
-- Run that file first if you haven't already.
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- 1. impersonation_log — audit trail of every preview started.
--    Written ONLY by impersonation_start_log() below.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.impersonation_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID        REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  target_staff_id UUID        REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impersonation_log_started_at
  ON public.impersonation_log (started_at DESC);

ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "impersonation_log_admin_select" ON public.impersonation_log;
CREATE POLICY "impersonation_log_admin_select"
  ON public.impersonation_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- No INSERT/UPDATE/DELETE policy for any client role — rows are written
-- only by the SECURITY DEFINER function below (table-owner write, same
-- trick used by assignment_history in supabase-assignment-system.sql).


-- ──────────────────────────────────────────────────────────────
-- 2. impersonation_start_log() — the ONLY write in this feature.
--    Logs who is about to preview whom. Re-checks is_admin() itself;
--    never trusts the caller's claim of being an admin.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.impersonation_start_log(target_staff_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can use View as User';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_accounts sa
    WHERE sa.id = target_staff_id AND sa.is_active = TRUE AND sa.role <> 'admin'
  ) THEN
    RAISE EXCEPTION 'Target must be an active, non-admin staff account';
  END IF;

  INSERT INTO public.impersonation_log (admin_id, target_staff_id)
  VALUES (auth.uid(), target_staff_id);
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 3. impersonation_get_staff_profile() — target's display info,
--    for the "Viewing as: ..." banner.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.impersonation_get_staff_profile(target_staff_id UUID)
RETURNS TABLE (id UUID, full_name TEXT, email TEXT, role TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can use View as User';
  END IF;

  RETURN QUERY
    SELECT sa.id, sa.full_name, sa.email, sa.role
    FROM public.staff_accounts sa
    WHERE sa.id = target_staff_id AND sa.is_active = TRUE AND sa.role <> 'admin';
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 4. impersonation_get_orders() — mirrors orders_seller_select_assigned
--    (assigned_to = target_staff_id) by hand. order_items is built as a
--    JSONB array so the shape matches what seller/books.html's existing
--    render functions already expect — no reliance on PostgREST's
--    RPC-result embedding, which is version-sensitive.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.impersonation_get_orders(target_staff_id UUID)
RETURNS TABLE (
  id                 UUID,
  full_name          TEXT,
  phone              TEXT,
  address            TEXT,
  wilaya             TEXT,
  commune            TEXT,
  delivery_type      TEXT,
  shipping_fee       NUMERIC,
  subtotal           NUMERIC,
  total_price        NUMERIC,
  payment_method     TEXT,
  receipt_url        TEXT,
  is_confirmed       BOOLEAN,
  notes              TEXT,
  created_at         TIMESTAMPTZ,
  assignment_status  TEXT,
  assigned_at        TIMESTAMPTZ,
  order_items        JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can use View as User';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_accounts sa
    WHERE sa.id = target_staff_id AND sa.is_active = TRUE AND sa.role <> 'admin'
  ) THEN
    RAISE EXCEPTION 'Target must be an active, non-admin staff account';
  END IF;

  RETURN QUERY
    SELECT
      o.id, o.full_name, o.phone, o.address, o.wilaya, o.commune,
      o.delivery_type, o.shipping_fee, o.subtotal, o.total_price,
      o.payment_method, o.receipt_url, o.is_confirmed, o.notes, o.created_at,
      o.assignment_status, o.assigned_at,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'product_name', oi.product_name,
                 'quantity',     oi.quantity,
                 'unit_price',   oi.unit_price,
                 'subtotal',     oi.subtotal
               ))
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      ), '[]'::jsonb) AS order_items
    FROM public.orders o
    WHERE o.assigned_to = target_staff_id
    ORDER BY o.created_at DESC
    LIMIT 500;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 5. impersonation_get_messages() — mirrors messages_seller_select_assigned.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.impersonation_get_messages(target_staff_id UUID)
RETURNS TABLE (
  id                UUID,
  name              TEXT,
  contact           TEXT,
  message           TEXT,
  created_at        TIMESTAMPTZ,
  assignment_status TEXT,
  assigned_at       TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admin can use View as User';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_accounts sa
    WHERE sa.id = target_staff_id AND sa.is_active = TRUE AND sa.role <> 'admin'
  ) THEN
    RAISE EXCEPTION 'Target must be an active, non-admin staff account';
  END IF;

  RETURN QUERY
    SELECT m.id, m.name, m.contact, m.message, m.created_at,
           m.assignment_status, m.assigned_at
    FROM public.messages m
    WHERE m.assigned_to = target_staff_id
    ORDER BY m.created_at DESC
    LIMIT 500;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 6. Grants — PostgREST/RPC needs explicit EXECUTE for "authenticated".
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.impersonation_start_log(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.impersonation_get_staff_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.impersonation_get_orders(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.impersonation_get_messages(UUID)      TO authenticated;


-- ================================================================
-- ✅ Done — verify with:
--
-- SELECT * FROM public.impersonation_log ORDER BY started_at DESC LIMIT 20;
--
-- (Run as an authenticated admin session, e.g. via the app, not the SQL
--  editor's superuser context, since these functions check auth.uid()):
-- SELECT * FROM impersonation_get_staff_profile('<seller-staff-id>');
-- SELECT * FROM impersonation_get_orders('<seller-staff-id>');
-- SELECT * FROM impersonation_get_messages('<seller-staff-id>');
-- ================================================================
