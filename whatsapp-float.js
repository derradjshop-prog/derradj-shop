(function () {
  'use strict';

  var WHATSAPP_NUMBER = '213555491316';
  var BRAND = 'Derradj Shop';

  // Resolve social.png relative to this script, so it works from any page depth.
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  var ICON_URL = SCRIPT_SRC ? new URL('social.png', SCRIPT_SRC).href : 'social.png';

  var path = (window.location.pathname || '').toLowerCase();

  // Hide on admin pages
  if (path.indexOf('/admin/') !== -1 || path.indexOf('/admin') === path.length - 6) {
    return;
  }

  // Avoid double-injection
  if (document.querySelector('.whatsapp-float')) return;

  function getProductTitle() {
    var h1 = document.querySelector('main h1, article h1, .product h1, h1');
    if (h1 && h1.textContent) {
      return h1.textContent.trim().replace(/\s+/g, ' ');
    }
    return '';
  }

  function buildMessage() {
    var isBook = /\/books\/[^/]+\/?/.test(path) && !/\/books\/?$/.test(path);
    var isProduct = /\/products\/[^/]+\/?/.test(path);
    var isCartOrOrder = /\/(ordre|cart|checkout|payment)/.test(path);

    if (isBook) {
      var bookTitle = getProductTitle();
      if (bookTitle) {
        return 'مرحبًا، أريد الاستفسار عن هذا الكتاب: ' + bookTitle;
      }
      return 'مرحبًا، أريد الاستفسار عن كتاب في ' + BRAND + '.';
    }

    if (isProduct) {
      var productTitle = getProductTitle();
      if (productTitle) {
        return 'مرحبًا، أريد الاستفسار عن هذا المنتج: ' + productTitle;
      }
      return 'مرحبًا، أريد الاستفسار عن منتج في ' + BRAND + '.';
    }

    if (isCartOrOrder) {
      return 'مرحبًا، أريد المساعدة في إتمام طلبي على ' + BRAND + '.';
    }

    return 'مرحبًا، أريد الاستفسار عن المنتجات المتوفرة في ' + BRAND + '.';
  }

  function injectStyles() {
    if (document.getElementById('whatsapp-float-style')) return;
    var css = ''
      + '.whatsapp-float{'
      +   'position:fixed;bottom:20px;right:20px;left:auto;z-index:9998;'
      +   'width:56px;height:56px;border-radius:50%;overflow:visible;'
      +   'background:transparent;background-color:transparent;color:inherit;'
      +   'display:flex;align-items:center;justify-content:center;'
      +   'padding:0;border:0;'
      +   'box-shadow:none;filter:none;'
      +   'text-decoration:none;'
      +   'transition:transform .15s ease;'
      +   '-webkit-tap-highlight-color:transparent;'
      + '}'
      + '.whatsapp-float::before,.whatsapp-float::after{content:none !important;background:none !important;box-shadow:none !important;}'
      + '.whatsapp-float:hover{'
      +   'background:transparent;'
      +   'transform:translateY(-1px);'
      + '}'
      + '.whatsapp-float:focus-visible{'
      +   'outline:2px solid #1ebe5b;outline-offset:3px;'
      + '}'
      + '.whatsapp-float img{'
      +   'width:45px;height:45px;display:block;object-fit:contain;'
      +   'filter:none;'
      +   'pointer-events:none;'
      + '}'
      + '@media (max-width:600px){'
      +   '.whatsapp-float{width:52px;height:52px;bottom:16px;right:16px;left:auto;}'
      +   '.whatsapp-float img{width:50px;height:50px;}'
      + '}'
      + '@media (prefers-reduced-motion: reduce){'
      +   '.whatsapp-float{transition:none;}'
      +   '.whatsapp-float:hover{transform:none;}'
      + '}'
      + '@media print{.whatsapp-float{display:none !important;}}';
    var style = document.createElement('style');
    style.id = 'whatsapp-float-style';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function injectButton() {
    var a = document.createElement('a');
    a.className = 'whatsapp-float';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('aria-label', 'تواصل معنا عبر واتساب');
    a.title = 'تواصل معنا عبر واتساب';

    var message = buildMessage();
    a.href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message);

    var img = document.createElement('img');
    img.src = ICON_URL;
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.decoding = 'async';
    img.loading = 'lazy';
    a.appendChild(img);

    document.body.appendChild(a);

    // Rebuild message late, in case h1 was inserted by another script after DOMContentLoaded
    setTimeout(function () {
      var updated = buildMessage();
      a.href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(updated);
    }, 600);
  }

  function init() {
    injectStyles();
    injectButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
