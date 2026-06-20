/* ==========================================================
   admin.js — Derradj Shop | Admin Dashboard
   is_confirmed: NULL = قيد المعالجة | true = تم التأكيد
   BUILD: 2026-06-01-v6
   - Reads category + price FROM Supabase (after running SQL setup)
   - Electronics always visible even before SQL is run (BOOKS_META fallback)
   - upsert replaces update/insert everywhere to avoid silent failures
   ========================================================== */
console.log('[admin.js] loaded — BUILD 2026-06-01-v6 — DB-driven category + price, upsert everywhere');

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
  let ALL_REVIEWS  = [];
  let EDIT_REVIEW_ID    = null;
  let prodFilterCurrent = 'all';   /* 'all' | 'books' | 'electronics' */
  let PROD_SEARCH_QUERY = '';
  let CURRENT_ROLE = 'staff';
  let CURRENT_STAFF_EMAIL = '';
  let LIMITED_STAFF_MODE = false;
  const LIMITED_STAFF_EMAIL = '0696234484@derradjshop.com';

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
    if (isLimitedStaffMode()) return "—";
    return Number(n || 0).toLocaleString("fr-DZ") + " دج";
  }

  function isLimitedStaffMode() {
    return LIMITED_STAFF_MODE === true;
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
      .select("id, email, full_name, role, is_active")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error || !staff || !staff.is_active || !["admin", "staff"].includes(String(staff.role || "").toLowerCase())) {
      await supabase.auth.signOut();
      location.href = "login.html";
      return null;
    }
    return staff;
  }

  /* ─────────────────────────────────────────────────────────
     FETCH — الطلبات + منتجاتها في استعلام واحد
  ───────────────────────────────────────────────────────── */
  async function fetchOrders(limitedOnly = false) {
    const moneyFields = limitedOnly
      ? ``
      : `shipping_fee, subtotal, total_price,`;
    const itemMoneyFields = limitedOnly ? `` : `, unit_price, subtotal`;
    let query = supabase
      .from("orders")
      .select(`
        id, full_name, phone, address, wilaya, commune,
        delivery_type, ${moneyFields}
        payment_method, receipt_url, is_confirmed,
        notes, created_at,
        order_items ( product_name, quantity${itemMoneyFields} )
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    if (limitedOnly) {
      // Limited staff mode should only see pending/unconfirmed orders.
      // In this project, pending orders are stored as is_confirmed = null.
      query = query.is("is_confirmed", null);
    }

    const { data, error } = await query;
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
    renderMsgMobileCards(messages);
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
      document.querySelector(`#msgMobileCards [data-msg-id="${msgId}"]`)?.remove();
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
    /* الشارة تُظهر الطلبات غير المؤكدة فقط — يعني ما يحتاج متابعة */
    document.getElementById("tab-badge-orders").textContent = pending;
  }

  /* ─────────────────────────────────────────────────────────
     MOBILE CARDS — Orders
  ───────────────────────────────────────────────────────── */
  function renderOrdersMobileCards(orders) {
    const container = document.getElementById("ordersMobileCards");
    if (!container) return;

    if (!orders.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:15px;">لا توجد طلبات مطابقة</div>`;
      return;
    }

    container.innerHTML = orders.map(o => {
      const items    = o.order_items || [];
      const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      return `
        <div class="m-order-card" data-id="${esc(o.id)}">
          <div class="m-card-top">
            <div class="m-order-name">${esc(o.full_name || "—")}</div>
            ${confirmBadge(o.is_confirmed)}
          </div>
          <div class="m-order-phone" dir="ltr">${esc(o.phone || "—")}</div>
          <div class="m-order-meta">
            <span class="m-order-total">${esc(fmtMoney(o.total_price))}</span>
            <span class="m-order-count">${totalQty} كتب</span>
          </div>
          <button class="btn-details" data-id="${esc(o.id)}" data-action="details">عرض التفاصيل الكاملة</button>
        </div>`;
    }).join("");
  }

  /* ─────────────────────────────────────────────────────────
     MOBILE CARDS — Messages
  ───────────────────────────────────────────────────────── */
  function renderMsgMobileCards(messages) {
    const container = document.getElementById("msgMobileCards");
    if (!container) return;

    if (!messages.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:15px;">لا توجد رسائل</div>`;
      return;
    }

    container.innerHTML = messages.map(m => `
      <div class="m-msg-card" data-msg-id="${esc(m.id)}">
        <div class="m-msg-top">
          <span class="m-msg-name">${esc(m.name || "—")}</span>
          <span class="m-msg-date">${esc(fmtDate(m.created_at))}</span>
        </div>
        <div class="m-msg-phone" dir="ltr">${esc(m.contact || "—")}</div>
        <div class="m-msg-preview">${esc(m.message || "—")}</div>
        <div class="m-msg-actions">
          <a href="tel:${esc(m.contact || "")}" class="btn-receipt">📞 اتصال</a>
          <button class="btn-delete" data-msg-id="${esc(m.id)}" data-action="delete-msg">🗑 حذف</button>
        </div>
      </div>`).join("");
  }

  /* ─────────────────────────────────────────────────────────
     MOBILE CARDS — Products
  ───────────────────────────────────────────────────────── */
  function renderProductsMobileCards(products) {
    const container = document.getElementById("productsMobileCards");
    if (!container) return;

    if (!products.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:15px;">لا توجد منتجات</div>`;
      return;
    }

    container.innerHTML = products.map(p => `
      <div class="m-product-card" data-catalog-id="${p.catalogId}">
        ${p.image
          ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" class="m-prod-img"
                 loading="lazy" decoding="async"
                 onerror="if(!this.dataset.f){this.dataset.f='1';this.src=this.src.replace('main.webp','main.png')}else{this.style.display='none';this.insertAdjacentHTML('afterend','<span style=\\'font-size:32px;flex-shrink:0;line-height:1;\\'>📚</span>')}">`
          : '<span style="font-size:32px;flex-shrink:0;line-height:1;">📚</span>'
        }
        <div class="m-prod-body">
          <div class="m-prod-name">${esc(p.name)}</div>
          <div class="m-prod-cat">${esc(p.category)}</div>
          <div class="m-prod-bottom">
            <span class="m-prod-price" dir="ltr">${p.price ? p.price.toLocaleString("fr-DZ") + " دج" : "—"}</span>
            <span class="avail-status ${p.available ? 'is-avail' : 'not-avail'}">
              ${p.available ? '✅ متوفر' : '⚠️ نفذت الكمية مؤقتًا'}
            </span>
            <label class="avail-toggle" title="${p.available ? 'إيقاف التوفر' : 'تفعيل التوفر'}">
              <input type="checkbox" data-action="toggle-avail" data-catalog-id="${p.catalogId}"
                     ${p.available ? 'checked' : ''}>
              <span class="avail-slider"></span>
            </label>
          </div>
        </div>
      </div>`).join("");
  }

  /* ─────────────────────────────────────────────────────────
     FILTER
  ───────────────────────────────────────────────────────── */
  function getFiltered() {
    const q  = document.getElementById("searchInput").value.trim().toLowerCase();
    const st = document.getElementById("statusFilter").value; /* "pending" | "confirmed" | "" */

    return ALL_ORDERS.filter(o => {
      if (isLimitedStaffMode() && o.is_confirmed === true) return false;

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
    renderOrdersMobileCards(orders);
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

      /* المنتجات: ملخص مضغوط + زر التفاصيل */
      const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      let productsHTML;
      if (!items.length) {
        productsHTML = `<span style="color:var(--text-muted);">—</span>`;
      } else if (items.length === 1) {
        const it = items[0];
        productsHTML = `<span class="product-summary">${esc(it.product_name)} <span class="product-qty">× ${esc(it.quantity)}</span></span>
          <button class="btn-tbl-details" data-id="${esc(o.id)}" data-action="details">تفاصيل</button>`;
      } else {
        productsHTML = `<span class="product-summary"><strong>${items.length} منتجات</strong> · ${totalQty} قطعة</span>
          <button class="btn-tbl-details" data-id="${esc(o.id)}" data-action="details">تفاصيل</button>`;
      }

      /* زر وصل الدفع */
      const receiptBtn = o.receipt_url
        ? `<a href="${esc(o.receipt_url)}" target="_blank" rel="noopener" class="btn-receipt">🧾 عرض الوصل</a>`
        : `<span style="color:var(--text-muted);font-size:11px;">لا يوجد وصل</span>`;

      /* زر التأكيد */
      const confirmBtn = confirmed
        ? `<button class="btn-confirm" disabled>✔ تم التأكيد</button>`
        : isLimitedStaffMode()
          ? ``
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
              ${isLimitedStaffMode() ? `` : `<button class="btn-delete" data-id="${esc(o.id)}" data-action="delete">🗑 حذف الطلب</button>`}
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

      /* تحديث الإحصائيات (الشارة تنقص واحدة) */
      renderStats(ALL_ORDERS);

      /* إعادة عرض الجدول حسب الفلتر الحالي:
         - إذا كان الفلتر "pending" → الطلب يختفي من القائمة تلقائياً
         - إذا كان "confirmed" أو "كل الطلبات" → يبقى ظاهراً بحالته الجديدة */
      renderTable(getFiltered());

      /* تحديث المودال إذا كان مفتوحاً لنفس الطلب */
      if (ACTIVE_ORDER?.id === orderId) {
        ACTIVE_ORDER.is_confirmed = true;
        document.getElementById("modalBody").innerHTML = buildModalHTML(ACTIVE_ORDER);
      }

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

      /* إزالة من الكاش */
      ALL_ORDERS = ALL_ORDERS.filter(o => o.id !== orderId);

      /* تحديث الإحصائيات والجدول حسب الفلتر الحالي */
      renderStats(ALL_ORDERS);
      renderTable(getFiltered());

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
    const items     = o.order_items || [];
    const confirmed = o.is_confirmed === true;
    const isHome    = o.delivery_type === "home";

    /* ── Products rows ── */
    const productsHTML = items.length
      ? items.map(it => `
          <div class="prod-row">
            <span class="prod-name">${esc(it.product_name)}</span>
            <span class="prod-qty">× ${esc(it.quantity)}</span>
            <span class="prod-sub">${esc(fmtMoney(it.subtotal))}</span>
          </div>`).join("")
      : `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:10px 0;">لا توجد منتجات</p>`;

    /* ── Receipt ── */
    const receiptHTML = o.receipt_url
      ? `<a href="${esc(o.receipt_url)}" target="_blank" rel="noopener" class="btn-receipt"
            style="display:inline-flex;margin-bottom:14px;">🧾 فتح وصل الدفع</a>`
      : ``;

    /* ── Action buttons ── */
    const confirmBtn = confirmed
      ? `<button class="btn-confirm" disabled>✔ تم التأكيد</button>`
      : isLimitedStaffMode()
        ? ``
        : `<button class="btn-confirm" data-id="${esc(o.id)}" data-action="confirm">✅ تأكيد الطلب</button>`;

    return `
      <!-- Customer & delivery info -->
      <div class="detail-rows">
        <div class="detail-row">
          <span class="dr-key">الاسم</span>
          <span class="dr-val">${esc(o.full_name || "—")}</span>
        </div>
        <div class="detail-row">
          <span class="dr-key">الهاتف</span>
          <span class="dr-val" dir="ltr">${esc(o.phone || "—")}</span>
        </div>
        <div class="detail-row">
          <span class="dr-key">الولاية</span>
          <span class="dr-val">${esc(o.wilaya || "—")} · ${esc(o.commune || "—")}</span>
        </div>
        ${isHome ? `
        <div class="detail-row">
          <span class="dr-key">العنوان</span>
          <span class="dr-val">${esc(o.address || "—")}</span>
        </div>` : ""}
        <div class="detail-row">
          <span class="dr-key">التوصيل</span>
          <span class="dr-val">${esc(DT_LABELS[o.delivery_type] || o.delivery_type || "—")}</span>
        </div>
        <div class="detail-row">
          <span class="dr-key">طريقة الدفع</span>
          <span class="dr-val">${esc(PM_LABELS[o.payment_method] || o.payment_method || "—")}</span>
        </div>
        <div class="detail-row">
          <span class="dr-key">الحالة</span>
          <span class="dr-val">${confirmBadge(o.is_confirmed)}</span>
        </div>
        <div class="detail-row">
          <span class="dr-key">التاريخ</span>
          <span class="dr-val" style="font-size:12px;">${esc(fmtDate(o.created_at))}</span>
        </div>
      </div>

      <!-- Products -->
      <p class="modal-sec-lbl">المنتجات المطلوبة</p>
      <div class="modal-products">${productsHTML}</div>

      <!-- Totals -->
      <div class="modal-totals">
        <div class="total-row">
          <span>مجموع المنتجات</span>
          <span class="total-val">${esc(fmtMoney(o.subtotal))}</span>
        </div>
        <div class="total-row">
          <span>التوصيل</span>
          <span class="total-val" style="color:#059669;">${esc(fmtMoney(o.shipping_fee))}</span>
        </div>
        <div class="total-row grand">
          <span>الإجمالي الكلي</span>
          <span class="total-val">${esc(fmtMoney(o.total_price))}</span>
        </div>
      </div>

      ${receiptHTML}

      ${o.notes ? `
      <p class="modal-sec-lbl">ملاحظات الزبون</p>
      <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px;
                  font-size:13px;color:#78350f;line-height:1.6;margin-bottom:14px;">
        ${esc(o.notes)}
      </div>` : ""}

      <!-- Actions -->
      <div class="modal-actions">
        ${confirmBtn}
        ${isLimitedStaffMode() ? `` : `<button class="btn-delete" data-id="${esc(o.id)}" data-action="delete">🗑 حذف الطلب</button>`}
      </div>`;
  }

  /* ─────────────────────────────────────────────────────────
     PRODUCTS — قائمة الكتب من SHOP_CATALOG المدمجة مع Supabase
  ───────────────────────────────────────────────────────── */

  /* ─────────────────────────────────────────────────────────
     بيانات المنتجات الثابتة (للصورة والتصنيف)
     المسار النسبي: ../books/{folder}/main.webp
     (يعمل من /admin/ سواء محلياً أو على الخادم المباشر)
  ───────────────────────────────────────────────────────── */
  const BOOKS_META = [
    /* ── IDs 2–42 ── */
    { catalogId: 2,  price: 1400, category: 'تطوير الذات',        image: '../books/7-habits/main.webp' },
    { catalogId: 3,  price: 950,  category: 'تطوير الذات',        image: '../books/atomic-habits/main.webp' },
    { catalogId: 4,  price: 1350, category: 'تطوير الذات',        image: '../books/rule-333/main.webp' },
    { catalogId: 6,  price: 1800, category: 'تطوير الذات',        image: '../books/joy-of-imperfection/main.webp' },
    { catalogId: 7,  price: 1300, category: 'الفلسفة والفكر',     image: '../books/courage-is-calling/main.webp' },
    { catalogId: 8,  price: 1100, category: 'الفلسفة والفكر',     image: '../books/power-of-now/main.webp' },
    { catalogId: 9,  price: 1100, category: 'علم النفس والمجتمع', image: '../books/propaganda/main.webp' },
    { catalogId: 10, price: 1600, category: 'الإدارة والأعمال',   image: '../books/management-mess/main.webp' },
    { catalogId: 11, price: 1600, category: 'علم النفس والمجتمع', image: '../books/myths-of-happiness/main.webp' },
    { catalogId: 12, price: 1300, category: 'علم النفس والمجتمع', image: '../books/happy-ever-after/main.webp' },
    { catalogId: 13, price: 1800, category: 'علم النفس والمجتمع', image: '../books/hungry-ghosts/main.webp' },
    { catalogId: 14, price: 1200, category: 'العلوم والمعرفة',    image: '../books/brief-history-of-time/main.webp' },
    { catalogId: 16, price: 950,  category: 'تطوير الذات',        image: '../books/joy-of-thirties/main.webp' },
    { catalogId: 17, price: 1200, category: 'العلاقات والحياة',   image: '../books/be-happy-with-someone/main.webp' },
    { catalogId: 20, price: 1600, category: 'علم النفس والمجتمع', image: '../books/emotional-intelligence/main.webp' },
    { catalogId: 21, price: 1100, category: 'الإدارة والأعمال',   image: '../books/sell-anything/main.webp' },
    { catalogId: 22, price: 1700, category: 'الإدارة والأعمال',   image: '../books/sell-yourself/main.webp' },
    { catalogId: 23, price: 1500, category: 'الإدارة والأعمال',   image: '../books/mastering-deals/main.webp' },
    { catalogId: 24, price: 1600, category: 'الإدارة والأعمال',   image: '../books/psychology-of-money/main.webp' },
    { catalogId: 25, price: 950,  category: 'علم النفس والمجتمع', image: '../books/subconscious-mind/main.webp' },
    { catalogId: 26, price: 900,  category: 'تطوير الذات',        image: '../books/subtle-art/main.webp' },
    { catalogId: 27, price: 750,  category: 'علم النفس والمجتمع', image: '../books/crowd-psychology/main.webp' },
    { catalogId: 28, price: 1300, category: 'علم النفس والمجتمع', image: '../books/psychological-laws/main.webp' },
    { catalogId: 29, price: 1550, category: 'علم النفس والمجتمع', image: '../books/opinions-beliefs/main.webp' },
    { catalogId: 30, price: 2100, category: 'تطوير الذات',        image: '../books/rational-male/main.webp' },
    { catalogId: 31, price: 1400, category: 'الإدارة والأعمال',   image: '../books/6-sales-skills/main.webp' },
    { catalogId: 32, price: 1800, category: 'تطوير الذات',        image: '../books/small-habits-effect/main.webp' },
    { catalogId: 33, price: 1100, category: 'تطوير الذات',        image: '../books/7-habits-teens/main.webp' },
    { catalogId: 34, price: 1300, category: 'تطوير الذات',        image: '../books/leader-in-me/main.webp' },
    { catalogId: 35, price:  800, category: 'تطوير الذات',        image: '../books/dark-feminine-power/main.webp' },
    { catalogId: 36, price: 1100, category: 'علم النفس والمجتمع', image: '../books/why-sheep-dont-go-to-doctor/main.webp' },
    { catalogId: 37, price:  850, category: 'الإدارة والأعمال',   image: '../books/zero-to-one/main.webp' },
    { catalogId: 38, price:  950, category: 'علم النفس والمجتمع', image: '../books/kindness-side-effects/main.webp' },
    { catalogId: 39, price:  900, category: 'تطوير الذات',        image: '../books/feminine-energy/main.webp' },
    { catalogId: 40, price: 1400, category: 'علم النفس والمجتمع', image: '../books/full-of-emptiness/main.webp' },
    { catalogId: 41, price: 1100, category: 'علم النفس والمجتمع', image: '../books/father-i-hate/main.webp' },
    { catalogId: 42, price: 1100, category: 'علم النفس والمجتمع', image: '../books/crystallizing-public-opinion/main.webp' },
    /* ── IDs 43–56 ── */
    { catalogId: 43, price:  950, category: 'تطوير الذات',        image: '../books/bawabatuka-liltaghyir/main.webp' },
    { catalogId: 44, price:  950, category: 'الإدارة والأعمال',   image: '../books/richest-man-in-babylon/main.webp' },
    { catalogId: 45, price:  850, category: 'الروايات والأدب',    image: '../books/urid-an-anam/main.webp' },
    { catalogId: 46, price: 1300, category: 'العلاقات والحياة',   image: '../books/how-not-to-die-alone/main.webp' },
    { catalogId: 47, price: 1400, category: 'تطوير الذات',        image: '../books/stronger-than-your-emotions/main.webp' },
    { catalogId: 48, price:  950, category: 'العلاقات والحياة',   image: '../books/act-like-a-lady-think-like-a-man/main.webp' },
    { catalogId: 49, price:  950, category: 'تطوير الذات',        image: '../books/kabber-dmaghak/main.webp' },
    { catalogId: 50, price:  900, category: 'تطوير الذات',        image: '../books/qawanin-al-najah-al-mustadam/main.webp' },
    { catalogId: 51, price:  850, category: 'العلاقات والحياة',   image: '../books/happiness-and-depression/main.webp' },
    { catalogId: 52, price: 2400, category: 'العلوم والمعرفة',    image: '../books/will-my-cat-eat-my-eyeballs/main.webp' },
    { catalogId: 53, price: 1400, category: 'الفلسفة والفكر',     image: '../books/the-monster-inside-you-can-be-kind/main.webp' },
    { catalogId: 54, price:  950, category: 'تطوير الذات',        image: '../books/burn-after-writing/main.webp' },
    { catalogId: 55, price: 1300, category: 'الفلسفة والفكر',     image: '../books/the-eye-of-the-i/main.webp' },
    { catalogId: 56, price: 1300, category: 'الروايات والأدب',    image: '../books/the-sun-does-shine/main.webp' },
    /* ── IDs 57–82 (الكتب الجديدة) ── */
    { catalogId: 57, price: 1200, category: 'تطوير الذات',        image: '../books/kitab-al-millionaire/main.webp' },
    { catalogId: 58, price: 1300, category: 'الإدارة والأعمال',   image: '../books/al-sannara/main.webp' },
    { catalogId: 59, price: 1300, category: 'الفلسفة والفكر',     image: '../books/tajawoz-mostawayat-al-waai/main.webp' },
    { catalogId: 60, price:  950, category: 'الروايات والأدب',    image: '../books/hatha-alkitab-sayuulimuk/main.webp' },
    { catalogId: 61, price:  950, category: 'تطوير الذات',        image: '../books/al-khitabat-al-sirriya/main.webp' },
    { catalogId: 62, price:  950, category: 'تطوير الذات',        image: '../books/al-rahib-allathi-baa/main.webp' },
    { catalogId: 63, price: 1900, category: 'تطوير الذات',        image: '../books/daily-laws/main.webp' },
    { catalogId: 64, price: 3200, category: 'علم النفس والمجتمع', image: '../books/art-of-seduction/main.webp' },
    { catalogId: 65, price:  650, category: 'تطوير الذات',        image: '../books/fan-altaamal-maa-alnas/main.webp' },
    { catalogId: 66, price:  700, category: 'الإدارة والأعمال',   image: '../books/fan-alidara-walqiyada/main.webp' },
    { catalogId: 67, price:  650, category: 'تطوير الذات',        image: '../books/daa-alqalaq-wabda-alhayat/main.webp' },
    { catalogId: 68, price: 1200, category: 'الإدارة والأعمال',   image: '../books/one-page-marketing-plan/main.webp' },
    { catalogId: 69, price: 1750, category: 'الإدارة والأعمال',   image: '../books/fowda-altasweq/main.webp' },
    { catalogId: 70, price: 1100, category: 'تطوير الذات',        image: '../books/miracle-morning/main.webp' },
    { catalogId: 71, price:  950, category: 'تطوير الذات',        image: '../books/training-camp/main.webp' },
    { catalogId: 72, price: 1400, category: 'علم النفس والمجتمع', image: '../books/tiktok-syndrome/main.webp' },
    { catalogId: 73, price: 1700, category: 'العلاقات والحياة',   image: '../books/quwwat-alhub-almudhila/main.webp' },
    { catalogId: 74, price:  950, category: 'تطوير الذات',        image: '../books/mumayaz-bil-asfar/main.webp' },
    { catalogId: 75, price:  950, category: 'تطوير الذات',        image: '../books/bored-and-brilliant/main.webp' },
    { catalogId: 76, price: 1200, category: 'تطوير الذات',        image: '../books/alhayat-takhtit/main.webp' },
    { catalogId: 77, price: 1100, category: 'العلاقات والحياة',   image: '../books/men-mars-women-venus/main.webp' },
    { catalogId: 78, price: 2500, category: 'العلوم والمعرفة',    image: '../books/eat-to-live/main.webp' },
    { catalogId: 79, price: 2900, category: 'علم النفس والمجتمع', image: '../books/upside-of-irrationality/main.webp' },
    { catalogId: 80, price: 2000, category: 'الفلسفة والفكر',     image: '../books/man-unknown/main.webp' },
    { catalogId: 81, price: 1400, category: 'الروايات والأدب',    image: '../books/wa-tazun-annaka-najawt/main.webp' },
    { catalogId: 82, price:  990, category: 'الإدارة والأعمال',   image: '../books/kotler-marketing/main.webp' },
    /* ── إلكترونيات ── */
    { catalogId: 83, price: 1500, category: 'إلكترونيات', name: 'حامل اللابتوب القابل للتعديل',                          image: '../Electronique/laptop/main.webp' },
    { catalogId: 84, price: 9800, category: 'إلكترونيات', name: 'ساعة ذكية Modio ST11 مع 3 أزواج أساور',                image: '../Electronique/smart-watch/modio-st11-smart-watch/main.webp' },
    { catalogId: 85, price: 4900, category: 'إلكترونيات', name: 'Anker SoundCore R50i VG Original – Bluetooth 5.3 Earbuds', image: '../Electronique/earbuds/anker-soundcore-r50i-vg/main.png' },
    { catalogId: 87, price: 2900, category: 'إلكترونيات', name: 'Airpods 4 Type-C Vrac (Garantie)',                         image: '../Electronique/earbuds/airpods-4-type-c-vrac/main.webp' },
    { catalogId: 88, price: 3950, category: 'إلكترونيات', name: 'Hoco J132A 20000mAh Power Bank',                           image: '../Electronique/power-bank/hoco-j132a-20000mah-power-bank/main.webp' },
  ];

  /* مجموعة سريعة من catalogId المرئية — لا تشمل الكتب المخفية */
  const VISIBLE_IDS = new Set(BOOKS_META.map(m => m.catalogId));

  /* ─────────────────────────────────────────────────────────
     جلب المنتجات من Supabase ودمجها مع BOOKS_META

     منطق العرض:
     • الكتب        : تُعرض فقط إذا وُجدت في Supabase
     • الإلكترونيات : تُعرض دائماً من BOOKS_META حتى لو لم تُضَف بعد
       → إذا لم تكن في Supabase تُحاوَل إضافتها تلقائياً بـ upsert

     مصدر category و price:
       1. Supabase (بعد تشغيل supabase-electronics-setup.sql)
       2. BOOKS_META كاحتياط إذا لم تُحدَّث Supabase بعد
  ───────────────────────────────────────────────────────── */
  async function fetchProducts() {

    /* ── 1. جلب الجدول كاملاً بما فيه category و price ── */
    const { data, error } = await supabase
      .from("product_availability")
      .select("catalog_id, name, available, category, price")
      .order("catalog_id");

    if (error) throw error;

    /* خريطة catalog_id → row لمطابقة O(1) */
    const sbMap = new Map((data || []).map(r => [r.catalog_id, r]));

    /* ── 2. upsert المنتجات الإلكترونية المفقودة ── */
    const elecMeta    = BOOKS_META.filter(m => m.category === 'إلكترونيات');
    const missingElec = elecMeta.filter(m => !sbMap.has(m.catalogId));

    if (missingElec.length) {
      try {
        const payload = missingElec.map(m => ({
          catalog_id: m.catalogId,
          name:       m.name,
          available:  true,
          category:   'إلكترونيات',
          price:      m.price,
        }));
        const { data: ups, error: upErr } = await supabase
          .from("product_availability")
          .upsert(payload, { onConflict: 'catalog_id' })
          .select("catalog_id, name, available, category, price");

        if (!upErr && ups) {
          ups.forEach(r => sbMap.set(r.catalog_id, r));
          console.log('[admin] upserted electronics:', ups.map(r => r.catalog_id));
        } else if (upErr) {
          /* upsert فشل (RLS أو عمود مفقود) — يظهر المنتج من BOOKS_META بدلاً من ذلك */
          console.warn('[admin] upsert failed (run supabase-electronics-setup.sql):', upErr.message);
        }
      } catch (e) {
        console.warn('[admin] upsert error:', e.message);
      }
    }

    /* ── 3. بناء قائمة الكتب (فقط الموجودة في Supabase) ── */
    const booksMeta = BOOKS_META.filter(m => m.category !== 'إلكترونيات');
    const bookRows  = booksMeta
      .filter(m => sbMap.has(m.catalogId))
      .map(m => buildProdObj(m, sbMap.get(m.catalogId)));

    /* ── 4. بناء قائمة الإلكترونيات (دائماً من BOOKS_META) ── */
    const elecRows = elecMeta.map(m => buildProdObj(m, sbMap.get(m.catalogId)));

    return [...bookRows, ...elecRows];
  }

  /* ─────────────────────────────────────────────────────────
     دمج BOOKS_META مع صف Supabase في كائن منتج واحد.
     الأولوية: Supabase → ثم BOOKS_META كاحتياط.
  ───────────────────────────────────────────────────────── */
  function buildProdObj(meta, row) {
    const dbCategory = row?.category || null;
    const category   = dbCategory
      ? dbCategory
      : (meta.category === 'إلكترونيات' ? 'إلكترونيات' : 'كتب');

    return {
      catalogId: meta.catalogId,
      /* name: prefer DB → then BOOKS_META (electronics only) → then '—'
         NEVER use String(catalogId) — that caused catalog_id = 2 to show as "2" */
      name:      row?.name   || meta.name   || '—',
      available: row         ? row.available : true,
      category,
      price:     row?.price  ?? meta.price  ?? null,
      image:     meta.image  || '',
      inDB:      !!row,
    };
  }

  /* ─────────────────────────────────────────────────────────
     حفظ حالة التوفر في Supabase — upsert آمن.

     ⚠️  IMPORTANT: لا تُدرج حقل "name" للكتب.
         BOOKS_META لا يحتوي على أسماء الكتب (فقط الإلكترونيات لها name).
         إذا أُدرج "name" للكتاب بقيمة undefined → String(catalogId) = "2"
         سيُكتَب فوق الاسم العربي الصحيح في Supabase.
  ───────────────────────────────────────────────────────── */
  async function setProductAvailability(catalogId, available) {
    const meta            = BOOKS_META.find(m => m.catalogId === catalogId);
    const isElec          = meta?.category === 'إلكترونيات';
    const existingProduct = ALL_PRODUCTS.find(p => p.catalogId === catalogId);

    const updatedFields = {
      available,
      category:   isElec ? 'إلكترونيات' : 'كتب',
      price:      meta?.price ?? null,
      updated_at: new Date().toISOString(),
    };

    if (existingProduct?.inDB) {
      const { error } = await supabase
        .from("product_availability")
        .update(updatedFields)
        .eq("catalog_id", catalogId);
      if (error) throw error;
      return;
    }

    if (!meta?.name) {
      throw new Error('هذا الكتاب غير موجود في جدول product_availability، ولا يمكن إضافته بدون اسم. شغّل ملف إعداد المنتج أو أضف السجل يدوياً.');
    }

    const payload = {
      catalog_id: catalogId,
      name:       meta.name,
      ...updatedFields,
    };

    const { error } = await supabase
      .from("product_availability")
      .upsert(payload, { onConflict: 'catalog_id' });
    if (error) throw error;
  }

  /* تحديد ما إذا كان المنتج إلكترونياً */
  function isElec(p) { return p.category === 'إلكترونيات'; }

  /* تحديث شارات التصفية الفرعية (الكل / الكتب / إلكترونيات) */
  function updateProdSubfilterBadges() {
    const elecCount  = ALL_PRODUCTS.filter(isElec).length;
    const booksCount = ALL_PRODUCTS.length - elecCount;
    const allEl = document.getElementById('psb-all');
    const bEl   = document.getElementById('psb-books');
    const eEl   = document.getElementById('psb-electronics');
    if (allEl) allEl.textContent = ALL_PRODUCTS.length;
    if (bEl)   bEl.textContent   = booksCount;
    if (eEl)   eEl.textContent   = elecCount;
    document.getElementById("tab-badge-products").textContent = ALL_PRODUCTS.length;
  }

  /* فلترة المنتجات بحسب القسم النشط والبحث النصي */
  function getProductsForView() {
    const q = PROD_SEARCH_QUERY.toLowerCase();
    return ALL_PRODUCTS.filter(p => {
      if (prodFilterCurrent === 'books'       &&  isElec(p)) return false;
      if (prodFilterCurrent === 'electronics' && !isElec(p)) return false;
      if (q && !p.name.toLowerCase().includes(q) &&
               !(p.category || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  /* بناء HTML لصف منتج واحد */
  function prodRow(p) {
    const icon = isElec(p) ? '💻' : '📚';
    return `
      <tr data-catalog-id="${p.catalogId}">
        <td>
          ${p.image
            ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" class="prod-thumb"
                   loading="lazy" decoding="async"
                   onerror="if(!this.dataset.f){this.dataset.f='1';this.src=this.src.replace('main.webp','main.png')}else{this.style.display='none';this.insertAdjacentHTML('afterend','<span style=\\'font-size:24px;\\'>${icon}</span>')}">`
            : `<span style="font-size:24px;">${icon}</span>`
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
            ${p.available ? '✅ متوفر' : '⚠️ نفذت الكمية مؤقتًا'}
          </span>
        </td>
        <td class="nowrap">
          <label class="avail-toggle" title="${p.available ? 'اضغط لإيقاف التوفر' : 'اضغط لتفعيل التوفر'}">
            <input type="checkbox" data-action="toggle-avail" data-catalog-id="${p.catalogId}"
                   ${p.available ? 'checked' : ''}>
            <span class="avail-slider"></span>
          </label>
        </td>
      </tr>`;
  }

  /* عرض جدول المنتجات — يدعم التجميع حسب الفئة في وضع "الكل" */
  function renderProductsTable(products) {
    renderProductsMobileCards(products);
    const tbody = document.getElementById("productsTbody");
    const cnt   = products.length;
    const total = ALL_PRODUCTS.length;

    document.getElementById("productsCount").textContent =
      cnt + " منتج" + (cnt !== total ? ` (من ${total})` : "");
    updateProdSubfilterBadges();

    if (!cnt) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">لا توجد منتجات مطابقة</td></tr>`;
      return;
    }

    /* وضع "الكل" بدون بحث: نعرض الكتب ثم الإلكترونيات مع رؤوس المجموعات */
    if (prodFilterCurrent === 'all' && !PROD_SEARCH_QUERY) {
      const books = products.filter(p => !isElec(p));
      const elec  = products.filter(p =>  isElec(p));
      let html = '';

      if (books.length) {
        html += `<tr class="prod-group-hdr">
          <td colspan="6">📚 الكتب <span class="prod-group-count">(${books.length} كتاب)</span></td>
        </tr>`;
        html += books.map(p => prodRow(p)).join('');
      }

      if (elec.length) {
        html += `<tr class="prod-group-hdr">
          <td colspan="6">💻 إلكترونيات <span class="prod-group-count">(${elec.length} منتج)</span></td>
        </tr>`;
        html += elec.map(p => prodRow(p)).join('');
      }

      tbody.innerHTML = html;
    } else {
      /* وضع الفلتر أو البحث: قائمة مسطحة بدون رؤوس مجموعات */
      tbody.innerHTML = products.map(p => prodRow(p)).join('');
    }
  }

  /* تحديث شارة التوفر في الجدول والبطاقات المحمولة */
  function applyAvailabilityUI(catalogId, value) {
    const label = value ? '✅ متوفر' : '⚠️ نفذت الكمية مؤقتًا';
    const cls   = value ? 'is-avail' : 'not-avail';

    const row = document.querySelector(`#productsTbody tr[data-catalog-id="${catalogId}"]`);
    if (row) {
      const badge = row.querySelector(".avail-status");
      if (badge) { badge.className = `avail-status ${cls}`; badge.textContent = label; }
    }

    const mCard = document.querySelector(`#productsMobileCards [data-catalog-id="${catalogId}"]`);
    if (mCard) {
      const mBadge = mCard.querySelector(".avail-status");
      if (mBadge) { mBadge.className = `avail-status ${cls}`; mBadge.textContent = label; }
    }
  }

  /* معالجة تغيير التوفر — Optimistic UI */
  async function handleToggleAvailability(catalogId, newValue, checkbox) {
    /* منع النقر المزدوج */
    checkbox.disabled = true;

    /* حفظ القيمة السابقة للتراجع عند الفشل */
    const p = ALL_PRODUCTS.find(p => p.catalogId === catalogId);
    const previousValue = p ? p.available : !newValue;

    /* 1. تحديث فوري للواجهة (Optimistic update) */
    if (p) p.available = newValue;
    applyAvailabilityUI(catalogId, newValue);

    /* 2. إرسال التحديث (upsert) لقاعدة البيانات */
    try {
      await setProductAvailability(catalogId, newValue);
      /* بعد upsert ناجح: اعتبر السجل محفوظاً في DB */
      if (p) p.inDB = true;
    } catch (err) {
      console.error("Toggle availability error:", err);

      /* 3. عند الفشل: التراجع عن التغيير في الواجهة */
      checkbox.checked = previousValue;
      if (p) p.available = previousValue;
      applyAvailabilityUI(catalogId, previousValue);

      alert("❌ فشل تحديث حالة التوفر:\n" + (err.message || "تحقق من صلاحيات قاعدة البيانات."));
    }

    checkbox.disabled = false;
  }

  /* ═══════════════════════════════════════════════════════════
     ⭐ REVIEWS MANAGEMENT
  ═══════════════════════════════════════════════════════════ */

  /* ── Fetch all reviews (staff sees all, not just approved) ── */
  async function fetchReviews() {
    const { data, error } = await supabase
      .from("customer_reviews")
      .select("id, first_name, last_name, display_name, wilaya, rating, comment, purchased_items, package_name, total_price, order_id, is_verified_purchase, is_approved, source, admin_note, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  }

  /* ── Approve / hide toggle ─────────────────────────────── */
  async function setReviewApproval(id, approved) {
    const { error } = await supabase
      .from("customer_reviews")
      .update({ is_approved: approved })
      .eq("id", id);
    if (error) throw error;
  }

  /* ── Delete ────────────────────────────────────────────── */
  async function deleteReview(id) {
    const { error } = await supabase
      .from("customer_reviews")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  /* ── Upsert (insert or update) ─────────────────────────── */
  async function saveReview(payload) {
    if (payload.id) {
      const { id, ...fields } = payload;
      const { error } = await supabase
        .from("customer_reviews")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("customer_reviews")
        .insert(payload);
      if (error) throw error;
    }
  }

  /* ── Filter ────────────────────────────────────────────── */
  function getFilteredReviews() {
    const q      = (document.getElementById("rvSearchInput")?.value || "").trim().toLowerCase();
    const status = document.getElementById("rvStatusFilter")?.value || "";

    return ALL_REVIEWS.filter(r => {
      if (status === "approved" && !r.is_approved)  return false;
      if (status === "pending"  &&  r.is_approved)  return false;
      if (!q) return true;
      const items = rvItemTitles(r);
      return (r.display_name || "").toLowerCase().includes(q) ||
             (r.first_name   || "").toLowerCase().includes(q) ||
             (r.last_name    || "").toLowerCase().includes(q) ||
             (r.wilaya       || "").toLowerCase().includes(q) ||
             (r.comment      || "").toLowerCase().includes(q) ||
             items.toLowerCase().includes(q);
    });
  }

  /* ── Helper: purchased items as display string ─────────── */
  function rvItemTitles(r) {
    try {
      const arr = Array.isArray(r.purchased_items)
        ? r.purchased_items
        : JSON.parse(r.purchased_items || "[]");
      const titles = arr.map(it => it.title || "").filter(Boolean).join("، ");
      return r.package_name ? (titles ? titles + " — " + r.package_name : r.package_name) : titles;
    } catch (e) { return r.package_name || ""; }
  }

  /* ── Stars HTML ────────────────────────────────────────── */
  function rvStars(n) {
    return "★".repeat(Math.max(1, Math.min(5, n || 0))) +
           "☆".repeat(5 - Math.max(1, Math.min(5, n || 0)));
  }

  /* ── Render reviews stats ──────────────────────────────── */
  function renderReviewsStats(reviews) {
    const approved = reviews.filter(r => r.is_approved).length;
    const pending  = reviews.length - approved;
    document.getElementById("rv-stat-total").textContent    = reviews.length;
    document.getElementById("rv-stat-pending").textContent  = pending;
    document.getElementById("rv-stat-approved").textContent = approved;
    document.getElementById("tab-badge-reviews").textContent = reviews.length;
  }

  /* ── Render desktop table ──────────────────────────────── */
  function renderReviewsTable(reviews) {
    renderReviewsMobileCards(reviews);

    const tbody = document.getElementById("rvTbody");
    const cnt   = reviews.length;

    document.getElementById("rvCount").textContent =
      cnt + " تقييم" + (cnt !== ALL_REVIEWS.length ? ` (من ${ALL_REVIEWS.length})` : "");
    renderReviewsStats(ALL_REVIEWS);

    if (!cnt) {
      tbody.innerHTML = `<tr><td colspan="10" class="empty">لا توجد تقييمات مطابقة</td></tr>`;
      return;
    }

    tbody.innerHTML = reviews.map((r, i) => {
      const items    = esc(rvItemTitles(r));
      const price    = r.total_price ? Number(r.total_price).toLocaleString("fr-DZ") + " دج" : "—";
      const approved = r.is_approved;

      return `
      <tr data-rv-id="${esc(r.id)}">
        <td class="nowrap" style="color:var(--text-muted);font-size:12px;">${i + 1}</td>
        <td>
          <div style="font-weight:800;font-size:13px;">${esc(r.display_name || r.first_name + " " + r.last_name)}</div>
          ${r.is_verified_purchase ? '<span class="badge-verified">✔ شراء موثق</span>' : ''}
        </td>
        <td class="nowrap"><span class="pm-tag">${esc(r.wilaya)}</span></td>
        <td class="nowrap"><span class="rv-stars" title="${r.rating}/5">${rvStars(r.rating)}</span></td>
        <td><div class="rv-comment" title="${esc(r.comment)}">${esc(r.comment)}</div></td>
        <td><div class="rv-books" title="${items}">${items || '—'}</div></td>
        <td class="nowrap" style="color:var(--primary);font-weight:800;">${price}</td>
        <td class="nowrap">
          <span class="badge ${approved ? 'badge-approved' : 'badge-pending'}">
            ${approved ? '✅ منشور' : '⏳ بانتظار'}
          </span>
        </td>
        <td class="nowrap" style="font-size:12px;color:var(--text-light);">${esc(fmtDate(r.created_at))}</td>
        <td class="nowrap">
          <div class="actions-col">
            <button class="btn-confirm" data-action="${approved ? 'rv-hide' : 'rv-approve'}"
                    data-rv-id="${esc(r.id)}"
                    style="background:${approved ? '#d97706' : '#059669'};border-color:${approved ? '#b45309' : '#047857'};">
              ${approved ? '🙈 إخفاء' : '✅ نشر'}
            </button>
            <button class="btn-receipt" data-action="rv-edit" data-rv-id="${esc(r.id)}">✏️ تعديل</button>
            <button class="btn-delete"  data-action="rv-delete" data-rv-id="${esc(r.id)}">🗑 حذف</button>
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  /* ── Render mobile cards ───────────────────────────────── */
  function renderReviewsMobileCards(reviews) {
    const container = document.getElementById("rvMobileCards");
    if (!container) return;

    if (!reviews.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">لا توجد تقييمات مطابقة</div>`;
      return;
    }

    container.innerHTML = reviews.map(r => {
      const approved = r.is_approved;
      return `
      <div class="m-rv-card" data-rv-id="${esc(r.id)}">
        <div class="m-rv-top">
          <div class="m-rv-name">${esc(r.display_name || r.first_name)}</div>
          <span class="badge ${approved ? 'badge-approved' : 'badge-pending'}">${approved ? '✅ منشور' : '⏳ بانتظار'}</span>
        </div>
        <div class="m-rv-meta">${esc(r.wilaya)} · <span class="m-rv-stars">${rvStars(r.rating)}</span></div>
        <div class="m-rv-comment">${esc(r.comment)}</div>
        <div class="m-rv-actions">
          <button class="btn-confirm" data-action="${approved ? 'rv-hide' : 'rv-approve'}"
                  data-rv-id="${esc(r.id)}"
                  style="background:${approved ? '#d97706' : '#059669'};border-color:${approved ? '#b45309' : '#047857'};">
            ${approved ? '🙈 إخفاء' : '✅ نشر'}
          </button>
          <button class="btn-receipt" data-action="rv-edit" data-rv-id="${esc(r.id)}">✏️ تعديل</button>
          <button class="btn-delete"  data-action="rv-delete" data-rv-id="${esc(r.id)}">🗑 حذف</button>
        </div>
      </div>`;
    }).join("");
  }

  /* ── Handle approve / hide ─────────────────────────────── */
  async function handleReviewApproval(id, approve, btn) {
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "⏳...";
    try {
      await setReviewApproval(id, approve);
      const r = ALL_REVIEWS.find(x => x.id === id);
      if (r) r.is_approved = approve;
      renderReviewsTable(getFilteredReviews());
    } catch (err) {
      console.error("Review approval error:", err);
      alert("❌ فشل التحديث: " + (err.message || ""));
      btn.disabled = false;
      btn.textContent = prev;
    }
  }

  /* ── Handle delete ─────────────────────────────────────── */
  async function handleReviewDelete(id, btn) {
    if (!confirm("هل أنت متأكد من حذف هذا التقييم نهائياً؟")) return;
    btn.disabled = true;
    btn.textContent = "⏳...";
    try {
      await deleteReview(id);
      ALL_REVIEWS = ALL_REVIEWS.filter(r => r.id !== id);
      renderReviewsTable(getFilteredReviews());
      if (document.getElementById("modal").classList.contains("open")) closeModal();
    } catch (err) {
      console.error("Delete review error:", err);
      alert("❌ خطأ في الحذف: " + (err.message || ""));
      btn.disabled = false;
      btn.textContent = "🗑 حذف";
    }
  }

  /* ── Build the add/edit modal form ────────────────────────── */
  function buildReviewForm(r) {
    EDIT_REVIEW_ID = r ? r.id : null;

    /* Parse purchased_items for the textarea */
    let itemsJson = "";
    try {
      const arr = r?.purchased_items
        ? (Array.isArray(r.purchased_items) ? r.purchased_items : JSON.parse(r.purchased_items))
        : [];
      itemsJson = arr.length ? JSON.stringify(arr, null, 2) : "";
    } catch (e) { itemsJson = ""; }

    const rating = r?.rating || 5;

    document.getElementById("modalTitle").textContent =
      r ? "تعديل التقييم — " + esc(r.display_name || r.first_name) : "إضافة تقييم جديد";

    document.getElementById("modalBody").innerHTML = `
      <div class="rv-form-grid">

        <div class="rv-field">
          <label>الاسم الأول *</label>
          <input type="text" id="rv-first-name" value="${esc(r?.first_name || "")}" placeholder="مثال: أمين">
        </div>
        <div class="rv-field">
          <label>اللقب *</label>
          <input type="text" id="rv-last-name" value="${esc(r?.last_name || "")}" placeholder="مثال: بن علي">
        </div>

        <div class="rv-field">
          <label>اسم العرض (اختياري)</label>
          <input type="text" id="rv-display-name" value="${esc(r?.display_name || "")}" placeholder="مثال: أمين ب. (يُملأ تلقائياً إذا تُرك فارغاً)">
        </div>
        <div class="rv-field">
          <label>الولاية *</label>
          <input type="text" id="rv-wilaya" value="${esc(r?.wilaya || "")}" placeholder="مثال: الجزائر العاصمة">
        </div>

        <div class="rv-field full-col">
          <label>التقييم *</label>
          <div class="rv-star-row" id="rv-star-row">
            ${[1,2,3,4,5].map(n =>
              `<button type="button" class="rv-star-btn ${n <= rating ? 'active' : ''}"
               data-star="${n}" title="${n} نجوم">★</button>`
            ).join("")}
          </div>
          <input type="hidden" id="rv-rating" value="${rating}">
        </div>

        <div class="rv-field full-col">
          <label>التعليق *</label>
          <textarea id="rv-comment" rows="3" placeholder="اكتب تعليق الزبون هنا...">${esc(r?.comment || "")}</textarea>
        </div>

        <div class="rv-field full-col">
          <label>الكتب المشتراة (JSON)</label>
          <textarea id="rv-items" rows="3"
            placeholder='[{"title":"اسم الكتاب","price":900}]'>${esc(itemsJson)}</textarea>
          <small style="color:var(--text-muted);font-size:11px;">
            صيغة: [{\"title\":\"اسم الكتاب\",\"price\":900}] — يمكن إضافة أكثر من كتاب
          </small>
        </div>

        <div class="rv-field">
          <label>اسم الباقة (اختياري)</label>
          <input type="text" id="rv-package" value="${esc(r?.package_name || "")}" placeholder="مثال: باقة تطوير الذات">
        </div>
        <div class="rv-field">
          <label>المبلغ الإجمالي (دج)</label>
          <input type="number" id="rv-price" value="${r?.total_price || ""}" placeholder="مثال: 1750" min="0">
        </div>

        <div class="rv-field">
          <label>المصدر</label>
          <select id="rv-source">
            <option value="manual"   ${(r?.source||"manual")==="manual"   ? "selected" : ""}>يدوي (Admin)</option>
            <option value="whatsapp" ${r?.source==="whatsapp" ? "selected" : ""}>واتساب</option>
            <option value="website"  ${r?.source==="website"  ? "selected" : ""}>الموقع</option>
            <option value="import"   ${r?.source==="import"   ? "selected" : ""}>استيراد</option>
          </select>
        </div>
        <div class="rv-field" style="justify-content:flex-end;flex-direction:row;align-items:center;gap:10px;">
          <label style="cursor:pointer;display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="rv-verified"  ${r?.is_verified_purchase ? "checked" : ""} style="width:18px;height:18px;">
            شراء موثق
          </label>
          <label style="cursor:pointer;display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="rv-approved"  ${r?.is_approved ? "checked" : ""} style="width:18px;height:18px;">
            نشر فوراً
          </label>
        </div>

        <div class="rv-field full-col">
          <label>ملاحظات داخلية (للأدمن فقط)</label>
          <textarea id="rv-notes" rows="2" placeholder="ملاحظة داخلية...">${esc(r?.admin_note || "")}</textarea>
        </div>

      </div>

      <button class="rv-save-btn" id="rvSaveBtn">
        ${r ? "💾 حفظ التعديلات" : "✅ إضافة التقييم"}
      </button>
      <p id="rvFormStatus" style="text-align:center;margin-top:10px;font-size:14px;"></p>
    `;

    /* Star rating interactive */
    document.getElementById("rv-star-row").addEventListener("click", e => {
      const btn = e.target.closest(".rv-star-btn");
      if (!btn) return;
      const val = parseInt(btn.dataset.star);
      document.getElementById("rv-rating").value = val;
      document.querySelectorAll(".rv-star-btn").forEach((b, i) => {
        b.classList.toggle("active", i < val);
      });
    });

    /* Save handler */
    document.getElementById("rvSaveBtn").addEventListener("click", handleReviewSave);

    openModal();
  }

  /* ── Handle save (insert / update) ────────────────────────── */
  async function handleReviewSave() {
    const saveBtn  = document.getElementById("rvSaveBtn");
    const statusEl = document.getElementById("rvFormStatus");

    const firstName  = document.getElementById("rv-first-name").value.trim();
    const lastName   = document.getElementById("rv-last-name").value.trim();
    const displayName = document.getElementById("rv-display-name").value.trim();
    const wilaya     = document.getElementById("rv-wilaya").value.trim();
    const rating     = parseInt(document.getElementById("rv-rating").value) || 5;
    const comment    = document.getElementById("rv-comment").value.trim();
    const itemsRaw   = document.getElementById("rv-items").value.trim();
    const pkgName    = document.getElementById("rv-package").value.trim();
    const totalPrice = document.getElementById("rv-price").value.trim();
    const source     = document.getElementById("rv-source").value;
    const verified   = document.getElementById("rv-verified").checked;
    const approved   = document.getElementById("rv-approved").checked;
    const notes      = document.getElementById("rv-notes").value.trim();

    if (!firstName || !lastName || !wilaya || !comment) {
      statusEl.style.color = "red";
      statusEl.textContent = "❌ يرجى ملء الحقول الإلزامية: الاسم الأول، اللقب، الولاية، التعليق.";
      return;
    }

    let purchasedItems = [];
    if (itemsRaw) {
      try { purchasedItems = JSON.parse(itemsRaw); }
      catch (e) {
        statusEl.style.color = "red";
        statusEl.textContent = "❌ صيغة JSON للكتب غير صحيحة. مثال: [{\"title\":\"الكتاب\",\"price\":900}]";
        return;
      }
    }

    const payload = {
      first_name:           firstName,
      last_name:            lastName,
      display_name:         displayName || null,
      wilaya,
      rating,
      comment,
      purchased_items:      purchasedItems,
      package_name:         pkgName  || null,
      total_price:          totalPrice ? parseFloat(totalPrice) : null,
      source,
      is_verified_purchase: verified,
      is_approved:          approved,
      admin_note:           notes || null,
    };

    if (EDIT_REVIEW_ID) payload.id = EDIT_REVIEW_ID;

    saveBtn.disabled = true;
    saveBtn.textContent = "⏳ جاري الحفظ...";
    statusEl.textContent = "";

    try {
      await saveReview(payload);
      statusEl.style.color = "green";
      statusEl.textContent = "✅ تم الحفظ بنجاح!";
      /* Reload all reviews to get fresh data (including triggers like display_name) */
      ALL_REVIEWS = await fetchReviews();
      renderReviewsTable(getFilteredReviews());
      setTimeout(() => closeModal(), 900);
    } catch (err) {
      console.error("Save review error:", err);
      statusEl.style.color = "red";
      statusEl.textContent = "❌ خطأ: " + (err.message || "");
      saveBtn.disabled = false;
      saveBtn.textContent = EDIT_REVIEW_ID ? "💾 حفظ التعديلات" : "✅ إضافة التقييم";
    }
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
        : tab === "reviews"  ? "⭐ إدارة التقييمات"
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
      if ((btn.dataset.action === "confirm" || btn.dataset.action === "delete") && isLimitedStaffMode()) return;
      if (btn.dataset.action === "confirm") await handleConfirm(btn.dataset.id, btn);
      if (btn.dataset.action === "delete")  await handleDelete(btn.dataset.id, btn);
      if (btn.dataset.action === "details") showOrderModal(btn.dataset.id);
    });

    /* Event delegation — المودال */
    document.getElementById("modalBody").addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if ((btn.dataset.action === "confirm" || btn.dataset.action === "delete") && isLimitedStaffMode()) return;
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

    /* ── Mobile: Orders cards ──────────────────────────────── */
    document.getElementById("ordersMobileCards").addEventListener("click", async e => {
      const detailsBtn = e.target.closest("[data-action='details']");
      if (detailsBtn) { showOrderModal(detailsBtn.dataset.id); return; }
    });

    /* ── Mobile: Products cards toggle ─────────────────────── */
    document.getElementById("productsMobileCards").addEventListener("change", async e => {
      const cb = e.target.closest('input[data-action="toggle-avail"]');
      if (!cb) return;
      await handleToggleAvailability(parseInt(cb.dataset.catalogId), cb.checked, cb);
    });

    /* ── Mobile: Messages cards ─────────────────────────────── */
    document.getElementById("msgMobileCards").addEventListener("click", async e => {
      const deleteBtn = e.target.closest("[data-action='delete-msg']");
      if (deleteBtn) {
        await handleDeleteMessage(deleteBtn.dataset.msgId, deleteBtn);
        return;
      }
      const card = e.target.closest(".m-msg-card");
      if (card) showMessageModal(card.dataset.msgId);
    });

    document.getElementById("productsRefreshBtn").addEventListener("click", async () => {
      const btn = document.getElementById("productsRefreshBtn");
      btn.disabled = true; btn.textContent = "⏳ جاري التحديث...";
      try {
        ALL_PRODUCTS = await fetchProducts();
        renderProductsTable(getProductsForView());
      } catch (err) { alert("❌ فشل تحديث المنتجات: " + (err.message || "")); }
      btn.disabled = false; btn.textContent = "↻ تحديث";
    });

    /* ── Product sub-filter buttons ────────────────────────── */
    document.getElementById("prodSubfilterBar")?.addEventListener("click", e => {
      const btn = e.target.closest(".prod-sf-btn");
      if (!btn) return;
      prodFilterCurrent = btn.dataset.pfilter || 'all';
      document.querySelectorAll(".prod-sf-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderProductsTable(getProductsForView());
    });

    /* ── Product search ─────────────────────────────────────── */
    document.getElementById("prodSearchInput")?.addEventListener("input", e => {
      PROD_SEARCH_QUERY = e.target.value.trim();
      renderProductsTable(getProductsForView());
    });

    /* ── Reviews: search & filter ───────────────────────────── */
    document.getElementById("rvSearchInput")?.addEventListener("input",
      () => renderReviewsTable(getFilteredReviews()));
    document.getElementById("rvStatusFilter")?.addEventListener("change",
      () => renderReviewsTable(getFilteredReviews()));

    /* ── Reviews: refresh ───────────────────────────────────── */
    document.getElementById("rvRefreshBtn")?.addEventListener("click", async () => {
      const btn = document.getElementById("rvRefreshBtn");
      btn.disabled = true; btn.textContent = "⏳ جاري التحديث...";
      try {
        ALL_REVIEWS = await fetchReviews();
        renderReviewsTable(getFilteredReviews());
      } catch (err) { alert("❌ فشل التحديث: " + (err.message || "")); }
      btn.disabled = false; btn.textContent = "↻ تحديث";
    });

    /* ── Reviews: add button ────────────────────────────────── */
    document.getElementById("rvAddBtn")?.addEventListener("click", () => buildReviewForm(null));

    /* ── Reviews: table event delegation ────────────────────── */
    document.getElementById("rvTbody")?.addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = btn.dataset.rvId;
      if (!id) return;
      if (btn.dataset.action === "rv-approve") await handleReviewApproval(id, true,  btn);
      if (btn.dataset.action === "rv-hide")    await handleReviewApproval(id, false, btn);
      if (btn.dataset.action === "rv-delete")  await handleReviewDelete(id, btn);
      if (btn.dataset.action === "rv-edit") {
        const r = ALL_REVIEWS.find(x => x.id === id);
        if (r) buildReviewForm(r);
      }
    });

    /* ── Reviews: mobile cards delegation ───────────────────── */
    document.getElementById("rvMobileCards")?.addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = btn.dataset.rvId;
      if (!id) return;
      if (btn.dataset.action === "rv-approve") await handleReviewApproval(id, true,  btn);
      if (btn.dataset.action === "rv-hide")    await handleReviewApproval(id, false, btn);
      if (btn.dataset.action === "rv-delete")  await handleReviewDelete(id, btn);
      if (btn.dataset.action === "rv-edit") {
        const r = ALL_REVIEWS.find(x => x.id === id);
        if (r) buildReviewForm(r);
      }
    });
  }

  /* ─────────────────────────────────────────────────────────
     BOOT
  ───────────────────────────────────────────────────────── */
  async function boot() {
    try {
      const staff = await authGuard();
      if (!staff) return;

      CURRENT_ROLE = String(staff.role || "staff").toLowerCase();
      CURRENT_STAFF_EMAIL = String(staff.email || "").toLowerCase();
      LIMITED_STAFF_MODE = CURRENT_STAFF_EMAIL === LIMITED_STAFF_EMAIL;

      document.getElementById("adminBadge").textContent =
        (LIMITED_STAFF_MODE ? "👤 Limited staff" : CURRENT_ROLE === "admin" ? "👑 Admin" : "👤 Staff") +
        (staff.full_name ? " — " + staff.full_name : "");

      if (LIMITED_STAFF_MODE) {
        // Limited staff mode: only show unconfirmed orders and hide other sections
        document.querySelectorAll('.tab-btn[data-tab]:not([data-tab="orders"])').forEach(btn => btn.style.display = 'none');
        document.querySelectorAll('.tab-content:not(#tab-orders)').forEach(section => section.style.display = 'none');
        document.querySelectorAll('.stats-grid').forEach(grid => grid.style.display = 'none');
        const statusFilterEl = document.getElementById('statusFilter');
        if (statusFilterEl) {
          statusFilterEl.value = 'pending';
          statusFilterEl.disabled = true;
          statusFilterEl.style.display = 'none';
        }
      }

      [ALL_ORDERS, ALL_MESSAGES, ALL_PRODUCTS, ALL_REVIEWS] = await Promise.all([
        fetchOrders(LIMITED_STAFF_MODE), fetchMessages(),
        LIMITED_STAFF_MODE ? Promise.resolve([]) : fetchProducts().catch(() => []),
        LIMITED_STAFF_MODE ? Promise.resolve([]) : fetchReviews().catch(() => []),
      ]);
      renderStats(ALL_ORDERS);
      renderTable(getFiltered());
      if (!LIMITED_STAFF_MODE) {
        renderMessagesTable(ALL_MESSAGES);
        renderProductsTable(getProductsForView());
        renderReviewsTable(ALL_REVIEWS);
      }
      bindEvents();

    } catch (err) {
      console.error("Boot error:", err);
      alert("❌ خطأ في تحميل لوحة التحكم:\n" + (err.message || JSON.stringify(err)));
    }
  }

  boot();

})();
