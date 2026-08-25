-- ================================================================
-- supabase-add-subscriptions-category.sql — Derradj Shop
--
-- Adds support for the new "digital subscriptions" (الاشتراكات
-- الرقمية) product category. Reuses admin_products_catalog exactly
-- like books/electronics do (category = 'subscriptions') — no new
-- table, no changes to existing rows/behavior for books/electronics.
--
-- New columns (all additive, all safely defaulted):
--   is_featured       — "⭐ مميز" badge/flag (subscriptions admin UI only)
--   show_on_homepage  — per-product homepage-section inclusion control
--   duration          — subscription duration (e.g. "شهر واحد", "18 شهر")
--   activation_method — how the subscription is activated
--   warranty_info     — warranty/support terms
--
-- `is_active` (existing column, already enforced by the
-- public_read_active_admin_products RLS policy) is reused as the
-- real show/hide (ظاهر/مخفي) switch for subscriptions — no schema
-- change needed for that, it already exists and is already enforced.
--
-- HOW TO RUN:
--   1. Go to https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new
--   2. Paste this file and click "Run"
--
-- SAFE to run more than once — every statement is idempotent.
-- ================================================================

ALTER TABLE admin_products_catalog
  ADD COLUMN IF NOT EXISTS is_featured       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_homepage  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS duration          TEXT,
  ADD COLUMN IF NOT EXISTS activation_method TEXT,
  ADD COLUMN IF NOT EXISTS warranty_info     TEXT;
