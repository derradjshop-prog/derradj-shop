/* ==========================================================
   seller-books.js — Derradj Shop | 📚 كتب البائعين (Admin)
   Read-only admin view over seller_book_inventory — the seller-owned
   physical book inventory registry (seller_id + book_id + quantity,
   no book data duplicated — see supabase/migrations/
   20260826130000_seller_book_inventory.sql and seller/dashboard.html's
   "📚 الكتب التي لدينا" tab, which is the only place these rows are
   created/edited/deleted). This tab is view/search/filter only: the
   registry is the seller's own bookkeeping, not admin-managed data.
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

  function fmtDate(v) {
    if (!v) return '—';
    return new Date(v).toLocaleString('ar-DZ', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  const ROW_SELECT = `
    id, quantity, created_at, updated_at,
    seller:staff_accounts!seller_book_inventory_seller_id_fkey ( id, full_name, email ),
    book:admin_products_catalog!seller_book_inventory_book_id_fkey ( id, product_name, main_image )
  `;

  let ALL_ROWS   = [];
  let loadedOnce = false;

  /* ══════════════════════════════════════════════════════════
     TOAST — self-contained, same visual language as admin.js's
  ══════════════════════════════════════════════════════════ */
  function showToast(msg, type) {
    const el = document.createElement('div');
    el.className = 'live-toast' + (type === 'error' ? ' error' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  /* ══════════════════════════════════════════════════════════
     FETCH
  ══════════════════════════════════════════════════════════ */
  async function fetchRows() {
    const { data, error } = await sb
      .from('seller_book_inventory')
      .select(ROW_SELECT)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /* ══════════════════════════════════════════════════════════
     FILTER + TOTALS
  ══════════════════════════════════════════════════════════ */
  function getFiltered() {
    const q        = (document.getElementById('sbSearchInput')?.value || '').trim().toLowerCase();
    const sellerId = document.getElementById('sbSellerFilter')?.value || '';

    return ALL_ROWS.filter(r => {
      if (sellerId && r.seller?.id !== sellerId) return false;
      if (!q) return true;
      const hay = [
        r.seller?.full_name, r.seller?.email, r.book?.product_name, String(r.quantity),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function computeTotals(rows) {
    const bySeller = new Map();
    let grandTotal = 0;
    rows.forEach(r => {
      const key   = r.seller?.id || '—';
      const label = r.seller?.full_name || r.seller?.email || 'بائع محذوف';
      const qty   = Number(r.quantity) || 0;
      grandTotal += qty;
      bySeller.set(key, { label, qty: (bySeller.get(key)?.qty || 0) + qty });
    });
    return { bySeller: [...bySeller.values()].sort((a, b) => b.qty - a.qty), grandTotal };
  }

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  function renderSellerFilterOptions() {
    const sel = document.getElementById('sbSellerFilter');
    if (!sel) return;
    const current  = sel.value;
    const sellers  = new Map();
    ALL_ROWS.forEach(r => { if (r.seller?.id) sellers.set(r.seller.id, r.seller.full_name || r.seller.email); });
    sel.innerHTML = `<option value="">📋 كل البائعين</option>` +
      [...sellers.entries()].map(([id, name]) => `<option value="${escAttr(id)}">${esc(name)}</option>`).join('');
    if ([...sellers.keys()].includes(current)) sel.value = current;
  }

  function renderSummary(rows) {
    const box = document.getElementById('sbSummary');
    if (!box) return;
    const { bySeller, grandTotal } = computeTotals(rows);
    if (!bySeller.length) { box.innerHTML = ''; return; }
    box.innerHTML = `
      <span class="sb-summary-total">📦 إجمالي النسخ المسجّلة: <strong>${grandTotal}</strong></span>
      ${bySeller.map(s => `<span class="sb-seller-chip">👤 ${esc(s.label)} — ${s.qty} نسخة</span>`).join('')}
    `;
  }

  function bookThumbHTML(book) {
    return book?.main_image
      ? `<img class="sb-book-thumb" src="${escAttr(book.main_image)}" alt="">`
      : `<div class="sb-book-thumb"></div>`;
  }

  function renderTable(rows) {
    const tbody = document.getElementById('sbTbody');
    const count = document.getElementById('sbCount');
    if (count) count.textContent = rows.length ? `${rows.length} سجل` : '';
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">لا توجد سجلات مطابقة</td></tr>`;
    } else {
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td>${esc(r.seller?.full_name || r.seller?.email || '— بائع محذوف —')}</td>
          <td>
            <div class="sb-book-cell">
              ${bookThumbHTML(r.book)}
              <span>${esc(r.book?.product_name || '— كتاب محذوف —')}</span>
            </div>
          </td>
          <td><strong>${esc(r.quantity)}</strong></td>
          <td style="font-size:12px;color:var(--text-muted);">${esc(fmtDate(r.updated_at))}</td>
          <td><button class="btn-receipt" data-action="sb-view" data-id="${escAttr(r.id)}">عرض</button></td>
        </tr>`).join('');
    }

    const cards = document.getElementById('sbMobileCards');
    if (!cards) return;
    cards.innerHTML = !rows.length
      ? `<div class="empty" style="padding:16px;text-align:center;color:var(--text-muted);">لا توجد سجلات مطابقة</div>`
      : rows.map(r => `
        <div style="background:var(--white);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:10px;">
          <div class="sb-book-cell" style="margin-bottom:8px;">
            ${bookThumbHTML(r.book)}
            <div>
              <div style="font-weight:700;">${esc(r.book?.product_name || '— كتاب محذوف —')}</div>
              <div style="font-size:12px;color:var(--text-muted);">👤 ${esc(r.seller?.full_name || r.seller?.email || '—')}</div>
            </div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <strong>${esc(r.quantity)} نسخة</strong>
            <button class="btn-receipt" data-action="sb-view" data-id="${escAttr(r.id)}">عرض</button>
          </div>
        </div>`).join('');
  }

  function render() {
    const filtered = getFiltered();
    renderSummary(filtered);
    renderTable(filtered);
  }

  /* ══════════════════════════════════════════════════════════
     VIEW DETAIL — reuses the page's existing shared modal
     (#modal/#modalTitle/#modalBody), same overlay admin.js's own
     order/message detail views use. Read-only: no seller inventory
     record can be edited or deleted from the admin side (owned by the
     seller — see supabase/migrations/20260826130000_seller_book_inventory.sql).
  ══════════════════════════════════════════════════════════ */
  function showDetailModal(rowId) {
    const r = ALL_ROWS.find(x => x.id === rowId);
    if (!r) return;
    const modal = document.getElementById('modal');
    const title = document.getElementById('modalTitle');
    const body  = document.getElementById('modalBody');
    const footer = document.getElementById('modalFooter');
    if (!modal || !title || !body) return;

    title.textContent = 'سجل كتاب بائع';
    if (footer) footer.innerHTML = '';
    body.innerHTML = `
      <div class="info-grid">
        <div class="info-item"><span class="i-lbl">البائع</span><span class="i-val">${esc(r.seller?.full_name || '—')}</span></div>
        <div class="info-item"><span class="i-lbl">بريد/حساب البائع</span><span class="i-val">${esc(r.seller?.email || '—')}</span></div>
        <div class="info-item"><span class="i-lbl">الكتاب</span><span class="i-val">${esc(r.book?.product_name || '— كتاب محذوف —')}</span></div>
        <div class="info-item"><span class="i-lbl">الكمية</span><span class="i-val">${esc(r.quantity)}</span></div>
        <div class="info-item"><span class="i-lbl">تاريخ الإضافة</span><span class="i-val" style="font-size:12px;">${esc(fmtDate(r.created_at))}</span></div>
        <div class="info-item"><span class="i-lbl">آخر تحديث</span><span class="i-val" style="font-size:12px;">${esc(fmtDate(r.updated_at))}</span></div>
      </div>
      ${r.book?.main_image ? `<div style="margin-top:16px;text-align:center;"><img src="${escAttr(r.book.main_image)}" alt="" style="max-width:140px;border-radius:8px;border:1px solid var(--border);"></div>` : ''}
    `;
    modal.classList.add('open');
  }

  /* ══════════════════════════════════════════════════════════
     HTML / EVENTS
  ══════════════════════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('sbStyles')) return;
    const style = document.createElement('style');
    style.id = 'sbStyles';
    style.textContent = `
      .sb-summary-row { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
      .sb-summary-total, .sb-seller-chip {
        font-size:12px; font-weight:700; padding:6px 12px; border-radius:99px;
        background:var(--primary-bg,#eff6ff); color:var(--primary,#1d4ed8);
        border:1px solid #bfdbfe;
      }
      .sb-summary-total { background:#0f172a; color:#fff; border-color:#0f172a; }
      .sb-book-cell { display:flex; align-items:center; gap:10px; }
      .sb-book-thumb { width:36px; height:48px; object-fit:cover; border-radius:5px; border:1px solid var(--border); background:var(--bg); flex-shrink:0; }
    `;
    document.head.appendChild(style);
  }

  function injectHTML() {
    const tab = document.getElementById('tab-sellerbooks');
    if (!tab) return;
    tab.innerHTML = `
      <div class="controls-bar">
        <input type="text" class="search-input" id="sbSearchInput" placeholder="🔍 بحث بالبائع أو الكتاب أو الكمية...">
        <select class="filter-select" id="sbSellerFilter">
          <option value="">📋 كل البائعين</option>
        </select>
        <button class="btn-refresh" id="sbRefreshBtn">↻ تحديث</button>
        <span class="orders-count" id="sbCount"></span>
      </div>

      <div class="sb-summary-row" id="sbSummary"></div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>البائع</th>
              <th>الكتاب</th>
              <th>الكمية</th>
              <th>آخر تحديث</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody id="sbTbody">
            <tr><td colspan="5" class="empty">⏳ جاري التحميل...</td></tr>
          </tbody>
        </table>
      </div>

      <div id="sbMobileCards" class="mobile-cards-list"></div>
    `;

    document.getElementById('sbSearchInput').addEventListener('input', render);
    document.getElementById('sbSellerFilter').addEventListener('change', render);
    document.getElementById('sbRefreshBtn').addEventListener('click', async () => {
      const btn = document.getElementById('sbRefreshBtn');
      btn.disabled = true; btn.textContent = '⏳ جاري التحديث...';
      try {
        ALL_ROWS = await fetchRows();
        renderSellerFilterOptions();
        render();
      } catch (err) {
        showToast('❌ فشل التحديث: ' + (err.message || ''), 'error');
      }
      btn.disabled = false; btn.textContent = '↻ تحديث';
    });

    tab.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="sb-view"]');
      if (btn) showDetailModal(btn.dataset.id);
    });
  }

  /* ══════════════════════════════════════════════════════════
     INIT — lazy-loaded on first visit to the tab, same convention
     as admin/bestseller-picks.js.
  ══════════════════════════════════════════════════════════ */
  async function load() {
    loadedOnce = true;
    try {
      ALL_ROWS = await fetchRows();
    } catch (err) {
      console.warn('[seller-books] failed to load:', err.message || err);
      ALL_ROWS = [];
      showToast('❌ تعذّر تحميل كتب البائعين: ' + (err.message || ''), 'error');
    }
    renderSellerFilterOptions();
    render();
  }

  function init() {
    injectStyles();
    injectHTML();
    document.querySelectorAll('.tab-btn[data-tab="sellerbooks"]').forEach(b => {
      b.addEventListener('click', () => { if (!loadedOnce) load(); });
    });
    if (document.getElementById('tab-sellerbooks')?.classList.contains('active')) load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
  } else {
    setTimeout(init, 400);
  }
})();
