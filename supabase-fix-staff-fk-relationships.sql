-- ================================================================
-- Derradj Shop — Fix Missing/Misnamed FK Relationships to staff_accounts
-- إصلاح علاقات المفاتيح الخارجية الناقصة مع staff_accounts
-- Run this if PostgREST returns HTTP 400 for an embed like:
--   staff_accounts!orders_assigned_to_fkey
-- Safe to run multiple times (every statement is idempotent).
--
-- ROOT CAUSE: ADD COLUMN IF NOT EXISTS only checks the column NAME.
-- If a column (e.g. orders.assigned_to) already existed before the
-- migration that tried to name its constraint, the whole clause —
-- including the named CONSTRAINT — was silently skipped, so the
-- foreign key PostgREST needs for embedding was never actually
-- created. This file re-asserts each expected constraint by NAME,
-- additively (harmless even if a differently-named FK already
-- exists on the same column), then forces PostgREST to reload.
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- STEP 1 — DIAGNOSTIC. Run this first and read the output.
-- Shows every real foreign key currently on these three tables,
-- by its actual name and definition.
-- ──────────────────────────────────────────────────────────────
SELECT
  conrelid::regclass AS table_name,
  conname            AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid::regclass::text IN ('orders', 'messages', 'assignment_history')
ORDER BY table_name, constraint_name;


-- ──────────────────────────────────────────────────────────────
-- STEP 2 — Ensure every constraint name the app's queries rely on
-- actually exists, regardless of what STEP 1 showed.
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_assigned_to_fkey') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_assigned_to_fkey FOREIGN KEY (assigned_to)
      REFERENCES public.staff_accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_assigned_by_fkey') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_assigned_by_fkey FOREIGN KEY (assigned_by)
      REFERENCES public.staff_accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_completed_by_fkey') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_completed_by_fkey FOREIGN KEY (completed_by)
      REFERENCES public.staff_accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_assigned_to_fkey') THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_assigned_to_fkey FOREIGN KEY (assigned_to)
      REFERENCES public.staff_accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'messages_assigned_by_fkey') THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_assigned_by_fkey FOREIGN KEY (assigned_by)
      REFERENCES public.staff_accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_history_from_staff_id_fkey') THEN
    ALTER TABLE public.assignment_history
      ADD CONSTRAINT assignment_history_from_staff_id_fkey FOREIGN KEY (from_staff_id)
      REFERENCES public.staff_accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_history_to_staff_id_fkey') THEN
    ALTER TABLE public.assignment_history
      ADD CONSTRAINT assignment_history_to_staff_id_fkey FOREIGN KEY (to_staff_id)
      REFERENCES public.staff_accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assignment_history_performed_by_fkey') THEN
    ALTER TABLE public.assignment_history
      ADD CONSTRAINT assignment_history_performed_by_fkey FOREIGN KEY (performed_by)
      REFERENCES public.staff_accounts(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- STEP 3 — Force PostgREST to reload its schema cache. Without
-- this, even a correctly-existing constraint may not be visible
-- to the REST API until its next automatic reload.
-- ──────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- ✅ Done — verify with:
--
-- 1. Re-run the STEP 1 diagnostic query — confirm all of these now
--    appear: orders_assigned_to_fkey, orders_assigned_by_fkey,
--    orders_completed_by_fkey, messages_assigned_to_fkey,
--    messages_assigned_by_fkey, assignment_history_from_staff_id_fkey,
--    assignment_history_to_staff_id_fkey, assignment_history_performed_by_fkey.
--
-- 2. In the app (or via curl with your anon key + a logged-in admin's
--    bearer token), retry the failing request — it should now return
--    200 with assigned_staff embedded:
--    /rest/v1/orders?select=id,assigned_staff:staff_accounts!orders_assigned_to_fkey(id,full_name,email)
--
-- 3. If it STILL 400s after this, the constraint name in STEP 1's
--    output is the real one — paste that output back and the
--    embed hints in admin/admin.js will be updated to match it
--    exactly instead of re-asserting our expected name.
-- ================================================================
