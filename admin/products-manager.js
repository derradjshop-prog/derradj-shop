/* ==========================================================
   products-manager.js — Derradj Shop | Product CRUD
   Runs after admin.js — adds full product management to admin
   ========================================================== */
(function () {
  'use strict';

  /* Shared client (see supabase-client.js) — reused instead of creating a
     second GoTrueClient instance on this page (see admin.js for why). */
  if (!window.sbClient) return;
  const sb = window.sbClient;

  /* ── Top-level categories — the only two values `category` actually
     takes (live data confirms it: 104 books / 7 electronics, nothing
     else). Subcategories (Phone Chargers, Power Banks, ...) are a
     separate concept driven entirely by the `categories` Supabase
     table — see ALL_CATEGORIES / loadCategories() below. ── */
  const CATEGORIES = [
    { value: 'books',        label: '📚 كتب' },
    { value: 'electronics',  label: '💻 إلكترونيات' },
  ];

  /* ── Electronics subcategories — single source of truth is the
     Supabase `categories` table (see admin/setup-categories.sql).
     Populated by loadCategories() at startup; everywhere a subcategory
     dropdown/filter/label is needed, read from this array instead of
     hard-coding values. ── */
  let ALL_CATEGORIES = [];

  async function loadCategories() {
    try {
      const { data, error } = await sb
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      ALL_CATEGORIES = data || [];
    } catch (err) {
      console.warn('[PM] loadCategories failed — subcategory picker will be empty:', err.message || err);
      ALL_CATEGORIES = [];
    }
  }

  /* ── Legacy subcategory classification — the 7 electronics products
     that existed before this category system was added still store
     old free-text subcategory values (earbuds, smart_watch, power_bank,
     "Arduino / Composants électroniques", ...). Their `subcategory`
     column is NEVER rewritten by this map — it's also used verbatim as
     a local image-folder path segment (see resolveThumbSrc below and
     js/products-loader.js's resolveImage), so changing it here would
     silently break that product's photo. This map only affects which
     category bucket a legacy product is displayed / filtered under,
     and pre-selects a sensible option when its edit modal opens —
     saving from there switches it to the real slug going forward.

     Only mapped where the product's own name/value makes it truly
     unambiguous. Everything else resolves to null (no bucket) rather
     than a guessed default — the current category list has no general
     "wireless earbuds" bucket (only "AirPods" and the wired "Kit Main
     Libre"), so e.g. the Anker SoundCore earbuds (wireless, not
     AirPods-branded) genuinely don't fit any of the 17 and are left
     unclassified; same for the laptop stand and the 2 Arduino kits —
     none of the 17 categories apply to them. Unclassified products
     still show under "All Electronics", just no subcategory chip. ── */
  const LEGACY_SUBCATEGORY_BY_CATALOG_ID = { 87: 'airpods' };
  const LEGACY_SUBCATEGORY_BY_VALUE = {
    smart_watch: 'smartwatch',
    power_bank:  'power-bank',
  };
  function resolveCategorySlug(p) {
    if (!p || !isElec(p)) return null;
    const byId = LEGACY_SUBCATEGORY_BY_CATALOG_ID[p.catalog_id];
    if (byId) return byId;
    const raw = p.subcategory;
    if (raw && ALL_CATEGORIES.some(c => c.slug === raw)) return raw;
    if (raw && LEGACY_SUBCATEGORY_BY_VALUE[raw]) return LEGACY_SUBCATEGORY_BY_VALUE[raw];
    return null;
  }
  function categoryBySlug(slug) { return ALL_CATEGORIES.find(c => c.slug === slug) || null; }

  /* ── Subcategory <select> options, grouped into <optgroup>s by the
     `description` column (used purely as a UI group label — "Phone &
     Charging", "Audio", ... — see admin/setup-categories.sql). Called
     both at initial (pre-load) form build and again once
     loadCategories() resolves, via populateSubcatSelect(). ── */
  function subcatOptionsHtml() {
    const opt = c => `<option value="${esc(c.slug)}">${esc(c.icon || '📦')} ${esc(c.name)}</option>`;
    /* `description` is an optional UI-only group label. Current seed
       list (admin/setup-categories.sql) is flat and leaves it null —
       render plain <option>s in that case rather than wrapping
       everything in one bogus catch-all <optgroup> (worse: this list
       already has its own real "Autre" category, so a fallback group
       literally named "other" would be actively confusing here). Only
       categories that DO have a description group into <optgroup>s. */
    if (!ALL_CATEGORIES.some(c => c.description)) {
      return ALL_CATEGORIES.map(opt).join('');
    }
    const groups = [];
    const byGroup = new Map();
    ALL_CATEGORIES.forEach(c => {
      const g = c.description || '—';
      if (!byGroup.has(g)) { byGroup.set(g, []); groups.push(g); }
      byGroup.get(g).push(c);
    });
    return groups.map(g => `<optgroup label="${esc(g)}">${
      byGroup.get(g).map(opt).join('')
    }</optgroup>`).join('');
  }
  function populateSubcatSelect() {
    const sel = document.getElementById('pmSubcat');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = `<option value="">— اختر —</option>${subcatOptionsHtml()}`;
    if (current) sel.value = current;
  }
  function subcategoryLabelHtml(p) {
    if (!isElec(p)) return '';
    const cat = categoryBySlug(resolveCategorySlug(p));
    if (!cat) return '';
    return `<br><span style="font-size:11px;color:#64748b;">${esc(cat.icon || '📦')} ${esc(cat.name)}</span>`;
  }

  /* ── State ── */
  let ALL_PM_PRODUCTS = [];
  let PM_LAST_LOADED = 0;
  const PM_CACHE_TTL = 60 * 1000;
  /* Passive triggers (tab click, boot retry) should reuse an already-fresh
     catalog instead of re-pulling every column (incl. descriptions/gallery
     arrays) for the whole table again — loadProducts() itself stays a hard
     refresh for the manual button and for post-save/delete/reorder calls. */
  function loadProductsIfStale() {
    if (ALL_PM_PRODUCTS.length && Date.now() - PM_LAST_LOADED < PM_CACHE_TTL) {
      renderTable();
      return;
    }
    loadProducts();
  }
  let EDIT_PRODUCT_ID = null;
  /* main_image + gallery_images as they were when the edit modal opened —
     diffed against the saved payload after a successful UPDATE so old
     Storage files that are no longer referenced can be cleaned up. Never
     read before a save actually succeeds. */
  let EDIT_ORIGINAL_IMAGES = [];
  /* The product's raw `subcategory` DB value as the edit modal opened it,
     and the bucket resolveCategorySlug() displays it as (may differ for
     legacy rows — see resolveCategorySlug's comment). If the admin saves
     without touching the subcategory dropdown, saveProduct() writes this
     original raw value back unchanged rather than the resolved slug —
     otherwise a plain price/name edit would silently rewrite e.g.
     "power_bank" to "power-banks", which no longer matches that
     product's actual /Electronique/power-bank/ image folder and forces
     its photo to fall back to the raw (uncached) Supabase Storage URL —
     exactly the Cached Egress pattern this codebase has already had to
     fix once. Deliberately picking a different subcategory in the
     dropdown still saves the new slug as intended. */
  let EDIT_ORIGINAL_SUBCATEGORY = null;
  let EDIT_ORIGINAL_RESOLVED_SLUG = null;
  /* null = unknown yet, true = column exists in DB, false = column missing */
  let DISPLAY_ORDER_SUPPORTED = null;
  let PROD_FILTER = 'all';        /* 'all' | 'books' | 'electronics' | 'pending' */
  let PROD_SUBFILTER = 'all';     /* electronics-only: 'all' | a categories.slug */
  let PROD_SEARCH_QUERY = '';
  let DRAG_SRC_ID = null;
  let BOOK_SORT_MODE = 'manual';
  let BOOK_SALES = new Map();
  let BOOK_SALES_LOADED = false;
  /* Locally-staged (not-yet-written-to-disk) product images — see the
     IMAGE UPLOAD section below. Populated on file pick, written to the
     local repo via window.LocalFS only once saveProduct() knows the
     product's final slug/category. */
  let PM_STAGED_MAIN = null; /* { blob, previewUrl } | null */
  let PM_GALLERY_ITEMS = []; /* [{ id, type:'existing'|'staged', url?, blob?, previewUrl?, el }] */
  let PM_GALLERY_SEQ = 0;

  /* إلكتروني = كل ما ليس كتاباً */
  function isElec(p) { return p.category !== 'books'; }

  /* ── Prefer the Arabic name for matching against book_sales_summary,
     which keys rows by whatever name order_items/checkout stored
     (mirrors js/products-loader.js's arName so admin and public agree). ── */
  function isArabic(s) { return /[؀-ۿ]/.test(String(s || '')); }
  function arName(p) {
    const a = p.product_name, b = p.product_name_ar;
    const aIsAr = isArabic(a), bIsAr = isArabic(b);
    if (aIsAr && !bIsAr) return a;
    if (!aIsAr && bIsAr) return b;
    return a || b || '';
  }

  /* ── Helpers ── */
  function esc(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  function fmtPrice(n) {
    return Number(n || 0).toLocaleString('fr-DZ') + ' دج';
  }

  function fmtDate(v) {
    if (!v) return '—';
    return new Date(v).toLocaleString('ar-DZ', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  /* Same copy-to-clipboard pattern as admin.js's handleCopyMessage()
     (.btn-copy-msg / .copied are defined once, globally, in admin.html). */
  async function copyFieldValue(inputId, btn) {
    const input = document.getElementById(inputId);
    const value = input?.value?.trim();
    if (!value) { showToast('❌ لا يوجد رابط لنسخه', 'error'); return; }

    const original = btn ? btn.innerHTML : null;
    try {
      await navigator.clipboard.writeText(value);
      if (btn) {
        btn.classList.add('copied');
        btn.innerHTML = '✅ تم النسخ';
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = original;
        }, 1500);
      }
    } catch (err) {
      console.error('Copy error:', err);
      showToast('❌ فشل نسخ الرابط: ' + (err.message || ''), 'error');
    }
  }

  function showToast(msg, type = 'success', opts = {}) {
    const old = document.getElementById('pm-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'pm-toast';
    el.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px',
      'padding:12px 24px', 'border-radius:10px',
      'font-weight:700', 'font-size:14px', 'z-index:9999',
      'color:#fff', 'box-shadow:0 4px 20px rgba(0,0,0,.28)',
      "font-family:'Cairo',sans-serif", 'max-width:340px',
      'line-height:1.4', 'direction:rtl',
      'background:' + (type === 'error' ? '#dc2626' : type === 'info' ? '#1d4ed8' : '#059669'),
    ].join(';');
    if (opts.linkUrl && /^https:\/\/github\.com\//.test(opts.linkUrl)) {
      el.textContent = msg + ' — ';
      const a = document.createElement('a');
      a.href = opts.linkUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = opts.linkLabel || 'تتبع التقدم';
      a.style.cssText = 'color:#fff;text-decoration:underline;';
      el.appendChild(a);
    } else {
      el.textContent = msg;
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), opts.duration || 4000);
  }

  /* ══════════════════════════════════════════════════════════
     STATIC PAGE REBUILD — fires the GitHub Actions workflow that
     regenerates /product/{slug}/ and /books/{slug}/ from Supabase,
     right after a successful create/update/delete. Replaces the old
     fixed cron schedule (see .github/workflows/generate-product-pages.yml)
     so the live site never sits behind stale pages for up to 2 hours.

     This must go through a Supabase Edge Function — the GitHub token
     needed to dispatch the workflow can never be embedded in this
     client-side file. A failure here is always non-fatal: the DB
     write this follows has already succeeded, so the admin is only
     ever told the rebuild itself didn't fire and should be run
     manually from the Actions tab. ══════════════════════════════ */
  async function triggerPageRebuild(reason) {
    try {
      const { data, error } = await sb.functions.invoke('trigger-page-rebuild', {
        body: { reason },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || 'فشل غير معروف');

      if (data?.run?.html_url) {
        showToast('🚀 جاري تحديث صفحات الموقع', 'info', {
          linkUrl: data.run.html_url,
          linkLabel: 'تتبع التقدم على GitHub',
          duration: 8000,
        });
      } else {
        showToast('🚀 تم تشغيل تحديث صفحات الموقع — ستظهر التغييرات خلال دقيقة تقريباً', 'info', { duration: 6000 });
      }
    } catch (err) {
      console.warn('[PM] triggerPageRebuild failed:', err);
      showToast(
        '⚠️ تم الحفظ بنجاح، لكن التحديث التلقائي لصفحات الموقع فشل — شغّله يدوياً من تبويب Actions في GitHub',
        'error',
        { duration: 7000 },
      );
    }
  }

  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function catLabel(val) {
    return CATEGORIES.find(c => c.value === val)?.label || val || '—';
  }

  /* ── Resolve a stored main_image into a displayable URL — same rule
     js/products-loader.js's resolveImage() uses on the storefront: books
     store a path relative to /books/ and prefer the webp sibling.
     Electronics: prefer the local mirror under /Electronique/ (this
     table renders one full-resolution image per product row on every
     admin page load — serving it straight from the raw Supabase Storage
     URL was a real Cached Egress source). If a product was added since
     the last scheduled page-generation run and has no local mirror yet,
     rowHtml()/mobileCardHtml() fall back to the original Supabase URL
     via onerror, so nothing breaks in the meantime. ── */
  function resolveThumbSrc(p) {
    let img = p.main_image || '';
    if (!img) return '';
    if (p.category === 'books') {
      if (!/^https?:\/\//.test(img)) img = '/books/' + img.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    } else if (/^https?:\/\//.test(img)) {
      const SUBCATEGORY_DIR = { power_bank: 'power-bank', smart_watch: 'smart-watch' };
      const subdir = String(SUBCATEGORY_DIR[p.subcategory] || p.subcategory || 'other')
        .replace(/[\/\\?%*:|"<>]/g, '-').trim() || 'other';
      const slug = p.slug || String(p.catalog_id || p.id || '');
      const filename = img.split('/').filter(Boolean).pop() || 'main.webp';
      img = `/Electronique/${encodeURIComponent(subdir)}/${encodeURIComponent(slug)}/${encodeURIComponent(filename)}`;
    }
    return img;
  }

  function getValue(id) {
    return document.getElementById(id)?.value?.trim() || '';
  }

  function setValue(id, val) {
    const el = document.getElementById(id);
    if (el && val !== null && val !== undefined) el.value = val;
  }

  /* ══════════════════════════════════════════════════════════
     STYLES
  ══════════════════════════════════════════════════════════ */
  function injectStyles() {
    const s = document.createElement('style');
    s.id = 'pm-styles';
    s.textContent = `
    /* ── Section wrapper ─────────────────────────────────── */
    .pm-section {
      background:#fff; border:1px solid #e2e8f0;
      border-radius:16px; padding:22px;
      margin-bottom:22px; box-shadow:0 1px 3px rgba(0,0,0,.08);
    }
    .pm-section-header {
      display:flex; align-items:center;
      justify-content:space-between;
      margin-bottom:18px; flex-wrap:wrap; gap:10px;
    }
    .pm-section-title  { font-size:16px; font-weight:900; color:#1e293b; }
    .pm-section-sub    { font-size:13px; font-weight:600; color:#64748b; margin-top:2px; }
    .btn-pm-add {
      display:inline-flex; align-items:center; gap:6px;
      padding:10px 22px; background:#059669; color:#fff;
      border:none; border-radius:10px; font-size:14px;
      font-weight:800; cursor:pointer; font-family:'Cairo',sans-serif;
      transition:background .2s;
    }
    .btn-pm-add:hover { background:#047857; }

    /* ── Table ─────────────────────────────────────────── */
    .pm-tbl-wrap {
      border:1px solid #e2e8f0; border-radius:10px;
      overflow-x:auto; background:#f8fafc;
    }
    .pm-tbl { width:100%; border-collapse:collapse; font-size:13px; }
    .pm-tbl thead tr { background:#1e293b; }
    .pm-tbl th {
      padding:10px 12px; text-align:right; color:#fff;
      font-weight:800; font-size:11px; white-space:nowrap;
      text-transform:uppercase; letter-spacing:.4px;
    }
    .pm-tbl tbody tr { border-bottom:1px solid #e2e8f0; transition:background .12s; }
    .pm-tbl tbody tr:last-child { border-bottom:none; }
    .pm-tbl tbody tr:hover { background:#f1f5f9; }
    .pm-tbl td { padding:10px 12px; vertical-align:middle; }

    .pm-thumb {
      width:50px; height:65px; object-fit:cover;
      border-radius:6px; border:1px solid #e2e8f0; background:#f1f5f9;
      display:block;
    }
    .pm-thumb-ph {
      width:50px; height:65px; border-radius:6px;
      border:1px solid #e2e8f0; background:#f1f5f9;
      display:flex; align-items:center; justify-content:center; font-size:20px;
    }
    /* ── Stock toggle (ON = available / OFF = out of stock) ─ */
    .pm-toggle {
      display:inline-flex; align-items:center; gap:8px;
      border:none; background:transparent; padding:2px;
      cursor:pointer; font-family:'Cairo',sans-serif; user-select:none;
    }
    .pm-toggle-track {
      position:relative; width:38px; height:21px; border-radius:99px;
      background:#cbd5e1; transition:background .18s; flex-shrink:0;
    }
    .pm-toggle-thumb {
      position:absolute; top:2px; left:2px; width:17px; height:17px;
      border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.25);
      transition:transform .18s;
    }
    .pm-toggle.is-on .pm-toggle-track  { background:#22c55e; }
    .pm-toggle.is-on .pm-toggle-thumb  { transform:translateX(17px); }
    .pm-toggle-label { font-size:12px; font-weight:800; white-space:nowrap; }
    .pm-toggle.is-on  .pm-toggle-label { color:#065f46; }
    .pm-toggle:not(.is-on) .pm-toggle-label { color:#991b1b; }
    .pm-toggle:disabled, .pm-toggle.is-disabled { opacity:.55; cursor:wait; }

    .pm-btn-grp { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .btn-pm-edit {
      padding:5px 11px; background:#eff6ff; color:#1d4ed8;
      border:1.5px solid #bfdbfe; border-radius:7px;
      font-size:12px; font-weight:700; cursor:pointer;
      font-family:'Cairo',sans-serif; white-space:nowrap; transition:background .15s;
    }
    .btn-pm-edit:hover { background:#dbeafe; }
    .btn-pm-del {
      padding:5px 11px; background:#fee2e2; color:#dc2626;
      border:1.5px solid #fca5a5; border-radius:7px;
      font-size:12px; font-weight:700; cursor:pointer;
      font-family:'Cairo',sans-serif; white-space:nowrap; transition:background .15s;
    }
    .btn-pm-del:hover { background:#dc2626; color:#fff; border-color:#dc2626; }

    .pm-empty {
      text-align:center; padding:40px 20px;
      color:#94a3b8; font-size:15px;
    }

    /* ── Availability cell ───────────────────────────────── */
    .pm-avail-cell { display:flex; align-items:center; }

    /* ── Order cell — inline-editable + drag handle ──────── */
    .pm-drag-handle {
      cursor:grab; color:#94a3b8; font-size:15px;
      margin-inline-end:4px; user-select:none;
    }
    .pm-order-input {
      width:48px; padding:5px 6px; text-align:center;
      border:1.5px solid #e2e8f0; border-radius:7px;
      font-size:13px; font-weight:800; color:#1d4ed8;
      font-family:'Cairo',sans-serif;
    }
    .pm-order-input:focus { outline:none; border-color:#059669; }
    .pm-tbl tbody tr[draggable="true"] { cursor:default; }
    .pm-tbl tbody tr.pm-row-dragging { opacity:.4; background:#f0fdf4; }
    .pm-sales-badge {
      display:inline-flex; align-items:center; gap:3px;
      background:#eff6ff; color:#1d4ed8; font-weight:800; font-size:12px;
      padding:4px 10px; border-radius:99px; white-space:nowrap;
    }

    /* ── Sub-filter bar (الكل / الكتب / إلكترونيات) ───────── */
    .prod-subfilter-bar {
      display:flex; gap:6px; margin-bottom:14px;
      background:#fff; border:1px solid #e2e8f0;
      border-radius:12px; padding:6px;
    }
    .prod-sf-btn {
      flex:1; display:flex; align-items:center; justify-content:center;
      gap:8px; padding:10px 14px; border:none; border-radius:9px;
      font-family:'Cairo',sans-serif; font-size:13px; font-weight:700;
      cursor:pointer; transition:background .2s,color .2s;
      background:transparent; color:#64748b;
    }
    .prod-sf-btn.active { background:#059669; color:#fff; }
    .prod-sf-btn:not(.active):hover { background:#f0fdf4; color:#059669; }
    .prod-sf-badge {
      display:inline-flex; align-items:center; justify-content:center;
      min-width:20px; height:20px; padding:0 5px; border-radius:99px;
      font-size:11px; font-weight:900; background:rgba(255,255,255,.25);
    }
    .prod-sf-btn:not(.active) .prod-sf-badge { background:#e2e8f0; color:#64748b; }
    .prod-sf-pending {
      font-size:11px; font-weight:800; color:#92400e;
      background:#fef3c7; border-radius:99px; padding:1px 8px; margin-inline-start:4px;
    }
    .prod-sf-btn.active .prod-sf-pending { background:rgba(255,255,255,.85); }

    /* ── Electronics subcategory chip row — same button styling as the
       main sub-filter bar, but chip-sized (content width, wraps) since
       there can be up to ~20 of them instead of a fixed 4. ── */
    .prod-subfilter-sub-bar { flex-wrap:wrap; margin-top:-6px; margin-bottom:14px; }
    .prod-subfilter-sub-bar .prod-sf-btn { flex:0 0 auto; padding:7px 12px; font-size:12px; }

    /* "⏳ بانتظار المراجعة" sub-filter — amber at rest (same tone as
       .prod-sf-pending/.badge-pending), emerald when active like every
       other .prod-sf-btn. */
    .prod-sf-btn.prod-sf-pending-btn:not(.active) { background:#fef3c7; color:#92400e; }
    .prod-sf-btn.prod-sf-pending-btn:not(.active):hover { background:#fde68a; color:#78350f; }
    .prod-sf-btn.prod-sf-pending-btn:not(.active) .prod-sf-badge { background:#fde68a; color:#78350f; }

    /* ── Pending-review rows (seller quick-add awaiting admin) ───── */
    .pm-tbl tbody tr.pm-row-pending  { border-right:4px solid #f59e0b; background:#fffbeb; }
    .pm-mcard.pm-row-pending         { border-right:4px solid #f59e0b; background:#fffbeb; }
    .pm-pending-meta { font-size:11px; color:#92400e; margin-top:3px; }
    @media (max-width:480px) {
      .prod-subfilter-bar { flex-wrap:wrap; }
      .prod-sf-btn { padding:8px; font-size:12px; }
    }

    /* ── Modal ──────────────────────────────────────────── */
    .pm-overlay {
      position:fixed; inset:0;
      background:rgba(15,23,42,.62);
      z-index:3000; display:none;
      align-items:flex-start; justify-content:center;
      padding:20px; overflow-y:auto;
    }
    .pm-overlay.open { display:flex; }
    @keyframes pm-pop {
      from { opacity:0; transform:translateY(12px) scale(.97); }
      to   { opacity:1; transform:translateY(0)   scale(1);   }
    }
    .pm-modal {
      background:#fff; border-radius:18px;
      width:100%; max-width:780px;
      display:flex; flex-direction:column;
      box-shadow:0 24px 80px rgba(0,0,0,.32);
      overflow:hidden; animation:pm-pop .18s ease-out;
      margin:auto;
    }
    .pm-mhdr {
      background:#0f172a; color:#fff; padding:16px 20px;
      display:flex; align-items:center;
      justify-content:space-between; flex-shrink:0;
    }
    .pm-mhdr-title { font-size:16px; font-weight:900; }
    .pm-mclose {
      background:rgba(255,255,255,.1); border:none; color:#fff;
      width:34px; height:34px; border-radius:8px; font-size:16px;
      cursor:pointer; display:flex; align-items:center;
      justify-content:center; font-family:'Cairo',sans-serif;
      transition:background .2s;
    }
    .pm-mclose:hover { background:rgba(255,255,255,.22); }
    .pm-mbody { padding:22px; overflow-y:auto; max-height:calc(100vh - 120px); }

    /* ── Form ─────────────────────────────────────────── */
    .pm-grid {
      display:grid; grid-template-columns:1fr 1fr; gap:14px;
    }
    .pm-grid .full { grid-column:1 / -1; }
    .pm-fld { display:flex; flex-direction:column; gap:5px; }
    .pm-fld label {
      font-size:11px; font-weight:800; color:#64748b;
      text-transform:uppercase; letter-spacing:.4px;
    }
    .pm-fld input,
    .pm-fld select,
    .pm-fld textarea {
      padding:10px 12px; border:1.5px solid #e2e8f0;
      border-radius:10px; font-size:14px;
      font-family:'Cairo',sans-serif; color:#1e293b;
      background:#fff; resize:vertical; transition:border-color .2s;
    }
    .pm-fld input:focus,
    .pm-fld select:focus,
    .pm-fld textarea:focus { outline:none; border-color:#059669; }
    .pm-fld textarea { min-height:90px; }
    .pm-fld .hint { font-size:11px; color:#94a3b8; margin-top:3px; }
    .pm-url-row { display:flex; gap:6px; align-items:center; }
    .pm-url-row input { flex:1; min-width:0; }

    /* ── Categories modal inputs — same look as .pm-fld input/select,
       just not wrapped in that label+field layout since this is a
       compact add-row + inline-editable table instead of a form. ── */
    #pmCategoriesOverlay input {
      padding:8px 10px; border:1.5px solid #e2e8f0;
      border-radius:8px; font-size:13px;
      font-family:'Cairo',sans-serif; color:#1e293b;
      background:#fff; transition:border-color .2s;
    }
    #pmCategoriesOverlay input:focus { outline:none; border-color:#059669; }

    .pm-divider {
      grid-column:1 / -1; border:none;
      border-top:2px solid #f1f5f9; margin:4px 0;
    }
    .pm-sec-lbl {
      grid-column:1 / -1;
      font-size:10px; font-weight:800; color:#94a3b8;
      text-transform:uppercase; letter-spacing:.5px;
      padding-top:6px;
    }

    /* ── Image upload ─────────────────────────────────── */
    .pm-upload-box {
      border:2px dashed #e2e8f0; border-radius:10px;
      padding:16px; text-align:center; cursor:pointer;
      transition:border-color .2s, background .2s;
      position:relative;
    }
    .pm-upload-box:hover   { border-color:#059669; background:#f0fdf4; }
    .pm-upload-box.loaded  { border-color:#6ee7b7; background:#f0fdf4; }
    .pm-upload-inp { display:none; }
    .pm-upload-lbl { font-size:13px; color:#64748b; font-weight:600; margin-bottom:4px; }
    .pm-upload-sub { font-size:11px; color:#94a3b8; }

    .pm-main-preview {
      max-width:110px; max-height:150px;
      object-fit:contain; border-radius:6px;
      display:block; margin:0 auto 8px;
    }
    .pm-gallery-row { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .pm-gal-wrap { position:relative; display:inline-block; }
    .pm-gal-img {
      width:72px; height:90px; object-fit:cover;
      border-radius:6px; border:1px solid #e2e8f0;
    }
    .pm-gal-rm {
      position:absolute; top:-7px; left:-7px;
      width:22px; height:22px;
      background:#dc2626; color:#fff;
      border:2px solid #fff; border-radius:50%;
      font-size:12px; cursor:pointer; line-height:1;
      display:flex; align-items:center; justify-content:center;
    }

    /* ── Save button ─────────────────────────────────── */
    .pm-save {
      width:100%; padding:14px;
      background:#059669; color:#fff; border:none;
      border-radius:10px; font-size:15px; font-weight:800;
      cursor:pointer; font-family:'Cairo',sans-serif;
      margin-top:18px; transition:background .2s;
    }
    .pm-save:hover    { background:#047857; }
    .pm-save:disabled { background:#94a3b8; cursor:default; }

    /* ── Divider between sections ─────────────────────── */
    .pm-separator {
      border:none; border-top:2px solid #e2e8f0;
      margin:24px 0;
    }
    .pm-old-label {
      font-size:11px; font-weight:800; color:#94a3b8;
      text-transform:uppercase; letter-spacing:.4px;
      margin-bottom:12px; display:block;
    }

    @media (max-width:600px) {
      .pm-grid { grid-template-columns:1fr; }
      .pm-grid .full { grid-column:1; }
      .pm-mbody { padding:16px; }
    }

    /* ── Mobile product cards ────────────────────────────── */
    .pm-mobile-cards { display:none; }

    @media (max-width:768px) {
      .pm-tbl-wrap { display:none; }
      .pm-mobile-cards {
        display:flex; flex-direction:column; gap:12px;
      }
      .pm-mcard {
        display:flex; align-items:flex-start; gap:12px;
        background:var(--white,#fff); border-radius:14px;
        box-shadow:var(--shadow-sm,0 1px 3px rgba(0,0,0,.08));
        padding:12px;
      }
      .pm-mcard-img {
        width:64px; height:64px; object-fit:cover;
        border-radius:10px; border:1px solid var(--border,#e2e8f0);
        flex-shrink:0; background:#f1f5f9;
      }
      .pm-mcard-img-ph {
        width:64px; height:64px; border-radius:10px;
        border:1px solid var(--border,#e2e8f0); background:#f1f5f9;
        display:flex; align-items:center; justify-content:center;
        font-size:24px; flex-shrink:0;
      }
      .pm-mcard-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:10px; }
      .pm-mcard-name {
        font-size:14px; font-weight:800; line-height:1.35;
        color:#1e293b; word-break:break-word;
      }
      .pm-mcard-row {
        display:flex; align-items:center; justify-content:space-between; gap:8px;
      }
      .pm-mcard-reorder { display:flex; gap:6px; }
      .pm-mcard-reorder button {
        width:34px; height:34px; border-radius:9px;
        border:1px solid var(--border,#e2e8f0); background:#f8fafc;
        color:#475569; font-size:14px; cursor:pointer;
        display:flex; align-items:center; justify-content:center;
        font-family:'Cairo',sans-serif;
      }
      .pm-mcard-reorder button:disabled { opacity:.4; cursor:default; }
      .pm-mcard-reorder button:active:not(:disabled) { background:#eef2ff; }
    }

    .pm-book-sort-row {
      display:none; align-items:center; justify-content:space-between; gap:12px;
      background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;
      padding:12px 14px; margin-bottom:14px; flex-wrap:wrap;
    }
    .pm-book-sort-title { font-size:13px; font-weight:900; color:#1e293b; }
    .pm-book-sort-active { color:#1d4ed8; }
    .pm-book-sort-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     HTML — inject into #tab-products
  ══════════════════════════════════════════════════════════ */
  function injectHTML() {
    const tab = document.getElementById('tab-products');
    if (!tab) return;

    /* Wrapper injected before existing content */
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="pm-section" id="pmSection">
        <div class="pm-section-header">
          <div>
            <div class="pm-section-title">🛍 إدارة المنتجات <span id="pmProductCount" style="background:#e2e8f0;color:#475569;font-size:13px;font-weight:700;padding:2px 10px;border-radius:99px;margin-right:8px;vertical-align:middle;">—</span></div>
            <div class="pm-section-sub">إضافة منتجات جديدة، تعديلها، التحكم بتوفرها وترتيب ظهورها</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button class="btn-pm-add" id="pmAddBtn">＋ إضافة منتج جديد</button>
            <button class="btn-pm-add" id="pmCategoriesBtn" style="background:#7c3aed;">🏷 التصنيفات الفرعية</button>
            <button class="btn-pm-add" id="pmSitemapBtn" style="background:#1d4ed8;">🗺 توليد Sitemap</button>
            <button type="button" class="btn-pm-add" id="pmFolderBtn" style="background:#64748b;">🔄 التحقق من خادم الصور المحلي</button>
            <span id="pmFolderStatus" style="font-size:12px;font-weight:700;color:#94a3b8;">⏳ جاري التحقق...</span>
          </div>
        </div>
        <div id="pmOrderWarning" style="display:none;background:#fef3c7;border:1.5px solid #fcd34d;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:13px;color:#78350f;line-height:1.6;">
          ⚠️ <strong>ميزة ترتيب الظهور غير مفعّلة</strong> — عمود <code>display_order</code> غير موجود في قاعدة البيانات.<br>
          شغّل ملف <strong>admin/supabase-admin-products-rls-fix.sql</strong> في <a href="https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new" target="_blank" style="color:#92400e;">Supabase SQL Editor</a> لتفعيل هذه الميزة.
        </div>

        <div class="prod-subfilter-bar" id="prodSubfilterBar">
          <button class="prod-sf-btn prod-sf-pending-btn" data-pfilter="pending" id="prodSfPendingBtn" style="display:none;">⏳ بانتظار المراجعة <span class="prod-sf-badge" id="psb-pending">—</span></button>
          <button class="prod-sf-btn active" data-pfilter="all">🗂 الكل <span class="prod-sf-badge" id="psb-all">—</span></button>
          <button class="prod-sf-btn" data-pfilter="books">📚 الكتب <span class="prod-sf-badge" id="psb-books">—</span><span class="prod-sf-pending" id="psb-books-pending" style="display:none;"></span></button>
          <button class="prod-sf-btn" data-pfilter="electronics">💻 إلكترونيات <span class="prod-sf-badge" id="psb-electronics">—</span></button>
        </div>
        <div class="prod-subfilter-bar prod-subfilter-sub-bar" id="prodSubcatFilterBar" style="display:none;">
          <button class="prod-sf-btn prod-sf-sub-btn active" data-psub="all">🗂 كل الإلكترونيات</button>
        </div>
        <div class="pm-book-sort-row" id="pmBookSortRow">
          <div>
            <div class="pm-book-sort-title">Book Sorting: <span class="pm-book-sort-active" id="pmBookSortLabel">Manual Order</span></div>
          </div>
          <div class="pm-book-sort-actions">
            <button type="button" class="pm-toggle" id="pmBookSortToggle"
                    role="switch" aria-checked="false" title="Switch book sorting mode">
              <span class="pm-toggle-track"><span class="pm-toggle-thumb"></span></span>
              <span class="pm-toggle-label" id="pmBookSortToggleLabel">Manual Order</span>
            </button>
          </div>
        </div>
        <div class="controls-bar">
          <input type="text" class="search-input" id="prodSearchInput" placeholder="🔍 بحث في المنتجات بالاسم أو التصنيف...">
          <button class="btn-refresh" id="productsRefreshBtn">↻ تحديث</button>
          <span class="orders-count" id="pmResultsCount"></span>
        </div>

        <div class="pm-tbl-wrap">
          <table class="pm-tbl">
            <thead>
              <tr>
                <th>الصورة</th>
                <th>اسم المنتج</th>
                <th>الفئة</th>
                <th>السعر</th>
                <th>التوفر</th>
                <th style="white-space:nowrap;">الترتيب</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="pmTbody">
              <tr><td colspan="7" class="pm-empty">⏳ جاري التحميل...</td></tr>
            </tbody>
          </table>
        </div>

        <div class="pm-mobile-cards" id="pmMobileCards"></div>
      </div>
    `;
    tab.insertBefore(wrap, tab.firstChild);

    /* Modal */
    const modal = document.createElement('div');
    modal.id = 'pmOverlay';
    modal.className = 'pm-overlay';
    modal.innerHTML = `
      <div class="pm-modal" id="pmModal">
        <div class="pm-mhdr">
          <span class="pm-mhdr-title" id="pmModalTitle">إضافة منتج جديد</span>
          <button class="pm-mclose" id="pmMClose">✕</button>
        </div>
        <div class="pm-mbody" id="pmMBody">
          <div id="pmPendingBanner" style="display:none;background:#fffbeb;border:1.5px solid #f59e0b;border-radius:10px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#92400e;line-height:1.7;"></div>
          ${buildForm()}
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    /* Sitemap modal */
    const sitemapModal = document.createElement('div');
    sitemapModal.id = 'pmSitemapOverlay';
    sitemapModal.className = 'pm-overlay';
    sitemapModal.innerHTML = `
      <div class="pm-modal" style="max-width:860px;">
        <div class="pm-mhdr">
          <span class="pm-mhdr-title">🗺 Sitemap Generator</span>
          <button class="pm-mclose" id="pmSitemapClose">✕</button>
        </div>
        <div class="pm-mbody">
          <p style="font-size:13px;color:#475569;margin-bottom:4px;">
            انسخ المحتوى أدناه واحفظه في ملف <strong>sitemap.xml</strong> على جذر الموقع.
          </p>
          <p style="font-size:12px;color:#94a3b8;margin-bottom:14px;">
            يشمل جميع الصفحات الثابتة + جميع المنتجات النشطة من قاعدة البيانات.
          </p>
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <button id="pmSitemapGenBtn" class="btn-pm-add" style="background:#1d4ed8;">🔄 توليد Sitemap</button>
            <button id="pmSitemapCopyBtn" class="btn-pm-add" style="background:#059669;display:none;">📋 نسخ الكل</button>
          </div>
          <div id="pmSitemapStatus" style="font-size:12px;color:#64748b;margin-bottom:8px;"></div>
          <textarea id="pmSitemapOutput"
            style="width:100%;height:420px;font-family:'Courier New',monospace;font-size:12px;
                   padding:12px;border:1.5px solid #e2e8f0;border-radius:8px;resize:vertical;
                   direction:ltr;line-height:1.5;background:#f8fafc;"
            placeholder="اضغط &quot;توليد Sitemap&quot; للبدء..." readonly></textarea>
        </div>
      </div>
    `;
    document.body.appendChild(sitemapModal);

    /* Categories modal — source of truth for the Supabase `categories`
       table (see admin/setup-categories.sql). Add/edit/deactivate here
       instead of ever hard-coding a subcategory list in JS. */
    const categoriesModal = document.createElement('div');
    categoriesModal.id = 'pmCategoriesOverlay';
    categoriesModal.className = 'pm-overlay';
    categoriesModal.innerHTML = `
      <div class="pm-modal" style="max-width:760px;">
        <div class="pm-mhdr">
          <span class="pm-mhdr-title">🏷 التصنيفات الفرعية (إلكترونيات)</span>
          <button class="pm-mclose" id="pmCategoriesClose">✕</button>
        </div>
        <div class="pm-mbody">
          <p style="font-size:12px;color:#94a3b8;margin-bottom:14px;">
            هذه القائمة تظهر تلقائياً في نموذج إضافة/تعديل منتج وفي فلاتر لوحة التحكم والموقع —
            إضافة تصنيف هنا لا يحتاج أي تعديل برمجي.
          </p>
          <div id="pmCatAddRow" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;padding:12px;background:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:10px;">
            <input type="text" id="pmCatNewIcon" placeholder="📦" style="width:52px;text-align:center;" maxlength="4">
            <input type="text" id="pmCatNewName" placeholder="اسم التصنيف (مثال: Webcams)" style="flex:1;min-width:160px;">
            <input type="text" id="pmCatNewGroup" placeholder="المجموعة (اختياري)" style="width:140px;">
            <button type="button" class="btn-pm-add" id="pmCatAddBtn" style="background:#059669;">＋ إضافة</button>
          </div>
          <div class="pm-tbl-wrap">
            <table class="pm-tbl">
              <thead>
                <tr>
                  <th></th><th>الاسم</th><th>Slug</th><th>المنتجات</th><th>مفعّل</th><th>الترتيب</th><th></th>
                </tr>
              </thead>
              <tbody id="pmCategoriesTbody">
                <tr><td colspan="7" class="pm-empty">⏳ جاري التحميل...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(categoriesModal);
  }

  /* ══════════════════════════════════════════════════════════
     LOCAL IMAGE SERVER — connectivity badge for the local Node
     helper (scripts/local-image-server.js, start with `npm run
     local-image-server`). See admin/local-fs.js for the actual
     read/write logic — it talks to http://127.0.0.1:8787.
  ══════════════════════════════════════════════════════════ */
  function renderFolderBadge(status) {
    const el = document.getElementById('pmFolderStatus');
    if (!el) return;
    const LABELS = {
      granted: { text: '✅ متصل بخادم الصور المحلي', color: '#059669' },
      offline: { text: '🔴 خادم الصور المحلي غير متصل — شغّله بـ npm run local-image-server', color: '#dc2626' },
    };
    const l = LABELS[status] || LABELS.offline;
    el.textContent = l.text;
    el.style.color = l.color;
  }

  async function initLocalFsBadge() {
    if (!window.LocalFS) { renderFolderBadge('offline'); return; }
    const status = await window.LocalFS.restorePermission();
    renderFolderBadge(status);
  }

  async function handleFolderBtnClick() {
    if (!window.LocalFS) return;
    const status = await window.LocalFS.restorePermission();
    renderFolderBadge(status);
    showToast(status === 'granted' ? '✅ خادم الصور المحلي متصل' : '❌ تعذّر الاتصال — تأكد من تشغيل npm run local-image-server', status === 'granted' ? 'success' : 'error');
  }

  /* ── Build form HTML ── */
  function buildForm() {
    const catOpts = CATEGORIES.map(c =>
      `<option value="${esc(c.value)}">${esc(c.label)}</option>`
    ).join('');

    return `
    <form id="pmForm" autocomplete="off">
      <div class="pm-grid">

        <div class="pm-sec-lbl">المعلومات الأساسية</div>

        <div class="pm-fld full">
          <label>اسم المنتج (عربي) *</label>
          <input type="text" id="pmName" required placeholder="ساعة ذكية Huawei GT4">
        </div>
        <div class="pm-fld full">
          <label>English Name * — يُستخدم لعنوان الصفحة في Google</label>
          <input type="text" id="pmNameEn" placeholder="Huawei GT4 Smart Watch" dir="ltr">
          <span class="hint">يولّد الـ Slug تلقائياً من هذا الحقل — مثال: Huawei GT4 Smart Watch</span>
        </div>
        <div class="pm-fld full">
          <label>French Name (اختياري)</label>
          <input type="text" id="pmNameFr" placeholder="Montre Connectée Huawei GT4" dir="ltr">
        </div>
        <div class="pm-fld">
          <label>الفئة *</label>
          <select id="pmCat">${catOpts}</select>
        </div>
        <div class="pm-fld" id="pmSubcatWrap">
          <label>الفئة الفرعية</label>
          <select id="pmSubcat"><option value="">— اختر —</option>${subcatOptionsHtml()}</select>
        </div>
        <div class="pm-fld full">
          <label>Brand / العلامة التجارية (اختياري)</label>
          <input type="text" id="pmBrand" placeholder="مثال: Anker, Samsung, Arduino" dir="ltr">
          <span class="hint">يظهر في نتائج Google وبيانات المنتج المنظمة</span>
        </div>

        <div id="pmBookFields" style="display:none;">
          <div class="pm-fld full">
            <label>المؤلف (Author)</label>
            <input type="text" id="pmAuthor" placeholder="مثال: جيمس كلير">
          </div>
          <div class="pm-fld">
            <label>المترجم (اختياري)</label>
            <input type="text" id="pmTranslator" placeholder="مثال: محمد فتحي خضر">
          </div>
          <div class="pm-fld">
            <label>سنة النشر (اختياري)</label>
            <input type="number" id="pmYear" min="0" placeholder="2018">
          </div>
        </div>

        <hr class="pm-divider">
        <div class="pm-sec-lbl">السعر والمخزون</div>

        <div class="pm-fld">
          <label>السعر الحالي (دج) *</label>
          <input type="number" id="pmPrice" required min="0" placeholder="1500">
        </div>
        <div class="pm-fld">
          <label>السعر القديم (دج)</label>
          <input type="number" id="pmOldPrice" min="0" placeholder="2000">
        </div>
        <div class="pm-fld">
          <label>التوفر</label>
          <button type="button" class="pm-toggle is-on" id="pmStockToggle"
                  role="switch" aria-checked="true" title="متوفر — اضغط لتعليمه كنفذت الكمية">
            <span class="pm-toggle-track"><span class="pm-toggle-thumb"></span></span>
            <span class="pm-toggle-label">🟢 متوفر</span>
          </button>
          <input type="hidden" id="pmStock" value="available">
        </div>
        <div class="pm-fld">
          <label>الكمية المتاحة</label>
          <input type="number" id="pmQty" min="0" placeholder="10">
        </div>

        <hr class="pm-divider">
        <div class="pm-sec-lbl">الوصف</div>

        <div class="pm-fld full">
          <label>وصف مختصر (للبطاقة) — سطر واحد</label>
          <textarea id="pmShortDesc" rows="2" placeholder="وصف قصير يظهر في بطاقة المنتج..."></textarea>
        </div>
        <div class="pm-fld full">
          <label>وصف كامل (لصفحة المنتج) — مطلوب عند إضافة منتج جديد</label>
          <textarea id="pmFullDesc" rows="5" placeholder="وصف مفصل: المميزات، محتوى الصندوق، حالات الاستخدام، التوصيل، الدفع..."></textarea>
        </div>

        <hr class="pm-divider">
        <div class="pm-sec-lbl">الصور — alt text تلقائي من اسم المنتج</div>

        <div class="pm-fld full">
          <label>الصورة الرئيسية</label>
          <div class="pm-upload-box" id="pmMainBox">
            <div id="pmMainPrev">
              <div class="pm-upload-lbl">📷 انقر لرفع الصورة الرئيسية</div>
              <div class="pm-upload-sub">PNG · JPG · WebP (يُفضَّل WebP لأداء أفضل)</div>
            </div>
            <input type="file" id="pmMainFile" class="pm-upload-inp" accept="image/*">
          </div>
          <span class="hint" style="font-size:11px;color:#94a3b8;margin-top:4px;">أو ادخل رابط الصورة مباشرة:</span>
          <div class="pm-url-row">
            <input type="url" id="pmMainUrl" placeholder="https://... (اختياري إذا رفعت الصورة)">
            <button type="button" class="btn-copy-msg" data-pma="copy-url" data-copy-target="pmMainUrl">📋 نسخ</button>
          </div>
        </div>

        <div class="pm-fld full">
          <label>صور إضافية (معرض الصور)</label>
          <div class="pm-upload-box" id="pmGalBox">
            <div class="pm-upload-lbl">📷 انقر لرفع صور إضافية</div>
            <div class="pm-upload-sub">يمكنك رفع عدة صور دفعة واحدة</div>
            <input type="file" id="pmGalFile" class="pm-upload-inp" accept="image/*" multiple>
          </div>
          <div class="pm-gallery-row" id="pmGalPreviews"></div>
        </div>

        <hr class="pm-divider">
        <div class="pm-sec-lbl">الرابط وتحسين محركات البحث (SEO)</div>

        <div class="pm-fld full">
          <label>Slug (رابط المنتج) * — يُولَّد تلقائياً من English Name</label>
          <input type="text" id="pmSlug" required placeholder="huawei-gt4-smart-watch" dir="ltr">
          <span class="hint">رابط الصفحة: /product/{slug}/ — حروف صغيرة وشرطات فقط، بدون مسافات</span>
        </div>
        <div class="pm-fld full">
          <label>SEO Title — عنوان في Google (بالإنجليزي يُفضَّل)</label>
          <input type="text" id="pmSeoTitle" placeholder="Huawei GT4 Smart Watch with 3 Straps | Derradj Shop" dir="ltr">
          <span class="hint">اتركه فارغاً ليُستخدم English Name تلقائياً — بحد أقصى 60 حرفاً</span>
        </div>
        <div class="pm-fld full">
          <label>SEO Description — وصف في Google (150-160 حرف)</label>
          <textarea id="pmSeoDesc" rows="2" placeholder="Buy Huawei GT4 Smart Watch in Algeria. Available at Derradj Shop with nationwide delivery..."></textarea>
        </div>
        <div class="pm-fld full">
          <label>Keywords — كلمات مفتاحية (مفصولة بفاصلة)</label>
          <input type="text" id="pmKeywords" placeholder="smart watch, huawei gt4, ساعة ذكية, montre connectée">
          <span class="hint">تشمل: اسم المنتج بالعربي والإنجليزي والفرنسي + الفئة + العلامة التجارية</span>
        </div>

        <hr class="pm-divider">
        <div class="pm-sec-lbl">الترتيب</div>

        <div class="pm-fld">
          <label>ترتيب الظهور — Display Order</label>
          <input type="number" id="pmOrder" min="1" step="1" placeholder="مثال: 1 أو 2 أو 3">
          <span class="hint">اتركه فارغاً ليظهر المنتج في آخر القائمة — يمكن تعديل الترتيب لاحقاً من الجدول</span>
        </div>

      </div>

      <button type="submit" class="pm-save" id="pmSaveBtn">🚀 نشر المنتج</button>
    </form>
    <div id="pmDeleteWrap" style="display:none;margin-top:16px;padding-top:16px;border-top:2px dashed #fee2e2;">
      <button type="button" class="btn-pm-del" id="pmDeleteBtn" style="width:100%;padding:12px;font-size:14px;">🗑 حذف المنتج نهائياً</button>
      <div class="hint" style="margin-top:6px;text-align:center;">إجراء لا يمكن التراجع عنه — سيُحذف المنتج نهائياً من المتجر.</div>
    </div>
    `;
  }

  /* ══════════════════════════════════════════════════════════
     EVENTS
  ══════════════════════════════════════════════════════════ */
  function bindEvents() {
    /* Open add modal */
    document.getElementById('pmAddBtn')?.addEventListener('click', () => openModal(null));

    /* Local project folder — File System Access API */
    document.getElementById('pmFolderBtn')?.addEventListener('click', handleFolderBtnClick);

    /* Close modal */
    document.getElementById('pmMClose')?.addEventListener('click', closeModal);
    document.getElementById('pmOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'pmOverlay') closeModal();
    });

    /* Form submit */
    document.getElementById('pmForm')?.addEventListener('submit', e => {
      e.preventDefault();
      saveProduct();
    });

    /* Show book-specific fields (author/translator/year) only for category=books */
    document.getElementById('pmCat')?.addEventListener('change', toggleBookFields);
    document.getElementById('pmBookSortToggle')?.addEventListener('click', toggleBookSortMode);

    /* Main image area click */
    document.getElementById('pmMainBox')?.addEventListener('click', e => {
      if (e.target.id !== 'pmMainFile') document.getElementById('pmMainFile')?.click();
    });
    document.getElementById('pmMainFile')?.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) uploadMainImage(f);
    });

    /* Copy image URL to clipboard — main field (+ any future .pm-url-row fields) */
    document.getElementById('pmMBody')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-pma="copy-url"]');
      if (!btn) return;
      copyFieldValue(btn.dataset.copyTarget, btn);
    });

    /* Gallery area click */
    document.getElementById('pmGalBox')?.addEventListener('click', e => {
      if (e.target.id !== 'pmGalFile') document.getElementById('pmGalFile')?.click();
    });
    document.getElementById('pmGalFile')?.addEventListener('change', e => {
      const files = Array.from(e.target.files);
      if (files.length) uploadGalleryImages(files);
    });

    /* Auto-slug from English name (primary), fallback to Arabic name */
    document.getElementById('pmNameEn')?.addEventListener('input', e => {
      const slugEl = document.getElementById('pmSlug');
      if (slugEl && !slugEl.dataset.manualEdit) {
        slugEl.value = slugify(e.target.value);
      }
    });
    document.getElementById('pmName')?.addEventListener('input', e => {
      const slugEl  = document.getElementById('pmSlug');
      const enValue = document.getElementById('pmNameEn')?.value?.trim();
      if (slugEl && !slugEl.dataset.manualEdit && !enValue) {
        slugEl.value = slugify(e.target.value);
      }
    });
    document.getElementById('pmSlug')?.addEventListener('input', e => {
      e.target.dataset.manualEdit = '1';
    });

    /* Table delegation — edit button */
    const pmTbody = document.getElementById('pmTbody');
    pmTbody?.addEventListener('click', e => {
      const btn = e.target.closest('[data-pma="edit"]');
      if (!btn) return;
      const p = ALL_PM_PRODUCTS.find(x => x.id === btn.dataset.pmid);
      if (p) openModal(p);
    });

    /* Availability toggle — saves immediately on click */
    pmTbody?.addEventListener('click', e => {
      const btn = e.target.closest('button[data-pma="avail"]');
      if (!btn || btn.disabled) return;
      const next = btn.classList.contains('is-on') ? 'out_of_stock' : 'available';
      setAvailability(btn.dataset.pmid, next);
    });

    /* Modal stock toggle — flips the hidden #pmStock value, saved on form submit */
    document.getElementById('pmStockToggle')?.addEventListener('click', () => {
      const isAvailNow = document.getElementById('pmStock')?.value !== 'out_of_stock';
      setStockToggle(isAvailNow ? 'out_of_stock' : 'available');
    });

    /* Order <input> — Enter commits + blurs; focusout (bubbles) saves */
    pmTbody?.addEventListener('keydown', e => {
      const inp = e.target.closest('input[data-pma="order"]');
      if (inp && e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    });
    pmTbody?.addEventListener('focusout', e => {
      const inp = e.target.closest('input[data-pma="order"]');
      if (inp) commitOrderInput(inp);
    });

    /* Drag & drop reordering */
    bindDragEvents(pmTbody);

    /* ── Mobile cards: only availability toggle + reorder are interactive ── */
    const pmMobileCards = document.getElementById('pmMobileCards');
    pmMobileCards?.addEventListener('click', e => {
      const moveBtn = e.target.closest('button[data-pma="moveup"], button[data-pma="movedown"]');
      if (moveBtn) {
        if (moveBtn.disabled) return;
        moveProductStep(moveBtn.dataset.pmid, moveBtn.dataset.pma === 'moveup' ? -1 : 1);
        return;
      }

      const availBtn = e.target.closest('button[data-pma="avail"]');
      if (availBtn) {
        if (availBtn.disabled) return;
        const next = availBtn.classList.contains('is-on') ? 'out_of_stock' : 'available';
        setAvailability(availBtn.dataset.pmid, next);
      }
    });

    /* Delete — only reachable from inside the edit modal */
    document.getElementById('pmDeleteBtn')?.addEventListener('click', async function () {
      if (!EDIT_PRODUCT_ID) return;
      if (!confirm('حذف هذا المنتج نهائياً؟ لا يمكن التراجع عن هذا الإجراء.')) return;
      const ok = await deleteProduct(EDIT_PRODUCT_ID, this);
      if (ok) closeModal();
    });

    /* Sub-filter (الكل / الكتب / إلكترونيات) */
    document.getElementById('prodSubfilterBar')?.addEventListener('click', e => {
      const btn = e.target.closest('.prod-sf-btn');
      if (!btn) return;
      PROD_FILTER = btn.dataset.pfilter || 'all';
      PROD_SUBFILTER = 'all'; /* leaving/re-entering "electronics" always starts unfiltered */
      document.querySelectorAll('#prodSubfilterBar .prod-sf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateBookSortUi();
      renderTable();
    });

    /* Electronics subcategory chips — rebuilt on every renderTable(),
       so delegate instead of binding to individual buttons. */
    document.getElementById('prodSubcatFilterBar')?.addEventListener('click', e => {
      const btn = e.target.closest('.prod-sf-sub-btn');
      if (!btn) return;
      PROD_SUBFILTER = btn.dataset.psub || 'all';
      renderTable();
    });

    /* Search */
    document.getElementById('prodSearchInput')?.addEventListener('input', e => {
      PROD_SEARCH_QUERY = e.target.value.trim();
      renderTable();
    });

    /* Manual refresh */
    document.getElementById('productsRefreshBtn')?.addEventListener('click', async function () {
      this.disabled = true; this.textContent = '⏳ جاري التحديث...';
      await loadProducts();
      this.disabled = false; this.textContent = '↻ تحديث';
    });

    /* Reload when tab is clicked — reuses the cache if still fresh */
    document.querySelectorAll('.tab-btn[data-tab="products"]').forEach(b => {
      b.addEventListener('click', () => setTimeout(loadProductsIfStale, 200));
    });

    /* Sitemap modal open/close */
    document.getElementById('pmSitemapBtn')?.addEventListener('click', () => {
      document.getElementById('pmSitemapOverlay')?.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
    document.getElementById('pmSitemapClose')?.addEventListener('click', () => {
      document.getElementById('pmSitemapOverlay')?.classList.remove('open');
      document.body.style.overflow = '';
    });
    document.getElementById('pmSitemapOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'pmSitemapOverlay') {
        e.target.classList.remove('open');
        document.body.style.overflow = '';
      }
    });

    /* Categories modal open/close */
    document.getElementById('pmCategoriesBtn')?.addEventListener('click', async () => {
      document.getElementById('pmCategoriesOverlay')?.classList.add('open');
      document.body.style.overflow = 'hidden';
      await loadCategories();
      renderCategoriesTable();
    });
    document.getElementById('pmCategoriesClose')?.addEventListener('click', () => {
      document.getElementById('pmCategoriesOverlay')?.classList.remove('open');
      document.body.style.overflow = '';
      /* Categories may have changed (add/edit/deactivate) — refresh
         everywhere they're rendered: form dropdown, filter chips, table labels. */
      populateSubcatSelect();
      renderTable();
    });
    document.getElementById('pmCategoriesOverlay')?.addEventListener('click', e => {
      if (e.target.id === 'pmCategoriesOverlay') {
        e.target.classList.remove('open');
        document.body.style.overflow = '';
        populateSubcatSelect();
        renderTable();
      }
    });

    document.getElementById('pmCatAddBtn')?.addEventListener('click', addCategory);

    /* Delegated: every row's inline edits (name/slug/icon/order/active/delete) */
    document.getElementById('pmCategoriesTbody')?.addEventListener('click', e => {
      const delBtn = e.target.closest('button[data-cata="delete"]');
      if (delBtn) { deleteCategory(delBtn.dataset.catid); return; }
      const toggleBtn = e.target.closest('button[data-cata="toggle"]');
      if (toggleBtn) { toggleCategoryActive(toggleBtn.dataset.catid, toggleBtn.classList.contains('is-on')); return; }
    });
    document.getElementById('pmCategoriesTbody')?.addEventListener('focusout', e => {
      const inp = e.target.closest('input[data-cata]');
      if (inp) commitCategoryFieldEdit(inp);
    });

    /* Sitemap generate button */
    document.getElementById('pmSitemapGenBtn')?.addEventListener('click', generateSitemap);

    /* Sitemap copy button */
    document.getElementById('pmSitemapCopyBtn')?.addEventListener('click', () => {
      const out = document.getElementById('pmSitemapOutput');
      if (!out || !out.value) return;
      navigator.clipboard?.writeText(out.value)
        .then(() => showToast('✅ تم نسخ Sitemap XML'))
        .catch(() => { out.select(); document.execCommand('copy'); showToast('✅ تم النسخ'); });
    });
  }

  /* ══════════════════════════════════════════════════════════
     LOAD / RENDER
  ══════════════════════════════════════════════════════════ */
  async function loadProducts() {
    const tbody = document.getElementById('pmTbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="pm-empty">⏳ جاري التحميل...</td></tr>`;

    console.log('[PM] loadProducts — querying admin_products_catalog');

    try {
      const { data: { session }, error: authErr } = await sb.auth.getSession();
      if (authErr) console.warn('[PM] getSession error:', authErr);

      if (!session) {
        console.warn('[PM] No active session — products cannot load');
        tbody.innerHTML = `<tr><td colspan="7" class="pm-empty">🔒 يجب تسجيل الدخول</td></tr>`;
        return;
      }

      console.log('[PM] Authenticated as:', session.user?.email, '| uid:', session.user?.id);

      let data, queryError;

      /* ── First attempt: order by display_order ─────────────────── */
      ({ data, error: queryError } = await sb
        .from('admin_products_catalog')
        .select('*, submitted_by_staff:staff_accounts!admin_products_catalog_submitted_by_fkey(full_name)')
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }));

      /* ── If display_order column is missing, fall back ─────────── */
      if (queryError && (queryError.code === '42703' || (queryError.message || '').includes('display_order'))) {
        console.warn('[PM] display_order column not found in DB — falling back. Run admin/supabase-admin-products-rls-fix.sql to add it.');
        DISPLAY_ORDER_SUPPORTED = false;

        ({ data, error: queryError } = await sb
          .from('admin_products_catalog')
          .select('*, submitted_by_staff:staff_accounts!admin_products_catalog_submitted_by_fkey(full_name)')
          .order('created_at', { ascending: true }));
      }

      if (queryError) {
        console.error('[PM] Supabase query error:', queryError);
        throw queryError;
      }

      /* ── Detect column support from first row ──────────────────── */
      if (DISPLAY_ORDER_SUPPORTED === null) {
        if (Array.isArray(data) && data.length > 0) {
          DISPLAY_ORDER_SUPPORTED = Object.prototype.hasOwnProperty.call(data[0], 'display_order');
        } else {
          /* 0 rows returned — column ordering didn't fail so assume supported */
          DISPLAY_ORDER_SUPPORTED = true;
        }
      }

      console.log('[PM] display_order column supported:', DISPLAY_ORDER_SUPPORTED);

      const count = data?.length ?? 0;
      console.log('[PM] Fetched', count, 'products. display_order values:',
        data?.map(p => ({ name: p.product_name, display_order: p.display_order })));

      if (count === 0) {
        console.warn('[PM] 0 products returned — table empty or RLS is filtering. Run admin/supabase-admin-products-rls-fix.sql if needed.');
      }

      ALL_PM_PRODUCTS = data || [];
      PM_LAST_LOADED = Date.now();

      /* Show/hide the "column missing" warning banner */
      const warning = document.getElementById('pmOrderWarning');
      if (warning) warning.style.display = DISPLAY_ORDER_SUPPORTED ? 'none' : 'block';

      /* Self-heal: fix gaps/duplicates in display_order so each category
         is always a clean 1..N sequence (requirement: no gaps, no dupes). */
      if (DISPLAY_ORDER_SUPPORTED !== false && needsRenumber(ALL_PM_PRODUCTS)) {
        await renumberAllCategories(ALL_PM_PRODUCTS);
      } else {
        renderTable();
      }
    } catch (err) {
      console.error('[PM] loadProducts failed:', err);
      tbody.innerHTML = `<tr><td colspan="7" class="pm-empty">
        ❌ فشل تحميل المنتجات: ${esc(err.message)}
        <br><small style="font-size:11px;color:#94a3b8;margin-top:4px;display:block;">
          افتح Developer Console (F12) وابحث عن رسائل [PM] للتفاصيل
        </small>
      </td></tr>`;
    }
  }

  /* ── display_order is scoped PER CATEGORY (electronics: 1..N, books: 1..N
     independently) — not one global sequence across the whole catalog. ── */
  const CATEGORY_ORDER = ['electronics', 'books'];
  function categoryKey(p) { return isElec(p) ? 'electronics' : 'books'; }

  /* ── Sort helper: display_order ASC, NULLs last, then created_at ASC.
     Only meaningful within a single category — display_order values
     repeat across categories (e.g. both have a "1"). ── */
  function sortedByOrder(products) {
    return [...products].sort((a, b) => {
      const ao = a.display_order ?? Infinity;
      const bo = b.display_order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  }

  /* ── Books-only: sales DESC, manual display_order ASC as a stable
     tiebreaker for equal (including zero) sales — mirrors
     sortProductsForBookMode() in js/products-loader.js so admin and
     public agree on the ranking. ── */
  function sortedBySales(products) {
    return [...products].sort((a, b) => {
      const as = bookSalesFor(a);
      const bs = bookSalesFor(b);
      if (as !== bs) return bs - as;
      const ao = a.display_order ?? Infinity;
      const bo = b.display_order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return new Date(a.created_at) - new Date(b.created_at);
    });
  }

  /* ── Full list grouped by category (electronics first, then books),
     each group internally sorted by its own display_order — except
     books while Best-Selling mode is on, which sort by real sales
     instead (electronics is never affected by the book toggle). Used
     for rendering so categories never interleave. ── */
  function sortedGrouped(products) {
    return CATEGORY_ORDER.flatMap(cat => {
      const group = products.filter(p => categoryKey(p) === cat);
      return (cat === 'books' && BOOK_SORT_MODE === 'best_selling')
        ? sortedBySales(group)
        : sortedByOrder(group);
    });
  }

  /* ── True if any category's display_order isn't a clean 1..N sequence ── */
  function needsRenumber(products) {
    return CATEGORY_ORDER.some(cat => {
      const sorted = sortedByOrder(products.filter(p => categoryKey(p) === cat));
      return sorted.some((p, i) => p.display_order !== i + 1);
    });
  }

  function getFilteredProducts() {
    const q = PROD_SEARCH_QUERY.toLowerCase();
    return sortedGrouped(ALL_PM_PRODUCTS).filter(p => {
      if (PROD_FILTER === 'books'       &&  isElec(p)) return false;
      if (PROD_FILTER === 'electronics' && !isElec(p)) return false;
      if (PROD_FILTER === 'electronics' && PROD_SUBFILTER !== 'all' &&
          resolveCategorySlug(p) !== PROD_SUBFILTER) return false;
      if (PROD_FILTER === 'pending'     && p.status !== 'pending_review') return false;
      if (q && !String(p.product_name || '').toLowerCase().includes(q) &&
               !String(p.category || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function updateSubfilterBadges() {
    const elecCount    = ALL_PM_PRODUCTS.filter(isElec).length;
    const booksCount   = ALL_PM_PRODUCTS.length - elecCount;
    const pendingBooks = ALL_PM_PRODUCTS.filter(p => !isElec(p) && p.status === 'pending_review').length;
    const pendingTotal = ALL_PM_PRODUCTS.filter(p => p.status === 'pending_review').length;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('psb-all', ALL_PM_PRODUCTS.length);
    set('psb-books', booksCount);
    set('psb-electronics', elecCount);
    set('tab-badge-products', ALL_PM_PRODUCTS.length);
    set('pmProductCount', ALL_PM_PRODUCTS.length);

    const pendingEl = document.getElementById('psb-books-pending');
    if (pendingEl) {
      pendingEl.style.display = pendingBooks > 0 ? '' : 'none';
      pendingEl.textContent = `· ${pendingBooks} بانتظار المراجعة`;
    }

    /* "⏳ بانتظار المراجعة" sub-filter — hidden entirely when there's
       nothing pending across any category. */
    set('psb-pending', pendingTotal);
    const pendingBtn = document.getElementById('prodSfPendingBtn');
    if (pendingBtn) {
      pendingBtn.style.display = pendingTotal > 0 ? '' : 'none';
      /* If it disappears while it was the active filter (last pending
         item just got published), fall back to "الكل" instead of
         leaving the table stuck on a filter with no visible button. */
      if (pendingTotal === 0 && PROD_FILTER === 'pending') {
        PROD_FILTER = 'all';
        document.querySelectorAll('.prod-sf-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.prod-sf-btn[data-pfilter="all"]')?.classList.add('active');
      }
    }
    updateBookSortUi();
    renderSubcatFilterBar();
  }

  /* ── Electronics subcategory chip row — only shown while the main
     "إلكترونيات" filter is active, one chip per active category with a
     live count, built from ALL_CATEGORIES (never hard-coded). Uses
     resolveCategorySlug() so the 7 legacy products bucket correctly
     without their DB subcategory value ever being touched. ── */
  function renderSubcatFilterBar() {
    const bar = document.getElementById('prodSubcatFilterBar');
    if (!bar) return;

    if (PROD_FILTER !== 'electronics') { bar.style.display = 'none'; return; }

    const elecProducts = ALL_PM_PRODUCTS.filter(isElec);
    const counts = new Map();
    elecProducts.forEach(p => {
      const slug = resolveCategorySlug(p);
      if (slug) counts.set(slug, (counts.get(slug) || 0) + 1);
    });

    const chips = ALL_CATEGORIES
      .filter(c => counts.get(c.slug))
      .map(c => `<button class="prod-sf-btn prod-sf-sub-btn${PROD_SUBFILTER === c.slug ? ' active' : ''}" data-psub="${esc(c.slug)}">${esc(c.icon || '📦')} ${esc(c.name)} <span class="prod-sf-badge">${counts.get(c.slug)}</span></button>`)
      .join('');

    /* A lone "All Electronics" chip (no product has a resolvable
       subcategory yet — e.g. before admin/setup-categories.sql has
       been run, or none classified yet) would just repeat what the
       parent "إلكترونيات" button above already says: an extra bordered
       row of empty space for zero added filtering value. Only show
       this row once there's at least one real subcategory to filter by. */
    if (!chips) { bar.style.display = 'none'; return; }

    bar.style.display = '';
    bar.innerHTML = `<button class="prod-sf-btn prod-sf-sub-btn${PROD_SUBFILTER === 'all' ? ' active' : ''}" data-psub="all">🗂 كل الإلكترونيات <span class="prod-sf-badge">${elecProducts.length}</span></button>${chips}`;
  }

  function normalizeBookSortMode(mode) {
    return mode === 'best_selling' ? 'best_selling' : 'manual';
  }

  function bookSortModeLabel(mode) {
    return normalizeBookSortMode(mode) === 'best_selling' ? 'Best-Selling' : 'Manual Order';
  }

  function applyBookSortUi() {
    const isBest = BOOK_SORT_MODE === 'best_selling';
    const toggle = document.getElementById('pmBookSortToggle');
    const label = document.getElementById('pmBookSortLabel');
    const toggleLabel = document.getElementById('pmBookSortToggleLabel');
    if (toggle) {
      toggle.classList.toggle('is-on', isBest);
      toggle.setAttribute('aria-checked', String(isBest));
    }
    if (label) label.textContent = bookSortModeLabel(BOOK_SORT_MODE);
    if (toggleLabel) toggleLabel.textContent = bookSortModeLabel(BOOK_SORT_MODE);
  }

  function updateBookSortUi() {
    const row = document.getElementById('pmBookSortRow');
    if (row) row.style.display = PROD_FILTER === 'books' ? 'flex' : 'none';
    applyBookSortUi();
  }

  /* ── Real sales data — reads the same public.book_sales_summary view
     that the public site sorts by (SUM(order_items.quantity), grouped by
     product_name; see admin/book-sorting-mode.sql). Same source the
     existing "📚 الكتب المباعة" tab uses (admin/bestsellers.js), so this
     doesn't invent a new sales-counting rule. ── */
  async function fetchBookSales() {
    try {
      const { data, error } = await sb
        .from('book_sales_summary')
        .select('product_name, sold');
      if (error) throw error;
      const sales = new Map();
      (data || []).forEach(row => {
        sales.set(String(row.product_name || '').trim(), Number(row.sold) || 0);
      });
      BOOK_SALES = sales;
    } catch (err) {
      console.warn('[PM] book sales unavailable; using zero sales:', err.message || err);
      BOOK_SALES = new Map();
    }
    BOOK_SALES_LOADED = true;
  }

  function bookSalesFor(p) {
    const key = String(arName(p) || '').trim();
    if (BOOK_SALES.has(key)) return BOOK_SALES.get(key);
    const pn = String(p.product_name || '').trim();
    if (BOOK_SALES.has(pn)) return BOOK_SALES.get(pn);
    const pnAr = String(p.product_name_ar || '').trim();
    return BOOK_SALES.get(pnAr) || 0;
  }

  async function loadBookSortMode() {
    try {
      const { data, error } = await sb
        .from('site_settings')
        .select('value')
        .eq('key', 'book_sort_mode')
        .maybeSingle();
      if (error) throw error;
      BOOK_SORT_MODE = normalizeBookSortMode(data?.value?.mode);
    } catch (err) {
      console.warn('[PM] book_sort_mode setting unavailable; using manual order:', err.message || err);
      BOOK_SORT_MODE = 'manual';
    }
    if (BOOK_SORT_MODE === 'best_selling' && !BOOK_SALES_LOADED) {
      await fetchBookSales();
    }
    applyBookSortUi();
    /* loadProducts() may already have rendered with the default 'manual'
       mode before this async settings fetch resolved — re-render now
       that the real mode (and its sales data) is known. renderTable()
       is a no-op if the table hasn't loaded yet. */
    renderTable();
  }

  async function toggleBookSortMode() {
    const next = BOOK_SORT_MODE === 'best_selling' ? 'manual' : 'best_selling';
    const previous = BOOK_SORT_MODE;

    const btn = document.getElementById('pmBookSortToggle');
    if (btn) btn.disabled = true;
    try {
      if (next === 'best_selling') {
        await fetchBookSales(); /* always refresh so the ranking shown is current */
      }
      BOOK_SORT_MODE = next;
      applyBookSortUi();
      renderTable();

      const { error } = await sb
        .from('site_settings')
        .upsert({
          key: 'book_sort_mode',
          value: { mode: next },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });
      if (error) throw error;
      showToast('Book Sorting: ' + bookSortModeLabel(next));
    } catch (err) {
      BOOK_SORT_MODE = previous;
      applyBookSortUi();
      renderTable();
      showToast('Failed to save book sorting mode: ' + (err.message || ''), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function availToggleHtml(id, status) {
    const isAvail = status !== 'out_of_stock';
    return `<button type="button" class="pm-toggle ${isAvail ? 'is-on' : ''}" data-pma="avail" data-pmid="${esc(id)}"
              role="switch" aria-checked="${isAvail}"
              title="${isAvail ? 'متوفر — اضغط لتعليمه كنفذت الكمية' : 'نفذت الكمية — اضغط لتعليمه كمتوفر'}">
      <span class="pm-toggle-track"><span class="pm-toggle-thumb"></span></span>
      <span class="pm-toggle-label">${isAvail ? '🟢 متوفر' : '⚪ نفذت الكمية'}</span>
    </button>`;
  }

  /* Mutates an existing .pm-toggle button in place (used for optimistic UI + rollback) */
  function applyToggleState(btn, isAvail) {
    if (!btn) return;
    btn.classList.toggle('is-on', isAvail);
    btn.setAttribute('aria-checked', String(isAvail));
    btn.title = isAvail ? 'متوفر — اضغط لتعليمه كنفذت الكمية' : 'نفذت الكمية — اضغط لتعليمه كمتوفر';
    const label = btn.querySelector('.pm-toggle-label');
    if (label) label.textContent = isAvail ? '🟢 متوفر' : '⚪ نفذت الكمية';
  }

  /* Syncs the modal's stock toggle (hidden input + visual) — used on open/reset */
  function setStockToggle(status) {
    const isAvail = status !== 'out_of_stock';
    const hidden = document.getElementById('pmStock');
    if (hidden) hidden.value = isAvail ? 'available' : 'out_of_stock';
    applyToggleState(document.getElementById('pmStockToggle'), isAvail);
  }

  /* Pending-review rows come from a seller's quick-add — surface who and when. */
  function pendingMetaHtml(p) {
    if (p.status !== 'pending_review') return '';
    const who = p.submitted_by_staff?.full_name || 'بائع';
    return `<div class="pm-pending-meta">⏳ أرسله ${esc(who)} — ${esc(fmtDate(p.submitted_at))}</div>
      ${p.submission_note ? `<div class="pm-pending-meta">📝 ${esc(p.submission_note)}</div>` : ''}`;
  }

  function rowHtml(p) {
    const thumbSrc = resolveThumbSrc(p);
    const rawFallback = p.category !== 'books' && thumbSrc !== p.main_image ? esc(p.main_image || '') : '';
    const imgHtml = thumbSrc
      ? `<img src="${esc(thumbSrc)}" class="pm-thumb" alt="" ${rawFallback ? `data-fallback="${rawFallback}" ` : ''}onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback}else{this.outerHTML='<div class=pm-thumb-ph>📦</div>'}">`
      : `<div class="pm-thumb-ph">📦</div>`;
    const isPending = p.status === 'pending_review';
    /* Best-Selling mode drives the visible order from sales, not
       display_order — dragging/editing position here would silently
       overwrite the manual order with whatever the sales ranking
       happens to be (see applyDragReorder), so lock it while active. */
    const salesMode = !isElec(p) && BOOK_SORT_MODE === 'best_selling';
    /* A subcategory chip narrows the visible rows to a strict subset of
       the electronics category. Drag-and-drop derives its new order
       from the visible DOM rows (applyDragReorder), so dragging inside
       a filtered subset would renumber only that subset 1..N and
       corrupt display_order for the rest of the category. The numeric
       order <input> stays enabled — moveToPosition() always recomputes
       from the full category regardless of what's currently filtered,
       so it's already safe. */
    const subFiltered = isElec(p) && PROD_SUBFILTER !== 'all';
    const dragLocked = salesMode || subFiltered;

    return `<tr draggable="${dragLocked ? 'false' : 'true'}" data-pmid="${esc(p.id)}" class="${isPending ? 'pm-row-pending' : ''}">
        <td>${imgHtml}</td>
        <td>
          <strong style="font-size:13px;display:block;">${esc(p.product_name)}</strong>
          ${p.product_name_ar ? `<span style="font-size:12px;color:#64748b;">${esc(p.product_name_ar)}</span><br>` : ''}
          ${p.slug ? `<span style="font-size:11px;color:#94a3b8;direction:ltr;">/product/${esc(p.slug)}/</span>` : ''}
          ${isPending ? `<span class="badge badge-pending">⏳ بانتظار المراجعة</span>${pendingMetaHtml(p)}` : ''}
        </td>
        <td style="font-size:13px;font-weight:600;">${esc(catLabel(p.category))}${subcategoryLabelHtml(p)}</td>
        <td>
          <strong style="color:#1d4ed8;direction:ltr;display:block;">${fmtPrice(p.price)}</strong>
          ${p.old_price ? `<span style="font-size:12px;text-decoration:line-through;color:#94a3b8;direction:ltr;">${fmtPrice(p.old_price)}</span>` : ''}
        </td>
        <td>
          <div class="pm-avail-cell">${availToggleHtml(p.id, p.stock_status)}</div>
        </td>
        <td style="text-align:center;white-space:nowrap;">
          ${salesMode
            ? `<span class="pm-sales-badge" title="مرتّب حسب المبيعات الفعلية — الترتيب اليدوي معطّل">🏆 ${bookSalesFor(p)}</span>`
            : `<span class="pm-drag-handle" title="${subFiltered ? 'امسح فلتر الفئة الفرعية لتفعيل السحب' : 'اسحب لإعادة الترتيب'}" style="${subFiltered ? 'opacity:.35;cursor:default;' : ''}">⠿</span>
          <input type="number" class="pm-order-input" min="1" step="1"
                 value="${p.display_order ?? ''}" data-pma="order" data-pmid="${esc(p.id)}">`}
        </td>
        <td>
          <button class="btn-pm-edit" data-pma="edit" data-pmid="${esc(p.id)}">✏️ تعديل</button>
        </td>
      </tr>`;
  }

  /* ── Mobile card: image, name, availability switch, reorder controls only ── */
  function mobileCardHtml(p) {
    const thumbSrc = resolveThumbSrc(p);
    const rawFallback = p.category !== 'books' && thumbSrc !== p.main_image ? esc(p.main_image || '') : '';
    const imgHtml = thumbSrc
      ? `<img src="${esc(thumbSrc)}" class="pm-mcard-img" alt="" ${rawFallback ? `data-fallback="${rawFallback}" ` : ''}onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback}else{this.outerHTML='<div class=pm-mcard-img-ph>📦</div>'}">`
      : `<div class="pm-mcard-img-ph">📦</div>`;

    const salesMode = !isElec(p) && BOOK_SORT_MODE === 'best_selling';
    const reorderDisabled = DISPLAY_ORDER_SUPPORTED === false || salesMode;
    const order = p.display_order ?? null;
    const groupSize = ALL_PM_PRODUCTS.filter(x => categoryKey(x) === categoryKey(p)).length;
    const isFirst = order !== null && order <= 1;
    const isLast  = order !== null && order >= groupSize;
    const isPending = p.status === 'pending_review';

    return `<div class="pm-mcard ${isPending ? 'pm-row-pending' : ''}" data-pmid="${esc(p.id)}">
        ${imgHtml}
        <div class="pm-mcard-body">
          <div class="pm-mcard-name">${esc(p.product_name)}</div>
          ${isElec(p) ? `<div style="font-size:11px;color:#64748b;">${subcategoryLabelHtml(p).replace(/^<br>/, '')}</div>` : ''}
          ${isPending ? `<span class="badge badge-pending">⏳ بانتظار المراجعة</span>${pendingMetaHtml(p)}` : ''}
          ${salesMode ? `<span class="pm-sales-badge" title="مرتّب حسب المبيعات الفعلية — الترتيب اليدوي معطّل">🏆 ${bookSalesFor(p)} مبيعات</span>` : ''}
          <div class="pm-mcard-row">
            ${availToggleHtml(p.id, p.stock_status)}
            <div class="pm-mcard-reorder">
              <button type="button" data-pma="moveup" data-pmid="${esc(p.id)}"
                      title="نقل للأعلى" ${reorderDisabled || isFirst ? 'disabled' : ''}>▲</button>
              <button type="button" data-pma="movedown" data-pmid="${esc(p.id)}"
                      title="نقل للأسفل" ${reorderDisabled || isLast ? 'disabled' : ''}>▼</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function renderTable() {
    const tbody  = document.getElementById('pmTbody');
    const mcards = document.getElementById('pmMobileCards');
    if (!tbody) return;

    updateSubfilterBadges();

    if (!ALL_PM_PRODUCTS.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="pm-empty">
        <div style="font-size:15px;">لا توجد منتجات بعد.</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:6px;max-width:420px;margin-left:auto;margin-right:auto;line-height:1.6;">
          إذا أضفت منتجاً ولا يظهر هنا، افتح Developer Console (F12) وابحث عن رسائل <strong>[PM]</strong>.
          قد تكون مشكلة في سياسات RLS على Supabase — شغّل ملف <strong>supabase-admin-products-rls-fix.sql</strong>.
        </div>
        <button id="pmRetryBtn" style="margin-top:12px;padding:8px 20px;background:#1d4ed8;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-family:'Cairo',sans-serif;">🔄 إعادة التحميل</button>
      </td></tr>`;
      document.getElementById('pmRetryBtn')?.addEventListener('click', loadProducts);
      if (mcards) mcards.innerHTML = `<div class="pm-empty">لا توجد منتجات بعد.</div>`;
      return;
    }

    const list = getFilteredProducts();
    const countEl = document.getElementById('pmResultsCount');
    if (countEl) {
      countEl.textContent = list.length + ' منتج' +
        (list.length !== ALL_PM_PRODUCTS.length ? ` (من ${ALL_PM_PRODUCTS.length})` : '');
    }

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="pm-empty">لا توجد منتجات مطابقة</td></tr>`;
      if (mcards) mcards.innerHTML = `<div class="pm-empty">لا توجد منتجات مطابقة</div>`;
      return;
    }

    tbody.innerHTML = list.map(rowHtml).join('');
    if (mcards) mcards.innerHTML = list.map(mobileCardHtml).join('');
  }

  /* ══════════════════════════════════════════════════════════
     AVAILABILITY — AJAX save, optimistic UI, rollback on failure
  ══════════════════════════════════════════════════════════ */
  /* Table row + mobile card both render a toggle for the same product —
     keep them in sync so switching views never shows stale state. */
  function allAvailToggles(id) {
    return document.querySelectorAll(`button[data-pma="avail"][data-pmid="${id}"]`);
  }

  async function setAvailability(id, status) {
    const product  = ALL_PM_PRODUCTS.find(p => p.id === id);
    const previous = product?.stock_status ?? 'available';
    const toggles  = allAvailToggles(id);
    toggles.forEach(b => { b.disabled = true; b.classList.add('is-disabled'); });

    if (product) product.stock_status = status;
    toggles.forEach(b => applyToggleState(b, status !== 'out_of_stock'));

    try {
      const { error } = await sb.from('admin_products_catalog')
        .update({ stock_status: status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      showToast(status === 'out_of_stock' ? '✅ تم تعليم المنتج كنفذت الكمية' : '✅ المنتج متوفر الآن');
    } catch (err) {
      if (product) product.stock_status = previous;
      toggles.forEach(b => applyToggleState(b, previous !== 'out_of_stock'));
      showToast('❌ فشل تحديث التوفر: ' + err.message, 'error');
    } finally {
      toggles.forEach(b => { b.disabled = false; b.classList.remove('is-disabled'); });
    }
  }

  /* ══════════════════════════════════════════════════════════
     ORDERING — inline edit, drag & drop, auto-renumber
  ══════════════════════════════════════════════════════════ */

  /* Moves product `id` to 1-based position `pos` WITHIN ITS OWN CATEGORY
     and returns that category's new ordered subset (other categories are
     untouched — ranking is per-category, not catalog-wide). */
  function moveToPosition(id, pos) {
    const item = ALL_PM_PRODUCTS.find(p => p.id === id);
    if (!item) return [];
    const group = sortedByOrder(ALL_PM_PRODUCTS.filter(p => categoryKey(p) === categoryKey(item)));
    const idx = group.findIndex(p => p.id === id);
    if (idx === -1) return group;
    const [moved] = group.splice(idx, 1);
    const clamped = Math.max(1, Math.min(pos, group.length + 1));
    group.splice(clamped - 1, 0, moved);
    return group;
  }

  /* Mutates display_order = 1..N in place over an ordered subset (normally
     one category's products) and returns just the rows that changed. */
  function diffOrder(orderedSubset) {
    const changed = [];
    orderedSubset.forEach((p, i) => {
      const newOrder = i + 1;
      if (p.display_order !== newOrder) changed.push({ id: p.id, display_order: newOrder });
      p.display_order = newOrder;
    });
    return changed;
  }

  async function saveOrderChanges(changed) {
    const results = await Promise.all(changed.map(c =>
      sb.from('admin_products_catalog')
        .update({ display_order: c.display_order })
        .eq('id', c.id)
    ));
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
  }

  /* Persists one category's ordered subset as display_order = 1..N,
     only writing rows whose order actually changed. Re-renders
     immediately (optimistic) and reloads from DB if the save fails. */
  async function persistOrder(orderedSubset, silent) {
    const changed = diffOrder(orderedSubset);
    renderTable();
    if (!changed.length) return;

    try {
      await saveOrderChanges(changed);
      if (!silent) showToast(`✅ تم تحديث الترتيب (${changed.length} منتج)`);
      /* Reordering only writes display_order to Supabase — unlike
         save/delete, nothing else was rebuilding the static homepage
         grid (index.html's #homeElectronicsGrid fallback) or the
         product pages/sitemap for a pure reorder. Electronics' homepage
         section ships that static fallback for SEO/no-JS visitors, so
         without this call a reorder saved fine to the DB but never
         appeared there until an unrelated edit happened to trigger a
         rebuild. Books has no such static fallback (fully client-
         rendered), which is why book reordering never showed this gap. */
      triggerPageRebuild('إعادة ترتيب المنتجات');
    } catch (err) {
      showToast('❌ فشل حفظ الترتيب: ' + err.message, 'error');
      await loadProducts(); /* resync truth from DB */
    }
  }

  /* Self-heal: renumbers EVERY category's display_order to a clean 1..N
     sequence in one pass (used on load when gaps/duplicates are found). */
  async function renumberAllCategories(products) {
    const changed = CATEGORY_ORDER.flatMap(cat =>
      diffOrder(sortedByOrder(products.filter(p => categoryKey(p) === cat))));
    renderTable();
    if (!changed.length) return;

    try {
      await saveOrderChanges(changed);
    } catch (err) {
      showToast('❌ فشل إصلاح الترتيب: ' + err.message, 'error');
      await loadProducts();
    }
  }

  /* Mobile reorder buttons — swap with the adjacent item within the same category */
  /* Manual reordering is meaningless while Best-Selling mode is on (the
     visible position reflects sales, not display_order) — the UI already
     hides/disables these controls for books in that mode, this is just a
     backstop against stale-DOM edge cases. */
  function manualReorderLocked(p) {
    return p && !isElec(p) && BOOK_SORT_MODE === 'best_selling';
  }

  async function moveProductStep(id, direction) {
    const current = ALL_PM_PRODUCTS.find(p => p.id === id);
    if (!current || current.display_order == null) return;
    if (manualReorderLocked(current)) return;
    const groupSize = ALL_PM_PRODUCTS.filter(p => categoryKey(p) === categoryKey(current)).length;
    const target = current.display_order + direction;
    if (target < 1 || target > groupSize) return;
    await persistOrder(moveToPosition(id, target));
  }

  async function commitOrderInput(inp) {
    const id  = inp.dataset.pmid;
    const pos = parseInt(inp.value, 10);
    const current = ALL_PM_PRODUCTS.find(p => p.id === id);
    if (manualReorderLocked(current)) {
      inp.value = current?.display_order ?? '';
      return;
    }
    if (!Number.isFinite(pos) || pos < 1) {
      inp.value = current?.display_order ?? '';
      return;
    }
    if (current && current.display_order === pos) return;
    await persistOrder(moveToPosition(id, pos));
  }

  /* Visible rows can mix categories (the "all" filter shows electronics
     then books). Reordering only ever applies within the dragged item's
     own category — other-category rows in `newVisibleIds` are ignored. */
  function applyDragReorder(newVisibleIds, draggedId) {
    const draggedItem = ALL_PM_PRODUCTS.find(p => p.id === draggedId);
    if (!draggedItem) return [];
    const cat = categoryKey(draggedItem);
    return newVisibleIds
      .map(id => ALL_PM_PRODUCTS.find(p => p.id === id))
      .filter(p => p && categoryKey(p) === cat);
  }

  function bindDragEvents(tbody) {
    if (!tbody) return;

    tbody.addEventListener('dragstart', e => {
      const tr = e.target.closest('tr[draggable="true"]');
      if (!tr) return;
      const item = ALL_PM_PRODUCTS.find(p => p.id === tr.dataset.pmid);
      if (manualReorderLocked(item)) return;
      DRAG_SRC_ID = tr.dataset.pmid;
      tr.classList.add('pm-row-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    tbody.addEventListener('dragend', () => {
      tbody.querySelectorAll('tr.pm-row-dragging').forEach(tr => tr.classList.remove('pm-row-dragging'));
    });

    tbody.addEventListener('dragover', e => {
      e.preventDefault();
      if (!DRAG_SRC_ID) return;
      const tr = e.target.closest('tr[draggable="true"]');
      const dragEl = tbody.querySelector(`tr[data-pmid="${DRAG_SRC_ID}"]`);
      if (!tr || !dragEl || tr === dragEl) return;
      const rect = tr.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      tr.parentNode.insertBefore(dragEl, before ? tr : tr.nextSibling);
    });

    tbody.addEventListener('drop', async e => {
      e.preventDefault();
      if (!DRAG_SRC_ID) return;
      const draggedId = DRAG_SRC_ID;
      const ids = Array.from(tbody.querySelectorAll('tr[data-pmid]')).map(tr => tr.dataset.pmid);
      DRAG_SRC_ID = null;
      await persistOrder(applyDragReorder(ids, draggedId));
    });
  }

  /* ══════════════════════════════════════════════════════════
     MODAL OPEN / CLOSE
  ══════════════════════════════════════════════════════════ */
  /* إظهار/إخفاء حقول الكتب (المؤلف/المترجم/سنة النشر) حسب الفئة المختارة */
  function toggleBookFields() {
    const isBooks = getValue('pmCat') === 'books';
    const el = document.getElementById('pmBookFields');
    if (el) el.style.display = isBooks ? '' : 'none';
    /* Subcategory only makes sense for electronics — books have no
       subcategory concept in this system. */
    const subEl = document.getElementById('pmSubcatWrap');
    if (subEl) subEl.style.display = isBooks ? 'none' : '';
  }

  function openModal(product) {
    EDIT_PRODUCT_ID = product?.id || null;
    EDIT_ORIGINAL_IMAGES = product ? collectImageUrls(product) : [];
    EDIT_ORIGINAL_SUBCATEGORY = product ? (product.subcategory || null) : null;
    EDIT_ORIGINAL_RESOLVED_SLUG = product ? resolveCategorySlug(product) : null;
    const isEdit = !!product;
    const isPending = isEdit && product.status === 'pending_review';

    document.getElementById('pmModalTitle').textContent =
      isPending ? '📝 مراجعة كتاب مُرسل من بائع' : isEdit ? '✏️ تعديل المنتج' : '➕ إضافة منتج جديد';
    document.getElementById('pmSaveBtn').textContent =
      isPending ? '🚀 نشر' : isEdit ? '💾 حفظ التعديلات' : '🚀 نشر المنتج';

    const banner = document.getElementById('pmPendingBanner');
    if (banner) {
      if (isPending) {
        const who = product.submitted_by_staff?.full_name || 'بائع';
        banner.style.display = '';
        banner.innerHTML = `⏳ <strong>بانتظار المراجعة</strong> — أرسله ${esc(who)} بتاريخ ${esc(fmtDate(product.submitted_at))}.
          ${product.submission_note ? `<br>📝 ملاحظة البائع: ${esc(product.submission_note)}` : ''}
          <br>أكمل باقي التفاصيل (السعر، التوفر، الرابط...) ثم اضغط "🚀 نشر".`;
      } else {
        banner.style.display = 'none';
      }
    }

    resetForm();
    populateSubcatSelect();

    if (product) {
      setValue('pmName',      product.product_name);
      setValue('pmNameEn',    product.product_name_ar);
      setValue('pmNameFr',    product.product_name_fr);
      setValue('pmBrand',     product.brand);
      setValue('pmCat',       product.category);
      setValue('pmSubcat',    resolveCategorySlug(product) || '');
      setValue('pmAuthor',     product.author);
      setValue('pmTranslator', product.translator);
      setValue('pmYear',       product.year);
      setValue('pmPrice',     product.price);
      setValue('pmOldPrice',  product.old_price);
      setStockToggle(product.stock_status);
      setValue('pmQty',       product.quantity);
      setValue('pmShortDesc', product.short_description);
      setValue('pmFullDesc',  product.full_description);
      setValue('pmMainUrl',   product.main_image);
      setValue('pmSlug',      product.slug);
      setValue('pmSeoTitle',  product.seo_title);
      setValue('pmSeoDesc',   product.seo_description);
      setValue('pmKeywords',  product.keywords);
      setValue('pmOrder',     product.display_order ?? '');

      if (product.main_image) showMainPreview(resolveThumbSrc(product));

      if (Array.isArray(product.gallery_images)) {
        product.gallery_images.forEach(url => addGalleryItem({ type: 'existing', url }));
      }

      const slugEl = document.getElementById('pmSlug');
      if (slugEl) slugEl.dataset.manualEdit = '1';
    }

    toggleBookFields();
    const delWrap = document.getElementById('pmDeleteWrap');
    if (delWrap) delWrap.style.display = isEdit ? '' : 'none';

    document.getElementById('pmOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('pmOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
    EDIT_PRODUCT_ID = null;
    resetForm();
  }

  function resetForm() {
    document.getElementById('pmForm')?.reset();
    setStockToggle('available');
    const slugEl = document.getElementById('pmSlug');
    if (slugEl) delete slugEl.dataset.manualEdit;

    if (PM_STAGED_MAIN?.previewUrl) URL.revokeObjectURL(PM_STAGED_MAIN.previewUrl);
    PM_STAGED_MAIN = null;

    const prev = document.getElementById('pmMainPrev');
    if (prev) prev.innerHTML = `
      <div class="pm-upload-lbl">📷 انقر لرفع الصورة الرئيسية</div>
      <div class="pm-upload-sub">PNG · JPG · WebP</div>
    `;
    document.getElementById('pmMainBox')?.classList.remove('loaded');
    clearGalleryItems();
  }

  /* ══════════════════════════════════════════════════════════
     STORAGE CLEANUP — helpers shared by save (image replace) and
     delete. An image is only ever removed from Storage after the
     database row that stops referencing it has already been
     committed successfully, and only after confirming no other
     product row still points at the same URL.
  ══════════════════════════════════════════════════════════ */
  const STORAGE_BUCKET = 'admin-product-images';

  /* Pull the object path (e.g. "products/123-abc.webp") out of a public
     Storage URL for admin-product-images. Returns null for anything
     that is NOT actually an object in that bucket — local repo paths
     (/Electronique/..., /books/...), /Logo.jpg, and null/empty values
     must never reach storage.remove(). */
  function storagePathFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    const rest = url.slice(idx + marker.length).split('?')[0].split('#')[0];
    if (!rest) return null;
    try { return decodeURIComponent(rest); } catch { return rest; }
  }

  function collectImageUrls(product) {
    const urls = [];
    if (product?.main_image) urls.push(product.main_image);
    if (Array.isArray(product?.gallery_images)) {
      product.gallery_images.forEach(u => { if (u) urls.push(u); });
    }
    return urls;
  }

  /* Straight DB check (not the up-to-60s-stale ALL_PM_PRODUCTS cache) —
     never delete a Storage object another product row still points at. */
  async function isImageStillReferenced(url) {
    const [main, gallery] = await Promise.all([
      sb.from('admin_products_catalog').select('id', { count: 'exact', head: true }).eq('main_image', url),
      sb.from('admin_products_catalog').select('id', { count: 'exact', head: true }).contains('gallery_images', [url]),
    ]);
    return (main.count || 0) > 0 || (gallery.count || 0) > 0;
  }

  /* Remove every URL in `urls` that is a real admin-product-images object
     and is no longer referenced by any product row. Never throws — a
     cleanup miss is reported back, not raised, so it can never affect
     the product record that already saved/deleted successfully. */
  async function cleanupOrphanedImages(urls) {
    const unique = [...new Set((urls || []).filter(Boolean))];
    const result = { removed: 0, failed: [] };
    for (const url of unique) {
      const objectPath = storagePathFromUrl(url);
      if (!objectPath) continue; /* not a Storage object — leave it alone */
      try {
        if (await isImageStillReferenced(url)) continue; /* shared — keep it */
        const { error } = await sb.storage.from(STORAGE_BUCKET).remove([objectPath]);
        if (error) { result.failed.push(url); continue; }
        result.removed++;
      } catch (_) {
        result.failed.push(url);
      }
    }
    return result;
  }

  /* ══════════════════════════════════════════════════════════
     IMAGE OPTIMIZATION — resize + re-encode before upload. Uploads
     previously went to Storage byte-for-byte, so a multi-MB phone
     photo cost that much on every future page view even displayed
     as a small thumbnail. Canvas-based, no new dependency.
  ══════════════════════════════════════════════════════════ */
  const IMG_MAX_EDGE = 1600;
  const IMG_WEBP_QUALITY = 0.82;

  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('الملف ليس صورة صالحة')); };
      img.src = url;
    });
  }

  /* Resizes to at most IMG_MAX_EDGE on the long edge (never upscales) and
     re-encodes as WebP. Unlike a Storage upload, a file written locally as
     "main.webp" that secretly isn't WebP would silently break the
     storefront — so this always forces a real re-encode and throws
     instead of ever passing the original bytes through under a .webp
     name. */
  async function convertToWebpForLocal(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      throw new Error('الملف المختار ليس صورة');
    }

    const { img, url } = await loadImageElement(file);
    try {
      const scale = Math.min(1, IMG_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', IMG_WEBP_QUALITY));
      if (!blob) throw new Error('فشل تحويل الصورة إلى WebP');
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* ══════════════════════════════════════════════════════════
     IMAGE UPLOAD — staged locally only. Nothing here touches
     Supabase Storage; the actual write to the local repo happens in
     saveProduct() via window.LocalFS, once the product's final slug
     is known (see admin/local-fs.js).
  ══════════════════════════════════════════════════════════ */
  async function uploadMainImage(file) {
    const prev = document.getElementById('pmMainPrev');
    if (prev) prev.innerHTML = `<div class="pm-upload-lbl">⏳ جاري التجهيز...</div>`;

    try {
      const blob = await convertToWebpForLocal(file);
      if (PM_STAGED_MAIN?.previewUrl) URL.revokeObjectURL(PM_STAGED_MAIN.previewUrl);
      const previewUrl = URL.createObjectURL(blob);
      PM_STAGED_MAIN = { blob, previewUrl };
      setValue('pmMainUrl', ''); /* the real local path is only known after saveProduct() writes it */

      showMainPreview(previewUrl);
      document.getElementById('pmMainBox')?.classList.add('loaded');
      showToast('✅ تم تجهيز الصورة الرئيسية — ستُحفظ محلياً عند حفظ المنتج');
    } catch (err) {
      if (prev) prev.innerHTML = `<div class="pm-upload-lbl" style="color:#dc2626;">❌ فشل تجهيز الصورة</div>`;
      showToast('❌ فشل تجهيز الصورة: ' + err.message, 'error');
    }
  }

  function showMainPreview(url) {
    const prev = document.getElementById('pmMainPrev');
    if (prev) {
      prev.innerHTML = `
        <img src="${esc(url)}" class="pm-main-preview" alt="">
        <div class="pm-upload-lbl" style="color:#059669;">✅ صورة محملة</div>
      `;
    }
  }

  async function uploadGalleryImages(files) {
    for (const file of files) {
      try {
        const blob = await convertToWebpForLocal(file);
        addGalleryItem({ type: 'staged', blob });
      } catch (err) {
        showToast('❌ فشل تجهيز صورة: ' + err.message, 'error');
      }
    }
    showToast('✅ تم تجهيز الصور — ستُحفظ محلياً عند حفظ المنتج');
  }

  /* item: { type:'existing', url } for images already saved on a product
     being edited, or { type:'staged', blob } for a freshly-picked file
     not yet written to disk. Both render the same way; only 'staged'
     entries get an actual local write in saveProduct(). */
  function addGalleryItem(item) {
    const container = document.getElementById('pmGalPreviews');
    if (!container) return null;

    const id = 'g' + (++PM_GALLERY_SEQ);
    const previewUrl = item.type === 'existing' ? item.url : URL.createObjectURL(item.blob);

    const wrap = document.createElement('div');
    wrap.className = 'pm-gal-wrap';
    wrap.dataset.galId = id;
    wrap.innerHTML = `
      <img src="${esc(previewUrl)}" class="pm-gal-img" alt="">
      <button type="button" class="pm-gal-rm" title="إزالة">×</button>
    `;
    wrap.querySelector('.pm-gal-rm').addEventListener('click', () => removeGalleryItem(id));
    container.appendChild(wrap);

    const entry = {
      id,
      type: item.type,
      url: item.type === 'existing' ? item.url : null,
      blob: item.type === 'staged' ? item.blob : null,
      previewUrl: item.type === 'staged' ? previewUrl : null,
      el: wrap,
    };
    PM_GALLERY_ITEMS.push(entry);
    return entry;
  }

  function removeGalleryItem(id) {
    const idx = PM_GALLERY_ITEMS.findIndex(it => it.id === id);
    if (idx === -1) return;
    const [entry] = PM_GALLERY_ITEMS.splice(idx, 1);
    if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    entry.el?.remove();
  }

  function clearGalleryItems() {
    PM_GALLERY_ITEMS.forEach(it => { if (it.previewUrl) URL.revokeObjectURL(it.previewUrl); });
    PM_GALLERY_ITEMS = [];
    const container = document.getElementById('pmGalPreviews');
    if (container) container.innerHTML = '';
  }

  /* ── Parses a DB image value back into { category, subcategory, slug,
     filename } if — and only if — it's a value our local-write flow
     itself produced (never a Supabase Storage URL or an admin-pasted
     external URL). Used only for best-effort local orphan cleanup. ── */
  function parseLocalImagePath(url) {
    if (!url || typeof url !== 'string' || /^https?:\/\//.test(url)) return null;
    let m = url.match(/^\/books\/([^\/]+)\/(main|image-\d+)\.webp$/);
    if (m) return { category: 'books', subcategory: null, slug: m[1], filename: m[2] + '.webp' };
    m = url.match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\/main\.webp$/);
    if (m) return { category: 'books', subcategory: null, slug: m[1], filename: 'main.webp' };
    m = url.match(/^\/Electronique\/([^\/]+)\/([^\/]+)\/(main|image-\d+)\.webp$/);
    if (m) return { category: 'electronics', subcategory: m[1], slug: m[2], filename: m[3] + '.webp' };
    return null;
  }

  /* ── Writes every staged (not-yet-on-disk) main/gallery image for the
     current form via window.LocalFS, returning the DB-ready values.
     Existing (untouched) images pass through unchanged. Throws — and
     saveProduct() lets that abort the whole save — rather than ever
     falling back to a Supabase Storage upload. ── */
  async function resolveImagesForSave(category, subcategory, slug) {
    const hasStaged = !!PM_STAGED_MAIN || PM_GALLERY_ITEMS.some(it => it.type === 'staged');
    if (hasStaged) {
      if (!slug) throw new Error('أدخل Slug المنتج قبل حفظ صور محلية');
      const status = window.LocalFS ? await window.LocalFS.restorePermission() : 'offline';
      renderFolderBadge(status);
      if (status !== 'granted') {
        throw new Error('تعذّر الاتصال بخادم الصور المحلي — شغّله بـ npm run local-image-server ثم أعد المحاولة');
      }
    }

    let mainImg = getValue('pmMainUrl') || null;
    if (PM_STAGED_MAIN) {
      const written = await window.LocalFS.writeProductImage({
        category, subcategory, slug, filename: 'main.webp', blob: PM_STAGED_MAIN.blob,
      });
      mainImg = category === 'books' ? `${slug}/main.webp` : '/' + written;
    }

    const existingNums = PM_GALLERY_ITEMS
      .filter(it => it.type === 'existing')
      .map(it => { const m = /image-(\d+)\.webp$/.exec(it.url || ''); return m ? parseInt(m[1], 10) : 0; });
    let nextNum = existingNums.length ? Math.max(...existingNums) + 1 : 1;

    const galleryImgs = [];
    for (const item of PM_GALLERY_ITEMS) {
      if (item.type === 'existing') { galleryImgs.push(item.url); continue; }
      const filename = `image-${nextNum++}.webp`;
      const written = await window.LocalFS.writeProductImage({ category, subcategory, slug, filename, blob: item.blob });
      galleryImgs.push('/' + written);
    }

    return { mainImg, galleryImgs };
  }

  /* ══════════════════════════════════════════════════════════
     SAVE PRODUCT
  ══════════════════════════════════════════════════════════ */
  async function saveProduct() {
    const saveBtn = document.getElementById('pmSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ جاري الحفظ...'; }

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error('يجب تسجيل الدخول أولاً');

      const category = getValue('pmCat') || 'electronics';
      const subcatSelected = getValue('pmSubcat') || null;
      /* Editing a legacy product whose dropdown was pre-selected to its
         resolved bucket (see openModal): if the admin saves without
         actually changing that selection, keep the original raw DB
         value instead of overwriting it with the resolved slug — see
         EDIT_ORIGINAL_SUBCATEGORY's comment for why (image-folder path
         coupling). A deliberate change to a different subcategory still
         saves as the new clean slug. */
      const keepOriginalSubcategory = EDIT_PRODUCT_ID &&
        EDIT_ORIGINAL_SUBCATEGORY &&
        subcatSelected === EDIT_ORIGINAL_RESOLVED_SLUG &&
        EDIT_ORIGINAL_SUBCATEGORY !== subcatSelected;
      const subcategory = keepOriginalSubcategory ? EDIT_ORIGINAL_SUBCATEGORY : subcatSelected;
      const slug        = getValue('pmSlug');

      /* ── Validate BEFORE writing anything to disk ──────────────
         resolveImagesForSave() below physically writes staged images
         to the repo via the local image helper. If that ran first and
         a check here failed afterward, the images would already be on
         disk with no matching DB row — an orphaned folder the
         generator can never turn into a page (it only reads from
         Supabase). Confirmed happening in practice on 2026-08-20: two
         abandoned slug-rename attempts (adding "-algeria", then "-nc")
         left orphaned image folders under Electronique/airpods/ with
         no corresponding catalog row. Running every check that can be
         done without images first closes that gap. ── */
      const productNameCheck = getValue('pmName');
      const priceCheck       = parseInt(getValue('pmPrice')) || 0;
      const fullDescCheck    = getValue('pmFullDesc');
      if (!productNameCheck) throw new Error('اسم المنتج مطلوب');
      if (!slug)             throw new Error('Slug المنتج مطلوب');
      if (!priceCheck)       throw new Error('سعر المنتج مطلوب');
      if (!EDIT_PRODUCT_ID && (!fullDescCheck || fullDescCheck.trim().length < 20)) {
        throw new Error('الوصف الكامل مطلوب لنشر منتج جديد (20 حرفاً على الأقل) — لتفادي صفحة منتج فارغة');
      }
      let dupCheckEarly = sb.from('admin_products_catalog').select('id').eq('slug', slug).limit(1);
      if (EDIT_PRODUCT_ID) dupCheckEarly = dupCheckEarly.neq('id', EDIT_PRODUCT_ID);
      const { data: dupRowsEarly } = await dupCheckEarly;
      if (dupRowsEarly && dupRowsEarly.length) {
        throw new Error('هذا الرابط (slug) مستخدم من قبل لمنتج آخر — الرجاء اختيار رابط مختلف');
      }

      /* Writes any locally-staged main/gallery images to disk via
         window.LocalFS — never to Supabase Storage. Existing images
         (populated when editing a product) pass through unchanged.
         Only reached once every check above has passed. */
      const { mainImg, galleryImgs } = await resolveImagesForSave(category, subcategory, slug);
      setValue('pmMainUrl', mainImg || '');

      const oldPrice = parseInt(getValue('pmOldPrice')) || null;

      const payload = {
        product_name:      getValue('pmName'),
        product_name_ar:   getValue('pmNameEn')    || null,
        category,
        subcategory,
        price:             parseInt(getValue('pmPrice')) || 0,
        old_price:         oldPrice,
        discount_enabled:  !!oldPrice,
        stock_status:      getValue('pmStock')      || 'available',
        quantity:          parseInt(getValue('pmQty')) || 0,
        short_description: getValue('pmShortDesc')  || null,
        full_description:  getValue('pmFullDesc')   || null,
        main_image:        mainImg,
        gallery_images:    galleryImgs,
        slug,
        seo_title:         getValue('pmSeoTitle')   || null,
        seo_description:   getValue('pmSeoDesc')    || null,
        keywords:          getValue('pmKeywords')   || null,
        is_active:         true,
        status:            'published',
        updated_at:        new Date().toISOString(),
      };

      /* display_order: only send if column is confirmed to exist in DB */
      if (DISPLAY_ORDER_SUPPORTED !== false) {
        const orderRaw = getValue('pmOrder').trim();
        payload.display_order = orderRaw !== '' ? (parseInt(orderRaw) || null) : null;
        console.log('[PM] display_order value to save:', payload.display_order);
      } else {
        console.warn('[PM] display_order column not supported — not included in payload. Run admin/supabase-admin-products-rls-fix.sql first.');
      }

      /* New optional columns — only include if filled (safe before SQL migration) */
      const nameFr = getValue('pmNameFr');
      if (nameFr) payload.product_name_fr = nameFr;
      const brand = getValue('pmBrand');
      if (brand) payload.brand = brand;

      /* Book-specific fields — only meaningful for category=books */
      if (payload.category === 'books') {
        payload.author     = getValue('pmAuthor')     || null;
        payload.translator = getValue('pmTranslator') || null;
        const yearRaw = getValue('pmYear');
        payload.year = yearRaw !== '' ? (parseInt(yearRaw) || null) : null;
      }

      /* product_name/slug/price/full_description and the duplicate-slug
         pre-check already ran above, before any image was written to
         disk. The database's own UNIQUE constraint on `slug` (see
         supabase/migrations) remains the real guard against a race
         between two saves — the catch block below turns that
         rejection into the same friendly message. */

      console.log('[PM] saveProduct —', EDIT_PRODUCT_ID ? 'UPDATE id=' + EDIT_PRODUCT_ID : 'INSERT new', '| slug:', payload.slug, '| is_active:', payload.is_active);

      if (EDIT_PRODUCT_ID) {
        const { error } = await sb.from('admin_products_catalog').update(payload).eq('id', EDIT_PRODUCT_ID);
        if (error) {
          console.error('[PM] UPDATE failed:', error);
          throw error;
        }
        console.log('[PM] UPDATE succeeded for id:', EDIT_PRODUCT_ID);
        showToast('✅ تم تحديث المنتج بنجاح');
        triggerPageRebuild('تعديل منتج: ' + payload.product_name);

        /* Only now — after the row that stopped referencing them has
           committed — clean up any old images the edit replaced/removed. */
        const stillUsed = new Set(collectImageUrls(payload));
        const droppedImages = EDIT_ORIGINAL_IMAGES.filter(u => !stillUsed.has(u));
        if (droppedImages.length) {
          for (const u of droppedImages) {
            const local = parseLocalImagePath(u);
            if (local && window.LocalFS) await window.LocalFS.deleteProductImage(local);
          }
          const { failed } = await cleanupOrphanedImages(droppedImages);
          if (failed.length) {
            console.warn('[PM] could not remove old image(s) from Storage:', failed);
            showToast(`⚠️ تم الحفظ، لكن تعذّر حذف ${failed.length} صورة قديمة من التخزين — يمكن إعادة المحاولة لاحقاً`, 'error');
          }
        }
      } else {
        payload.created_at = new Date().toISOString();
        const { data: insertedData, error } = await sb.from('admin_products_catalog').insert(payload).select('id, slug, catalog_id');
        if (error) {
          console.error('[PM] INSERT failed:', error);
          if (error.message?.includes('column')) {
            console.error('[PM] Column error — run supabase-admin-products-rls-fix.sql to add missing columns (brand, product_name_fr)');
          }
          throw error;
        }
        if (!insertedData || insertedData.length === 0) {
          throw new Error('لم يُحفظ المنتج فعلياً — الإدراج لم يُرجع أي صف (تحقق من صلاحيات RLS)');
        }
        console.log('[PM] INSERT succeeded:', insertedData);
        showToast('✅ تم إضافة المنتج ونشره في المتجر');
        triggerPageRebuild('إضافة منتج: ' + payload.product_name);
      }

      closeModal();
      await loadProducts();

    } catch (err) {
      /* Postgres unique_violation (23505) — the real guard against a slug
         race that the pre-check above can't fully close on its own. */
      const isDupSlug = err?.code === '23505' || /duplicate key|unique constraint/i.test(err?.message || '');
      const msg = isDupSlug
        ? 'هذا الرابط (slug) مستخدم من قبل لمنتج آخر — الرجاء اختيار رابط مختلف'
        : (err.message || 'خطأ غير معروف');
      showToast('❌ فشل الحفظ: ' + msg, 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = EDIT_PRODUCT_ID ? '💾 حفظ التعديلات' : '🚀 نشر المنتج';
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     DELETE — only reachable from inside the edit modal, after confirm()
  ══════════════════════════════════════════════════════════ */
  async function deleteProduct(id, btn) {
    if (btn) btn.disabled = true;
    const deletedProduct = ALL_PM_PRODUCTS.find(p => p.id === id);
    const deletedName = deletedProduct?.product_name || id;
    try {
      const { error } = await sb.from('admin_products_catalog').delete().eq('id', id);
      if (error) throw error;
      showToast('✅ تم حذف المنتج');
      triggerPageRebuild('حذف منتج: ' + deletedName);

      /* Only now — after the row is actually gone — clean up its images. */
      if (deletedProduct) {
        const urls = collectImageUrls(deletedProduct);
        for (const u of urls) {
          const local = parseLocalImagePath(u);
          if (local && window.LocalFS) await window.LocalFS.deleteProductImage(local);
        }
        const { failed } = await cleanupOrphanedImages(urls);
        if (failed.length) {
          console.warn('[PM] could not remove image(s) from Storage after delete:', failed);
          showToast(`⚠️ تم حذف المنتج، لكن تعذّر حذف ${failed.length} صورة من التخزين`, 'error');
        }
      }

      await loadProducts();
      return true;
    } catch (err) {
      showToast('❌ فشل الحذف: ' + err.message, 'error');
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ══════════════════════════════════════════════════════════
     CATEGORY MANAGEMENT — CRUD on the `categories` table
     (admin/setup-categories.sql). This is the ONLY place electronics
     subcategories are created/edited/deactivated — everywhere else
     (form dropdown, admin filter chips, public filter/cards/search)
     just reads ALL_CATEGORIES / the live table.
  ══════════════════════════════════════════════════════════ */
  function categoryRowHtml(c) {
    const count = ALL_PM_PRODUCTS.filter(p => isElec(p) && resolveCategorySlug(p) === c.slug).length;
    return `<tr data-catid="${esc(c.id)}">
        <td><input type="text" data-cata="icon" data-catid="${esc(c.id)}" value="${esc(c.icon || '')}" style="width:44px;text-align:center;" maxlength="4"></td>
        <td><input type="text" data-cata="name" data-catid="${esc(c.id)}" value="${esc(c.name)}" style="width:100%;min-width:160px;"></td>
        <td><span style="font-size:12px;color:#94a3b8;direction:ltr;">${esc(c.slug)}</span></td>
        <td style="text-align:center;">${count}</td>
        <td>
          <button type="button" class="pm-toggle ${c.is_active ? 'is-on' : ''}" data-cata="toggle" data-catid="${esc(c.id)}" role="switch" aria-checked="${!!c.is_active}">
            <span class="pm-toggle-track"><span class="pm-toggle-thumb"></span></span>
          </button>
        </td>
        <td><input type="number" data-cata="sort_order" data-catid="${esc(c.id)}" value="${c.sort_order ?? ''}" style="width:64px;"></td>
        <td>
          <button type="button" class="btn-pm-edit" data-cata="delete" data-catid="${esc(c.id)}" title="${count ? 'لا يمكن الحذف — يوجد ' + count + ' منتج مرتبط' : 'حذف'}" ${count ? 'disabled style="opacity:.4;cursor:not-allowed;"' : ''}>🗑</button>
        </td>
      </tr>`;
  }

  function renderCategoriesTable() {
    const tbody = document.getElementById('pmCategoriesTbody');
    if (!tbody) return;
    if (!ALL_CATEGORIES.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="pm-empty">لا توجد تصنيفات بعد — أضف واحداً أعلاه.</td></tr>`;
      return;
    }
    tbody.innerHTML = ALL_CATEGORIES.map(categoryRowHtml).join('');
  }

  async function addCategory() {
    const icon  = getValue('pmCatNewIcon') || '📦';
    const name  = getValue('pmCatNewName');
    const group = getValue('pmCatNewGroup') || null;
    if (!name) { showToast('❌ اسم التصنيف مطلوب', 'error'); return; }
    const slug = slugify(name);
    if (!slug) { showToast('❌ تعذر توليد رابط (slug) من هذا الاسم', 'error'); return; }
    const nextOrder = (Math.max(0, ...ALL_CATEGORIES.map(c => c.sort_order || 0)) || 0) + 10;

    try {
      const { error } = await sb.from('categories').insert({
        name, slug, icon, description: group, sort_order: nextOrder, is_active: true,
      });
      if (error) throw error;
      showToast('✅ تم إضافة التصنيف');
      setValue('pmCatNewIcon', ''); setValue('pmCatNewName', ''); setValue('pmCatNewGroup', '');
      await loadCategories();
      renderCategoriesTable();
      populateSubcatSelect();
    } catch (err) {
      const isDup = err?.code === '23505' || /duplicate key|unique constraint/i.test(err?.message || '');
      showToast('❌ فشل الإضافة: ' + (isDup ? 'هذا الاسم موجود بالفعل' : err.message), 'error');
    }
  }

  async function commitCategoryFieldEdit(inp) {
    const id    = inp.dataset.catid;
    const field = inp.dataset.cata;
    const cat   = ALL_CATEGORIES.find(c => c.id === id);
    if (!cat) return;

    let value = inp.value.trim();
    if (field === 'sort_order') {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) { inp.value = cat.sort_order ?? ''; return; }
      value = n;
    }
    if (field === 'name' && !value) { inp.value = cat.name; return; }
    if (String(cat[field] ?? '') === String(value)) return;

    try {
      const { error } = await sb.from('categories').update({ [field]: value }).eq('id', id);
      if (error) throw error;
      cat[field] = value;
      showToast('✅ تم الحفظ');
      if (field === 'name' || field === 'icon') populateSubcatSelect();
    } catch (err) {
      inp.value = cat[field] ?? '';
      showToast('❌ فشل الحفظ: ' + err.message, 'error');
    }
  }

  async function toggleCategoryActive(id, currentlyOn) {
    const cat = ALL_CATEGORIES.find(c => c.id === id);
    if (!cat) return;
    const next = !currentlyOn;
    try {
      const { error } = await sb.from('categories').update({ is_active: next }).eq('id', id);
      if (error) throw error;
      cat.is_active = next;
      renderCategoriesTable();
      populateSubcatSelect();
      showToast(next ? '✅ تم تفعيل التصنيف' : '✅ تم إلغاء تفعيل التصنيف');
    } catch (err) {
      showToast('❌ فشل التحديث: ' + err.message, 'error');
    }
  }

  async function deleteCategory(id) {
    const cat = ALL_CATEGORIES.find(c => c.id === id);
    if (!cat) return;
    const count = ALL_PM_PRODUCTS.filter(p => isElec(p) && resolveCategorySlug(p) === cat.slug).length;
    if (count) { showToast(`❌ لا يمكن حذف "${cat.name}" — ${count} منتج مرتبط به`, 'error'); return; }
    if (!confirm(`حذف التصنيف "${cat.name}" نهائياً؟`)) return;

    try {
      const { error } = await sb.from('categories').delete().eq('id', id);
      if (error) throw error;
      showToast('✅ تم حذف التصنيف');
      await loadCategories();
      renderCategoriesTable();
      populateSubcatSelect();
    } catch (err) {
      showToast('❌ فشل الحذف: ' + err.message, 'error');
    }
  }

  /* ══════════════════════════════════════════════════════════
     SITEMAP GENERATOR
  ══════════════════════════════════════════════════════════ */
  async function generateSitemap() {
    const output    = document.getElementById('pmSitemapOutput');
    const copyBtn   = document.getElementById('pmSitemapCopyBtn');
    const statusEl  = document.getElementById('pmSitemapStatus');
    const genBtn    = document.getElementById('pmSitemapGenBtn');

    if (output)  output.value = '';
    if (copyBtn) copyBtn.style.display = 'none';
    if (statusEl) statusEl.textContent = '⏳ جاري جلب المنتجات من قاعدة البيانات...';
    if (genBtn)  { genBtn.disabled = true; genBtn.textContent = '⏳ جاري التوليد...'; }

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        if (statusEl) statusEl.textContent = '❌ يجب تسجيل الدخول أولاً';
        return;
      }

      const { data, error } = await sb
        .from('admin_products_catalog')
        .select('slug, updated_at')
        .eq('is_active', true)
        .not('slug', 'is', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const today = new Date().toISOString().slice(0, 10);

      const STATIC = [
        { loc: 'https://derradjshop.com/',                                                          lastmod: today,        freq: 'weekly',  pri: '1.0' },
        { loc: 'https://derradjshop.com/books/',                                                    lastmod: today,        freq: 'weekly',  pri: '0.9' },
        { loc: 'https://derradjshop.com/Electronique/',                                             lastmod: today,        freq: 'weekly',  pri: '0.9' },
        { loc: 'https://derradjshop.com/product/adjustable-laptop-stand/',                          lastmod: '2026-06-02', freq: 'monthly', pri: '0.8' },
        { loc: 'https://derradjshop.com/Electronique/smart-watch/modio-st11-smart-watch/',          lastmod: '2026-06-02', freq: 'monthly', pri: '0.8' },
        { loc: 'https://derradjshop.com/Electronique/earbuds/anker-soundcore-r50i-vg/',             lastmod: '2026-06-02', freq: 'monthly', pri: '0.8' },
        { loc: 'https://derradjshop.com/Electronique/earbuds/airpods-4-type-c-vrac/',               lastmod: '2026-06-02', freq: 'monthly', pri: '0.8' },
        { loc: 'https://derradjshop.com/Electronique/power-bank/hoco-j132a-20000mah-power-bank/',   lastmod: '2026-06-02', freq: 'monthly', pri: '0.8' },
        { loc: 'https://derradjshop.com/about',                                                     lastmod: '2026-06-02', freq: 'monthly', pri: '0.5' },
        { loc: 'https://derradjshop.com/contact',                                                   lastmod: '2026-06-02', freq: 'monthly', pri: '0.5' },
        { loc: 'https://derradjshop.com/faq',                                                       lastmod: '2026-06-02', freq: 'monthly', pri: '0.5' },
        { loc: 'https://derradjshop.com/delivery',                                                  lastmod: '2026-06-02', freq: 'monthly', pri: '0.6' },
        { loc: 'https://derradjshop.com/return-policy',                                             lastmod: '2026-06-02', freq: 'monthly', pri: '0.5' },
      ];

      function urlBlock(u) {
        return `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.freq}</changefreq>\n    <priority>${u.pri}</priority>\n  </url>`;
      }

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      xml += '\n  <!-- ══ Static Pages ══ -->\n';
      xml += STATIC.map(urlBlock).join('\n') + '\n';

      const products = (data || []).filter(p => p.slug);
      if (products.length) {
        xml += '\n  <!-- ══ Dynamic Product Pages ══ -->\n';
        xml += products.map(p => urlBlock({
          loc:     `https://derradjshop.com/product/${encodeURIComponent(p.slug)}/`,
          lastmod: p.updated_at ? p.updated_at.slice(0, 10) : today,
          freq:    'weekly',
          pri:     '0.8',
        })).join('\n') + '\n';
      }

      xml += '\n</urlset>';

      if (output) output.value = xml;
      if (copyBtn) copyBtn.style.display = '';
      if (statusEl) statusEl.textContent = `✅ تم التوليد — ${STATIC.length} صفحة ثابتة + ${products.length} منتج ديناميكي`;

    } catch (err) {
      if (statusEl) statusEl.textContent = '❌ خطأ: ' + err.message;
      showToast('❌ فشل توليد Sitemap: ' + err.message, 'error');
    } finally {
      if (genBtn) { genBtn.disabled = false; genBtn.textContent = '🔄 توليد Sitemap'; }
    }
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  async function init() {
    injectStyles();
    injectHTML();
    bindEvents();
    initLocalFsBadge();
    loadBookSortMode();
    /* Public read of active rows needs no auth session (see
       admin/setup-categories.sql RLS) — safe to fetch immediately,
       before admin login/session resolves, unlike loadProducts(). */
    loadCategories().then(() => { populateSubcatSelect(); renderTable(); });
    /* Only load the full catalog (select *, incl. descriptions/gallery
       arrays for every row) when the Products tab is actually visible —
       it isn't the default tab, so most admin sessions never need this. */
    if (document.getElementById('tab-products')?.classList.contains('active')) {
      loadProducts();
      /* Retry after a delay in case admin boot/auth wasn't ready yet. */
      setTimeout(() => {
        if (document.getElementById('tab-products')?.classList.contains('active')) loadProductsIfStale();
      }, 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
  } else {
    setTimeout(init, 400);
  }

})();
