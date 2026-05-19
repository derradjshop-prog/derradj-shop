/* ==========================================================
   admin.js — Derradj Shop | Admin Dashboard
   is_confirmed: NULL = قيد المعالجة | true = تم التأكيد
   ========================================================== */

(function () {
  "use strict";

  /* ── Supabase ──────────────────────────────────────────── */
  if (!window.supabase?.createClient) { alert("❌ Supabase غير محمّل."); return; }

  const SUPABASE_URL      = "https://jbmcbjzcedqpvnhbmrhk.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ── State ─────────────────────────────────────────────── */
  let ALL_ORDERS   = [];
  let ACTIVE_ORDER = null;
  let ALL_MESSAGES = [];
  let ALL_PRODUCTS = [];

  /* ── Constants ─────────────────────────────────────────── */
  const PM_LABELS = {
    carte_doree:      "💳 البطاقة الذهبية",
    baridimob:        "📱 BaridiMob",
    ccp:              "🏦 CCP / RIP",
    prepaid:          "💳 دفع مسبق (CCP / BaridiMob)",
    cash_on_delivery: "🚪 دفع عند الاستلام",
  };

  const DT_LABELS = {
    home:   "🏠 توصيل للمنزل",
    office: "📮 استلام من أقرب نقطة توصيل",
  };

  /* ── Helpers ───────────────────────────────────────────── */
  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function fmtDate(v) {
    if (!v) return "—";
    return new Date(v).toLocaleString("ar-DZ", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function fmtMoney(n) {
    return Number(n || 0).toLocaleString("fr-DZ") + " دج";
  }

  /* ─────────────────────────────────────────────────────────
     حالة التأكيد — boolean
     NULL  → قيد المعالجة
     true  → تم التأكيد
  ───────────────────────────────────────────────────────── */
  function confirmBadge(isConfirmed) {
    if (isConfirmed === true) {
      return `<span class="badge badge-confirmed">✅ تم التأكيد</span>`;
    }
    return `<span class="badge badge-pending">⏳ قيد المعالجة</span>`;
  }

  /* ─────────────────────────────────────────────────────────
     AUTH GUARD
  ───────────────────────────────────────────────────────── */
  async function authGuard() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { location.href = "login.html"; return null; }

    const { data: staff, error } = await supabase
      .from("staff_accounts")
      .select("id, full_name, role, is_active")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error || !staff || !staff.is_active || !["admin", "staff"].includes(staff.role)) {
      await supabase.auth.signOut();
      location.href = "login.html";
      return null;
    }
    return staff;
  }

  /* ─────────────────────────────────────────────────────────
     FETCH — الطلبات + منتجاتها في استعلام واحد
  ───────────────────────────────────────────────────────── */
  async function fetchOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id, full_name, phone, address, wilaya, commune,
        delivery_type, shipping_fee, subtotal, total_price,
        payment_method, receipt_url, is_confirmed,
        notes, created_at,
        order_items ( product_name, unit_price, quantity, subtotal )
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    return data || [];
  }

  /* ─────────────────────────────────────────────────────────
     CONFIRM — تحديث is_confirmed إلى true
  ───────────────────────────────────────────────────────── */
  async function confirmOrder(orderId) {
    const { error } = await supabase
      .from("orders")
      .update({ is_confirmed: true })
      .eq("id", orderId);
    if (error) throw error;
  }

  /* ─────────────────────────────────────────────────────────
     DELETE — حذف الطلب (order_items تحذف تلقائياً بـ CASCADE)
  ───────────────────────────────────────────────────────── */
  async function deleteOrder(orderId) {
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);
    if (error) throw error;
  }

  /* ─────────────────────────────────────────────────────────
     FETCH — الرسائل
  ───────────────────────────────────────────────────────── */
  async function fetchMessages() {
    const { data, error } = await supabase
      .from("messages")
      .select("id, name, contact, message, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  }

  /* ─────────────────────────────────────────────────────────
     DELETE MESSAGE
  ───────────────────────────────────────────────────────── */
  async function deleteMessage(msgId) {
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", msgId);
    if (error) throw error;
  }

  /* ─────────────────────────────────────────────────────────
     FILTER MESSAGES
  ───────────────────────────────────────────────────────── */
  function getFilteredMessages() {
    const q = (document.getElementById("msgSearchInput")?.value || "").trim().toLowerCase();
    if (!q) return ALL_MESSAGES;
    return ALL_MESSAGES.filter(m =>
      (m.name    || "").toLowerCase().includes(q) ||
      (m.contact || "").includes(q) ||
      (m.message || "").toLowerCase().includes(q)
    );
  }

  /* ─────────────────────────────────────────────────────────
     RENDER MESSAGES TABLE
  ───────────────────────────────────────────────────────── */
  function renderMessagesTable(messages) {
    const tbody = document.getElementById("msgTbody");
    const cnt   = messages.length;

    document.getElementById("msgCount").textContent =
      cnt + " رسالة" + (cnt !== ALL_MESSAGES.length ? ` (من ${ALL_MESSAGES.length})` : "");
    document.getElementById("tab-badge-messages").textContent = ALL_MESSAGES.length;

    if (!cnt) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty">لا توجد رسائل</td></tr>`;
      return;
    }

    tbody.innerHTML = messages.map(m => `
      <tr data-msg-id="${esc(m.id)}" style="cursor:pointer;">
        <td class="nowrap"><strong>${esc(m.name || "—")}</strong></td>
        <td class="nowrap" style="direction:ltr;">${esc(m.contact || "—")}</td>
        <td><div class="msg-text">${esc(m.message || "—")}</div></td>
        <td class="nowrap" style="font-size:12px;color:var(--text-light);">${esc(fmtDate(m.created_at))}</td>
        <td class="nowrap">
          <div class="actions-col">
            <a href="tel:${esc(m.contact || "")}" class="btn-receipt">📞 اتصال</a>
            <button class="btn-delete" data-msg-id="${esc(m.id)}" data-action="delete-msg">🗑 حذف</button>
          </div>
        </td>
      </tr>`).join("");
  }

  /* ─────────────────────────────────────────────────────────
     HANDLE DELETE MESSAGE
  ───────────────────────────────────────────────────────── */
  async function handleDeleteMessage(msgId, btn) {
    if (!confirm("هل أنت متأكد من حذف هذه الرسالة نهائياً؟")) return;
    btn.disabled    = true;
    btn.textContent = "⏳...";
    try {
      await deleteMessage(msgId);
      ALL_MESSAGES = ALL_MESSAGES.filter(m => m.id !== msgId);
      document.querySelector(`#msgTbody tr[data-msg-id="${msgId}"]`)?.remove();
      renderMessagesTable(getFilteredMessages());
      if (document.getElementById("modal").classList.contains("open")) closeModal();
    } catch (err) {
      console.error("Delete message error:", err);
      alert("❌ خطأ في حذف الرسالة:\n" + (err.message || ""));
      btn.disabled    = false;
      btn.textContent = "🗑 حذف";
    }
  }

  /* ─────────────────────────────────────────────────────────
     SHOW MESSAGE MODAL
  ───────────────────────────────────────────────────────── */
  function showMessageModal(msgId) {
    const msg = ALL_MESSAGES.find(m => m.id === msgId);
    if (!msg) return;
    document.getElementById("modalTitle").textContent = "رسالة من: " + (msg.name || "—");
    document.getElementById("modalBody").innerHTML = `
      <div class="m-section">
        <div class="m-title">معلومات المرسل</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="i-lbl">الاسم</span>
            <span class="i-val">${esc(msg.name || "—")}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">رقم الهاتف</span>
            <span class="i-val" style="direction:ltr;">${esc(msg.contact || "—")}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">التاريخ</span>
            <span class="i-val" style="font-size:12px;">${esc(fmtDate(msg.created_at))}</span>
          </div>
        </div>
      </div>
      <div class="m-section">
        <div class="m-title">نص الرسالة</div>
        <div class="msg-full">${esc(msg.message || "—")}</div>
      </div>
      <div class="m-section">
        <div class="m-title">الإجراءات</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <a href="tel:${esc(msg.contact || "")}" class="btn-receipt" style="font-size:14px;padding:10px 20px;">📞 اتصال</a>
          <button class="btn-delete" data-msg-id="${esc(msg.id)}" data-action="delete-msg"
                  style="font-size:14px;padding:10px 20px;">🗑 حذف الرسالة</button>
        </div>
      </div>`;
    openModal();
  }

  /* ─────────────────────────────────────────────────────────
     STATS — 3 بطاقات فقط
  ───────────────────────────────────────────────────────── */
  function renderStats(orders) {
    const confirmed = orders.filter(o => o.is_confirmed === true).length;
    const pending   = orders.length - confirmed;

    document.getElementById("stat-all").textContent       = orders.length;
    document.getElementById("stat-pending").textContent   = pending;
    document.getElementById("stat-confirmed").textContent = confirmed;
    document.getElementById("tab-badge-orders").textContent = orders.length;
  }

  /* ─────────────────────────────────────────────────────────
     FILTER
  ───────────────────────────────────────────────────────── */
  function getFiltered() {
    const q  = document.getElementById("searchInput").value.trim().toLowerCase();
    const st = document.getElementById("statusFilter").value; /* "pending" | "confirmed" | "" */

    return ALL_ORDERS.filter(o => {
      /* فلترة حسب الحالة */
      if (st === "pending"   && o.is_confirmed === true)  return false;
      if (st === "confirmed" && o.is_confirmed !== true)  return false;

      /* بحث */
      if (!q) return true;
      const products = (o.order_items || []).map(it => it.product_name || "").join(" ").toLowerCase();
      return (o.full_name || "").toLowerCase().includes(q) ||
             (o.phone     || "").includes(q) ||
             (o.wilaya    || "").toLowerCase().includes(q) ||
             (o.commune   || "").toLowerCase().includes(q) ||
             products.includes(q);
    });
  }

  /* ─────────────────────────────────────────────────────────
     RENDER TABLE
  ───────────────────────────────────────────────────────── */
  function renderTable(orders) {
    const tbody = document.getElementById("ordersTbody");
    const cnt   = orders.length;
    document.getElementById("ordersCount").textContent =
      cnt + " طلب" + (cnt !== ALL_ORDERS.length ? ` (من ${ALL_ORDERS.length})` : "");

    if (!cnt) {
      tbody.innerHTML = `<tr><td colspan="11" class="empty">لا توجد طلبات مطابقة</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const items     = o.order_items || [];
      const confirmed = o.is_confirmed === true;

      /* المنتجات: اسم × كمية */
      const productsHTML = items.length
        ? items.map(it =>
            `<span class="product-line">${esc(it.product_name)} <span class="product-qty">× ${esc(it.quantity)}</span></span>`
          ).join("")
        : `<span style="color:var(--text-muted);">—</span>`;

      /* زر وصل الدفع */
      const receiptBtn = o.receipt_url
        ? `<a href="${esc(o.receipt_url)}" target="_blank" rel="noopener" class="btn-receipt">🧾 عرض الوصل</a>`
        : `<span style="color:var(--text-muted);font-size:11px;">لا يوجد وصل</span>`;

      /* زر التأكيد */
      const confirmBtn = confirmed
        ? `<button class="btn-confirm" disabled>✔ تم التأكيد</button>`
        : `<button class="btn-confirm" data-id="${esc(o.id)}" data-action="confirm">✅ تأكيد الطلب</button>`;

      return `
        <tr data-id="${esc(o.id)}">
          <td class="nowrap"><strong>${esc(o.full_name || "—")}</strong></td>
          <td class="nowrap" style="direction:ltr;">${esc(o.phone || "—")}</td>
          <td class="nowrap">${esc(o.wilaya || "—")}</td>
          <td class="nowrap">${esc(o.commune || "—")}</td>
          <td class="td-address">${esc(o.address || "—")}</td>
          <td class="nowrap"><span class="pm-tag">${esc(DT_LABELS[o.delivery_type] || o.delivery_type || "—")}</span></td>
          <td class="td-products">${productsHTML}</td>
          <td class="nowrap">
            <strong style="color:#1d4ed8;">${esc(fmtMoney(o.total_price))}</strong>
            <br><small style="color:var(--text-light);font-size:10px;">${esc(fmtMoney(o.shipping_fee))} توصيل</small>
          </td>
          <td class="nowrap"><span class="pm-tag">${esc(PM_LABELS[o.payment_method] || o.payment_method || "—")}</span></td>
          <td class="nowrap">${confirmBadge(o.is_confirmed)}</td>
          <td class="td-actions">
            <div class="actions-col">
              ${receiptBtn}
              ${confirmBtn}
              <button class="btn-delete" data-id="${esc(o.id)}" data-action="delete">🗑 حذف الطلب</button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  /* ─────────────────────────────────────────────────────────
     HANDLE CONFIRM
  ───────────────────────────────────────────────────────── */
  async function handleConfirm(orderId, btn) {
    btn.disabled    = true;
    btn.textContent = "⏳ جاري التأكيد...";

    try {
      await confirmOrder(orderId);

      /* تحديث الكاش */
      const order = ALL_ORDERS.find(o => o.id === orderId);
      if (order) order.is_confirmed = true;

      /* تحديث الصف مباشرة */
      const row = document.querySelector(`#ordersTbody tr[data-id="${orderId}"]`);
      if (row) {
        row.cells[9].innerHTML = confirmBadge(true);           /* حالة التأكيد */
        btn.textContent = "✔ تم التأكيد";                     /* زر التأكيد */
        btn.removeAttribute("data-action");
      }

      renderStats(ALL_ORDERS);
      if (ACTIVE_ORDER?.id === orderId) { ACTIVE_ORDER.is_confirmed = true; }

    } catch (err) {
      console.error("Confirm error:", err);
      alert("❌ خطأ في تأكيد الطلب:\n" + (err.message || ""));
      btn.disabled    = false;
      btn.textContent = "✅ تأكيد الطلب";
    }
  }

  /* ─────────────────────────────────────────────────────────
     HANDLE DELETE
  ───────────────────────────────────────────────────────── */
  async function handleDelete(orderId, btn) {
    const order = ALL_ORDERS.find(o => o.id === orderId);
    const name  = order?.full_name || "هذا الطلب";

    if (!confirm(`هل أنت متأكد من حذف طلب "${name}"؟\nسيُحذف الطلب ومنتجاته نهائياً ولا يمكن التراجع.`)) return;

    btn.disabled    = true;
    btn.textContent = "⏳...";

    try {
      await deleteOrder(orderId);

      /* إزالة من الكاش والجدول */
      ALL_ORDERS = ALL_ORDERS.filter(o => o.id !== orderId);
      document.querySelector(`#ordersTbody tr[data-id="${orderId}"]`)?.remove();

      /* تحديث العداد والإحصائيات */
      const filtered = getFiltered();
      document.getElementById("ordersCount").textContent =
        filtered.length + " طلب" + (filtered.length !== ALL_ORDERS.length ? ` (من ${ALL_ORDERS.length})` : "");
      renderStats(ALL_ORDERS);

      if (!ALL_ORDERS.length) {
        document.getElementById("ordersTbody").innerHTML =
          `<tr><td colspan="11" class="empty">لا توجد طلبات</td></tr>`;
      }

      if (ACTIVE_ORDER?.id === orderId) closeModal();

    } catch (err) {
      console.error("Delete error:", err);
      alert("❌ خطأ في الحذف:\n" + (err.message || ""));
      btn.disabled    = false;
      btn.textContent = "🗑 حذف الطلب";
    }
  }

  /* ─────────────────────────────────────────────────────────
     MODAL — تفاصيل كاملة
  ───────────────────────────────────────────────────────── */
  function openModal()  { document.getElementById("modal").classList.add("open"); }
  function closeModal() {
    document.getElementById("modal").classList.remove("open");
    ACTIVE_ORDER = null;
  }

  function showOrderModal(orderId) {
    const order = ALL_ORDERS.find(o => o.id === orderId);
    if (!order) return;
    ACTIVE_ORDER = order;
    document.getElementById("modalTitle").textContent = "طلب: " + (order.full_name || "—");
    document.getElementById("modalBody").innerHTML = buildModalHTML(order);
    openModal();
  }

  function buildModalHTML(o) {
    const items      = o.order_items || [];
    const confirmed  = o.is_confirmed === true;

    const itemsHTML = items.length
      ? `<table class="items-table">
           <thead><tr><th>المنتج</th><th>السعر</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
           <tbody>
             ${items.map(it => `
               <tr>
                 <td>${esc(it.product_name)}</td>
                 <td style="direction:ltr;">${esc(fmtMoney(it.unit_price))}</td>
                 <td style="text-align:center;font-weight:800;">${esc(it.quantity)}</td>
                 <td style="direction:ltr;font-weight:800;color:#1d4ed8;">${esc(fmtMoney(it.subtotal))}</td>
               </tr>`).join("")}
           </tbody>
           <tfoot>
             <tr>
               <td colspan="3">مجموع المنتجات</td>
               <td style="direction:ltr;">${esc(fmtMoney(o.subtotal))}</td>
             </tr>
             <tr>
               <td colspan="3">التوصيل</td>
               <td style="direction:ltr;">${esc(fmtMoney(o.shipping_fee))}</td>
             </tr>
             <tr>
               <td colspan="3" style="font-weight:800;">الإجمالي الكلي</td>
               <td style="direction:ltr;font-weight:800;color:#1d4ed8;">${esc(fmtMoney(o.total_price))}</td>
             </tr>
           </tfoot>
         </table>`
      : `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:12px 0;">لا توجد منتجات</p>`;

    const receiptSection = o.receipt_url
      ? `<a href="${esc(o.receipt_url)}" target="_blank" rel="noopener" class="btn-receipt" style="font-size:14px;padding:10px 20px;">
           🧾 فتح وصل الدفع في نافذة جديدة
         </a>`
      : `<span style="color:var(--text-muted);font-size:13px;">لا يوجد وصل دفع مرفوع</span>`;

    const isHomeDelivery = o.delivery_type === "home";
    const addressRow = isHomeDelivery
      ? `<div class="info-item full"><span class="i-lbl">العنوان الكامل</span><span class="i-val" style="white-space:normal;line-height:1.6;">${esc(o.address || "—")}</span></div>`
      : `<div class="info-item full"><span class="i-lbl">نقطة الاستلام (البلدية)</span><span class="i-val">${esc(o.commune || "—")} — ${esc(o.wilaya || "—")}</span></div>`;

    return `
      <div class="m-section">
        <div class="m-title">معلومات الزبون والتوصيل</div>
        <div class="info-grid">
          <div class="info-item"><span class="i-lbl">الاسم الكامل</span><span class="i-val">${esc(o.full_name || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">رقم الهاتف</span><span class="i-val" style="direction:ltr;">${esc(o.phone || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">الولاية</span><span class="i-val">${esc(o.wilaya || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">البلدية / المدينة</span><span class="i-val">${esc(o.commune || "—")}</span></div>
          <div class="info-item full"><span class="i-lbl">طريقة التوصيل</span><span class="i-val"><strong>${esc(DT_LABELS[o.delivery_type] || o.delivery_type || "—")}</strong></span></div>
          ${addressRow}
          <div class="info-item"><span class="i-lbl">سعر التوصيل</span><span class="i-val" style="direction:ltr;font-weight:700;color:#059669;">${esc(fmtMoney(o.shipping_fee))}</span></div>
          <div class="info-item"><span class="i-lbl">طريقة الدفع</span><span class="i-val">${esc(PM_LABELS[o.payment_method] || o.payment_method || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">تاريخ الطلب</span><span class="i-val" style="font-size:12px;">${esc(fmtDate(o.created_at))}</span></div>
        </div>
      </div>

      <div class="m-section">
        <div class="m-title">المنتجات المطلوبة</div>
        ${itemsHTML}
      </div>

      <div class="m-section">
        <div class="m-title">وصل الدفع</div>
        ${receiptSection}
      </div>

      ${o.notes ? `
      <div class="m-section">
        <div class="m-title">ملاحظات الزبون</div>
        <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:14px;font-size:14px;color:#78350f;line-height:1.7;">${esc(o.notes)}</div>
      </div>` : ""}

      <div class="m-section">
        <div class="m-title">الإجراءات</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <span>الحالة: ${confirmBadge(o.is_confirmed)}</span>
          ${confirmed
            ? `<button class="btn-confirm" disabled style="font-size:14px;padding:10px 22px;">✔ تم التأكيد</button>`
            : `<button class="btn-confirm" data-id="${esc(o.id)}" data-action="confirm"
                       style="font-size:14px;padding:10px 22px;">✅ تأكيد الطلب</button>`
          }
          <button class="btn-delete" data-id="${esc(o.id)}" data-action="delete"
                  style="font-size:14px;padding:10px 22px;">🗑 حذف الطلب</button>
        </div>
      </div>`;
  }

  /* ─────────────────────────────────────────────────────────
     PRODUCTS — قائمة الكتب من SHOP_CATALOG المدمجة مع Supabase
  ───────────────────────────────────────────────────────── */

  /* بيانات المنتجات الثابتة (للصورة والتصنيف) */
  const BOOKS_META = [
    { catalogId: 2,  price: 1400, category: 'تطوير الذات',        image: 'https://www.derradjshop.com/books/7-habits/main.png' },
    { catalogId: 3,  price: 950,  category: 'تطوير الذات',        image: 'https://www.derradjshop.com/books/atomic-habits/main.png' },
    { catalogId: 4,  price: 1350, category: 'تطوير الذات',        image: 'https://www.derradjshop.com/books/rule-333/main.png' },
    { catalogId: 5,  price: 1200, category: 'تطوير الذات',        image: 'https://www.derradjshop.com/books/small-habits-revolution/main.png' },
    { catalogId: 6,  price: 900,  category: 'تطوير الذات',        image: 'https://www.derradjshop.com/books/joy-of-imperfection/main.png' },
    { catalogId: 7,  price: 1300, category: 'الفلسفة والفكر',     image: 'https://www.derradjshop.com/books/courage-is-calling/main.png' },
    { catalogId: 8,  price: 1100, category: 'الفلسفة والفكر',     image: 'https://www.derradjshop.com/books/power-of-now/main.png' },
    { catalogId: 9,  price: 1100, category: 'علم النفس والمجتمع', image: 'https://www.derradjshop.com/books/propaganda/main.png' },
    { catalogId: 10, price: 1600, category: 'الإدارة والأعمال',   image: 'https://www.derradjshop.com/books/management-mess/main.png' },
    { catalogId: 11, price: 1600, category: 'علم النفس والمجتمع', image: 'https://www.derradjshop.com/books/myths-of-happiness/main.png' },
    { catalogId: 12, price: 1300, category: 'علم النفس والمجتمع', image: 'https://www.derradjshop.com/books/happy-ever-after/main.png' },
    { catalogId: 13, price: 1800, category: 'علم النفس والمجتمع', image: 'https://www.derradjshop.com/books/hungry-ghosts/main.png' },
    { catalogId: 14, price: 1200, category: 'العلوم والمعرفة',    image: 'https://www.derradjshop.com/books/brief-history-of-time/main.png' },
    { catalogId: 16, price: 950,  category: 'تطوير الذات',        image: 'https://www.derradjshop.com/books/joy-of-thirties/main.png' },
    { catalogId: 17, price: 1200, category: 'العلاقات والحياة',   image: 'https://www.derradjshop.com/books/be-happy-with-someone/main.png' },
    { catalogId: 20, price: 1600, category: 'علم النفس والمجتمع', image: 'https://www.derradjshop.com/books/emotional-intelligence/main.png' },
    { catalogId: 21, price: 1100, category: 'الإدارة والأعمال',   image: 'https://www.derradjshop.com/books/sell-anything/main.png' },
  ];

  /* جلب حالة التوفر من Supabase */
  async function fetchProducts() {
    const { data, error } = await supabase
      .from("product_availability")
      .select("catalog_id, name, available")
      .order("catalog_id");
    if (error) throw error;
    return (data || []).map(row => {
      const meta = BOOKS_META.find(m => m.catalogId === row.catalog_id) || {};
      return {
        catalogId: row.catalog_id,
        name:      row.name,
        available: row.available,
        category:  meta.category || '—',
        price:     meta.price    || null,
        image:     meta.image    || '',
      };
    });
  }

  /* تحديث حالة التوفر في Supabase */
  async function setProductAvailability(catalogId, available) {
    const { error } = await supabase
      .from("product_availability")
      .update({ available, updated_at: new Date().toISOString() })
      .eq("catalog_id", catalogId);
    if (error) throw error;
  }

  /* عرض جدول المنتجات */
  function renderProductsTable(products) {
    const tbody = document.getElementById("productsTbody");
    const cnt   = products.length;
    document.getElementById("productsCount").textContent = cnt + " منتج";
    document.getElementById("tab-badge-products").textContent = cnt;

    if (!cnt) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">لا توجد منتجات — تأكد من تشغيل supabase-setup-products.sql</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(p => `
      <tr data-catalog-id="${p.catalogId}">
        <td>
          ${p.image
            ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" class="prod-thumb"
                   onerror="this.style.display='none'">`
            : '<span style="font-size:24px;">📚</span>'
          }
        </td>
        <td><strong>${esc(p.name)}</strong></td>
        <td class="nowrap" style="color:var(--primary);font-weight:800;" dir="ltr">
          ${p.price ? p.price.toLocaleString("fr-DZ") + " دج" : "—"}
        </td>
        <td class="nowrap">
          <span class="pm-tag">${esc(p.category)}</span>
        </td>
        <td class="nowrap">
          <span class="avail-status ${p.available ? 'is-avail' : 'not-avail'}">
            ${p.available ? '✅ متوفر' : '⚠️ غير متوفر حاليا'}
          </span>
        </td>
        <td class="nowrap">
          <label class="avail-toggle" title="${p.available ? 'اضغط لإيقاف التوفر' : 'اضغط لتفعيل التوفر'}">
            <input type="checkbox" data-action="toggle-avail" data-catalog-id="${p.catalogId}"
                   ${p.available ? 'checked' : ''}>
            <span class="avail-slider"></span>
          </label>
        </td>
      </tr>`).join("");
  }

  /* معالجة تغيير التوفر */
  async function handleToggleAvailability(catalogId, newValue, checkbox) {
    checkbox.disabled = true;

    try {
      await setProductAvailability(catalogId, newValue);

      /* تحديث الكاش */
      const p = ALL_PRODUCTS.find(p => p.catalogId === catalogId);
      if (p) p.available = newValue;

      /* تحديث الصف في الجدول */
      const row = document.querySelector(`#productsTbody tr[data-catalog-id="${catalogId}"]`);
      if (row) {
        const badge = row.querySelector(".avail-status");
        if (badge) {
          badge.className = `avail-status ${newValue ? 'is-avail' : 'not-avail'}`;
          badge.textContent = newValue ? '✅ متوفر' : '⚠️ غير متوفر حاليا';
        }
      }

    } catch (err) {
      console.error("Toggle availability error:", err);
      /* إعادة القيمة السابقة إذا فشل التحديث */
      checkbox.checked = !newValue;
      alert("❌ فشل تحديث حالة التوفر:\n" + (err.message || "تحقق من صلاحيات قاعدة البيانات."));
    }

    checkbox.disabled = false;
  }

  /* ─────────────────────────────────────────────────────────
     EVENTS
  ───────────────────────────────────────────────────────── */
  function bindEvents() {

    document.getElementById("logoutBtn").addEventListener("click", async () => {
      await supabase.auth.signOut();
      location.href = "login.html";
    });

    /* ── Tab switching ─────────────────────────────────────── */
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-" + tab).classList.add("active");
        document.getElementById("pageTitle").textContent =
          tab === "orders"   ? "📦 إدارة الطلبات"
        : tab === "messages" ? "✉️ الرسائل الواردة"
        : "📚 إدارة المنتجات";
      });
    });

    /* ── Messages search & refresh ─────────────────────────── */
    document.getElementById("msgSearchInput").addEventListener("input",
      () => renderMessagesTable(getFilteredMessages()));

    document.getElementById("msgRefreshBtn").addEventListener("click", async () => {
      const btn = document.getElementById("msgRefreshBtn");
      btn.disabled = true; btn.textContent = "⏳ جاري التحديث...";
      try {
        ALL_MESSAGES = await fetchMessages();
        renderMessagesTable(getFilteredMessages());
      } catch (err) { alert("❌ فشل التحديث: " + (err.message || "")); }
      btn.disabled = false; btn.textContent = "↻ تحديث";
    });

    /* ── Messages table — click row to open modal, delete ──── */
    document.getElementById("msgTbody").addEventListener("click", async e => {
      const deleteBtn = e.target.closest("[data-action='delete-msg']");
      if (deleteBtn) {
        await handleDeleteMessage(deleteBtn.dataset.msgId, deleteBtn);
        return;
      }
      const row = e.target.closest("tr[data-msg-id]");
      if (row) showMessageModal(row.dataset.msgId);
    });

    /* ── Modal body — delete message ──────────────────────── */

    document.getElementById("modalClose").addEventListener("click", closeModal);
    document.getElementById("modal").addEventListener("click", e => {
      if (e.target.id === "modal") closeModal();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

    document.getElementById("searchInput").addEventListener("input",  () => renderTable(getFiltered()));
    document.getElementById("statusFilter").addEventListener("change", () => renderTable(getFiltered()));

    document.getElementById("refreshBtn").addEventListener("click", async () => {
      const btn = document.getElementById("refreshBtn");
      btn.disabled = true; btn.textContent = "⏳ جاري التحديث...";
      try {
        ALL_ORDERS = await fetchOrders();
        renderStats(ALL_ORDERS);
        renderTable(getFiltered());
      } catch (err) { alert("❌ فشل التحديث: " + (err.message || "")); }
      btn.disabled = false; btn.textContent = "↻ تحديث";
    });

    /* Event delegation — جدول الطلبات */
    document.getElementById("ordersTbody").addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "confirm") await handleConfirm(btn.dataset.id, btn);
      if (btn.dataset.action === "delete")  await handleDelete(btn.dataset.id, btn);
    });

    /* Event delegation — المودال */
    document.getElementById("modalBody").addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "confirm")    await handleConfirm(btn.dataset.id, btn);
      if (btn.dataset.action === "delete")     await handleDelete(btn.dataset.id, btn);
      if (btn.dataset.action === "delete-msg") await handleDeleteMessage(btn.dataset.msgId, btn);
    });

    /* ── Products — تحديث التوفر عبر Toggle ───────────────── */
    document.getElementById("productsTbody").addEventListener("change", async e => {
      const cb = e.target.closest('input[data-action="toggle-avail"]');
      if (!cb) return;
      const catalogId = parseInt(cb.dataset.catalogId);
      await handleToggleAvailability(catalogId, cb.checked, cb);
    });

    document.getElementById("productsRefreshBtn").addEventListener("click", async () => {
      const btn = document.getElementById("productsRefreshBtn");
      btn.disabled = true; btn.textContent = "⏳ جاري التحديث...";
      try {
        ALL_PRODUCTS = await fetchProducts();
        renderProductsTable(ALL_PRODUCTS);
      } catch (err) { alert("❌ فشل تحديث المنتجات: " + (err.message || "")); }
      btn.disabled = false; btn.textContent = "↻ تحديث";
    });
  }

  /* ─────────────────────────────────────────────────────────
     BOOT
  ───────────────────────────────────────────────────────── */
  async function boot() {
    try {
      const staff = await authGuard();
      if (!staff) return;

      document.getElementById("adminBadge").textContent =
        (staff.role === "admin" ? "👑 Admin" : "👤 Staff") +
        (staff.full_name ? " — " + staff.full_name : "");

      [ALL_ORDERS, ALL_MESSAGES, ALL_PRODUCTS] = await Promise.all([
        fetchOrders(), fetchMessages(), fetchProducts().catch(() => []),
      ]);
      renderStats(ALL_ORDERS);
      renderTable(ALL_ORDERS);
      renderMessagesTable(ALL_MESSAGES);
      renderProductsTable(ALL_PRODUCTS);
      bindEvents();

    } catch (err) {
      console.error("Boot error:", err);
      alert("❌ خطأ في تحميل لوحة التحكم:\n" + (err.message || JSON.stringify(err)));
    }
  }

  boot();

})();
