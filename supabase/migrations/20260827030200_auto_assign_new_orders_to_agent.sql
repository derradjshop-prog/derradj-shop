-- ================================================================
-- Derradj Shop — Auto-assign every new order to the call agent
-- تعيين الطلبيات الجديدة تلقائياً لموظفة متابعة الطلبيات
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (CREATE OR REPLACE FUNCTION + DROP TRIGGER
-- IF EXISTS — every statement is idempotent).
--
-- Depends on 20260827030000_add_agent_role_and_commission_schema.sql
-- (orders.assigned_agent_id, staff_accounts.role IN (...,'agent')) —
-- run that file first if you haven't.
--
-- WHAT THIS ADDS ───────────────────────────────────────────────────
-- auto_assign_order_to_agent() — a BEFORE INSERT trigger on orders.
-- On every new order where the caller left assigned_agent_id NULL
-- (the normal case — neither the anon checkout insert in ordre/app.js
-- nor any admin-side insert sets this column today), it picks the
-- oldest-created active 'agent' account and assigns the order to her.
-- SECURITY DEFINER so it can read staff_accounts regardless of the
-- inserting role's own RLS visibility — anon has NO SELECT policy on
-- staff_accounts at all, so without this the lookup would silently
-- see zero rows on the live checkout path. Same pattern as
-- public.is_admin()/current_staff_id() in supabase-assignment-system.sql
-- and public.is_phone_blocked() in admin/add-blocked-customers-system.sql.
--
-- RULES (all enforced in the function body below):
--   - If assigned_agent_id was already supplied by the caller, it is
--     left exactly as given — never overwritten.
--   - Candidate pool: staff_accounts WHERE role = 'agent' AND
--     is_active = TRUE, oldest created_at wins on ties.
--   - If no active agent exists, assigned_agent_id stays NULL and the
--     INSERT proceeds normally — an order must never fail, and no
--     exception is ever raised, just because no agent is configured
--     yet. (Contrast with trg_reject_order_if_phone_blocked, which
--     DOES raise — that trigger is a deliberate reject-the-row check,
--     this one is a best-effort convenience assignment.)
--   - delivery_status is never touched here — it keeps whatever
--     DEFAULT 'pending' already gave it (from the schema migration).
--
-- ── Trigger-conflict check (verified, not just assumed) ────────────
-- Postgres fires BEFORE INSERT and BEFORE UPDATE as entirely separate
-- trigger event types — a row is never subject to both in the same
-- statement, so this has zero interaction with the existing BEFORE
-- UPDATE triggers on orders (trg_orders_guard_agent_update,
-- trg_orders_guard_assignment / guard_assignment_columns()): those
-- only ever fire on UPDATE, this only ever fires on INSERT.
-- The only OTHER BEFORE INSERT trigger on orders today is
-- trg_reject_order_if_phone_blocked (admin/add-blocked-customers-system.sql).
-- Postgres runs same-event triggers in alphabetical order by trigger
-- name: 'trg_orders_auto_assign_agent' sorts before
-- 'trg_reject_order_if_phone_blocked' ('o' < 'r'), so the agent
-- assignment below happens to run first — but the two triggers touch
-- entirely disjoint columns (assigned_agent_id vs. rejecting the row
-- outright on a blocked phone) and neither reads a column the other
-- writes, so the outcome is identical either way; execution order
-- between them is not load-bearing.
-- ================================================================


-- ──────────────────────────────────────────────────────────────
-- 1. auto_assign_order_to_agent() trigger function
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_assign_order_to_agent()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  -- Caller already picked an agent (or explicitly NULL on purpose) — respect it.
  IF NEW.assigned_agent_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_agent_id
  FROM public.staff_accounts
  WHERE role = 'agent' AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1;

  -- v_agent_id is NULL here if no active agent exists — that's fine,
  -- assigned_agent_id just stays NULL and the insert proceeds normally.
  NEW.assigned_agent_id := v_agent_id;

  RETURN NEW;
END;
$$;


-- ──────────────────────────────────────────────────────────────
-- 2. Attach trigger — BEFORE INSERT only (see conflict-check note above).
-- ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_orders_auto_assign_agent ON public.orders;
CREATE TRIGGER trg_orders_auto_assign_agent
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_order_to_agent();


-- ──────────────────────────────────────────────────────────────
-- 3. Reload PostgREST's schema cache.
-- ──────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ================================================================
-- ✅ Done — verify with:
--
-- SELECT tgname, tgrelid::regclass, tgtype
-- FROM pg_trigger
-- WHERE tgrelid = 'public.orders'::regclass AND NOT tgisinternal
-- ORDER BY tgname;
-- ↑ should list (at least): trg_orders_auto_assign_agent,
--   trg_orders_guard_agent_update, trg_orders_guard_assignment,
--   trg_reject_order_if_phone_blocked
--
-- -- Insert a test order with NO assigned_agent_id (mirrors the real
-- -- anon checkout insert) and confirm it picks up the oldest active agent:
-- INSERT INTO public.orders (id, full_name, phone, address, wilaya, wilaya_code, commune,
--   delivery_type, shipping_fee, subtotal, total_price, payment_method)
-- VALUES (gen_random_uuid(), 'test auto-assign', '0555000001', 'x', 'x', '01', 'x',
--   'home', 0, 1000, 1000, 'cash_on_delivery')
-- RETURNING id, assigned_agent_id, delivery_status;
-- ↑ assigned_agent_id should be the oldest-created active agent's id
--   (or NULL if none exist yet), and delivery_status should be 'pending'.
--
-- -- Confirm an explicit assigned_agent_id is NOT overwritten:
-- INSERT INTO public.orders (id, full_name, phone, address, wilaya, wilaya_code, commune,
--   delivery_type, shipping_fee, subtotal, total_price, payment_method, assigned_agent_id)
-- VALUES (gen_random_uuid(), 'test explicit agent', '0555000002', 'x', 'x', '01', 'x',
--   'home', 0, 1000, 1000, 'cash_on_delivery', '<SOME_OTHER_AGENT_ID>')
-- RETURNING id, assigned_agent_id;
-- ↑ assigned_agent_id should be exactly '<SOME_OTHER_AGENT_ID>', unchanged.
--
-- -- Clean up the two test rows afterward:
-- DELETE FROM public.orders WHERE full_name IN ('test auto-assign', 'test explicit agent');
-- ================================================================
