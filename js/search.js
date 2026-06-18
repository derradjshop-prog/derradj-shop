/* ============================================================
   search.js — Derradj Shop | واجهة البحث العام
   يعتمد على window.SEARCH_PRODUCTS (من search-products.js)
   ============================================================ */
(function () {
  'use strict';

  /* ── تطبيع النص للمطابقة العربية واللاتينية ── */
  function norm(s) {
    if (!s) return '';
    return String(s)
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .toLowerCase()
      .trim();
  }

  /* ── حساب درجة التطابق ── */
  function calcScore(product, query) {
    var nq = norm(query);
    if (nq.length < 2) return 0;

    var kw = product.keywords;
    var kwStr = Array.isArray(kw) ? kw.join(' ') : (typeof kw === 'string' ? kw : '');
    var haystack = norm([
      product.name        || '',
      product.nameEn      || '',
      product.nameFr      || '',
      product.author      || '',
      product.category    || '',
      product.subcategory || '',
      product.description || '',
      product.slug        || '',
      kwStr
    ].join(' '));

    /* مطابقة كاملة */
    if (haystack.indexOf(nq) !== -1) return 3;

    /* مطابقة كل كلمة */
    var words = nq.split(/\s+/).filter(function (w) { return w.length > 1; });
    if (!words.length) return 0;
    var hits = 0;
    for (var i = 0; i < words.length; i++) {
      if (haystack.indexOf(words[i]) !== -1) hits++;
    }
    if (hits === words.length) return 2;
    return hits > 0 ? (hits / words.length) : 0;
  }

  function runSearch(query) {
    var products = window.SEARCH_PRODUCTS || [];
    var q = String(query || '').trim();
    if (q.length < 2) return [];
    var scored = [];
    for (var i = 0; i < products.length; i++) {
      var s = calcScore(products[i], q);
      if (s > 0) scored.push({ p: products[i], s: s });
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, 8).map(function (x) { return x.p; });
  }

  /* ── مساعدات HTML ── */
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function trunc(str, n) {
    var s = String(str || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  function fmtPrice(n) {
    return (+n).toLocaleString('ar-DZ') + ' دج';
  }

  /* ── عرض النتائج ── */
  function renderResults(results, query) {
    var el = document.getElementById('gsResults');
    if (!el) return;

    if (!results.length) {
      el.innerHTML =
        '<div class="gs-no-results">لا توجد نتائج لـ &ldquo;<strong>' +
        esc(trunc(query, 40)) + '</strong>&rdquo;</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < results.length; i++) {
      var p = results[i];
      html +=
        '<a href="' + esc(p.url) + '" class="gs-result" role="option" tabindex="0" data-idx="' + i + '">' +
          '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '"' +
               ' class="gs-result-img" loading="lazy"' +
               ' onerror="this.style.visibility=\'hidden\'">' +
          '<div class="gs-result-info">' +
            '<div class="gs-result-name">' + esc(p.name) + '</div>' +
            '<div class="gs-result-meta">' +
              '<span class="gs-result-cat">' + esc(p.category) + '</span>' +
              '<span class="gs-result-price">' + esc(fmtPrice(p.price)) + '</span>' +
            '</div>' +
            (p.author
              ? '<div class="gs-result-author">' + esc(p.author) + '</div>'
              : '') +
            (p.description
              ? '<div class="gs-result-desc">' + esc(trunc(p.description, 80)) + '</div>'
              : '') +
          '</div>' +
        '</a>';
    }
    el.innerHTML = html;
  }

  /* ── فتح / إغلاق اللوحة ── */
  function openSearch() {
    var overlay  = document.getElementById('gsOverlay');
    var backdrop = document.getElementById('gsBackdrop');
    var btn      = document.getElementById('gsBtn');
    var input    = document.getElementById('gsInput');
    if (!overlay) return;
    overlay.classList.add('gs-open');
    if (backdrop) backdrop.classList.add('gs-active');
    if (btn)      btn.setAttribute('aria-expanded', 'true');
    if (input)    setTimeout(function () { input.focus(); }, 60);
  }

  function closeSearch() {
    var overlay  = document.getElementById('gsOverlay');
    var backdrop = document.getElementById('gsBackdrop');
    var btn      = document.getElementById('gsBtn');
    var input    = document.getElementById('gsInput');
    var results  = document.getElementById('gsResults');
    if (!overlay) return;
    overlay.classList.remove('gs-open');
    if (backdrop) backdrop.classList.remove('gs-active');
    if (btn)      btn.setAttribute('aria-expanded', 'false');
    if (input)    input.value = '';
    if (results)  results.innerHTML = '';
    clearTimeout(_debounce);
  }

  /* ── debounced input ── */
  var _debounce = null;

  function onInput() {
    var input = document.getElementById('gsInput');
    if (!input) return;
    var q = input.value;
    clearTimeout(_debounce);
    _debounce = setTimeout(function () {
      renderResults(runSearch(q), q);
    }, 180);
  }

  /* ── تهيئة الأحداث ── */
  function init() {
    var btn      = document.getElementById('gsBtn');
    var xBtn     = document.getElementById('gsX');
    var backdrop = document.getElementById('gsBackdrop');
    var input    = document.getElementById('gsInput');

    if (btn)      btn.addEventListener('click', openSearch);
    if (xBtn)     xBtn.addEventListener('click', closeSearch);
    if (backdrop) backdrop.addEventListener('click', closeSearch);

    if (input) {
      input.addEventListener('input', onInput);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var first = document.querySelector('.gs-result');
          if (first) { e.preventDefault(); window.location.href = first.href; }
        }
        if (e.key === 'Escape') closeSearch();
      });
    }

    /* ESC يغلق من أي مكان */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSearch();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
