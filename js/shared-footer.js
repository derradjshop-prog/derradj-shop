/* ============================================================
   shared-footer.js — Derradj Shop | الفوتر المشترك لكل الصفحات
   نفس فوتر index.html بالضبط — يُحقن في أي <footer class="main-footer"
   data-shared-footer></footer> ليبقى كل الصفحات (بما فيها صفحات
   المنتجات المولّدة من Supabase) متطابقة ومتزامنة تلقائياً.
   كل الروابط مطلقة من الجذر (تبدأ بـ /) لتعمل من أي مستوى مجلد.
   ============================================================ */
(function () {
  'use strict';

  /* ── Electronics footer links — single source of truth so every
     active electronics product always has a permanent, crawlable
     <a href> from the footer on every page. Add a new product here
     when it goes live so it can never become orphaned. ── */
  var ELECTRONICS_LINKS = [
    { url: '/product/adjustable-laptop-stand/',                                   label: '💻 حامل اللابتوب — 900 دج' },
    { url: '/product/modio-st11-smart-watch/',                                    label: '⌚ ساعة Modio ST11 — 9,800 دج' },
    { url: '/product/anker-soundcore-r50i-vg/',                                   label: '🎧 Anker R50i VG Earbuds — 4,500 دج' },
    { url: '/product/airpods-4-type-c-vrac/',                                     label: '🎧 Airpods 4 Type-C Vrac — 2,500 دج' },
    { url: '/product/hoco-j132a-20000mah-power-bank/',                            label: '🔋 Hoco J132A Power Bank — 3,950 دج' },
    { url: '/product/arduino-r3-830/',                                            label: '🔌 طقم Arduino R3 كامل 830 قطعة — 7,000 دج' },
    { url: '/product/arduino-uno-r3-super-starter-kit-with-200-components/',      label: '🔌 عدة Arduino UNO R3 للمبتدئين — 7,200 دج' },
  ];

  var electronicsLinksHtml = ELECTRONICS_LINKS.map(function (item) {
    return '<li><a href="' + item.url + '">' + item.label + '</a></li>';
  }).join('\n          ');

  var FOOTER_HTML = `
    <div class="footer-top">
      <div class="footer-brand">
        <a href="/" class="footer-logo">
          <span>Derradj <span class="logo-accent">Shop</span></span>
        </a>
        <p>متجر جزائري أونلاين — منتجات متنوعة مع توصيل سريع إلى جميع ولايات الجزائر.</p>
        <div class="footer-contact-list">
          <a href="tel:+213 542 94 99 67" class="footer-contact-link">
            <span class="contact-icon">📞</span>
            <span class="phone-number" dir="ltr">0542 94 99 67</span>
          </a>
          <a href="mailto:derradjshop@gmail.com">📧 derradjshop@gmail.com</a>
          <span>📍 الجزائر العاصمة، الجزائر</span>
        </div>
      </div>

      <div class="footer-links-col">
        <h4>الكتب</h4>
        <ul>
          <li><a href="/books/">📚 جميع الكتب</a></li>
          <li><a href="/books/">تطوير الذات</a></li>
          <li><a href="/books/">الفلسفة والفكر</a></li>
          <li><a href="/books/">علم النفس</a></li>
          <li><a href="/books/">الإدارة والأعمال</a></li>
        </ul>
        <h4 style="margin-top:16px;">إلكترونيات</h4>
        <ul>
          ${electronicsLinksHtml}
        </ul>
      </div>

      <div class="footer-links-col">
        <h4>المتجر</h4>
        <ul>
          <li><a href="/about">من نحن</a></li>
          <li><a href="/delivery">سياسة التوصيل</a></li>
          <li><a href="/payment">الدفع والضمان</a></li>
          <li><a href="/faq">الأسئلة الشائعة</a></li>
          <li><a href="/contact">تواصل معنا</a></li>
          <li><a href="/return-policy">سياسة الإرجاع</a></li>
          <li><a href="/terms">الشروط والأحكام</a></li>
        </ul>
      </div>

      <div class="footer-links-col">
        <h4>الدعم</h4>
        <ul>
          <li><a href="/ordre/">اطلب الآن</a></li>
          <li><a href="/faq">كيف أطلب؟</a></li>
          <li><a href="/contact">خدمة العملاء</a></li>
        </ul>
        <div style="margin-top:20px;">
          <h4>طريقة الدفع</h4>
          <div class="footer-pay-badge">💳 دفع مسبق (CCP / BaridiMob)</div>
          <div class="footer-pay-badge" style="margin-top:8px;">🏠 دفع عند الاستلام</div>
        </div>
      </div>
    </div>

    <div class="footer-bottom">
      <p>© ${new Date().getFullYear()} Derradj Shop — جميع الحقوق محفوظة | المتجر الجزائري أونلاين</p>
    </div>
  `;

  document.querySelectorAll('footer.main-footer[data-shared-footer]').forEach(function (el) {
    el.innerHTML = FOOTER_HTML;
  });
})();
