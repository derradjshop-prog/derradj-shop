/* ==========================================================
   book-template.js — Derradj Shop
   Isomorphic (Node + browser) book page renderer. Pure
   functions only — no DOM / window access — mirrors
   js/product-template.js exactly, so the same markup is
   produced by:
     - scripts/generate-product-pages.js (static HTML at build time)
     - js/book-page.js (live refresh in the browser, future)
   ========================================================== */
(function (root, ProductTemplate) {
  'use strict';

  const SITE_URL = 'https://derradjshop.com';
  const { esc, escAttr, fmtPrice } = ProductTemplate;

  function availBadge(available) {
    return available
      ? `<span class="pd-stock avail">🟢 متوفر — يمكن الطلب الآن</span>`
      : `<span class="pd-stock unavail">🔴 نفذت الكمية</span>`;
  }

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

  /* ── Build the full view-model for a book row from
     `public.books` — used to fill <head> meta tags, JSON-LD,
     and the visible book markup. ── */
  function buildBookView(b) {
    const slug      = b.url ? b.url.replace(/\/$/, '') : String(b.id);
    const pageUrl   = `${SITE_URL}/books/${encodeURIComponent(slug)}/`;
    const isAvail   = b.available !== false;
    const priceFmt  = fmtPrice(b.price);
    const priceSpaced = String(b.price).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    const title = `${b.title} | Derradj Shop`;
    const ogTitle = `${b.title}${b.titleEn ? ' — ' + b.titleEn : ''} | ${priceSpaced} دج | Derradj Shop الجزائر`;
    const fullDesc = b.seo_description || b.description || `اطلب كتاب ${b.title} من Derradj Shop`;
    const desc = truncateAtWord(fullDesc, 155);
    const imgAlt = `غلاف كتاب ${b.title}${b.author ? ' لـ' + b.author : ''}`;
    /* Absolute URL or absolute site path — generator resolves legacy
       relative paths ('slug/main.webp') and Supabase Storage URLs
       (new books) into this before calling buildBookView(). */
    const mainImage = b.image || '/Logo.jpg';

    /* ── Structured data — Book (preserves existing indexing) +
       Product/Offer (so Merchant Center sees a Product node in
       raw HTML, replacing the old client-side injection hack) ── */
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Book',
          '@id': `${pageUrl}#book`,
          'name': b.title,
          'author': { '@type': 'Person', 'name': b.author || 'غير معروف' },
          'inLanguage': 'ar',
          'genre': b.category || '',
          'description': b.description || '',
          'image': { '@type': 'ImageObject', 'url': mainImage },
          'url': pageUrl,
          'offers': {
            '@type': 'Offer',
            'price': String(b.price),
            'priceCurrency': 'DZD',
            'availability': isAvail ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            'url': pageUrl,
            'seller': { '@type': 'Organization', 'name': 'Derradj Shop', 'url': SITE_URL },
          },
          'seller': { '@type': 'Organization', 'name': 'Derradj Shop' },
          ...(b.titleEn ? { alternateName: b.titleEn } : {}),
          ...(b.year ? { datePublished: String(b.year) } : {}),
        },
        {
          '@type': 'Product',
          'name': b.title,
          'description': b.description || '',
          'category': 'Media > Books',
          'image': [mainImage],
          'sku': `BOOK-${b.id}-DZ`,
          'url': pageUrl,
          'brand': { '@type': 'Brand', 'name': 'Derradj Shop' },
          'offers': {
            '@type': 'Offer',
            'price': String(b.price),
            'priceCurrency': 'DZD',
            'availability': isAvail ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            'itemCondition': 'https://schema.org/NewCondition',
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
              'returnPolicyLink': `${SITE_URL}/return-policy.html`,
            },
          },
        },
        {
          '@type': 'BreadcrumbList',
          'itemListElement': [
            { '@type': 'ListItem', 'position': 1, 'name': 'الرئيسية', 'item': SITE_URL + '/' },
            { '@type': 'ListItem', 'position': 2, 'name': 'الكتب', 'item': SITE_URL + '/books/' },
            { '@type': 'ListItem', 'position': 3, 'name': b.title, 'item': pageUrl },
          ],
        },
      ],
    };

    /* ── Feature list rows (author/translator/year/category — only when present) ── */
    const features = [];
    if (b.author) features.push(`<div class="product-feature"><span class="feature-check">✓</span><span><strong>المؤلف:</strong> ${esc(b.author)}</span></div>`);
    if (b.translator) features.push(`<div class="product-feature"><span class="feature-check">✓</span><span><strong>المترجم:</strong> ${esc(b.translator)}</span></div>`);
    if (b.year) features.push(`<div class="product-feature"><span class="feature-check">✓</span><span><strong>سنة النشر:</strong> ${esc(b.year)}</span></div>`);
    if (b.category) features.push(`<div class="product-feature"><span class="feature-check">✓</span><span><strong>التصنيف:</strong> ${esc(b.category)}</span></div>`);
    features.push(`<div class="product-feature"><span class="feature-check">✓</span><span>توصيل لجميع ولايات الجزائر الـ 58</span></div>`);

    const orderInfo = `يمكنك طلب كتاب ${esc(b.title)}${b.author ? ' لـ' + esc(b.author) : ''} بسعر ${priceFmt} دج من Derradj Shop مع التوصيل إلى جميع ولايات الجزائر.`;

    /* WhatsApp contact button — mirrors product-template.js exactly */
    const waMsg = encodeURIComponent('مرحبا، أريد الاستفسار عن هذا الكتاب: ' + b.title);
    const waBtn = `<a href="https://wa.me/213555491316?text=${waMsg}" target="_blank" rel="noopener noreferrer" class="btn-whatsapp-sb"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> الطلب عبر الواتساب</a>`;

    /* Cart button — disabled state when out of stock, mirrors product-template.js exactly */
    const cartBtn = isAvail
      ? `<button class="btn-add-cart-sb" id="pdAddCart" data-add-to-cart="${b.id}">🛒 أضف إلى السلة</button>`
      : `<button class="btn-add-cart-sb" id="pdAddCart" disabled>🔴 نفذت الكمية</button>`;

    /* Buy-now button — disabled (no live link) when out of stock */
    const buyNowBtn = isAvail
      ? `<a href="/ordre/" class="btn-buy-now-sb" id="pdOrderNowBtn">🛒 اطلب الكتاب الآن</a>`
      : `<button class="btn-buy-now-sb" id="pdOrderNowBtn" disabled style="opacity:.6;cursor:not-allowed;">🔴 نفذت الكمية</button>`;

    /* ── Visible body markup (goes inside #pdContent) ── */
    const bodyHtml = `
      <script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>

      <div class="breadcrumb">
        <a href="/">الرئيسية</a><span>›</span>
        <a href="/books/">الكتب</a><span>›</span>
        <span>${esc(b.title)}</span>
      </div>

      <div class="product-hero-grid">
        <div class="product-img-gallery" style="grid-template-columns:1fr;max-width:260px;">
          <div class="product-main-image-box" style="aspect-ratio:3/4;cursor:default;">
            <img id="pdMainImg" src="${escAttr(mainImage)}"
                 alt="${escAttr(imgAlt)}"
                 class="product-main-image"
                 fetchpriority="high"
                 style="object-fit:contain;padding:0;"
                 onerror="this.src='/Logo.jpg'">
          </div>
        </div>

        <div class="product-details">
          <div class="product-cat-label">${esc(b.category || 'كتب')} — كتاب</div>
          <h1>${esc(b.title)}</h1>
          ${b.titleEn ? `<span class="book-en-title">${esc(b.titleEn)}</span>` : ''}

          ${availBadge(isAvail)}

          <div class="product-price-box">
            <span class="price-current">
              <span class="price-value">
                <span class="price-currency">دج</span>
                <span class="price-amount">${priceFmt}</span>
              </span>
            </span>
          </div>

          ${b.description ? `<p class="product-short-desc">${esc(b.description)}</p>` : ''}

          <div class="product-features">
            ${features.join('\n            ')}
          </div>

          <div class="product-cta-buttons">
            ${buyNowBtn}
            ${waBtn}
            ${cartBtn}
          </div>

          <div class="trust-badges">
            <div class="trust-badge"><strong>🚚 التوصيل</strong>لكل الجزائر</div>
            <div class="trust-badge"><strong>💳 الدفع</strong>مسبق أو عند الاستلام</div>
            <div class="trust-badge"><strong>📚 الجودة</strong>كتب مختارة</div>
          </div>
        </div>
      </div>

      <div style="margin-top:60px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px;">
        ${b.full_description ? `<div class="info-card">
          <h2>📖 عن الكتاب</h2>
          <p style="color:#475569;line-height:1.9;font-size:14px;">${esc(b.full_description)}</p>
        </div>` : ''}
        <div class="info-card">
          <h2>📦 معلومات الطلب والتوصيل</h2>
          <p style="color:#475569;line-height:1.9;font-size:14px;margin-bottom:12px;">${orderInfo}</p>
          <ul>
            <li><strong>طريقة الدفع:</strong> مسبق (CCP / BaridiMob) أو عند الاستلام</li>
            <li><strong>مدة التوصيل:</strong> ${ProductTemplate.SHIPPING_NOTICE_AR_SHORT}</li>
            <li><strong>الضمان:</strong> ضمان كامل — استرجاع المال في حال وجود مشكلة</li>
            <li><strong>السعر:</strong> ${priceFmt} دج</li>
          </ul>
        </div>
      </div>

      <div id="relatedProducts"></div>
    `;

    return {
      slug, pageUrl, isAvail,
      id: b.id,
      catalogId: b.id,
      title: b.title,
      productName: b.title,
      price: b.price,
      mainImage,
      allImgs: [mainImage],
      meta: {
        title,
        description: desc,
        keywords: b.keywords || '',
        canonical: pageUrl,
        ogTitle,
        ogDescription: fullDesc,
        ogUrl: pageUrl,
        ogImage: mainImage,
        ogImageAlt: imgAlt,
        twitterTitle: ogTitle,
        twitterDescription: fullDesc,
        twitterImage: mainImage,
        twitterImageAlt: imgAlt,
      },
      jsonLd,
      bodyHtml,
    };
  }

  const API = { buildBookView };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    root.BookTemplate = API;
  }
})(
  typeof window !== 'undefined' ? window : globalThis,
  typeof module !== 'undefined' && module.exports ? require('./product-template.js') : window.ProductTemplate
);
