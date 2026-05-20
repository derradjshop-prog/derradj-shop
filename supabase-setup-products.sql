-- ============================================================
-- supabase-setup-products.sql — Derradj Shop
-- إدارة توفر المنتجات
-- شغّل هذا الملف في Supabase SQL Editor مرة واحدة فقط
-- ============================================================

-- 1. إنشاء جدول المنتجات
CREATE TABLE IF NOT EXISTS public.product_availability (
  catalog_id  INTEGER       PRIMARY KEY,
  name        TEXT          NOT NULL,
  available   BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- 2. تفعيل RLS
ALTER TABLE public.product_availability ENABLE ROW LEVEL SECURITY;

-- 3. صلاحية القراءة العامة (الزوار يقرأون التوفر)
DROP POLICY IF EXISTS "Public read products" ON public.product_availability;
CREATE POLICY "Public read products"
  ON public.product_availability FOR SELECT
  TO anon, authenticated
  USING (true);

-- 4. صلاحية التحديث للمشرفين المسجّلين فقط
DROP POLICY IF EXISTS "Staff update products" ON public.product_availability;
CREATE POLICY "Staff update products"
  ON public.product_availability FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. إدراج المنتجات الافتراضية (جميعها متوفرة في البداية)
--    catalog_id يجب أن يتطابق مع SHOP_CATALOG في cart.js
INSERT INTO public.product_availability (catalog_id, name, available) VALUES
  (2,  'العادات السبع للناس الأكثر فعالية',   true),
  (3,  'العادات الذرية',                       true),
  (4,  'قاعدة الـ 333',                        true),
  (6,  'متعة عدم الكمال',                      true),
  (7,  'الشجاعة تنادي',                        true),
  (8,  'قوة الآن',                             true),
  (9,  'بروباغندا',                            true),
  (10, 'فوضى الإدارة',                         true),
  (11, 'السعادة الحقيقية والسعادة الزائفة',    true),
  (12, 'مسارات السعادة',                       true),
  (13, 'في عالم الأشباح الجائعة',              true),
  (14, 'تاريخ موجز للزمان',                    true),
  (16, 'متعة أن تكون في الثلاثين',             true),
  (17, 'كن مع الشخص الذي يجعلك سعيداً',       true),
  (20, 'الذكاء العاطفي',                       true),
  (21, 'كيف تبيع أي شيء لأي إنسان',           true),
  (22, 'كيف تسوق نفسك',                        true),
  (23, 'كيف تتقن إتمام الصفقات',               true),
  (24, 'سيكولوجية المال',                       true),
  (25, 'العقل الباطن',                          true),
  (26, 'فن اللامبالاة',                         true),
  (27, 'سيكولوجية الجماهير',                    true),
  (28, 'السنن النفسية لتطور الأمم',             true),
  (29, 'الآراء والمعتقدات',                     true),
  (30, 'الذكر العقلاني: الذكورة الإيجابية',     true),
  (31, '6 مهارات لتحقيق مبيعات مختلفة مذهلة',  true),
  (32, 'الأثر المذهل للعادات البسيطة',          true)
ON CONFLICT (catalog_id) DO NOTHING;

-- تحقق من النتيجة
SELECT catalog_id, name, available FROM public.product_availability ORDER BY catalog_id;
