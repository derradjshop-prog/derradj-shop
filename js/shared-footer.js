/* ============================================================
   shared-footer.js — Derradj Shop | الفوتر المشترك لكل الصفحات
   نفس فوتر index.html بالضبط — يُحقن في أي <footer class="main-footer"
   data-shared-footer></footer> ليبقى كل الصفحات (بما فيها صفحات
   المنتجات المولّدة من Supabase) متطابقة ومتزامنة تلقائياً.
   كل الروابط مطلقة من الجذر (تبدأ بـ /) لتعمل من أي مستوى مجلد.
   ============================================================ */
(function () {
  'use strict';

  /* ── Digital subscription pages set window.WHATSAPP_NUMBER/DISPLAY
     before this script runs (subscriptions/index.html, and generated
     subscription product pages via scripts/generate-product-pages.js)
     so the footer shows their dedicated WhatsApp number — every other
     page keeps the site-wide business number. That number is
     admin-editable (site_settings.business_phone); js/business-contact.js
     resolves it into window.BUSINESS_PHONE before this script runs and
     is the source of truth here — the literal below is only the
     fallback for the rare case business-contact.js hasn't run yet. When
     no override is active, the tel link/number are also tagged with
     data-business-tel/data-business-phone-display so business-contact.js
     can update them at runtime if the admin changes the number, without
     a page rebuild. ── */
  var OVERRIDDEN = !!window.WHATSAPP_NUMBER;
  var WA_NUMBER  = window.WHATSAPP_NUMBER  || (window.BUSINESS_PHONE && window.BUSINESS_PHONE.intl)    || '213555491316';
  var WA_DISPLAY = window.WHATSAPP_DISPLAY || (window.BUSINESS_PHONE && window.BUSINESS_PHONE.display) || '0555 49 13 16';

  var FOOTER_HTML = `
    <div class="footer-top">
      <div class="footer-brand">
        <a href="/" class="footer-logo">
          <span>Derradj <span class="logo-accent">Shop</span></span>
        </a>
        <p>متجر جزائري أونلاين — منتجات متنوعة مع توصيل سريع إلى جميع ولايات الجزائر.</p>
        <div class="footer-contact-list">
          <a href="tel:+${WA_NUMBER}" class="footer-contact-link"${OVERRIDDEN ? '' : ' data-business-tel'}>
            <span class="contact-icon">📞</span>
            <span class="phone-number" dir="ltr"${OVERRIDDEN ? '' : ' data-business-phone-display'}>${WA_DISPLAY}</span>
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
          <li><a href="/Electronique/">💻 جميع الإلكترونيات</a></li>
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
