/* ==========================================================
   business-contact-settings.js — Derradj Shop | 📞 اتصال العمل
   Admin control for the site-wide business phone/WhatsApp number
   (site_settings.business_phone) that js/business-contact.js applies
   across every normal customer-facing page. Writing this key is
   restricted to admins by RLS (public.is_admin(), see
   supabase/migrations/20260827000000_business_phone_setting.sql) —
   sellers can load this tab but their save will be rejected server-side.

   Explicitly does NOT touch the Electronic Subscriptions WhatsApp
   number — that one stays hardcoded in js/product-template.js
   (WHATSAPP_NUMBER_SUBSCRIPTIONS) by design and has no admin UI.
   ========================================================== */
(function () {
  'use strict';

  if (!window.sbClient) return;
  const sb = window.sbClient;

  const SETTING_KEY = 'business_phone';
  let CURRENT = null; // { local, display, intl }
  let loadedOnce = false;

  /* Mirrors js/business-contact.js's normalize() exactly — keep both in sync. */
  function normalize(raw) {
    let digits = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (digits.indexOf('00213') === 0) digits = digits.slice(2);
    if (digits.indexOf('213') === 0 && digits.length === 12) digits = '0' + digits.slice(3);
    if (digits.length !== 10 || digits.charAt(0) !== '0') return null;
    return {
      local: digits,
      intl: '213' + digits.slice(1),
      display: digits.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4'),
    };
  }

  function showToast(msg, type = 'success') {
    const old = document.getElementById('bc-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'bc-toast';
    el.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px',
      'padding:12px 24px', 'border-radius:10px',
      'font-weight:700', 'font-size:14px', 'z-index:9999',
      'color:#fff', 'box-shadow:0 4px 20px rgba(0,0,0,.28)',
      "font-family:'Cairo',sans-serif", 'max-width:340px',
      'line-height:1.4', 'direction:rtl',
      'background:' + (type === 'error' ? '#dc2626' : '#059669'),
    ].join(';');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  async function loadCurrent() {
    try {
      const { data, error } = await sb.from('site_settings')
        .select('value').eq('key', SETTING_KEY).maybeSingle();
      if (error) throw error;
      CURRENT = normalize(data?.value?.local) || { local: '0776922882', display: '0776 92 28 82', intl: '213776922882' };
    } catch (err) {
      console.warn('[BC] failed to load business_phone:', err.message || err);
      CURRENT = { local: '0776922882', display: '0776 92 28 82', intl: '213776922882' };
      showToast('❌ فشل تحميل الرقم الحالي: ' + (err.message || ''), 'error');
    }
  }

  function render() {
    const tab = document.getElementById('tab-contact');
    if (!tab || !CURRENT) return;
    tab.innerHTML = `
      <div class="info-card" style="max-width:520px;">
        <h2 style="margin-top:0;">📞 رقم الهاتف / واتساب الرسمي</h2>
        <p style="color:#64748b;font-size:13px;line-height:1.8;">
          هذا الرقم يظهر تلقائياً في الفوتر، زر واتساب العائم، وأزرار الطلب
          عبر واتساب في كل صفحات المتجر العادية (باستثناء صفحة
          <strong>الاشتراكات الرقمية</strong> التي تحتفظ برقمها الخاص المستقل).
        </p>

        <div style="margin:20px 0;">
          <div style="font-size:12px;font-weight:800;color:#94a3b8;margin-bottom:4px;">الرقم الحالي</div>
          <div id="bcCurrentNumber" style="font-size:20px;font-weight:900;color:#1e293b;direction:ltr;text-align:right;">${esc(CURRENT.display)}</div>
        </div>

        <label style="font-size:13px;font-weight:800;color:#1e293b;display:block;margin-bottom:6px;">رقم جديد</label>
        <input type="tel" id="bcPhoneInput" class="search-input" style="direction:ltr;text-align:right;font-size:16px;"
               placeholder="0776922882" value="${esc(CURRENT.local)}">
        <div id="bcError" style="color:#dc2626;font-size:12.5px;font-weight:700;margin-top:6px;display:none;"></div>

        <button type="button" id="bcSaveBtn" style="margin-top:16px;padding:11px 24px;background:#059669;color:#fff;border:none;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;font-family:'Cairo',sans-serif;">
          💾 حفظ التغييرات
        </button>

        <p style="color:#94a3b8;font-size:12px;margin-top:18px;">
          تنسيقات مقبولة: 0776922882 — 0776 92 28 82 — 0776-92-28-82 — 213776922882
        </p>
      </div>
    `;

    document.getElementById('bcSaveBtn').addEventListener('click', handleSave);
  }

  function esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  async function handleSave() {
    const input = document.getElementById('bcPhoneInput');
    const errBox = document.getElementById('bcError');
    const btn = document.getElementById('bcSaveBtn');
    const normalized = normalize(input.value);

    if (!normalized) {
      errBox.textContent = '⚠ رقم غير صالح. أدخل رقم جزائري من 10 أرقام يبدأ بـ 0 (مثال: 0776922882).';
      errBox.style.display = '';
      return;
    }
    errBox.style.display = 'none';
    btn.disabled = true;
    btn.textContent = '⏳ جاري الحفظ...';

    try {
      const { error } = await sb.from('site_settings')
        .upsert({ key: SETTING_KEY, value: normalized });
      if (error) throw error;
      CURRENT = normalized;
      render();
      showToast('✅ تم تحديث رقم الهاتف/واتساب بنجاح.');
    } catch (err) {
      showToast('❌ فشل الحفظ: ' + (err.message || 'ليس لديك صلاحية تعديل هذا الإعداد'), 'error');
      btn.disabled = false;
      btn.textContent = '💾 حفظ التغييرات';
    }
  }

  async function load() {
    loadedOnce = true;
    await loadCurrent();
    render();
  }

  function init() {
    document.querySelectorAll('.tab-btn[data-tab="contact"]').forEach(b => {
      b.addEventListener('click', () => { if (!loadedOnce) load(); });
    });
    if (document.getElementById('tab-contact')?.classList.contains('active')) load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
  } else {
    setTimeout(init, 400);
  }
})();
