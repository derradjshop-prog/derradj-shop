
(function () {
  "use strict";

  /* ── Supabase ──────────────────────────────────────────── */
  if (!window.supabase?.createClient) { alert("❌ Supabase غير محمّل."); return; }

  const SUPABASE_URL      = "https://jbmcbjzcedqpvnhbmrhk.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk";
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ── State ─────────────────────────────────────────────── */
  let ALL_ORDERS   = [];
  let ALL_MESSAGES = [];
  let ACTIVE_ORDER = null;
  let CURRENT_STAFF_ID = '';
  let UNSEEN_ORDERS   = 0;
  let UNSEEN_MESSAGES = 0;

  /* ── Profile tab state ─────────────────────────────────── */
  let CURRENT_STAFF           = null; // the staff row from authGuard()
  let SELLER_PROFILE          = null; // seller_profiles row, or null (legacy sellers may have none)
  let LATEST_PROFILE_REQUEST  = null; // most recent seller_profile_change_requests row, or null

  /* ── "View as User" preview mode — read-only, no real seller
     session is ever created. See supabase-impersonation-system.sql. ── */
  let PREVIEW_MODE = false;
  let PREVIEW_TARGET_ID = null;
  let PREVIEW_TIMER_INTERVAL = null;
  const PREVIEW_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  function disabledInPreview() {
    return PREVIEW_MODE ? `disabled title="🔒 معطّل في وضع المعاينة"` : "";
  }

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
  const ASSIGN_LABELS = {
    pending_admin: "🆕 غير معيّن",
    assigned:      "👤 معيّن لك",
    completed:     "✅ مكتمل",
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

  function confirmBadge(isConfirmed) {
    return isConfirmed === true
      ? `<span class="badge badge-confirmed">✅ تم التأكيد</span>`
      : `<span class="badge badge-pending">⏳ قيد المعالجة</span>`;
  }

  function assignBadge(status) {
    return `<span class="badge badge-assign-${esc(status)}">${esc(ASSIGN_LABELS[status] || status)}</span>`;
  }

  function emptyStateHTML(icon, text) {
    return `<div class="empty-state"><div class="es-icon">${icon}</div><div class="es-text">${esc(text)}</div></div>`;
  }

  /* Same defensive pattern as admin/admin.js's safeHttpUrl() — only
     render a clickable link when the value actually looks like an
     http(s) URL, otherwise fall back to plain text. */
  function safeHttpUrl(v) {
    const s = String(v || "").trim();
    return /^https?:\/\//i.test(s) ? s : null;
  }

  /* ── Profile tab — read-only info (staff row + seller_profiles row,
     if any) plus a gated self-service edit flow. Sellers never write
     to staff_accounts/seller_profiles directly here — submitting the
     form below only INSERTs a row into seller_profile_change_requests;
     an admin reviews/approves or rejects it elsewhere, and THAT is what
     actually updates the real rows. ── */
  function renderProfile(staff, sellerProfile, latestRequest) {
    const box = document.getElementById("tab-profile");
    if (!box) return;

    const isPending  = !!latestRequest && latestRequest.status === "pending";
    const isRejected = !!latestRequest && latestRequest.status === "rejected";
    const statusText = isPending ? "تغييراتك قيد المراجعة" : "لا توجد تغييرات قيد المراجعة";

    const rejectedNotice = isRejected
      ? `<div class="profile-reject-note">❌ تم رفض طلب التعديل الأخير${latestRequest.admin_notes ? ": " + esc(latestRequest.admin_notes) : ""}</div>`
      : "";

    const socialUrl  = safeHttpUrl(sellerProfile?.social_link);
    const socialHtml = sellerProfile?.social_link
      ? (socialUrl
          ? `<a href="${esc(socialUrl)}" target="_blank" rel="noopener noreferrer">${esc(sellerProfile.social_link)}</a>`
          : esc(sellerProfile.social_link))
      : "—";

    box.innerHTML = `
      <div class="table-wrap" style="padding:20px;">
        <div class="profile-status-line">
          <span class="i-val">${esc(statusText)}</span>
          <button type="button" class="btn-profile-edit" id="profileEditBtn"
            ${isPending ? `disabled title="🔒 لديك طلب قيد المراجعة بالفعل"` : ""}>✏️ تعديل المعلومات</button>
        </div>
        ${rejectedNotice}
        <div class="info-grid" style="margin-top:14px;">
          <div class="info-item">
            <span class="i-lbl">الاسم</span>
            <span class="i-val">${esc(staff.full_name || "—")}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">البريد الإلكتروني</span>
            <span class="i-val">${esc(staff.email || "—")}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">الصلاحية</span>
            <span class="i-val">🛒 بائع</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">رقم الهاتف</span>
            <span class="i-val">${esc(sellerProfile?.whatsapp || "—")}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">اسم المتجر / النشاط التجاري</span>
            <span class="i-val">${esc(sellerProfile?.boutique_name || "—")}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">وصف المتجر</span>
            <span class="i-val">${esc(sellerProfile?.boutique_description || "—")}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">الولاية</span>
            <span class="i-val">${esc(sellerProfile?.wilaya || "—")}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">البلدية</span>
            <span class="i-val">${esc(sellerProfile?.commune || "—")}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">رابط التواصل الاجتماعي</span>
            <span class="i-val">${socialHtml}</span>
          </div>
        </div>

        <form class="qadd-form" id="profileEditForm" style="display:none;margin-top:22px;max-width:460px;" autocomplete="off">
          <div class="qadd-fld">
            <label for="profFullName">اسم البائع *</label>
            <input type="text" id="profFullName" value="${esc(staff.full_name || "")}" required>
          </div>
          <div class="qadd-fld">
            <label for="profPhone">رقم الهاتف</label>
            <input type="text" id="profPhone" value="${esc(sellerProfile?.whatsapp || "")}">
          </div>
          <div class="qadd-fld">
            <label for="profBoutiqueName">اسم المتجر</label>
            <input type="text" id="profBoutiqueName" value="${esc(sellerProfile?.boutique_name || "")}">
          </div>
          <div class="qadd-fld">
            <label for="profBoutiqueDesc">وصف المتجر</label>
            <textarea id="profBoutiqueDesc">${esc(sellerProfile?.boutique_description || "")}</textarea>
          </div>
          <div class="qadd-fld">
            <label for="profWilaya">الولاية</label>
            <input type="text" id="profWilaya" value="${esc(sellerProfile?.wilaya || "")}">
          </div>
          <div class="qadd-fld">
            <label for="profCommune">البلدية</label>
            <input type="text" id="profCommune" value="${esc(sellerProfile?.commune || "")}">
          </div>
          <div class="qadd-fld">
            <label for="profSocialLink">رابط التواصل الاجتماعي</label>
            <input type="text" id="profSocialLink" value="${esc(sellerProfile?.social_link || "")}">
          </div>
          <button type="submit" class="btn-qadd-submit" id="profileEditSubmitBtn">💾 حفظ التغييرات</button>
          <p class="status-msg" id="profileEditStatusMsg" style="text-align:center;font-size:13px;font-weight:700;margin-top:12px;min-height:18px;"></p>
        </form>
      </div>`;
  }

  /* ── Auth guard — seller role only ────────────────────── */
  async function authGuard() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { location.href = "../admin/login.html"; return null; }

    const { data: staff, error } = await supabase
      .from("staff_accounts")
      .select("id, full_name, email, role, is_active, show_amount_owed")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error || !staff || !staff.is_active || staff.role !== "seller") {
      await supabase.auth.signOut();
      location.href = "../admin/login.html";
      return null;
    }
    return staff;
  }

  /* ── My assigned orders — RLS already restricts this to rows
     where assigned_to = this seller; the .eq() below is kept for
     defense-in-depth / clarity, not as the actual access control. ── */
  async function fetchMyOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id, order_number, full_name, phone, address, wilaya, commune,
        delivery_type, shipping_fee, subtotal, total_price,
        payment_method, receipt_url, is_confirmed, notes, created_at,
        assignment_status, assigned_at, completed_at,
        order_items ( id, product_name, quantity, unit_price, subtotal, purchase_cost )
      `)
      .eq("assigned_to", CURRENT_STAFF_ID)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  }

  /* ── My assigned messages ──────────────────────────────── */
  async function fetchMyMessages() {
    const { data, error } = await supabase
      .from("messages")
      .select("id, name, contact, message, created_at, assignment_status, assigned_at")
      .eq("assigned_to", CURRENT_STAFF_ID)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  }

  /* ── My quick-added books (pending admin review or already published) ── */
  async function fetchMySubmissions() {
    const { data, error } = await supabase
      .from("admin_products_catalog")
      .select("id, product_name, main_image, status, submitted_at")
      .eq("submitted_by", CURRENT_STAFF_ID)
      .order("submitted_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  }

  /* ── Profile tab fetches — a seller may have zero seller_profiles
     rows (legacy sellers) or zero pending/rejected/approved change
     requests; both are expected/normal, hence maybeSingle(). ── */
  async function fetchSellerProfile() {
    const { data, error } = await supabase
      .from("seller_profiles")
      .select("boutique_name, boutique_description, wilaya, commune, whatsapp, social_link")
      .eq("seller_id", CURRENT_STAFF_ID)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function fetchLatestProfileChangeRequest() {
    const { data, error } = await supabase
      .from("seller_profile_change_requests")
      .select("*")
      .eq("seller_id", CURRENT_STAFF_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  /* ── The ONLY write a seller is allowed to make — mark an
     assigned item completed. Anything else is rejected by the
     guard_assignment_columns() trigger on the database.
     completed_by/completed_at are stamped BY THAT TRIGGER, not sent
     from here — see supabase-order-delivery-fix.sql. Sending them
     from the client used to trip the (older) column guard and make
     every "تسليم" click fail silently-looking (error alert, no
     visible change) — this is that fix. ── */
  async function markOrderCompleted(orderId) {
    const { error } = await supabase
      .from("orders")
      .update({ assignment_status: "completed" })
      .eq("id", orderId);
    if (error) throw error;
  }

  /* ── تراجع — إرجاع طلب مكتمل بالخطأ إلى "معيّن لك". نفس آلية
     "تسليم" بالضبط، بعكس القيمة فقط — والتراجع مسموح للبائع على
     مستوى القاعدة (guard_assignment_columns() في
     supabase-order-delivery-fix.sql)، والذي يُصفّر completed_by/
     completed_at تلقائياً عند هذا الانتقال. ── */
  async function revertOrderToAssigned(orderId) {
    const { error } = await supabase
      .from("orders")
      .update({ assignment_status: "assigned" })
      .eq("id", orderId);
    if (error) throw error;
  }

  /* ── حذف طلب — مسموح للبائع فقط ضمن الطلبات المعيّنة له، بفضل
     سياسة RLS الجديدة orders_seller_delete_assigned (مطابقة تماماً
     لنطاق سياستَي SELECT/UPDATE الحاليتين للبائع). أي محاولة حذف
     لطلب غير معيّن له تُرفض على مستوى القاعدة. ── */
  async function deleteOrder(orderId) {
    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);
    if (error) throw error;
  }

  async function markMessageCompleted(msgId) {
    const { error } = await supabase
      .from("messages")
      .update({ assignment_status: "completed" })
      .eq("id", msgId);
    if (error) throw error;
  }

  /* ── Order stats (Total / In progress / Completed) ── */
  function renderOrderStats(orders) {
    const inProgress = orders.filter(o => o.assignment_status === "assigned").length;
    const done        = orders.filter(o => o.assignment_status === "completed").length;
    document.getElementById("stat-ord-total").textContent    = orders.length;
    document.getElementById("stat-ord-progress").textContent = inProgress;
    document.getElementById("stat-ord-done").textContent     = done;
  }

  /* ═══════════════════════════════════════════════════════════
     MODAL — shared by orders + messages
  ═══════════════════════════════════════════════════════════ */
  function openModal()  { document.getElementById("modal").classList.add("open"); }
  function closeModal() {
    document.getElementById("modal").classList.remove("open");
    document.getElementById("modalFooter").innerHTML = "";
    ACTIVE_ORDER = null;
  }

  /* ═══════════════════════════════════════════════════════════
     MY ASSIGNED ORDERS
  ═══════════════════════════════════════════════════════════ */
  function getFilteredOrders() {
    const q  = (document.getElementById("ordSearchInput")?.value || "").trim().toLowerCase();
    const st = document.getElementById("ordStatusFilter")?.value || ""; /* "" | "new" | "done" */
    return ALL_ORDERS.filter(o => {
      /* "طلبات جديدة" = لم تُسلَّم بعد، "مكتملة" = تم التسليم */
      if (st === "new"  && o.assignment_status === "completed") return false;
      if (st === "done" && o.assignment_status !== "completed") return false;

      if (!q) return true;
      const products = (o.order_items || []).map(it => it.product_name || "").join(" ").toLowerCase();
      return (o.full_name || "").toLowerCase().includes(q) ||
             (o.phone     || "").includes(q) ||
             products.includes(q);
    });
  }

  function renderOrdersMobileCards(orders) {
    const container = document.getElementById("ordersMobileCards");
    if (!container) return;
    if (!orders.length) {
      container.innerHTML = emptyStateHTML("📦", "لا توجد طلبات معيّنة لك حالياً");
      return;
    }
    container.innerHTML = orders.map(o => {
      const items    = o.order_items || [];
      const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      return `
        <div class="m-order-card" data-id="${esc(o.id)}" style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;box-shadow:var(--shadow-sm);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
            <div>
              <strong>${esc(o.full_name || "—")}</strong>
              <div style="font-size:11px;color:var(--text-muted);">#${esc(o.order_number ?? "—")}</div>
            </div>
            ${confirmBadge(o.is_confirmed)}
          </div>
          <div style="font-size:13px;color:var(--text-light);margin-bottom:8px;" dir="ltr">${esc(o.phone || "—")}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-weight:800;color:var(--primary);">${esc(fmtMoney(o.total_price))}</span>
            <span style="font-size:13px;color:var(--text-light);">${totalQty} قطعة</span>
          </div>
          <div class="m-order-actions">
            <button class="btn-receipt" data-id="${esc(o.id)}" data-action="ord-details">عرض التفاصيل</button>
            ${(o.phone || "").trim() ? `<a href="tel:${esc((o.phone || "").trim())}" class="btn-call">📞 اتصال</a>` : ""}
            ${o.assignment_status === "assigned" ? `<button class="btn-confirm" data-id="${esc(o.id)}" data-action="ord-complete" ${disabledInPreview()}>✅ تسليم</button>` : ""}
            ${o.assignment_status === "completed" ? `<button class="btn-undo" data-id="${esc(o.id)}" data-action="ord-revert" ${disabledInPreview()}>↩️ تراجع</button>` : ""}
            <button class="btn-delete" data-id="${esc(o.id)}" data-action="ord-delete" ${disabledInPreview()}>🗑 حذف</button>
            <button class="btn-block" data-id="${esc(o.id)}" data-action="ord-block" ${disabledInPreview()}>🚫 حظر</button>
          </div>
        </div>`;
    }).join("");
  }

  function renderOrdersTable(orders) {
    renderOrdersMobileCards(orders);
    renderOrderStats(ALL_ORDERS);
    const tbody = document.getElementById("ordersTbody");
    document.getElementById("ordCount").textContent =
      orders.length + " طلب" + (orders.length !== ALL_ORDERS.length ? ` (من ${ALL_ORDERS.length})` : "");
    document.getElementById("tab-badge-orders").textContent = ALL_ORDERS.length;

    if (!orders.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">${emptyStateHTML("📦", "لا توجد طلبات معيّنة لك حالياً")}</td></tr>`;
      return;
    }

    tbody.innerHTML = orders.map(o => {
      const items    = o.order_items || [];
      const totalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
      const productsSummary = items.length
        ? (items.length === 1 ? `${esc(items[0].product_name)} × ${esc(items[0].quantity)}` : `${items.length} منتجات · ${totalQty} قطعة`)
        : "—";
      const completeBtn = o.assignment_status === "assigned"
        ? `<button class="btn-confirm" data-id="${esc(o.id)}" data-action="ord-complete" ${disabledInPreview()}>✅ تسليم</button>`
        : "";
      const revertBtn = o.assignment_status === "completed"
        ? `<button class="btn-undo" data-id="${esc(o.id)}" data-action="ord-revert" ${disabledInPreview()}>↩️ تراجع</button>`
        : "";
      const deleteBtn = `<button class="btn-delete" data-id="${esc(o.id)}" data-action="ord-delete" ${disabledInPreview()}>🗑 حذف</button>`;
      const callBtn = (o.phone || "").trim()
        ? `<a href="tel:${esc((o.phone || "").trim())}" class="btn-call">📞 اتصال</a>`
        : "";
      const blockBtn = `<button class="btn-block" data-id="${esc(o.id)}" data-action="ord-block" ${disabledInPreview()}>🚫 حظر</button>`;

      return `
        <tr data-id="${esc(o.id)}">
          <td class="nowrap"><strong>${esc(o.full_name || "—")}</strong><br><span style="font-size:10px;color:var(--text-muted);">#${esc(o.order_number ?? "—")}</span></td>
          <td class="nowrap" style="direction:ltr;">${esc(o.phone || "—")}</td>
          <td class="nowrap">${esc(o.wilaya || "—")}</td>
          <td>${productsSummary}</td>
          <td class="nowrap"><strong style="color:#1d4ed8;">${esc(fmtMoney(o.total_price))}</strong></td>
          <td class="nowrap">${confirmBadge(o.is_confirmed)}</td>
          <td class="nowrap">${assignBadge(o.assignment_status)}</td>
          <td class="nowrap">
            <div style="display:flex;gap:6px;">
              <button class="btn-receipt" data-id="${esc(o.id)}" data-action="ord-details">تفاصيل</button>
              ${callBtn}
              ${completeBtn}
              ${revertBtn}
              ${deleteBtn}
              ${blockBtn}
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  function showOrderModal(orderId) {
    const o = ALL_ORDERS.find(x => x.id === orderId);
    if (!o) return;
    ACTIVE_ORDER = o;
    const items  = o.order_items || [];
    const isHome = o.delivery_type === "home";

    const productsHTML = items.length
      ? `<div class="product-cards">${items.map(it => {
          const hasCost = it.purchase_cost !== null && it.purchase_cost !== undefined && it.purchase_cost !== "";
          const cost    = hasCost ? Number(it.purchase_cost) : null;
          const profit  = hasCost ? Number(it.subtotal || 0) - cost : null;
          /* حقل التكلفة والأرقام المحسوبة (الربح/حصتك) يظهران دائماً بمجرد
             إدخال/حفظ التكلفة — بغض النظر عن حالة تسليم الطلب. */
          const costAndProfitHTML = `
            <div class="product-cost-row">
              <label class="product-cost-lbl" for="cost-${esc(it.id)}">تكلفة الشراء</label>
              <input type="number" min="0" step="1" class="product-cost-input" id="cost-${esc(it.id)}"
                     data-item-id="${esc(it.id)}" data-order-id="${esc(o.id)}"
                     value="${hasCost ? esc(cost) : ""}" placeholder="0" ${disabledInPreview()}>
              <button class="btn-save-cost" data-action="save-cost" data-item-id="${esc(it.id)}" data-order-id="${esc(o.id)}" ${disabledInPreview()}>💾 حفظ</button>
            </div>
            ${hasCost ? `
              <div class="product-profit-row">
                <span>الربح: <strong>${esc(fmtMoney(profit))}</strong></span>
              </div>` : ``}`;
          return `
          <div class="product-card" style="flex-direction:column;align-items:stretch;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="product-icon">📦</div>
              <div class="product-info">
                <div class="product-name">${esc(it.product_name)}</div>
                <div class="product-meta">
                  <span class="product-qty">× ${esc(it.quantity)}</span>
                  <span class="product-price">${esc(fmtMoney(it.unit_price))}</span>
                </div>
              </div>
            </div>
            ${costAndProfitHTML}
          </div>`;
        }).join("")}</div>`
      : `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:10px 0;">لا توجد منتجات</p>`;

    const receiptHTML = o.receipt_url
      ? `<a href="${esc(o.receipt_url)}" target="_blank" rel="noopener" class="btn-receipt" style="display:inline-flex;margin-top:10px;">🧾 فتح وصل الدفع</a>`
      : "";

    document.getElementById("modalTitle").textContent = "طلب #" + (o.order_number ?? "—") + " — " + (o.full_name || "—");

    document.getElementById("modalBody").innerHTML = `
      <div class="modal-section">
        <div class="modal-section-title">👤 معلومات الزبون</div>
        <div class="modal-info-grid">
          <div class="modal-info-item"><span class="mi-lbl">الاسم</span><span class="mi-val">${esc(o.full_name || "—")}</span></div>
          <div class="modal-info-item"><span class="mi-lbl">الهاتف</span><span class="mi-val" dir="ltr">${esc(o.phone || "—")}</span></div>
        </div>
      </div>

      <div class="modal-section">
        <div class="modal-section-title">🚚 معلومات التوصيل</div>
        <div class="modal-info-grid">
          <div class="modal-info-item"><span class="mi-lbl">الولاية</span><span class="mi-val">${esc(o.wilaya || "—")}</span></div>
          <div class="modal-info-item"><span class="mi-lbl">البلدية</span><span class="mi-val">${esc(o.commune || "—")}</span></div>
          ${isHome ? `<div class="modal-info-item full"><span class="mi-lbl">العنوان</span><span class="mi-val">${esc(o.address || "—")}</span></div>` : ""}
          <div class="modal-info-item"><span class="mi-lbl">طريقة التوصيل</span><span class="mi-val">${esc(DT_LABELS[o.delivery_type] || o.delivery_type || "—")}</span></div>
          <div class="modal-info-item"><span class="mi-lbl">طريقة الدفع</span><span class="mi-val">${esc(PM_LABELS[o.payment_method] || o.payment_method || "—")}</span></div>
        </div>
        ${receiptHTML}
      </div>

      <div class="modal-section">
        <div class="modal-section-title">📦 المنتجات المطلوبة</div>
        ${productsHTML}
      </div>

      <div class="modal-section">
        <div class="modal-section-title">💰 ملخص السعر</div>
        <div class="price-summary-box">
          <div class="price-row"><span>مجموع المنتجات</span><span class="pv">${esc(fmtMoney(o.subtotal))}</span></div>
          <div class="price-row"><span>التوصيل</span><span class="pv" style="color:#059669;">${esc(fmtMoney(o.shipping_fee))}</span></div>
          <div class="price-row grand"><span>الإجمالي الكلي</span><span class="pv">${esc(fmtMoney(o.total_price))}</span></div>
        </div>
      </div>

      ${o.notes ? `
      <div class="modal-section">
        <div class="modal-section-title">📝 ملاحظات الزبون</div>
        <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:12px;font-size:13px;color:#78350f;line-height:1.6;">${esc(o.notes)}</div>
      </div>` : ""}

      <div class="modal-section">
        <div class="modal-section-title">🏷 حالة الطلب</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${confirmBadge(o.is_confirmed)}
          ${assignBadge(o.assignment_status)}
        </div>
      </div>`;

    document.getElementById("modalFooter").innerHTML = o.assignment_status === "assigned"
      ? `<button class="btn-deliver" data-id="${esc(o.id)}" data-action="ord-complete" ${disabledInPreview()}>✅ تم تسليم الطلب</button>`
      : o.assignment_status === "completed"
        ? `<button class="btn-deliver" disabled>✔ تم التسليم</button>`
        : "";

    openModal();
  }

  async function handleOrderComplete(orderId, btn) {
    if (PREVIEW_MODE) return;
    if (!confirm("هل تريد تأكيد تسليم هذا الطلب؟")) return;
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      await markOrderCompleted(orderId);
      const o = ALL_ORDERS.find(x => x.id === orderId);
      if (o) {
        o.assignment_status = "completed";
        o.completed_by      = CURRENT_STAFF_ID;
        o.completed_at       = new Date().toISOString();
      }
      renderOrdersTable(getFilteredOrders());
      if (ACTIVE_ORDER?.id === orderId) showOrderModal(orderId);
    } catch (err) {
      console.error("Complete order error:", err);
      showToast("❌ فشل تحديث الطلب: " + (err.message || ""), "error");
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  async function handleOrderRevert(orderId, btn) {
    if (PREVIEW_MODE) return;
    if (!confirm('هل تريد التراجع عن هذا الطلب وإرجاعه إلى "معيّن لك"؟')) return;
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      await revertOrderToAssigned(orderId);
      const o = ALL_ORDERS.find(x => x.id === orderId);
      if (o) {
        o.assignment_status = "assigned";
        o.completed_by      = null;
        o.completed_at      = null;
      }
      renderOrdersTable(getFilteredOrders());
      if (ACTIVE_ORDER?.id === orderId) showOrderModal(orderId);
    } catch (err) {
      console.error("Revert order error:", err);
      showToast("❌ فشل التراجع: " + (err.message || ""), "error");
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  async function handleOrderDelete(orderId, btn) {
    if (PREVIEW_MODE) return;
    const order = ALL_ORDERS.find(x => x.id === orderId);
    const name  = order?.full_name || "هذا الطلب";
    if (!confirm(`هل أنت متأكد أنك تريد حذف طلب "${name}"؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      await deleteOrder(orderId);
      ALL_ORDERS = ALL_ORDERS.filter(x => x.id !== orderId);
      renderOrdersTable(getFilteredOrders());
      if (ACTIVE_ORDER?.id === orderId) closeModal();
    } catch (err) {
      console.error("Delete order error:", err);
      showToast("❌ فشل حذف الطلب: " + (err.message || ""), "error");
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  /* ── حظر العميل — يُدرج صفاً في blocked_customers برقم هاتف هذا
     الطلب. الحظر الفعلي يُنفَّذ لاحقاً عبر trigger على orders نفسها
     (انظر add-blocked-customers-system.sql) — أي طلب جديد بنفس الرقم
     يُرفض من القاعدة مباشرة، وليس فقط من الواجهة. سياسة RLS تسمح
     للبائع بحظر رقم فقط إن ظهر على أحد طلباته المعيّنة له. ── */
  async function handleBlockCustomer(orderId, btn) {
    if (PREVIEW_MODE) return;
    const order = ALL_ORDERS.find(x => x.id === orderId);
    const phone = (order?.phone || "").trim();
    if (!phone) return;
    if (!confirm("هل أنت متأكد من حظر هذا العميل؟")) return;
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      const { error } = await supabase
        .from("blocked_customers")
        .insert({ phone, blocked_by: CURRENT_STAFF_ID });
      if (error) {
        if (error.code === "23505") {
          showToast("⚠️ هذا العميل محظور بالفعل", "error");
        } else {
          throw error;
        }
      } else {
        showToast("✅ تم حظر العميل", "success");
      }
    } catch (err) {
      console.error("Block customer error:", err);
      showToast("❌ فشل حظر العميل: " + (err.message || ""), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  /* ── تكلفة الشراء لكل كتاب — يُحفظ في order_items.purchase_cost.
     الصلاحية والتحقق (order_id يعود لطلب مُعيَّن لك) مفروضان على
     القاعدة (RLS + guard_order_items_cost_edit()) — حفظ الأدمن لاحقاً
     يطغى دائماً على ما أدخلتَه هنا، بدون أي تعارض. ── */
  async function handleSaveCost(itemId, orderId, btn) {
    if (PREVIEW_MODE) return;
    const input = document.getElementById(`cost-${itemId}`);
    if (!input) return;

    const raw  = input.value.trim();
    const cost = raw === "" ? null : Number(raw);
    if (raw !== "" && (isNaN(cost) || cost < 0)) {
      alert("❌ أدخل قيمة رقمية صحيحة للتكلفة.");
      return;
    }

    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳";

    try {
      const { data, error } = await supabase
        .from("order_items")
        .update({ purchase_cost: cost })
        .eq("id", itemId)
        .select("purchase_cost")
        .single();
      if (error) throw error;

      const order = ALL_ORDERS.find(o => o.id === orderId);
      const item  = order?.order_items?.find(it => it.id === itemId);
      if (item) item.purchase_cost = data.purchase_cost;

      renderOrderStats(ALL_ORDERS);
      if (ACTIVE_ORDER?.id === orderId) showOrderModal(orderId);
    } catch (err) {
      console.error("Save purchase cost error:", err);
      alert("❌ فشل حفظ التكلفة:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     MY ASSIGNED MESSAGES
  ═══════════════════════════════════════════════════════════ */
  function getFilteredMyMessages() {
    const q = (document.getElementById("msgSearchInput")?.value || "").trim().toLowerCase();
    if (!q) return ALL_MESSAGES;
    return ALL_MESSAGES.filter(m =>
      (m.name    || "").toLowerCase().includes(q) ||
      (m.contact || "").includes(q) ||
      (m.message || "").toLowerCase().includes(q)
    );
  }

  function renderMsgMobileCards(messages) {
    const container = document.getElementById("msgMobileCards");
    if (!container) return;
    if (!messages.length) {
      container.innerHTML = emptyStateHTML("✉️", "لا توجد رسائل معيّنة لك حالياً");
      return;
    }
    container.innerHTML = messages.map(m => `
      <div class="m-msg-card" data-msg-id="${esc(m.id)}" style="background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;box-shadow:var(--shadow-sm);cursor:pointer;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;">
          <strong>${esc(m.name || "—")}</strong>
          <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${esc(fmtDate(m.created_at))}</span>
        </div>
        <div style="font-size:13px;color:var(--text-light);margin-bottom:8px;" dir="ltr">${esc(m.contact || "—")}</div>
        <div style="font-size:13px;margin-bottom:10px;">${esc(m.message || "—")}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          ${assignBadge(m.assignment_status)}
          ${m.assignment_status === "assigned" ? `<button class="btn-confirm" data-msg-id="${esc(m.id)}" data-action="msg-complete" style="font-size:12px;padding:6px 10px;" ${disabledInPreview()}>✅ إنهاء</button>` : ""}
        </div>
      </div>`).join("");
  }

  function renderMessagesTable(messages) {
    renderMsgMobileCards(messages);
    const tbody = document.getElementById("msgTbody");
    document.getElementById("msgCount").textContent =
      messages.length + " رسالة" + (messages.length !== ALL_MESSAGES.length ? ` (من ${ALL_MESSAGES.length})` : "");
    document.getElementById("tab-badge-messages").textContent = ALL_MESSAGES.length;

    if (!messages.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">${emptyStateHTML("✉️", "لا توجد رسائل معيّنة لك حالياً")}</td></tr>`;
      return;
    }

    tbody.innerHTML = messages.map(m => `
      <tr data-msg-id="${esc(m.id)}" style="cursor:pointer;">
        <td class="nowrap"><strong>${esc(m.name || "—")}</strong></td>
        <td class="nowrap" style="direction:ltr;">${esc(m.contact || "—")}</td>
        <td><div class="msg-text">${esc(m.message || "—")}</div></td>
        <td class="nowrap">${assignBadge(m.assignment_status)}</td>
        <td class="nowrap" style="font-size:12px;color:var(--text-light);">${esc(fmtDate(m.created_at))}</td>
        <td class="nowrap">
          <div style="display:flex;gap:6px;">
            <a href="tel:${esc(m.contact || "")}" class="btn-receipt">📞</a>
            ${m.assignment_status === "assigned" ? `<button class="btn-confirm" data-msg-id="${esc(m.id)}" data-action="msg-complete" ${disabledInPreview()}>✅ إنهاء</button>` : ""}
          </div>
        </td>
      </tr>`).join("");
  }

  /* ── Quick-add book (pending admin review) ───────────────── */
  let MY_SUBMISSIONS = [];

  function submissionStatusBadge(status) {
    return status === "published"
      ? `<span class="badge badge-status-published">✅ منشور</span>`
      : `<span class="badge badge-pending">⏳ بانتظار المراجعة</span>`;
  }

  function renderMySubmissions(list) {
    const wrap = document.getElementById("qaddListWrap");
    if (!wrap) return;
    if (!list.length) {
      wrap.innerHTML = `<div class="empty">لم ترسل أي منتج بعد.</div>`;
      return;
    }
    wrap.innerHTML = list.map(p => `
      <div class="qadd-item">
        ${p.main_image ? `<img src="${esc(p.main_image)}" alt="">` : `<div class="qadd-item-name">📦</div>`}
        <div style="flex:1;">
          <div class="qadd-item-name">${esc(p.product_name || "—")}</div>
          <div style="font-size:11px;color:var(--text-light);margin-top:2px;">${esc(fmtDate(p.submitted_at))}</div>
        </div>
        ${submissionStatusBadge(p.status)}
      </div>`).join("");
  }

  /* Same bucket/path convention as admin/products-manager.js uploadMainImage() */
  async function uploadQaddImage(file) {
    const box  = document.getElementById("qaddUploadBox");
    const prev = document.getElementById("qaddUploadPrev");
    prev.innerHTML = `<div>⏳ جاري الرفع...</div>`;
    try {
      const ext  = file.name.split(".").pop();
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

      const { error: upErr } = await supabase.storage.from("admin-product-images").upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from("admin-product-images").getPublicUrl(path);
      document.getElementById("qaddImageUrl").value = publicUrl;
      prev.innerHTML = `<img src="${esc(publicUrl)}" alt=""><div>✅ تم رفع الصورة</div>`;
      box.classList.add("loaded");
    } catch (err) {
      prev.innerHTML = `<div>📷 انقر لرفع صورة المنتج</div>`;
      showToast("❌ فشل رفع الصورة: " + (err.message || ""), "error");
    }
  }

  /* The only columns sent here are product_name/main_image/category/status/
     is_active/submitted_by/submitted_at/submission_note — everything else
     (price, stock, slug, SEO...) is forced server-side by
     guard_seller_product_insert() regardless of what's sent, so there is
     nothing to smuggle in even from a modified client. */
  async function submitQuickAddBook(e) {
    e.preventDefault();
    if (PREVIEW_MODE) return;

    const btn        = document.getElementById("qaddSubmitBtn");
    const statusMsg   = document.getElementById("qaddStatusMsg");
    const title       = document.getElementById("qaddTitle").value.trim();
    const imageUrl    = document.getElementById("qaddImageUrl").value;
    const category    = document.getElementById("qaddCategory").value;
    const note        = document.getElementById("qaddNote").value.trim();

    statusMsg.textContent = "";
    if (!title || !imageUrl || !category) {
      statusMsg.textContent = "❌ اسم المنتج وصورة المنتج والفئة مطلوبون";
      statusMsg.style.color = "#b91c1c";
      return;
    }

    btn.disabled = true; btn.textContent = "⏳ جاري الإرسال...";
    try {
      const { error } = await supabase.from("admin_products_catalog").insert({
        product_name:      title,
        main_image:        imageUrl,
        category:          "books",
        product_category:  category,
        status:            "pending_review",
        is_active:         false,
        submitted_by:      CURRENT_STAFF_ID,
        submitted_at:      new Date().toISOString(),
        submission_note:   note || null,
      });
      if (error) throw error;

      statusMsg.textContent = "تم إرسال المنتج للمراجعة، سيقوم الأدمن بإكمال باقي التفاصيل قبل نشره.";
      statusMsg.style.color = "#0F5132";
      document.getElementById("qaddForm").reset();
      document.getElementById("qaddImageUrl").value = "";
      document.getElementById("qaddCategory").value = "";
      document.getElementById("qaddUploadBox").classList.remove("loaded");
      document.getElementById("qaddUploadPrev").innerHTML = `<div>📷 انقر لرفع صورة المنتج</div>`;

      MY_SUBMISSIONS = await fetchMySubmissions();
      renderMySubmissions(MY_SUBMISSIONS);
    } catch (err) {
      statusMsg.textContent = "❌ فشل الإرسال: " + (err.message || "");
      statusMsg.style.color = "#b91c1c";
    } finally {
      btn.disabled = false; btn.textContent = "📤 إرسال للمراجعة";
    }
  }

  /* ── Toggle the profile edit form open/closed. Simple show/hide,
     no modal — matches the rest of this page's avoidance of
     over-engineering for a single form. ── */
  function toggleProfileEditForm() {
    const form = document.getElementById("profileEditForm");
    if (!form) return;
    form.style.display = form.style.display === "none" ? "block" : "none";
  }

  /* ── Submit a profile change request. This is an INSERT-only write —
     sellers never update staff_accounts/seller_profiles themselves;
     an admin approves/rejects this row elsewhere, and that approval is
     what actually applies the change. RLS also enforces at most one
     'pending' request per seller at a time via a partial unique index,
     which surfaces here as a Postgres 23505 unique-violation. ── */
  async function submitProfileChangeRequest(e) {
    e.preventDefault();
    if (PREVIEW_MODE) return;

    const btn      = document.getElementById("profileEditSubmitBtn");
    const statusMsg = document.getElementById("profileEditStatusMsg");
    const fullName        = document.getElementById("profFullName").value.trim();
    const phone           = document.getElementById("profPhone").value.trim();
    const boutiqueName    = document.getElementById("profBoutiqueName").value.trim();
    const boutiqueDesc    = document.getElementById("profBoutiqueDesc").value.trim();
    const wilaya          = document.getElementById("profWilaya").value.trim();
    const commune         = document.getElementById("profCommune").value.trim();
    const socialLink      = document.getElementById("profSocialLink").value.trim();

    statusMsg.textContent = "";
    if (!fullName) {
      statusMsg.textContent = "❌ اسم البائع مطلوب";
      statusMsg.style.color = "#b91c1c";
      return;
    }

    btn.disabled = true; btn.textContent = "⏳ جاري الإرسال...";
    try {
      const { error } = await supabase.from("seller_profile_change_requests").insert({
        seller_id:                       CURRENT_STAFF_ID,
        requested_full_name:             fullName,
        requested_phone:                 phone || null,
        requested_boutique_name:         boutiqueName || null,
        requested_boutique_description:  boutiqueDesc || null,
        requested_wilaya:                wilaya || null,
        requested_commune:               commune || null,
        requested_social_link:           socialLink || null,
      });
      if (error) throw error;

      LATEST_PROFILE_REQUEST = await fetchLatestProfileChangeRequest();
      renderProfile(CURRENT_STAFF, SELLER_PROFILE, LATEST_PROFILE_REQUEST);
    } catch (err) {
      statusMsg.textContent = (err && err.code === "23505")
        ? "⚠️ لديك بالفعل طلب قيد المراجعة"
        : "❌ فشل الإرسال: " + (err.message || "");
      statusMsg.style.color = "#b91c1c";
      btn.disabled = false; btn.textContent = "💾 حفظ التغييرات";
    }
  }

  function showMessageModal(msgId) {
    const m = ALL_MESSAGES.find(x => x.id === msgId);
    if (!m) return;
    document.getElementById("modalFooter").innerHTML = "";
    document.getElementById("modalTitle").textContent = "رسالة من: " + (m.name || "—");
    const completeBtn = m.assignment_status === "assigned"
      ? `<button class="btn-confirm" data-msg-id="${esc(m.id)}" data-action="msg-complete" ${disabledInPreview()}>✅ تم إنهاء المتابعة</button>`
      : "";
    document.getElementById("modalBody").innerHTML = `
      <div class="m-section">
        <div class="m-title">معلومات المرسل</div>
        <div class="info-grid">
          <div class="info-item"><span class="i-lbl">الاسم</span><span class="i-val">${esc(m.name || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">رقم الهاتف</span><span class="i-val" style="direction:ltr;">${esc(m.contact || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">التاريخ</span><span class="i-val" style="font-size:12px;">${esc(fmtDate(m.created_at))}</span></div>
        </div>
      </div>
      <div class="m-section">
        <div class="m-title">نص الرسالة</div>
        <div class="msg-full">${esc(m.message || "—")}</div>
      </div>
      <div class="m-section">
        <div class="m-title">الإجراءات</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <a href="tel:${esc(m.contact || "")}" class="btn-receipt" style="font-size:14px;padding:10px 20px;">📞 اتصال</a>
          ${completeBtn}
        </div>
      </div>`;
    openModal();
  }

  async function handleMessageComplete(msgId, btn) {
    if (PREVIEW_MODE) return;
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      await markMessageCompleted(msgId);
      const m = ALL_MESSAGES.find(x => x.id === msgId);
      if (m) m.assignment_status = "completed";
      renderMessagesTable(getFilteredMyMessages());
      if (document.getElementById("modal").classList.contains("open")) showMessageModal(msgId);
    } catch (err) {
      console.error("Complete message error:", err);
      alert("❌ فشل تحديث الرسالة:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     LIVE NOTIFICATIONS — Supabase Realtime، تظهر فقط لما يُعيَّن لهذا البائع
  ═══════════════════════════════════════════════════════════ */
  function showToast(message, type) {
    const el = document.createElement("div");
    el.className = "live-toast" + (type === "error" ? " error" : "");
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }

  function updateLiveBadges() {
    const lo = document.getElementById("liveBadgeOrders");
    const lm = document.getElementById("liveBadgeMessages");
    if (lo) { lo.style.display = UNSEEN_ORDERS   > 0 ? "inline-flex" : "none"; lo.textContent = UNSEEN_ORDERS; }
    if (lm) { lm.style.display = UNSEEN_MESSAGES > 0 ? "inline-flex" : "none"; lm.textContent = UNSEEN_MESSAGES; }
  }

  function setupRealtime() {
    supabase
      .channel("seller-assignments-" + CURRENT_STAFF_ID)
      .on("postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `assigned_to=eq.${CURRENT_STAFF_ID}` },
          payload => {
            const o = payload.new;
            const idx = ALL_ORDERS.findIndex(x => x.id === o.id);
            if (idx === -1) { ALL_ORDERS.unshift(o); UNSEEN_ORDERS++; showToast("📦 طلب جديد معيّن لك: " + (o.full_name || "—")); }
            else            { ALL_ORDERS[idx] = { ...ALL_ORDERS[idx], ...o }; }
            updateLiveBadges();
            renderOrdersTable(getFilteredOrders());
          })
      .on("postgres_changes",
          { event: "*", schema: "public", table: "messages", filter: `assigned_to=eq.${CURRENT_STAFF_ID}` },
          payload => {
            const m = payload.new;
            const idx = ALL_MESSAGES.findIndex(x => x.id === m.id);
            if (idx === -1) { ALL_MESSAGES.unshift(m); UNSEEN_MESSAGES++; showToast("✉️ رسالة جديدة معيّنة لك: " + (m.name || "—")); }
            else            { ALL_MESSAGES[idx] = { ...ALL_MESSAGES[idx], ...m }; }
            updateLiveBadges();
            renderMessagesTable(getFilteredMyMessages());
          })
      .subscribe();
  }

  /* ── Events ────────────────────────────────────────────── */
  function bindEvents() {
    document.getElementById("logoutBtn").addEventListener("click", async () => {
      await supabase.auth.signOut();
      location.href = "../admin/login.html";
    });

    /* ── Tab switching ──────────────────────────────────────── */
    document.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-" + tab).classList.add("active");
        document.getElementById("pageTitle").textContent =
          tab === "orders"   ? "📦 طلباتي المعيّنة" :
          tab === "messages" ? "✉️ رسائلي المعيّنة" :
          tab === "addbook"  ? "➕ إضافة منتج" :
                               "👤 الملف الشخصي";

        if (tab === "orders")   { UNSEEN_ORDERS   = 0; }
        if (tab === "messages") { UNSEEN_MESSAGES = 0; }
        updateLiveBadges();
      });
    });

    /* ── Modal close ─────────────────────────────────────────── */
    document.getElementById("modalClose").addEventListener("click", closeModal);
    document.getElementById("modal").addEventListener("click", e => {
      if (e.target.id === "modal") closeModal();
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

    document.getElementById("modalBody").addEventListener("click", async e => {
      const btn = e.target.closest("[data-action='save-cost']");
      if (!btn) return;
      await handleSaveCost(btn.dataset.itemId, btn.dataset.orderId, btn);
    });

    /* ── My Orders ───────────────────────────────────────────── */
    document.getElementById("ordSearchInput").addEventListener("input",
      () => renderOrdersTable(getFilteredOrders()));

    document.getElementById("ordStatusFilter").addEventListener("change",
      () => renderOrdersTable(getFilteredOrders()));

    document.getElementById("ordRefreshBtn").addEventListener("click", async () => {
      const btn = document.getElementById("ordRefreshBtn");
      btn.disabled = true; btn.textContent = "⏳ جاري التحديث...";
      try {
        if (PREVIEW_MODE) {
          const { data, error } = await supabase.rpc("impersonation_get_orders", { target_staff_id: PREVIEW_TARGET_ID });
          if (error) throw error;
          ALL_ORDERS = data || [];
        } else {
          ALL_ORDERS = await fetchMyOrders();
        }
        renderOrdersTable(getFilteredOrders());
      } catch (err) { alert("❌ فشل التحديث: " + (err.message || "")); }
      btn.disabled = false; btn.textContent = "↻ تحديث";
    });

    document.getElementById("ordersTbody").addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "ord-details")  showOrderModal(btn.dataset.id);
      if (btn.dataset.action === "ord-complete")  await handleOrderComplete(btn.dataset.id, btn);
      if (btn.dataset.action === "ord-revert")    await handleOrderRevert(btn.dataset.id, btn);
      if (btn.dataset.action === "ord-delete")    await handleOrderDelete(btn.dataset.id, btn);
      if (btn.dataset.action === "ord-block")     await handleBlockCustomer(btn.dataset.id, btn);
    });

    document.getElementById("ordersMobileCards").addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "ord-details")  showOrderModal(btn.dataset.id);
      if (btn.dataset.action === "ord-complete")  await handleOrderComplete(btn.dataset.id, btn);
      if (btn.dataset.action === "ord-revert")    await handleOrderRevert(btn.dataset.id, btn);
      if (btn.dataset.action === "ord-delete")    await handleOrderDelete(btn.dataset.id, btn);
      if (btn.dataset.action === "ord-block")     await handleBlockCustomer(btn.dataset.id, btn);
    });

    /* ── My Messages ─────────────────────────────────────────── */
    document.getElementById("msgSearchInput").addEventListener("input",
      () => renderMessagesTable(getFilteredMyMessages()));

    document.getElementById("msgRefreshBtn").addEventListener("click", async () => {
      const btn = document.getElementById("msgRefreshBtn");
      btn.disabled = true; btn.textContent = "⏳ جاري التحديث...";
      try {
        if (PREVIEW_MODE) {
          const { data, error } = await supabase.rpc("impersonation_get_messages", { target_staff_id: PREVIEW_TARGET_ID });
          if (error) throw error;
          ALL_MESSAGES = data || [];
        } else {
          ALL_MESSAGES = await fetchMyMessages();
        }
        renderMessagesTable(getFilteredMyMessages());
      } catch (err) { alert("❌ فشل التحديث: " + (err.message || "")); }
      btn.disabled = false; btn.textContent = "↻ تحديث";
    });

    document.getElementById("msgTbody").addEventListener("click", async e => {
      const completeBtn = e.target.closest("[data-action='msg-complete']");
      if (completeBtn) { await handleMessageComplete(completeBtn.dataset.msgId, completeBtn); return; }
      const row = e.target.closest("tr[data-msg-id]");
      if (row) showMessageModal(row.dataset.msgId);
    });

    document.getElementById("msgMobileCards").addEventListener("click", async e => {
      const completeBtn = e.target.closest("[data-action='msg-complete']");
      if (completeBtn) { await handleMessageComplete(completeBtn.dataset.msgId, completeBtn); return; }
      const card = e.target.closest(".m-msg-card");
      if (card) showMessageModal(card.dataset.msgId);
    });

    /* ── Quick-add book ──────────────────────────────────────── */
    document.getElementById("qaddUploadBox").addEventListener("click", () => {
      if (PREVIEW_MODE) return;
      document.getElementById("qaddImageInput").click();
    });
    document.getElementById("qaddImageInput").addEventListener("change", e => {
      const file = e.target.files?.[0];
      if (file) uploadQaddImage(file);
    });
    document.getElementById("qaddForm").addEventListener("submit", submitQuickAddBook);

    /* ── Profile tab — delegated, since renderProfile() rebuilds the
       tab's innerHTML (button/form) on every render. ── */
    document.getElementById("tab-profile").addEventListener("click", e => {
      if (e.target.closest("#profileEditBtn")) toggleProfileEditForm();
    });
    document.getElementById("tab-profile").addEventListener("submit", e => {
      if (e.target.id === "profileEditForm") submitProfileChangeRequest(e);
    });

    /* ── Modal footer — actions that stay pinned at the bottom ── */
    document.getElementById("modalFooter").addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "ord-complete") await handleOrderComplete(btn.dataset.id, btn);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     "VIEW AS USER" — read-only preview boot path.
     No real session is ever created for the target staff member;
     every RPC re-checks admin status server-side. See
     supabase-impersonation-system.sql.
  ═══════════════════════════════════════════════════════════ */
  function clearImpersonationState() {
    sessionStorage.removeItem("impersonation_active");
    sessionStorage.removeItem("impersonation_target_id");
    sessionStorage.removeItem("impersonation_target_email");
    sessionStorage.removeItem("impersonation_target_name");
    sessionStorage.removeItem("impersonation_started_at");
  }

  function endPreview(message) {
    if (PREVIEW_TIMER_INTERVAL) clearInterval(PREVIEW_TIMER_INTERVAL);
    clearImpersonationState();
    if (message) alert(message);
    location.href = "../admin/admin.html";
  }

  function startExpiryTimer(expiresAt) {
    function tick() {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) { endPreview("⏱ انتهت مدة المعاينة (30 دقيقة)."); return; }
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      const el = document.getElementById("previewCountdown");
      if (el) el.textContent = `⏱ تنتهي بعد ${mins}:${String(secs).padStart(2, "0")}`;
    }
    tick();
    PREVIEW_TIMER_INTERVAL = setInterval(tick, 1000);
  }

  function renderPreviewBanner(target, expiresAt) {
    const banner = document.getElementById("previewBanner");
    banner.style.display = "flex";
    banner.innerHTML = `
      <span>👁 تعرض كـ: <strong>${esc(target.email || target.full_name || "—")}</strong> (وضع المعاينة — للقراءة فقط)</span>
      <span id="previewCountdown" style="margin-right:auto;"></span>
      <button class="btn-return-admin" id="returnAdminBtn">↩ العودة للأدمن</button>`;
    document.getElementById("returnAdminBtn").addEventListener("click", () => endPreview());
    startExpiryTimer(expiresAt);
  }

  async function bootPreviewMode(targetId) {
    const startedAtStr = sessionStorage.getItem("impersonation_started_at");
    const startedAt     = startedAtStr ? new Date(startedAtStr).getTime() : Date.now();
    const expiresAt     = startedAt + PREVIEW_EXPIRY_MS;

    if (Date.now() >= expiresAt) { endPreview("⏱ انتهت مدة المعاينة (30 دقيقة)."); return; }

    /* Lightweight client-side check only — a UX nicety to avoid flashing
       UI before redirecting. The real boundary is is_admin() inside every
       RPC call below; a non-admin gets a Postgres exception, not data. */
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { clearImpersonationState(); location.href = "../admin/login.html"; return; }

    const { data: me } = await supabase
      .from("staff_accounts")
      .select("role, is_active")
      .eq("id", session.user.id)
      .maybeSingle();

    if (!me || !me.is_active || me.role !== "admin") {
      endPreview("🚫 وضع المعاينة متاح فقط للأدمن.");
      return;
    }

    PREVIEW_MODE      = true;
    PREVIEW_TARGET_ID = targetId;
    document.getElementById("sellerHeader").style.display = "none";

    const { data: profileRows, error: profErr } =
      await supabase.rpc("impersonation_get_staff_profile", { target_staff_id: targetId });
    if (profErr || !profileRows || !profileRows.length) {
      endPreview("❌ تعذّر تحميل بيانات المعاينة:\n" + (profErr?.message || "مستخدم غير صالح أو غير نشط."));
      return;
    }
    const target = profileRows[0];

    const [ordersRes, messagesRes] = await Promise.all([
      supabase.rpc("impersonation_get_orders",   { target_staff_id: targetId }),
      supabase.rpc("impersonation_get_messages", { target_staff_id: targetId }),
    ]);
    if (ordersRes.error)   throw ordersRes.error;
    if (messagesRes.error) throw messagesRes.error;

    ALL_ORDERS   = ordersRes.data   || [];
    ALL_MESSAGES = messagesRes.data || [];

    renderPreviewBanner(target, expiresAt);
    renderOrdersTable(getFilteredOrders());
    renderMessagesTable(getFilteredMyMessages());
    bindEvents();
    /* No setupRealtime() in preview — a temporary read-only inspection
       doesn't need live updates, and avoids opening a channel scoped to
       someone else's id from the admin's own session. */
  }

  /* ── Boot ──────────────────────────────────────────────── */
  async function boot() {
    try {
      const params           = new URLSearchParams(location.search);
      const previewTargetId  = params.get("previewAs");
      const previewActive    = sessionStorage.getItem("impersonation_active") === "true";
      const storedTargetId   = sessionStorage.getItem("impersonation_target_id");

      if (previewTargetId && previewActive && storedTargetId === previewTargetId) {
        await bootPreviewMode(previewTargetId);
        return;
      }

      const staff = await authGuard();
      if (!staff) return;

      CURRENT_STAFF_ID = staff.id;
      CURRENT_STAFF    = staff;

      document.getElementById("sellerBadge").textContent =
        "🛒 بائع" + (staff.full_name ? " — " + staff.full_name : "");

      [ALL_ORDERS, ALL_MESSAGES, MY_SUBMISSIONS, SELLER_PROFILE, LATEST_PROFILE_REQUEST] = await Promise.all([
        fetchMyOrders(), fetchMyMessages(), fetchMySubmissions(),
        fetchSellerProfile(), fetchLatestProfileChangeRequest(),
      ]);

      renderProfile(CURRENT_STAFF, SELLER_PROFILE, LATEST_PROFILE_REQUEST);
      renderOrdersTable(getFilteredOrders());
      renderMessagesTable(getFilteredMyMessages());
      renderMySubmissions(MY_SUBMISSIONS);
      bindEvents();
      setupRealtime();

    } catch (err) {
      console.error("Boot error:", err);
      alert("❌ خطأ في تحميل الصفحة:\n" + (err.message || JSON.stringify(err)));
    }
  }

  boot();

})();
