-- ============================================================
-- supabase-add-new-books.sql — Derradj Shop
-- إضافة الكتب الجديدة (catalog_id 43-56) إلى جدول product_availability
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor
-- ============================================================

INSERT INTO public.product_availability (catalog_id, name, available) VALUES
  (43, 'بوابتك للتغيير',                                         true),
  (44, 'أغنى رجل في بابل',                                       true),
  (45, 'أريد أن أنام',                                           true),
  (46, 'كيف لا تموت وحيدًا',                                     true),
  (47, 'كن أقوى من مشاعرك',                                      true),
  (48, 'تصرفي كسيدة وفكري كرجل',                                 true),
  (49, 'كبر دماغك',                                              true),
  (50, 'قوانين النجاح المستدام: كيف تستمر في النجاح',             true),
  (51, 'كيف نحصل على السعادة ونبتعد عن الكآبة',                   true),
  (52, 'هل ستأكل قطتي مقلتي؟',                                   true),
  (53, 'الوحش الذي يسكنك يمكن أن يكون لطيفًا',                   true),
  (54, 'احرق بعد الكتابة',                                       true),
  (55, 'عين الأنا: الذي لا يُخفى عنه شيء',                      true),
  (56, 'وأشرقت الشمس من جديد',                                   true)
ON CONFLICT (catalog_id) DO NOTHING;

-- تحقق من النتيجة
SELECT catalog_id, name, available
FROM public.product_availability
WHERE catalog_id BETWEEN 43 AND 56
ORDER BY catalog_id;
