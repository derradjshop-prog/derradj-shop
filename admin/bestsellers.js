/* ==========================================================
   bestsellers.js — Derradj Shop | 📚 الكتب المباعة
   Reads order_items ONLY (product_name, quantity), groups by
   product_name and sums quantity client-side, sorted desc.
   No views, no RPC, no joins, no other tables.
   ========================================================== */
(function () {
  'use strict';

  /* Shared client (see supabase-client.js) — reused instead of creating a
     third GoTrueClient instance on this page (see admin.js for why). */
  if (!window.sbClient) return;
  const sb = window.sbClient;

  function esc(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  }

  /* ── Fetch every row from order_items (paginated — PostgREST caps
     a single request at 1000 rows, and this must read all of them) ── */
  async function fetchAllOrderItems() {
    const PAGE = 1000;
    let from = 0;
    let rows = [];
    while (true) {
      const { data, error } = await sb
        .from('order_items')
        .select('product_name, quantity')
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows = rows.concat(data || []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return rows;
  }

  /* ── Group by product_name, sum quantity, sort desc ── */
  function computeBestsellers(rows) {
    const sums = new Map();
    for (const r of rows) {
      const name = r.product_name;
      const qty  = Number(r.quantity) || 0;
      sums.set(name, (sums.get(name) || 0) + qty);
    }
    return [...sums.entries()]
      .map(([product_name, sold]) => ({ product_name, sold }))
      .sort((a, b) => b.sold - a.sold);
  }

  function injectStyles() {
    const s = document.createElement('style');
    s.id = 'bs-styles';
    s.textContent = `
    .m-bs-card {
      display:flex; align-items:center; gap:12px;
      background:#fff; border:1px solid #e2e8f0; border-radius:14px;
      padding:12px 14px; box-shadow:0 1px 3px rgba(0,0,0,.08);
    }
    .m-bs-rank {
      flex-shrink:0; width:28px; height:28px; border-radius:50%;
      background:#eff6ff; color:#1d4ed8; font-weight:800; font-size:13px;
      display:flex; align-items:center; justify-content:center;
    }
    .m-bs-name { flex:1; min-width:0; font-size:14px; font-weight:700; color:#1e293b; word-break:break-word; }
    .m-bs-sold {
      flex-shrink:0; background:#eff6ff; color:#1d4ed8;
      font-weight:800; font-size:13px; padding:4px 10px; border-radius:99px;
      white-space:nowrap;
    }
    `;
    document.head.appendChild(s);
  }

  function injectHTML() {
    const tab = document.getElementById('tab-bestsellers');
    if (!tab) return;
    tab.innerHTML = `
      <div class="controls-bar">
        <button class="btn-refresh" id="bsRefreshBtn">↻ تحديث</button>
        <span class="orders-count" id="bsCount"></span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>الكتاب</th>
              <th>الكمية المباعة</th>
            </tr>
          </thead>
          <tbody id="bsTbody">
            <tr><td colspan="3" class="empty">⏳ جاري التحميل...</td></tr>
          </tbody>
        </table>
      </div>
      <div class="mobile-cards-list" id="bsMobileCards"></div>`;
    document.getElementById('bsRefreshBtn').addEventListener('click', load);
  }

  function render(list) {
    const tbody  = document.getElementById('bsTbody');
    const mcards = document.getElementById('bsMobileCards');
    if (!tbody) return;
    document.getElementById('bsCount').textContent = list.length + ' كتاب';

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty">لا توجد مبيعات بعد</td></tr>`;
      if (mcards) mcards.innerHTML = `<div class="empty">لا توجد مبيعات بعد</div>`;
      return;
    }

    tbody.innerHTML = list.map((row, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(row.product_name)}</td>
        <td><strong>${row.sold.toLocaleString('en-US')}</strong></td>
      </tr>`).join('');

    if (mcards) {
      mcards.innerHTML = list.map((row, i) => `
        <div class="m-bs-card">
          <span class="m-bs-rank">${i + 1}</span>
          <span class="m-bs-name">${esc(row.product_name)}</span>
          <span class="m-bs-sold">${row.sold.toLocaleString('en-US')}</span>
        </div>`).join('');
    }
  }

  async function load() {
    const btn = document.getElementById('bsRefreshBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التحديث...'; }
    try {
      const rows = await fetchAllOrderItems();
      render(computeBestsellers(rows));
    } catch (err) {
      const tbody = document.getElementById('bsTbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="empty">❌ فشل التحميل: ${esc(err.message || '')}</td></tr>`;
    }
    if (btn) { btn.disabled = false; btn.textContent = '↻ تحديث'; }
  }

  async function init() {
    injectStyles();
    injectHTML();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
  } else {
    setTimeout(init, 400);
  }

})();
