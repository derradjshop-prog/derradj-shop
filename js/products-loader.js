/* ==========================================================
   products-loader.js — Derradj Shop
   Fetches active products from Supabase `products` table,
   extends window.SHOP_CATALOG, and renders cards on the
   homepage electronics section.
   ========================================================== */
(function () {
  'use strict';

  const SB_URL = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk';

  /* ── Shared products cache (also used by search, cart) ── */
  window.SUPABASE_PRODUCTS = window.SUPABASE_PRODUCTS || [];

  /* ── Category icon map ── */
  const CAT_ICON = {
    books:       '📚',
    electronics: '💻',
    earbuds:     '🎧',
    laptop:      '💻',
    smart_watch: '⌚',
    power_bank:  '🔋',
    other:       '📦',
  };

  function catIcon(cat) { return CAT_ICON[cat] || '📦'; }
  function catLabelAr(cat) {
    const m = {
      books: 'كتب', electronics: 'إلكترونيات', earbuds: 'سماعات',
      laptop: 'إكسسوارات لابتوب', smart_watch: 'ساعات ذكية',
      power_bank: 'بطاريات محمولة', other: 'منتجات أخرى',
    };
    return m[cat] || cat;
  }

  /* ── Format price HTML ── */
  function priceHTML(price, oldPrice) {
    const fmt = n => Number(n).toLocaleString('en-US');
    const cur = `<span class="price-currency">دج</span>`;
    let html = `<span class="price-current${oldPrice ? ' price-sale' : ''}">
      <span class="price-value">${cur}<span class="price-amount">${fmt(price)}</span></span>
    </span>`;
    if (oldPrice) {
      html += `<span class="price-old">
        <span class="price-value">${cur}<span class="price-amount">${fmt(oldPrice)}</span></span>
      </span>`;
      const pct = Math.round((1 - price / oldPrice) * 100);
      if (pct > 0) html += `<span class="discount-tag">-${pct}%</span>`;
    }
    return html;
  }

  /* ── Build a product card HTML ── */
  function buildCard(p) {
    const url     = `/product/?slug=${encodeURIComponent(p.slug)}`;
    const isAvail = p.stock_status !== 'out_of_stock';
    const badgeCls = isAvail ? 'product-badge new' : 'product-badge product-badge--unavail';
    const badgeTxt = isAvail ? 'متوفر' : 'غير متوفر';
    const icon = catIcon(p.category);
    const catAr = catLabelAr(p.category);

    const imgSrc = p.main_image || '/Logo.jpg';

    const cartBtn = isAvail
      ? `<button class="btn-add-cart" data-add-to-cart="${p.catalog_id}">🛒 أضف للسلة</button>`
      : `<button class="btn-add-cart" disabled style="opacity:.5;cursor:not-allowed;">❌ غير متوفر</button>`;

    return `<div class="product-card" data-product-url="${url}" data-sb-product-id="${p.id}">
      <div class="${badgeCls}" data-avail-badge="${p.catalog_id}">${badgeTxt}</div>
      <a href="${url}" class="product-img-area" style="text-decoration:none;">
        <img src="${imgSrc}" alt="${escAttr(p.product_name)}"
             loading="lazy" decoding="async" width="400" height="400"
             onerror="this.src='/Logo.jpg'">
      </a>
      <div class="product-info">
        <div class="product-cat-label">${icon} ${escAttr(catAr)}</div>
        <a href="${url}" style="text-decoration:none;color:inherit;">
          <h3 class="product-name">${esc(p.product_name)}</h3>
        </a>
        ${p.short_description
          ? `<p class="product-rating" style="font-size:13px;color:#64748b;margin:4px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.short_description)}</p>`
          : ''}
        <div class="product-prices">${priceHTML(p.price, p.old_price)}</div>
        <div class="product-card-btns">
          <a href="${url}" class="btn-order-card">${icon} تفاصيل</a>
          ${cartBtn}
        </div>
      </div>
    </div>`;
  }

  function esc(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
  function escAttr(v) { return esc(v).replaceAll('"', '&quot;'); }

  /* ── Fetch products from Supabase REST API ── */
  async function fetchProducts() {
    const url = SB_URL + '/rest/v1/admin_products_catalog?select=id,catalog_id,product_name,product_name_ar,product_name_fr,category,subcategory,price,old_price,stock_status,main_image,short_description,slug,keywords,brand,is_active&is_active=eq.true&order=created_at.asc';
    const res = await fetch(url, {
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
      },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* ── Extend SHOP_CATALOG with Supabase products ── */
  function extendCatalog(products) {
    if (!window.SHOP_CATALOG) window.SHOP_CATALOG = [];
    const existing = new Set(window.SHOP_CATALOG.map(c => c.catalogId));

    products.forEach(p => {
      if (!p.catalog_id || existing.has(p.catalog_id)) return;
      window.SHOP_CATALOG.push({
        catalogId:  p.catalog_id,
        name:       p.product_name,
        shortName:  p.product_name || p.product_name,
        price:      p.price,
        image:      p.main_image || '',
        available:  p.stock_status !== 'out_of_stock',
        supabaseId: p.id,
        slug:       p.slug,
      });
    });
  }

  /* ── Render products into homepage or electronics category page ── */
  function renderHomepageProducts(products) {
    /* Support both the homepage grid and the Electronique category page grid */
    const grid = document.getElementById('homeElectronicsGrid')
              || document.getElementById('electronicsGrid');
    if (!grid) return;

    /* Only non-books go in the electronics/products section */
    const elec = products.filter(p => p.category !== 'books');
    if (!elec.length) return;

    elec.forEach(p => {
      grid.insertAdjacentHTML('beforeend', buildCard(p));
    });
  }

  /* ── Build SEARCH_PRODUCTS entries for new products ── */
  function extendSearch(products) {
    if (!window.SEARCH_PRODUCTS) return;
    const existingSlugs = new Set(window.SEARCH_PRODUCTS.map(s => s.slug));
    products.forEach(p => {
      if (!p.slug || existingSlugs.has(p.slug)) return;
      window.SEARCH_PRODUCTS.push({
        name:        p.product_name,
        nameEn:      p.product_name_ar || '',
        nameFr:      p.product_name_fr || '',
        category:    catLabelAr(p.category),
        subcategory: p.subcategory || '',
        price:       p.price,
        image:       p.main_image || '',
        url:         `/product/?slug=${p.slug}`,
        slug:        p.slug,
        description: p.short_description || '',
        keywords:    p.keywords
          ? p.keywords.split(',').map(k => k.trim()).filter(Boolean)
          : [],
        supabase:    true,
      });
    });
  }

  /* ── Main loader ── */
  async function load() {
    try {
      const products = await fetchProducts();
      if (!Array.isArray(products) || !products.length) return;

      window.SUPABASE_PRODUCTS = products;

      extendCatalog(products);
      renderHomepageProducts(products);

      /* Extend search after search-products.js has run */
      if (window.SEARCH_PRODUCTS) {
        extendSearch(products);
      } else {
        document.addEventListener('search-products-ready', () => extendSearch(products));
      }

    } catch (err) {
      console.warn('[products-loader] Failed to load Supabase products:', err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
