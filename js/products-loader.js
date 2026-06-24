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

  /* ── Resolve an image src for either category — electronics store
     full Supabase Storage URLs already; legacy books store a path
     relative to /books/ and prefer the webp sibling. ── */
  function resolveImage(p) {
    let img = p.main_image || '';
    if (!img) return '/Logo.jpg';
    if (p.category === 'books' && !/^https?:\/\//.test(img)) {
      img = '/books/' + img.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    }
    return img;
  }

  /* ── Build a product card HTML ── */
  function buildCard(p) {
    const isBook   = p.category === 'books';
    const url      = `${isBook ? '/books/' : '/product/'}${encodeURIComponent(p.slug)}/`;
    const isAvail  = p.stock_status !== 'out_of_stock';
    const badgeCls = isAvail ? 'product-badge new' : 'product-badge product-badge--unavail';
    const badgeTxt = isAvail ? 'متوفر' : 'غير متوفر';
    const icon     = catIcon(p.category);
    const catAr    = catLabelAr(p.category);
    const imgSrc   = resolveImage(p);
    const summary  = cardSummary(p);

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
        ${summary ? `<p class="product-card-summary">${esc(summary)}</p>` : ''}
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

  /* One-line card summary: takes short_description first, falls back to
     full_description, truncates at a word boundary ≤ 72 chars. */
  function cardSummary(p) {
    const raw = (p.short_description || p.full_description || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (raw.length <= 72) return raw;
    const cut = raw.slice(0, 72);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  /* ── Fetch products from Supabase REST API ── */
  async function fetchProducts() {
    const HEADERS = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };
    const SELECT  = 'id,catalog_id,product_name,product_name_ar,product_name_fr,category,subcategory,price,old_price,stock_status,main_image,short_description,slug,keywords,brand,is_active,display_order';
    const BASE    = SB_URL + `/rest/v1/admin_products_catalog?select=${SELECT}&is_active=eq.true`;

    /* First try: ordered by display_order ASC NULLS LAST, then created_at DESC */
    let res = await fetch(BASE + '&order=display_order.asc.nullslast,created_at.desc', { headers: HEADERS });

    /* If display_order column doesn't exist yet (400 Bad Request), fall back */
    if (!res.ok && res.status === 400) {
      console.warn('[products-loader] display_order ordering failed (column may not exist) — falling back to created_at DESC. Run admin/supabase-admin-products-rls-fix.sql to enable ordering.');
      res = await fetch(BASE + '&order=created_at.desc', { headers: HEADERS });
    }

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const products = await res.json();
    console.log('[products-loader] Loaded', products?.length ?? 0, 'products (display_order sorted)');
    return products;
  }

  /* ── Extend / update SHOP_CATALOG with Supabase products ── */
  function extendCatalog(products) {
    if (!window.SHOP_CATALOG) window.SHOP_CATALOG = [];

    /* Build lookup: catalogId → index in array */
    const byId = {};
    window.SHOP_CATALOG.forEach((c, i) => { byId[c.catalogId] = i; });

    products.forEach(p => {
      if (!p.catalog_id) return;
      if (byId[p.catalog_id] !== undefined) {
        /* Update existing entry — admin_products_catalog is authoritative */
        const entry = window.SHOP_CATALOG[byId[p.catalog_id]];
        entry.name      = p.product_name;
        entry.shortName = p.product_name;
        entry.price     = p.price;
        entry.available = p.stock_status !== 'out_of_stock';
        if (p.main_image) entry.image = p.main_image;
        if (p.slug)       entry.slug  = p.slug;
        entry.supabaseId = p.id;
      } else {
        /* Add new entry */
        window.SHOP_CATALOG.push({
          catalogId:  p.catalog_id,
          name:       p.product_name,
          shortName:  p.product_name,
          price:      p.price,
          image:      p.main_image || '',
          available:  p.stock_status !== 'out_of_stock',
          supabaseId: p.id,
          slug:       p.slug,
        });
      }
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

  /* ── Render the homepage books carousel — mirrors
     renderHomepageProducts(); books/index.html keeps its own
     richer search/filter grid and sources from window.SUPABASE_PRODUCTS
     directly instead of going through this generic card builder. ── */
  function renderHomepageBooks(products) {
    const grid = document.getElementById('homeBooksGrid');
    if (!grid) return;

    const books = products.filter(p => p.category === 'books');
    if (!books.length) return;

    books.forEach(p => {
      grid.insertAdjacentHTML('beforeend', buildCard(p));
    });
  }

  /* ── Build SEARCH_PRODUCTS entries for new products ── */
  function extendSearch(products) {
    if (!window.SEARCH_PRODUCTS) return;
    const existingSlugs = new Set(window.SEARCH_PRODUCTS.map(s => s.slug));
    products.forEach(p => {
      if (!p.slug || existingSlugs.has(p.slug)) return;
      const isBook = p.category === 'books';
      window.SEARCH_PRODUCTS.push({
        name:        p.product_name,
        nameEn:      p.product_name_ar || '',
        nameFr:      p.product_name_fr || '',
        category:    catLabelAr(p.category),
        subcategory: p.subcategory || '',
        price:       p.price,
        image:       resolveImage(p),
        url:         `${isBook ? '/books/' : '/product/'}${p.slug}/`,
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
      renderHomepageBooks(products);

      /* Extend search after search-products.js has run */
      if (window.SEARCH_PRODUCTS) {
        extendSearch(products);
      } else {
        document.addEventListener('search-products-ready', () => extendSearch(products));
      }

      /* Let pages with their own render logic (books/index.html) know
         the live catalog is ready, instead of going through buildCard(). */
      document.dispatchEvent(new CustomEvent('derradj:catalog-loaded', { detail: { products } }));

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
