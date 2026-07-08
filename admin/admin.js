/* ==========================================================
   admin.js — Derradj Shop | Admin Dashboard
   is_confirmed: NULL = قيد المعالجة | true = تم التأكيد
   BUILD: 2026-06-01-v6
   - Reads category + price FROM Supabase (after running SQL setup)
   - Products tab (admin_products_catalog) is fully owned by
     admin/products-manager.js — this file no longer touches it.
   - upsert replaces update/insert everywhere to avoid silent failures
   ========================================================== */
console.log('[admin.js] loaded — BUILD 2026-06-01-v6 — DB-driven category + price, upsert everywhere');

(function () {
  "use strict";

  /* ── Supabase ──────────────────────────────────────────── */
  /* Shared client (see supabase-client.js) — admin.js, products-manager.js
     and bestsellers.js all run on this page, so they must reuse the same
     GoTrueClient instance instead of each creating their own (multiple
     instances racing on token refresh silently breaks auth/session). */
  if (!window.sbClient) { alert("❌ Supabase غير محمّل."); return; }
  const supabase = window.sbClient;

  /* ── State ─────────────────────────────────────────────── */
  let ALL_ORDERS   = [];
  let ACTIVE_ORDER = null;
  let ALL_MESSAGES = [];
  let ALL_REVIEWS  = [];
  let ALL_SELLERS  = [];
  let EDIT_REVIEW_ID    = null;
  let ORD_ASSIGN_FILTER = '';      /* '' | 'unassigned' | 'completed' | <sellerId> */
  let CURRENT_ROLE = '';
  let CURRENT_STAFF_ID = '';
  let CURRENT_STAFF_EMAIL = '';
  let UNSEEN_ORDERS   = 0;
  let UNSEEN_MESSAGES = 0;

  /* Only an admin ever reaches this page — authGuard() redirects sellers
     away before this runs — so this is always true in practice. Kept as
     an explicit check (not hardcoded true) for defense-in-depth. */
  function isAdmin() { return CURRENT_ROLE === 'admin'; }

  /* ── Assignment status labels ──────────────────────────── */
  const ASSIGN_LABELS = {
    pending_admin: '🆕 غير معيّن',
    assigned:      '👤 معيّن',
    completed:     '✅ مكتمل',
  };

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

  function assignBadge(status) {
    return `<span class="badge badge-assign-${esc(status)}">${esc(ASSIGN_LABELS[status] || status)}</span>`;
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

    if (error || !staff) {
      await supabase.auth.signOut();
      location.href = "login.html";
      return null;
    }

    /* حساب بائع (Seller) وصل لهذه الصفحة (رابط محفوظ/تبويب قديم) —
       يُحوَّل إلى لوحة البائع بدل تحميل واجهة الأدمن أو رفضه فقط. */
    if (String(staff.role || "").toLowerCase() === "seller") {
      location.href = "../seller/dashboard.html";
      return null;
    }

    if (!staff.is_active || String(staff.role || "").toLowerCase() !== "admin") {
      await supabase.auth.signOut();
      location.href = "login.html";
      return null;
    }
    return staff;
  }

  /* ─────────────────────────────────────────────────────────
     FETCH — الطلبات + منتجاتها في استعلام واحد
     RLS يحدد ما يُعاد فعلياً: الأدمن يرى كل الطلبات، والبائع
     (لو دخل هنا) لا يرى إلا ما عُيّن له — هذا الاستعلام نفسه
     لا يفرض أي قيد إضافي على الرؤية.
  ───────────────────────────────────────────────────────── */
  async function fetchOrders() {
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id, order_number, full_name, phone, address, wilaya, commune,
        delivery_type, shipping_fee, subtotal, total_price,
        payment_method, receipt_url, is_confirmed,
        notes, created_at,
        assigned_to, assigned_by, assigned_at, assignment_status,
        completed_by, completed_at,
        assigned_staff:staff_accounts!orders_assigned_to_fkey ( id, full_name, email ),
        order_items ( product_name, quantity, unit_price, subtotal )
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;
    return data || [];
  }

  /* ─────────────────────────────────────────────────────────
     FETCH — البائعون النشطون (لقائمة "تعيين لبائع")
     لا نُدرج أي بائع بشكل ثابت في الكود — كل القائمة من الجدول.
  ───────────────────────────────────────────────────────── */
  async function fetchSellers() {
    const { data, error } = await supabase
      .from("staff_accounts")
      .select("id, full_name, email")
      .eq("role", "seller")
      .eq("is_active", true)
      .order("full_name");
    if (error) throw error;
    return data || [];
  }

  /* ─────────────────────────────────────────────────────────
     ASSIGN / REASSIGN / REMOVE — الطلبات
  ───────────────────────────────────────────────────────── */
  async function assignOrder(orderId, sellerId) {
    const { error } = await supabase
      .from("orders")
      .update({
        assigned_to: sellerId,
        assigned_by: CURRENT_STAFF_ID,
        assigned_at: new Date().toISOString(),
        assignment_status: "assigned",
      })
      .eq("id", orderId);
    if (error) throw error;
  }

  async function removeOrderAssignment(orderId) {
    const { error } = await supabase
      .from("orders")
      .update({
        assigned_to: null,
        assigned_by: null,
        assigned_at: null,
        assignment_status: "pending_admin",
      })
      .eq("id", orderId);
    if (error) throw error;
  }

  /* ─────────────────────────────────────────────────────────
     ASSIGNMENT HISTORY — مشترك بين الطلبات والرسائل
  ───────────────────────────────────────────────────────── */
  async function fetchAssignmentHistory(entityType, entityId) {
    const { data, error } = await supabase
      .from("assignment_history")
      .select(`
        id, action, created_at,
        from_staff:staff_accounts!assignment_history_from_staff_id_fkey ( full_name ),
        to_staff:staff_accounts!assignment_history_to_staff_id_fkey ( full_name ),
        performer:staff_accounts!assignment_history_performed_by_fkey ( full_name )
      `)
      .eq("entity_type", entityType)
      .eq("entity_id", String(entityId))
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /* ─────────────────────────────────────────────────────────
     VIEW AS USER — معاينة للقراءة فقط، بدون أي جلسة دخول حقيقية
     للمستخدم المستهدف. كل RPC يتحقق من is_admin() في قاعدة
     البيانات نفسها، فهذه القائمة الأمامية فقط للعرض.
  ───────────────────────────────────────────────────────── */
  async function fetchImpersonationTargets() {
    const { data, error } = await supabase
      .from("staff_accounts")
      .select("id, full_name, email, role")
      .neq("role", "admin")
      .eq("is_active", true)
      .order("full_name");
    if (error) throw error;
    return data || [];
  }

  async function startImpersonation(targetId) {
    const { error } = await supabase.rpc("impersonation_start_log", { target_staff_id: targetId });
    if (error) throw error;
  }

  function buildViewAsModalHTML(targets) {
    if (!targets.length) {
      return `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0;">لا يوجد حسابات بائعين نشطة لمعاينتها حالياً.</p>`;
    }
    const options = targets.map(t =>
      `<option value="${esc(t.id)}">${esc(t.full_name || t.email)} — ${esc(t.role)}</option>`
    ).join("");
    return `
      <p style="font-size:13px;color:var(--text-light);margin-bottom:14px;line-height:1.6;">
        تعرض معاينة للقراءة فقط — تشاهد بيانات وواجهة المستخدم المختار تماماً كما يراها،
        لكن أزرار الإجراءات (مثل "إنهاء الطلب" أو تغيير توفر الكتب) تكون معطّلة.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <select class="filter-select" id="viewAsSelect" style="flex:1;min-width:180px;">
          ${options}
        </select>
        <button class="btn-confirm" id="viewAsStartBtn" data-action="start-impersonation">👁 بدء المعاينة</button>
      </div>`;
  }

  async function handleStartImpersonation(btn) {
    const select   = document.getElementById("viewAsSelect");
    const targetId = select?.value;
    if (!targetId) return;
    const target = (await fetchImpersonationTargets()).find(t => t.id === targetId);

    btn.disabled = true;
    btn.textContent = "⏳...";
    try {
      await startImpersonation(targetId);
      sessionStorage.setItem("impersonation_active", "true");
      sessionStorage.setItem("impersonation_target_id", targetId);
      sessionStorage.setItem("impersonation_target_email", target?.email || "");
      sessionStorage.setItem("impersonation_target_name", target?.full_name || "");
      sessionStorage.setItem("impersonation_started_at", new Date().toISOString());
      location.href = "../seller/dashboard.html?previewAs=" + encodeURIComponent(targetId);
    } catch (err) {
      console.error("Start impersonation error:", err);
      alert("❌ فشل بدء المعاينة:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = "👁 بدء المعاينة";
    }
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
      .select(`
        id, name, contact, message, created_at,
        assigned_to, assigned_by, assigned_at, assignment_status,
        assigned_staff:staff_accounts!messages_assigned_to_fkey ( id, full_name, email )
      `)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return data || [];
  }

  /* ─────────────────────────────────────────────────────────
     ASSIGN / REASSIGN / REMOVE — الرسائل
  ───────────────────────────────────────────────────────── */
  async function assignMessage(msgId, sellerId) {
    const { error } = await supabase
      .from("messages")
      .update({
        assigned_to: sellerId,
        assigned_by: CURRENT_STAFF_ID,
        assigned_at: new Date().toISOString(),
        assignment_status: "assigned",
      })
      .eq("id", msgId);
    if (error) throw error;
  }

  async function removeMessageAssignment(msgId) {
    const { error } = await supabase
      .from("messages")
      .update({
        assigned_to: null,
        assigned_by: null,
        assigned_at: null,
        assignment_status: "pending_admin",
      })
      .eq("id", msgId);
    if (error) throw error;
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
      tbody.innerHTML = `<tr><td colspan="6" class="empty">لا توجد رسائل</td></tr>`;
      return;
    }

    tbody.innerHTML = messages.map(m => `
      <tr data-msg-id="${esc(m.id)}" style="cursor:pointer;">
        <td class="nowrap"><strong>${esc(m.name || "—")}</strong></td>
        <td class="nowrap" style="direction:ltr;">${esc(m.contact || "—")}</td>
        <td><div class="msg-text">${esc(m.message || "—")}</div></td>
        <td class="nowrap">
          ${assignBadge(m.assignment_status)}
          ${m.assigned_staff ? `<div style="font-size:11px;color:var(--text-light);margin-top:3px;">${esc(m.assigned_staff.full_name || "")}</div>` : ""}
        </td>
        <td class="nowrap" style="font-size:12px;color:var(--text-light);">${esc(fmtDate(m.created_at))}</td>
        <td class="nowrap">
          <div class="actions-col">
            <a href="tel:${esc(m.contact || "")}" class="btn-receipt">📞 اتصال</a>
            ${isAdmin() ? `<button class="btn-delete" data-msg-id="${esc(m.id)}" data-action="delete-msg">🗑 حذف</button>` : ""}
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
      ${buildAssignmentSectionHTML(msg, "message")}
      <div class="m-section">
        <div class="m-title">الإجراءات</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <a href="tel:${esc(msg.contact || "")}" class="btn-receipt" style="font-size:14px;padding:10px 20px;">📞 اتصال</a>
          ${isAdmin() ? `<button class="btn-delete" data-msg-id="${esc(msg.id)}" data-action="delete-msg"
                  style="font-size:14px;padding:10px 20px;">🗑 حذف الرسالة</button>` : ""}
        </div>
      </div>`;
    openModal();
  }

  /* ─────────────────────────────────────────────────────────
     ASSIGNMENT SECTION — مشترك بين مودال الطلب ومودال الرسالة
  ───────────────────────────────────────────────────────── */
  function buildAssignmentSectionHTML(entity, entityType) {
    const status   = entity.assignment_status || "pending_admin";
    const assignee = entity.assigned_staff;

    /* Exactly one seller account exists in this system today (Mehdi) —
       so the decision is the literal two-button choice the workflow is
       built around: assign to that seller, or keep it with admin. If a
       second seller account is ever added, fall back to a dropdown
       instead of guessing which one was meant. */
    let adminControls = "";
    if (isAdmin()) {
      if (ALL_SELLERS.length <= 1) {
        const seller = ALL_SELLERS[0];
        adminControls = `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            ${seller ? `<button class="btn-confirm" data-action="assign-${entityType}" data-entity-id="${esc(entity.id)}" data-seller-id="${esc(seller.id)}">
              ➡️ تعيين لـ ${esc(seller.full_name || seller.email)}
            </button>` : ""}
            ${assignee ? `<button class="btn-delete" data-action="unassign-${entityType}" data-entity-id="${esc(entity.id)}">🔒 الاحتفاظ به مع الأدمن</button>` : ""}
          </div>`;
      } else {
        const sellerOptions = ALL_SELLERS.map(s =>
          `<option value="${esc(s.id)}" ${entity.assigned_to === s.id ? "selected" : ""}>${esc(s.full_name || s.email)}</option>`
        ).join("");
        adminControls = `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            <select class="filter-select" id="assignSellerSelect" style="flex:1;min-width:160px;">
              <option value="">— اختر بائع —</option>
              ${sellerOptions}
            </select>
            <button class="btn-confirm" data-action="assign-${entityType}" data-entity-id="${esc(entity.id)}">
              ${assignee ? "🔁 إعادة تعيين" : "➡️ تعيين لبائع"}
            </button>
            ${assignee ? `<button class="btn-delete" data-action="unassign-${entityType}" data-entity-id="${esc(entity.id)}">🔒 الاحتفاظ به مع الأدمن</button>` : ""}
          </div>`;
      }
    }

    return `
      <div class="m-section">
        <div class="m-title">التعيين</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="i-lbl">الحالة</span>
            <span class="i-val">${assignBadge(status)}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">البائع المعيّن</span>
            <span class="i-val">${assignee ? esc(assignee.full_name || assignee.email) : "غير معيّن"}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">تاريخ التعيين</span>
            <span class="i-val" style="font-size:12px;">${esc(fmtDate(entity.assigned_at))}</span>
          </div>
        </div>
        ${adminControls}
        ${isAdmin() ? `
        <button class="btn-receipt" data-action="show-history" data-entity-type="${entityType}" data-entity-id="${esc(entity.id)}"
                style="margin-top:10px;">🕘 سجل التعيينات</button>
        <div id="historyBox" style="margin-top:10px;"></div>` : ""}
      </div>`;
  }

  /* ─────────────────────────────────────────────────────────
     HANDLE ASSIGN / UNASSIGN — الطلبات والرسائل
  ───────────────────────────────────────────────────────── */
  async function handleAssign(entityType, entityId, btn) {
    const sellerId = btn.dataset.sellerId || document.getElementById("assignSellerSelect")?.value;
    if (!sellerId) { alert("⚠️ يرجى اختيار بائع أولاً"); return; }

    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳...";

    try {
      if (entityType === "order")   await assignOrder(entityId, sellerId);
      else                          await assignMessage(entityId, sellerId);

      const seller = ALL_SELLERS.find(s => s.id === sellerId);
      const list   = entityType === "order" ? ALL_ORDERS : ALL_MESSAGES;
      const row    = list.find(x => x.id === entityId);
      if (row) {
        row.assigned_to        = sellerId;
        row.assignment_status  = "assigned";
        row.assigned_at        = new Date().toISOString();
        row.assigned_staff     = seller ? { id: seller.id, full_name: seller.full_name, email: seller.email } : null;
      }

      if (entityType === "order") { renderTable(getFiltered()); if (ACTIVE_ORDER?.id === entityId) showOrderModal(entityId); }
      else                        { renderMessagesTable(getFilteredMessages()); showMessageModal(entityId); }
    } catch (err) {
      console.error("Assign error:", err);
      alert("❌ فشل التعيين:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  async function handleUnassign(entityType, entityId, btn) {
    btn.disabled = true;
    btn.textContent = "⏳...";

    try {
      if (entityType === "order")   await removeOrderAssignment(entityId);
      else                          await removeMessageAssignment(entityId);

      const list = entityType === "order" ? ALL_ORDERS : ALL_MESSAGES;
      const row  = list.find(x => x.id === entityId);
      if (row) {
        row.assigned_to       = null;
        row.assigned_by       = null;
        row.assigned_at       = null;
        row.assignment_status = "pending_admin";
        row.assigned_staff    = null;
      }

      if (entityType === "order") { renderTable(getFiltered()); if (ACTIVE_ORDER?.id === entityId) showOrderModal(entityId); }
      else                        { renderMessagesTable(getFilteredMessages()); showMessageModal(entityId); }
    } catch (err) {
      console.error("Unassign error:", err);
      alert("❌ فشل إزالة التعيين:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = "🔒 الاحتفاظ به مع الأدمن";
    }
  }

  /* ─────────────────────────────────────────────────────────
     HANDLE SHOW HISTORY
  ───────────────────────────────────────────────────────── */
  async function handleShowHistory(entityType, entityId, btn) {
    const box = document.getElementById("historyBox");
    if (!box) return;
    btn.disabled = true;
    box.innerHTML = `<p style="font-size:12px;color:var(--text-muted);">⏳ جاري التحميل...</p>`;
    try {
      const rows = await fetchAssignmentHistory(entityType, entityId);
      box.innerHTML = rows.length
        ? rows.map(h => `
            <div style="font-size:12px;color:var(--text-light);padding:6px 0;border-bottom:1px solid var(--bg);">
              <strong>${esc(fmtDate(h.created_at))}</strong> — ${esc(ASSIGN_HISTORY_LABELS[h.action] || h.action)}
              ${h.from_staff ? ` — من: ${esc(h.from_staff.full_name || "—")}` : ""}
              ${h.to_staff   ? ` — إلى: ${esc(h.to_staff.full_name || "—")}` : ""}
              — بواسطة: ${esc(h.performer?.full_name || "—")}
            </div>`).join("")
        : `<p style="font-size:12px;color:var(--text-muted);">لا يوجد سجل تعيينات لهذا العنصر</p>`;
    } catch (err) {
      console.error("History error:", err);
      box.innerHTML = `<p style="font-size:12px;color:var(--red);">❌ فشل تحميل السجل</p>`;
    }
    btn.disabled = false;
  }

  const ASSIGN_HISTORY_LABELS = {
    assigned:   "تعيين",
    reassigned: "إعادة تعيين",
    unassigned: "إزالة تعيين",
    completed:  "إنهاء",
  };

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
          <div class="m-card-actions">
            <button class="btn-details" data-id="${esc(o.id)}" data-action="details">عرض التفاصيل الكاملة</button>
            <button class="btn-copy-msg" data-id="${esc(o.id)}" data-action="copy-message">📋 نسخ رسالة التأكيد</button>
          </div>
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
          ${isAdmin() ? `<button class="btn-delete" data-msg-id="${esc(m.id)}" data-action="delete-msg">🗑 حذف</button>` : ""}
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
      /* فلترة حسب الحالة */
      if (st === "pending"   && o.is_confirmed === true)  return false;
      if (st === "confirmed" && o.is_confirmed !== true)  return false;

      /* فلترة حسب التعيين */
      if (ORD_ASSIGN_FILTER === "unassigned" && o.assignment_status !== "pending_admin") return false;
      if (ORD_ASSIGN_FILTER === "completed"  && o.assignment_status !== "completed")     return false;
      if (ORD_ASSIGN_FILTER && ORD_ASSIGN_FILTER !== "unassigned" && ORD_ASSIGN_FILTER !== "completed"
          && o.assigned_to !== ORD_ASSIGN_FILTER) return false;

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
      tbody.innerHTML = `<tr><td colspan="12" class="empty">لا توجد طلبات مطابقة</td></tr>`;
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
        : isAdmin()
          ? `<button class="btn-confirm" data-id="${esc(o.id)}" data-action="confirm">✅ تأكيد الطلب</button>`
          : ``;

      const assignCell = `
        ${assignBadge(o.assignment_status)}
        ${o.assigned_staff ? `<div style="font-size:11px;color:var(--text-light);margin-top:3px;">${esc(o.assigned_staff.full_name || "")}</div>` : ""}`;

      return `
        <tr data-id="${esc(o.id)}">
          <td class="nowrap"><strong>${esc(o.full_name || "—")}</strong><br><span style="font-size:10px;color:var(--text-muted);">#${esc(o.order_number ?? "—")}</span></td>
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
          <td class="nowrap">${assignCell}</td>
          <td class="td-actions">
            <div class="actions-col">
              ${receiptBtn}
              <button class="btn-copy-msg" data-id="${esc(o.id)}" data-action="copy-message">📋 نسخ رسالة التأكيد</button>
              ${confirmBtn}
              ${isAdmin() ? `<button class="btn-delete" data-id="${esc(o.id)}" data-action="delete">🗑 حذف الطلب</button>` : ``}
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
     رسالة تأكيد الطلب — نسخ للحافظة (واتساب / تيليغرام)
  ───────────────────────────────────────────────────────── */
  function buildConfirmationMessage(o) {
    const items = o.order_items || [];
    const itemsText = items.length
      ? items.map(it => `- ${it.product_name} : ${fmtMoney(it.subtotal)}`).join("\n")
      : "-";

    return `مرحبا ${o.full_name || ""}
طلبيتك:
${itemsText}
توصيل: ${fmtMoney(o.shipping_fee)}
المجموع الكلي: ${fmtMoney(o.total_price)}

للتأكيد، رجاء الرد بـ "نعم" لتأكيد الطلبية او "لا" لالغائها`;
  }

  async function handleCopyMessage(orderId, btn) {
    const order = ALL_ORDERS.find(o => o.id === orderId);
    if (!order) return;

    const text = buildConfirmationMessage(order);
    const original = btn ? btn.innerHTML : null;

    try {
      await navigator.clipboard.writeText(text);
      if (btn) {
        btn.classList.add("copied");
        btn.innerHTML = "✅ تم النسخ!";
        setTimeout(() => {
          btn.classList.remove("copied");
          btn.innerHTML = original;
        }, 1800);
      }
    } catch (err) {
      console.error("Copy error:", err);
      alert("❌ فشل نسخ الرسالة:\n" + (err.message || ""));
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
    document.getElementById("modalTitle").textContent = "طلب #" + (order.order_number ?? "—") + " — " + (order.full_name || "—");
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
      : isAdmin()
        ? `<button class="btn-confirm" data-id="${esc(o.id)}" data-action="confirm">✅ تأكيد الطلب</button>`
        : ``;

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
        <button class="btn-copy-msg" data-id="${esc(o.id)}" data-action="copy-message">📋 نسخ رسالة التأكيد</button>
        ${confirmBtn}
        ${isAdmin() ? `<button class="btn-delete" data-id="${esc(o.id)}" data-action="delete">🗑 حذف الطلب</button>` : ``}
      </div>

      ${buildAssignmentSectionHTML(o, "order")}`;
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

    /* ── View as User ────────────────────────────────────────── */
    document.getElementById("viewAsBtn")?.addEventListener("click", async () => {
      document.getElementById("modalTitle").textContent = "👁 معاينة كمستخدم";
      document.getElementById("modalBody").innerHTML = `<p style="text-align:center;color:var(--text-muted);">⏳ جاري التحميل...</p>`;
      openModal();
      try {
        const targets = await fetchImpersonationTargets();
        document.getElementById("modalBody").innerHTML = buildViewAsModalHTML(targets);
      } catch (err) {
        document.getElementById("modalBody").innerHTML = `<p style="color:var(--red);text-align:center;">❌ فشل تحميل القائمة: ${esc(err.message || "")}</p>`;
      }
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
          tab === "orders"      ? "📦 إدارة الطلبات"
        : tab === "messages"    ? "✉️ الرسائل الواردة"
        : tab === "reviews"     ? "⭐ إدارة التقييمات"
        : tab === "bestsellers" ? "📚 الكتب المباعة"
        : "📚 إدارة المنتجات";

        /* فتح التبويب يصفّر عداد "غير مُشاهد" الخاص به */
        if (tab === "orders")   { UNSEEN_ORDERS   = 0; sessionStorage.setItem("admin_orders_last_seen",   new Date().toISOString()); }
        if (tab === "messages") { UNSEEN_MESSAGES = 0; sessionStorage.setItem("admin_messages_last_seen", new Date().toISOString()); }
        updateLiveBadges();
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
    document.getElementById("assignFilter")?.addEventListener("change", e => {
      ORD_ASSIGN_FILTER = e.target.value;
      renderTable(getFiltered());
    });

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
      if ((btn.dataset.action === "confirm" || btn.dataset.action === "delete") && !isAdmin()) return;
      if (btn.dataset.action === "confirm")       await handleConfirm(btn.dataset.id, btn);
      if (btn.dataset.action === "delete")        await handleDelete(btn.dataset.id, btn);
      if (btn.dataset.action === "details")       showOrderModal(btn.dataset.id);
      if (btn.dataset.action === "copy-message")  await handleCopyMessage(btn.dataset.id, btn);
    });

    /* Event delegation — المودال */
    document.getElementById("modalBody").addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (["confirm", "delete", "delete-msg", "assign-order", "unassign-order", "assign-message", "unassign-message", "start-impersonation"]
            .includes(btn.dataset.action) && !isAdmin()) return;
      if (btn.dataset.action === "confirm")          await handleConfirm(btn.dataset.id, btn);
      if (btn.dataset.action === "delete")           await handleDelete(btn.dataset.id, btn);
      if (btn.dataset.action === "delete-msg")       await handleDeleteMessage(btn.dataset.msgId, btn);
      if (btn.dataset.action === "assign-order")     await handleAssign("order", btn.dataset.entityId, btn);
      if (btn.dataset.action === "unassign-order")   await handleUnassign("order", btn.dataset.entityId, btn);
      if (btn.dataset.action === "assign-message")   await handleAssign("message", btn.dataset.entityId, btn);
      if (btn.dataset.action === "unassign-message") await handleUnassign("message", btn.dataset.entityId, btn);
      if (btn.dataset.action === "show-history")     await handleShowHistory(btn.dataset.entityType, btn.dataset.entityId, btn);
      if (btn.dataset.action === "start-impersonation") await handleStartImpersonation(btn);
      if (btn.dataset.action === "copy-message")     await handleCopyMessage(btn.dataset.id, btn);
    });

    /* ── Mobile: Orders cards ──────────────────────────────── */
    document.getElementById("ordersMobileCards").addEventListener("click", async e => {
      const detailsBtn = e.target.closest("[data-action='details']");
      if (detailsBtn) { showOrderModal(detailsBtn.dataset.id); return; }
      const copyBtn = e.target.closest("[data-action='copy-message']");
      if (copyBtn) { await handleCopyMessage(copyBtn.dataset.id, copyBtn); return; }
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
     LIVE NOTIFICATIONS — Supabase Realtime (في اللوحة فقط، بدون بريد)
  ───────────────────────────────────────────────────────── */
  function showToast(message, durationMs = 4000) {
    const el = document.createElement("div");
    el.className = "live-toast";
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, durationMs);
  }

  function updateLiveBadges() {
    const lo = document.getElementById("liveBadgeOrders");
    const lm = document.getElementById("liveBadgeMessages");
    if (lo) { lo.style.display = UNSEEN_ORDERS   > 0 ? "inline-flex" : "none"; lo.textContent = UNSEEN_ORDERS; }
    if (lm) { lm.style.display = UNSEEN_MESSAGES > 0 ? "inline-flex" : "none"; lm.textContent = UNSEEN_MESSAGES; }
  }

  function setupRealtime() {
    supabase
      .channel("admin-orders-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, payload => {
        ALL_ORDERS.unshift(payload.new);
        UNSEEN_ORDERS++;
        updateLiveBadges();
        renderStats(ALL_ORDERS);
        renderTable(getFiltered());
        showToast("📦 طلب جديد من " + (payload.new.full_name || "—"));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, payload => {
        ALL_MESSAGES.unshift(payload.new);
        UNSEEN_MESSAGES++;
        updateLiveBadges();
        renderMessagesTable(getFilteredMessages());
        showToast("✉️ رسالة جديدة من " + (payload.new.name || "—"));
      })
      .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: "assignment_status=eq.completed" },
          payload => {
            /* REPLICA IDENTITY FULL (see supabase-order-completion-system.sql)
               makes payload.old include the previous assignment_status, so we
               only notify on the actual assigned→completed transition, not on
               an unrelated edit to an already-completed order. */
            if (payload.old?.assignment_status === "completed") return;

            const o = payload.new;
            const idx = ALL_ORDERS.findIndex(x => x.id === o.id);
            if (idx > -1) ALL_ORDERS[idx] = { ...ALL_ORDERS[idx], ...o };
            renderTable(getFiltered());

            const seller = ALL_SELLERS.find(s => s.id === o.assigned_to);
            showToast(
              `📦 تم إنهاء الطلب\n` +
              `الطلب: #${o.order_number ?? "—"}\n` +
              `الزبون: ${o.full_name || "—"}\n` +
              `المندوب: ${seller?.full_name || "—"}\n` +
              `الوقت: ${fmtDate(o.completed_at)}`,
              7000
            );
          })
      .subscribe();
  }

  /* ─────────────────────────────────────────────────────────
     BOOT
  ───────────────────────────────────────────────────────── */
  async function boot() {
    try {
      const staff = await authGuard();
      if (!staff) return;

      CURRENT_ROLE        = String(staff.role || "").toLowerCase();
      CURRENT_STAFF_ID     = staff.id;
      CURRENT_STAFF_EMAIL  = String(staff.email || "").toLowerCase();

      document.getElementById("adminBadge").textContent =
        "👑 Admin" + (staff.full_name ? " — " + staff.full_name : "");

      document.getElementById("viewAsBtn").style.display = "inline-flex";

      /* حساب "غير مُشاهد منذ آخر زيارة" قبل أي بيانات جديدة تصل عبر Realtime */
      const lastSeenOrders   = sessionStorage.getItem("admin_orders_last_seen");
      const lastSeenMessages = sessionStorage.getItem("admin_messages_last_seen");

      [ALL_ORDERS, ALL_MESSAGES, ALL_REVIEWS, ALL_SELLERS] = await Promise.all([
        fetchOrders(), fetchMessages(),
        fetchReviews().catch(() => []),
        fetchSellers().catch(() => []),
      ]);

      if (lastSeenOrders)   UNSEEN_ORDERS   = ALL_ORDERS.filter(o => new Date(o.created_at)   > new Date(lastSeenOrders)).length;
      if (lastSeenMessages) UNSEEN_MESSAGES = ALL_MESSAGES.filter(m => new Date(m.created_at) > new Date(lastSeenMessages)).length;
      updateLiveBadges();

      const assignFilterEl = document.getElementById("assignFilter");
      if (assignFilterEl) {
        assignFilterEl.innerHTML = `
          <option value="">📋 كل حالات التعيين</option>
          <option value="unassigned">🆕 غير معيّن</option>
          ${ALL_SELLERS.map(s => `<option value="${esc(s.id)}">👤 ${esc(s.full_name || s.email)}</option>`).join("")}
          <option value="completed">✅ مكتمل</option>`;
      }

      renderStats(ALL_ORDERS);
      renderTable(getFiltered());
      renderMessagesTable(ALL_MESSAGES);
      renderReviewsTable(ALL_REVIEWS);
      bindEvents();
      setupRealtime();

    } catch (err) {
      console.error("Boot error:", err);
      alert("❌ خطأ في تحميل لوحة التحكم:\n" + (err.message || JSON.stringify(err)));
    }
  }

  boot();

})();
