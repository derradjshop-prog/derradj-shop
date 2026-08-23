/* ============================================================
   mobile-menu.js — Derradj Shop | تبديل قائمة الموبايل المشتركة
   يعتمد على وجود #mobileMenuBtn / #mobileMenu / #mainHeader
   نفس الهيكل المستخدم في index.html — يُحمَّل في كل الصفحات
   ============================================================ */
(function () {
  'use strict';

  var menuBtn    = document.getElementById('mobileMenuBtn');
  var mobileMenu = document.getElementById('mobileMenu');
  var header     = document.getElementById('mainHeader');

  if (!menuBtn || !mobileMenu) return;

  menuBtn.addEventListener('click', function () {
    mobileMenu.classList.toggle('open');
    menuBtn.classList.toggle('open');
  });

  mobileMenu.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', function () {
      mobileMenu.classList.remove('open');
      menuBtn.classList.remove('open');
    });
  });

  if (header) {
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });
  }
})();
