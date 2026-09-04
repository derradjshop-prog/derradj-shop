/* ============================================================
   business-contact.js — Derradj Shop
   Single source of truth for the site-wide business phone/WhatsApp
   number, admin-editable from admin.html ("اتصال العمل" tab, see
   admin/business-contact-settings.js) and stored in
   public.site_settings (key: business_phone).

   Every normal customer-facing page loads this script and marks its
   phone/WhatsApp elements with:
     data-business-tel              → element's href becomes tel:+<intl>
     data-business-phone-display    → element's text becomes the
                                       formatted local display number
     data-business-phone-display-intl → element's text becomes the
                                       formatted "+213 ..." international
                                       display (for WhatsApp-style mentions)
     data-business-wa               → element's href becomes
                                       https://wa.me/<intl>[?text=...],
                                       preserving data-wa-message (or
                                       any existing ?text= query) as-is
   This script then fetches the current value and updates those
   elements — no page needs to be rebuilt for a number change to show
   up; a returning visitor sees the cached value instantly and the
   fresh value a moment later.

   ── Electronic Subscriptions exclusion (explicit, not accidental) ──
   subscriptions/index.html and the generated subscription product
   pages set window.WHATSAPP_NUMBER/WHATSAPP_DISPLAY *before* this
   script would run, to route to their own dedicated, independently
   hardcoded number (see js/product-template.js's
   WHATSAPP_NUMBER_SUBSCRIPTIONS). This script checks that flag first
   and does nothing at all — no fetch, no DOM writes — when it is set,
   so the global business number can never reach that page. Those
   pages also simply don't include this <script> tag at all; the
   self-check here is a second, defense-in-depth guard.
   ============================================================ */
(function (root) {
  'use strict';

  if (root.WHATSAPP_NUMBER) return; // Subscriptions override active — stay out entirely.

  var DEFAULT_PHONE = { local: '0776922882', display: '0776 92 28 82', intl: '213776922882' };

  var SUPABASE_URL = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk';
  var CACHE_KEY = 'dz_business_phone_v1';

  /* Accepts 0776922882 / 0776 92 28 82 / 0776-92-28-82 / 213776922882 /
     +213776922882 / 00213776922882 — returns null if it isn't a
     10-digit Algerian mobile/local number once normalized. */
  function normalize(raw) {
    var digits = String(raw == null ? '' : raw).replace(/\D/g, '');
    if (digits.indexOf('00213') === 0) digits = digits.slice(2);
    if (digits.indexOf('213') === 0 && digits.length === 12) digits = '0' + digits.slice(3);
    if (digits.length !== 10 || digits.charAt(0) !== '0') return null;
    return {
      local: digits,
      intl: '213' + digits.slice(1),
      display: digits.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4'),
    };
  }

  var current = DEFAULT_PHONE;
  try {
    var cached = JSON.parse(root.localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && normalize(cached.local)) current = cached;
  } catch (e) { /* localStorage unavailable (private mode, etc.) — keep default */ }

  root.BUSINESS_PHONE = current;

  function applyToDom() {
    var d = document;
    var tels = d.querySelectorAll('[data-business-tel]');
    for (var i = 0; i < tels.length; i++) tels[i].setAttribute('href', 'tel:+' + current.intl);

    var labels = d.querySelectorAll('[data-business-phone-display]');
    for (var j = 0; j < labels.length; j++) labels[j].textContent = current.display;

    var intlLabels = d.querySelectorAll('[data-business-phone-display-intl]');
    var intlDisplay = '+' + current.intl.replace(/(\d{3})(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
    for (var m = 0; m < intlLabels.length; m++) intlLabels[m].textContent = intlDisplay;

    var was = d.querySelectorAll('[data-business-wa]');
    for (var k = 0; k < was.length; k++) {
      var el = was[k];
      var msg = el.getAttribute('data-wa-message');
      var href = 'https://wa.me/' + current.intl;
      if (msg) {
        href += '?text=' + encodeURIComponent(msg);
      } else {
        var existing = el.getAttribute('href') || '';
        var qIdx = existing.indexOf('?text=');
        if (qIdx !== -1) href += existing.slice(qIdx);
      }
      el.setAttribute('href', href);
    }

    d.dispatchEvent(new CustomEvent('business-phone-ready', { detail: current }));
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(applyToDom);

  fetch(SUPABASE_URL + '/rest/v1/site_settings?key=eq.business_phone&select=value', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rows) {
      var value = rows && rows[0] && rows[0].value;
      var normalized = value && normalize(value.local);
      if (!normalized) return;
      current = normalized;
      root.BUSINESS_PHONE = current;
      try { root.localStorage.setItem(CACHE_KEY, JSON.stringify(current)); } catch (e) {}
      ready(applyToDom);
    })
    .catch(function () { /* offline / blocked — keep cached/default value */ });
})(window);
