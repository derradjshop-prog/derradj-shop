-- ================================================================
-- Derradj Shop — Admin/Seller System Refactor
-- توحيد الأدوار إلى admin/seller فقط، حذف نظام الصلاحيات JSON،
-- تصحيح الأسماء، وحذف الحساب الدخيل.
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (every statement is idempotent).
--
-- Supersedes admin/add-staff-permissions.sql (deleted — the
-- permissions JSONB column it added is dropped below).
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- 1. Fix names on the two accounts this system now exclusively uses.
-- ──────────────────────────────────────────────────────────────
UPDATE public.staff_accounts SET full_name = 'Abdou' WHERE email = '0555491316@derradjshop.com';
UPDATE public.staff_accounts SET full_name = 'Mehdi' WHERE email = '0696234484@derradjshop.com';


-- ──────────────────────────────────────────────────────────────
-- 2. Remove the stray seller account (0661493857@derradjshop.com).
--    First reset anything still assigned to it back to admin-only
--    visibility, so no order/message is left "assigned" to a null
--    seller once the row is gone (completed items are left alone —
--    their historical record stands regardless of who handled them).
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  stray_id UUID;
BEGIN
  SELECT id INTO stray_id FROM public.staff_accounts WHERE email = '0661493857@derradjshop.com';

  IF stray_id IS NOT NULL THEN
    UPDATE public.orders
    SET assigned_to = NULL, assigned_by = NULL, assigned_at = NULL, assignment_status = 'pending_admin'
    WHERE assigned_to = stray_id AND assignment_status <> 'completed';

    UPDATE public.messages
    SET assigned_to = NULL, assigned_by = NULL, assigned_at = NULL, assignment_status = 'pending_admin'
    WHERE assigned_to = stray_id;

    DELETE FROM public.staff_accounts WHERE id = stray_id;
    DELETE FROM auth.users WHERE id = stray_id;
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────
-- 3. Drop the JSONB permissions system — replaced entirely by the
--    admin/seller role split + per-row assignment. No code reads
--    this column anymore after this refactor.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.staff_accounts DROP COLUMN IF EXISTS permissions;


-- ──────────────────────────────────────────────────────────────
-- 4. Lock the role model down to exactly admin/seller — the 'staff'
--    role is retired. Drops whatever the existing check constraint
--    on staff_accounts.role happens to be named (varies by how it
--    was originally created) and re-adds it under one known name.
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.conrelid = 'public.staff_accounts'::regclass
      AND con.contype = 'c'
      AND att.attname = 'role'
  LOOP
    EXECUTE format('ALTER TABLE public.staff_accounts DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.staff_accounts
  ADD CONSTRAINT staff_accounts_role_check CHECK (role IN ('admin', 'seller'));


-- ──────────────────────────────────────────────────────────────
-- 5. reviews RLS policies (supabase-reviews.sql) checked
--    `role IN ('admin', 'staff')` — re-create them admin-only now
--    that 'staff' is retired. Review management was already never
--    open to sellers, so this changes nothing about who can do what;
--    it just removes a check against a role that can no longer exist.
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "reviews_auth_read" ON public.reviews;
CREATE POLICY "reviews_auth_read"
  ON public.reviews FOR SELECT TO authenticated
  USING (
    is_approved = TRUE
    OR EXISTS (SELECT 1 FROM public.staff_accounts sa WHERE sa.id = auth.uid() AND sa.is_active = TRUE AND sa.role = 'admin')
  );

DROP POLICY IF EXISTS "reviews_staff_insert" ON public.reviews;
CREATE POLICY "reviews_staff_insert"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff_accounts sa WHERE sa.id = auth.uid() AND sa.is_active = TRUE AND sa.role = 'admin'));

DROP POLICY IF EXISTS "reviews_staff_update" ON public.reviews;
CREATE POLICY "reviews_staff_update"
  ON public.reviews FOR UPDATE TO authenticated
  USING      (EXISTS (SELECT 1 FROM public.staff_accounts sa WHERE sa.id = auth.uid() AND sa.is_active = TRUE AND sa.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff_accounts sa WHERE sa.id = auth.uid() AND sa.is_active = TRUE AND sa.role = 'admin'));

DROP POLICY IF EXISTS "reviews_staff_delete" ON public.reviews;
CREATE POLICY "reviews_staff_delete"
  ON public.reviews FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff_accounts sa WHERE sa.id = auth.uid() AND sa.is_active = TRUE AND sa.role = 'admin'));


-- ──────────────────────────────────────────────────────────────
-- 6. Reload PostgREST's schema cache (dropped column above).
-- ──────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- ✅ Done — verify with:
--
-- SELECT id, email, full_name, role, is_active FROM public.staff_accounts ORDER BY created_at;
-- -- Expect exactly 2 rows: Abdou (admin) and Mehdi (seller).
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'staff_accounts' AND column_name = 'permissions';
-- -- Expect 0 rows.
-- ================================================================
