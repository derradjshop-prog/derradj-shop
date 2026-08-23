-- ============================================================
-- derradj_shop_books_export.sql
-- Exported from books-data.js (the real source of truth for book
-- content on Derradj Shop -- this data is NOT stored in Supabase
-- today, only generated here so it CAN be imported into one).
-- Generated: 2026-06-24
-- Row count: 77 books
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.books (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  title_en     TEXT,
  author       TEXT,
  translator   TEXT,
  year         INTEGER,
  category     TEXT,
  price        INTEGER NOT NULL DEFAULT 0,
  image        TEXT,
  url          TEXT UNIQUE,
  available    BOOLEAN NOT NULL DEFAULT true,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.books;
CREATE POLICY "Public read access" ON public.books
  FOR SELECT USING (true);

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (2, 'العادات السبع للناس الأكثر فعالية', 'The 7 Habits of Highly Effective People', 'ستيفن آر. كوفي', 'هشام عبد الله', 1989, 'تطوير الذات', 1400, '7-habits/main.png', '7-habits/', TRUE, 'سبعة مبادئ لبناء الشخصية الفعّالة والنجاح في الحياة الشخصية والمهنية والاجتماعية، مبنية على قيم راسخة ونظرة عميقة للإنسان.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (3, 'العادات الذرية', 'Atomic Habits', 'جيمس كلير', 'محمد فتحي خضر', 2018, 'تطوير الذات', 950, 'atomic-habits/main.png', 'atomic-habits/', TRUE, 'استراتيجيات علمية وعملية لبناء عادات إيجابية والتخلص من العادات السلبية عبر تغييرات صغيرة تتراكم لتُحدث نتائج استثنائية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (4, 'قاعدة الـ 333', 'Rule 3-3-3', 'شهاب الهاشمي', NULL, 2024, 'تطوير الذات', 1350, 'rule-333/main.png', 'rule-333/', TRUE, 'خلاصات وأفكار قيّمة في العلاقات العامة وصناعة المحتوى الرقمي وبناء الحضور الشخصي عبر قاعدة مبسّطة وفعّالة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (6, 'متعة عدم الكمال', 'The Joy of Imperfection', 'ديمون زهاريادس', NULL, 2017, 'تطوير الذات', 1800, 'joy-of-imperfection/main.png', 'joy-of-imperfection/', TRUE, 'دليل شامل للتغلب على وسواس الكمالية وإسكات الناقد الداخلي، واكتشاف أن النقص الإنساني هو أصل الجمال والتطور.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (7, 'الشجاعة تنادي', 'Courage Is Calling', 'ريان هوليداي', 'محمد أقديم', 2021, 'الفلسفة والفكر', 1300, 'courage-is-calling/main.png', 'courage-is-calling/', TRUE, 'عبر قصص تاريخية ملهمة يستكشف الكاتب معنى الشجاعة الحقيقية وكيف نتغلب على الخوف الذي يمنعنا من تحقيق أهدافنا.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (8, 'قوة الآن', 'The Power of Now', 'إيكهارت تول', 'مينا كمال', 1997, 'الفلسفة والفكر', 1100, 'power-of-now/main.png', 'power-of-now/', TRUE, 'دليل روحي عميق للعيش في اللحظة الراهنة والتحرر من قيود الماضي وقلق المستقبل لتحقيق السلام الداخلي الحقيقي.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (9, 'بروباغندا', 'Propaganda', 'إدوارد بيرنايز', 'يحيى العريضي', 1928, 'علم النفس والمجتمع', 1100, 'propaganda/main.png', 'propaganda/', TRUE, 'الكتاب الأصل في علم العلاقات العامة يكشف آليات التأثير في الجماهير والرأي العام وكيف يمكن توجيه سلوك الناس على نطاق واسع.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (10, 'فوضى الإدارة', 'Management Mess to Leadership Success', 'سكوت جيفري ميلر', NULL, 2019, 'الإدارة والأعمال', 1600, 'management-mess/main.png', 'management-mess/', TRUE, 'ثلاثون تحدياً حقيقياً يواجهها القادة في مسيرتهم المهنية، مع حلول عملية وتجارب واقعية للتغلب عليها.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (11, 'السعادة الحقيقية والسعادة الزائفة', 'The Myths of Happiness', 'سونيا ليوبوميرسكي', 'سمر حجازي', 2013, 'علم النفس والمجتمع', 1600, 'myths-of-happiness/main.png', 'myths-of-happiness/', TRUE, 'تدحض الباحثة النفسية الأساطير الشائعة حول مصادر السعادة وتقدم بدائل علمية مستندة إلى أبحاث موثقة لبناء سعادة حقيقية ومستدامة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (12, 'مسارات السعادة', 'Happy Ever After', 'بول دولان', NULL, 2019, 'علم النفس والمجتمع', 1300, 'happy-ever-after/main.png', 'happy-ever-after/', TRUE, 'اكتشاف معنى السعادة الحقيقية بتجاوز القوالب النمطية والتوقعات الاجتماعية، بقلم أحد أبرز الباحثين في علم الاقتصاد السلوكي.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (13, 'في عالم الأشباح الجائعة', 'In the Realm of Hungry Ghosts', 'غابور ماتيه', NULL, 2008, 'علم النفس والمجتمع', 1800, 'hungry-ghosts/main.png', 'hungry-ghosts/', TRUE, 'استكشاف عميق للجذور النفسية والاجتماعية للإدمان والصدمات النفسية وكيفية التعافي منها بأسلوب إنساني وعلمي رائع.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (14, 'تاريخ موجز للزمان', 'A Brief History of Time', 'ستيفن هوكينج', 'د. أدهم السمّان', 1988, 'العلوم والمعرفة', 1200, 'brief-history-of-time/main.png', 'brief-history-of-time/', TRUE, 'رحلة علمية مبسّطة ورائعة في أعماق الكون من أصغر الجسيمات إلى أسرار الزمان والمكان والثقوب السوداء وأصل الكون.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (16, 'متعة أن تكون في الثلاثين', 'The Joy of Being Thirty', 'علا ديوب', NULL, 2019, 'تطوير الذات', 950, 'joy-of-thirties/main.png', 'joy-of-thirties/', TRUE, 'مقالات متنوعة وملهمة حول مرحلة الثلاثينيات وما تحمله من نضج وخبرة وتحولات عميقة في الرؤية للذات والعالم.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (17, 'كن مع الشخص الذي يجعلك سعيداً', 'Be with the One Who Makes You Happy', 'مؤلفون مختلفون', NULL, NULL, 'العلاقات والحياة', 1200, 'be-happy-with-someone/main.png', 'be-happy-with-someone/', TRUE, 'أهمية البيئة الداعمة واختيار الشريك المناسب لبناء حياة مليئة بالسعادة والانسجام والنمو الشخصي المشترك.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (20, 'الذكاء العاطفي', 'Emotional Intelligence', 'دانيال جولمان', 'ليلى الجبالي', 1995, 'علم النفس والمجتمع', 1600, 'emotional-intelligence/main.png', 'emotional-intelligence/', TRUE, 'كيف يتفوق الذكاء العاطفي على معدل الذكاء التقليدي في تحقيق النجاح وبناء العلاقات وإدارة المشاعر والتعامل مع التحديات.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (21, 'كيف تبيع أي شيء لأي إنسان', 'How to Sell Anything to Anybody', 'جو جيرارد', NULL, 1977, 'الإدارة والأعمال', 1100, 'sell-anything/main.png', 'sell-anything/', TRUE, 'أسرار المبيعات من أفضل بائع في العالم وفقاً لموسوعة غينيس، مع أساليب عملية وقصص واقعية تُغير طريقة التفكير في البيع.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (22, 'كيف تسوق نفسك', 'How to Sell Yourself', 'جو جيرارد', NULL, 1979, 'الإدارة والأعمال', 1700, 'sell-yourself/main.png', 'sell-yourself/', TRUE, 'من أفضل بائع في العالم وفقاً لغينيس — دليل عملي لتسويق شخصيتك وقدراتك في الحياة والعمل، لأن البيع الأول دائماً هو بيع نفسك.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (23, 'كيف تتقن إتمام الصفقات', 'How to Close Every Sale', 'جو جيرارد', NULL, 1989, 'الإدارة والأعمال', 1500, 'mastering-deals/main.png', 'mastering-deals/', TRUE, 'تقنيات احترافية لإغلاق الصفقات وتحويل كل فرصة إلى نتيجة ناجحة، مستخلصة من تجربة ميدانية حقيقية لأعظم مندوب مبيعات في التاريخ.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (24, 'سيكولوجية المال', 'The Psychology of Money', 'مورجان هاوسل', NULL, 2020, 'الإدارة والأعمال', 1600, 'psychology-of-money/main.png', 'psychology-of-money/', TRUE, 'كيف تؤثر مشاعرنا وتحيزاتنا وسلوكياتنا على قراراتنا المالية أكثر من المعرفة التقنية — درس عميق في علاقة الإنسان بالمال وطريق بناء الثروة الحقيقية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (25, 'العقل الباطن', 'The Subconscious Mind', 'فيكتور بوشيه', NULL, NULL, 'علم النفس والمجتمع', 950, 'subconscious-mind/main.png', 'subconscious-mind/', TRUE, 'رحلة استكشافية في أعماق العقل الباطن وآلياته الخفية التي تحرك سلوكنا وقراراتنا وعلاقاتنا دون وعي منّا، مع أساليب للتحكم فيها والاستفادة منها.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (26, 'فن اللامبالاة', 'The Subtle Art of Not Giving a F*ck', 'مارك مانسون', NULL, 2016, 'تطوير الذات', 900, 'subtle-art/main.png', 'subtle-art/', TRUE, 'مقاربة استفزازية ومختلفة لحياة أفضل — تعلّم كيف تختار ما تهتم به بعناية، وتتخلى عما لا يستحق طاقتك، لتعيش بحرية وأصالة حقيقية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (27, 'سيكولوجية الجماهير', 'The Crowd', 'غوستاف لوبون', NULL, 1895, 'علم النفس والمجتمع', 750, 'crowd-psychology/main.png', 'crowd-psychology/', TRUE, 'الكتاب الكلاسيكي الذي أسّس علم نفس الجماهير — يكشف كيف تفكر الحشود وتتصرف بطريقة مختلفة كلياً عن الأفراد، ولماذا يُعدّ من أكثر الكتب تأثيراً في التاريخ.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (28, 'السنن النفسية لتطور الأمم', 'The Psychology of Peoples', 'غوستاف لوبون', NULL, 1894, 'علم النفس والمجتمع', 1300, 'psychological-laws/main.png', 'psychological-laws/', TRUE, 'دراسة معمّقة في الخصائص النفسية للشعوب وكيف تحدد شخصيتها الجماعية مساراتها الحضارية والتاريخية — إسهام فريد في فهم الديناميكيات الاجتماعية للأمم.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (29, 'الآراء والمعتقدات', 'The Psychology of Revolution', 'غوستاف لوبون', NULL, 1912, 'علم النفس والمجتمع', 1550, 'opinions-beliefs/main.png', 'opinions-beliefs/', TRUE, 'كيف تتشكّل الآراء والمعتقدات الجماعية وتنتشر في المجتمعات — تحليل نفسي دقيق لآليات التأثير والإقناع الجماهيري من أبرز علماء النفس الاجتماعي.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (30, 'الذكر العقلاني: الذكورة الإيجابية', 'The Rational Male', 'رولو توماسي', NULL, 2013, 'تطوير الذات', 2100, 'rational-male/main.png', 'rational-male/', TRUE, 'مرجع شامل يستكشف الديناميكيات النفسية للعلاقات بين الجنسين والهوية الذكورية، مقدّماً رؤية عقلانية وموضوعية لفهم الذكورة الإيجابية وبناء الشخصية القوية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (31, '6 مهارات لتحقيق مبيعات مختلفة مذهلة', '6 Skills to Super-Charge Your Sales', 'ديل ميريل، جينيفر كولوسيمو، سكوت سافاج، راندي إلينج', NULL, NULL, 'الإدارة والأعمال', 1400, '6-sales-skills/main.png', '6-sales-skills/', TRUE, 'ست مهارات عملية مجرّبة لرفع مستوى أدائك في المبيعات إلى آفاق جديدة — دليل ميداني من خبراء متخصصين لتحقيق نتائج مذهلة في بيئات المبيعات التنافسية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (32, 'الأثر المذهل للعادات البسيطة', 'Small Habits Revolution', 'ديمون زهاريادس', NULL, 2018, 'تطوير الذات', 1800, 'small-habits-effect/main.png', 'small-habits-effect/', TRUE, 'الطبعة المحدّثة والموسّعة — دليل شامل لاكتساب عادات مستدامة بأساليب علمية مجرّبة، يُثبت أن التغيير الجذري يبدأ دائماً من خطوات صغيرة متراكمة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (33, 'العادات السبع للمراهقين الأكثر فعالية', 'The 7 Habits of Highly Effective Teens', 'شين كوفي', NULL, 1998, 'تطوير الذات', 1100, '7-habits-teens/main.png', '7-habits-teens/', TRUE, 'نسخة مُكيَّفة خصيصاً للمراهقين من الكتاب الأشهر في تطوير الذات — سبعة مبادئ عملية تساعد الشباب على بناء شخصية قوية وتحقيق أهدافهم بثقة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (34, 'القائد في داخلي', 'The Leader in Me', 'ستيفن آر. كوفي', NULL, 2008, 'تطوير الذات', 1300, 'leader-in-me/main.png', 'leader-in-me/', TRUE, 'كيف تُنمّي قيادة حقيقية من الداخل — يُقدّم كوفي نموذجاً تحويلياً لبناء شخصية قيادية مستدامة تنبع من القيم والمبادئ لا من المناصب والألقاب.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (35, 'الأنوثة المظلمة', 'Dark Feminine Power', 'كاثرين جيمس', NULL, NULL, 'تطوير الذات', 800, 'dark-feminine-power/main.png', 'dark-feminine-power/', TRUE, 'استكشاف الجانب المظلم من الطاقة الأنثوية وكيفية تحويله إلى قوة داخلية أصيلة — رحلة في اكتشاف الذات والتحرر من القوالب الاجتماعية المفروضة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (36, 'لماذا لا تذهب الخراف إلى الطبيب؟', 'Why Sheep Don''t Go to the Doctor', 'فهد عامر الأحمدي / د. نجاة سعيد الأحمدي', NULL, NULL, 'علم النفس والمجتمع', 1100, 'why-sheep-dont-go-to-doctor/main.png', 'why-sheep-dont-go-to-doctor/', TRUE, 'نظرة نقدية وتحليلية بالغة الطرافة لمفارقات السلوك البشري — يطرح الكتاب أسئلة عميقة حول العقلانية والاستسلام والحواجز النفسية التي تمنعنا من طلب المساعدة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (37, 'من صفر إلى واحد: ملاحظات حول الشركات الناشئة، أو كيفية بناء المستقبل', 'Zero to One', 'بيتر ثيل، بليك ماسترز', NULL, 2014, 'الإدارة والأعمال', 850, 'zero-to-one/main.png', 'zero-to-one/', TRUE, 'من المؤسس المشارك لـ PayPal — رؤية ثاقبة حول بناء شركات ناشئة استثنائية تخلق شيئاً جديداً تماماً، وليس مجرد نسخ ما هو موجود.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (38, 'اللطف وآثاره الجانبية الخمسة', 'The Five Side Effects of Kindness', 'ديفيد هاميلتون', NULL, 2017, 'علم النفس والمجتمع', 950, 'kindness-side-effects/main.png', 'kindness-side-effects/', TRUE, 'دراسة علمية مُدهشة تُثبت أن اللطف لا يفيد الآخرين فحسب، بل له آثار جانبية إيجابية عميقة على الصحة الجسدية والنفسية للشخص اللطيف نفسه.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (39, 'طاقة الأنوثة: اختبار ورفع مستوى السعادة والإبداع في حياتك', 'Feminine Energy', 'كاثرين جيمس', NULL, NULL, 'تطوير الذات', 900, 'feminine-energy/main.png', 'feminine-energy/', TRUE, 'دليل عملي لاكتشاف الطاقة الأنثوية الكامنة وتوظيفها لرفع مستوى السعادة والإبداع في مختلف مجالات الحياة الشخصية والمهنية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (40, 'ممتلئ بالفراغ: تأملات حول التعافي من الإدمانات والسلوكيات القهرية', 'Full of Emptiness', 'د. عماد رشاد عثمان', NULL, NULL, 'علم النفس والمجتمع', 1400, 'full-of-emptiness/main.png', 'full-of-emptiness/', TRUE, 'تأملات عميقة في جذور الإدمان والسلوكيات القهرية وكيفية التعافي منها — نهج نفسي إنساني يدمج بين الفهم العلمي والبُعد الروحي للشفاء.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (41, 'أبي الذي أكره: تأملات حول التعافي من إساءات الأبوين وصدمات النشأة', 'The Father I Hate', 'د. عماد رشاد عثمان', NULL, NULL, 'علم النفس والمجتمع', 1100, 'father-i-hate/main.png', 'father-i-hate/', TRUE, 'دراسة نفسية جريئة في إساءات الوالدين وصدمات الطفولة وأثرها الممتد على البالغين — مع مسارات عملية نحو التعافي وإعادة بناء الذات.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (42, 'بلورة الرأي العام', 'Crystallizing Public Opinion', 'إدوارد بيرنايز', NULL, 1923, 'علم النفس والمجتمع', 1100, 'crystallizing-public-opinion/main.png', 'crystallizing-public-opinion/', TRUE, 'الكتاب الرائد لمؤسس العلاقات العامة الحديثة — يكشف كيف يُشكَّل الرأي العام ويُوجَّه، وما هي الأدوات والتقنيات التي تُحرّك المجتمعات وتصنع الموافقة الجماهيرية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (43, 'بوابتك للتغيير', NULL, 'نواف العثمان', NULL, NULL, 'تطوير الذات', 950, 'bawabatuka-liltaghyir/main.png', 'bawabatuka-liltaghyir/', TRUE, 'كتاب في تطوير الذات يساعد القارئ على فهم خطوات التغيير الشخصي وبناء عادات وأفكار أفضل لحياة أكثر وعيًا وتوازنًا.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (44, 'أغنى رجل في بابل', 'The Richest Man in Babylon', 'جورج صامويل كلاسون', NULL, 1926, 'الإدارة والأعمال', 950, 'richest-man-in-babylon/main.png', 'richest-man-in-babylon/', TRUE, 'كتاب كلاسيكي في الثقافة المالية يقدم مبادئ بسيطة حول الادخار، إدارة المال، وبناء الثروة من خلال قصص وحِكم مدينة بابل القديمة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (45, 'أريد أن أنام', NULL, 'هارييت جريفي', NULL, NULL, 'الروايات والأدب', 850, 'urid-an-anam/main.png', 'urid-an-anam/', TRUE, 'كتاب يساعد الأطفال على الاسترخاء والاستعداد للنوم من خلال أسلوب هادئ ولطيف، مناسب لوقت النوم ويشجع على الطمأنينة والراحة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (46, 'كيف لا تموت وحيدًا', 'How Not to Die Alone', 'لوغان أوري', NULL, 2021, 'العلاقات والحياة', 1300, 'how-not-to-die-alone/main.png', 'how-not-to-die-alone/', TRUE, 'كتاب عملي في العلاقات العاطفية يساعد القارئ على فهم اختياراته وبناء علاقة صحية بعيدًا عن الأخطاء المتكررة في الحب والارتباط.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (47, 'كن أقوى من مشاعرك', 'Emotionally Stronger', 'باتريك كينغ', NULL, NULL, 'تطوير الذات', 1400, 'stronger-than-your-emotions/main.png', 'stronger-than-your-emotions/', TRUE, 'كتاب في الذكاء العاطفي والتحكم بالمشاعر، يقدم طرقًا عملية لفهم الانفعالات والتعامل معها بقوة ووعي أكبر.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (48, 'تصرفي كسيدة وفكري كرجل', 'Act Like a Lady, Think Like a Man', 'ستيف هارفي', NULL, 2009, 'العلاقات والحياة', 950, 'act-like-a-lady-think-like-a-man/main.png', 'act-like-a-lady-think-like-a-man/', TRUE, 'كتاب في العلاقات يشرح بطريقة مباشرة كيف يفكر الرجال في الحب والالتزام، ويقدم نصائح للمرأة لفهم العلاقات بشكل أوضح.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (49, 'كبر دماغك', NULL, 'د. خالد المنيف', NULL, NULL, 'تطوير الذات', 950, 'kabber-dmaghak/main.png', 'kabber-dmaghak/', TRUE, 'كتاب خفيف في تطوير الذات وفن التعامل مع ضغوط الحياة، يساعد القارئ على تبسيط الأمور وعدم إعطاء المشاكل أكبر من حجمها.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (50, 'قوانين النجاح المستدام: كيف تستمر في النجاح', 'Laws of Sustainable Success', 'غير مؤكد', NULL, NULL, 'تطوير الذات', 900, 'qawanin-al-najah-al-mustadam/main.png', 'qawanin-al-najah-al-mustadam/', TRUE, 'كتاب في النجاح وتطوير الأداء الشخصي يركز على الاستمرارية، الانضباط، وبناء أسلوب حياة يساعد على المحافظة على الإنجاز.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (51, 'كيف نحصل على السعادة ونبتعد عن الكآبة', 'The Laws of the Sun', 'ريوهو أوكاوا', NULL, NULL, 'العلاقات والحياة', 850, 'happiness-and-depression/main.png', 'happiness-and-depression/', TRUE, 'كتاب يقدم أفكارًا حول السعادة، التفكير الإيجابي، والتخلص من المشاعر السلبية من أجل حياة أكثر هدوءًا ورضا.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (52, 'هل ستأكل قطتي مقلتي؟', 'Will My Cat Eat My Eyeballs?', 'كيتلين دوتي', NULL, 2019, 'العلوم والمعرفة', 2400, 'will-my-cat-eat-my-eyeballs/main.png', 'will-my-cat-eat-my-eyeballs/', TRUE, 'كتاب غريب وممتع يجيب عن أسئلة الأطفال حول الموت والجسد بأسلوب مبسط، علمي، وصريح مع لمسة من الفكاهة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (53, 'الوحش الذي يسكنك يمكن أن يكون لطيفًا', NULL, 'غير مؤكد', NULL, NULL, 'الفلسفة والفكر', 1400, 'the-monster-inside-you-can-be-kind/main.png', 'the-monster-inside-you-can-be-kind/', TRUE, 'كتاب في فهم الذات والمشاعر الداخلية، يدعو القارئ إلى التصالح مع جانبه الخفي وتحويل الألم الداخلي إلى لطف ووعي.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (54, 'احرق بعد الكتابة', 'Burn After Writing', 'شارون جونز', NULL, 2015, 'تطوير الذات', 950, 'burn-after-writing/main.png', 'burn-after-writing/', TRUE, 'كتاب تفاعلي يعتمد على الكتابة الشخصية والأسئلة العميقة، يساعد القارئ على التعبير عن نفسه واكتشاف أفكاره ومشاعره بصدق.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (55, 'عين الأنا: الذي لا يُخفى عنه شيء', 'The Eye of the I', 'د. ديفيد ر. هاوكينز', NULL, 2001, 'الفلسفة والفكر', 1300, 'the-eye-of-the-i/main.png', 'the-eye-of-the-i/', TRUE, 'كتاب في الوعي والروحانيات يناقش طبيعة الأنا والإدراك الداخلي، ويقود القارئ نحو فهم أعمق للذات والحقيقة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (56, 'وأشرقت الشمس من جديد', 'The Sun Does Shine', 'أنتوني راي هينتون مع لارا لوف هاردن', NULL, 2018, 'الروايات والأدب', 1300, 'the-sun-does-shine/main.png', 'the-sun-does-shine/', TRUE, 'مذكرات مؤثرة لرجل قضى سنوات طويلة في السجن ظلمًا، تحكي قصة الصبر، الأمل، العدالة، والقدرة على النهوض بعد المعاناة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (57, 'كتاب المليونير', 'The Millionaire', 'مارك فيشر', NULL, NULL, 'تطوير الذات', 1200, 'kitab-al-millionaire/main.png', 'kitab-al-millionaire/', TRUE, 'قصة ملهمة تروي حكمة الملياردير في طريق الثروة والنجاح المالي، بأسلوب سردي بسيط يكشف قوانين الوفرة والتفكير الإيجابي نحو بناء الثروة الحقيقية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (58, 'السنارة: كل شيء عن ريادة الأعمال الابتكارية', 'Al-Sannara', 'البروفيسور مير أحمد', NULL, NULL, 'الإدارة والأعمال', 1300, 'al-sannara/main.png', 'al-sannara/', TRUE, 'دليل شامل في ريادة الأعمال الابتكارية يكشف أسرار بناء مشاريع ناجحة من خلال التفكير الإبداعي وإيجاد الحلول غير التقليدية في بيئة الأعمال الحديثة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (59, 'تجاوز مستويات الوعي: الطريق إلى التنوير', 'Transcending the Levels of Consciousness', 'ديفيد ر. هاوكينز', 'محمد مشكاف', NULL, 'الفلسفة والفكر', 1300, 'tajawoz-mostawayat-al-waai/main.png', 'tajawoz-mostawayat-al-waai/', TRUE, 'خارطة طريق علمية وروحية نحو التنوير والارتقاء بمستويات الوعي الإنساني، بقلم أحد أبرز أطباء الطب النفسي والباحثين في علم الوعي.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (60, 'هذا الكتاب سيؤلمك: يوميات سرية لطبيب مبتدئ', 'This Is Going to Hurt', 'آدم كاي', 'محمد الضبع', 2017, 'الروايات والأدب', 950, 'hatha-alkitab-sayuulimuk/main.png', 'hatha-alkitab-sayuulimuk/', TRUE, 'يوميات ساخرة ومؤلمة لطبيب في مستهل مسيرته تكشف الواقع الحقيقي لمهنة الطب خلف الأبواب المغلقة، بأسلوب مباشر وإنساني لا يُنسى.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (61, 'الخطابات السرية للراهب الذي باع سيارته الفيراري', 'The Secret Letters of the Monk Who Sold His Ferrari', 'روبن شارما', NULL, NULL, 'تطوير الذات', 950, 'al-khitabat-al-sirriya/main.png', 'al-khitabat-al-sirriya/', TRUE, 'رسائل حكمة خاصة تكشف أسراراً لم تُقَل في الكتاب الأصلي — رحلة أعمق في التفكير الإيجابي وبناء الحياة التي تستحقها بالمعايير الصحيحة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (62, 'الراهب الذي باع سيارته الفيراري', 'The Monk Who Sold His Ferrari', 'روبن شارما', NULL, 1997, 'تطوير الذات', 950, 'al-rahib-allathi-baa/main.png', 'al-rahib-allathi-baa/', TRUE, 'رواية ملهمة تحكي رحلة محامٍ ناجح يترك حياة الثروة والمجد ليكتشف أسرار السعادة الحقيقية والحكمة الروحية في دير جبلي بالهيمالايا.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (63, 'القوانين اليومية: 366 فكرة تأملية في القوة والإغواء والإتقان والاستراتيجية والطبيعة البشرية', 'The Daily Laws', 'روبرت غرين', NULL, 2021, 'تطوير الذات', 1900, 'daily-laws/main.png', 'daily-laws/', TRUE, '366 فكرة تأملية يومية مستخلصة من أشهر كتب روبرت غرين في القوة والإغواء والإتقان والاستراتيجية والطبيعة البشرية — حكمة يومية لبناء شخصية استثنائية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (64, 'فن الإغواء', 'The Art of Seduction', 'روبرت غرين', NULL, 2001, 'علم النفس والمجتمع', 3200, 'art-of-seduction/main.png', 'art-of-seduction/', TRUE, 'دراسة معمّقة في علم الإغواء والتأثير من خلال التاريخ والنفس البشرية — يكشف القوى الخفية التي تجذب الناس وتُسيطر على قراراتهم العاطفية والاجتماعية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (65, 'فن التعامل مع الناس', 'How to Win Friends and Influence People', 'ديل كارنيجي', NULL, 1936, 'تطوير الذات', 650, 'fan-altaamal-maa-alnas/main.png', 'fan-altaamal-maa-alnas/', TRUE, 'الكتاب الأكثر مبيعاً في تاريخ كتب التطوير الذاتي — مهارات التواصل والتأثير الإيجابي في الناس لبناء علاقات ناجحة وتحقيق الأهداف الشخصية والمهنية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (66, 'فن الإدارة والقيادة', 'The Art of Management and Leadership', 'ديل كارنيجي', NULL, NULL, 'الإدارة والأعمال', 700, 'fan-alidara-walqiyada/main.png', 'fan-alidara-walqiyada/', TRUE, 'مبادئ الإدارة الفعّالة والقيادة الناجحة من قلم كارنيجي — أساليب عملية لإدارة الفرق وتحفيز الموظفين وبناء بيئة عمل تحقق نتائج استثنائية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (67, 'دع القلق وابدأ الحياة', 'How to Stop Worrying and Start Living', 'ديل كارنيجي', 'عبد المنعم الزيادي', 1948, 'تطوير الذات', 650, 'daa-alqalaq-wabda-alhayat/main.png', 'daa-alqalaq-wabda-alhayat/', TRUE, 'الكتاب الكلاسيكي الذي تُرجم لعشرات اللغات — استراتيجيات مجرّبة للتحرر من القلق والتوتر والخوف والعيش بطاقة إيجابية وتركيز على ما يهم فعلاً.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (68, 'خطة تسويق في صفحة واحدة', 'The 1-Page Marketing Plan', 'ألن ديب', NULL, 2016, 'الإدارة والأعمال', 1200, 'one-page-marketing-plan/main.png', 'one-page-marketing-plan/', TRUE, 'نظام تسويقي بسيط وفعّال يمكن تطبيقه فوراً — خارطة طريق عملية لبناء استراتيجية تسويقية واضحة تجلب العملاء وتُنمّي الأعمال باستمرار وبتكلفة معقولة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (69, 'فوضى التسويق', 'Marketing Mess to Brand Success', 'سكوت جيفري ميلر', NULL, 2021, 'الإدارة والأعمال', 1750, 'fowda-altasweq/main.png', 'fowda-altasweq/', TRUE, 'رؤية مغايرة لعالم التسويق الحديث تكشف الأخطاء الشائعة وتقدم بدائل فعّالة لبناء علامة تجارية قوية والتميز في السوق التنافسي بأسلوب صريح وعملي.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (70, 'معجزة الصباح', 'The Miracle Morning', 'هال إلرود', 'معن عاقل', 2012, 'تطوير الذات', 1100, 'miracle-morning/main.png', 'miracle-morning/', TRUE, 'اكتشف كيف تُحدث ساعة الصباح الأولى ثورة في حياتك كلها — روتين صباحي مُثبَت علمياً يُطور صحتك الجسدية والعقلية والمهنية والروحية في وقت واحد.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (71, 'معسكر التدريب', 'Training Camp', 'جون جوردون', NULL, 2009, 'تطوير الذات', 950, 'training-camp/main.png', 'training-camp/', TRUE, 'قصة ملهمة لفريق رياضي يواجه تحديات الفشل والانهيار ويتعلم مبادئ القيادة والتضامن والإصرار على النجاح من خلال تجربة معسكر التدريب الاستثنائية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (72, 'متلازمة تيك توك: كيف يغير تطبيق واحد العالم من حولنا؟', NULL, 'إسماعيل عرفة', NULL, NULL, 'علم النفس والمجتمع', 1400, 'tiktok-syndrome/main.png', 'tiktok-syndrome/', TRUE, 'تحليل ثري لتأثير التطبيقات الاجتماعية وخاصة تيك توك على طريقة تفكيرنا وسلوكنا وعلاقاتنا في عصر الخوارزميات والانتباه المشتت — الكتاب عربي أصيل.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (73, 'قوة الحب المذهلة', 'The Astonishing Power of Love', 'ستيفاني بريليانت', 'منال ممدوح', NULL, 'العلاقات والحياة', 1700, 'quwwat-alhub-almudhila/main.png', 'quwwat-alhub-almudhila/', TRUE, 'رحلة في فهم طبيعة الحب وتأثيره المذهل على النفس والجسد والعلاقات — دليل نفسي دافئ لبناء روابط عاطفية قوية وصحية ومستدامة مع من نُحب.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (74, 'مميز بالأصفر', 'Highlighted in Yellow', 'إتش. جاكسون براون وروتشيل بنينجتون', NULL, NULL, 'تطوير الذات', 950, 'mumayaz-bil-asfar/main.png', 'mumayaz-bil-asfar/', TRUE, 'مجموعة من أجمل الاقتباسات والأفكار الملهمة التي تستحق التأمل والتطبيق — حكمة مكثفة ونصائح ذهبية تُضاء بخط التمييز الأصفر في كل صفحة تقرأها.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (75, 'ملول وعبقري: إعادة اكتشاف فن الشرود المفقود', 'Bored and Brilliant', 'مانوش زمردي', 'فرح عمران', 2017, 'تطوير الذات', 950, 'bored-and-brilliant/main.png', 'bored-and-brilliant/', TRUE, 'كشف علمي ومثير لقيمة الملل وشرود الذهن في تحفيز الإبداع والابتكار — الشرود ليس هدراً بل هو عقلك في أفضل حالاته الإبداعية والتأملية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (76, 'الحياة تخطيط: انتقاء الخيارات الحكيمة وسط عالم مضطرب', 'Life Planning', 'ريك كيرشنر وريك برينكمان', NULL, NULL, 'تطوير الذات', 1200, 'alhayat-takhtit/main.png', 'alhayat-takhtit/', TRUE, 'كيف تنتقي خياراتك الحكيمة وسط عالم مليء بالضغوط والتوقعات المتضاربة — دليل عملي لاتخاذ قرارات أفضل وتصميم حياة تتوافق مع قيمك وأهدافك الحقيقية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (77, 'الرجال من المريخ والنساء من الزهرة', 'Men Are from Mars, Women Are from Venus', 'جون غراي', NULL, 1992, 'العلاقات والحياة', 1100, 'men-mars-women-venus/main.png', 'men-mars-women-venus/', TRUE, 'المرجع الأشهر في فهم الاختلافات النفسية بين الجنسين وكيف تؤثر على التواصل والعلاقات — مفتاح لبناء علاقات زوجية وعاطفية أكثر عمقاً وتفاهماً.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (78, 'كل لتعيش: برنامج التغذية الرائع الغني بالعناصر الغذائية لإنقاص الوزن بسرعة وثبات', 'Eat to Live', 'جويل فورمان', NULL, 2003, 'العلوم والمعرفة', 2500, 'eat-to-live/main.png', 'eat-to-live/', TRUE, 'برنامج تغذوي علمي ثوري يُثبت أن الغذاء الصحيح الغني بالعناصر المغذية هو أفضل طريق لإنقاص الوزن والوقاية من الأمراض وعيش حياة أطول وأصح.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (79, 'الجانب الإيجابي من اللاعقلانية', 'The Upside of Irrationality', 'دان آريلي', NULL, 2010, 'علم النفس والمجتمع', 2900, 'upside-of-irrationality/main.png', 'upside-of-irrationality/', TRUE, 'كيف تُفيدنا قراراتنا غير العقلانية في الواقع — الباحث الاقتصادي السلوكي دان آريلي يُثبت أن اللاعقلانية ليست دائماً خطأ بل قد تكون ميزة إنسانية فريدة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (80, 'الإنسان ذلك المجهول', 'Man the Unknown', 'ألكسيس كاريل', 'عادل شفيق', 1935, 'الفلسفة والفكر', 2000, 'man-unknown/main.png', 'man-unknown/', TRUE, 'دراسة فريدة ومعمّقة في طبيعة الإنسان من منظور علمي وفلسفي — يكشف ألكسيس كاريل الحائز على نوبل ما يجهله الإنسان عن نفسه ويدعو لإعادة اكتشاف الإنسانية.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (81, 'وتظن أنك نجوت', NULL, 'إيناس سمير', NULL, NULL, 'الروايات والأدب', 1400, 'wa-tazun-annaka-najawt/main.png', 'wa-tazun-annaka-najawt/', TRUE, 'مجموعة نصوص وخواطر مترجمة بعناية تُعبّر عن ألم الفقدان والنجاة والأمل — قراءة تمسّ القلب وتُعبّر عمّا لا تجد له كلمات في لغتك الأم.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

INSERT INTO public.books (id, title, title_en, author, translator, year, category, price, image, url, available, description)
VALUES (82, 'كوتلر يتحدث عن التسويق: كيف تنشئ الأسواق وتغزوها وتسيطر عليها', 'Kotler on Marketing', 'فيليب كوتلر', 'فيصل عبد الله بابكر', 1999, 'الإدارة والأعمال', 990, 'kotler-marketing/main.png', 'kotler-marketing/', TRUE, 'أبو التسويق الحديث يُقدّم رؤيته الشاملة لأسواق المستقبل — دليل استراتيجي لإنشاء الأسواق وغزوها والسيطرة عليها بأساليب تسويقية فعّالة ومبتكرة.')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, title_en = EXCLUDED.title_en, author = EXCLUDED.author,
  translator = EXCLUDED.translator, year = EXCLUDED.year, category = EXCLUDED.category,
  price = EXCLUDED.price, image = EXCLUDED.image, url = EXCLUDED.url,
  available = EXCLUDED.available, description = EXCLUDED.description,
  updated_at = now();

COMMIT;

-- ============================================================
-- Validation queries
-- ============================================================

-- Expect 77 rows
SELECT COUNT(*) AS total_books FROM public.books;

-- Expect 0 (no duplicate ids/urls)
SELECT id, COUNT(*) FROM public.books GROUP BY id HAVING COUNT(*) > 1;
SELECT url, COUNT(*) FROM public.books GROUP BY url HAVING COUNT(*) > 1;

-- Expect 0 (every book must have an id, title, url, and a positive price)
SELECT * FROM public.books WHERE id IS NULL OR title IS NULL OR url IS NULL OR price <= 0;

-- Spot-check a row
SELECT id, title, title_en, author, price, url, available FROM public.books ORDER BY id LIMIT 5;
