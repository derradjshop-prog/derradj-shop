-- ================================================================
-- Derradj Shop — Name Repair + Complete Products Fix
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- Safe to run multiple times (idempotent).
-- ================================================================


-- ── STEP 1: Detect all damaged book rows ────────────────────────
-- These are rows where name looks like a plain integer (e.g. "2", "3").
-- The bug wrote String(catalog_id) as the name when availability was toggled.
SELECT catalog_id, name
FROM   public.product_availability
WHERE  catalog_id BETWEEN 2 AND 82
  AND  name ~ '^[0-9]+$';
-- Run this first. If you see any rows here, they were damaged by the bug.
-- ── ─────────────────────────────────────────────────────────────


-- ── STEP 2: Fix catalog_id = 2 (confirmed damaged) ──────────────
UPDATE public.product_availability
SET    name = 'العادات السبع للناس الأكثر فعالية'
WHERE  catalog_id = 2;


-- ── STEP 3: Fix ALL other damaged book rows in one statement ─────
-- This restores the correct Arabic name for every book whose name
-- was overwritten with its own catalog_id number.
-- The CASE list covers every catalogId in BOOKS_META (2–82).
-- Books that were NOT damaged are not touched (name stays as-is).
UPDATE public.product_availability
SET name = CASE catalog_id
  WHEN 2  THEN 'العادات السبع للناس الأكثر فعالية'
  WHEN 3  THEN 'العادات الذرية'
  WHEN 4  THEN 'قاعدة الـ 333'
  WHEN 6  THEN 'متعة عدم الكمال'
  WHEN 7  THEN 'الشجاعة تنادي'
  WHEN 8  THEN 'قوة الآن'
  WHEN 9  THEN 'بروباغندا'
  WHEN 10 THEN 'فوضى الإدارة'
  WHEN 11 THEN 'السعادة الحقيقية والسعادة الزائفة'
  WHEN 12 THEN 'مسارات السعادة'
  WHEN 13 THEN 'في عالم الأشباح الجائعة'
  WHEN 14 THEN 'تاريخ موجز للزمان'
  WHEN 16 THEN 'متعة أن تكون في الثلاثين'
  WHEN 17 THEN 'كن مع الشخص الذي يجعلك سعيداً'
  WHEN 20 THEN 'الذكاء العاطفي'
  WHEN 21 THEN 'كيف تبيع أي شيء لأي إنسان'
  WHEN 22 THEN 'كيف تسوق نفسك'
  WHEN 23 THEN 'كيف تتقن إتمام الصفقات'
  WHEN 24 THEN 'سيكولوجية المال'
  WHEN 25 THEN 'العقل الباطن'
  WHEN 26 THEN 'فن اللامبالاة'
  WHEN 27 THEN 'سيكولوجية الجماهير'
  WHEN 28 THEN 'السنن النفسية لتطور الأمم'
  WHEN 29 THEN 'الآراء والمعتقدات'
  WHEN 30 THEN 'الذكر العقلاني: الذكورة الإيجابية'
  WHEN 31 THEN '6 مهارات لتحقيق مبيعات مختلفة مذهلة'
  WHEN 32 THEN 'الأثر المذهل للعادات البسيطة'
  WHEN 33 THEN 'العادات السبع للمراهقين الأكثر فعالية'
  WHEN 34 THEN 'القائد في داخلي'
  WHEN 35 THEN 'الأنوثة المظلمة'
  WHEN 36 THEN 'لماذا لا تذهب الخراف إلى الطبيب؟'
  WHEN 37 THEN 'من صفر إلى واحد'
  WHEN 38 THEN 'اللطف وآثاره الجانبية الخمسة'
  WHEN 39 THEN 'طاقة الأنوثة'
  WHEN 40 THEN 'ممتلئ بالفراغ'
  WHEN 41 THEN 'أبي الذي أكره'
  WHEN 42 THEN 'بلورة الرأي العام'
  WHEN 43 THEN 'بوابتك للتغيير'
  WHEN 44 THEN 'أغنى رجل في بابل'
  WHEN 45 THEN 'أريد أن أنام'
  WHEN 46 THEN 'كيف لا تموت وحيدًا'
  WHEN 47 THEN 'كن أقوى من مشاعرك'
  WHEN 48 THEN 'تصرفي كسيدة وفكري كرجل'
  WHEN 49 THEN 'كبر دماغك'
  WHEN 50 THEN 'قوانين النجاح المستدام: كيف تستمر في النجاح'
  WHEN 51 THEN 'كيف نحصل على السعادة ونبتعد عن الكآبة'
  WHEN 52 THEN 'هل ستأكل قطتي مقلتي؟'
  WHEN 53 THEN 'الوحش الذي يسكنك يمكن أن يكون لطيفًا'
  WHEN 54 THEN 'احرق بعد الكتابة'
  WHEN 55 THEN 'عين الأنا: الذي لا يُخفى عنه شيء'
  WHEN 56 THEN 'وأشرقت الشمس من جديد'
  WHEN 57 THEN 'كتاب المليونير'
  WHEN 58 THEN 'السنارة: كل شيء عن ريادة الأعمال الابتكارية'
  WHEN 59 THEN 'تجاوز مستويات الوعي: الطريق إلى التنوير'
  WHEN 60 THEN 'هذا الكتاب سيؤلمك: يوميات سرية لطبيب مبتدئ'
  WHEN 61 THEN 'الخطابات السرية للراهب الذي باع سيارته الفيراري'
  WHEN 62 THEN 'الراهب الذي باع سيارته الفيراري'
  WHEN 63 THEN 'القوانين اليومية'
  WHEN 64 THEN 'فن الإغواء'
  WHEN 65 THEN 'فن التعامل مع الناس'
  WHEN 66 THEN 'فن الإدارة والقيادة'
  WHEN 67 THEN 'دع القلق وابدأ الحياة'
  WHEN 68 THEN 'خطة تسويق في صفحة واحدة'
  WHEN 69 THEN 'فوضى التسويق'
  WHEN 70 THEN 'معجزة الصباح'
  WHEN 71 THEN 'معسكر التدريب'
  WHEN 72 THEN 'متلازمة تيك توك'
  WHEN 73 THEN 'قوة الحب المذهلة'
  WHEN 74 THEN 'مميز بالأصفر'
  WHEN 75 THEN 'ملول وعبقري'
  WHEN 76 THEN 'الحياة تخطيط'
  WHEN 77 THEN 'الرجال من المريخ والنساء من الزهرة'
  WHEN 78 THEN 'كل لتعيش'
  WHEN 79 THEN 'الجانب الإيجابي من اللاعقلانية'
  WHEN 80 THEN 'الإنسان ذلك المجهول'
  WHEN 81 THEN 'وتظن أنك نجوت'
  WHEN 82 THEN 'كوتلر يتحدث عن التسويق'
  ELSE name  -- leave untouched if not in the list
END
WHERE catalog_id BETWEEN 2 AND 82
  AND name ~ '^[0-9]+$';  -- only fix rows whose name is a plain number


-- ── STEP 4: Ensure unique constraint exists ──────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_availability_catalog_id
  ON public.product_availability (catalog_id);


-- ── STEP 5: Add category and price columns if missing ───────────
ALTER TABLE public.product_availability
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS price    INTEGER;


-- ── STEP 6: Tag books with category = 'كتب' ─────────────────────
UPDATE public.product_availability
SET    category = 'كتب'
WHERE  catalog_id BETWEEN 2 AND 82
  AND  (category IS NULL OR category = '');


-- ── STEP 7: Upsert electronics (name, category, price) ──────────
-- Does NOT overwrite existing "available" value.
INSERT INTO public.product_availability
  (catalog_id, name, available, category, price)
VALUES
  (83, 'حامل اللابتوب القابل للتعديل',                             true, 'إلكترونيات', 1500),
  (84, 'Modio ST11 Smart Watch',                                    true, 'إلكترونيات', 9800),
  (85, 'Anker SoundCore R50i VG Original – Bluetooth 5.3 Earbuds', true, 'إلكترونيات', 4900)
ON CONFLICT (catalog_id) DO UPDATE
  SET  name     = EXCLUDED.name,
       category = EXCLUDED.category,
       price    = EXCLUDED.price;


-- ── STEP 8: Verify final state ───────────────────────────────────
SELECT catalog_id, name, category, price, available
FROM   public.product_availability
ORDER  BY catalog_id;
-- All books: name = correct Arabic title, category = 'كتب'
-- Electronics 83/84/85: correct name, category = 'إلكترونيات'
-- ================================================================
