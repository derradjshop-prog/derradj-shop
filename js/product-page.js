/* ==========================================================
   product-page.js — Derradj Shop
   Browser-side product page hydration. Used by both:
     - /product/index.html        (legacy ?slug=/?id= fallback)
     - /product/{slug}/index.html (pre-rendered static pages —
       reads window.PRODUCT_SLUG set inline by the generator)
   Fetches the live product from Supabase and refreshes the
   page via ProductTemplate.buildProductView(), then wires up
   interactive bits (gallery, lightbox, cart, related products).
   ========================================================== */
(function () {
  'use strict';

  const SB_URL = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk';

  const { esc, escAttr, buildProductView, pickNames } = window.ProductTemplate;

  /* Mirrors js/products-loader.js's subscriptionOrderMessage() — same
     WhatsApp order-message wording wherever a subscription card
     appears (related products, other plans). */
  function subscriptionOrderMessage(p, name) {
    const fmt = n => Number(n).toLocaleString('en-US');
    return `السلام عليكم، أريد طلب:\n${name}${p.duration ? ' — ' + p.duration : ''}\nالسعر: ${fmt(p.price)} دج`;
  }

  /* ── WhatsApp CTA on related-product / other-plan cards ──
     Those cards are themselves one big `<a class="rp-card">` linking
     to the product page, so a real nested `<a href="wa.me/...">` for
     the WhatsApp action isn't valid HTML (nested anchors) — a plain
     [data-wa-href] element + this one delegated handler opens the
     chat in a new tab instead, mirroring how [data-add-to-cart]
     (cart.js) is delegated from document for the exact same reason. */
  document.addEventListener('click', function (e) {
    const el = e.target.closest('[data-wa-href]');
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(el.dataset.waHref, '_blank', 'noopener,noreferrer');
  });

  /* ── Same admin_products_catalog → book-shape mapping the build-time
     generator uses (scripts/generate-product-pages.js's toBookRow),
     minus the filesystem check — the browser can't stat local files,
     so it optimistically prefers the webp sibling and relies on the
     existing onerror fallback if it doesn't exist. ── */
  function mapToBookShape(p) {
    /* Always serve the deterministic local cover — never Supabase
       Storage, which is uncached and was the dominant egress source. */
    const image = p.slug
      ? location.origin + '/books/' + encodeURIComponent(p.slug) + '/main.webp'
      : (p.main_image || null);
    return {
      id: p.catalog_id,
      title: p.product_name,
      titleEn: p.product_name_ar || null,
      author: p.author || null,
      translator: p.translator || null,
      year: p.year || null,
      category: p.subcategory || null,
      price: p.price,
      image,
      url: (p.slug || '') + '/',
      available: p.stock_status !== 'out_of_stock',
      description: p.short_description || null,
      full_description: p.full_description || null,
      seo_title: p.seo_title || null,
      seo_description: p.seo_description || null,
      keywords: p.keywords || null,
      gallery_images: Array.isArray(p.gallery_images) ? p.gallery_images : [],
      brand: p.brand || null,
    };
  }

  function setMeta(id, val) {
    const el = document.getElementById(id);
    if (el && val) {
      el.content !== undefined ? (el.content = val) : (el.textContent = val);
    }
  }

  function applyMeta(meta) {
    setMeta('pageTitle', meta.title);
    document.title = meta.title;
    const canon = document.getElementById('canonical');
    if (canon) canon.href = meta.canonical;
    setMeta('metaDesc', meta.description);
    setMeta('metaKeys', meta.keywords);
    setMeta('ogTitle', meta.ogTitle);
    setMeta('ogDesc', meta.ogDescription);
    setMeta('ogUrl', meta.ogUrl);
    setMeta('ogImg', meta.ogImage);
    setMeta('ogImgAlt', meta.ogImageAlt);
    setMeta('twTitle', meta.twitterTitle);
    setMeta('twDesc', meta.twitterDescription);
    setMeta('twImg', meta.twitterImage);
    setMeta('twImgAlt', meta.twitterImageAlt);
  }

  async function loadProduct() {
    const params = new URLSearchParams(window.location.search);
    const presetSlug = window.PRODUCT_SLUG || null;
    const slug = presetSlug || params.get('slug') || params.get('id');

    if (!slug) {
      showError('لم يتم تحديد المنتج', 'الرابط المطلوب لا يحتوي على slug المنتج.');
      return;
    }

    try {
      const field = !presetSlug && params.get('id') && !params.get('slug') ? 'id' : 'slug';
      /* Explicit column list — this fetch fires on every single visit to
         every product/book page (the static HTML is already pre-rendered;
         this is just a live refresh), so select(*) here meant re-pulling
         every text/gallery column on every pageview site-wide. */
      const SELECT = 'id,catalog_id,product_name,product_name_ar,product_name_fr,category,subcategory,price,old_price,stock_status,main_image,short_description,full_description,seo_title,seo_description,keywords,gallery_images,brand,slug,author,translator,year,updated_at,duration,activation_method,warranty_info';
      const apiUrl = `${SB_URL}/rest/v1/admin_products_catalog?${field}=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=${SELECT}&limit=1`;

      const res = await fetch(apiUrl, {
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const [product] = await res.json();

      if (!product) {
        showError('المنتج غير موجود', 'قد يكون المنتج محذوفاً أو الرابط غير صحيح.');
        return;
      }

      renderProduct(product);
    } catch (err) {
      /* Pre-rendered static pages already show real content —
         only show the spinner/error fallback when nothing is on the page yet. */
      if (!presetSlug) showError('خطأ في التحميل', 'تعذّر تحميل المنتج. يرجى المحاولة مرة أخرى.');
      console.error('[product page]', err);
    }
  }

  function renderProduct(p) {
    const isBook = p.category === 'books';
    const view = isBook && window.BookTemplate
      ? window.BookTemplate.buildBookView(mapToBookShape(p))
      : buildProductView(p);

    applyMeta(view.meta);
    document.getElementById('pdContent').innerHTML = view.bodyHtml;

    if (view.isSubscription) loadOtherPlans(view.slug, view.subcategory);
    loadRelatedProducts(view.slug, view.catalogId);
    wireInteractions(view, p);

    /* ── Register product in SHOP_CATALOG if not there yet ── */
    if (view.catalogId && window.SHOP_CATALOG) {
      const exists = window.SHOP_CATALOG.find(c => c.catalogId === view.catalogId);
      if (!exists) {
        window.SHOP_CATALOG.push({
          catalogId: view.catalogId,
          name: view.productName,
          shortName: view.productName,
          price: view.price,
          image: view.mainImage || '',
          available: view.isAvail,
          supabaseId: view.supabaseId,
          slug: view.slug,
          category: p.category,
        });
      }
    }
  }

  function wireInteractions(view, p) {
    /* ── "Order Now" — add product to cart then redirect ──
       Guarded against stock: the button is rendered disabled when
       out of stock, but this guard covers it defensively too. */
    const orderNowBtn = document.getElementById('pdOrderNowBtn');
    if (orderNowBtn && view.catalogId) {
      orderNowBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!view.isAvail) return;
        try {
          localStorage.setItem('derradj_cart', JSON.stringify([{ catalogId: view.catalogId, qty: 1 }]));
          localStorage.setItem('derradj_cart_ts', String(Date.now()));
        } catch (_) {}
        window.location.href = '/ordre/';
      });
    }

    /* ── Gallery thumbnail switching + lightbox ── */
    const mainImg = document.getElementById('pdMainImg');
    const galleryEl = document.getElementById('pdGallery');
    let currentZoomIdx = 0;
    const allImgs = view.allImgs;

    if (galleryEl) {
      galleryEl.addEventListener('click', e => {
        const thumb = e.target.closest('.product-thumb');
        if (!thumb) return;
        const newSrc = thumb.dataset.src;
        /* Ensure the clicked thumb's <img> is loaded (may still be placeholder). */
        const thumbImg = thumb.querySelector('img');
        if (thumbImg && thumbImg.dataset && thumbImg.dataset.src && thumbImg.src !== thumbImg.dataset.src) {
          thumbImg.src = thumbImg.dataset.src;
          thumbImg.removeAttribute('data-src');
        }
        if (mainImg) mainImg.src = newSrc;
        galleryEl.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        const idx = allImgs.indexOf(newSrc);
        currentZoomIdx = idx < 0 ? 0 : idx;
      });

      /* Lazy-load thumbnail images only when they're near the viewport.
         This prevents downloading full-size gallery images on page load
         while preserving the existing UX. */
      try {
        const thumbImgs = Array.from(galleryEl.querySelectorAll('.product-thumb img'));
        if ('IntersectionObserver' in window && thumbImgs.length) {
          const io = new IntersectionObserver((entries, obs) => {
            entries.forEach(ent => {
              if (!ent.isIntersecting) return;
              const img = ent.target;
              const real = img.dataset && img.dataset.src;
              if (real && img.src !== real) img.src = real;
              if (img.dataset) img.removeAttribute('data-src');
              obs.unobserve(img);
            });
          }, { rootMargin: '200px 0px' });
          thumbImgs.forEach(img => { if (img.dataset && img.dataset.src) io.observe(img); });
        } else {
          /* Fallback: load thumbs during idle to avoid blocking critical
             resources on older browsers without IntersectionObserver. */
          if (window.requestIdleCallback) {
            requestIdleCallback(() => thumbImgs.forEach(img => { if (img.dataset && img.dataset.src) img.src = img.dataset.src; }));
          } else {
            setTimeout(() => thumbImgs.forEach(img => { if (img.dataset && img.dataset.src) img.src = img.dataset.src; }), 1000);
          }
        }
      } catch (err) {
        console.warn('[product-page] thumb lazy-loader failed:', err && err.message ? err.message : err);
      }
    }

    const modal = document.getElementById('pdZoomModal');
    const zoomImg = document.getElementById('pdZoomImg');

    function openZoom(idx) {
      currentZoomIdx = Math.max(0, Math.min(idx, allImgs.length - 1));
      zoomImg.src = allImgs[currentZoomIdx];
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    function closeZoom() {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
    function zoomNav(dir) {
      currentZoomIdx = (currentZoomIdx + dir + allImgs.length) % allImgs.length;
      zoomImg.src = allImgs[currentZoomIdx];
    }

    if (mainImg) {
      mainImg.parentElement.addEventListener('click', e => {
        if (e.target.closest('.zoom-hint') || e.target === mainImg || e.target === mainImg.parentElement) {
          openZoom(currentZoomIdx);
        }
      });
    }

    const prevBtn = document.getElementById('pdZoomPrev');
    const nextBtn = document.getElementById('pdZoomNext');
    if (prevBtn && nextBtn) {
      if (allImgs.length <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
      } else {
        prevBtn.addEventListener('click', e => { e.stopPropagation(); zoomNav(-1); });
        nextBtn.addEventListener('click', e => { e.stopPropagation(); zoomNav(1); });
      }
    }
    const zoomCloseBtn = document.getElementById('pdZoomClose');
    if (zoomCloseBtn) zoomCloseBtn.addEventListener('click', closeZoom);
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeZoom(); });
    document.addEventListener('keydown', e => {
      if (!modal || !modal.classList.contains('active')) return;
      if (e.key === 'Escape') closeZoom();
      if (e.key === 'ArrowLeft') zoomNav(1);
      if (e.key === 'ArrowRight') zoomNav(-1);
    });
  }

  /* products-loader.js fetches (and caches) the same active-product list
     this widget needs, in parallel with this page's own load. Waiting
     briefly for it — instead of racing window.SUPABASE_PRODUCTS and
     firing a fresh 50-row fetch whenever we lose the race — avoids a
     duplicate Supabase read on a meaningful fraction of page loads. */
  function getCatalogProducts(timeoutMs) {
    return new Promise(resolve => {
      if (window.SUPABASE_PRODUCTS && window.SUPABASE_PRODUCTS.length > 0) {
        resolve(window.SUPABASE_PRODUCTS.slice());
        return;
      }
      let done = false;
      const finish = products => {
        if (done) return;
        done = true;
        document.removeEventListener('derradj:catalog-loaded', onLoaded);
        resolve(products);
      };
      const onLoaded = e => finish((e.detail && e.detail.products) || window.SUPABASE_PRODUCTS || []);
      document.addEventListener('derradj:catalog-loaded', onLoaded);
      setTimeout(() => finish(window.SUPABASE_PRODUCTS && window.SUPABASE_PRODUCTS.length > 0 ? window.SUPABASE_PRODUCTS : null), timeoutMs);
    });
  }

  /* ── "خطط أخرى" — other plans of the same subscription service
     (e.g. Netflix 1-screen / 2-screens / 5-screens), matched by the
     shared `subcategory` value (the service name/slug an admin types
     when adding each plan as its own catalog row — see
     admin/products-manager.js). Only rendered on subscription product
     pages; a no-op when the product has no subcategory set or no
     sibling plans exist. ── */
  async function loadOtherPlans(currentSlug, subcategory) {
    const container = document.getElementById('otherPlans');
    if (!container || !subcategory) return;

    try {
      const products = await getCatalogProducts(2500);
      const pool = products && products.length ? products : window.SUPABASE_PRODUCTS || [];
      const siblings = pool.filter(p =>
        p.category === 'subscriptions' &&
        p.subcategory === subcategory &&
        p.slug !== currentSlug
      );
      if (!siblings.length) return;

      const cardsHtml = siblings.map(p => {
        const url = `/product/${encodeURIComponent(p.slug)}/`;
        const isAvail = p.stock_status !== 'out_of_stock';
        const imgSrc = p.slug ? `/subscriptions/${encodeURIComponent(p.slug)}/main.webp` : '/Logo.jpg';
        const fmt = n => Number(n).toLocaleString('en-US');
        let priceRow = `<span class="rp-price">${fmt(p.price)} دج</span>`;
        let discTag = '';
        if (p.old_price) {
          priceRow += ` <span class="rp-old-price">${fmt(p.old_price)} دج</span>`;
          const pct = Math.round((1 - p.price / p.old_price) * 100);
          if (pct > 0) discTag = `<span class="rp-discount">-${pct}%</span>`;
        }
        const stockBadgeHtml = isAvail
          ? `<span class="rp-stock rp-avail">✅ متوفر</span>`
          : `<span class="rp-stock rp-unavail">🔴 نفذت الكمية</span>`;
        const rpName = pickNames(p).ar || p.product_name;
        /* Other plans are always subscriptions — WhatsApp ordering only,
           same as everywhere else this category appears (see
           [data-wa-href] delegated handler below). */
        const cartBtnHtml = isAvail
          ? `<span class="rp-btn rp-add-cart" data-wa-href="${escAttr('https://wa.me/213542949967?text=' + encodeURIComponent(subscriptionOrderMessage(p, rpName)))}">📱 اطلب عبر الواتساب</span>`
          : `<span class="rp-btn rp-add-cart rp-add-cart--disabled">🔴 نفذت الكمية</span>`;
        return `<a href="${url}" class="rp-card">
          <img src="${escAttr(imgSrc)}" alt="${escAttr(rpName)} — Derradj Shop"
               class="rp-img" loading="lazy" onerror="this.src='/Logo.jpg'">
          <div class="rp-body">
            <div class="rp-name">${esc(rpName)}</div>
            <div class="rp-price-row">${priceRow}${discTag}</div>
            ${stockBadgeHtml}
            ${cartBtnHtml}
          </div>
        </a>`;
      }).join('');

      container.innerHTML = `
        <div class="rp-section">
          <h2 class="rp-title">💎 خطط أخرى لنفس الخدمة</h2>
          <div class="rp-outer" style="overflow-x:auto;">
            <div class="rp-track" style="animation:none;transform:none;">${cardsHtml}</div>
          </div>
        </div>
      `;
    } catch (err) {
      console.warn('[other plans]', err.message);
    }
  }

  async function loadRelatedProducts(currentSlug, currentCatalogId) {
    const container = document.getElementById('relatedProducts');
    if (!container) return;

    try {
      let products = await getCatalogProducts(2500);

      if (!products) {
        const HEADERS = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
        const SELECT = 'id,catalog_id,product_name,product_name_ar,category,price,old_price,stock_status,main_image,slug';
        const BASE = SB_URL + `/rest/v1/admin_products_catalog?select=${SELECT}&is_active=eq.true&limit=50`;
        let res = await fetch(BASE + '&order=display_order.asc.nullslast,created_at.desc', { headers: HEADERS });
        if (!res.ok && res.status === 400) {
          res = await fetch(BASE + '&order=created_at.desc', { headers: HEADERS });
        }
        if (!res.ok) return;
        products = await res.json();
      } else {
        products = products.slice();
      }

      products = products.filter(p =>
        p.slug !== currentSlug &&
        (currentCatalogId == null || p.catalog_id !== currentCatalogId)
      );
      if (products.length < 2) return;

      for (let i = products.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [products[i], products[j]] = [products[j], products[i]];
      }

      const count = Math.min(products.length, 8 + Math.floor(Math.random() * 5));
      const selected = products.slice(0, count);

      function buildRpCard(p) {
        const isBook = p.category === 'books';
        const url = `${isBook ? '/books/' : '/product/'}${encodeURIComponent(p.slug)}/`;
        const isAvail = p.stock_status !== 'out_of_stock';
        let imgSrc = p.main_image || '/Logo.jpg';
        if (isBook) {
          imgSrc = p.slug ? `/books/${encodeURIComponent(p.slug)}/main.webp` : imgSrc;
        } else if (p.category === 'subscriptions') {
          imgSrc = p.slug ? `/subscriptions/${encodeURIComponent(p.slug)}/main.webp` : imgSrc;
        } else {
          /* subcategory → folder name: power_bank/smart_watch use
             underscores in Supabase but hyphens on disk. Free-text values
             (e.g. "Arduino / Composants électroniques") can contain "/"
             which is illegal in a path segment — sanitize the same way
             js/product-template.js and js/products-loader.js do, or this
             image 404s locally and falls back to Supabase Storage on
             every render. */
          const SUBCATEGORY_DIR = { power_bank: 'power-bank', smart_watch: 'smart-watch' };
          const sub = String(SUBCATEGORY_DIR[p.subcategory] || p.subcategory || 'other')
            .replace(/[\/\\?%*:|"<>]/g, '-').trim() || 'other';
          const slug = p.slug || String(p.catalog_id || p.id || '');
          function filenameFromUrl(u) { try { return String(u || '').split('/').filter(Boolean).pop() || 'main.webp'; } catch { return 'main.webp'; } }
          const mainFilename = (p.main_image && filenameFromUrl(p.main_image)) || 'main.webp';
          imgSrc = `/Electronique/${encodeURIComponent(sub)}/${encodeURIComponent(slug)}/${encodeURIComponent(mainFilename)}`;
        }
        const fmt = n => Number(n).toLocaleString('en-US');

        let priceRow = `<span class="rp-price">${fmt(p.price)} دج</span>`;
        let discTag = '';
        if (p.old_price) {
          priceRow += ` <span class="rp-old-price">${fmt(p.old_price)} دج</span>`;
          const pct = Math.round((1 - p.price / p.old_price) * 100);
          if (pct > 0) discTag = `<span class="rp-discount">-${pct}%</span>`;
        }

        const stockBadgeHtml = isAvail
          ? `<span class="rp-stock rp-avail">✅ متوفر</span>`
          : `<span class="rp-stock rp-unavail">🔴 نفذت الكمية</span>`;

        const rpName = isBook ? p.product_name : pickNames(p).ar;

        /* أضف إلى السلة مباشرة من البطاقة — يعتمد على نفس نظام
           التفويض بالحدث في cart.js ([data-add-to-cart] على مستوى
           document)، فلا حاجة لأي منطق سلة إضافي هنا. Digital
           subscriptions never enter the cart — WhatsApp only (see
           [data-wa-href] delegated handler below), same rule as the
           product-details page and every other card on the site. */
        const cartBtnHtml = p.category === 'subscriptions'
          ? (isAvail
              ? `<span class="rp-btn rp-add-cart" data-wa-href="${escAttr('https://wa.me/213542949967?text=' + encodeURIComponent(subscriptionOrderMessage(p, rpName)))}">📱 اطلب عبر الواتساب</span>`
              : `<span class="rp-btn rp-add-cart rp-add-cart--disabled">🔴 نفذت الكمية</span>`)
          : (isAvail && p.catalog_id)
          ? `<span class="rp-btn rp-add-cart" data-add-to-cart="${p.catalog_id}">🛒 أضف إلى السلة</span>`
          : `<span class="rp-btn rp-add-cart rp-add-cart--disabled">🔴 نفذت الكمية</span>`;

        const canFallback = !isBook && p.category !== 'subscriptions' && p.main_image;
        return `<a href="${url}" class="rp-card">
          <img src="${escAttr(imgSrc)}" ${canFallback ? `data-fallback="${escAttr(p.main_image)}" ` : ''}alt="${escAttr(rpName)} — Derradj Shop"
               class="rp-img" loading="lazy" onerror="if(this.dataset.fallback&amp;&amp;this.src!==this.dataset.fallback){this.src=this.dataset.fallback}else{this.src='/Logo.jpg'}">
          <div class="rp-body">
            <div class="rp-name">${esc(rpName)}</div>
            <div class="rp-price-row">${priceRow}${discTag}</div>
            ${stockBadgeHtml}
            ${cartBtnHtml}
          </div>
        </a>`;
      }

      const cardsHtml = selected.map(buildRpCard).join('');

      container.innerHTML = `
        <div class="rp-section">
          <h2 class="rp-title">🎯 منتجات قد تعجبك</h2>
          <div class="rp-outer" id="rpOuter">
            <div class="rp-track" id="rpTrack">
              ${cardsHtml}${cardsHtml}
            </div>
          </div>
        </div>
      `;

      const outer = document.getElementById('rpOuter');
      const track = document.getElementById('rpTrack');
      if (!outer || !track) return;

      let isPaused = false;
      let pos = 0;
      const SPEED = 0.6;

      outer.addEventListener('mouseenter', () => { isPaused = true; });
      outer.addEventListener('mouseleave', () => { isPaused = false; });

      let touchStartX = 0;
      let touchStartPos = 0;
      outer.addEventListener('touchstart', e => {
        isPaused = true;
        touchStartX = e.touches[0].clientX;
        touchStartPos = pos;
      }, { passive: true });
      outer.addEventListener('touchmove', e => {
        pos = Math.max(0, touchStartPos + (touchStartX - e.touches[0].clientX));
        outer.scrollLeft = pos;
      }, { passive: true });
      outer.addEventListener('touchend', () => {
        pos = outer.scrollLeft;
        isPaused = false;
      }, { passive: true });

      (function animate() {
        if (!isPaused) {
          pos += SPEED;
          const half = track.scrollWidth / 2;
          if (pos >= half) pos -= half;
          outer.scrollLeft = pos;
        }
        requestAnimationFrame(animate);
      })();
    } catch (err) {
      console.warn('[related products]', err.message);
    }
  }

  function showError(heading, detail) {
    document.getElementById('pdContent').innerHTML = `
      <div class="pd-error">
        <h2>⚠️ ${heading}</h2>
        <p>${detail}</p>
        <a href="/" class="btn-order-card">العودة للرئيسية</a>
      </div>
    `;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadProduct);
  } else {
    loadProduct();
  }
})();
