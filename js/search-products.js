/* ============================================================
   search-products.js — Derradj Shop | فهرس البحث الشامل
   يُحمَّل بعد books-data.js — يبني window.SEARCH_PRODUCTS
   ============================================================ */
(function () {
  'use strict';

  function build() {
    var books = window.BOOKS_DATA || [];
    var index = [];

    /* ── الكتب ── */
    for (var i = 0; i < books.length; i++) {
      var b = books[i];
      index.push({
        id:          b.id,
        type:        'book',
        name:        b.title,
        nameEn:      b.titleEn      || '',
        category:    b.category     || 'كتب',
        price:       b.price,
        image:       '/books/' + b.image,
        url:         '/books/' + b.url,
        author:      b.author       || '',
        description: b.description  || '',
        keywords:    ['كتاب', 'كتب', b.category, b.author, 'كتاب عربي', 'مكتبة'].filter(Boolean)
      });
    }

    /* ── حامل اللابتوب ── */
    index.push({
      id:          83,
      type:        'electronics',
      name:        'حامل اللابتوب القابل للتعديل',
      nameEn:      'Adjustable Laptop Stand',
      nameFr:      'Support PC Réglable',
      category:    'إلكترونيات',
      price:       1500,
      image:       '/Electronique/laptop/main1.webp',
      url:         '/Electronique/laptop/adjustable-laptop-stand.html',
      author:      '',
      description: 'حامل لابتوب قابل للتعديل متعدد الزوايا، خفيف ومتنقل، مناسب لجميع أحجام اللابتوب. يحسن وضعية الجلوس ويقلل الإجهاد.',
      keywords: [
        'حامل حاسوب', 'حامل لابتوب', 'حامل', 'support pc', 'laptop stand',
        'support laptop', 'حامل كمبيوتر', 'إلكترونيات', 'الكترونيات',
        'electronique', 'laptop', 'حاسوب', 'كمبيوتر محمول',
        'support ordinateur', 'support portable', 'قابل للتعديل',
        'حامل لابتوب قابل للتعديل', 'laptop adjustable'
      ]
    });

    /* ── ساعة Modio ST11 ── */
    index.push({
      id:          84,
      type:        'electronics',
      name:        'ساعة ذكية Modio ST11 مع 3 أزواج أساور',
      nameEn:      'Modio ST11 Smart Watch with 3 Pairs Strap',
      nameFr:      'Montre Connectée Modio ST11 avec 3 Bracelets',
      category:    'إلكترونيات',
      price:       9800,
      image:       '/Electronique/smart-watch/modio-st11-smart-watch/main.webp',
      url:         '/Electronique/smart-watch/modio-st11-smart-watch/',
      author:      '',
      description: 'ساعة ذكية Modio ST11 مع 3 أزواج أساور قابلة للتبديل. تدعم شريحة SIM 4G. شاشة لمس، متتبع صحي، إشعارات. للاستخدام اليومي في الجزائر.',
      keywords: [
        'ساعة ذكية', 'smart watch', 'montre connectée', 'montre intelligente',
        'modio', 'modio st11', 'ساعة modio', 'ساعة 4G', 'ساعة sim',
        'ساعة إلكترونية', 'ساعة رياضية', 'ساعة يد ذكية', 'ساعة الجزائر',
        'smartwatch algerie', 'إلكترونيات', 'الكترونيات', 'electronique'
      ]
    });

    window.SEARCH_PRODUCTS = index;
  }

  /* books-data.js يُحمَّل قبل هذا الملف دائماً → BOOKS_DATA متاح فوراً */
  build();
})();
