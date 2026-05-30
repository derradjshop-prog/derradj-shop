-- ============================================================
-- supabase-add-laptop-stand.sql — Derradj Shop
-- إضافة منتج حامل اللابتوب القابل للتعديل إلى جدول التوفر
-- catalog_id: 83 | price: 1500 DZD
-- شغّل هذا الملف في Supabase SQL Editor مرة واحدة فقط
-- ============================================================

INSERT INTO public.product_availability (catalog_id, name, available)
VALUES (83, 'حامل اللابتوب القابل للتعديل', true)
ON CONFLICT (catalog_id) DO UPDATE
  SET name      = EXCLUDED.name,
      available = EXCLUDED.available,
      updated_at = NOW();

-- تحقق من النتيجة
SELECT catalog_id, name, available, updated_at
FROM public.product_availability
WHERE catalog_id = 83;
