/* ==========================================================
   generate-product-pages.js — Derradj Shop
   Build-time static page generator for electronics products.

   Why this exists: WhatsApp / Facebook / Telegram / Discord /
   X crawlers do NOT execute JavaScript, but the old
   /product/index.html?slug=X page filled all its <meta> tags
   client-side after fetching Supabase — so shared links showed
   no image/title/description anywhere. This script renders one
   real static HTML file per active product (mirroring how
   /books/{slug}/ already works) with the OG/Twitter/JSON-LD
   tags baked into the raw HTML, so crawlers see real content.

   Run manually: node scripts/generate-product-pages.js
   Run automatically: .github/workflows/generate-product-pages.yml
   ========================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const ProductTemplate = require('../js/product-template.js');
const BookTemplate = require('../js/book-template.js');
const { getImageSize } = require('./image-size.js');

const SB_URL = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk';
const SITE_URL = 'https://derradjshop.com';

const ROOT = path.join(__dirname, '..');
const PRODUCT_DIR = path.join(ROOT, 'product');
const BOOKS_DIR = path.join(ROOT, 'books');
const CACHE_FILE = path.join(__dirname, '.image-dims-cache.json');

/* ── Supabase REST ── */
async function fetchActiveProducts() {
  const headers = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  const base = `${SB_URL}/rest/v1/admin_products_catalog?select=*&is_active=eq.true`;
  let res = await fetch(base + '&order=display_order.asc.nullslast,created_at.desc', { headers });
  if (!res.ok && res.status === 400) {
    res = await fetch(base + '&order=created_at.desc', { headers });
  }
  if (!res.ok) throw new Error(`Supabase fetch failed: HTTP ${res.status}`);
  return res.json();
}

/* ── Map an admin_products_catalog row (category='books') into the
   shape js/book-template.js expects. Books and electronics are the
   same table now — this is the only place the two schemas meet. ── */
function toBookRow(p) {
  const dir = path.join(BOOKS_DIR, p.slug || '');
  /* Always point at the deterministic local cover — never Supabase
     Storage (uncached, was the dominant source of egress). Falls back
     to whatever is in main_image only if the local file truly isn't
     there yet, so a freshly-added book doesn't silently 404. */
  let image = p.main_image || null;
  if (p.slug) {
    const localWebp = path.join(BOOKS_DIR, p.slug, 'main.webp');
    image = fs.existsSync(localWebp) ? `${SITE_URL}/books/${p.slug}/main.webp` : image;
  }
  return {
    id: p.catalog_id,
    title: p.product_name,
    titleEn: p.product_name_ar || null,
    author: p.author || null,
    translator: p.translator || null,
    year: p.year || null,
    category: p.subcategory || null,
    price: p.price,
    image,
    url: (p.slug || '') + '/',
    available: p.stock_status !== 'out_of_stock',
    description: p.short_description || null,
    full_description: p.full_description || null,
    seo_title: p.seo_title || null,
    seo_description: p.seo_description || null,
    keywords: p.keywords || null,
    gallery_images: Array.isArray(p.gallery_images) ? p.gallery_images : [],
    brand: p.brand || null,
    updated_at: p.updated_at || null,
  };
}

/* ── Image dimension cache (avoids re-downloading images every run) ── */
function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch { return {}; }
}
function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2) + '\n');
}

async function probeImageDims(url, cache) {
  if (!url) return null;
  if (cache[url]) return cache[url];
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-131071' } });
    if (!res.ok && res.status !== 206) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const dims = getImageSize(buf);
    if (dims) cache[url] = dims;
    return dims;
  } catch (err) {
    console.warn(`[image-size] failed to probe ${url}: ${err.message}`);
    return null;
  }
}

/* ── Slug-collision guard ──────────────────────────────────────
   Legacy redirect stubs (hand-authored <meta http-equiv="refresh">
   pages left behind after a slug rename, e.g. books/la-anam/) sit
   on disk at a fixed path with no awareness of Supabase. If a brand
   new product is ever given that exact slug again (auto-slugify is
   deterministic from the title, so re-using an old title — even
   unintentionally — reproduces its old slug), the stub would
   silently keep redirecting visitors to the wrong, unrelated
   product until this script's next scheduled run closed the gap.
   Supabase is always the source of truth and this script already
   overwrites unconditionally, so the data is never wrong for long —
   but a collision like that should be loud, not silent, the moment
   it's caught here. ── */
function warnIfReplacingLegacyRedirect(dir, slug, kind) {
  const existing = path.join(dir, 'index.html');
  if (!fs.existsSync(existing)) return;
  const content = fs.readFileSync(existing, 'utf8');
  const m = content.match(/<meta http-equiv="refresh"[^>]*url=([^"]+)"/i);
  if (!m) return;
  console.warn(
    `[generate-product-pages] ⚠️  SLUG COLLISION: ${kind}/${slug}/ was a legacy redirect stub ` +
    `pointing to ${m[1]} — a new active product now claims this exact slug and is overwriting ` +
    `it with its own page. If that product was meant to be distinct from whatever this slug used ` +
    `to redirect to, double-check the new product's slug is actually intentional.`
  );
}

/* ── Local book cover dims — these are repo files, not remote
   Supabase Storage URLs, so a plain fs read is enough (no
   network probe / cache needed). Tries webp → png → jpg. ── */
function probeLocalBookImageDims(slug) {
  for (const name of ['main.webp', 'main.png', 'main.jpg']) {
    const file = path.join(BOOKS_DIR, slug, name);
    if (!fs.existsSync(file)) continue;
    try {
      const dims = getImageSize(fs.readFileSync(file));
      if (dims) return dims;
    } catch (_) { /* try next extension */ }
  }
  return null;
}

/* ── Auto-localize a book cover the first time it's seen ──
   Admin/seller uploads always land in Supabase Storage (main_image
   becomes an absolute URL) — without this, every future book added
   through the admin panel would silently keep serving its cover
   straight from Supabase Storage (uncached, ~1-2MB per file) to every
   visitor forever, exactly like the 27 books this script's prior
   version missed. Runs once per book, here at build time — not on
   every pageview — so the one-off Storage read cost is negligible. */
function downloadToFile(url) {
  return new Promise((resolve, reject) => {
    require('https').get(url, res => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}
async function localizeBookCoverIfMissing(p) {
  if (!p.slug || !p.main_image || !/^https?:\/\//.test(p.main_image)) return;
  const dest = path.join(BOOKS_DIR, p.slug, 'main.webp');
  if (fs.existsSync(dest)) return;
  try {
    const buf = await downloadToFile(p.main_image);
    fs.mkdirSync(path.join(BOOKS_DIR, p.slug), { recursive: true });
    fs.writeFileSync(dest, buf);
    console.log(`[generate-product-pages] localized cover for books/${p.slug}/ (${(buf.length / 1024).toFixed(0)}KB from Supabase Storage, one-time)`);
  } catch (err) {
    console.warn(`[generate-product-pages] could not localize cover for books/${p.slug}/: ${err.message} — will keep serving it from Supabase Storage until this succeeds.`);
  }
}

/* ── Auto-localize electronics product images the first time they're
   seen ── mirrors localizeBookCoverIfMissing() above. Admin/seller
   uploads always land in Supabase Storage (main_image/gallery_images
   become absolute URLs); without this, any electronics product whose
   images were never manually mirrored — including any row with a
   subcategory value that used to contain characters illegal in a path
   (e.g. "Arduino / Composants électroniques", which could never resolve
   to a real file on disk) — kept serving every image straight from
   Supabase Storage to every visitor on every pageview, forever. That
   was the actual dominant source of Cached Egress: those two Arduino
   products appear in the "related products" carousel on all ~110
   product/book pages plus the homepage and category pages, each
   re-fetching the uncached Supabase Storage image on every page load.
   Runs once per missing file, here at build time, not on every
   pageview, so the one-off Storage read cost is negligible. */
function electronicsFolderBase(p) {
  const SUBCATEGORY_DIR = { power_bank: 'power-bank', smart_watch: 'smart-watch' };
  const subdir = String(SUBCATEGORY_DIR[p.subcategory] || p.subcategory || 'other')
    .replace(/[\/\\?%*:|"<>]/g, '-').trim() || 'other';
  return path.join(ROOT, 'Electronique', subdir, p.slug || '');
}
async function localizeElectronicsImagesIfMissing(p) {
  if (!p.slug) return;
  const folder = electronicsFolderBase(p);
  const sources = [];
  if (p.main_image && /^https?:\/\//.test(p.main_image)) {
    sources.push({ url: p.main_image, filename: (p.main_image.split('/').filter(Boolean).pop()) || 'main.webp' });
  }
  const galleryRaw = Array.isArray(p.gallery_images) ? p.gallery_images.filter(Boolean) : [];
  galleryRaw.forEach(u => {
    if (!/^https?:\/\//.test(u)) return;
    const filename = (u.split('/').filter(Boolean).pop()) || 'gallery-1.png';
    if (!sources.find(s => s.filename === filename)) sources.push({ url: u, filename });
  });

  for (const { url, filename } of sources) {
    const dest = path.join(folder, filename);
    if (fs.existsSync(dest)) continue;
    try {
      const buf = await downloadToFile(url);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(dest, buf);
      console.log(`[generate-product-pages] localized ${p.slug}/${filename} (${(buf.length / 1024).toFixed(0)}KB from Supabase Storage, one-time)`);
    } catch (err) {
      console.warn(`[generate-product-pages] could not localize ${filename} for ${p.slug}: ${err.message} — will keep serving it from Supabase Storage until this succeeds.`);
    }
  }
}

/* ── Local electronics image dims (repo files) ── */
function probeLocalElectronicsImageDims(subcategory, slug, filename) {
  const folder = path.join(ROOT, 'Electronique', subcategory || 'other', slug || '');
  const tryFiles = [];
  if (filename) tryFiles.push(path.join(folder, filename));
  tryFiles.push(path.join(folder, 'main.webp'));
  tryFiles.push(path.join(folder, 'main.png'));
  tryFiles.push(path.join(folder, 'main.jpg'));
  for (const file of tryFiles) {
    if (!fs.existsSync(file)) continue;
    try {
      const dims = getImageSize(fs.readFileSync(file));
      if (dims) return dims;
    } catch (_) { continue; }
  }
  return null;
}

/* ── HTML page shell (absolute paths — safe at any folder depth) ── */
function renderPage(view, dims) {
  const m = view.meta;
  const imgW = dims ? dims.width : '';
  const imgH = dims ? dims.height : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-N4NME3KN9N"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-N4NME3KN9N');</script>

  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="robots" content="index, follow"/>

  <title id="pageTitle">${ProductTemplate.esc(m.title)}</title>
  <meta name="description" id="metaDesc" content="${ProductTemplate.escAttr(m.description)}">
  <meta name="keywords"    id="metaKeys" content="${ProductTemplate.escAttr(m.keywords)}">

  <meta property="og:type"        content="product"/>
  <meta property="og:site_name"   content="Derradj Shop"/>
  <meta property="og:locale"      content="ar_DZ"/>
  <meta property="og:title"       id="ogTitle"  content="${ProductTemplate.escAttr(m.ogTitle)}">
  <meta property="og:description" id="ogDesc"   content="${ProductTemplate.escAttr(m.ogDescription)}">
  <meta property="og:url"         id="ogUrl"    content="${ProductTemplate.escAttr(m.ogUrl)}">
  <meta property="og:image"       id="ogImg"    content="${ProductTemplate.escAttr(m.ogImage)}">
  ${imgW ? `<meta property="og:image:width" content="${imgW}">` : ''}
  ${imgH ? `<meta property="og:image:height" content="${imgH}">` : ''}
  <meta property="og:image:alt"   id="ogImgAlt" content="${ProductTemplate.escAttr(m.ogImageAlt)}">
  <meta property="product:price:amount" content="${ProductTemplate.escAttr(String(view.price))}">
  <meta property="product:price:currency" content="DZD">

  <meta name="twitter:card"        content="summary_large_image"/>
  <meta name="twitter:title"       id="twTitle"  content="${ProductTemplate.escAttr(m.twitterTitle)}">
  <meta name="twitter:description" id="twDesc"   content="${ProductTemplate.escAttr(m.twitterDescription)}">
  <meta name="twitter:image"       id="twImg"    content="${ProductTemplate.escAttr(m.twitterImage)}">
  <meta name="twitter:image:alt"   id="twImgAlt" content="${ProductTemplate.escAttr(m.twitterImageAlt)}">

  <link rel="canonical" id="canonical" href="${ProductTemplate.escAttr(m.canonical)}">
  <link rel="icon" type="image/png" href="/Logo.png"/>

  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
  <link rel="preload" as="image" href="${ProductTemplate.escAttr(view.mainImage)}" fetchpriority="high">
  <link rel="stylesheet" href="/style.css"/>
</head>
<body>

<!-- ════ HEADER ════════════════════════════════════════════ -->
<header class="main-header" id="mainHeader">
  <div class="header-inner">
    <a href="/" class="logo">
      <span>Derradj <span class="logo-accent">Shop</span></span>
    </a>
    <nav class="main-nav">
      <a href="/"              class="nav-link">الرئيسية</a>
      <a href="/#categories"   class="nav-link">التصنيفات</a>
      <a href="/books/"        class="nav-link">📚 الكتب</a>
      <a href="/Electronique/" class="nav-link">💻 إلكترونيات</a>
      <a href="/about"    class="nav-link">من نحن</a>
      <a href="/faq"      class="nav-link">الأسئلة الشائعة</a>
      <a href="/contact"  class="nav-link">تواصل معنا</a>
    </nav>
    <div style="display:flex;align-items:center;gap:10px;">
      <button class="gs-btn" id="gsBtn" aria-label="بحث" title="بحث" aria-expanded="false">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
      <a href="/ordre/" class="btn-header-cta">🛒 اطلب الآن</a>
      <button class="cart-btn" aria-label="فتح السلة">🛒<span class="cart-badge" aria-live="polite"></span></button>
      <button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="القائمة"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>

<!-- Search Overlay -->
<div class="gs-overlay" id="gsOverlay" role="search" aria-label="بحث في المنتجات">
  <div class="gs-inner">
    <div class="gs-field">
      <svg class="gs-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="search" id="gsInput" class="gs-input" placeholder="ابحث عن منتج..." autocomplete="off" dir="rtl" aria-label="حقل البحث">
      <button class="gs-x" id="gsX" aria-label="إغلاق البحث">&#x2715;</button>
    </div>
    <div class="gs-results" id="gsResults" role="listbox" aria-live="polite"></div>
  </div>
</div>
<div class="gs-backdrop" id="gsBackdrop"></div>

<div class="mobile-menu" id="mobileMenu">
  <a href="/">الرئيسية</a>
  <a href="/#categories">التصنيفات</a>
  <a href="/books/">📚 الكتب</a>
  <a href="/Electronique/">💻 إلكترونيات</a>
  <a href="/about">من نحن</a>
  <a href="/faq">الأسئلة الشائعة</a>
  <a href="/contact">تواصل معنا</a>
  <a href="/ordre/" class="mobile-cta-link">🛒 اطلب الآن</a>
</div>

<!-- ════ MAIN — pre-rendered, real content for crawlers & no-JS ════ -->
<main class="product-page">
  <div class="container">
    <div id="pdContent">${view.bodyHtml}</div>
  </div>
</main>

<!-- ════ FOOTER (shared component) ═══════════════════════════ -->
<footer class="main-footer" data-shared-footer></footer>

<!-- ════ LIGHTBOX ══════════════════════════════════════════ -->
<div id="pdZoomModal" class="image-zoom-modal" role="dialog" aria-modal="true" aria-label="عرض الصورة">
  <button class="zoom-close" id="pdZoomClose" aria-label="إغلاق">&#x2715;</button>
  <button class="zoom-arrow zoom-prev" id="pdZoomPrev" aria-label="الصورة السابقة">&#8249;</button>
  <img id="pdZoomImg" class="zoomed-product-image" src="" alt="">
  <button class="zoom-arrow zoom-next" id="pdZoomNext" aria-label="الصورة التالية">&#8250;</button>
</div>

<!-- ════ SCRIPTS ════════════════════════════════════════════ -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/search-products.js"></script>
<script src="/js/products-loader.js"></script>
<script src="/cart.js"></script>
<script src="/js/search.js"></script>
<script src="/js/shared-footer.js"></script>
<script src="/js/mobile-menu.js"></script>
<script src="/whatsapp-float.js"></script>

<script src="/js/product-template.js"></script>
<script>window.PRODUCT_SLUG = ${JSON.stringify(view.slug)};</script>
<script src="/js/product-page.js"></script>
</body>
</html>
`;
}

/* ── Book page shell — mirrors renderPage() above exactly, with
   only the book-specific cover styling/CSS differing. Same script
   includes as electronics product pages — books and electronics
   share one rendering pipeline now. ── */
function renderBookPage(view, dims) {
  const m = view.meta;
  const imgW = dims ? dims.width : '';
  const imgH = dims ? dims.height : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta name="google-site-verification" content="xAG1KPt7FYfYFhoMWhxJzRKARB_nGV_BlbzUsZl1wbQ" />
  <!-- Google Analytics -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-N4NME3KN9N"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-N4NME3KN9N');</script>

  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="robots" content="index, follow"/>

  <title>${ProductTemplate.esc(m.title)}</title>
  <meta name="description" content="${ProductTemplate.escAttr(m.description)}">
  <meta name="keywords" content="${ProductTemplate.escAttr(m.keywords)}">
  <meta name="author" content="${ProductTemplate.escAttr(view.title)}">
  <meta name="geo.region" content="DZ">

  <meta property="og:type"        content="product"/>
  <meta property="og:site_name"   content="Derradj Shop"/>
  <meta property="og:locale"      content="ar_DZ"/>
  <meta property="og:title"       content="${ProductTemplate.escAttr(m.ogTitle)}">
  <meta property="og:description" content="${ProductTemplate.escAttr(m.ogDescription)}">
  <meta property="og:url"         content="${ProductTemplate.escAttr(m.ogUrl)}">
  <meta property="og:image"       content="${ProductTemplate.escAttr(m.ogImage)}">
  ${imgW ? `<meta property="og:image:width" content="${imgW}">` : ''}
  ${imgH ? `<meta property="og:image:height" content="${imgH}">` : ''}
  <meta property="og:image:alt"   content="${ProductTemplate.escAttr(m.ogImageAlt)}">
  <meta property="product:price:amount" content="${view.price}">
  <meta property="product:price:currency" content="DZD">

  <meta name="twitter:card"        content="summary_large_image"/>
  <meta name="twitter:title"       content="${ProductTemplate.escAttr(m.twitterTitle)}">
  <meta name="twitter:description" content="${ProductTemplate.escAttr(m.twitterDescription)}">
  <meta name="twitter:image"       content="${ProductTemplate.escAttr(m.twitterImage)}">
  <meta name="twitter:image:alt"   content="${ProductTemplate.escAttr(m.twitterImageAlt)}">

  <link rel="canonical" href="${ProductTemplate.escAttr(m.canonical)}">
  <link rel="icon" type="image/png" href="/Logo.png"/>

  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
  <link rel="stylesheet" href="/style.css"/>
  <style>
    .product-img-gallery { grid-template-columns: 1fr; max-width: clamp(180px, 50vw, 320px); }
    .product-main-image-box { aspect-ratio: 3 / 4; cursor: default; }
    .product-main-image { object-fit: contain; padding: 0; }
    .zoom-hint { display: none; }
    .book-en-title { display: block; font-size: 15px; color: #94a3b8; font-weight: 600; margin: 4px 0 18px; font-style: italic; direction: ltr; }
  </style>
</head>
<body>

<!-- ════ HEADER ════════════════════════════════════════════ -->
<header class="main-header" id="mainHeader">
  <div class="header-inner">
    <a href="/" class="logo">
      <span>Derradj <span class="logo-accent">Shop</span></span>
    </a>
    <nav class="main-nav">
      <a href="/"              class="nav-link">الرئيسية</a>
      <a href="/#categories"   class="nav-link">التصنيفات</a>
      <a href="/books/"        class="nav-link" style="color:#2563eb;font-weight:700;">📚 الكتب</a>
      <a href="/Electronique/" class="nav-link">💻 إلكترونيات</a>
      <a href="/about"    class="nav-link">من نحن</a>
      <a href="/faq"      class="nav-link">الأسئلة الشائعة</a>
      <a href="/contact"  class="nav-link">تواصل معنا</a>
    </nav>
    <div style="display:flex;align-items:center;gap:10px;">
      <button class="gs-btn" id="gsBtn" aria-label="بحث" title="بحث" aria-expanded="false">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
      <a href="/ordre/" class="btn-header-cta">🛒 اطلب الآن</a>
      <button class="cart-btn" aria-label="فتح السلة">🛒<span class="cart-badge" aria-live="polite"></span></button>
      <button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="القائمة"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>

<!-- Search Overlay -->
<div class="gs-overlay" id="gsOverlay" role="search" aria-label="بحث في المنتجات">
  <div class="gs-inner">
    <div class="gs-field">
      <svg class="gs-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="search" id="gsInput" class="gs-input" placeholder="ابحث عن كتاب، منتج، حامل حاسوب..." autocomplete="off" dir="rtl" aria-label="حقل البحث">
      <button class="gs-x" id="gsX" aria-label="إغلاق البحث">&#x2715;</button>
    </div>
    <div class="gs-results" id="gsResults" role="listbox" aria-live="polite"></div>
  </div>
</div>
<div class="gs-backdrop" id="gsBackdrop"></div>

<div class="mobile-menu" id="mobileMenu">
  <a href="/">الرئيسية</a>
  <a href="/#categories">التصنيفات</a>
  <a href="/books/" style="color:#2563eb;font-weight:700;">📚 الكتب</a>
  <a href="/Electronique/">💻 إلكترونيات</a>
  <a href="/about">من نحن</a>
  <a href="/faq">الأسئلة الشائعة</a>
  <a href="/contact">تواصل معنا</a>
  <a href="/ordre/" class="mobile-cta-link">🛒 اطلب الآن</a>
</div>

<!-- ════ MAIN — pre-rendered, real content for crawlers & no-JS ════ -->
<main class="product-page">
  <div class="container">
    <div id="pdContent">${view.bodyHtml}</div>
  </div>
</main>

<!-- ════ FOOTER (shared component) ═══════════════════════════ -->
<footer class="main-footer" data-shared-footer></footer>

<!-- ════ LIGHTBOX ══════════════════════════════════════════ -->
<div id="pdZoomModal" class="image-zoom-modal" role="dialog" aria-modal="true" aria-label="عرض الصورة">
  <button class="zoom-close" id="pdZoomClose" aria-label="إغلاق">&#x2715;</button>
  <button class="zoom-arrow zoom-prev" id="pdZoomPrev" aria-label="الصورة السابقة">&#8249;</button>
  <img id="pdZoomImg" class="zoomed-product-image" src="" alt="">
  <button class="zoom-arrow zoom-next" id="pdZoomNext" aria-label="الصورة التالية">&#8250;</button>
</div>

<!-- ════ SCRIPTS ════════════════════════════════════════════ -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/search-products.js"></script>
<script src="/js/products-loader.js"></script>
<script src="/cart.js"></script>
<script src="/js/search.js"></script>
<script src="/js/shared-footer.js"></script>
<script src="/js/mobile-menu.js"></script>
<script src="/whatsapp-float.js"></script>

<script src="/js/product-template.js"></script>
<script src="/js/book-template.js"></script>
<script>window.PRODUCT_SLUG = ${JSON.stringify(view.slug)};</script>
<script src="/js/product-page.js"></script>
</body>
</html>
`;
}

/* ── Sitemap (static + books + electronics, with image extension) ── */
function buildSitemap(products, books) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];

  const STATIC = [
    { loc: `${SITE_URL}/`,                  freq: 'weekly',  pri: '1.0' },
    { loc: `${SITE_URL}/books/`,            freq: 'weekly',  pri: '0.9' },
    { loc: `${SITE_URL}/Electronique/`,     freq: 'weekly',  pri: '0.9' },
    { loc: `${SITE_URL}/about`,        freq: 'monthly', pri: '0.5' },
    { loc: `${SITE_URL}/contact`,      freq: 'monthly', pri: '0.5' },
    { loc: `${SITE_URL}/faq`,          freq: 'monthly', pri: '0.5' },
    { loc: `${SITE_URL}/delivery`,     freq: 'monthly', pri: '0.6' },
    { loc: `${SITE_URL}/payment`,      freq: 'monthly', pri: '0.5' },
    { loc: `${SITE_URL}/return-policy`,freq: 'monthly', pri: '0.5' },
    { loc: `${SITE_URL}/terms`,        freq: 'yearly',  pri: '0.3' },
  ];
  STATIC.forEach(u => urls.push({ ...u, lastmod: today }));

  /* Books — from Supabase (admin_products_catalog, category='books') */
  books.forEach(p => {
    if (!p.slug) return;
    const b = toBookRow(p);
    const image = b.image ? (/^https?:\/\//.test(b.image) ? b.image : `${SITE_URL}${b.image}`) : null;
    urls.push({
      loc: `${SITE_URL}/books/${p.slug}/`,
      lastmod: p.updated_at ? String(p.updated_at).slice(0, 10) : today,
      freq: 'monthly',
      pri: '0.8',
      image,
    });
  });

  /* Electronics products — from Supabase */
  products.forEach(p => {
    if (!p.slug) return;
    try {
      const view = ProductTemplate.buildProductView(p);
      urls.push({
        loc: `${SITE_URL}/product/${encodeURIComponent(p.slug)}/`,
        lastmod: p.updated_at ? String(p.updated_at).slice(0, 10) : today,
        freq: 'weekly',
        pri: '0.8',
        image: view.meta && view.meta.ogImage ? view.meta.ogImage : null,
      });
    } catch (err) {
      urls.push({
        loc: `${SITE_URL}/product/${encodeURIComponent(p.slug)}/`,
        lastmod: p.updated_at ? String(p.updated_at).slice(0, 10) : today,
        freq: 'weekly',
        pri: '0.8',
        image: p.main_image || null,
      });
    }
  });

  const urlBlock = u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>${u.image ? `
    <image:image>
      <image:loc>${u.image}</image:loc>
    </image:image>` : ''}
  </url>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(urlBlock).join('\n')}
</urlset>
`;
}

/* ── Main ── */
async function main() {
  console.log('[generate-product-pages] fetching active catalog from Supabase...');
  const rows = await fetchActiveProducts();
  const products = rows.filter(p => p.category !== 'books');
  const books    = rows.filter(p => p.category === 'books');
  console.log(`[generate-product-pages] ${products.length} product(s), ${books.length} book(s) found.`);

  const cache = loadCache();
  const writtenSlugs = new Set();

  for (const p of products) {
    if (!p.slug) {
      console.warn(`[generate-product-pages] skipping product without slug: catalog_id=${p.catalog_id}`);
      continue;
    }
    await localizeElectronicsImagesIfMissing(p);
    const view = ProductTemplate.buildProductView(p);
    let dims = null;
    try {
      if (view.mainImage && !/^https?:\/\//.test(view.mainImage) && view.mainImage.startsWith('/')) {
        /* local repo path like /Electronique/{sub}/{slug}/filename */
        const parts = view.mainImage.split('/').filter(Boolean);
        const sub = parts[1] || 'other';
        const slug = parts[2] || p.slug || '';
        const filename = parts.slice(3).join('/') || '';
        dims = probeLocalElectronicsImageDims(sub, slug, filename);
      } else {
        dims = await probeImageDims(view.mainImage, cache);
      }
    } catch (err) {
      dims = null;
    }
    const html = renderPage(view, dims);

    const dir = path.join(PRODUCT_DIR, p.slug);
    fs.mkdirSync(dir, { recursive: true });
    warnIfReplacingLegacyRedirect(dir, p.slug, 'product');
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    writtenSlugs.add(p.slug);
    console.log(`[generate-product-pages] wrote product/${p.slug}/index.html (${dims ? dims.width + 'x' + dims.height : 'no dims'})`);
  }

  /* Remove static pages for products that are no longer active */
  const existingDirs = fs.readdirSync(PRODUCT_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  for (const slug of existingDirs) {
    if (!writtenSlugs.has(slug)) {
      fs.rmSync(path.join(PRODUCT_DIR, slug), { recursive: true, force: true });
      console.log(`[generate-product-pages] removed stale product/${slug}/ (no longer active)`);
    }
  }

  saveCache(cache);

  for (const p of books) {
    if (!p.slug) {
      console.warn(`[generate-product-pages] skipping book without slug: catalog_id=${p.catalog_id}`);
      continue;
    }
    await localizeBookCoverIfMissing(p);
    const b = toBookRow(p);
    const slug = p.slug;
    const view = BookTemplate.buildBookView(b);
    /* Prefer the local file (now the deterministic path for all books) — only
       fall back to a network probe for an actual remote (Supabase) URL when
       no local cover exists yet, e.g. a brand new book pending its cover. */
    const dims = probeLocalBookImageDims(slug)
      || (/^https?:\/\//.test(b.image || '') ? await probeImageDims(b.image, cache) : null);
    const html = renderBookPage(view, dims);

    const dir = path.join(BOOKS_DIR, slug);
    fs.mkdirSync(dir, { recursive: true });
    warnIfReplacingLegacyRedirect(dir, slug, 'books');
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    console.log(`[generate-product-pages] wrote books/${slug}/index.html (${dims ? dims.width + 'x' + dims.height : 'no dims'})`);
  }
  /* Note: unlike products, directories not present in Supabase are
     left untouched — this protects the legacy redirect-stub
     folders (e.g. books/la-anam/, books/small-habits-revolution/)
     from ever being written or removed by this script. */

  saveCache(cache);

  const sitemap = buildSitemap(products, books);
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap);
  console.log('[generate-product-pages] sitemap.xml regenerated.');
}

main().catch(err => {
  console.error('[generate-product-pages] FAILED:', err);
  process.exit(1);
});
