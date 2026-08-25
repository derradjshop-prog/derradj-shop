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
  const HEADERS = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

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
    subscriptions: '💎',
  };

  /* ── Electronics subcategories — single source of truth is the
     Supabase `categories` table (see admin/setup-categories.sql).
     Populated by fetchCategories() in load(); exposed on window so
     Electronique/index.html's filter chips can reuse the exact same
     data + resolveCategorySlug() logic without a second query. ── */
  window.SUPABASE_CATEGORIES = window.SUPABASE_CATEGORIES || [];

  /* Same legacy bucketing as admin/products-manager.js — kept in sync
     by hand since one runs via supabase-js (sb.from) and the other via
     plain fetch() (no supabase-js loaded on the public site), matching
     how this file already duplicates fetchProducts() vs the admin
     equivalent for the same reason. Never rewrites subcategory in the
     DB — see that file's comment for why (image-folder path coupling). */
  /* Only mapped where unambiguous — see the matching comment in
     admin/products-manager.js. No fallback bucket: unmapped legacy
     products simply show no subcategory label/chip rather than being
     guessed into one (e.g. the current 17-category list has no general
     "wireless earbuds" bucket, so the Anker SoundCore earbuds — not
     AirPods-branded — are intentionally left unclassified). */
  const LEGACY_SUBCATEGORY_BY_CATALOG_ID = { 87: 'airpods' };
  const LEGACY_SUBCATEGORY_BY_VALUE = {
    smart_watch: 'smartwatch',
    power_bank:  'power-bank',
  };
  function resolveCategorySlug(p) {
    if (!p || p.category === 'books' || p.category === 'subscriptions') return null;
    const byId = LEGACY_SUBCATEGORY_BY_CATALOG_ID[p.catalog_id];
    if (byId) return byId;
    const raw = p.subcategory;
    if (raw && window.SUPABASE_CATEGORIES.some(c => c.slug === raw)) return raw;
    if (raw && LEGACY_SUBCATEGORY_BY_VALUE[raw]) return LEGACY_SUBCATEGORY_BY_VALUE[raw];
    return null;
  }
  function categoryBySlug(slug) { return window.SUPABASE_CATEGORIES.find(c => c.slug === slug) || null; }
  window.resolveCategorySlug = resolveCategorySlug;
  window.categoryBySlug = categoryBySlug;

  async function fetchCategories() {
    try {
      const url = SB_URL + '/rest/v1/categories?select=*&is_active=eq.true&order=sort_order.asc';
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      console.warn('[products-loader] categories unavailable:', err.message || err);
      return [];
    }
  }

  /* ── `product_name` / `product_name_ar` aren't consistently
     Arabic-vs-English per row (legacy data entry varies), so detect
     by script rather than trusting the field name — mirrors the
     same logic in js/product-template.js so cards, search and the
     product page always agree on which name is Arabic. ── */
  const AR_RE = /[؀-ۿ]/;
  function isArabic(s) { return AR_RE.test(s || ''); }
  function arName(p) {
    const a = p.product_name, b = p.product_name_ar;
    const aIsAr = isArabic(a), bIsAr = isArabic(b);
    if (aIsAr && !bIsAr) return a;
    if (!aIsAr && bIsAr) return b;
    return a || b || '';
  }
  function otherName(p) {
    const a = p.product_name, b = p.product_name_ar;
    const aIsAr = isArabic(a), bIsAr = isArabic(b);
    if (aIsAr && !bIsAr) return b || '';
    if (!aIsAr && bIsAr) return a || '';
    return '';
  }

  /* ── Electronics card title — must never be Arabic. otherName(p)
     covers the normal case (one of product_name/product_name_ar is
     genuinely English). A small number of legacy rows have Arabic
     text typed into BOTH name fields (a data-entry gap, not a code
     bug — confirmed 2026-08-20 for catalog_id 83 "adjustable-laptop-
     stand" and 84 "modio-st11-smart-watch"), so otherName() returns
     ''; product_name_fr (French, also non-Arabic) is the agreed
     interim fallback for those until an admin fills in a real English
     name. If even that is missing, falling back to Arabic here is a
     last-resort safety net, not the intended behavior — it should
     never trigger given current data, and any occurrence should be
     reported/fixed in Admin rather than relied on. */
  function electronicsTitle(p) {
    const en = otherName(p);
    if (en) return { text: en, isEnglish: true };
    const fr = (p.product_name_fr || '').trim();
    if (fr) return { text: fr, isEnglish: true };
    console.warn('[products-loader] Electronics product has no English or French title — showing Arabic as last resort:', p.catalog_id, p.slug);
    return { text: arName(p), isEnglish: false };
  }

  function catIcon(cat) { return CAT_ICON[cat] || '📦'; }
  function catLabelAr(cat) {
    const m = {
      books: 'كتب', electronics: 'إلكترونيات', earbuds: 'سماعات',
      laptop: 'إكسسوارات لابتوب', smart_watch: 'ساعات ذكية',
      power_bank: 'بطاريات محمولة', other: 'منتجات أخرى',
      subscriptions: 'اشتراكات رقمية',
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

  /* ── Electronics subcategory → actual /Electronique/ folder name.
     admin_products_catalog.subcategory uses underscores (power_bank,
     smart_watch) but those two folders on disk use hyphens — every
     other subcategory's folder name matches its value as-is. Without
     this map the built path 404s and the card silently falls back to
     the generic logo even though the real photo exists in the repo. ── */
  const SUBCATEGORY_DIR = { power_bank: 'power-bank', smart_watch: 'smart-watch' };
  /* Some rows have free-text subcategory values (e.g. "Arduino /
     Composants électroniques") containing characters illegal in a
     filesystem path segment — "/" in particular can never resolve as a
     static file, which silently forced every visitor's browser to fall
     back to fetching the image straight from Supabase Storage on every
     page load (the dominant Cached Egress source). Sanitize before
     using it as a folder name — mirrored in js/product-template.js and
     js/product-page.js so all three agree on the same path. */
  function sanitizeSubdir(sub) {
    return String(sub || 'other').replace(/[\/\\?%*:|"<>]/g, '-').trim() || 'other';
  }
  function subcategoryDir(sub) { return sanitizeSubdir(SUBCATEGORY_DIR[sub] || sub); }

  /* ── Resolve an image src for either category. Both categories are
     always served from the repo (never from Supabase Storage, which
     is uncached and was the dominant source of egress) — electronics
     images live at a deterministic /Electronique/ path, book covers
     are always converted to /books/{slug}/main.webp regardless of
     whatever URL happens to be stored in main_image. ── */
  function resolveImage(p) {
    if (p.category === 'books') {
      const slug = p.slug || '';
      return slug ? `/books/${encodeURIComponent(slug)}/main.webp` : (p.main_image || '/Logo.jpg');
    }
    if (p.category === 'subscriptions') {
      const slug = p.slug || '';
      return slug ? `/subscriptions/${encodeURIComponent(slug)}/main.webp` : (p.main_image || '/Logo.jpg');
    }
    let img = p.main_image || '';
    if (!img) return '/Logo.jpg';
    const sub = subcategoryDir(String(p.subcategory || 'other'));
    const slug = p.slug || String(p.catalog_id || p.id || '');
    function filenameFromUrl(u) { try { return String(u || '').split('/').filter(Boolean).pop() || 'main.webp'; } catch { return 'main.webp'; } }
    const mainFilename = (p.main_image && filenameFromUrl(p.main_image)) || 'main.webp';
    img = `/Electronique/${encodeURIComponent(sub)}/${encodeURIComponent(slug)}/${encodeURIComponent(mainFilename)}`;
    return img;
  }

  /* ── data-fallback + onerror pair for a product <img>: if the local
     repo copy 404s (never mirrored, or mirrored under a different
     filename), fall back to the real Supabase Storage URL before
     giving up on the generic logo — so a missing local mirror shows
     the actual product photo instead of silently degrading. ── */
  function imgFallbackAttrs(p) {
    if (p.category === 'books' || p.category === 'subscriptions' || !p.main_image) return '';
    return `data-fallback="${escAttr(p.main_image)}" `;
  }
  const IMG_ONERROR = `onerror="if(this.dataset.fallback&amp;&amp;this.src!==this.dataset.fallback){this.src=this.dataset.fallback}else{this.src='/Logo.jpg'}"`;

  /* ── Build a product card HTML ── */
  function buildCard(p) {
    const isBook   = p.category === 'books';
    const url      = `${isBook ? '/books/' : '/product/'}${encodeURIComponent(p.slug)}/`;
    const isAvail  = p.stock_status !== 'out_of_stock';
    const badgeCls = isAvail ? 'product-badge new' : 'product-badge product-badge--unavail';
    const badgeTxt = isAvail ? 'متوفر' : 'نفذت الكمية';
    /* Electronics cards show the specific subcategory (🔋 بطاريات محمولة)
       instead of the generic top-level label, when one can be resolved —
       books keep the plain "📚 كتب" label as before. */
    const subcat   = isBook ? null : categoryBySlug(resolveCategorySlug(p));
    const icon     = subcat ? (subcat.icon || '📦') : catIcon(p.category);
    const catAr    = subcat ? subcat.name : catLabelAr(p.category);
    const imgSrc   = resolveImage(p);
    const summary  = cardSummary(p);

    const cartBtn = isAvail
      ? `<button class="btn-add-cart" data-add-to-cart="${p.catalog_id}">🛒 أضف للسلة</button>`
      : `<button class="btn-add-cart" disabled style="opacity:.5;cursor:not-allowed;">🔴 نفذت الكمية</button>`;

    const name = arName(p);
    /* Main card title: electronics always show a non-Arabic title —
       English when product_name/product_name_ar has one, otherwise
       product_name_fr (French) as an interim fallback for the couple
       of legacy rows with no English name stored — see
       electronicsTitle() above. Books keep the original Arabic main
       title unchanged. Everything else on the card (alt text, search
       index, SEO/H1 on the product page) keeps using the Arabic name
       regardless of category. */
    const titleInfo = (isBook || p.category === 'subscriptions')
      ? { text: name, isEnglish: false }
      : electronicsTitle(p);
    const mainTitle = titleInfo.text;
    const titleDirAttr = titleInfo.isEnglish ? ' dir="ltr"' : '';
    /* Subscriptions have no `categories`-table subcategory — the
       subcategory column instead holds the service name an admin typed
       (e.g. "netflix"), used as-is to group plans of the same service
       on subscriptions/index.html's filter chips (see that page's
       inline script). */
    const subcatAttr = subcat
      ? ` data-subcategory="${escAttr(subcat.slug)}"`
      : (p.category === 'subscriptions' && p.subcategory)
      ? ` data-subcategory="${escAttr(p.subcategory)}"`
      : '';
    return `<div class="product-card" data-product-url="${url}" data-sb-product-id="${p.id}"${subcatAttr}>
      <div class="${badgeCls}" data-avail-badge="${p.catalog_id}">${badgeTxt}</div>
      <a href="${url}" class="product-img-area" style="text-decoration:none;">
        <img src="${imgSrc}" ${imgFallbackAttrs(p)}alt="${escAttr(name)} — Derradj Shop"
             loading="lazy" decoding="async" width="400" height="400"
             ${IMG_ONERROR}>
      </a>
      <div class="product-info">
        <div class="product-cat-label">${icon} ${escAttr(catAr)}</div>
        <a href="${url}" style="text-decoration:none;color:inherit;">
          <h3 class="product-name"${titleDirAttr}>${esc(mainTitle)}</h3>
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

  /* ── Display-time randomization — Fisher–Yates, non-mutating. Never
     touches the source array (window.SUPABASE_PRODUCTS, the
     sessionStorage cache, or Supabase itself), so admin-configured
     display_order / bestseller_picks order stays intact everywhere
     except the customer-facing card grids built from the copy this
     returns. Exposed on window so books/index.html's own render path
     (which doesn't go through buildCard()) can reuse it instead of
     duplicating the algorithm. ── */
  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  window.shuffleProducts = shuffleArray;

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
  function normalizeBookSortMode(mode) {
    return mode === 'best_selling' ? 'best_selling' : 'manual';
  }

  async function fetchBookSortMode() {
    try {
      const url = SB_URL + '/rest/v1/site_settings?select=value&key=eq.book_sort_mode&limit=1';
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      return normalizeBookSortMode(rows?.[0]?.value?.mode);
    } catch (err) {
      console.warn('[products-loader] book_sort_mode unavailable; using manual order:', err.message || err);
      return 'manual';
    }
  }

  async function fetchBookSales() {
    try {
      const url = SB_URL + '/rest/v1/book_sales_summary?select=product_name,sold';
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      const sales = new Map();
      (rows || []).forEach(row => {
        sales.set(String(row.product_name || '').trim(), Number(row.sold) || 0);
      });
      return sales;
    } catch (err) {
      console.warn('[products-loader] book sales unavailable; using zero sales:', err.message || err);
      return new Map();
    }
  }

  function manualOrderValue(p) {
    return p.display_order ?? Number.MAX_SAFE_INTEGER;
  }

  function sortProductsForBookMode(products, mode, sales) {
    if (mode !== 'best_selling') return products;
    const sortedBooks = products
      .filter(p => p.category === 'books')
      .sort((a, b) => {
        const as = sales.get(String(arName(a) || '').trim()) || 0;
        const bs = sales.get(String(arName(b) || '').trim()) || 0;
        if (as !== bs) return bs - as;

        const ao = manualOrderValue(a);
        const bo = manualOrderValue(b);
        if (ao !== bo) return ao - bo;
        return 0;
      });
    let bookIndex = 0;
    return products.map(p => {
      if (p.category !== 'books') return p;
      return sortedBooks[bookIndex++] || p;
    });
  }

  async function fetchProducts() {
    const SELECT  = 'id,catalog_id,product_name,product_name_ar,product_name_fr,category,subcategory,price,old_price,stock_status,main_image,short_description,slug,keywords,brand,is_active,display_order,show_on_homepage';
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
        entry.name      = arName(p);
        entry.shortName = arName(p);
        entry.price     = p.price;
        entry.available = p.stock_status !== 'out_of_stock';
        if (p.main_image) entry.image = resolveImage(p);
        if (p.slug)       entry.slug  = p.slug;
        entry.supabaseId = p.id;
      } else {
        /* Add new entry */
        window.SHOP_CATALOG.push({
          catalogId:  p.catalog_id,
          name:       arName(p),
          shortName:  arName(p),
          price:      p.price,
          image:      resolveImage(p),
          available:  p.stock_status !== 'out_of_stock',
          supabaseId: p.id,
          slug:       p.slug,
        });
      }
    });
  }

  /* ── Build a DocumentFragment from a list of products in one shot —
     the whole card list is serialized to a string and parsed once via
     <template>, so the final order is fully assembled in memory before
     touching the live grid. Used together with grid.replaceChildren()
     so the grid goes from its initial skeleton straight to the final
     list in a single DOM mutation — never an intermediate/partial
     render, never a second pass. ── */
  function buildCardsFragment(products) {
    const tpl = document.createElement('template');
    tpl.innerHTML = products.map(buildCard).join('');
    return tpl.content;
  }

  /* ── Load-failure message for the electronics/category grid — the
     static SEO fallback now lives only in a <noscript> block next to
     each grid (never inside the live grid itself), so on a genuine
     fetch failure there is nothing real to fall back to in the live
     DOM. Shown only if the live fetch never completes/returns nothing,
     instead of leaving the loading skeleton shimmering forever. ── */
  function showElectronicsLoadError() {
    const msg = '<p class="products-load-error">تعذر تحميل المنتجات، يرجى تحديث الصفحة.</p>';
    const g1 = document.getElementById('homeElectronicsGrid');
    const g2 = document.getElementById('electronicsGrid');
    if (g1) g1.innerHTML = msg;
    if (g2) g2.innerHTML = msg;
  }

  /* ── Render products into homepage or electronics category page ──
     The grid starts out containing only a loading skeleton (see
     index.html/Electronique/index.html) — no real product cards ever
     exist in it before this runs. The full shuffled list is built as
     an in-memory DocumentFragment first, then swapped in with a single
     replaceChildren() call, so visitors only ever see
     skeleton → final shuffled list, never an intermediate render. ── */
  function renderHomepageProducts(products) {
    /* Support both the homepage grid and the Electronique category page grid */
    const grid = document.getElementById('homeElectronicsGrid')
              || document.getElementById('electronicsGrid');
    if (!grid) return;

    /* Only non-books, non-subscriptions go in the electronics/products
       section (subscriptions get their own section — see
       renderHomepageSubscriptions below). Shuffled at display time only —
       the fetch above is still ordered by the admin's display_order,
       untouched in window.SUPABASE_PRODUCTS. */
    const elec = shuffleArray(products.filter(p => p.category !== 'books' && p.category !== 'subscriptions'));
    if (!elec.length) { showElectronicsLoadError(); return; }

    grid.replaceChildren(buildCardsFragment(elec));
  }

  /* ── Render the homepage/category-page subscriptions grid — mirrors
     renderHomepageProducts() above. Respects the per-product
     show_on_homepage admin toggle (defaults true when unset, so
     nothing needs backfilling) — the subscriptions category page grid
     (#subscriptionsGrid) always shows every active subscription
     regardless of that flag, same as how the Electronique page shows
     every active electronics product regardless of its homepage-only
     analog. ── */
  function renderHomepageSubscriptions(products) {
    const homeGrid = document.getElementById('homeSubscriptionsGrid');
    const pageGrid = document.getElementById('subscriptionsGrid');
    if (!homeGrid && !pageGrid) return;

    const all = products.filter(p => p.category === 'subscriptions');

    if (homeGrid) {
      const section = document.getElementById('subscriptions-section');
      const forHome = shuffleArray(all.filter(p => p.show_on_homepage !== false));
      if (forHome.length) {
        homeGrid.replaceChildren(buildCardsFragment(forHome));
        if (section) section.style.display = '';
      } else if (section) {
        section.style.display = 'none';
      }
    }

    if (pageGrid) {
      pageGrid.replaceChildren(all.length ? buildCardsFragment(shuffleArray(all)) : document.createDocumentFragment());
    }
  }

  /* ── Render the homepage books carousel — mirrors
     renderHomepageProducts(); books/index.html keeps its own
     richer search/filter grid and sources from window.SUPABASE_PRODUCTS
     directly instead of going through this generic card builder.
     Shuffled at display time only when book_sort_mode is 'manual' —
     when the admin has turned on best-selling sort, that real-sales
     order is the intended customer-facing feature and must not be
     scrambled by randomization. ── */
  function renderHomepageBooks(products, bookSortMode) {
    const grid = document.getElementById('homeBooksGrid');
    if (!grid) return;

    let books = products.filter(p => p.category === 'books');
    if (!books.length) return;
    if (bookSortMode !== 'best_selling') books = shuffleArray(books);

    grid.replaceChildren(buildCardsFragment(books));
  }

  /* ── Manually-curated "Best-Selling Products" homepage section —
     entirely admin-controlled (admin/bestseller-picks.js), never
     derived from order statistics. Picks + the section's on/off flag
     live in Supabase (bestseller_picks, site_settings) and are fetched
     fresh on every load (not run through the sessionStorage catalog
     cache below) so admin changes show up on the very next page load
     instead of waiting out that cache's TTL. ── */
  async function fetchBestsellerEnabled() {
    try {
      const url = SB_URL + '/rest/v1/site_settings?select=value&key=eq.bestsellers_section_enabled&limit=1';
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      return rows?.[0]?.value?.enabled !== false;
    } catch (err) {
      console.warn('[products-loader] bestsellers_section_enabled unavailable; defaulting to enabled:', err.message || err);
      return true;
    }
  }

  async function fetchBestsellerPicks() {
    try {
      const url = SB_URL + '/rest/v1/bestseller_picks'
        + '?select=display_order,admin_products_catalog!inner(*)'
        + '&admin_products_catalog.is_active=eq.true'
        + '&order=display_order.asc';
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      return (rows || [])
        .map(row => row.admin_products_catalog)
        .filter(Boolean);
    } catch (err) {
      console.warn('[products-loader] bestseller picks unavailable:', err.message || err);
      return [];
    }
  }

  /* ── Bestsellers display order: positions 1-4 follow a fixed
     category pattern (Electronics, then exactly one Book randomly
     placed among positions 2-4, the rest Electronics); position 5
     onward is a plain full shuffle of everything left. This is the
     only storefront section whose curated picks can mix Electronics
     and Books in one list (admin can add either category to
     bestseller_picks), so it's the only place this pattern applies.
     Falls back to a plain shuffle of the whole list when there aren't
     enough eligible items to build the pattern safely (fewer than 3
     Electronics, or no Books) — never duplicates or fabricates
     products to force the shape. ── */
  function composeBestsellerOrder(picks) {
    const electronics = picks.filter(p => p.category !== 'books');
    const books = picks.filter(p => p.category === 'books');

    if (electronics.length < 3 || books.length < 1) {
      return shuffleArray(picks);
    }

    const chosenElectronics = shuffleArray(electronics).slice(0, 3);
    const chosenBook = shuffleArray(books)[0];
    const bookPosition = 1 + Math.floor(Math.random() * 3); // index 1, 2, or 3

    const firstFour = [chosenElectronics[0], null, null, null];
    let elecIdx = 1;
    for (let i = 1; i <= 3; i++) {
      firstFour[i] = i === bookPosition ? chosenBook : chosenElectronics[elecIdx++];
    }

    const usedIds = new Set(firstFour.map(p => p.id));
    const remaining = picks.filter(p => !usedIds.has(p.id));
    return firstFour.concat(shuffleArray(remaining));
  }

  /* ── Render the curated bestsellers section — reuses buildCard(p)
     unchanged so cards are pixel-identical to every other section.
     Hides the whole section (not just an empty grid) when there are
     no picks, per the "hide instead of showing empty" requirement.
     Order composed at display time only — bestseller_picks.display_order
     in Supabase (the admin's curated ranking) is never touched. ── */
  function renderHomepageBestsellers(picks) {
    const section = document.getElementById('bestsellers-section');
    const grid = document.getElementById('homeBestsellersGrid');
    if (!section || !grid) return;

    if (!picks.length) {
      section.style.display = 'none';
      return;
    }

    grid.replaceChildren(buildCardsFragment(composeBestsellerOrder(picks)));
    section.style.display = '';
  }

  /* ── Build SEARCH_PRODUCTS entries for new products ── */
  function extendSearch(products) {
    if (!window.SEARCH_PRODUCTS) return;
    const existingSlugs = new Set(window.SEARCH_PRODUCTS.map(s => s.slug));
    products.forEach(p => {
      if (!p.slug || existingSlugs.has(p.slug)) return;
      const isBook = p.category === 'books';
      /* The raw `subcategory` value (e.g. "power_bank", or free text
         like "Arduino / Composants électroniques" for legacy rows)
         rarely matches what someone actually types — resolve it to the
         real category's name (e.g. "بطاريات محمولة") so subcategory
         search words actually match. */
      const subcat = isBook ? null : categoryBySlug(resolveCategorySlug(p));
      window.SEARCH_PRODUCTS.push({
        name:        arName(p),
        nameEn:      otherName(p),
        nameFr:      p.product_name_fr || '',
        category:    catLabelAr(p.category),
        subcategory: subcat ? subcat.name : (p.subcategory || ''),
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

  /* ── Short-lived sessionStorage cache — this loader runs on every
     single page (home, every product/book page, category pages), and
     without it a visitor browsing a few pages re-downloads the whole
     active catalog from Supabase on every navigation. A few minutes
     of staleness is an acceptable trade for cutting that egress. ── */
  const CATALOG_CACHE_KEY = 'derradj_catalog_v1';
  const CATALOG_CACHE_TTL = 3 * 60 * 1000;
  /* Categories change far less often than stock/price — a longer TTL
     than the product catalog is fine and cuts one more request per
     page on top of it. */
  const CATEGORIES_CACHE_KEY = 'derradj_categories_v1';
  const CATEGORIES_CACHE_TTL = 30 * 60 * 1000;
  function cacheGet(key, ttlMs) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const { t, d } = JSON.parse(raw);
      if (!t || Date.now() - t > ttlMs) return null;
      return d;
    } catch (_) { return null; }
  }
  function cacheSet(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch (_) {}
  }

  /* ── Live stock_status overlay — the cached catalog above can lag up
     to CATALOG_CACHE_TTL behind Supabase (e.g. right after an admin
     flips a product out of stock), while the product detail page has
     no cache and is always live. That gap is exactly what let the
     homepage badge/Add-to-cart disagree with the product page. Fetch
     just catalog_id+stock_status (tiny payload) on every cache hit so
     availability is always current regardless of cache age, without
     giving up caching for the heavier fields. ── */
  async function fetchLiveStockStatuses() {
    try {
      const url = SB_URL + '/rest/v1/admin_products_catalog?select=catalog_id,stock_status&is_active=eq.true';
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      const map = new Map();
      rows.forEach(r => { if (r.catalog_id != null) map.set(r.catalog_id, r.stock_status); });
      return map;
    } catch (err) {
      console.warn('[products-loader] live stock_status refresh failed:', err.message || err);
      return null;
    }
  }

  /* ── Bestsellers loader — kicked off independently of load() below
     (not awaited after the electronics/books catalog fetch) so its own
     two small requests aren't stuck behind the larger catalog fetch
     chain and the homepage section fills in as early as possible.
     fetchBestsellerEnabled()/fetchBestsellerPicks() already swallow
     their own errors and resolve to safe defaults (enabled=true,
     picks=[]), so a failure here still resolves to hiding the section
     via renderHomepageBestsellers([]) rather than leaving the skeleton
     stuck forever. ── */
  async function loadBestsellers() {
    const [bsEnabled, bsPicks] = await Promise.all([fetchBestsellerEnabled(), fetchBestsellerPicks()]);
    renderHomepageBestsellers(bsEnabled ? bsPicks : []);
  }

  /* ── Main loader (electronics + books catalog) ── */
  async function load() {
    try {
      let categories = cacheGet(CATEGORIES_CACHE_KEY, CATEGORIES_CACHE_TTL);
      if (!Array.isArray(categories) || !categories.length) {
        categories = await fetchCategories();
        if (categories.length) cacheSet(CATEGORIES_CACHE_KEY, categories);
      }
      window.SUPABASE_CATEGORIES = categories;

      let cached = cacheGet(CATALOG_CACHE_KEY, CATALOG_CACHE_TTL);
      let products, bookSortMode;
      if (!cached || !Array.isArray(cached.products) || !cached.products.length) {
        products = await fetchProducts();
        if (!Array.isArray(products) || !products.length) { showElectronicsLoadError(); return; }
        bookSortMode = await fetchBookSortMode();
        const bookSales = bookSortMode === 'best_selling' ? await fetchBookSales() : new Map();
        products = sortProductsForBookMode(products, bookSortMode, bookSales);
        cacheSet(CATALOG_CACHE_KEY, { products, bookSortMode });
      } else {
        products = cached.products;
        bookSortMode = cached.bookSortMode;
        const liveStock = await fetchLiveStockStatuses();
        if (liveStock) {
          products.forEach(p => {
            if (liveStock.has(p.catalog_id)) p.stock_status = liveStock.get(p.catalog_id);
          });
        }
      }

      window.SUPABASE_PRODUCTS = products;

      extendCatalog(products);
      renderHomepageProducts(products);
      renderHomepageBooks(products, bookSortMode);
      renderHomepageSubscriptions(products);

      /* Extend search after search-products.js has run */
      if (window.SEARCH_PRODUCTS) {
        extendSearch(products);
      } else {
        document.addEventListener('search-products-ready', () => extendSearch(products));
      }

      /* Let pages with their own render logic (books/index.html) know
         the live catalog is ready, instead of going through buildCard(). */
      document.dispatchEvent(new CustomEvent('derradj:catalog-loaded', { detail: { products, bookSortMode } }));

    } catch (err) {
      console.warn('[products-loader] Failed to load Supabase products:', err.message);
      showElectronicsLoadError();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { loadBestsellers(); load(); });
  } else {
    loadBestsellers();
    load();
  }
})();
