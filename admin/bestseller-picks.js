/* ==========================================================
   bestseller-picks.js — Derradj Shop | 🔥 المنتجات الأكثر مبيعاً
   Manually-curated "Best-Selling Products" homepage section.
   Stores only product_id + display_order in bestseller_picks
   (references admin_products_catalog — no product data is
   duplicated). Section-wide enable/disable flag lives in the
   existing site_settings table (key: bestsellers_section_enabled).
   Requires admin/best-selling-products.sql to have been run.
   ========================================================== */
(function () {
  'use strict';

  /* Shared client (see supabase-client.js) — reused instead of creating
     another GoTrueClient instance on this page (see admin.js for why). */
  if (!window.sbClient) return;
  const sb = window.sbClient;

  function esc(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
  function escAttr(v) { return esc(v).replaceAll('"', '&quot;'); }

  const PICK_SELECT = 'id,display_order,product_id,admin_products_catalog(id,catalog_id,product_name,product_name_ar,category,subcategory,price,slug,main_image,is_active)';

  /* ── Resolve a stored main_image into a displayable URL — copied
     verbatim from admin/products-manager.js's resolveThumbSrc() so the
     Best-Selling picker shows the exact same image the Products tab
     shows for the same product (single source of truth: the row's own
     main_image/slug/subcategory, never re-derived or guessed). ── */
  function resolveThumbSrc(p) {
    let img = p.main_image || '';
    if (!img) return '';
    if (p.category === 'books') {
      if (!/^https?:\/\//.test(img)) img = '/books/' + img.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    } else if (p.category === 'subscriptions') {
      if (!/^https?:\/\//.test(img)) img = '/subscriptions/' + img.replace(/\.(png|jpg|jpeg)$/i, '.webp');
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

  /* <img> markup with the same onerror fallback chain as products-manager.js:
     resolved local mirror → raw Supabase main_image (only if different) →
     a plain placeholder box. Never falls back to Logo.jpg — that would
     show a generic brand mark in place of a real, available product photo. */
  function thumbImgHtml(p, cssClass) {
    const thumbSrc = resolveThumbSrc(p);
    if (!thumbSrc) return `<div class="${cssClass}-ph">📦</div>`;
    const rawFallback = p.category !== 'books' && p.category !== 'subscriptions' && thumbSrc !== p.main_image ? escAttr(p.main_image || '') : '';
    return `<img src="${escAttr(thumbSrc)}" class="${cssClass}" alt=""` +
      (rawFallback ? ` data-fallback="${rawFallback}"` : '') +
      ` onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback}else{this.outerHTML='<div class=${cssClass}-ph>📦</div>'}">`;
  }

  let PICKS = [];
  let ENABLED = true;
  let ALL_PRODUCTS_CACHE = null;
  let DRAG_SRC_ID = null;
  let loadedOnce = false;
  let BROWSE_QUERY = '';

  /* ══════════════════════════════════════════════════════════
     DATA
  ══════════════════════════════════════════════════════════ */
  async function loadPicks() {
    try {
      const { data, error } = await sb.from('bestseller_picks')
        .select(PICK_SELECT)
        .order('display_order', { ascending: true });
      if (error) throw error;
      PICKS = data || [];
    } catch (err) {
      console.warn('[BP] failed to load bestseller picks:', err.message || err);
      PICKS = [];
      showToast('❌ فشل تحميل قائمة الأكثر مبيعاً: ' + (err.message || ''), 'error');
    }
  }

  async function loadEnabledFlag() {
    try {
      const { data, error } = await sb.from('site_settings')
        .select('value')
        .eq('key', 'bestsellers_section_enabled')
        .maybeSingle();
      if (error) throw error;
      ENABLED = data?.value?.enabled !== false;
    } catch (err) {
      console.warn('[BP] failed to load section enabled flag:', err.message || err);
      ENABLED = true;
    }
  }

  async function saveEnabledFlag(enabled) {
    const { error } = await sb.from('site_settings')
      .upsert({ key: 'bestsellers_section_enabled', value: { enabled } });
    if (error) throw error;
  }

  async function ensureProductsCache() {
    if (ALL_PRODUCTS_CACHE) return ALL_PRODUCTS_CACHE;
    try {
      const { data, error } = await sb.from('admin_products_catalog')
        .select('id,catalog_id,product_name,product_name_ar,category,subcategory,price,slug,main_image')
        .eq('is_active', true)
        .order('product_name_ar', { ascending: true });
      if (error) throw error;
      ALL_PRODUCTS_CACHE = data || [];
    } catch (err) {
      console.warn('[BP] failed to load products for search:', err.message || err);
      ALL_PRODUCTS_CACHE = [];
    }
    return ALL_PRODUCTS_CACHE;
  }

  /* ══════════════════════════════════════════════════════════
     MUTATIONS
  ══════════════════════════════════════════════════════════ */
  async function addPick(productId) {
    if (PICKS.some(p => p.product_id === productId)) {
      showToast('⚠ هذا المنتج مضاف مسبقاً', 'error');
      return;
    }
    const nextOrder = PICKS.length ? Math.max(...PICKS.map(p => p.display_order)) + 1 : 1;
    const optimisticProduct = ALL_PRODUCTS_CACHE?.find(p => p.id === productId) || null;
    const tempId = 'temp-' + Date.now();
    PICKS.push({ id: tempId, product_id: productId, display_order: nextOrder, admin_products_catalog: optimisticProduct });
    render();

    try {
      const { data, error } = await sb.from('bestseller_picks')
        .insert({ product_id: productId, display_order: nextOrder })
        .select(PICK_SELECT)
        .single();
      if (error) throw error;
      const idx = PICKS.findIndex(p => p.id === tempId);
      if (idx !== -1) PICKS[idx] = data;
      render();
      showToast('✅ تمت الإضافة إلى الأكثر مبيعاً');
    } catch (err) {
      PICKS = PICKS.filter(p => p.id !== tempId);
      render();
      showToast('❌ فشلت الإضافة: ' + (err.message || ''), 'error');
    }
  }

  async function removePick(pickId) {
    if (!confirm('إزالة هذا المنتج من الأكثر مبيعاً؟ (لن يتم حذف المنتج نفسه)')) return;
    const prev = PICKS;
    PICKS = PICKS.filter(p => p.id !== pickId);
    render();
    try {
      const { error } = await sb.from('bestseller_picks').delete().eq('id', pickId);
      if (error) throw error;
      showToast('✅ تمت الإزالة من الأكثر مبيعاً');
    } catch (err) {
      PICKS = prev;
      render();
      showToast('❌ فشلت الإزالة: ' + (err.message || ''), 'error');
    }
  }

  /* Mutates display_order = 1..N in place and returns just the rows that changed. */
  function diffPickOrder(ordered) {
    const changed = [];
    ordered.forEach((p, i) => {
      const n = i + 1;
      if (p.display_order !== n) changed.push({ id: p.id, display_order: n });
      p.display_order = n;
    });
    return changed;
  }

  async function savePickOrderChanges(changed) {
    const results = await Promise.all(changed.map(c =>
      sb.from('bestseller_picks').update({ display_order: c.display_order }).eq('id', c.id)
    ));
    const failed = results.find(r => r.error);
    if (failed) throw failed.error;
  }

  async function persistPickOrder(ordered) {
    PICKS = ordered;
    const changed = diffPickOrder(PICKS);
    render();
    if (!changed.length) return;
    try {
      await savePickOrderChanges(changed);
      showToast(`✅ تم تحديث الترتيب (${changed.length} منتج)`);
    } catch (err) {
      showToast('❌ فشل حفظ الترتيب: ' + (err.message || ''), 'error');
      await loadPicks();
      render();
    }
  }

  /* Removes `id` from PICKS and reinserts it at 1-based position `pos`
     (clamped to the valid range), shifting every product between the
     old and new position — same algorithm as products-manager.js's
     moveToPosition(), just over the whole flat list instead of a
     per-category group. */
  function moveToPosition(id, pos) {
    const idx = PICKS.findIndex(p => p.id === id);
    if (idx === -1) return PICKS;
    const list = PICKS.slice();
    const [moved] = list.splice(idx, 1);
    const clamped = Math.max(1, Math.min(pos, list.length + 1));
    list.splice(clamped - 1, 0, moved);
    return list;
  }

  /* Commits the "الترتيب" number field — validates a whole integer in
     [1, PICKS.length] before touching anything, and restores the input
     to the current position on any invalid entry instead of silently
     dropping/duplicating an order value. */
  async function commitPositionInput(inp) {
    const id = inp.dataset.pickId;
    const current = PICKS.find(p => p.id === id);
    if (!current) return;
    const raw = inp.value.trim();
    const pos = Number(raw);
    const valid = raw !== '' && Number.isInteger(pos) && pos >= 1 && pos <= PICKS.length;
    if (!valid) {
      inp.value = current.display_order ?? '';
      showToast(`⚠ الرجاء إدخال رقم صحيح بين 1 و ${PICKS.length}`, 'error');
      return;
    }
    if (current.display_order === pos) return;
    await persistPickOrder(moveToPosition(id, pos));
  }

  /* Mobile fallback — native drag-and-drop is unreliable on touch. */
  async function movePickStep(id, direction) {
    const idx = PICKS.findIndex(p => p.id === id);
    if (idx === -1) return;
    const target = idx + direction;
    if (target < 0 || target >= PICKS.length) return;
    const reordered = PICKS.slice();
    const [item] = reordered.splice(idx, 1);
    reordered.splice(target, 0, item);
    await persistPickOrder(reordered);
  }

  function bindDragEvents(listEl) {
    if (!listEl) return;

    listEl.addEventListener('dragstart', e => {
      const row = e.target.closest('.bp-row[draggable="true"]');
      if (!row) return;
      DRAG_SRC_ID = row.dataset.pickId;
      row.classList.add('bp-row-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    listEl.addEventListener('dragend', () => {
      listEl.querySelectorAll('.bp-row-dragging').forEach(r => r.classList.remove('bp-row-dragging'));
    });

    listEl.addEventListener('dragover', e => {
      e.preventDefault();
      if (!DRAG_SRC_ID) return;
      const row = e.target.closest('.bp-row[draggable="true"]');
      const dragEl = listEl.querySelector(`.bp-row[data-pick-id="${DRAG_SRC_ID}"]`);
      if (!row || !dragEl || row === dragEl) return;
      const rect = row.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      row.parentNode.insertBefore(dragEl, before ? row : row.nextSibling);
    });

    listEl.addEventListener('drop', async e => {
      e.preventDefault();
      if (!DRAG_SRC_ID) return;
      DRAG_SRC_ID = null;
      const ids = Array.from(listEl.querySelectorAll('.bp-row[data-pick-id]')).map(r => r.dataset.pickId);
      const reordered = ids.map(id => PICKS.find(p => p.id === id)).filter(Boolean);
      await persistPickOrder(reordered);
    });
  }

  /* ══════════════════════════════════════════════════════════
     TOAST (self-contained — same visual pattern as products-manager.js)
  ══════════════════════════════════════════════════════════ */
  function showToast(msg, type = 'success', opts = {}) {
    const old = document.getElementById('bp-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'bp-toast';
    el.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px',
      'padding:12px 24px', 'border-radius:10px',
      'font-weight:700', 'font-size:14px', 'z-index:9999',
      'color:#fff', 'box-shadow:0 4px 20px rgba(0,0,0,.28)',
      "font-family:'Cairo',sans-serif", 'max-width:340px',
      'line-height:1.4', 'direction:rtl',
      'background:' + (type === 'error' ? '#dc2626' : type === 'info' ? '#1d4ed8' : '#059669'),
    ].join(';');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), opts.duration || 4000);
  }

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  function renderToggle() {
    const btn = document.getElementById('bpEnableToggle');
    if (!btn) return;
    btn.classList.toggle('is-on', ENABLED);
    btn.setAttribute('aria-checked', String(ENABLED));
    const label = document.getElementById('bpEnableLabel');
    if (label) label.textContent = ENABLED ? '🟢 القسم مفعّل في المتجر' : '⚪ القسم معطّل (مخفي عن الزوار)';
  }

  function pickRowHtml(pick, i) {
    const p = pick.admin_products_catalog;
    const missing = !p;
    const inactive = !missing && p.is_active === false;
    const name = missing ? '(منتج محذوف)' : (p.product_name || 'بدون اسم');
    const catalogId = missing ? '' : (p.catalog_id != null ? '#' + p.catalog_id : '');
    const price = missing ? '' : (Number(p.price || 0).toLocaleString('en-US') + ' دج');
    const badge = missing
      ? `<span class="bp-badge bp-badge-danger">⚠ محذوف</span>`
      : (inactive ? `<span class="bp-badge bp-badge-warn">⚠ غير نشط</span>` : '');
    return `
      <div class="bp-row" draggable="true" data-pick-id="${escAttr(pick.id)}">
        <span class="bp-drag-handle" title="اسحب لإعادة الترتيب">⠿</span>
        <span class="bp-rank">${i + 1}</span>
        ${missing ? `<div class="bp-thumb-ph">📦</div>` : thumbImgHtml(p, 'bp-thumb')}
        <div class="bp-info">
          <div class="bp-name">${esc(name)} ${badge}</div>
          <div class="bp-meta">${esc(catalogId)}${catalogId && price ? ' · ' : ''}${esc(price)}</div>
        </div>
        <div class="bp-position-field">
          <label class="bp-position-label" for="bp-pos-${escAttr(pick.id)}">الترتيب</label>
          <input type="number" class="bp-position-input" id="bp-pos-${escAttr(pick.id)}"
                 min="1" max="${PICKS.length}" step="1"
                 value="${pick.display_order ?? i + 1}" data-bpa="order" data-pick-id="${escAttr(pick.id)}">
        </div>
        <div class="bp-order-btns">
          <button type="button" data-bpa="up" data-pick-id="${escAttr(pick.id)}" ${i === 0 ? 'disabled' : ''} title="تحريك للأعلى">▲</button>
          <button type="button" data-bpa="down" data-pick-id="${escAttr(pick.id)}" ${i === PICKS.length - 1 ? 'disabled' : ''} title="تحريك للأسفل">▼</button>
        </div>
        <button type="button" class="bp-remove" data-bpa="remove" data-pick-id="${escAttr(pick.id)}">🗑 إزالة</button>
      </div>`;
  }

  function renderList() {
    const list = document.getElementById('bpList');
    const count = document.getElementById('bpCount');
    if (!list) return;
    if (count) count.textContent = PICKS.length + ' منتج';
    if (!PICKS.length) {
      list.innerHTML = `<div class="bp-empty">لا توجد منتجات في قسم الأكثر مبيعاً بعد — استخدم البحث أعلاه لإضافة منتجات.</div>`;
      return;
    }
    list.innerHTML = PICKS.map((pick, i) => pickRowHtml(pick, i)).join('');
    bindDragEvents(list);
  }

  function render() {
    renderToggle();
    renderList();
  }

  function renderSearchResults(query) {
    const box = document.getElementById('bpSearchResults');
    if (!box) return;
    if (!query) { box.innerHTML = ''; box.style.display = 'none'; return; }
    if (!ALL_PRODUCTS_CACHE) {
      box.innerHTML = `<div class="bp-search-item bp-search-empty">⏳ جاري تحميل قائمة المنتجات...</div>`;
      box.style.display = '';
      return;
    }
    const q = query.toLowerCase();
    const results = ALL_PRODUCTS_CACHE.filter(p => {
      const nameAr = (p.product_name_ar || '').toLowerCase();
      const nameEn = (p.product_name || '').toLowerCase();
      const cid = String(p.catalog_id || '');
      return nameAr.includes(q) || nameEn.includes(q) || cid.includes(q);
    }).slice(0, 20);
    if (!results.length) {
      box.innerHTML = `<div class="bp-search-item bp-search-empty">لا توجد نتائج</div>`;
      box.style.display = '';
      return;
    }
    box.innerHTML = results.map(p => {
      const already = PICKS.some(pick => pick.product_id === p.id);
      const name = p.product_name_ar || p.product_name || 'بدون اسم';
      return `
        <div class="bp-search-item">
          <span class="bp-search-name">${esc(name)} <small>#${esc(p.catalog_id)}</small></span>
          <button type="button" data-bpa="add" data-pid="${escAttr(p.id)}" ${already ? 'disabled' : ''}>${already ? '✓ مضاف' : '➕ إضافة'}</button>
        </div>`;
    }).join('');
    box.style.display = '';
  }

  /* ══════════════════════════════════════════════════════════
     BROWSE-ALL-PRODUCTS MODAL — an alternative to typing a search
     query: lets the admin visually scan every active product (image,
     name, price, category) and add straight from the grid. Reuses
     ALL_PRODUCTS_CACHE / addPick() — no separate data source.
  ══════════════════════════════════════════════════════════ */
  function catLabelSimple(cat) {
    return cat === 'books' ? '📚 كتب' : cat === 'electronics' ? '💻 إلكترونيات' : (cat || '—');
  }

  function browseCardHtml(p) {
    const already = PICKS.some(pick => pick.product_id === p.id);
    const name = p.product_name || 'بدون اسم';
    const price = Number(p.price || 0).toLocaleString('en-US') + ' دج';
    return `
      <div class="bp-browse-card">
        ${thumbImgHtml(p, 'bp-browse-thumb')}
        <div class="bp-browse-info">
          <div class="bp-browse-name" title="${escAttr(name)}">${esc(name)}</div>
          <div class="bp-browse-meta">
            <span class="bp-browse-price">${esc(price)}</span>
            <span class="bp-browse-cat">${esc(catLabelSimple(p.category))}</span>
          </div>
        </div>
        <button type="button" class="bp-browse-add-btn" data-bpa="add" data-pid="${escAttr(p.id)}" ${already ? 'disabled' : ''}>
          ${already ? '✓ مضاف' : '➕ إضافة'}
        </button>
      </div>`;
  }

  function renderBrowseGrid() {
    const grid = document.getElementById('bpBrowseGrid');
    const totalCount = document.getElementById('bpBrowseTotalCount');
    const addedCount = document.getElementById('bpBrowseAddedCount');
    if (!grid) return;

    if (totalCount) totalCount.textContent = 'جميع المنتجات — ' + (ALL_PRODUCTS_CACHE?.length || 0) + ' منتج';
    if (addedCount) addedCount.textContent = 'المضاف إلى الأكثر مبيعاً — ' + PICKS.length + ' منتج';

    if (!ALL_PRODUCTS_CACHE) {
      grid.innerHTML = `<div class="bp-browse-empty">⏳ جاري التحميل...</div>`;
      return;
    }

    const q = BROWSE_QUERY.toLowerCase();
    const list = !q ? ALL_PRODUCTS_CACHE : ALL_PRODUCTS_CACHE.filter(p => {
      const nameAr = (p.product_name_ar || '').toLowerCase();
      const nameEn = (p.product_name || '').toLowerCase();
      const cid = String(p.catalog_id || '');
      return nameAr.includes(q) || nameEn.includes(q) || cid.includes(q);
    });

    if (!list.length) {
      grid.innerHTML = `<div class="bp-browse-empty">لا توجد نتائج مطابقة</div>`;
      return;
    }
    grid.innerHTML = list.map(browseCardHtml).join('');
  }

  async function openBrowseModal() {
    const overlay = document.getElementById('bpBrowseOverlay');
    if (!overlay) return;
    BROWSE_QUERY = '';
    const input = document.getElementById('bpBrowseSearchInput');
    if (input) input.value = '';
    overlay.classList.add('open');
    renderBrowseGrid();
    if (!ALL_PRODUCTS_CACHE) {
      await ensureProductsCache();
      renderBrowseGrid();
    }
  }

  function closeBrowseModal() {
    document.getElementById('bpBrowseOverlay')?.classList.remove('open');
  }

  /* ══════════════════════════════════════════════════════════
     STYLES
  ══════════════════════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('bp-styles')) return;
    const s = document.createElement('style');
    s.id = 'bp-styles';
    s.textContent = `
    .bp-toggle {
      display:inline-flex; align-items:center; gap:8px;
      border:none; background:transparent; padding:2px;
      cursor:pointer; font-family:'Cairo',sans-serif; user-select:none;
    }
    .bp-toggle-track {
      position:relative; width:38px; height:21px; border-radius:99px;
      background:#cbd5e1; transition:background .18s; flex-shrink:0;
    }
    .bp-toggle-thumb {
      position:absolute; top:2px; left:2px; width:17px; height:17px;
      border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.25);
      transition:transform .18s;
    }
    .bp-toggle.is-on .bp-toggle-track { background:#22c55e; }
    .bp-toggle.is-on .bp-toggle-thumb { transform:translateX(17px); }
    .bp-toggle-label { font-size:13px; font-weight:800; white-space:nowrap; }
    .bp-toggle.is-on .bp-toggle-label { color:#065f46; }
    .bp-toggle:not(.is-on) .bp-toggle-label { color:#991b1b; }

    .bp-add-box { position:relative; margin:16px 0; }
    .bp-add-toolbar { display:flex; gap:10px; flex-wrap:wrap; }
    .bp-add-toolbar .search-input { flex:1; min-width:220px; }
    .btn-bp-browse {
      display:inline-flex; align-items:center; gap:6px; flex-shrink:0;
      padding:10px 18px; background:#059669; color:#fff;
      border:none; border-radius:10px; font-size:13px;
      font-weight:800; cursor:pointer; font-family:'Cairo',sans-serif;
      white-space:nowrap; transition:background .2s;
    }
    .btn-bp-browse:hover { background:#047857; }
    .bp-search-results {
      display:none; position:absolute; z-index:20; top:calc(100% + 4px); right:0; left:0;
      background:#fff; border:1px solid #e2e8f0; border-radius:12px;
      box-shadow:0 8px 24px rgba(0,0,0,.12); max-height:320px; overflow-y:auto;
    }
    .bp-search-item {
      display:flex; align-items:center; justify-content:space-between; gap:10px;
      padding:10px 14px; border-bottom:1px solid #f1f5f9; font-size:13px;
    }
    .bp-search-item:last-child { border-bottom:none; }
    .bp-search-item.bp-search-empty { color:#94a3b8; justify-content:center; }
    .bp-search-name { color:#1e293b; font-weight:700; }
    .bp-search-name small { color:#94a3b8; font-weight:600; }
    .bp-search-item button {
      flex-shrink:0; padding:6px 12px; border:none; border-radius:8px;
      background:#059669; color:#fff; font-weight:800; font-size:12px;
      cursor:pointer; font-family:'Cairo',sans-serif;
    }
    .bp-search-item button:disabled { background:#cbd5e1; cursor:default; }

    .bp-list { display:flex; flex-direction:column; gap:8px; }
    .bp-empty { padding:28px 14px; text-align:center; color:#94a3b8; font-size:14px; }
    .bp-row {
      display:flex; align-items:center; gap:10px;
      background:#fff; border:1px solid #e2e8f0; border-radius:12px;
      padding:10px 12px; box-shadow:0 1px 3px rgba(0,0,0,.06);
    }
    .bp-row.bp-row-dragging { opacity:.4; }
    .bp-drag-handle { cursor:grab; color:#94a3b8; font-size:16px; flex-shrink:0; }
    .bp-rank {
      flex-shrink:0; width:24px; height:24px; border-radius:50%;
      background:#eff6ff; color:#1d4ed8; font-weight:800; font-size:12px;
      display:flex; align-items:center; justify-content:center;
    }
    .bp-thumb { width:44px; height:44px; object-fit:cover; border-radius:8px; border:1px solid #e2e8f0; background:#f1f5f9; flex-shrink:0; }
    .bp-thumb-ph {
      width:44px; height:44px; border-radius:8px; border:1px solid #e2e8f0;
      background:#f1f5f9; flex-shrink:0; display:flex; align-items:center;
      justify-content:center; font-size:18px;
    }
    .bp-info { flex:1; min-width:0; }
    .bp-name { font-size:14px; font-weight:800; color:#1e293b; word-break:break-word; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
    .bp-meta { font-size:12px; color:#64748b; margin-top:2px; }
    .bp-badge { font-size:11px; font-weight:800; padding:2px 8px; border-radius:99px; }
    .bp-badge-danger { background:#fee2e2; color:#991b1b; }
    .bp-badge-warn { background:#fef3c7; color:#92400e; }
    .bp-position-field { display:flex; flex-direction:column; align-items:center; gap:2px; flex-shrink:0; }
    .bp-position-label { font-size:10px; font-weight:800; color:#94a3b8; }
    .bp-position-input {
      width:48px; padding:5px 6px; text-align:center;
      border:1.5px solid #e2e8f0; border-radius:7px;
      font-size:13px; font-weight:800; color:#1d4ed8;
      font-family:'Cairo',sans-serif;
    }
    .bp-position-input:focus { outline:none; border-color:#059669; }
    .bp-order-btns { display:flex; flex-direction:column; gap:2px; flex-shrink:0; }
    .bp-order-btns button {
      width:26px; height:22px; border:1px solid #e2e8f0; background:#f8fafc;
      border-radius:6px; cursor:pointer; font-size:11px; color:#475569;
    }
    .bp-order-btns button:disabled { opacity:.35; cursor:default; }
    .bp-remove {
      flex-shrink:0; padding:8px 12px; border:none; border-radius:8px;
      background:#fee2e2; color:#991b1b; font-weight:800; font-size:12px;
      cursor:pointer; font-family:'Cairo',sans-serif; white-space:nowrap;
    }
    .bp-remove:hover { background:#fecaca; }

    @media (max-width: 640px) {
      .bp-name { font-size:13px; }
      .bp-thumb, .bp-thumb-ph { width:38px; height:38px; }
    }

    /* ── Browse-all-products modal ─────────────────────────── */
    .bp-browse-overlay {
      position:fixed; inset:0; background:rgba(15,23,42,.62);
      z-index:3000; display:none; align-items:flex-start;
      justify-content:center; padding:20px; overflow-y:auto;
    }
    .bp-browse-overlay.open { display:flex; }
    .bp-browse-modal {
      background:#fff; border-radius:18px; width:100%; max-width:960px;
      display:flex; flex-direction:column; box-shadow:0 24px 80px rgba(0,0,0,.32);
      overflow:hidden; margin:auto;
    }
    .bp-browse-hdr {
      background:#0f172a; color:#fff; padding:16px 20px;
      display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
    }
    .bp-browse-title { font-size:16px; font-weight:900; }
    .bp-browse-close {
      background:rgba(255,255,255,.1); border:none; color:#fff;
      width:34px; height:34px; border-radius:8px; font-size:16px;
      cursor:pointer; display:flex; align-items:center;
      justify-content:center; font-family:'Cairo',sans-serif;
      transition:background .2s;
    }
    .bp-browse-close:hover { background:rgba(255,255,255,.22); }
    .bp-browse-body { padding:20px; overflow-y:auto; max-height:calc(100vh - 120px); }
    .bp-browse-counts {
      display:flex; gap:16px; flex-wrap:wrap; margin:12px 2px 16px;
      font-size:12px; font-weight:800; color:#64748b;
    }
    .bp-browse-grid {
      display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr));
      gap:14px;
    }
    .bp-browse-card {
      display:flex; flex-direction:column;
      border:1px solid #e2e8f0; border-radius:14px; padding:12px;
      background:#f8fafc; text-align:center;
    }
    .bp-browse-thumb {
      width:100%; aspect-ratio:1/1; object-fit:cover;
      border-radius:10px; border:1px solid #e2e8f0; background:#fff;
      margin-bottom:10px;
    }
    .bp-browse-thumb-ph {
      width:100%; aspect-ratio:1/1; border-radius:10px;
      border:1px solid #e2e8f0; background:#fff; margin-bottom:10px;
      display:flex; align-items:center; justify-content:center; font-size:28px;
    }
    .bp-browse-info { flex:1; margin-bottom:10px; }
    .bp-browse-name {
      font-size:13px; font-weight:800; color:#1e293b;
      display:-webkit-box; -webkit-line-clamp:2; line-clamp:2;
      -webkit-box-orient:vertical; overflow:hidden; margin-bottom:6px;
    }
    .bp-browse-meta { display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; }
    .bp-browse-price { font-size:13px; font-weight:900; color:#059669; }
    .bp-browse-cat { font-size:11px; font-weight:700; color:#64748b; background:#eef2f7; padding:2px 8px; border-radius:99px; }
    .bp-browse-add-btn {
      width:100%; padding:9px; border:none; border-radius:9px;
      background:#059669; color:#fff; font-weight:800; font-size:13px;
      cursor:pointer; font-family:'Cairo',sans-serif; transition:background .2s;
    }
    .bp-browse-add-btn:hover:not(:disabled) { background:#047857; }
    .bp-browse-add-btn:disabled { background:#e2e8f0; color:#64748b; cursor:default; }
    .bp-browse-empty { grid-column:1/-1; padding:40px 14px; text-align:center; color:#94a3b8; font-size:14px; }

    @media (max-width: 640px) {
      .bp-browse-grid { grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:10px; }
      .bp-browse-body { padding:14px; }
    }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     HTML / EVENTS
  ══════════════════════════════════════════════════════════ */
  function injectHTML() {
    const tab = document.getElementById('tab-bestpicks');
    if (!tab) return;
    tab.innerHTML = `
      <div class="controls-bar">
        <button type="button" class="bp-toggle" id="bpEnableToggle" role="switch" aria-checked="false">
          <span class="bp-toggle-track"><span class="bp-toggle-thumb"></span></span>
          <span class="bp-toggle-label" id="bpEnableLabel">—</span>
        </button>
        <span class="orders-count" id="bpCount"></span>
      </div>
      <div class="bp-add-box">
        <div class="bp-add-toolbar">
          <input type="text" class="search-input" id="bpSearchInput"
                 placeholder="🔍 ابحث بالاسم أو رقم المنتج لإضافته إلى الأكثر مبيعاً...">
          <button type="button" class="btn-bp-browse" id="bpBrowseBtn">➕ تصفح جميع المنتجات وإضافة</button>
        </div>
        <div class="bp-search-results" id="bpSearchResults"></div>
      </div>
      <div class="bp-list" id="bpList">
        <div class="bp-empty">⏳ جاري التحميل...</div>
      </div>
    `;

    document.getElementById('bpEnableToggle').addEventListener('click', async () => {
      const next = !ENABLED;
      ENABLED = next;
      renderToggle();
      try {
        await saveEnabledFlag(next);
        showToast(next ? '✅ تم تفعيل القسم في المتجر' : '⚪ تم تعطيل القسم');
      } catch (err) {
        ENABLED = !next;
        renderToggle();
        showToast('❌ فشل تحديث حالة القسم: ' + (err.message || ''), 'error');
      }
    });

    document.getElementById('bpBrowseBtn').addEventListener('click', openBrowseModal);

    const searchInput = document.getElementById('bpSearchInput');
    searchInput.addEventListener('input', e => renderSearchResults(e.target.value.trim()));
    searchInput.addEventListener('focus', e => { if (e.target.value.trim()) renderSearchResults(e.target.value.trim()); });
    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        const box = document.getElementById('bpSearchResults');
        if (box) box.style.display = 'none';
      }, 150);
    });

    tab.addEventListener('click', e => {
      const addBtn = e.target.closest('[data-bpa="add"]');
      if (addBtn && !addBtn.disabled) { addPick(addBtn.dataset.pid); return; }
      const removeBtn = e.target.closest('[data-bpa="remove"]');
      if (removeBtn) { removePick(removeBtn.dataset.pickId); return; }
      const upBtn = e.target.closest('[data-bpa="up"]');
      if (upBtn && !upBtn.disabled) { movePickStep(upBtn.dataset.pickId, -1); return; }
      const downBtn = e.target.closest('[data-bpa="down"]');
      if (downBtn && !downBtn.disabled) { movePickStep(downBtn.dataset.pickId, 1); return; }
    });

    /* "الترتيب" number field — Enter commits + blurs; focusout (bubbles) saves. */
    tab.addEventListener('keydown', e => {
      const inp = e.target.closest('input[data-bpa="order"]');
      if (inp && e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    });
    tab.addEventListener('focusout', e => {
      const inp = e.target.closest('input[data-bpa="order"]');
      if (inp) commitPositionInput(inp);
    });
  }

  /* Appended once to document.body (not into #tab-bestpicks) so it
     renders as a true fixed overlay regardless of the tab's own
     layout/scroll — same approach as products-manager.js's pmOverlay. */
  function injectBrowseModal() {
    if (document.getElementById('bpBrowseOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'bpBrowseOverlay';
    overlay.className = 'bp-browse-overlay';
    overlay.innerHTML = `
      <div class="bp-browse-modal">
        <div class="bp-browse-hdr">
          <span class="bp-browse-title">📦 تصفح جميع المنتجات</span>
          <button type="button" class="bp-browse-close" id="bpBrowseClose">✕</button>
        </div>
        <div class="bp-browse-body">
          <input type="text" class="search-input" id="bpBrowseSearchInput" placeholder="🔍 بحث عن منتج...">
          <div class="bp-browse-counts">
            <span id="bpBrowseTotalCount">جميع المنتجات — 0 منتج</span>
            <span id="bpBrowseAddedCount">المضاف إلى الأكثر مبيعاً — 0 منتج</span>
          </div>
          <div class="bp-browse-grid" id="bpBrowseGrid">
            <div class="bp-browse-empty">⏳ جاري التحميل...</div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('bpBrowseClose').addEventListener('click', closeBrowseModal);
    document.getElementById('bpBrowseSearchInput').addEventListener('input', e => {
      BROWSE_QUERY = e.target.value.trim();
      renderBrowseGrid();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeBrowseModal();
    });

    overlay.addEventListener('click', async e => {
      if (e.target === overlay) { closeBrowseModal(); return; }
      const addBtn = e.target.closest('[data-bpa="add"]');
      if (addBtn && !addBtn.disabled) {
        addBtn.disabled = true;
        addBtn.textContent = '⏳';
        await addPick(addBtn.dataset.pid);
        renderBrowseGrid();
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  async function load() {
    loadedOnce = true;
    await Promise.all([loadEnabledFlag(), loadPicks(), ensureProductsCache()]);
    render();
  }

  async function init() {
    injectStyles();
    injectHTML();
    injectBrowseModal();
    document.querySelectorAll('.tab-btn[data-tab="bestpicks"]').forEach(b => {
      b.addEventListener('click', () => { if (!loadedOnce) load(); });
    });
    if (document.getElementById('tab-bestpicks')?.classList.contains('active')) load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
  } else {
    setTimeout(init, 400);
  }

})();
