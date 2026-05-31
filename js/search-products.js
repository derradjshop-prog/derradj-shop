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
      image:       '/Electronique/laptop/main1.png',
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

    window.SEARCH_PRODUCTS = index;
  }

  /* books-data.js يُحمَّل قبل هذا الملف دائماً → BOOKS_DATA متاح فوراً */
  build();
})();
