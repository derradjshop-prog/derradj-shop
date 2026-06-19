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

    /* ── Electronics products (83-88) are loaded dynamically by   ──
       products-loader.js → extendSearch() once Supabase responds.
       Removing them here prevents stale hardcoded data and ensures
       admin_products_catalog is the single source of truth.       ── */

    window.SEARCH_PRODUCTS = index;
  }

  /* books-data.js يُحمَّل قبل هذا الملف دائماً → BOOKS_DATA متاح فوراً */
  build();
})();
