/* ============================================================
   cart.js — Derradj Shop | نظام السلة المشترك
   يعمل على جميع صفحات المتجر — يحفظ البيانات في localStorage
   ============================================================ */
(function () {
  'use strict';

  const CART_KEY = 'derradj_cart';
  const BASE     = window.location.origin;

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
    /* ── منتجات مخفية (احتفاظ بها لتطابق catalogId — لا تظهر للمستخدم) ── */
    { catalogId: 0, name: 'Electronics Components Kit',       shortName: 'Electronics Components Kit',  price: 7000, hidden: true, available: true, image: '' },
    { catalogId: 1, name: 'YNINCH Super Learning Kit Arduino', shortName: 'YNINCH Super Learning Kit', price: 7300, hidden: true, available: true, image: '' },
    /* ── الكتب (catalogId يتطابق مع id في books-data.js) ─ */
    { catalogId: 2,  name: 'العادات السبع للناس الأكثر فعالية',   shortName: 'العادات السبع',                    price: 1400, available: true, image: BASE + '/books/7-habits/main.png' },
    { catalogId: 3,  name: 'العادات الذرية',                       shortName: 'العادات الذرية',                   price: 950,  available: true, image: BASE + '/books/atomic-habits/main.png' },
    { catalogId: 4,  name: 'قاعدة الـ 333',                        shortName: 'قاعدة الـ 333',                    price: 1350, available: true, image: BASE + '/books/rule-333/main.png' },
    { catalogId: 5,  name: 'الأثر المذهل للعادات البسيطة',         shortName: 'الأثر المذهل للعادات البسيطة',    price: 1200, available: true, image: BASE + '/books/small-habits-revolution/main.png' },
    { catalogId: 6,  name: 'متعة عدم الكمال',                      shortName: 'متعة عدم الكمال',                  price: 900,  available: true, image: BASE + '/books/joy-of-imperfection/main.png' },
    { catalogId: 7,  name: 'الشجاعة تنادي',                        shortName: 'الشجاعة تنادي',                    price: 1300, available: true, image: BASE + '/books/courage-is-calling/main.png' },
    { catalogId: 8,  name: 'قوة الآن',                             shortName: 'قوة الآن',                         price: 1100, available: true, image: BASE + '/books/power-of-now/main.png' },
    { catalogId: 9,  name: 'بروباغندا',                            shortName: 'بروباغندا',                        price: 1100, available: true, image: BASE + '/books/propaganda/main.png' },
    { catalogId: 10, name: 'فوضى الإدارة',                         shortName: 'فوضى الإدارة',                     price: 1600, available: true, image: BASE + '/books/management-mess/main.png' },
    { catalogId: 11, name: 'السعادة الحقيقية والسعادة الزائفة',    shortName: 'السعادة الحقيقية والزائفة',        price: 1600, available: true, image: BASE + '/books/myths-of-happiness/main.png' },
    { catalogId: 12, name: 'مسارات السعادة',                       shortName: 'مسارات السعادة',                   price: 1300, available: true, image: BASE + '/books/happy-ever-after/main.png' },
    { catalogId: 13, name: 'في عالم الأشباح الجائعة',              shortName: 'في عالم الأشباح الجائعة',         price: 1800, available: true, image: BASE + '/books/hungry-ghosts/main.png' },
    { catalogId: 14, name: 'تاريخ موجز للزمان',                    shortName: 'تاريخ موجز للزمان',                price: 1200, available: true, image: BASE + '/books/brief-history-of-time/main.png' },
    { catalogId: 15, name: 'الجسد لا ينسى',                        shortName: 'الجسد لا ينسى',                    price: 1800, hidden: true,  available: true, image: '' },
    { catalogId: 16, name: 'متعة أن تكون في الثلاثين',             shortName: 'متعة أن تكون في الثلاثين',        price: 950,  available: true, image: BASE + '/books/joy-of-thirties/main.png' },
    { catalogId: 17, name: 'كن مع الشخص الذي يجعلك سعيداً',       shortName: 'كن مع من يجعلك سعيداً',           price: 1200, available: true, image: BASE + '/books/be-happy-with-someone/main.png' },
    { catalogId: 18, name: 'الثالوث المظلم',                       shortName: 'الثالوث المظلم',                   price: 1200, hidden: true,  available: true, image: '' },
    { catalogId: 19, name: 'كيف تتقن فن البيع',                    shortName: 'كيف تتقن فن البيع',                price: 1500, hidden: true,  available: true, image: '' },
    { catalogId: 20, name: 'الذكاء العاطفي',                       shortName: 'الذكاء العاطفي',                   price: 1600, available: true, image: BASE + '/books/emotional-intelligence/main.png' },
    { catalogId: 21, name: 'كيف تبيع أي شيء لأي إنسان',           shortName: 'كيف تبيع أي شيء لأي إنسان',      price: 1100, available: true, image: BASE + '/books/sell-anything/main.png' },
  ];

  /* ══════════════════════════════════════════════════════════
     جلب حالة التوفر من Supabase وتطبيقها على SHOP_CATALOG
  ══════════════════════════════════════════════════════════ */
  async function fetchAndApplyAvailability () {
    try {
      const res = await fetch(
        SB_URL + '/rest/v1/product_availability?select=catalog_id,available',
        {
          headers: {
            'apikey':        SB_KEY,
            'Authorization': 'Bearer ' + SB_KEY,
          },
        }
      );
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows)) return;

      /* تطبيق حالة التوفر على SHOP_CATALOG */
      rows.forEach(row => {
        const entry = window.SHOP_CATALOG.find(c => c.catalogId === row.catalog_id);
        if (entry) entry.available = row.available;
      });

      /* تطبيق حالة التوفر على BOOKS_DATA إذا كانت محملة */
      if (Array.isArray(window.BOOKS_DATA)) {
        rows.forEach(row => {
          const book = window.BOOKS_DATA.find(b => b.id === row.catalog_id);
          if (book) book.available = row.available;
        });
      }

      /* تحديث الأزرار والشارات في الصفحة الحالية */
      updateAddToCartButtons();

      /* إطلاق حدث لإعلام الصفحات الأخرى (مثل books/index.html) */
      document.dispatchEvent(new CustomEvent('derradj:availability-loaded', {
        detail: { rows },
      }));

    } catch (_) { /* نتجاهل الأخطاء — نستمر بالقيم الافتراضية */ }
  }

  /* ══════════════════════════════════════════════════════════
     تحديث أزرار "أضف إلى السلة" بناءً على حالة التوفر
  ══════════════════════════════════════════════════════════ */
  function updateAddToCartButtons () {
    document.querySelectorAll('[data-add-to-cart]').forEach(btn => {
      const cid = parseInt(btn.dataset.addToCart);
      const p   = (window.SHOP_CATALOG || []).find(c => c.catalogId === cid);
      if (!p || p.hidden) return;

      if (p.available === false) {
        btn.disabled          = true;
        btn.dataset._origText = btn.dataset._origText || btn.textContent;
        btn.textContent       = 'غير متوفر حاليا';
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
      } else {
        localStorage.setItem(CART_KEY, JSON.stringify(items));
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
          return p && !p.hidden;
        });
        if (valid.length !== parsed.length) {
          if (valid.length === 0) {
            localStorage.removeItem(CART_KEY);
          } else {
            localStorage.setItem(CART_KEY, JSON.stringify(valid));
          }
        }
      } catch {
        localStorage.removeItem(CART_KEY);
      }
    },
    add (catalogId) {
      const p = window.SHOP_CATALOG.find(c => c.catalogId === catalogId);
      if (!p || p.hidden) return false;

      /* حماية: رفض المنتجات غير المتوفرة */
      if (p.available === false) {
        showToast('عذرًا، هذا الكتاب غير متوفر حاليا.');
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
    clear ()  { localStorage.removeItem(CART_KEY); },
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

      return `
      <div class="cart-item${isUnavail ? ' cart-item--unavailable' : ''}" data-cid="${item.catalogId}">
        <div class="cart-item-img-wrap">
          <img src="${item.image}" alt="${item.shortName || item.name}"
               class="cart-item-img" loading="lazy"
               onerror="this.parentElement.innerHTML='📦'">
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.shortName || item.name}</div>
          ${isUnavail
            ? `<div class="cart-item-unavail-badge">⚠️ غير متوفر حاليا</div>`
            : `<div class="cart-item-price">${item.priceDisplay ? item.priceDisplay : item.price.toLocaleString('en-US') + ' دج'} / وحدة</div>
               <div class="cart-item-sub">${item.priceDisplay ? '—' : (item.price * item.qty).toLocaleString('en-US') + ' دج'}</div>`
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
          ⚠️ بعض المنتجات في سلتك غير متوفرة حاليا. احذفها لإتمام الطلب.
        </div>
        <div class="cart-total-row">
          <span>مجموع المنتجات المتوفرة</span>
          <strong>${total.toLocaleString('en-US')} دج</strong>
        </div>
        <div class="cart-free-ship">🚚 سعر التوصيل يُحسب حسب الولاية عند إتمام الطلب</div>
        <button class="cart-checkout-btn" disabled style="background:#94a3b8;cursor:not-allowed;">
          🚫 احذف المنتجات غير المتوفرة أولاً
        </button>`;
    } else {
      footer.innerHTML = `
        <div class="cart-total-row">
          <span>المجموع الكلي</span>
          <strong>${total.toLocaleString('en-US')} دج</strong>
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

    /* ربط أزرار "أضف إلى السلة" في صفحات المنتجات */
    document.querySelectorAll('[data-add-to-cart]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const cid = parseInt(btn.dataset.addToCart);
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
    });

    Cart.sanitize();
    updateBadge();

    /* جلب حالة التوفر من Supabase */
    fetchAndApplyAvailability();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
