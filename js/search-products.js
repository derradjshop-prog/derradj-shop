/* ============================================================
   search-products.js — Derradj Shop | فهرس البحث الشامل
   يبني window.SEARCH_PRODUCTS الفارغ — كل الصفوف (كتب وإلكترونيات)
   تُحمَّل ديناميكياً من admin_products_catalog عبر
   products-loader.js → extendSearch() عند استجابة Supabase.
   ============================================================ */
(function () {
  'use strict';

  window.SEARCH_PRODUCTS = [];
  document.dispatchEvent(new CustomEvent('search-products-ready'));
})();
