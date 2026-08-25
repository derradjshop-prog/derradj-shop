/* ============================================================
   cart.js — Derradj Shop | نظام السلة المشترك
   يعمل على جميع صفحات المتجر — يحفظ البيانات في localStorage
   ============================================================ */
(function () {
  'use strict';

  const CART_KEY = 'derradj_cart';
  const BASE     = window.location.origin;

  /* ══════════════════════════════════════════════════════════
     طبقة حماية المحتوى الشاملة — رادع فقط، لا حماية فعلية مضمونة
     (موقع ثابت بدون سيرفر، راجع تقرير التدقيق). مفوّضة عبر document
     مرحلة الالتقاط لتغطي كل عناصر الموقع بما فيها ما يُضاف لاحقاً
     ديناميكياً (بطاقات المنتجات، نتائج البحث...) دون تكرار الكود في
     كل صفحة. لا تُطبَّق على حقول الإدخال حتى يبقى الكتابة/التحديد/
     اللصق طبيعياً في نماذج البحث وتسجيل الدخول والطلب. لا تُحمَّل هذه
     الحماية أصلاً في admin/ أو seller/ (لا تستدعيان cart.js). ══════════════════════════════════════════════════════════ */
  function isEditableTarget(target) {
    const el = target && target.nodeType === 1 ? target : (target && target.parentElement);
    if (!el) return false;
    return !!el.closest('input, textarea, select, [contenteditable], [contenteditable="true"]');
  }

  document.addEventListener('contextmenu', function (e) {
    if (!isEditableTarget(e.target)) e.preventDefault();
  }, true);

  document.addEventListener('dragstart', function (e) {
    if (!isEditableTarget(e.target)) e.preventDefault();
  }, true);

  /* اختصارات النسخ/الحفظ/الفحص — عند لوحة المفاتيح فقط، وليس عند
     حدث copy/cut، حتى لا تتعارض مع زر "نسخ ملخص الطلب" في صفحة الطلب
     (ordre/index.html) الذي يستدعي execCommand('copy') برمجياً. غير
     موثوقة بالكامل عبر كل المتصفحات (خصوصاً Firefox) — رادع إضافي فقط. */
  document.addEventListener('keydown', function (e) {
    if (isEditableTarget(e.target)) return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const isDevtoolsKey =
      k === 'F12' ||
      (ctrl && e.shiftKey && (k === 'I' || k === 'i' || k === 'J' || k === 'j' || k === 'C' || k === 'c'));
    const isBlockedCtrlKey =
      ctrl && (k === 'U' || k === 'u' || k === 'S' || k === 's' || k === 'P' || k === 'p' ||
               k === 'C' || k === 'c' || k === 'X' || k === 'x' || k === 'Insert');
    if (isDevtoolsKey || isBlockedCtrlKey) e.preventDefault();
  }, true);

  /* ══════════════════════════════════════════════════════════
     نصوص حالة التوفر — تُستخدم في صفحات المنتج الفردية
     (.purchase-avail-badge و .avail-tag)
  ══════════════════════════════════════════════════════════ */
  const AVAIL_CHECKING_TEXT    = '⏳ جاري التحقق من التوفر...';
  const AVAIL_AVAILABLE_TEXT   = '✅ متوفر — يمكن الطلب الآن';
  const AVAIL_UNAVAILABLE_TEXT = '🔴 نفذت الكمية';
  const TAG_CHECKING_HTML      = '<span>⏳</span><span>جاري التحقق من التوفر...</span>';
  const TAG_AVAILABLE_HTML     = '<span>✓</span><span>متوفر</span>';
  const TAG_UNAVAILABLE_HTML   = '<span>✗</span><span>نفذت الكمية</span>';

  /* المنتج الرئيسي لصفحة المنتج الحالية — مُستمد من زر "أضف للسلة"
     داخل صندوق الشراء (.product-purchase-box) أو #mainAddToCartBtn */
  function getMainProductCatalogId () {
    const btn = document.querySelector(
      '.product-purchase-box [data-add-to-cart], #mainAddToCartBtn[data-add-to-cart]'
    );
    if (!btn) return null;
    const cid = parseInt(btn.dataset.addToCart, 10);
    return Number.isFinite(cid) ? cid : null;
  }

  /* ══════════════════════════════════════════════════════════
     Supabase — لجلب حالة توفر المنتجات
  ══════════════════════════════════════════════════════════ */
  const SB_URL = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk';

  /* ══════════════════════════════════════════════════════════
     كتالوج المنتجات — يجب أن تتطابق (name, price, catalogId)
     مع PRODUCTS_CATALOG في ordre/index.html
     catalogId = index في PRODUCTS_CATALOG (يبدأ من 0)
     available: true = متوفر | false = غير متوفر حاليا
  ══════════════════════════════════════════════════════════ */
  window.SHOP_CATALOG = [
    /* ── منتجات مخفية فقط — للحفاظ على تطابق catalogId مع طلبات
       قديمة في قاعدة البيانات. كل المنتجات الحقيقية (كتب وإلكترونيات)
       تُحمَّل ديناميكياً من admin_products_catalog عبر products-loader.js. ── */
    { catalogId: 0,  name: 'Electronics Components Kit',        shortName: 'Electronics Components Kit',  price: 7000, hidden: true, available: true, image: '' },
    { catalogId: 1,  name: 'YNINCH Super Learning Kit Arduino', shortName: 'YNINCH Super Learning Kit',   price: 7300, hidden: true, available: true, image: '' },
    { catalogId: 5,  name: 'الأثر المذهل للعادات البسيطة (قديم)', shortName: 'الأثر المذهل (قديم)',        price: 1200, hidden: true, available: true, image: '' },
    { catalogId: 15, name: 'الجسد لا ينسى',                       shortName: 'الجسد لا ينسى',              price: 1800, hidden: true, available: true, image: '' },
    { catalogId: 18, name: 'الثالوث المظلم',                      shortName: 'الثالوث المظلم',             price: 1200, hidden: true, available: true, image: '' },
    { catalogId: 19, name: 'كيف تتقن فن البيع',                   shortName: 'كيف تتقن فن البيع',          price: 1500, hidden: true, available: true, image: '' },
  ];

  /* ══════════════════════════════════════════════════════════
     حالة تحميل آمنة — تُطبَّق فوراً قبل استعلام Supabase

     تمنع الـ flash: الأزرار تُعطَّل والشارات تُخفى مؤقتاً
     حتى يُعرف الوضع الحقيقي من قاعدة البيانات.
     تعمل فقط على الأزرار والشارات الموجودة في HTML الثابت
     (مثل صفحة الإلكترونيات وصفحات المنتجات الفردية).
     الأزرار المُنشأة ديناميكيًا (قوائم الكتب) تُبنى بعد تحميل
     البيانات فعلاً فلا تحتاج لهذه الخطوة.
  ══════════════════════════════════════════════════════════ */
  function setAvailabilityLoadingState () {
    const catalog = window.SHOP_CATALOG || [];

    /* تعطيل أزرار السلة الثابتة — تُحفظ النصوص الأصلية للاستعادة */
    document.querySelectorAll('[data-add-to-cart]').forEach(btn => {
      const cid = parseInt(btn.dataset.addToCart);
      const p   = catalog.find(c => c.catalogId === cid);
      if (!p || p.hidden) return;

      /* حفظ النص قبل تغييره — updateAddToCartButtons ستعيده */
      if (!btn.dataset._origText) btn.dataset._origText = btn.textContent.trim();
      btn.disabled      = true;
      btn.textContent   = '...';
      btn.style.opacity = '0.5';
      btn.style.cursor  = 'not-allowed';
    });

    /* شارة التوفر في صندوق الشراء بصفحة المنتج (.purchase-avail-badge) */
    document.querySelectorAll('.purchase-avail-badge').forEach(badge => {
      badge.classList.remove('purchase-avail-badge--unavail');
      badge.classList.add('purchase-avail-badge--checking');
      badge.textContent = AVAIL_CHECKING_TEXT;
    });

    /* وسم التوفر بجانب السعر في صفحة المنتج (.avail-tag) */
    document.querySelectorAll('.avail-tag').forEach(tag => {
      tag.classList.remove('avail-tag--unavail');
      tag.classList.add('avail-tag--checking');
      tag.innerHTML = TAG_CHECKING_HTML;
    });
  }

  /* ══════════════════════════════════════════════════════════
     حالة التوفر تُقرأ حصراً من admin_products_catalog.stock_status
     عبر products-loader.js (نفس المصدر المستخدم في لوحة الإدارة
     وصفحة تفاصيل المنتج) — راجع updateAddToCartButtons() أدناه
     التي تُستدعى عند اكتمال ذلك الكتالوج (derradj:catalog-loaded).

     كان هنا سابقاً نظام قديم منفصل يقرأ من جدول product_availability
     (لم يعد أي جزء من لوحة الإدارة يكتب إليه) ويُطبّق بياناته القديمة
     فوق SHOP_CATALOG بشكل غير متزامن — ما يُنشئ سباقاً بين مصدرين
     مختلفين لنفس البيانات ويُفسّر عدم تطابق حالة التوفر بين الصفحات.
     أُزيل بالكامل بدل إبقائه كمصدر ثانٍ يمكن أن يفوز في السباق.
  ══════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════
     تحديث أزرار "أضف إلى السلة" وشارات التوفر بناءً على Supabase
     يعمل على جميع الصفحات: الرئيسية، الإلكترونيات، الكتب...
  ══════════════════════════════════════════════════════════ */
  function updateAddToCartButtons () {
    const catalog = window.SHOP_CATALOG || [];

    /* ── تحديث أزرار السلة [data-add-to-cart] ── */
    document.querySelectorAll('[data-add-to-cart]').forEach(btn => {
      const cid = parseInt(btn.dataset.addToCart);
      const p   = catalog.find(c => c.catalogId === cid);
      if (!p || p.hidden) return;

      if (p.available === false) {
        btn.disabled          = true;
        btn.dataset._origText = btn.dataset._origText || btn.textContent;
        btn.textContent       = 'نفذت الكمية';
        btn.classList.add('btn-unavailable');
        btn.style.cursor      = 'not-allowed';
        btn.style.opacity     = '0.65';
      } else {
        btn.disabled    = false;
        btn.textContent = btn.dataset._origText || btn.textContent;
        btn.classList.remove('btn-unavailable');
        btn.style.cursor  = '';
        btn.style.opacity = '';
      }
    });

    /* ── تحديث شارات التوفر [data-avail-badge] ──
       متوفر  = class "new"               (أخضر)
       غير متوفر = class "product-badge--unavail" (برتقالي) */
    document.querySelectorAll('[data-avail-badge]').forEach(badge => {
      const cid = parseInt(badge.dataset.availBadge);
      const p   = catalog.find(c => c.catalogId === cid);
      if (!p || p.hidden) return;

      if (p.available === false) {
        badge.textContent = 'نفذت الكمية';
        badge.classList.remove('new');
        badge.classList.add('product-badge--unavail');
      } else {
        badge.textContent = 'متوفر';
        badge.classList.add('new');
        badge.classList.remove('product-badge--unavail');
      }
    });

    /* ── تحديث مؤشرات التوفر في صفحة المنتج الفردية ──
       (.purchase-avail-badge و .avail-tag) بناءً على المنتج
       المرتبط بزر "أضف للسلة" الرئيسي في الصفحة */
    const mainCid = getMainProductCatalogId();
    const mainP   = mainCid != null ? catalog.find(c => c.catalogId === mainCid) : null;
    const isUnavailable = !!mainP && mainP.available === false;

    document.querySelectorAll('.purchase-avail-badge').forEach(badge => {
      badge.classList.remove('purchase-avail-badge--checking');
      if (isUnavailable) {
        badge.textContent = AVAIL_UNAVAILABLE_TEXT;
        badge.classList.add('purchase-avail-badge--unavail');
      } else {
        badge.textContent = AVAIL_AVAILABLE_TEXT;
        badge.classList.remove('purchase-avail-badge--unavail');
      }
    });

    document.querySelectorAll('.avail-tag').forEach(tag => {
      tag.classList.remove('avail-tag--checking');
      if (isUnavailable) {
        tag.innerHTML = TAG_UNAVAILABLE_HTML;
        tag.classList.add('avail-tag--unavail');
      } else {
        tag.innerHTML = TAG_AVAILABLE_HTML;
        tag.classList.remove('avail-tag--unavail');
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     إدارة بيانات السلة (localStorage)
  ══════════════════════════════════════════════════════════ */
  const Cart = {
    get () {
      try {
        const raw = localStorage.getItem(CART_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    },
    save (items) {
      if (!Array.isArray(items) || items.length === 0) {
        localStorage.removeItem(CART_KEY);
        localStorage.removeItem(CART_KEY + '_ts');
      } else {
        localStorage.setItem(CART_KEY, JSON.stringify(items));
        localStorage.setItem(CART_KEY + '_ts', String(Date.now())); /* طابع زمني */
      }
    },
    /* Remove hidden or unknown items from localStorage */
    sanitize () {
      try {
        const raw = localStorage.getItem(CART_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          localStorage.removeItem(CART_KEY);
          return;
        }
        const catalog = window.SHOP_CATALOG || [];
        const valid = parsed.filter(item => {
          if (!item || typeof item.catalogId !== 'number' || !Number.isFinite(item.catalogId)) return false;
          if (!item.qty || item.qty < 1) return false;
          const p = catalog.find(c => c.catalogId === item.catalogId);
          /* Digital subscriptions order through WhatsApp only — never
             through the cart/checkout flow. A subscription that made it
             into localStorage before this rule existed (or any other
             way) must never survive to checkout, so it's stripped here
             exactly like a hidden/unknown product. */
          return p && !p.hidden && p.category !== 'subscriptions';
        });
        if (valid.length !== parsed.length) {
          if (valid.length === 0) {
            localStorage.removeItem(CART_KEY);
            localStorage.removeItem(CART_KEY + '_ts');
          } else {
            localStorage.setItem(CART_KEY, JSON.stringify(valid));
            /* نحتفظ بالطابع الزمني كما هو — المستخدم أضاف المنتجات فعلاً */
          }
        }
      } catch {
        localStorage.removeItem(CART_KEY);
      }
    },
    add (catalogId) {
      const p = window.SHOP_CATALOG.find(c => c.catalogId === catalogId);
      if (!p || p.hidden) return false;

      /* الاشتراكات الرقمية تُطلب عبر الواتساب فقط — لا تدخل السلة إطلاقاً.
         حماية على مستوى منطق السلة نفسه (وليس فقط بإخفاء الزر) حتى لا
         يدخل أي اشتراك رقمي السلة مهما كان مصدر الاستدعاء. */
      if (p.category === 'subscriptions') {
        showToast('يُطلب هذا المنتج عبر الواتساب فقط.', 'warn');
        return false;
      }

      /* حماية: رفض المنتجات غير المتوفرة */
      if (p.available === false) {
        showToast('عذرًا، نفذت الكمية من هذا المنتج حالياً.');
        return false;
      }

      const items = this.get();
      const found = items.find(i => i.catalogId === catalogId);
      if (found) {
        found.qty += 1;
      } else {
        items.push({
          catalogId:    p.catalogId,
          name:         p.name,
          shortName:    p.shortName,
          price:        p.price,
          priceDisplay: p.priceDisplay || null,
          image:        p.image,
          qty:          1,
        });
      }
      this.save(items);
      return true;
    },
    updateQty (catalogId, qty) {
      if (qty < 1) { this.remove(catalogId); return; }
      const items = this.get();
      const it    = items.find(i => i.catalogId === catalogId);
      if (it) { it.qty = qty; this.save(items); }
    },
    remove (catalogId) {
      this.save(this.get().filter(i => i.catalogId !== catalogId));
    },
    clear ()  { localStorage.removeItem(CART_KEY); localStorage.removeItem(CART_KEY + '_ts'); },
    /* Only count visible (non-hidden, valid catalog) items */
    count () {
      const catalog = window.SHOP_CATALOG || [];
      return this.get().reduce((s, i) => {
        const p = catalog.find(c => c.catalogId === i.catalogId);
        return (p && !p.hidden) ? s + i.qty : s;
      }, 0);
    },
    total () {
      const catalog = window.SHOP_CATALOG || [];
      return this.get().reduce((s, i) => {
        const p = catalog.find(c => c.catalogId === i.catalogId);
        return (p && !p.hidden) ? s + i.price * i.qty : s;
      }, 0);
    },
    /* هل توجد منتجات غير متوفرة في السلة؟ */
    hasUnavailable () {
      const catalog = window.SHOP_CATALOG || [];
      return this.get().some(i => {
        const p = catalog.find(c => c.catalogId === i.catalogId);
        return p && !p.hidden && p.available === false;
      });
    },
  };

  window.DerradjCart = Cart;

  /* ══════════════════════════════════════════════════════════
     تحديث عداد السلة في الهيدر
  ══════════════════════════════════════════════════════════ */
  function updateBadge () {
    const cnt = Cart.count();
    document.querySelectorAll('.cart-badge').forEach(el => {
      el.textContent   = cnt > 9 ? '9+' : String(cnt);
      el.style.display = cnt > 0 ? 'flex' : 'none';
    });
  }

  /* ══════════════════════════════════════════════════════════
     إشعار توست
  ══════════════════════════════════════════════════════════ */
  function showToast (msg, type) {
    let t = document.getElementById('cartToast');
    if (!t) {
      t = document.createElement('div');
      t.id        = 'cartToast';
      t.className = 'cart-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className   = 'cart-toast' + (type === 'warn' ? ' cart-toast--warn' : '') + ' show';
    clearTimeout(t._tmr);
    t._tmr = setTimeout(() => t.classList.remove('show'), 3200);
  }

  /* ══════════════════════════════════════════════════════════
     تنسيق السعر: دج على اليسار، الرقم على اليمين
     مثال: دج 1,500  (اتجاه LTR معزول داخل سياق RTL)
  ══════════════════════════════════════════════════════════ */
  function formatCartPrice (value) {
    return '<span class="cart-price-fixed">' +
             '<span class="cart-price-currency">دج</span>' +
             '<span class="cart-price-number">' + Number(value).toLocaleString('en-US') + '</span>' +
           '</span>';
  }

  /* ══════════════════════════════════════════════════════════
     عرض محتوى السلة
  ══════════════════════════════════════════════════════════ */
  function renderCart () {
    const body   = document.getElementById('cartSidebarBody');
    const footer = document.getElementById('cartSidebarFooter');
    if (!body || !footer) return;

    /* تصفية المنتجات المخفية أو غير الصالحة */
    const items = Cart.get().filter(item => {
      if (!item || typeof item.catalogId !== 'number') return false;
      const p = (window.SHOP_CATALOG || []).find(c => c.catalogId === item.catalogId);
      return p && !p.hidden;
    });

    if (!items.length) {
      body.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon">🛒</div>
          <p class="cart-empty-title">السلة فارغة</p>
          <span class="cart-empty-sub">أضف منتجًا لتبدأ طلبك</span>
        </div>`;
      footer.innerHTML = `
        <button class="cart-checkout-btn" disabled>
          السلة فارغة — أضف منتجًا أولاً
        </button>`;
      return;
    }

    /* التحقق من وجود منتجات غير متوفرة */
    const catalog      = window.SHOP_CATALOG || [];
    const hasUnavail   = items.some(item => {
      const p = catalog.find(c => c.catalogId === item.catalogId);
      return p && p.available === false;
    });

    body.innerHTML = items.map(item => {
      const p         = catalog.find(c => c.catalogId === item.catalogId);
      const isUnavail = p && p.available === false;
      /* Always prefer the live catalog image — guards against stale localStorage paths */
      const imgSrc = (p && p.image) ? p.image : (item.image || '');

      return `
      <div class="cart-item${isUnavail ? ' cart-item--unavailable' : ''}" data-cid="${item.catalogId}">
        <div class="cart-item-img-wrap">
          ${imgSrc
            ? `<img src="${imgSrc}" alt="${item.shortName || item.name}"
                 class="cart-item-img" loading="lazy"
                 onerror="this.closest('.cart-item-img-wrap').innerHTML='📦'">`
            : '📦'
          }
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.shortName || item.name}</div>
          ${isUnavail
            ? `<div class="cart-item-unavail-badge">🔴 نفذت الكمية</div>`
            : `<div class="cart-item-price">${item.priceDisplay ? item.priceDisplay : formatCartPrice(item.price)} / وحدة</div>
               <div class="cart-item-sub">${item.priceDisplay ? '—' : formatCartPrice(item.price * item.qty)}</div>`
          }
        </div>
        <div class="cart-item-actions">
          ${isUnavail
            ? ''
            : `<div class="cart-qty-row">
                 <button class="cart-qty-btn" data-action="dec" data-cid="${item.catalogId}">−</button>
                 <span class="cart-qty-val">${item.qty}</span>
                 <button class="cart-qty-btn" data-action="inc" data-cid="${item.catalogId}">+</button>
               </div>`
          }
          <button class="cart-del-btn" data-cid="${item.catalogId}" title="حذف المنتج">🗑</button>
        </div>
      </div>`;
    }).join('');

    const total = Cart.total();

    if (hasUnavail) {
      footer.innerHTML = `
        <div class="cart-unavail-warning">
          ⚠️ بعض المنتجات في سلتك نفذت كميتها. احذفها لإتمام الطلب.
        </div>
        <div class="cart-total-row">
          <span>مجموع المنتجات المتوفرة</span>
          <strong>${formatCartPrice(total)}</strong>
        </div>
        <div class="cart-free-ship">🚚 سعر التوصيل يُحسب حسب الولاية عند إتمام الطلب</div>
        <button class="cart-checkout-btn" disabled style="background:#94a3b8;cursor:not-allowed;">
          🚫 احذف المنتجات غير المتوفرة أولاً
        </button>`;
    } else {
      footer.innerHTML = `
        <div class="cart-total-row">
          <span>المجموع الكلي</span>
          <strong>${formatCartPrice(total)}</strong>
        </div>
        <div class="cart-free-ship">🚚 سعر التوصيل يُحسب حسب الولاية عند إتمام الطلب</div>
        <button class="cart-checkout-btn" id="cartCheckoutBtn">✅ إتمام الطلب</button>`;
    }

    /* أحداث أزرار الكمية */
    body.querySelectorAll('.cart-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid  = parseInt(btn.dataset.cid);
        const item = Cart.get().find(i => i.catalogId === cid);
        if (!item) return;
        Cart.updateQty(cid, btn.dataset.action === 'inc' ? item.qty + 1 : item.qty - 1);
        updateBadge();
        renderCart();
      });
    });

    /* أحداث زر الحذف */
    body.querySelectorAll('.cart-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Cart.remove(parseInt(btn.dataset.cid));
        updateBadge();
        renderCart();
      });
    });

    /* زر إتمام الطلب → صفحة الدفع */
    document.getElementById('cartCheckoutBtn')?.addEventListener('click', () => {
      if (!Cart.count()) return;
      window.location.href = BASE + '/ordre/index.html';
    });
  }

  /* ══════════════════════════════════════════════════════════
     فتح / إغلاق السلة
  ══════════════════════════════════════════════════════════ */
  function openCart () {
    document.getElementById('cartSidebar')?.classList.add('open');
    document.getElementById('cartOverlay')?.classList.add('open');
    document.body.classList.add('cart-body-lock');
    renderCart();
  }

  function closeCart () {
    document.getElementById('cartSidebar')?.classList.remove('open');
    document.getElementById('cartOverlay')?.classList.remove('open');
    document.body.classList.remove('cart-body-lock');
  }

  window.DerradjCartUI = { open: openCart, close: closeCart, showToast };

  /* ══════════════════════════════════════════════════════════
     تهيئة الصفحة
  ══════════════════════════════════════════════════════════ */
  let catalogLoaded = false;
  function init () {
    /* إنشاء Sidebar السلة */
    const sidebar = document.createElement('aside');
    sidebar.className = 'cart-sidebar';
    sidebar.id = 'cartSidebar';
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', 'سلة التسوق');
    sidebar.innerHTML = `
      <div class="cart-sidebar-header">
        <h2 class="cart-sidebar-title">🛒 سلة التسوق</h2>
        <button class="cart-close-btn" id="cartCloseBtn" aria-label="إغلاق السلة">✕</button>
      </div>
      <div class="cart-sidebar-body" id="cartSidebarBody"></div>
      <div class="cart-sidebar-footer" id="cartSidebarFooter"></div>`;

    /* إنشاء Overlay الخلفية */
    const overlay = document.createElement('div');
    overlay.className = 'cart-overlay';
    overlay.id = 'cartOverlay';

    document.body.appendChild(overlay);
    document.body.appendChild(sidebar);

    /* إضافة CSS لحالة عدم التوفر */
    const style = document.createElement('style');
    style.textContent = `
      .cart-item--unavailable { opacity: .85; border-right: 3px solid #f59e0b !important; background: #fffbeb !important; }
      .cart-item-unavail-badge { display:inline-flex; align-items:center; gap:4px; background:#fef3c7; color:#92400e; border:1px solid #fde68a; border-radius:99px; padding:3px 10px; font-size:11px; font-weight:800; margin-top:4px; }
      .cart-unavail-warning { background:#fef3c7; border:1px solid #fde68a; border-radius:10px; padding:10px 14px; font-size:13px; color:#78350f; font-weight:700; margin-bottom:10px; line-height:1.5; }
      .cart-toast--warn { background:#d97706 !important; }
      [data-add-to-cart].btn-unavailable, button.btn-unavailable { opacity:.65 !important; cursor:not-allowed !important; }

      /* ── Cart price layout: دج [LEFT] · number [RIGHT] ── */
      .cart-price-fixed {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        direction: ltr;        /* isolates from page RTL so order is always LTR */
        unicode-bidi: isolate;
        white-space: nowrap;
      }
      .cart-price-currency { order: 1; }   /* دج  — appears LEFT  */
      .cart-price-number   { order: 2; }   /* 1,500 — appears RIGHT */
    `;
    document.head.appendChild(style);

    /* إغلاق عند الضغط على الخلفية أو زر ✕ أو مفتاح Escape */
    overlay.addEventListener('click', closeCart);
    document.getElementById('cartCloseBtn')?.addEventListener('click', closeCart);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

    /* ربط زر فتح السلة في الهيدر */
    document.querySelectorAll('.cart-btn').forEach(btn => {
      btn.addEventListener('click', openCart);
    });

    /* ربط أزرار "أضف إلى السلة" — Event Delegation على document
       يدعم الأزرار المُنشأة ديناميكيًا بعد إعادة عرض الشبكة */
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-add-to-cart]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const cid = parseInt(btn.dataset.addToCart);
      if (isNaN(cid)) return;
      if (Cart.add(cid)) {
        updateBadge();
        /* تأثير bounce على أيقونة السلة */
        document.querySelectorAll('.cart-btn').forEach(b => {
          b.classList.add('cart-btn--bounce');
          setTimeout(() => b.classList.remove('cart-btn--bounce'), 600);
        });
        showToast('✅ تمت إضافة المنتج إلى السلة');
      }
    });

    /* ══════════════════════════════════════════════════════════
       "اطلب الكتاب الآن" (btn-buy-now) — يمسح السلة القديمة،
       يضيف هذا الكتاب فقط، ثم يوجّه المستخدم لصفحة الطلب.
       هذا يمنع ظهور كتب قديمة من جلسة سابقة.
    ══════════════════════════════════════════════════════════ */
    document.addEventListener('click', function (e) {
      const link = e.target.closest('.btn-buy-now');
      if (!link) return;
      e.preventDefault();
      e.stopPropagation();

      /* البحث عن catalogId من زر "أضف إلى السلة" في نفس مقطع الأزرار */
      const container = link.closest('.product-cta-buttons') || link.parentElement;
      const addBtn    = container ? container.querySelector('[data-add-to-cart]') : null;
      const cid       = addBtn ? parseInt(addBtn.dataset.addToCart) : NaN;

      if (!isNaN(cid)) {
        const p = (window.SHOP_CATALOG || []).find(c => c.catalogId === cid);
        if (p && !p.hidden) {
          if (p.available === false) {
            showToast('عذرًا، نفذت الكمية من هذا المنتج حالياً.', 'warn');
            return;
          }
          /* مسح السلة القديمة وإضافة هذا الكتاب فقط (Cart.save يُحدّث الطابع الزمني) */
          Cart.clear();
          Cart.add(cid);
        }
      }
      /* الانتقال لصفحة الطلب سواء أُضيف الكتاب أم لا */
      window.location.href = BASE + '/ordre/';
    });

    updateBadge();

    /* ══════════════════════════════════════════════════════════
       تأجيل Cart.sanitize() لحين اكتمال الكتالوج الحقيقي من Supabase

       عند بدء الصفحة، window.SHOP_CATALOG لا يحوي إلا المنتجات
       المخفية القديمة (أعلى الملف) — الكتب والمنتجات الإلكترونية
       الحقيقية تُضاف إليه بشكل غير متزامن بعد نجاح طلب
       products-loader.js إلى Supabase.

       تشغيل sanitize() قبل اكتمال هذا الطلب كان يعتبر كل منتج
       حقيقي في السلة "غير موجود بالكتالوج" فيحذفه فوراً من
       localStorage — وهذا هو السبب الحقيقي لاختفاء السلة عند كل
       تحديث/تنقل/إعادة فتح للمتصفح. الآن sanitize() (ومعها تحديث
       الشارة وعرض السلة) لا تُنفَّذ إلا بعد حدث derradj:catalog-loaded
       الذي يُطلقه products-loader.js عند اكتمال الكتالوج الحقيقي،
       فلا تُحذف عناصر صحيحة بالخطأ بعد الآن.
    ══════════════════════════════════════════════════════════ */
    function onCatalogLoaded () {
      if (catalogLoaded) return;
      catalogLoaded = true;
      Cart.sanitize();
      updateBadge();
      renderCart();
      /* products-loader.js وضع الآن قيم available الحقيقية (من
         stock_status) في SHOP_CATALOG — طبّقها على الأزرار والشارات */
      updateAddToCartButtons();
    }
    document.addEventListener('derradj:catalog-loaded', onCatalogLoaded);

    /* ── سباق تسجيل المستمع مقابل إطلاق الحدث ──
       عندما تكون ذاكرة products-loader.js التخزينية دافئة (تصفح/تحديث
       الصفحة خلال 3 دقائق)، يكتمل load() هناك بشكل متزامن بالكامل —
       بما في ذلك إطلاق derradj:catalog-loaded — قبل أن يبدأ init()
       هنا أصلاً (مستمعا الحدثين DOMContentLoaded يُنفَّذان بترتيب
       التسجيل، فيسبقنا products-loader.js دائماً). في تلك الحالة يفوت
       المستمع أعلاه الحدث تماماً، وتبقى الأزرار معطلة "..." حتى مهلة
       الأمان أدناه — حتى لو كانت البيانات الصحيحة جاهزة فعلاً. تحقّق
       هنا مباشرة: إن كان window.SUPABASE_PRODUCTS مملوءًا بالفعل، فقد
       فات الحدث ويجب تطبيق الحالة الصحيحة فوراً بدل الانتظار. ── */
    if (window.SUPABASE_PRODUCTS && window.SUPABASE_PRODUCTS.length > 0) {
      onCatalogLoaded();
    } else {
      /* حالة تحميل آمنة: تعطيل الأزرار وإخفاء الشارات قبل اكتمال الكتالوج
         يمنع الـ flash الذي يُظهر المنتج "متوفر" قبل معرفة الحقيقة */
      setAvailabilityLoadingState();

      /* شبكة بطيئة أو معطّلة: لا تُبقِ الأزرار معطلة "..." إلى الأبد —
         فعّلها بالقيم الافتراضية (available: true) إن لم يصل الكتالوج
         الحقيقي خلال مهلة معقولة. */
      setTimeout(function () {
        if (!catalogLoaded) updateAddToCartButtons();
      }, 6000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
