/* ============================================================
   cart.js — Derradj Shop | نظام السلة المشترك
   يعمل على جميع صفحات المتجر — يحفظ البيانات في localStorage
   ============================================================ */
(function () {
  'use strict';

  const CART_KEY = 'derradj_cart';
  const BASE     = window.location.origin; /* https://www.derradjshop.com */

  /* ══════════════════════════════════════════════════════════
     كتالوج المنتجات — يجب أن تتطابق (name, price, catalogId)
     مع PRODUCTS_CATALOG في ordre/index.html
     catalogId = index في PRODUCTS_CATALOG (يبدأ من 0)
  ══════════════════════════════════════════════════════════ */
  window.SHOP_CATALOG = [
    /* ── منتجات مخفية (احتفاظ بها لتطابق catalogId — لا تظهر للمستخدم) ── */
    { catalogId: 0, name: 'Electronics Components Kit',       shortName: 'Electronics Components Kit',  price: 7000, hidden: true, image: '' },
    { catalogId: 1, name: 'YNINCH Super Learning Kit Arduino', shortName: 'YNINCH Super Learning Kit', price: 7300, hidden: true, image: '' },
    /* ── الكتب (catalogId يتطابق مع id في books-data.js) ─ */
    { catalogId: 2,  name: 'العادات السبع للناس الأكثر فعالية',   shortName: 'العادات السبع',                    price: 1400, image: BASE + '/books/7-habits/main.png' },
    { catalogId: 3,  name: 'العادات الذرية',                       shortName: 'العادات الذرية',                   price: 950,  image: BASE + '/books/atomic-habits/main.png' },
    { catalogId: 4,  name: 'قاعدة الـ 333',                        shortName: 'قاعدة الـ 333',                    price: 1350, image: BASE + '/books/rule-333/main.png' },
    { catalogId: 5,  name: 'الأثر المذهل للعادات البسيطة',         shortName: 'الأثر المذهل للعادات البسيطة',    price: 1200, image: BASE + '/books/small-habits-revolution/main.png' },
    { catalogId: 6,  name: 'متعة عدم الكمال',                      shortName: 'متعة عدم الكمال',                  price: 900,  image: BASE + '/books/joy-of-imperfection/main.png' },
    { catalogId: 7,  name: 'الشجاعة تنادي',                        shortName: 'الشجاعة تنادي',                    price: 1300, image: BASE + '/books/courage-is-calling/main.png' },
    { catalogId: 8,  name: 'قوة الآن',                             shortName: 'قوة الآن',                         price: 1100, image: BASE + '/books/power-of-now/main.png' },
    { catalogId: 9,  name: 'بروباغندا',                            shortName: 'بروباغندا',                        price: 1100, image: BASE + '/books/propaganda/main.png' },
    { catalogId: 10, name: 'فوضى الإدارة',                         shortName: 'فوضى الإدارة',                     price: 1600, image: BASE + '/books/management-mess/main.png' },
    { catalogId: 11, name: 'السعادة الحقيقية والسعادة الزائفة',    shortName: 'السعادة الحقيقية والزائفة',        price: 1600, image: BASE + '/books/myths-of-happiness/main.png' },
    { catalogId: 12, name: 'مسارات السعادة',                       shortName: 'مسارات السعادة',                   price: 1300, image: BASE + '/books/happy-ever-after/main.png' },
    { catalogId: 13, name: 'في عالم الأشباح الجائعة',              shortName: 'في عالم الأشباح الجائعة',         price: 1800, image: BASE + '/books/hungry-ghosts/main.png' },
    { catalogId: 14, name: 'تاريخ موجز للزمان',                    shortName: 'تاريخ موجز للزمان',                price: 1200, image: BASE + '/books/brief-history-of-time/main.png' },
    { catalogId: 15, name: 'الجسد لا ينسى',                        shortName: 'الجسد لا ينسى',                    price: 1800, hidden: true, image: '' },
    { catalogId: 16, name: 'متعة أن تكون في الثلاثين',             shortName: 'متعة أن تكون في الثلاثين',        price: 950,  image: BASE + '/books/joy-of-thirties/main.png' },
    { catalogId: 17, name: 'كن مع الشخص الذي يجعلك سعيداً',       shortName: 'كن مع من يجعلك سعيداً',           price: 1200, image: BASE + '/books/be-happy-with-someone/main.png' },
    { catalogId: 18, name: 'الثالوث المظلم',                       shortName: 'الثالوث المظلم',                   price: 1200, hidden: true, image: '' },
    { catalogId: 19, name: 'كيف تتقن فن البيع',                    shortName: 'كيف تتقن فن البيع',                price: 1500, hidden: true, image: '' },
    { catalogId: 20, name: 'الذكاء العاطفي',                       shortName: 'الذكاء العاطفي',                   price: 1600, image: BASE + '/books/emotional-intelligence/main.png' },
    { catalogId: 21, name: 'كيف تبيع أي شيء لأي إنسان',           shortName: 'كيف تبيع أي شيء لأي إنسان',      price: 1100, image: BASE + '/books/sell-anything/main.png' },
  ];

  /* ══════════════════════════════════════════════════════════
     إدارة بيانات السلة (localStorage)
  ══════════════════════════════════════════════════════════ */
  const Cart = {
    get () {
      try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
      catch { return []; }
    },
    save (items) {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    },
    add (catalogId) {
      const items = this.get();
      const found = items.find(i => i.catalogId === catalogId);
      if (found) {
        found.qty += 1;
      } else {
        const p = window.SHOP_CATALOG.find(c => c.catalogId === catalogId);
        if (!p || p.hidden) return false;   /* رفض المنتجات المخفية */
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
    count ()  { return this.get().reduce((s, i) => s + i.qty, 0); },
    total ()  { return this.get().reduce((s, i) => s + i.price * i.qty, 0); },
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
  function showToast (msg) {
    let t = document.getElementById('cartToast');
    if (!t) {
      t = document.createElement('div');
      t.id        = 'cartToast';
      t.className = 'cart-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tmr);
    t._tmr = setTimeout(() => t.classList.remove('show'), 2800);
  }

  /* ══════════════════════════════════════════════════════════
     عرض محتوى السلة
  ══════════════════════════════════════════════════════════ */
  function renderCart () {
    const body   = document.getElementById('cartSidebarBody');
    const footer = document.getElementById('cartSidebarFooter');
    if (!body || !footer) return;

    /* تصفية المنتجات المخفية من localStorage قبل العرض */
    const items = Cart.get().filter(item => {
      const p = (window.SHOP_CATALOG || []).find(c => c.catalogId === item.catalogId);
      return !p || !p.hidden;
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

    body.innerHTML = items.map(item => `
      <div class="cart-item" data-cid="${item.catalogId}">
        <div class="cart-item-img-wrap">
          <img src="${item.image}" alt="${item.shortName || item.name}"
               class="cart-item-img" loading="lazy"
               onerror="this.parentElement.innerHTML='📦'">
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.shortName || item.name}</div>
          <div class="cart-item-price">${item.priceDisplay ? item.priceDisplay : item.price.toLocaleString('en-US') + ' دج'} / وحدة</div>
          <div class="cart-item-sub">${item.priceDisplay ? '—' : (item.price * item.qty).toLocaleString('en-US') + ' دج'}</div>
        </div>
        <div class="cart-item-actions">
          <div class="cart-qty-row">
            <button class="cart-qty-btn" data-action="dec" data-cid="${item.catalogId}">−</button>
            <span class="cart-qty-val">${item.qty}</span>
            <button class="cart-qty-btn" data-action="inc" data-cid="${item.catalogId}">+</button>
          </div>
          <button class="cart-del-btn" data-cid="${item.catalogId}" title="حذف المنتج">🗑</button>
        </div>
      </div>`).join('');

    const total = Cart.total();
    footer.innerHTML = `
      <div class="cart-total-row">
        <span>المجموع الكلي</span>
        <strong>${total.toLocaleString('en-US')} دج</strong>
      </div>
      <div class="cart-free-ship">🚚 سعر التوصيل يُحسب حسب الولاية عند إتمام الطلب</div>
      <button class="cart-checkout-btn" id="cartCheckoutBtn">✅ إتمام الطلب</button>`;

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

    updateBadge();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
