/* ============================================================
   book-page-enhancements.js  (v2 — universal)
   Runs on every individual product page automatically:
     · books/[slug]/index.html
     · Electronique/[sub]/[product].html
     · any future product page

   Injects:
     1. WhatsApp contact button  (inside .product-cta-buttons)
     2. Related products carousel (same card style as homepage)
     3. FAQ accordion             (4 standard questions)

   Add to any product page before </body>:
     <script src="../../book-page-enhancements.js" defer></script>
   ============================================================ */

(function () {
  'use strict';

  /* ── Config ───────────────────────────────────────────── */
  var WA_NUMBER = '213555491316';
  var path      = (window.location.pathname || '').toLowerCase();

  /* Only run on individual product pages (not listing pages) */
  var isProductPage = (
    (/\/books\/[^/]+/.test(path)       && !/\/books\/?$/.test(path) && !/\/books\/index/.test(path)) ||
    (/\/electronique\/[^/]+\//.test(path))
  );
  if (!isProductPage) return;

  /* ────────────────────────────────────────────────────────
     rootPath()
     Returns the relative path from the current page to the
     site root, regardless of directory depth.

     /books/atomic-habits/           → '../../'
     /Electronique/laptop/page.html  → '../../'   (filename stripped)
  ─────────────────────────────────────────────────────────── */
  function rootPath() {
    var segs = window.location.pathname.split('/').filter(function (s) { return s.length > 0; });
    /* Strip the last segment if it is a filename (contains a dot) */
    if (segs.length > 0 && segs[segs.length - 1].indexOf('.') !== -1) {
      segs = segs.slice(0, -1);
    }
    var rel = '';
    for (var i = 0; i < segs.length; i++) rel += '../';
    return rel || './';
  }

  /* Current page slug — used to exclude the current product from related results */
  function currentSlug() {
    var segs = path.split('/').filter(function (s) { return s.length > 0; });
    var last = segs[segs.length - 1] || '';
    return last.replace(/\.html$/, '').replace(/\/$/, '');
  }

  var ROOT = rootPath();

  /* ═══════════════════════════════════════════════════════
     -1. Product Schema Injection (Google Merchant Center)
     Adds a Product JSON-LD schema on every book product page.
     All 77 book pages use @type:"Book" in their static HTML —
     Google Merchant Center / Shopping requires @type:"Product".
     This function injects a separate Product schema alongside
     the existing Book schema without removing anything.
     ═══════════════════════════════════════════════════════ */
  function injectProductSchema() {
    var bookMatch = path.match(/\/books\/([^/]+)/);
    if (!bookMatch) return;
    var slug = bookMatch[1];

    function doInject(booksData) {
      var book = null;
      for (var i = 0; i < booksData.length; i++) {
        if ((booksData[i].url || '').replace(/\/$/, '') === slug) {
          book = booksData[i]; break;
        }
      }
      if (!book) return;

      /* Skip if a Product schema already exists */
      var existingTags = document.querySelectorAll('script[type="application/ld+json"]');
      for (var j = 0; j < existingTags.length; j++) {
        try {
          var d = JSON.parse(existingTags[j].textContent);
          var t = [].concat(d['@type'] || []);
          if (t.indexOf('Product') !== -1) return;
          var g = d['@graph'] || [];
          for (var k = 0; k < g.length; k++) {
            if ([].concat(g[k]['@type'] || []).indexOf('Product') !== -1) return;
          }
        } catch (e) {}
      }

      var BASE = 'https://derradjshop.com';
      var productUrl = BASE + '/books/' + slug + '/';

      var script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        '@id': productUrl + '#product',
        'name': book.title,
        'description': book.description || book.title,
        'image': {
          '@type': 'ImageObject',
          'url': BASE + '/books/' + book.image,
          'width': 800,
          'height': 800
        },
        'url': productUrl,
        'sku': 'BOOK-' + book.id + '-DZ',
        'brand': { '@type': 'Brand', 'name': 'Derradj Shop' },
        'offers': {
          '@type': 'Offer',
          'url': productUrl,
          'price': String(book.price),
          'priceCurrency': 'DZD',
          'availability': book.available !== false
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          'itemCondition': 'https://schema.org/NewCondition',
          'seller': { '@type': 'Organization', 'name': 'Derradj Shop', 'url': BASE },
          'shippingDetails': {
            '@type': 'OfferShippingDetails',
            'shippingRate': {
              '@type': 'MonetaryAmount',
              'value': '500',
              'currency': 'DZD'
            },
            'deliveryTime': {
              '@type': 'ShippingDeliveryTime',
              'handlingTime': {
                '@type': 'QuantitativeValue',
                'minValue': 1,
                'maxValue': 1,
                'unitCode': 'DAY'
              },
              'transitTime': {
                '@type': 'QuantitativeValue',
                'minValue': 1,
                'maxValue': 3,
                'unitCode': 'DAY'
              }
            },
            'shippingDestination': {
              '@type': 'DefinedRegion',
              'addressCountry': 'DZ'
            }
          },
          'returnPolicy': {
            '@type': 'MerchantReturnPolicy',
            'applicableCountry': 'DZ',
            'returnPolicyCategory': 'https://schema.org/MerchantReturnFiniteReturnWindow',
            'merchantReturnDays': 7,
            'returnMethod': 'https://schema.org/ReturnByMail',
            'returnFees': 'https://schema.org/FreeReturn',
            'returnPolicyLink': BASE + '/return-policy.html'
          }
        }
      });
      document.head.appendChild(script);
    }

    if (window.BOOKS_DATA) {
      doInject(window.BOOKS_DATA);
    } else {
      /* Fallback: load books-data.js dynamically if not yet available */
      var s = document.createElement('script');
      s.src = ROOT + 'books-data.js';
      s.onload = function () { if (window.BOOKS_DATA) doInject(window.BOOKS_DATA); };
      document.head.appendChild(s);
    }
  }

  /* ═══════════════════════════════════════════════════════
     0. 3-Column Product Layout Restructure
     Extracts price + CTA buttons + trust badges from the
     info column and moves them into a sticky purchase sidebar.
     CSS class .has-purchase-box switches .product-hero-grid
     from 2-column to 3-column layout.
     ═══════════════════════════════════════════════════════ */
  function restructureProductLayout() {
    var heroGrid = document.querySelector('.product-hero-grid');
    if (!heroGrid || document.querySelector('.product-purchase-box')) return;

    var details = heroGrid.querySelector('.product-details');
    if (!details) return;

    var priceBox   = details.querySelector('.product-price-box');
    var ctaBtns    = details.querySelector('.product-cta-buttons');
    var trustBadge = details.querySelector('.trust-badges');

    /* Need at least the action buttons to build the sidebar */
    if (!ctaBtns) return;

    var box = document.createElement('div');
    box.className = 'product-purchase-box';

    /* 1. Availability indicator — neutral "checking" state until cart.js
       confirms the real stock status from Supabase (avoids showing
       "available" for products that are actually out of stock) */
    box.insertAdjacentHTML('beforeend',
      '<div class="purchase-avail-badge purchase-avail-badge--checking">⏳ جاري التحقق من التوفر...</div>'
    );
    box.insertAdjacentHTML('beforeend', '<div class="purchase-divider"></div>');

    /* 2. Move price box (appendChild moves, not clones, so no duplicate) */
    if (priceBox) box.appendChild(priceBox);

    /* 3. Move CTA buttons (WhatsApp btn already injected by step 1 above) */
    box.appendChild(ctaBtns);

    /* 4. Move trust badges */
    if (trustBadge) box.appendChild(trustBadge);

    /* 5. Delivery highlights (new static HTML) */
    box.insertAdjacentHTML('beforeend',
      '<div class="purchase-delivery-info">' +
        '<div class="delivery-info-item"><span class="di-icon">🚚</span><span>توصيل 24–72 ساعة لجميع ولايات الجزائر</span></div>' +
        '<div class="delivery-info-item"><span class="di-icon">💳</span><span>الدفع مسبق أو عند الاستلام</span></div>' +
        '<div class="delivery-info-item"><span class="di-icon">🛡️</span><span>ضمان واستبدال حسب الحالة</span></div>' +
      '</div>'
    );

    /* Append sidebar as 3rd grid column */
    heroGrid.appendChild(box);
    heroGrid.classList.add('has-purchase-box');
  }

  /* ═══════════════════════════════════════════════════════
     1. WhatsApp Contact Button
     ═══════════════════════════════════════════════════════ */
  function getPageTitle() {
    var h1 = document.querySelector('main h1, h1');
    return h1 ? h1.textContent.trim() : '';
  }

  function buildWaHref(productName) {
    var msg = productName
      ? 'مرحبًا، أريد الاستفسار عن هذا المنتج: ' + productName
      : 'مرحبًا، أريد الاستفسار عن منتج في Derradj Shop.';
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg);
  }

  function injectWhatsAppBtn() {
    var cta = document.querySelector('.product-cta-buttons');
    if (!cta || document.querySelector('.btn-whatsapp-product')) return;

    var btn = document.createElement('a');
    btn.className = 'btn-whatsapp-product';
    btn.href      = buildWaHref(getPageTitle());
    btn.target    = '_blank';
    btn.rel       = 'noopener noreferrer';
    btn.setAttribute('aria-label', 'تواصل معنا عبر واتساب');

    btn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15' +
        '-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475' +
        '-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52' +
        '.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207' +
        '-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372' +
        '-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2' +
        ' 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118' +
        '.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>' +
        '<path d="M12 0C5.373 0 0 5.373 0 12c0 2.116.552 4.103 1.523 5.827L0 24l6.335-1.505' +
        'A11.942 11.942 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.854 0-3.587-.5' +
        '-5.076-1.373l-.362-.215-3.759.894.899-3.665-.236-.376A9.958 9.958 0 012 12' +
        'C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>' +
      '</svg>' +
      'تواصل معنا عبر واتساب';

    cta.appendChild(btn);

    /* Re-build href after 600 ms in case h1 is injected by another script */
    setTimeout(function () { btn.href = buildWaHref(getPageTitle()); }, 600);
  }

  /* ═══════════════════════════════════════════════════════
     2. Related Products Carousel
     ═══════════════════════════════════════════════════════ */
  function buildRelatedCard(book) {
    var isAvail   = book.available !== false;
    var bookUrl   = ROOT + 'books/' + (book.url || '');
    var imgSrc    = ROOT + 'books/' + book.image;
    var imgWebp   = ROOT + 'books/' + book.image.replace(/\.png$/, '.webp');
    var badgeCls  = isAvail ? 'product-badge new' : 'product-badge product-badge--unavail';
    var badgeText = isAvail ? 'متوفر' : 'غير متوفر';
    var formatted = book.price.toLocaleString('en-US');
    var priceHTML =
      '<span class="price-current">' +
        '<span class="price-value">' +
          '<span class="price-currency">دج</span>' +
          '<span class="price-amount">' + formatted + '</span>' +
        '</span>' +
      '</span>';
    var cartBtn = isAvail
      ? '<button class="btn-add-cart" data-add-to-cart="' + book.id + '">🛒 أضف للسلة</button>'
      : '<button class="btn-add-cart" disabled>غير متوفر</button>';
    var subtitle = book.titleEn || book.author || '';

    return (
      '<div class="product-card">' +
        '<div class="' + badgeCls + '" data-avail-badge="' + book.id + '">' + badgeText + '</div>' +
        '<a href="' + bookUrl + '" class="product-img-area" style="text-decoration:none;">' +
          '<picture>' +
            '<source srcset="' + imgWebp + '" type="image/webp"/>' +
            '<img src="' + imgSrc + '" alt="غلاف كتاب ' + book.title + '"' +
                 ' loading="lazy" decoding="async" width="400" height="400"' +
                 ' onerror="this.src=\'' + ROOT + 'Logo.jpg\'">' +
          '</picture>' +
        '</a>' +
        '<div class="product-info">' +
          '<div class="product-cat-label">' + book.category + '</div>' +
          '<a href="' + bookUrl + '" style="text-decoration:none;color:inherit;">' +
            '<h3 class="product-name">' + book.title + '</h3>' +
          '</a>' +
          '<div class="product-rating">' +
            '<span class="product-stars">📖</span>' +
            '<span class="product-rating-count">' + subtitle + '</span>' +
          '</div>' +
          '<div class="product-prices">' + priceHTML + '</div>' +
          '<div class="product-card-btns">' +
            '<a href="' + bookUrl + '" class="btn-order-card">📖 تفاصيل</a>' +
            cartBtn +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* Minimal carousel auto-scroll (mirrors homepage logic) */
  function initRelatedCarousel(rowEl) {
    if (!rowEl) return;
    var timer = null, userActive = false, touchTimer = null;
    var isDragging = false, dragStartX = 0, scrollStart = 0;

    function cardStep() {
      var card = rowEl.querySelector('.product-card');
      if (!card) return 280;
      var gap = parseFloat(window.getComputedStyle(rowEl).gap) || 16;
      return card.offsetWidth + gap;
    }
    function step() {
      if (userActive) return;
      var max = rowEl.scrollWidth - rowEl.clientWidth;
      if (max <= 0) return;
      var next = rowEl.scrollLeft + cardStep();
      rowEl.scrollTo({ left: next >= max - 4 ? 0 : next, behavior: 'smooth' });
    }
    function startTimer() { clearInterval(timer); timer = setInterval(step, 4000); }
    function pause()  { userActive = true;  clearInterval(timer); }
    function resume() { userActive = false; startTimer(); }

    rowEl.addEventListener('mouseenter', pause);
    rowEl.addEventListener('mouseleave', resume);
    rowEl.addEventListener('touchstart', function () { pause(); clearTimeout(touchTimer); }, { passive: true });
    rowEl.addEventListener('touchend',   function () { clearTimeout(touchTimer); touchTimer = setTimeout(resume, 2500); }, { passive: true });
    rowEl.addEventListener('mousedown',  function (e) {
      isDragging = true; dragStartX = e.pageX; scrollStart = rowEl.scrollLeft;
      rowEl.style.userSelect = 'none'; pause(); e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      rowEl.scrollLeft = scrollStart - (e.pageX - dragStartX);
    });
    document.addEventListener('mouseup', function () {
      if (!isDragging) return;
      isDragging = false; rowEl.style.userSelect = '';
      setTimeout(resume, 1500);
    });
    startTimer();
  }

  function renderRelatedProducts(booksData) {
    if (document.querySelector('.related-products-section')) return;

    var slug     = currentSlug();
    var catEl    = document.querySelector('.product-cat-label');
    var rawCat   = catEl ? catEl.textContent.trim() : '';
    /* Handle "تطوير الذات — كتاب" or "Electronique / Laptop" formats */
    var category = rawCat.split('—')[0].split('–')[0].split('/')[0].trim();

    var sectionTitle = 'منتجات ذات صلة قد تعجبك';

    /* 1st priority: same-category books */
    var related = booksData.filter(function (book) {
      return book.category === category && (book.url || '').replace(/\/$/, '') !== slug;
    });

    /* Fallback for electronics / cross-category pages: show any books */
    if (!related.length) {
      sectionTitle = 'كتب قد تعجبك';
      related = booksData.filter(function (book) {
        return (book.url || '').replace(/\/$/, '') !== slug;
      });
    }

    related = related.slice(0, 12);
    if (!related.length) return;

    var cards   = related.map(buildRelatedCard).join('');
    var section = document.createElement('section');
    section.className = 'related-products-section';
    section.innerHTML =
      '<div class="container">' +
        '<div class="section-header product-slider-header centered">' +
          '<h2 class="section-title">' + sectionTitle + '</h2>' +
        '</div>' +
        '<div class="product-carousel" id="relatedProductsCarousel">' + cards + '</div>' +
      '</div>';

    var main   = document.querySelector('main');
    var footer = document.querySelector('footer');
    if (main)        main.insertAdjacentElement('afterend', section);
    else if (footer) footer.insertAdjacentElement('beforebegin', section);

    initRelatedCarousel(document.getElementById('relatedProductsCarousel'));
  }

  function loadRelatedProducts() {
    if (window.BOOKS_DATA) { renderRelatedProducts(window.BOOKS_DATA); return; }
    var s = document.createElement('script');
    s.src = ROOT + 'books-data.js';
    s.onload = function () { if (window.BOOKS_DATA) renderRelatedProducts(window.BOOKS_DATA); };
    document.head.appendChild(s);
  }

  /* ═══════════════════════════════════════════════════════
     3. FAQ Accordion
     ═══════════════════════════════════════════════════════ */
  var FAQ_ITEMS = [
    {
      q: 'هل المنتج أصلي 100%؟',
      a: 'نعم، نحن نحرص على توفير منتجات أصلية أو مطابقة للوصف المعروض في صفحة المنتج. يمكنك التواصل معنا عبر واتساب قبل الطلب إذا كنت تريد صورًا أو تفاصيل إضافية.'
    },
    {
      q: 'ما هي مدة التوصيل إلى ولايتي؟',
      a: 'مدة التوصيل عادة تكون بين 24 و72 ساعة حسب الولاية وشركة التوصيل. بعض الولايات البعيدة قد تستغرق مدة أطول قليلًا.'
    },
    {
      q: 'هل يمكنني الدفع عند الاستلام؟',
      a: 'نعم، يمكنك اختيار الدفع عند الاستلام عند إتمام الطلب، إذا كان هذا الخيار متاحًا لولايتك.'
    },
    {
      q: 'ماذا لو وصلتني سلعة معيبة؟',
      a: 'إذا وصلتك سلعة معيبة أو مختلفة عن الوصف، تواصل معنا مباشرة عبر واتساب مع صور المنتج وسنساعدك في حل المشكلة بأسرع وقت ممكن.'
    }
  ];

  function injectFAQ() {
    if (document.querySelector('.product-faq-section')) return;

    var items = FAQ_ITEMS.map(function (faq) {
      return (
        '<div class="product-faq-item">' +
          '<button class="product-faq-question" aria-expanded="false">' +
            '<span>' + faq.q + '</span>' +
            '<span class="product-faq-icon" aria-hidden="true">+</span>' +
          '</button>' +
          '<div class="product-faq-answer" role="region">' + faq.a + '</div>' +
        '</div>'
      );
    }).join('');

    var section = document.createElement('section');
    section.className = 'product-faq-section';
    section.innerHTML =
      '<div class="container">' +
        '<div class="section-header">' +
          '<h2 class="section-title">💬 أسئلة شائعة عن هذا المنتج</h2>' +
          '<p class="section-subtitle">إجابات على أكثر الأسئلة شيوعاً من عملائنا</p>' +
        '</div>' +
        '<div class="product-faq-list">' + items + '</div>' +
      '</div>';

    var related = document.querySelector('.related-products-section');
    var footer  = document.querySelector('footer');
    if (related)      related.insertAdjacentElement('afterend', section);
    else if (footer)  footer.insertAdjacentElement('beforebegin', section);
    else              document.body.appendChild(section);

    /* Accordion toggle */
    section.querySelectorAll('.product-faq-question').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var isOpen = this.classList.contains('open');
        this.classList.toggle('open', !isOpen);
        this.setAttribute('aria-expanded', String(!isOpen));
        this.nextElementSibling.classList.toggle('open', !isOpen);
      });
    });
  }

  /* ═══════════════════════════════════════════════════════
     Init
     ═══════════════════════════════════════════════════════ */
  function init() {
    injectProductSchema();      /* step -1: Product JSON-LD for Google Merchant Center */
    injectWhatsAppBtn();        /* step 1: add WA btn into .product-cta-buttons */
    restructureProductLayout(); /* step 2: move price+buttons+trust into sidebar */
    loadRelatedProducts();      /* step 3: related products carousel below main */
    injectFAQ();                /* step 4: FAQ accordion at the bottom */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
