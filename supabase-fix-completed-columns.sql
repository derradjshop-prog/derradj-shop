-- ================================================================
-- Derradj Shop — Fix Missing completed_by / completed_at Columns
-- إصلاح أعمدة completed_by / completed_at الناقصة من orders
-- Run this if the admin dashboard fails to load orders with:
--   code: '42703', message: 'column orders.completed_by does not exist'
-- Safe to run multiple times (every statement is idempotent).
--
-- This means supabase-order-completion-system.sql did not fully
-- complete in your database — order_number clearly made it in (no
-- error was reported for that), but execution stopped before
-- reaching the completed_by/completed_at columns. This file adds
-- just those two columns directly, defensively (same "drop if wrong
-- type" guard used for order_number, in case either name already
-- exists from something unrelated), so the app is unblocked now —
-- you should still run the full supabase-order-completion-system.sql
-- afterward to make sure everything else in it (REPLICA IDENTITY
-- FULL, the trigger update, impersonation_get_orders) is also applied.
-- ================================================================

-- Normalize completed_by if a column with that name already exists
-- as something other than UUID.
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'completed_by';

  IF col_type IS NOT NULL AND col_type <> 'uuid' THEN
    ALTER TABLE public.orders DROP COLUMN completed_by;
  END IF;
END $$;

-- Normalize completed_at if a column with that name already exists
-- as something other than a timestamp.
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'completed_at';

  IF col_type IS NOT NULL AND col_type NOT IN ('timestamp with time zone', 'timestamp without time zone') THEN
    ALTER TABLE public.orders DROP COLUMN completed_at;
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS completed_by UUID
    CONSTRAINT orders_completed_by_fkey REFERENCES public.staff_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Same defensive re-assertion as supabase-fix-staff-fk-relationships.sql,
-- in case ADD COLUMN IF NOT EXISTS above no-op'd against a pre-existing
-- column without a constraint attached.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_completed_by_fkey') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_completed_by_fkey FOREIGN KEY (completed_by)
      REFERENCES public.staff_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ================================================================
-- ✅ Done — verify with:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'orders'
--   AND column_name IN ('completed_by', 'completed_at');
-- ================================================================
