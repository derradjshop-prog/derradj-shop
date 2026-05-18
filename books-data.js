/* ============================================================
   books-data.js — Derradj Shop | بيانات قسم الكتب
   catalogId يجب أن يتطابق مع SHOP_CATALOG في cart.js
   ============================================================ */

window.BOOKS_DATA = (function () {
  'use strict';

  return [
    {
      id: 2, title: 'العادات السبع للناس الأكثر فعالية', titleEn: 'The 7 Habits of Highly Effective People',
      author: 'ستيفن آر. كوفي', translator: 'هشام عبد الله', year: 1989,
      category: 'تطوير الذات', price: 1400, image: '7-habits/main.png', url: '7-habits/',
      description: 'سبعة مبادئ لبناء الشخصية الفعّالة والنجاح في الحياة الشخصية والمهنية والاجتماعية، مبنية على قيم راسخة ونظرة عميقة للإنسان.',
    },
    {
      id: 3, title: 'العادات الذرية', titleEn: 'Atomic Habits',
      author: 'جيمس كلير', translator: 'محمد فتحي خضر', year: 2018,
      category: 'تطوير الذات', price: 950, image: 'atomic-habits/main.png', url: 'atomic-habits/',
      description: 'استراتيجيات علمية وعملية لبناء عادات إيجابية والتخلص من العادات السلبية عبر تغييرات صغيرة تتراكم لتُحدث نتائج استثنائية.',
    },
    {
      id: 4, title: 'قاعدة الـ 333', titleEn: 'Rule 3-3-3',
      author: 'شهاب الهاشمي', translator: null, year: 2024,
      category: 'تطوير الذات', price: 1350, image: 'rule-333/main.png', url: 'rule-333/',
      description: 'خلاصات وأفكار قيّمة في العلاقات العامة وصناعة المحتوى الرقمي وبناء الحضور الشخصي عبر قاعدة مبسّطة وفعّالة.',
    },
    {
      id: 5, title: 'الأثر المذهل للعادات البسيطة', titleEn: 'Small Habits Revolution',
      author: 'ديمون زهاريادس', translator: 'مروة هاشم', year: 2016,
      category: 'تطوير الذات', price: 1200, image: 'small-habits-revolution/main.png', url: 'small-habits-revolution/',
      description: 'دليل عملي لاكتساب عادات مستدامة تدريجياً بدلاً من التغيير الجذري المفاجئ، مع التركيز على الاتساق والمثابرة اليومية.',
    },
    {
      id: 6, title: 'متعة عدم الكمال', titleEn: 'The Joy of Imperfection',
      author: 'ديمون زهاريادس', translator: null, year: 2017,
      category: 'تطوير الذات', price: 900, image: 'joy-of-imperfection/main.png', url: 'joy-of-imperfection/',
      description: 'دليل شامل للتغلب على وسواس الكمالية وإسكات الناقد الداخلي، واكتشاف أن النقص الإنساني هو أصل الجمال والتطور.',
    },
    {
      id: 7, title: 'الشجاعة تنادي', titleEn: 'Courage Is Calling',
      author: 'ريان هوليداي', translator: 'محمد أقديم', year: 2021,
      category: 'الفلسفة والفكر', price: 1300, image: 'courage-is-calling/main.png', url: 'courage-is-calling/',
      description: 'عبر قصص تاريخية ملهمة يستكشف الكاتب معنى الشجاعة الحقيقية وكيف نتغلب على الخوف الذي يمنعنا من تحقيق أهدافنا.',
    },
    {
      id: 8, title: 'قوة الآن', titleEn: 'The Power of Now',
      author: 'إيكهارت تول', translator: 'مينا كمال', year: 1997,
      category: 'الفلسفة والفكر', price: 1100, image: 'power-of-now/main.png', url: 'power-of-now/',
      description: 'دليل روحي عميق للعيش في اللحظة الراهنة والتحرر من قيود الماضي وقلق المستقبل لتحقيق السلام الداخلي الحقيقي.',
    },
    {
      id: 9, title: 'بروباغندا', titleEn: 'Propaganda',
      author: 'إدوارد بيرنايز', translator: 'يحيى العريضي', year: 1928,
      category: 'علم النفس والمجتمع', price: 1100, image: 'propaganda/main.png', url: 'propaganda/',
      description: 'الكتاب الأصل في علم العلاقات العامة يكشف آليات التأثير في الجماهير والرأي العام وكيف يمكن توجيه سلوك الناس على نطاق واسع.',
    },
    {
      id: 10, title: 'فوضى الإدارة', titleEn: 'Management Mess to Leadership Success',
      author: 'سكوت جيفري ميلر', translator: null, year: 2019,
      category: 'الإدارة والأعمال', price: 1600, image: 'management-mess/main.png', url: 'management-mess/',
      description: 'ثلاثون تحدياً حقيقياً يواجهها القادة في مسيرتهم المهنية، مع حلول عملية وتجارب واقعية للتغلب عليها.',
    },
    {
      id: 11, title: 'السعادة الحقيقية والسعادة الزائفة', titleEn: 'The Myths of Happiness',
      author: 'سونيا ليوبوميرسكي', translator: 'سمر حجازي', year: 2013,
      category: 'علم النفس والمجتمع', price: 1600, image: 'myths-of-happiness/main.png', url: 'myths-of-happiness/',
      description: 'تدحض الباحثة النفسية الأساطير الشائعة حول مصادر السعادة وتقدم بدائل علمية مستندة إلى أبحاث موثقة لبناء سعادة حقيقية ومستدامة.',
    },
    {
      id: 12, title: 'مسارات السعادة', titleEn: 'Happy Ever After',
      author: 'بول دولان', translator: null, year: 2019,
      category: 'علم النفس والمجتمع', price: 1300, image: 'happy-ever-after/main.png', url: 'happy-ever-after/',
      description: 'اكتشاف معنى السعادة الحقيقية بتجاوز القوالب النمطية والتوقعات الاجتماعية، بقلم أحد أبرز الباحثين في علم الاقتصاد السلوكي.',
    },
    {
      id: 13, title: 'في عالم الأشباح الجائعة', titleEn: 'In the Realm of Hungry Ghosts',
      author: 'غابور ماتيه', translator: null, year: 2008,
      category: 'علم النفس والمجتمع', price: 1800, image: 'hungry-ghosts/main.png', url: 'hungry-ghosts/',
      description: 'استكشاف عميق للجذور النفسية والاجتماعية للإدمان والصدمات النفسية وكيفية التعافي منها بأسلوب إنساني وعلمي رائع.',
    },
    {
      id: 14, title: 'تاريخ موجز للزمان', titleEn: 'A Brief History of Time',
      author: 'ستيفن هوكينج', translator: 'د. أدهم السمّان', year: 1988,
      category: 'العلوم والمعرفة', price: 1200, image: 'brief-history-of-time/main.png', url: 'brief-history-of-time/',
      description: 'رحلة علمية مبسّطة ورائعة في أعماق الكون من أصغر الجسيمات إلى أسرار الزمان والمكان والثقوب السوداء وأصل الكون.',
    },
    {
      id: 16, title: 'متعة أن تكون في الثلاثين', titleEn: 'The Joy of Being Thirty',
      author: 'علا ديوب', translator: null, year: 2019,
      category: 'تطوير الذات', price: 950, image: 'joy-of-thirties/main.png', url: 'joy-of-thirties/',
      description: 'مقالات متنوعة وملهمة حول مرحلة الثلاثينيات وما تحمله من نضج وخبرة وتحولات عميقة في الرؤية للذات والعالم.',
    },
    {
      id: 17, title: 'كن مع الشخص الذي يجعلك سعيداً', titleEn: 'Be with the One Who Makes You Happy',
      author: 'مؤلفون مختلفون', translator: null, year: null,
      category: 'العلاقات والحياة', price: 1200, image: 'be-happy-with-someone/main.png', url: 'be-happy-with-someone/',
      description: 'أهمية البيئة الداعمة واختيار الشريك المناسب لبناء حياة مليئة بالسعادة والانسجام والنمو الشخصي المشترك.',
    },
    {
      id: 20, title: 'الذكاء العاطفي', titleEn: 'Emotional Intelligence',
      author: 'دانيال جولمان', translator: 'ليلى الجبالي', year: 1995,
      category: 'علم النفس والمجتمع', price: 1600, image: 'emotional-intelligence/main.png', url: 'emotional-intelligence/',
      description: 'كيف يتفوق الذكاء العاطفي على معدل الذكاء التقليدي في تحقيق النجاح وبناء العلاقات وإدارة المشاعر والتعامل مع التحديات.',
    },
    {
      id: 21, title: 'كيف تبيع أي شيء لأي إنسان', titleEn: 'How to Sell Anything to Anybody',
      author: 'جو جيرارد', translator: null, year: 1977,
      category: 'الإدارة والأعمال', price: 1100, image: 'sell-anything/main.png', url: 'sell-anything/',
      description: 'أسرار المبيعات من أفضل بائع في العالم وفقاً لموسوعة غينيس، مع أساليب عملية وقصص واقعية تُغير طريقة التفكير في البيع.',
    },
  ];
})();
