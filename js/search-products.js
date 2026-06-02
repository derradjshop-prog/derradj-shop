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

    /* ── Anker SoundCore R50i VG Earbuds ── */
    index.push({
      id:          85,
      type:        'electronics',
      name:        'Anker SoundCore R50i VG – Bluetooth 5.3 Earbuds',
      nameEn:      'Anker SoundCore R50i VG Original Bluetooth Earbuds',
      nameFr:      'Écouteurs Bluetooth Anker SoundCore R50i VG',
      category:    'إلكترونيات',
      price:       5300,
      image:       '/Electronique/earbuds/anker-soundcore-r50i-vg/images/main.png',
      url:         '/Electronique/earbuds/anker-soundcore-r50i-vg/',
      author:      '',
      description: 'Anker SoundCore R50i VG Original Bluetooth 5.3 earbuds with 10 mm drivers, 30h total battery, 2 AI microphones, IPX5 water resistance, USB-C fast charging. Available in Black and Blue.',
      keywords: [
        'سماعات بلوتوث', 'سماعات أنكر', 'anker', 'soundcore', 'anker r50i',
        'earbuds', 'bluetooth earbuds', 'écouteurs bluetooth',
        'سماعات لاسلكية', 'سماعات الجزائر', 'écouteurs algérie',
        'anker soundcore', 'r50i vg', 'سماعات داخل الأذن',
        'إلكترونيات', 'الكترونيات', 'electronique',
        'bluetooth 5.3', 'سماعة بلوتوث', 'سماعة رياضية'
      ]
    });

    /* ── Airpods 4 Type-C Vrac (Garantie) ── */
    index.push({
      id:          87,
      type:        'electronics',
      name:        'Airpods 4 Type-C Vrac (Garantie)',
      nameEn:      'Airpods 4 Type-C Vrac with Guarantee',
      nameFr:      'Airpods 4 Type-C Vrac avec Garantie',
      category:    'إلكترونيات',
      price:       2900,
      image:       '/Electronique/earbuds/airpods-4-type-c-vrac/main.webp',
      url:         '/Electronique/earbuds/airpods-4-type-c-vrac/',
      author:      '',
      description: 'Airpods 4 Type-C Vrac (Garantie) — Wireless Bluetooth earbuds with Type-C charging port. Sold as Vrac (unboxed) with guarantee. No SIM card. No camera. Suitable for daily use, calls, study, work, and travel.',
      keywords: [
        'airpods', 'airpods 4', 'airpods type c', 'airpods vrac',
        'سماعات بلوتوث', 'سماعات type c', 'سماعات vrac', 'سماعات لاسلكية',
        'سماعات الجزائر', 'airpods algerie', 'airpods dz', 'airpods 4 algerie',
        'earbuds', 'bluetooth earbuds', 'type c earbuds', 'écouteurs bluetooth',
        'écouteurs type c', 'écouteurs algérie', 'écouteurs vrac',
        'garantie', 'vrac', 'إلكترونيات', 'الكترونيات', 'electronique'
      ]
    });

    window.SEARCH_PRODUCTS = index;
  }

  /* books-data.js يُحمَّل قبل هذا الملف دائماً → BOOKS_DATA متاح فوراً */
  build();
})();
