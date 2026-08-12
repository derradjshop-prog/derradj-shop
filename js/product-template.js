/* ==========================================================
   product-template.js — Derradj Shop
   Isomorphic (Node + browser) product page renderer.
   Pure functions only — no DOM / window access — so the
   exact same markup is produced by:
     - scripts/generate-product-pages.js (static HTML at build time)
     - js/product-page.js (live refresh in the browser)
   ========================================================== */
(function (root) {
  'use strict';

  const SITE_URL = 'https://derradjshop.com';

  /* ── Single source of truth for the shipping-duration message.
     book-template.js reuses these via the ProductTemplate API
     instead of hardcoding its own copy — update only here. ── */
  const SHIPPING_NOTICE_AR = 'التوصيل خلال 24 ساعة إلى 48 ساعة كحد أقصى لجميع ولايات الجزائر الـ58.';
  const SHIPPING_NOTICE_AR_SHORT = 'من 24 إلى 48 ساعة كحد أقصى لجميع ولايات الجزائر الـ58';
  const SHIPPING_NOTICE_EN = 'Delivery within 24–48 hours (maximum) across all 58 Algerian wilayas.';

  function esc(v) {
    return String(v == null ? '' : v)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }
  function escAttr(v) { return esc(v).replaceAll('"', '&quot;'); }

  function fmtPrice(n) { return Number(n).toLocaleString('en-US'); }

  /* ── Trims to a Google-safe SERP snippet length without cutting a
     word in half. Only meta name="description" needs this — og:/
     twitter:/JSON-LD description keep the full text since link
     previews and rich results have more room. ── */
  function truncateAtWord(str, max) {
    if (!str || str.length <= max) return str;
    const cut = str.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
  }

  /* ── Ensures a keywords string always covers the product's own
     name and "الجزائر" (shoppers rarely search a product name
     without it), while preserving whatever the admin already
     entered — appends only the terms that are missing instead of
     overwriting. ── */
  function buildKeywords(existing, ...mustHave) {
    const parts = String(existing || '').split(',').map(s => s.trim()).filter(Boolean);
    const seen = new Set(parts.map(s => s.toLowerCase()));
    for (const term of [...mustHave, 'الجزائر']) {
      if (!term) continue;
      const t = String(term).trim();
      if (t && !seen.has(t.toLowerCase())) { parts.push(t); seen.add(t.toLowerCase()); }
    }
    return parts.join(', ');
  }

  function stockBadge(status) {
    if (status === 'out_of_stock') return `<span class="pd-stock unavail">🔴 نفذت الكمية</span>`;
    return `<span class="pd-stock avail">🟢 متوفر — يمكن الطلب الآن</span>`;
  }

  function catLabelAr(cat) {
    const m = {
      books: 'كتب', electronics: 'إلكترونيات', earbuds: 'سماعات',
      laptop: 'إكسسوارات لابتوب', smart_watch: 'ساعات ذكية',
      power_bank: 'بطاريات محمولة', other: 'منتجات أخرى',
    };
    return m[cat] || cat || 'منتجات';
  }

  /* ── `product_name` / `product_name_ar` aren't consistently
     Arabic-vs-English per row (legacy data entry varies), so detect
     by script rather than trusting the field name — this is what
     drives the H1, image alt text and breadcrumb to always show the
     Arabic name regardless of which column it landed in. ── */
  const AR_RE = /[؀-ۿ]/;
  function isArabic(s) { return AR_RE.test(s || ''); }
  function pickNames(p) {
    const a = p.product_name, b = p.product_name_ar;
    const aIsAr = isArabic(a), bIsAr = isArabic(b);
    if (aIsAr && !bIsAr) return { ar: a, other: b || null };
    if (!aIsAr && bIsAr) return { ar: b, other: a || null };
    if (aIsAr && bIsAr) return { ar: a, other: null }; // both Arabic, no distinct English/French name
    return { ar: b || a, other: null };
  }

  /* ── Build the full view-model for a product row from
     `admin_products_catalog` — used to fill <head> meta tags,
     JSON-LD, and the visible product markup. ── */
  function buildProductView(p) {
    const slug      = p.slug || String(p.id || p.catalog_id || '');
    const isAvail   = p.stock_status !== 'out_of_stock';
    const pageUrl   = `${SITE_URL}/product/${encodeURIComponent(slug)}/`;
    const galleryRaw = Array.isArray(p.gallery_images) ? p.gallery_images.filter(Boolean) : [];
    const isElectronics = p.category !== 'books';

    /* For electronics (non-books) serve images from the local
       repository under /Electronique/{subcategory}/{slug}/. The
       main image is always `main.webp` in that folder; gallery
       images reuse their original filename (last path segment).
       For books we preserve the existing behaviour. */
    const subdir = String(p.subcategory || 'other');
    const folderBase = (isElectronics
      ? `/Electronique/${encodeURIComponent(subdir)}/${encodeURIComponent(slug)}`
      : null);

    function filenameFromUrl(u) {
      try { return String(u || '').split('/').filter(Boolean).pop() || '';} catch { return ''; }
    }

    /* Determine main filename: prefer the filename present in the
       stored `p.main_image` (keeps png/jpg when that's what exists),
       otherwise prefer `main.webp`. */
    const mainFilename = (p.main_image && filenameFromUrl(p.main_image)) || 'main.webp';

    const gallery = (isElectronics)
      ? galleryRaw.map(u => `${folderBase}/${encodeURIComponent(filenameFromUrl(u) || 'gallery-1.png')}`)
      : galleryRaw.slice();

    /* Visible main image (relative/local path for repo). For
       electronics use the determined filename under the product
       folder; otherwise fall back to supplied main_image / first
       gallery image / logo. */
    const imgSrc = isElectronics
      ? `${folderBase}/${encodeURIComponent(mainFilename)}`
      : (p.main_image || gallery[0] || `${SITE_URL}/Logo.jpg`);

    const allImgs = [imgSrc, ...gallery.filter(u => u && u !== imgSrc)];
    const catAr     = catLabelAr(p.category);
    const { ar: arName, other: otherName } = pickNames(p);
    const titleNameRaw = (p.seo_title && p.seo_title.trim()) || arName;
    const titleName    = String(titleNameRaw || '').replace(/\s*\|\s*Derradj Shop\s*$/i, '').trim();
    const title        = `${titleName || arName} | توصيل لكل الجزائر - Derradj Shop`;
    /* og/twitter titles have more room than the SERP <title> — fold
       in the English/French name when one exists, mirroring how
       book-template.js's ogTitle includes titleEn. */
    const ogTitle    = `${arName}${otherName ? ' | ' + otherName : ''} | Derradj Shop`;
    /* Meta description: prefer admin-entered seo_description; otherwise
       build one from short_description that naturally mentions the
       product name and "الجزائر" — never blank, never the homepage's copy. */
    const fallbackDesc = p.short_description
      ? `${p.short_description} — اطلب ${arName} من Derradj Shop مع توصيل سريع لكل الجزائر.`
      : `اطلب ${arName} من Derradj Shop بأفضل سعر، متوفر الآن مع توصيل سريع لجميع ولايات الجزائر.`;
    const fullDesc  = (p.seo_description && p.seo_description.trim()) || fallbackDesc;
    const desc      = truncateAtWord(fullDesc, 155);
    const imgAlt    = `${arName} — Derradj Shop`;
    const schemaName = arName;

    /* ── Price HTML ── */
    let priceHtml = `<span class="price-current${p.old_price ? ' price-sale' : ''}">
      <span class="price-value">
        <span class="price-currency">دج</span>
        <span class="price-amount">${fmtPrice(p.price)}</span>
      </span>
    </span>`;
    if (p.old_price) {
      priceHtml += `<span class="price-old">
        <span class="price-value">
          <span class="price-currency">دج</span>
          <span class="price-amount">${fmtPrice(p.old_price)}</span>
        </span>
      </span>`;
      const pct = Math.round((1 - p.price / p.old_price) * 100);
      if (pct > 0) priceHtml += `<span class="discount-tag">-${pct}%</span>`;
    }

    /* ── Gallery thumbs ──
       Use a tiny inline placeholder for non-active thumbs so the
       browser does not immediately download every full-size gallery
       image. The real URL remains available in `data-src` and is
       populated by an IntersectionObserver in product-page.js when
       the thumb becomes relevant (visible / near-viewport) or on
       user interaction. The active (first) thumb keeps its real
       `src` for no-JS crawlers and immediate visual correctness. */
    const __PLACEHOLDER_1PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const thumbsHtml = allImgs.length > 1
      ? `<div class="product-thumbnails-vertical" id="pdGallery">
          ${allImgs.map((u, i) =>
            `<div class="product-thumb${i === 0 ? ' active' : ''}" data-src="${escAttr(u)}">
               <img src="${i === 0 ? escAttr(u) : __PLACEHOLDER_1PX}"
                    data-src="${escAttr(u)}"
                    alt="${escAttr(imgAlt)}"
                    ${i === 0 ? '' : 'loading="lazy"'} decoding="async">
             </div>`
          ).join('')}
        </div>`
      : '';

    /* ── Cart button ── */
    const cartBtn = isAvail && p.catalog_id
      ? `<button class="btn-add-cart-sb" id="pdAddCart" data-add-to-cart="${p.catalog_id}">🛒 أضف إلى السلة</button>`
      : `<button class="btn-add-cart-sb" disabled>🔴 نفذت الكمية</button>`;

    /* ── Buy-now button — disabled (no live link) when out of stock ── */
    const buyNowBtn = isAvail
      ? `<a href="/ordre/" class="btn-buy-now-sb" id="pdOrderNowBtn">🛒 اطلب الآن</a>`
      : `<button class="btn-buy-now-sb" id="pdOrderNowBtn" disabled style="opacity:.6;cursor:not-allowed;">🔴 نفذت الكمية</button>`;

    /* ── WhatsApp contact button ── */
    const waMsg = encodeURIComponent('مرحبا، أريد الاستفسار عن هذا المنتج: ' + arName);
    const waBtn = `<a href="https://wa.me/213542949967?text=${waMsg}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-sb"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> الطلب عبر الواتساب</a>`;

    /* ── Structured data ── */
    const absoluteAllImgs = allImgs.map(u => (/^https?:\/\//.test(u) ? u : SITE_URL + u));

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': schemaName,
      'description': fullDesc,
      'image': absoluteAllImgs,
      'sku': String(p.catalog_id || p.slug || ''),
      'url': pageUrl,
      'brand': { '@type': 'Brand', 'name': p.brand || 'Derradj Shop' },
      'areaServed': 'DZ',
      'offers': {
        '@type': 'Offer',
        'price': String(p.price),
        'priceCurrency': 'DZD',
        'availability': isAvail ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        'url': pageUrl,
        'seller': { '@type': 'Organization', 'name': 'Derradj Shop', 'url': SITE_URL },
        'shippingDetails': {
          '@type': 'OfferShippingDetails',
          'shippingRate': { '@type': 'MonetaryAmount', 'value': '500', 'currency': 'DZD' },
          'deliveryTime': {
            '@type': 'ShippingDeliveryTime',
            'handlingTime': { '@type': 'QuantitativeValue', 'minValue': 1, 'maxValue': 1, 'unitCode': 'DAY' },
            'transitTime': { '@type': 'QuantitativeValue', 'minValue': 1, 'maxValue': 3, 'unitCode': 'DAY' },
          },
          'shippingDestination': { '@type': 'DefinedRegion', 'addressCountry': 'DZ' },
        },
        'hasMerchantReturnPolicy': {
          '@type': 'MerchantReturnPolicy',
          'applicableCountry': 'DZ',
          'returnPolicyCategory': 'https://schema.org/MerchantReturnFiniteReturnWindow',
          'merchantReturnDays': 7,
          'returnMethod': 'https://schema.org/ReturnByMail',
          'returnFees': 'https://schema.org/FreeReturn',
          'returnPolicyLink': `${SITE_URL}/return-policy`,
        },
      }
    };

    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Derradj Shop', 'item': SITE_URL },
        { '@type': 'ListItem', 'position': 2, 'name': catAr,          'item': `${SITE_URL}/#categories` },
        { '@type': 'ListItem', 'position': 3, 'name': schemaName,     'item': pageUrl }
      ]
    };

    /* ── Visible body markup (goes inside #pdContent) ── */
    const bodyHtml = `
      <script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>
      <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}<\/script>

      <div class="breadcrumb">
        <a href="/">الرئيسية</a><span>›</span>
        <a href="/#categories">التصنيفات</a><span>›</span>
        <span>${esc(catAr)}</span><span>›</span>
        <span>${esc(arName)}</span>
      </div>

      <div class="product-hero-grid">

        <!-- Product image -->
        <div class="product-img-gallery"${allImgs.length === 1 ? ' style="grid-template-columns:1fr;"' : ''}>
          ${thumbsHtml}
          <div class="product-main-image-box" id="pdMainImgBox">
            <span class="zoom-hint">🔍 انقر للتكبير</span>
            <img id="pdMainImg" src="${escAttr(imgSrc)}"
                 alt="${escAttr(imgAlt)}"
                 class="product-main-image"
                 fetchpriority="high"
                 width="400" height="400"
                 onerror="this.src='/Logo.jpg'">
          </div>
        </div>

        <!-- Product details -->
        <div class="product-details">
          <div class="product-cat-label">${esc(catAr)}</div>
          <h1>${esc(arName)}</h1>
          ${otherName ? `<span class="book-en-title">${esc(otherName)}</span>` : ''}

          ${stockBadge(p.stock_status)}

          <div class="product-price-box">
            ${priceHtml}
          </div>

          ${p.short_description ? `<p class="product-short-desc">${esc(p.short_description)}</p>` : ''}

          <div class="product-features">
            <div class="product-feature">
              <span class="feature-check">✓</span>
              <span><strong>الفئة:</strong> ${esc(catAr)}</span>
            </div>
            ${p.subcategory ? `<div class="product-feature">
              <span class="feature-check">✓</span>
              <span><strong>النوع:</strong> ${esc(p.subcategory)}</span>
            </div>` : ''}
            <div class="product-feature">
              <span class="feature-check">✓</span>
              <span>توصيل لجميع ولايات الجزائر الـ 58</span>
            </div>
            <div class="product-feature">
              <span class="feature-check">✓</span>
              <span>الدفع مسبق أو عند الاستلام</span>
            </div>
          </div>

          <div class="product-cta-buttons">
            ${buyNowBtn}
            ${waBtn}
            ${cartBtn}
          </div>

          <div class="trust-badges">
            <div class="trust-badge"><strong>🚚 التوصيل</strong>لكل الجزائر</div>
            <div class="trust-badge"><strong>💳 الدفع</strong>مسبق أو عند الاستلام</div>
            <div class="trust-badge"><strong>✅ الضمان</strong>جودة مضمونة</div>
          </div>
        </div>

      </div><!-- /product-hero-grid -->

      <!-- Full description -->
      ${p.full_description ? `
      <div style="margin-top:60px;">
        <div class="info-card">
          <h2>📋 تفاصيل المنتج</h2>
          <div class="pd-full-desc">${esc(p.full_description).replace(/\n/g, '<br>')}</div>
        </div>
      </div>
      ` : ''}

      <!-- Order info -->
      <div style="margin-top:48px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px;">
        <div class="info-card">
          <h2>📦 كيفية الطلب</h2>
          <p style="color:#475569;line-height:1.9;font-size:14px;">
            اضغط على "اطلب الآن" أو أضف المنتج إلى السلة، ثم أكمل بيانات الشحن في صفحة الطلب.
            يمكنك الدفع مسبقاً عبر CCP / BaridiMob أو الدفع عند الاستلام.
          </p>
        </div>
        <div class="info-card">
          <h2>🚚 التوصيل</h2>
          <p style="color:#475569;line-height:1.9;font-size:14px;">
            ${SHIPPING_NOTICE_AR}
            يمكنك الاستلام من أقرب نقطة توصيل أو التوصيل للمنزل.
          </p>
        </div>
      </div>

      <!-- Related products — filled by loadRelatedProducts() -->
      <div id="relatedProducts"></div>
    `;

    return {
      slug, pageUrl, isAvail, allImgs,
      catalogId: p.catalog_id || null,
      supabaseId: p.id || null,
      productName: arName,
      price: p.price,
      mainImage: imgSrc,
      meta: {
        title,
        description: desc,
        keywords: buildKeywords(p.keywords, arName, otherName, catAr),
        canonical: pageUrl,
        ogTitle,
        ogDescription: fullDesc,
        ogUrl: pageUrl,
        ogImage: (/^https?:\/\//.test(imgSrc) ? imgSrc : SITE_URL + imgSrc),
        ogImageAlt: imgAlt,
        twitterTitle: ogTitle,
        twitterDescription: fullDesc,
        twitterImage: (/^https?:\/\//.test(imgSrc) ? imgSrc : SITE_URL + imgSrc),
        twitterImageAlt: imgAlt,
      },
      jsonLd,
      breadcrumbLd,
      bodyHtml,
    };
  }

  const API = {
    esc, escAttr, fmtPrice, stockBadge, catLabelAr, buildProductView, SITE_URL,
    SHIPPING_NOTICE_AR, SHIPPING_NOTICE_AR_SHORT, SHIPPING_NOTICE_EN,
    isArabic, pickNames, truncateAtWord, buildKeywords,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    root.ProductTemplate = API;
  }
})(typeof window !== 'undefined' ? window : globalThis);
