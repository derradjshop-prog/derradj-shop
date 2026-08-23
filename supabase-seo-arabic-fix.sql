-- ============================================================
-- supabase-seo-arabic-fix.sql — Derradj Shop
-- يصحّح بيانات SEO (seo_title / seo_description / keywords) في
-- admin_products_catalog لتعطي الأولوية للعربية للجمهور الجزائري:
--   1) 6 منتجات إلكترونية كانت تفتقد "Derradj Shop" في الكلمات
--      المفتاحية، ومنتج واحد كان عنوانه/وصفه بالإنجليزية بالكامل
--   2) 5 كتب كان وصفها SEO بالإنجليزية بالكامل، وكتاب واحد كان
--      يفتقد "Derradj Shop" في الكلمات المفتاحية
-- شغّل هذا الملف في Supabase SQL Editor مرة واحدة، ثم أعد تشغيل
-- node scripts/generate-product-pages.js لتحديث الصفحات الثابتة.
-- ============================================================

-- ── الإلكترونيات ──────────────────────────────────────────

-- حامل اللابتوب القابل للتعديل (900 دج) — كان بلا seo_title/description، والكلمات المفتاحية بلا Derradj Shop
UPDATE public.admin_products_catalog
SET seo_title       = 'حامل لابتوب قابل للتعديل متعدد الزوايا | Derradj Shop',
    seo_description = 'اشتري حامل لابتوب قابل للتعديل متعدد الزوايا بسعر 900 دج، خفيف ومتنقل، توصيل لجميع ولايات الجزائر والدفع عند الاستلام.',
    keywords        = keywords || ',Derradj Shop'
WHERE slug = 'adjustable-laptop-stand';

-- سماعات أنكر ساوندكور R50i VG (4500 دج) — الوصف كان يبدأ بالاسم الإنجليزي، والكلمات المفتاحية بلا Derradj Shop
UPDATE public.admin_products_catalog
SET seo_title       = 'سماعات أنكر ساوندكور R50i VG بلوتوث أسود | Derradj Shop',
    seo_description = 'اشتري سماعات أنكر ساوندكور R50i VG الأصلية بسعر 4500 دج، بلوتوث 5.3 وبطارية 30 ساعة، توصيل لجميع ولايات الجزائر مع الدفع عند الاستلام.',
    keywords        = keywords || ',Derradj Shop'
WHERE slug = 'anker-soundcore-r50i-vg';

-- إيربودز 4 شحن Type-C فراك (2500 دج) — الوصف كان يبدأ بالاسم الإنجليزي، والكلمات المفتاحية بلا Derradj Shop
UPDATE public.admin_products_catalog
SET seo_title       = 'سماعات إيربودز 4 شحن Type-C فراك (ضمان) | Derradj Shop',
    seo_description = 'اشتري سماعات إيربودز 4 بشحن Type-C فراك مع ضمان بسعر 2500 دج، توصيل لجميع ولايات الجزائر والدفع عند الاستلام.',
    keywords        = keywords || ',Derradj Shop'
WHERE slug = 'airpods-4-type-c-vrac';

-- باور بانك Hoco J132A 20000mAh (3950 دج) — كان بلا seo_title/description، والكلمات المفتاحية بلا Derradj Shop
UPDATE public.admin_products_catalog
SET seo_title       = 'باور بانك Hoco J132A سعة 20000mAh | Derradj Shop',
    seo_description = 'اشتري باور بانك Hoco J132A سعة 20000mAh بكابلات مدمجة بسعر 3950 دج، توصيل سريع لجميع ولايات الجزائر مع الدفع عند الاستلام.',
    keywords        = keywords || ',Derradj Shop'
WHERE slug = 'hoco-j132a-20000mah-power-bank';

-- ساعة ذكية Modio ST11 (9800 دج) — كان بلا seo_title/description، والكلمات المفتاحية بلا Derradj Shop
UPDATE public.admin_products_catalog
SET seo_title       = 'ساعة ذكية Modio ST11 مع 3 أساور | Derradj Shop',
    seo_description = 'اشتري ساعة ذكية Modio ST11 مع 3 أزواج أساور بسعر 9800 دج، تدعم شريحة 4G وتتبع صحي، توصيل لكل ولايات الجزائر.',
    keywords        = keywords || ',Derradj Shop'
WHERE slug = 'modio-st11-smart-watch';

-- عدة Arduino UNO R3 للمبتدئين (7200 دج) — كان seo_title وseo_description بالإنجليزية بالكامل
UPDATE public.admin_products_catalog
SET seo_title       = 'عدة Arduino UNO R3 للمبتدئين +200 قطعة | Derradj Shop',
    seo_description = 'اشترِ عدة Arduino UNO R3 للمبتدئين بأكثر من 200 قطعة بسعر 7200 دج، مثالية لتعلم البرمجة والإلكترونيات، توصيل لجميع ولايات الجزائر.',
    keywords        = keywords || ',Derradj Shop'
WHERE slug = 'arduino-uno-r3-super-starter-kit-with-200-components';

-- ملاحظة: arduino-r3-830 لم يُعدَّل — seo_title/description/keywords فيه عربية وتتضمّن Derradj Shop بالفعل.

-- ── الكتب ──────────────────────────────────────────────────

-- قوة عقلك الباطن — الكلمات المفتاحية كانت بلا Derradj Shop
UPDATE public.admin_products_catalog
SET keywords = keywords || ', Derradj Shop'
WHERE slug = 'the-power-of-your-subconscious-mind';

-- مافيا قاذفات القنابل — seo_description كان بالإنجليزية بالكامل
UPDATE public.admin_products_catalog
SET seo_description = 'اشترِ كتاب مافيا قاذفات القنابل لمالكوم غلادويل بسعر 1900 دج. قصة شيقة عن القصف الجوي في الحرب العالمية الثانية. توصيل لكل ولايات الجزائر.'
WHERE slug = 'the-bomber-mafia';

-- لليوم أهميته — seo_description كان بالإنجليزية بالكامل
UPDATE public.admin_products_catalog
SET seo_description = 'اشترِ كتاب لليوم أهميته لجون سي ماكسويل بسعر 1300 دج. يقدم 12 عادة يومية لتحقيق النجاح الشخصي والمهني. توصيل لجميع ولايات الجزائر مع الدفع عند الاستلام.'
WHERE slug = 'today-matters';

-- حرر نفسك — seo_description كان بالإنجليزية بالكامل
UPDATE public.admin_products_catalog
SET seo_description = 'اشترِ كتاب حرر نفسك لغاري جون بيشوب بسعر 1150 دج. كتاب ملهم للتخلص من التفكير السلبي وبناء عقلية قوية. توصيل لجميع ولايات الجزائر مع الدفع عند الاستلام.'
WHERE slug = 'unfuk-yourself';

-- محاط بالحمقى — seo_description كان بالإنجليزية بالكامل
UPDATE public.admin_products_catalog
SET seo_description = 'اشترِ كتاب محاط بالحمقى لتوماس إريكسون بسعر 1400 دج. يشرح الأنماط الأربعة للشخصية ويحسّن مهارات التواصل. توصيل لجميع ولايات الجزائر مع الدفع عند الاستلام.'
WHERE slug = 'surrounded-by-idiots';

-- فن امتلاك الكاريزما — seo_description كان بالإنجليزية بالكامل
UPDATE public.admin_products_catalog
SET seo_description = 'اشترِ كتاب فن امتلاك الكاريزما لخالد خطاب بسعر 950 دج. دليل عملي لبناء الثقة بالنفس وتطوير مهارات التواصل. توصيل لجميع ولايات الجزائر مع الدفع عند الاستلام.'
WHERE slug = 'the-art-of-charisma';

-- تحقق من النتيجة
SELECT slug, seo_title, seo_description, keywords
FROM public.admin_products_catalog
WHERE slug IN (
  'adjustable-laptop-stand','anker-soundcore-r50i-vg','airpods-4-type-c-vrac',
  'hoco-j132a-20000mah-power-bank','modio-st11-smart-watch',
  'arduino-uno-r3-super-starter-kit-with-200-components',
  'the-power-of-your-subconscious-mind','the-bomber-mafia','today-matters',
  'unfuk-yourself','surrounded-by-idiots','the-art-of-charisma'
);
