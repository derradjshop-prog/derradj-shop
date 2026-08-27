-- ================================================================
-- Derradj Shop — Permanently remove two seller accounts
--   1. Mehdi              — 0696234484@derradjshop.com
--   2. (unnamed seller)   — 0661493857@derradjshop.com
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (idempotent — no-ops once the accounts
-- are gone).
--
-- WHAT THIS DOES
-- Removes these two rows from public.staff_accounts and their matching
-- auth.users accounts (login + all sessions/tokens for those users,
-- which Supabase auth cascades on its own internal tables). Every
-- other table that references a seller by id is left untouched except
-- for nulling out the reference to these two ids specifically:
--
--   orders / messages   (not yet completed) → assigned_to, assigned_by,
--                        assigned_at reset to NULL and assignment_status
--                        reset to 'pending_admin', so they fall back to
--                        admin-only visibility instead of pointing at a
--                        seller who no longer exists. COMPLETED orders/
--                        messages are left as historical records — only
--                        their now-dangling seller reference is cleared
--                        (via the existing ON DELETE SET NULL foreign
--                        keys below), everything else about them stands.
--   orders.completed_by,
--   order_items.updated_by,
--   assignment_history.from_staff_id / to_staff_id / performed_by,
--   admin_products_catalog.submitted_by,
--   impersonation_log.admin_id / target_staff_id
--                        → already ON DELETE SET NULL in the schema;
--                          cleared automatically by the DELETE below.
--   blocked_customers.blocked_by / unblocked_by
--                        → has NO "ON DELETE" clause in the schema
--                          (defaults to NO ACTION, which would make the
--                          DELETE below fail with a foreign-key error).
--                          Nulled explicitly first. The block/unblock
--                          record itself (phone, reason, timestamps)
--                          is untouched.
--   seller_book_inventory.seller_id
--                        → ON DELETE CASCADE — that seller's "books I
--                          physically hold" rows are deleted along with
--                          the account. This is live inventory-claim
--                          state tied 1:1 to the seller, not a
--                          financial/historical record, so removing it
--                          with the account is correct.
--
-- Nothing else in the schema has a foreign key to staff_accounts(id)
-- (verified against every CREATE/ALTER TABLE ... REFERENCES
-- public.staff_accounts in this repo). No products, customers, or
-- other sellers/admins are touched.
--
-- WHY THE TRIGGERS ARE DISABLED BELOW
-- orders/messages/order_items each have a BEFORE UPDATE "guard" trigger
-- (trg_orders_guard_assignment, trg_messages_guard_assignment,
-- trg_order_items_guard_cost_edit — see supabase-assignment-system.sql
-- and admin/add-order-items-cost-partner-edit.sql) that exists to stop
-- a *seller's own session* from writing to columns it isn't allowed to
-- touch. Those triggers key off auth.uid(), which is NULL in this SQL
-- Editor session — so without disabling them first, this script's own
-- cleanup UPDATEs (and even the plain ON DELETE SET NULL cascade fired
-- by the DELETE below) would be misread as an unauthorized seller edit
-- and rejected. They're re-enabled immediately after, before this
-- script ends — nothing else in this script writes to those columns as
-- a "seller" would. orders/messages' AFTER UPDATE audit-log triggers
-- (trg_orders_log_assignment / trg_messages_log_assignment) are
-- disabled for the same window, purely to avoid them trying to log a
-- history row that references an id mid-deletion; they're re-enabled
-- right after too, so all future assignment changes keep being logged
-- normally.
--
-- Whole script runs as one transaction (Supabase SQL Editor default):
-- if anything below errors, everything rolls back, including the
-- trigger disable/enable — nothing is left half-done.
-- ================================================================

DO $$
DECLARE
  target_ids UUID[];
  v_orders_open       INT;
  v_orders_completed  INT;
  v_messages_open     INT;
  v_messages_completed INT;
  v_order_items       INT;
  v_blocked            INT;
  v_history             INT;
  v_products             INT;
  v_impersonation           INT;
  v_book_inventory            INT;
BEGIN
  SELECT array_agg(id) INTO target_ids
  FROM public.staff_accounts
  WHERE email IN ('0696234484@derradjshop.com', '0661493857@derradjshop.com');

  IF target_ids IS NULL THEN
    RAISE NOTICE 'No matching staff_accounts rows found (already removed) — nothing to do.';
    RETURN;
  END IF;

  RAISE NOTICE 'Target staff_accounts ids to remove: %', target_ids;

  -- ── Dependency snapshot (visible in the SQL Editor "Messages" panel) ──
  SELECT count(*) INTO v_orders_open      FROM public.orders   WHERE assigned_to = ANY(target_ids) AND assignment_status <> 'completed';
  SELECT count(*) INTO v_orders_completed FROM public.orders   WHERE assigned_to = ANY(target_ids) AND assignment_status = 'completed';
  SELECT count(*) INTO v_messages_open      FROM public.messages WHERE assigned_to = ANY(target_ids) AND assignment_status <> 'completed';
  SELECT count(*) INTO v_messages_completed FROM public.messages WHERE assigned_to = ANY(target_ids) AND assignment_status = 'completed';
  SELECT count(*) INTO v_order_items  FROM public.order_items         WHERE updated_by = ANY(target_ids);
  SELECT count(*) INTO v_blocked      FROM public.blocked_customers   WHERE blocked_by = ANY(target_ids) OR unblocked_by = ANY(target_ids);
  SELECT count(*) INTO v_history      FROM public.assignment_history  WHERE from_staff_id = ANY(target_ids) OR to_staff_id = ANY(target_ids) OR performed_by = ANY(target_ids);
  SELECT count(*) INTO v_products     FROM public.admin_products_catalog WHERE submitted_by = ANY(target_ids);
  SELECT count(*) INTO v_impersonation FROM public.impersonation_log   WHERE admin_id = ANY(target_ids) OR target_staff_id = ANY(target_ids);
  SELECT count(*) INTO v_book_inventory FROM public.seller_book_inventory WHERE seller_id = ANY(target_ids);

  RAISE NOTICE 'orders: % open (will reset to pending_admin), % completed (kept, seller ref cleared)', v_orders_open, v_orders_completed;
  RAISE NOTICE 'messages: % open (will reset to pending_admin), % completed (kept, seller ref cleared)', v_messages_open, v_messages_completed;
  RAISE NOTICE 'order_items.updated_by rows to clear: %', v_order_items;
  RAISE NOTICE 'blocked_customers rows to clear blocked_by/unblocked_by on: %', v_blocked;
  RAISE NOTICE 'assignment_history rows to clear a reference on (kept, log preserved): %', v_history;
  RAISE NOTICE 'admin_products_catalog.submitted_by rows to clear (product itself kept): %', v_products;
  RAISE NOTICE 'impersonation_log rows to clear a reference on (kept): %', v_impersonation;
  RAISE NOTICE 'seller_book_inventory rows that will be deleted (own-stock claims, cascade): %', v_book_inventory;

  -- ── Disable guard/log triggers for this cleanup only ──────────────
  ALTER TABLE public.orders      DISABLE TRIGGER trg_orders_guard_assignment;
  ALTER TABLE public.orders      DISABLE TRIGGER trg_orders_log_assignment;
  ALTER TABLE public.messages    DISABLE TRIGGER trg_messages_guard_assignment;
  ALTER TABLE public.messages    DISABLE TRIGGER trg_messages_log_assignment;
  ALTER TABLE public.order_items DISABLE TRIGGER trg_order_items_guard_cost_edit;

  -- ── Reset open (non-completed) orders/messages to admin-only visibility ──
  UPDATE public.orders
  SET assigned_to = NULL, assigned_by = NULL, assigned_at = NULL,
      assignment_status = 'pending_admin'
  WHERE assigned_to = ANY(target_ids) AND assignment_status <> 'completed';

  UPDATE public.messages
  SET assigned_to = NULL, assigned_by = NULL, assigned_at = NULL,
      assignment_status = 'pending_admin'
  WHERE assigned_to = ANY(target_ids) AND assignment_status <> 'completed';

  -- ── blocked_customers has no ON DELETE clause — null explicitly ──
  UPDATE public.blocked_customers SET blocked_by   = NULL WHERE blocked_by   = ANY(target_ids);
  UPDATE public.blocked_customers SET unblocked_by = NULL WHERE unblocked_by = ANY(target_ids);

  -- ── The actual removal ─────────────────────────────────────────
  -- Everything else (completed orders' assigned_to/assigned_by/
  -- completed_by, order_items.updated_by, assignment_history's three
  -- columns, admin_products_catalog.submitted_by, impersonation_log's
  -- two columns) is ON DELETE SET NULL and clears automatically here.
  -- seller_book_inventory rows for these sellers are ON DELETE CASCADE
  -- and are deleted automatically here.
  DELETE FROM public.staff_accounts WHERE id = ANY(target_ids);
  DELETE FROM auth.users            WHERE id = ANY(target_ids);

  -- ── Re-enable triggers ─────────────────────────────────────────
  ALTER TABLE public.orders      ENABLE TRIGGER trg_orders_guard_assignment;
  ALTER TABLE public.orders      ENABLE TRIGGER trg_orders_log_assignment;
  ALTER TABLE public.messages    ENABLE TRIGGER trg_messages_guard_assignment;
  ALTER TABLE public.messages    ENABLE TRIGGER trg_messages_log_assignment;
  ALTER TABLE public.order_items ENABLE TRIGGER trg_order_items_guard_cost_edit;

  RAISE NOTICE 'Done — removed % staff account(s).', array_length(target_ids, 1);
END $$;

-- Reload PostgREST's schema cache (not strictly required here since no
-- columns/tables changed shape, but harmless and matches convention).
NOTIFY pgrst, 'reload schema';

-- ================================================================
-- ✅ Verify after running (paste each separately):
--
-- 1. Both accounts are gone:
-- SELECT id, email, full_name, role, is_active FROM public.staff_accounts
-- WHERE email IN ('0696234484@derradjshop.com', '0661493857@derradjshop.com');
-- -- Expect 0 rows.
--
-- 2. Auth accounts are gone:
-- SELECT id, email FROM auth.users
-- WHERE email IN ('0696234484@derradjshop.com', '0661493857@derradjshop.com');
-- -- Expect 0 rows.
--
-- 3. Admin + remaining sellers are untouched:
-- SELECT id, email, full_name, role, is_active FROM public.staff_accounts ORDER BY created_at;
-- -- Expect the admin (0555491316@derradjshop.com) and any other
-- -- legitimate accounts, unchanged.
--
-- 4. No orphaned "assigned but nobody assigned" rows:
-- SELECT id, assignment_status, assigned_to FROM public.orders
-- WHERE assignment_status = 'assigned' AND assigned_to IS NULL;
-- SELECT id, assignment_status, assigned_to FROM public.messages
-- WHERE assignment_status = 'assigned' AND assigned_to IS NULL;
-- -- Expect 0 rows from both.
--
-- 5. Triggers are back on:
-- SELECT tgname, tgenabled FROM pg_trigger
-- WHERE tgname IN ('trg_orders_guard_assignment','trg_orders_log_assignment',
--                   'trg_messages_guard_assignment','trg_messages_log_assignment',
--                   'trg_order_items_guard_cost_edit');
-- -- Expect tgenabled = 'O' (origin, i.e. enabled) for all 5 rows.
-- ================================================================
