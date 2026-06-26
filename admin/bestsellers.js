/* ==========================================================
   bestsellers.js — Derradj Shop | 📚 الكتب المباعة
   Reads order_items ONLY (product_name, quantity), groups by
   product_name and sums quantity client-side, sorted desc.
   No views, no RPC, no joins, no other tables.
   ========================================================== */
(function () {
  'use strict';

  const SUPABASE_URL     = 'https://jbmcbjzcedqpvnhbmrhk.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk';

  if (!window.supabase?.createClient) return;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
      </div>`;
    document.getElementById('bsRefreshBtn').addEventListener('click', load);
  }

  function render(list) {
    const tbody = document.getElementById('bsTbody');
    if (!tbody) return;
    document.getElementById('bsCount').textContent = list.length + ' كتاب';

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="3" class="empty">لا توجد مبيعات بعد</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((row, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(row.product_name)}</td>
        <td><strong>${row.sold.toLocaleString('en-US')}</strong></td>
      </tr>`).join('');
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
    injectHTML();
    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 400));
  } else {
    setTimeout(init, 400);
  }

})();
