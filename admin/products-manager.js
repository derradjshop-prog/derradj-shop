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

  /* ── Categories ── */
  const CATEGORIES = [
    { value: 'books',        label: '📚 كتب' },
    { value: 'electronics',  label: '💻 إلكترونيات' },
    { value: 'earbuds',      label: '🎧 سماعات' },
    { value: 'laptop',       label: '💻 إكسسوارات لابتوب' },
    { value: 'smart_watch',  label: '⌚ ساعات ذكية' },
    { value: 'power_bank',   label: '🔋 بطاريات محمولة' },
    { value: 'other',        label: '📦 أخرى' },
  ];

  /* ── State ── */
  let ALL_PM_PRODUCTS = [];
  let EDIT_PRODUCT_ID = null;
  /* null = unknown yet, true = column exists in DB, false = column missing */
  let DISPLAY_ORDER_SUPPORTED = null;
  let PROD_FILTER = 'all';        /* 'all' | 'books' | 'electronics' */
  let PROD_SEARCH_QUERY = '';
  let DRAG_SRC_ID = null;

  /* إلكتروني = كل ما ليس كتاباً */
  function isElec(p) { return p.category !== 'books'; }

  /* ── Helpers ── */
  function esc(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  function fmtPrice(n) {
    return Number(n || 0).toLocaleString('fr-DZ') + ' دج';
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
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn-pm-add" id="pmAddBtn">＋ إضافة منتج جديد</button>
            <button class="btn-pm-add" id="pmSitemapBtn" style="background:#1d4ed8;">🗺 توليد Sitemap</button>
          </div>
        </div>
        <div id="pmOrderWarning" style="display:none;background:#fef3c7;border:1.5px solid #fcd34d;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:13px;color:#78350f;line-height:1.6;">
          ⚠️ <strong>ميزة ترتيب الظهور غير مفعّلة</strong> — عمود <code>display_order</code> غير موجود في قاعدة البيانات.<br>
          شغّل ملف <strong>admin/supabase-admin-products-rls-fix.sql</strong> في <a href="https://supabase.com/dashboard/project/jbmcbjzcedqpvnhbmrhk/sql/new" target="_blank" style="color:#92400e;">Supabase SQL Editor</a> لتفعيل هذه الميزة.
        </div>

        <div class="prod-subfilter-bar" id="prodSubfilterBar">
          <button class="prod-sf-btn active" data-pfilter="all">🗂 الكل <span class="prod-sf-badge" id="psb-all">—</span></button>
          <button class="prod-sf-btn" data-pfilter="books">📚 الكتب <span class="prod-sf-badge" id="psb-books">—</span></button>
          <button class="prod-sf-btn" data-pfilter="electronics">💻 إلكترونيات <span class="prod-sf-badge" id="psb-electronics">—</span></button>
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
        <div class="pm-fld">
          <label>الفئة الفرعية</label>
          <input type="text" id="pmSubcat" placeholder="مثال: TWS Earbuds">
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
          <label>وصف كامل (لصفحة المنتج)</label>
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
          <input type="url" id="pmMainUrl" placeholder="https://... (اختياري إذا رفعت الصورة)">
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

    /* Main image area click */
    document.getElementById('pmMainBox')?.addEventListener('click', e => {
      if (e.target.id !== 'pmMainFile') document.getElementById('pmMainFile')?.click();
    });
    document.getElementById('pmMainFile')?.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) uploadMainImage(f);
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
      document.querySelectorAll('.prod-sf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
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

    /* Reload when tab is clicked */
    document.querySelectorAll('.tab-btn[data-tab="products"]').forEach(b => {
      b.addEventListener('click', () => setTimeout(loadProducts, 200));
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
        .select('*')
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }));

      /* ── If display_order column is missing, fall back ─────────── */
      if (queryError && (queryError.code === '42703' || (queryError.message || '').includes('display_order'))) {
        console.warn('[PM] display_order column not found in DB — falling back. Run admin/supabase-admin-products-rls-fix.sql to add it.');
        DISPLAY_ORDER_SUPPORTED = false;

        ({ data, error: queryError } = await sb
          .from('admin_products_catalog')
          .select('*')
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

  /* ── Full list grouped by category (electronics first, then books),
     each group internally sorted by its own display_order. Used for
     rendering so categories never interleave. ── */
  function sortedGrouped(products) {
    return CATEGORY_ORDER.flatMap(cat =>
      sortedByOrder(products.filter(p => categoryKey(p) === cat)));
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
      if (q && !String(p.product_name || '').toLowerCase().includes(q) &&
               !String(p.category || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function updateSubfilterBadges() {
    const elecCount  = ALL_PM_PRODUCTS.filter(isElec).length;
    const booksCount = ALL_PM_PRODUCTS.length - elecCount;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('psb-all', ALL_PM_PRODUCTS.length);
    set('psb-books', booksCount);
    set('psb-electronics', elecCount);
    set('tab-badge-products', ALL_PM_PRODUCTS.length);
    set('pmProductCount', ALL_PM_PRODUCTS.length);
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

  function rowHtml(p) {
    const imgHtml = p.main_image
      ? `<img src="${esc(p.main_image)}" class="pm-thumb" alt="" onerror="this.outerHTML='<div class=pm-thumb-ph>📦</div>'">`
      : `<div class="pm-thumb-ph">📦</div>`;

    return `<tr draggable="true" data-pmid="${esc(p.id)}">
        <td>${imgHtml}</td>
        <td>
          <strong style="font-size:13px;display:block;">${esc(p.product_name)}</strong>
          ${p.product_name_ar ? `<span style="font-size:12px;color:#64748b;">${esc(p.product_name_ar)}</span><br>` : ''}
          ${p.slug ? `<span style="font-size:11px;color:#94a3b8;direction:ltr;">/product/${esc(p.slug)}/</span>` : ''}
        </td>
        <td style="font-size:13px;font-weight:600;">${esc(catLabel(p.category))}</td>
        <td>
          <strong style="color:#1d4ed8;direction:ltr;display:block;">${fmtPrice(p.price)}</strong>
          ${p.old_price ? `<span style="font-size:12px;text-decoration:line-through;color:#94a3b8;direction:ltr;">${fmtPrice(p.old_price)}</span>` : ''}
        </td>
        <td>
          <div class="pm-avail-cell">${availToggleHtml(p.id, p.stock_status)}</div>
        </td>
        <td style="text-align:center;white-space:nowrap;">
          <span class="pm-drag-handle" title="اسحب لإعادة الترتيب">⠿</span>
          <input type="number" class="pm-order-input" min="1" step="1"
                 value="${p.display_order ?? ''}" data-pma="order" data-pmid="${esc(p.id)}">
        </td>
        <td>
          <button class="btn-pm-edit" data-pma="edit" data-pmid="${esc(p.id)}">✏️ تعديل</button>
        </td>
      </tr>`;
  }

  /* ── Mobile card: image, name, availability switch, reorder controls only ── */
  function mobileCardHtml(p) {
    const imgHtml = p.main_image
      ? `<img src="${esc(p.main_image)}" class="pm-mcard-img" alt="" onerror="this.outerHTML='<div class=pm-mcard-img-ph>📦</div>'">`
      : `<div class="pm-mcard-img-ph">📦</div>`;

    const reorderDisabled = DISPLAY_ORDER_SUPPORTED === false;
    const order = p.display_order ?? null;
    const groupSize = ALL_PM_PRODUCTS.filter(x => categoryKey(x) === categoryKey(p)).length;
    const isFirst = order !== null && order <= 1;
    const isLast  = order !== null && order >= groupSize;

    return `<div class="pm-mcard" data-pmid="${esc(p.id)}">
        ${imgHtml}
        <div class="pm-mcard-body">
          <div class="pm-mcard-name">${esc(p.product_name)}</div>
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
  async function moveProductStep(id, direction) {
    const current = ALL_PM_PRODUCTS.find(p => p.id === id);
    if (!current || current.display_order == null) return;
    const groupSize = ALL_PM_PRODUCTS.filter(p => categoryKey(p) === categoryKey(current)).length;
    const target = current.display_order + direction;
    if (target < 1 || target > groupSize) return;
    await persistOrder(moveToPosition(id, target));
  }

  async function commitOrderInput(inp) {
    const id  = inp.dataset.pmid;
    const pos = parseInt(inp.value, 10);
    const current = ALL_PM_PRODUCTS.find(p => p.id === id);
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
    const el = document.getElementById('pmBookFields');
    if (el) el.style.display = getValue('pmCat') === 'books' ? '' : 'none';
  }

  function openModal(product) {
    EDIT_PRODUCT_ID = product?.id || null;
    const isEdit = !!product;

    document.getElementById('pmModalTitle').textContent = isEdit ? '✏️ تعديل المنتج' : '➕ إضافة منتج جديد';
    document.getElementById('pmSaveBtn').textContent    = isEdit ? '💾 حفظ التعديلات' : '🚀 نشر المنتج';

    resetForm();

    if (product) {
      setValue('pmName',      product.product_name);
      setValue('pmNameEn',    product.product_name_ar);
      setValue('pmNameFr',    product.product_name_fr);
      setValue('pmBrand',     product.brand);
      setValue('pmCat',       product.category);
      setValue('pmSubcat',    product.subcategory);
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

      if (product.main_image) showMainPreview(product.main_image);

      if (Array.isArray(product.gallery_images)) {
        product.gallery_images.forEach(url => addGalleryThumb(url));
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

    const prev = document.getElementById('pmMainPrev');
    if (prev) prev.innerHTML = `
      <div class="pm-upload-lbl">📷 انقر لرفع الصورة الرئيسية</div>
      <div class="pm-upload-sub">PNG · JPG · WebP</div>
    `;
    document.getElementById('pmMainBox')?.classList.remove('loaded');
    const galPrev = document.getElementById('pmGalPreviews');
    if (galPrev) galPrev.innerHTML = '';
  }

  /* ══════════════════════════════════════════════════════════
     IMAGE UPLOAD
  ══════════════════════════════════════════════════════════ */
  function randName(ext) {
    return `products/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  }

  async function uploadMainImage(file) {
    const prev = document.getElementById('pmMainPrev');
    if (prev) prev.innerHTML = `<div class="pm-upload-lbl">⏳ جاري الرفع...</div>`;

    try {
      const ext  = file.name.split('.').pop();
      const path = randName(ext);

      const { error: upErr } = await sb.storage.from('admin-product-images').upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = sb.storage.from('admin-product-images').getPublicUrl(path);

      setValue('pmMainUrl', publicUrl);
      showMainPreview(publicUrl);
      document.getElementById('pmMainBox')?.classList.add('loaded');
      showToast('✅ تم رفع الصورة الرئيسية');
    } catch (err) {
      if (prev) prev.innerHTML = `<div class="pm-upload-lbl" style="color:#dc2626;">❌ فشل رفع الصورة</div>`;
      showToast('❌ فشل رفع الصورة: ' + err.message, 'error');
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
    showToast(`⏳ جاري رفع ${files.length} صورة...`);
    for (const file of files) {
      try {
        const ext  = file.name.split('.').pop();
        const path = `products/gallery/${randName(ext).split('/').pop()}`;

        const { error: upErr } = await sb.storage.from('admin-product-images').upload(path, file, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;

        const { data: { publicUrl } } = sb.storage.from('admin-product-images').getPublicUrl(path);
        addGalleryThumb(publicUrl);
      } catch (err) {
        showToast('❌ فشل رفع صورة: ' + err.message, 'error');
      }
    }
    showToast('✅ تم رفع الصور');
  }

  function addGalleryThumb(url) {
    const container = document.getElementById('pmGalPreviews');
    if (!container) return;
    const wrap = document.createElement('div');
    wrap.className = 'pm-gal-wrap';
    wrap.innerHTML = `
      <img src="${esc(url)}" class="pm-gal-img" alt="">
      <button type="button" class="pm-gal-rm" title="إزالة">×</button>
    `;
    wrap.querySelector('.pm-gal-rm').addEventListener('click', () => wrap.remove());
    container.appendChild(wrap);
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

      /* Collect gallery images from live DOM */
      const galleryImgs = Array.from(
        document.querySelectorAll('#pmGalPreviews .pm-gal-img')
      ).map(img => img.src);

      const mainImg = getValue('pmMainUrl') || null;
      const oldPrice = parseInt(getValue('pmOldPrice')) || null;

      const payload = {
        product_name:      getValue('pmName'),
        product_name_ar:   getValue('pmNameEn')    || null,
        category:          getValue('pmCat')        || 'electronics',
        subcategory:       getValue('pmSubcat')     || null,
        price:             parseInt(getValue('pmPrice')) || 0,
        old_price:         oldPrice,
        discount_enabled:  !!oldPrice,
        stock_status:      getValue('pmStock')      || 'available',
        quantity:          parseInt(getValue('pmQty')) || 0,
        short_description: getValue('pmShortDesc')  || null,
        full_description:  getValue('pmFullDesc')   || null,
        main_image:        mainImg,
        gallery_images:    galleryImgs,
        slug:              getValue('pmSlug'),
        seo_title:         getValue('pmSeoTitle')   || null,
        seo_description:   getValue('pmSeoDesc')    || null,
        keywords:          getValue('pmKeywords')   || null,
        is_active:         true,
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

      if (!payload.product_name) throw new Error('اسم المنتج مطلوب');
      if (!payload.slug)         throw new Error('Slug المنتج مطلوب');
      if (!payload.price)        throw new Error('سعر المنتج مطلوب');

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
        console.log('[PM] INSERT succeeded:', insertedData);
        showToast('✅ تم إضافة المنتج ونشره في المتجر');
        triggerPageRebuild('إضافة منتج: ' + payload.product_name);
      }

      closeModal();
      await loadProducts();

    } catch (err) {
      showToast('❌ فشل الحفظ: ' + (err.message || 'خطأ غير معروف'), 'error');
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
    const deletedName = ALL_PM_PRODUCTS.find(p => p.id === id)?.product_name || id;
    try {
      const { error } = await sb.from('admin_products_catalog').delete().eq('id', id);
      if (error) throw error;
      showToast('✅ تم حذف المنتج');
      triggerPageRebuild('حذف منتج: ' + deletedName);
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
        { loc: 'https://derradjshop.com/Electronique/laptop/adjustable-laptop-stand.html',          lastmod: '2026-06-02', freq: 'monthly', pri: '0.8' },
        { loc: 'https://derradjshop.com/Electronique/smart-watch/modio-st11-smart-watch/',          lastmod: '2026-06-02', freq: 'monthly', pri: '0.8' },
        { loc: 'https://derradjshop.com/Electronique/earbuds/anker-soundcore-r50i-vg/',             lastmod: '2026-06-02', freq: 'monthly', pri: '0.8' },
        { loc: 'https://derradjshop.com/Electronique/earbuds/airpods-4-type-c-vrac/',               lastmod: '2026-06-02', freq: 'monthly', pri: '0.8' },
        { loc: 'https://derradjshop.com/Electronique/power-bank/hoco-j132a-20000mah-power-bank/',   lastmod: '2026-06-02', freq: 'monthly', pri: '0.8' },
        { loc: 'https://derradjshop.com/about.html',                                                lastmod: '2026-06-02', freq: 'monthly', pri: '0.5' },
        { loc: 'https://derradjshop.com/contact.html',                                              lastmod: '2026-06-02', freq: 'monthly', pri: '0.5' },
        { loc: 'https://derradjshop.com/faq.html',                                                  lastmod: '2026-06-02', freq: 'monthly', pri: '0.5' },
        { loc: 'https://derradjshop.com/delivery.html',                                             lastmod: '2026-06-02', freq: 'monthly', pri: '0.6' },
        { loc: 'https://derradjshop.com/return-policy.html',                                        lastmod: '2026-06-02', freq: 'monthly', pri: '0.5' },
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
    /* Load on first render if products tab is visible */
    if (document.getElementById('tab-products')?.classList.contains('active')) {
      loadProducts();
    }
    /* Also load after a delay (admin boot might not be done yet) */
    setTimeout(loadProducts, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
  } else {
    setTimeout(init, 400);
  }

})();
