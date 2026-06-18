/* ==========================================================
   products-manager.js — Derradj Shop | Product CRUD
   Runs after admin.js — adds full product management to admin
   ========================================================== */
(function () {
  'use strict';

  const SUPABASE_URL     = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk';

  if (!window.supabase?.createClient) return;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

  /* ── Helpers ── */
  function esc(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  function fmtPrice(n) {
    return Number(n || 0).toLocaleString('fr-DZ') + ' دج';
  }

  function showToast(msg, type = 'success') {
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
      'background:' + (type === 'error' ? '#dc2626' : '#059669'),
    ].join(';');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
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
    .pm-badge {
      display:inline-flex; align-items:center; gap:4px;
      padding:4px 10px; border-radius:99px;
      font-size:12px; font-weight:800;
    }
    .pm-badge-on  { background:#d1fae5; color:#065f46; }
    .pm-badge-off { background:#fee2e2; color:#991b1b; }

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
    .btn-pm-tog {
      padding:5px 11px; border-radius:7px;
      font-size:12px; font-weight:700; cursor:pointer;
      font-family:'Cairo',sans-serif; white-space:nowrap;
      border:1.5px solid; transition:background .15s;
    }
    .btn-pm-tog.on  { background:#fef3c7; color:#92400e; border-color:#fcd34d; }
    .btn-pm-tog.on:hover  { background:#f59e0b; color:#fff; border-color:#f59e0b; }
    .btn-pm-tog.off { background:#d1fae5; color:#065f46; border-color:#6ee7b7; }
    .btn-pm-tog.off:hover { background:#059669; color:#fff; border-color:#059669; }

    .pm-empty {
      text-align:center; padding:40px 20px;
      color:#94a3b8; font-size:15px;
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
            <div class="pm-section-title">🛍 إدارة المنتجات</div>
            <div class="pm-section-sub">إضافة منتجات جديدة وتعديلها وحذفها</div>
          </div>
          <button class="btn-pm-add" id="pmAddBtn">＋ إضافة منتج جديد</button>
        </div>
        <div class="pm-tbl-wrap">
          <table class="pm-tbl">
            <thead>
              <tr>
                <th>الصورة</th>
                <th>اسم المنتج</th>
                <th>الفئة</th>
                <th>السعر</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="pmTbody">
              <tr><td colspan="6" class="pm-empty">⏳ جاري التحميل...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <hr class="pm-separator">
      <span class="pm-old-label">⚙️ إدارة التوفر للمنتجات الموجودة (كتب وإلكترونيات قديمة)</span>
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
          <label>اسم المنتج (إنجليزي / فرنسي)</label>
          <input type="text" id="pmNameEn" placeholder="Huawei GT4 Smart Watch">
        </div>
        <div class="pm-fld">
          <label>الفئة *</label>
          <select id="pmCat">${catOpts}</select>
        </div>
        <div class="pm-fld">
          <label>الفئة الفرعية</label>
          <input type="text" id="pmSubcat" placeholder="مثال: TWS Earbuds">
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
          <label>حالة المخزون</label>
          <select id="pmStock">
            <option value="in_stock">✅ متوفر</option>
            <option value="low_stock">⚠️ كميات محدودة</option>
            <option value="out_of_stock">❌ غير متوفر</option>
          </select>
        </div>
        <div class="pm-fld">
          <label>الكمية المتاحة</label>
          <input type="number" id="pmQty" min="0" placeholder="10">
        </div>

        <hr class="pm-divider">
        <div class="pm-sec-lbl">الوصف</div>

        <div class="pm-fld full">
          <label>وصف مختصر (للبطاقة)</label>
          <textarea id="pmShortDesc" rows="2" placeholder="وصف قصير يظهر في بطاقة المنتج..."></textarea>
        </div>
        <div class="pm-fld full">
          <label>وصف كامل (لصفحة المنتج)</label>
          <textarea id="pmFullDesc" rows="5" placeholder="وصف مفصل يظهر في صفحة المنتج..."></textarea>
        </div>

        <hr class="pm-divider">
        <div class="pm-sec-lbl">الصور</div>

        <div class="pm-fld full">
          <label>الصورة الرئيسية</label>
          <div class="pm-upload-box" id="pmMainBox">
            <div id="pmMainPrev">
              <div class="pm-upload-lbl">📷 انقر لرفع الصورة الرئيسية</div>
              <div class="pm-upload-sub">PNG · JPG · WebP</div>
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
        <div class="pm-sec-lbl">الرابط وتحسين محركات البحث</div>

        <div class="pm-fld full">
          <label>Slug (رابط المنتج) *</label>
          <input type="text" id="pmSlug" required placeholder="huawei-gt4-smart-watch" dir="ltr">
          <span class="hint">رابط الصفحة: /product/?slug=...</span>
        </div>
        <div class="pm-fld full">
          <label>عنوان SEO</label>
          <input type="text" id="pmSeoTitle" placeholder="ساعة ذكية Huawei GT4 | Derradj Shop">
        </div>
        <div class="pm-fld full">
          <label>وصف SEO</label>
          <textarea id="pmSeoDesc" rows="2" placeholder="وصف لمحركات البحث..."></textarea>
        </div>
        <div class="pm-fld full">
          <label>الكلمات المفتاحية</label>
          <input type="text" id="pmKeywords" placeholder="ساعة ذكية، huawei، gt4">
        </div>

        <hr class="pm-divider">
        <div class="pm-sec-lbl">النشر</div>

        <div class="pm-fld full">
          <label>حالة النشر</label>
          <select id="pmActive">
            <option value="true">✅ منشور — يظهر للزوار</option>
            <option value="false">👁 مخفي — لا يظهر للزوار</option>
          </select>
        </div>

      </div>

      <button type="submit" class="pm-save" id="pmSaveBtn">🚀 نشر المنتج</button>
    </form>
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

    /* Auto-slug from name */
    document.getElementById('pmName')?.addEventListener('input', e => {
      const slugEl = document.getElementById('pmSlug');
      if (slugEl && !slugEl.dataset.manualEdit) {
        slugEl.value = slugify(e.target.value);
      }
    });
    document.getElementById('pmSlug')?.addEventListener('input', e => {
      e.target.dataset.manualEdit = '1';
    });

    /* Table delegation */
    document.getElementById('pmTbody')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-pma]');
      if (!btn) return;
      const { pma: action, pmid: id } = btn.dataset;
      if (action === 'edit') {
        const p = ALL_PM_PRODUCTS.find(x => x.id === id);
        if (p) openModal(p);
      }
      if (action === 'del') {
        if (confirm('حذف هذا المنتج نهائياً؟')) await deleteProduct(id, btn);
      }
      if (action === 'tog') {
        const p = ALL_PM_PRODUCTS.find(x => x.id === id);
        if (p) await toggleActive(id, !p.is_active, btn);
      }
    });

    /* Reload when tab is clicked */
    document.querySelectorAll('.tab-btn[data-tab="products"]').forEach(b => {
      b.addEventListener('click', () => setTimeout(loadProducts, 200));
    });
  }

  /* ══════════════════════════════════════════════════════════
     LOAD / RENDER
  ══════════════════════════════════════════════════════════ */
  async function loadProducts() {
    const tbody = document.getElementById('pmTbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="pm-empty">⏳ جاري التحميل...</td></tr>`;

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) {
        tbody.innerHTML = `<tr><td colspan="6" class="pm-empty">🔒 يجب تسجيل الدخول</td></tr>`;
        return;
      }

      const { data, error } = await sb
        .from('admin_products_catalog')
        .select('id, catalog_id, product_name, product_name_ar, category, price, old_price, main_image, is_active, stock_status, slug, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      ALL_PM_PRODUCTS = data || [];
      renderTable();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="pm-empty">❌ خطأ: ${esc(err.message)}</td></tr>`;
    }
  }

  function renderTable() {
    const tbody = document.getElementById('pmTbody');
    if (!tbody) return;

    if (!ALL_PM_PRODUCTS.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="pm-empty">لا توجد منتجات بعد. اضغط "إضافة منتج جديد" للبدء.</td></tr>`;
      return;
    }

    tbody.innerHTML = ALL_PM_PRODUCTS.map(p => {
      const imgHtml = p.main_image
        ? `<img src="${esc(p.main_image)}" class="pm-thumb" alt="" onerror="this.outerHTML='<div class=pm-thumb-ph>📦</div>'">`
        : `<div class="pm-thumb-ph">📦</div>`;

      const badge = p.is_active
        ? `<span class="pm-badge pm-badge-on">✅ منشور</span>`
        : `<span class="pm-badge pm-badge-off">👁 مخفي</span>`;

      const togClass = p.is_active ? 'on' : 'off';
      const togLabel = p.is_active ? '🙈 إخفاء' : '👁 نشر';

      return `<tr>
        <td>${imgHtml}</td>
        <td>
          <strong style="font-size:13px;display:block;">${esc(p.product_name)}</strong>
          ${p.product_name_ar ? `<span style="font-size:12px;color:#64748b;">${esc(p.product_name_ar)}</span><br>` : ''}
          ${p.slug ? `<span style="font-size:11px;color:#94a3b8;direction:ltr;">/product/?slug=${esc(p.slug)}</span>` : ''}
        </td>
        <td style="font-size:13px;font-weight:600;">${esc(catLabel(p.category))}</td>
        <td>
          <strong style="color:#1d4ed8;direction:ltr;display:block;">${fmtPrice(p.price)}</strong>
          ${p.old_price ? `<span style="font-size:12px;text-decoration:line-through;color:#94a3b8;direction:ltr;">${fmtPrice(p.old_price)}</span>` : ''}
        </td>
        <td>${badge}</td>
        <td>
          <div class="pm-btn-grp">
            <button class="btn-pm-edit" data-pma="edit" data-pmid="${esc(p.id)}">✏️ تعديل</button>
            <button class="btn-pm-tog ${togClass}" data-pma="tog" data-pmid="${esc(p.id)}">${togLabel}</button>
            <button class="btn-pm-del"  data-pma="del"  data-pmid="${esc(p.id)}">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════
     MODAL OPEN / CLOSE
  ══════════════════════════════════════════════════════════ */
  function openModal(product) {
    EDIT_PRODUCT_ID = product?.id || null;
    const isEdit = !!product;

    document.getElementById('pmModalTitle').textContent = isEdit ? '✏️ تعديل المنتج' : '➕ إضافة منتج جديد';
    document.getElementById('pmSaveBtn').textContent    = isEdit ? '💾 حفظ التعديلات' : '🚀 نشر المنتج';

    resetForm();

    if (product) {
      setValue('pmName',      product.product_name);
      setValue('pmNameEn',    product.product_name_ar);
      setValue('pmCat',       product.category);
      setValue('pmSubcat',    product.subcategory);
      setValue('pmPrice',     product.price);
      setValue('pmOldPrice',  product.old_price);
      setValue('pmStock',     product.stock_status || 'in_stock');
      setValue('pmQty',       product.quantity);
      setValue('pmShortDesc', product.short_description);
      setValue('pmFullDesc',  product.full_description);
      setValue('pmMainUrl',   product.main_image);
      setValue('pmSlug',      product.slug);
      setValue('pmSeoTitle',  product.seo_title);
      setValue('pmSeoDesc',   product.seo_description);
      setValue('pmKeywords',  product.keywords);
      setValue('pmActive',    product.is_active ? 'true' : 'false');

      if (product.main_image) showMainPreview(product.main_image);

      if (Array.isArray(product.gallery_images)) {
        product.gallery_images.forEach(url => addGalleryThumb(url));
      }

      const slugEl = document.getElementById('pmSlug');
      if (slugEl) slugEl.dataset.manualEdit = '1';
    }

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
        stock_status:      getValue('pmStock')      || 'in_stock',
        quantity:          parseInt(getValue('pmQty')) || 0,
        short_description: getValue('pmShortDesc')  || null,
        full_description:  getValue('pmFullDesc')   || null,
        main_image:        mainImg,
        gallery_images:    galleryImgs,
        slug:              getValue('pmSlug'),
        seo_title:         getValue('pmSeoTitle')   || null,
        seo_description:   getValue('pmSeoDesc')    || null,
        keywords:          getValue('pmKeywords')   || null,
        is_active:         getValue('pmActive') !== 'false',
        updated_at:        new Date().toISOString(),
      };

      if (!payload.product_name) throw new Error('اسم المنتج مطلوب');
      if (!payload.slug)         throw new Error('Slug المنتج مطلوب');
      if (!payload.price)        throw new Error('سعر المنتج مطلوب');

      if (EDIT_PRODUCT_ID) {
        const { error } = await sb.from('admin_products_catalog').update(payload).eq('id', EDIT_PRODUCT_ID);
        if (error) throw error;
        showToast('✅ تم تحديث المنتج بنجاح');
      } else {
        payload.created_at = new Date().toISOString();
        const { error } = await sb.from('admin_products_catalog').insert(payload);
        if (error) throw error;
        showToast('✅ تم إضافة المنتج ونشره في المتجر');
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
     DELETE / TOGGLE
  ══════════════════════════════════════════════════════════ */
  async function deleteProduct(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
      const { error } = await sb.from('admin_products_catalog').delete().eq('id', id);
      if (error) throw error;
      showToast('✅ تم حذف المنتج');
      await loadProducts();
    } catch (err) {
      showToast('❌ فشل الحذف: ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '🗑'; }
    }
  }

  async function toggleActive(id, newState, btn) {
    if (btn) btn.disabled = true;
    try {
      const { error } = await sb.from('admin_products_catalog')
        .update({ is_active: newState, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      showToast(newState ? '✅ تم نشر المنتج' : '👁 تم إخفاء المنتج');
      await loadProducts();
    } catch (err) {
      showToast('❌ فشل التغيير: ' + err.message, 'error');
      if (btn) btn.disabled = false;
    }
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  function init() {
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
