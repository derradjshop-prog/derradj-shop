-- ================================================================
-- Derradj Shop — Order Completion & Sequential Order Numbers
-- نظام تسليم الطلبات + ترقيم تسلسلي للطلبات
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (every statement is idempotent).
--
-- Depends on: public.is_admin(), public.current_staff_id(),
-- public.guard_assignment_columns() — all defined in
-- supabase-assignment-system.sql. Run that file first if you haven't.
--
-- Also updates impersonation_get_orders() from
-- supabase-impersonation-system.sql so "View as User" keeps mirroring
-- reality exactly (now including order_number).
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- 1. guard_assignment_columns() — fixed FIRST, before any DML below
--    can fire it. Extends (not loosens) the seller completion guard
--    to also allow completed_by/completed_at in the same already-
--    permitted assigned→completed transition, and bypasses entirely
--    for real admins and for any caller not going through PostgREST's
--    authenticated/anon path (SQL Editor, superuser, service_role —
--    none carry a user JWT, so auth.uid() is NULL there).
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_assignment_columns()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  allowed_extra TEXT[];
BEGIN
  IF public.is_admin()
     OR auth.uid() IS NULL
     OR current_user IN ('postgres', 'service_role')
  THEN
    RETURN NEW;
  END IF;

  allowed_extra := CASE TG_TABLE_NAME
                     WHEN 'orders' THEN ARRAY['assignment_status', 'completed_by', 'completed_at']
                     ELSE ARRAY['assignment_status']
                   END;

  IF (to_jsonb(NEW) - allowed_extra) IS DISTINCT FROM (to_jsonb(OLD) - allowed_extra) THEN
    RAISE EXCEPTION 'Sellers may only update assignment_status (and completion fields on orders)';
  END IF;

  IF NEW.assignment_status IS DISTINCT FROM OLD.assignment_status
     AND NOT (OLD.assignment_status = 'assigned' AND NEW.assignment_status = 'completed') THEN
    RAISE EXCEPTION 'Sellers may only mark an assigned item as completed';
  END IF;

  IF TG_TABLE_NAME = 'orders'
     AND NEW.assignment_status = 'completed' AND OLD.assignment_status = 'assigned' THEN
    IF NEW.completed_by IS DISTINCT FROM public.current_staff_id() THEN
      RAISE EXCEPTION 'completed_by must be the calling seller';
    END IF;
    IF NEW.completed_at IS NULL THEN
      RAISE EXCEPTION 'completed_at must be set when completing an order';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
-- Trigger attachments (trg_orders_guard_assignment / trg_messages_guard_assignment)
-- already exist from supabase-assignment-system.sql and don't need re-creating —
-- CREATE OR REPLACE FUNCTION above updates the body they point to in place.


-- ──────────────────────────────────────────────────────────────
-- 2. order_number — sequential, human-readable order reference.
--    One-time backfill for existing rows, then a DEFAULT so every
--    new order (including the unmodified anon checkout insert in
--    ordre/app.js) gets the next number automatically.
-- ──────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.orders_order_number_seq;

-- If a column named order_number already exists with some other type
-- (e.g. a pre-existing, unrelated TEXT column — nothing in this codebase
-- ever read/wrote one before this migration), drop it first. This
-- migration is the sole owner of this column's meaning going forward;
-- ADD COLUMN IF NOT EXISTS below only checks the column NAME, not its
-- type, so without this it would silently leave the wrong type in place.
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number';

  IF col_type IS NOT NULL AND col_type <> 'bigint' THEN
    ALTER TABLE public.orders DROP COLUMN order_number;
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number BIGINT;

-- Backfill only runs if there's still unnumbered rows — safe to re-run.
-- (Runs AFTER the trigger fix above, so this UPDATE is no longer
-- misclassified as an unauthenticated seller write.)
DO $$
DECLARE
  max_assigned BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE order_number IS NULL) THEN
    WITH numbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
      FROM public.orders
    )
    UPDATE public.orders o
    SET order_number = numbered.rn
    FROM numbered
    WHERE o.id = numbered.id AND o.order_number IS NULL;
  END IF;

  SELECT COALESCE(MAX(order_number), 0) INTO max_assigned FROM public.orders;
  EXECUTE format('ALTER SEQUENCE public.orders_order_number_seq RESTART WITH %s', max_assigned + 1);
END $$;

ALTER TABLE public.orders
  ALTER COLUMN order_number SET DEFAULT nextval('public.orders_order_number_seq');

ALTER TABLE public.orders
  ALTER COLUMN order_number SET NOT NULL;

DROP INDEX IF EXISTS idx_orders_order_number_unique;
CREATE UNIQUE INDEX idx_orders_order_number_unique ON public.orders (order_number);


-- ──────────────────────────────────────────────────────────────
-- 3. completed_by / completed_at — who delivered the order and when.
--    Orders only — there's no "delivered" concept for messages.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_by UUID
    CONSTRAINT orders_completed_by_fkey REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;


-- ──────────────────────────────────────────────────────────────
-- 4. REPLICA IDENTITY FULL — Realtime UPDATE payloads must include
--    the full OLD row (not just the primary key) so admin.js can
--    detect "just became completed" vs. "already completed, touched
--    again" (e.g. admin editing notes on a finished order).
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.orders REPLICA IDENTITY FULL;


-- ──────────────────────────────────────────────────────────────
-- 5. impersonation_get_orders() — add order_number so "View as User"
--    keeps showing exactly what the seller sees.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.impersonation_get_orders(target_staff_id UUID)
RETURNS TABLE (
  id                 UUID,
  order_number       BIGINT,
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
  completed_at       TIMESTAMPTZ,
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
      o.id, o.order_number, o.full_name, o.phone, o.address, o.wilaya, o.commune,
      o.delivery_type, o.shipping_fee, o.subtotal, o.total_price,
      o.payment_method, o.receipt_url, o.is_confirmed, o.notes, o.created_at,
      o.assignment_status, o.assigned_at, o.completed_at,
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


-- ================================================================
-- ✅ Done — verify with:
--
-- SELECT id, order_number FROM public.orders ORDER BY created_at LIMIT 5;
-- SELECT relreplident FROM pg_class WHERE relname = 'orders'; -- expect 'f'
-- ================================================================
