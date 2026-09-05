/* ==========================================================
   admin.js — Derradj Shop | Admin Dashboard
   is_confirmed: NULL = قيد المعالجة | true = تم التسليم (زر "تم الاستلام"، قابل للإرجاع)
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
  let ALL_AGENTS   = [];
  let ALL_AGENT_EARNINGS = [];
  let ALL_DIGITAL_SALES_ADMIN = [];
  let ALL_SELLER_APPS = [];
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

  /* ── Main admin (platform owner) — the only account allowed to see/use
     the "البائعين" tab. This is a UI convenience check only; the real
     boundary is public.is_main_admin() enforced server-side on the
     staff_accounts UPDATE policy (see add-seller-show-amount-owed-setting.sql) —
     even if this check were bypassed in DevTools, the database would
     still reject the write for any other account. ── */
  const MAIN_ADMIN_EMAIL = '0555491316@derradjshop.com';
  function isMainAdmin() { return isAdmin() && CURRENT_STAFF_EMAIL === MAIN_ADMIN_EMAIL; }

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

  /* ── Call-agent delivery lifecycle — independent of is_confirmed
     above and of the seller assignment_status. See
     20260827030000_add_agent_role_and_commission_schema.sql. ── */
  const DELIVERY_LABELS = {
    pending:          "🆕 قيد الانتظار",
    confirmed:        "✅ تم التأكيد",
    shipped:          "🚚 تم الشحن",
    out_for_delivery: "🚗 جاري التسليم",
    delivered:        "📦 تم أخذ الطلبية",
    cancelled:        "❌ ملغاة",
  };
  function deliveryBadge(status) {
    const s = status || "pending";
    return `<span class="badge badge-delivery-${esc(s)}">${esc(DELIVERY_LABELS[s] || s)}</span>`;
  }

  /* ── Digital sales commission (agent_digital_sales) — WhatsApp-only
     items (category='subscriptions'), no orders/order_items row exists
     for these. Labels mirror agent/dashboard.html's own copies. ── */
  const DG_ITEM_TYPE_LABELS = {
    digital_product:      "منتج رقمي",
    digital_subscription: "اشتراك رقمي",
  };
  const DG_ORDER_STATUS_LABELS = {
    pending:   "⏳ قيد الانتظار",
    completed: "✅ مكتملة",
    cancelled: "❌ ملغاة",
    refunded:  "↩️ مسترجعة",
  };
  const DG_PAYMENT_STATUS_LABELS = {
    unpaid: "💳 غير مدفوعة",
    paid:   "✅ مدفوعة",
    failed: "❌ فشل الدفع",
  };

  /* ─────────────────────────────────────────────────────────
     حالة الطلب — is_confirmed (boolean)
     NULL  → قيد المعالجة
     true  → تم التسليم (زر "تم الاستلام" / قابل للإرجاع بزر "إرجاع لقيد المعالجة")
  ───────────────────────────────────────────────────────── */
  function confirmBadge(isConfirmed) {
    if (isConfirmed === true) {
      return `<span class="badge badge-confirmed">✅ تم التسليم</span>`;
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

    /* حساب موظفة متابعة (Agent) — نفس معاملة البائع أعلاه. */
    if (String(staff.role || "").toLowerCase() === "agent") {
      location.href = "../agent/dashboard.html";
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
        assigned_agent_id, agent_commission, commission_paid, delivery_status,
        confirmed_at, shipped_at, out_for_delivery_at, delivered_at, cancelled_at,
        assigned_staff:staff_accounts!orders_assigned_to_fkey ( id, full_name, email ),
        assigned_agent:staff_accounts!orders_assigned_agent_id_fkey ( id, full_name, email ),
        order_items (
          id, product_name, quantity, unit_price, subtotal, purchase_cost,
          updated_at, updated_by,
          updated_by_staff:staff_accounts!order_items_updated_by_fkey ( full_name )
        )
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
      .select("id, full_name, email, show_amount_owed")
      .eq("role", "seller")
      .eq("is_active", true)
      .order("full_name");
    if (error) throw error;
    return data || [];
  }

  /* ─────────────────────────────────────────────────────────
     FETCH — موظفات المتابعة النشطات (لقائمة "تعيين لموظفة")
  ───────────────────────────────────────────────────────── */
  async function fetchAgents() {
    const { data, error } = await supabase
      .from("staff_accounts")
      .select("id, full_name, email")
      .eq("role", "agent")
      .eq("is_active", true)
      .order("full_name");
    if (error) throw error;
    return data || [];
  }

  /* ─────────────────────────────────────────────────────────
     FETCH — كل عمولات الموظفات (لتبويب "الموظفون")
  ───────────────────────────────────────────────────────── */
  async function fetchAgentEarnings() {
    const { data, error } = await supabase
      .from("agent_earnings")
      .select(`
        id, amount, created_at, agent_id, order_id,
        order:orders!agent_earnings_order_id_fkey ( order_number, full_name )
      `)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    return data || [];
  }

  /* ─────────────────────────────────────────────────────────
     FETCH — كل مبيعات المنتجات/الاشتراكات الرقمية (agent_digital_sales)
     الأدمن يملك SELECT كاملاً عبر RLS على هذا الجدول (كل الموظفات، لا
     فقط الحساب الحالي). لا نربط باسم الموظفة عبر FK-hint هنا لتجنّب
     افتراض اسم قيد صريح لم يُحدَّد في الهجرة — نستخرج الاسم بدلاً من
     ذلك من ALL_AGENTS (المُحمَّلة أصلاً) عبر agent_id في الواجهة.
  ───────────────────────────────────────────────────────── */
  async function fetchAllDigitalSales() {
    const { data, error } = await supabase
      .from("agent_digital_sales")
      .select(`
        id, agent_id, item_type, product_name, customer_name, customer_phone,
        quantity, unit_commission, total_commission, order_status, payment_status,
        commission_status, notes, created_at, approved_by, approved_at, commission_paid_at
      `)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data || [];
  }

  function dgAgentName(agentId) {
    const a = ALL_AGENTS.find(x => x.id === agentId);
    return a ? (a.full_name || a.email) : "—";
  }

  /* ─────────────────────────────────────────────────────────
     SELLERS TAB — إعداد "إظهار المبلغ المستحق" لكل بائع
     يظهر هذا التبويب فقط لحساب الأدمن الرئيسي (isMainAdmin()) —
     هذا مجرد تسهيل واجهة. الحماية الفعلية هي سياسة RLS
     staff_accounts_main_admin_update التي تقبل فقط
     public.is_main_admin() على مستوى القاعدة (انظر
     add-seller-show-amount-owed-setting.sql)، لذا حتى لو أظهر أحد
     الزر يدوياً عبر DevTools فإن التحديث سيُرفض من القاعدة نفسها
     لأي حساب غير هذا الحساب تحديداً.
  ───────────────────────────────────────────────────────── */
  function renderSellersTab() {
    const container = document.getElementById("tab-sellers");
    if (!container) return;
    container.innerHTML = `
      <p class="modal-sec-lbl" style="margin-bottom:14px;">البائعون</p>
      <div class="detail-rows">
        ${ALL_SELLERS.length ? ALL_SELLERS.map(s => `
          <div class="detail-row">
            <span class="dr-key">${esc(s.full_name || s.email)}</span>
            <span class="dr-val" style="display:flex;align-items:center;justify-content:flex-end;gap:10px;">
              <span style="font-size:12px;color:var(--text-muted);">إظهار المبلغ المستحق</span>
              <button type="button" class="pm-toggle ${s.show_amount_owed ? "is-on" : ""}"
                      data-action="toggle-show-owed" data-id="${esc(s.id)}"
                      role="switch" aria-checked="${!!s.show_amount_owed}">
                <span class="pm-toggle-track"><span class="pm-toggle-thumb"></span></span>
                <span class="pm-toggle-label">${s.show_amount_owed ? "🟢 ظاهر" : "⚪ مخفي"}</span>
              </button>
            </span>
          </div>`).join("")
        : `<p style="color:var(--text-muted);font-size:13px;padding:12px;">لا يوجد بائعون بعد</p>`}
      </div>`;
  }

  async function handleToggleShowOwed(sellerId, btn) {
    if (!isMainAdmin()) return;
    const seller = ALL_SELLERS.find(s => s.id === sellerId);
    if (!seller) return;
    const next = !seller.show_amount_owed;
    btn.disabled = true;
    try {
      const { error } = await supabase
        .from("staff_accounts")
        .update({ show_amount_owed: next })
        .eq("id", sellerId);
      if (error) throw error;
      seller.show_amount_owed = next;
      renderSellersTab();
    } catch (err) {
      console.error("Toggle show_amount_owed error:", err);
      showToast("❌ فشل تحديث الإعداد: " + (err.message || ""), "error");
    } finally {
      btn.disabled = false;
    }
  }

  /* ─────────────────────────────────────────────────────────
     BLOCKED CUSTOMERS TAB — main-admin-only management view
     الحظر الفعلي مُنفَّذ داخل القاعدة نفسها عبر trigger على orders
     (انظر add-blocked-customers-system.sql) — يرفض أي طلب جديد
     برقم هاتف محظور بغض النظر عن الواجهة. البائعون يحظرون مباشرة
     من لوحتهم (زر "🚫 حظر" على الطلب)؛ هذا التبويب هنا فقط للعرض
     ولإلغاء الحظر — وإلغاء الحظر (UPDATE) مقصور على الأدمن الرئيسي
     عبر سياسة blocked_customers_main_admin_update (is_main_admin()).
  ───────────────────────────────────────────────────────── */
  let ALL_BLOCKED = [];

  async function fetchBlockedCustomers() {
    const { data, error } = await supabase
      .from("blocked_customers")
      .select(`
        id, phone, reason, is_active, blocked_at, unblocked_at,
        blocked_staff:staff_accounts!blocked_customers_blocked_by_fkey ( full_name, email ),
        unblocked_staff:staff_accounts!blocked_customers_unblocked_by_fkey ( full_name, email )
      `)
      .order("blocked_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function renderBlockedTab() {
    const container = document.getElementById("tab-blocked");
    if (!container) return;
    container.innerHTML = `
      <p class="modal-sec-lbl" style="margin-bottom:14px;">العملاء المحظورون</p>
      <div class="detail-rows">
        ${ALL_BLOCKED.length ? ALL_BLOCKED.map(b => `
          <div class="detail-row">
            <span class="dr-key" dir="ltr">${esc(b.phone)}</span>
            <span class="dr-val">
              ${b.is_active
                ? `<strong style="color:#92400e;">🚫 محظور</strong>`
                : `<span style="color:var(--text-muted);">غير محظور</span>`}
              <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:2px;">
                حظره ${esc(b.blocked_staff?.full_name || b.blocked_staff?.email || "—")} — ${esc(fmtDate(b.blocked_at))}
                ${!b.is_active ? ` · ألغى الحظر ${esc(b.unblocked_staff?.full_name || b.unblocked_staff?.email || "—")} — ${esc(fmtDate(b.unblocked_at))}` : ""}
              </span>
            </span>
            ${b.is_active ? `<button class="btn-undo" data-action="unblock" data-id="${esc(b.id)}">إلغاء الحظر</button>` : ""}
          </div>`).join("")
        : `<p style="color:var(--text-muted);font-size:13px;padding:12px;">لا يوجد عملاء محظورون</p>`}
      </div>`;
  }

  async function handleUnblock(blockId, btn) {
    if (!isMainAdmin()) return;
    if (!confirm("هل تريد إلغاء حظر هذا العميل؟")) return;
    btn.disabled = true;
    try {
      const { error } = await supabase
        .from("blocked_customers")
        .update({ is_active: false, unblocked_by: CURRENT_STAFF_ID, unblocked_at: new Date().toISOString() })
        .eq("id", blockId);
      if (error) throw error;
      ALL_BLOCKED = await fetchBlockedCustomers();
      renderBlockedTab();
    } catch (err) {
      console.error("Unblock error:", err);
      showToast("❌ فشل إلغاء الحظر: " + (err.message || ""), "error");
      btn.disabled = false;
    }
  }

  /* ─────────────────────────────────────────────────────────
     SELLER APPLICATIONS TAB (طلبات البائعين) — طلبات التسجيل كبائع
     خارجي في السوق (seller_applications، من 20260905194233_seller_
     marketplace.sql). يظهر هذا التبويب فقط لحساب الأدمن الرئيسي
     (isMainAdmin()) — نفس مستوى حماية تبويبي "البائعين"/"المحظورون"
     أعلاه، لأن هذه الطلبات تحمل بيانات شخصية لمقدّم الطلب (بريد/هاتف/
     واتساب) وتُستخدم لاحقاً لإنشاء حساب بائع فعلي عبر الدالة
     approve_seller_application() (RPC، مرحلة لاحقة لم تُنفَّذ هنا —
     هذا التبويب للعرض فقط، بلا أزرار قبول/رفض). الحماية الفعلية
     للقراءة نفسها هي RLS: سياسة seller_applications_admin_all تقبل
     فقط public.is_admin() على مستوى القاعدة، لذا حتى لو أظهر أحد هذا
     التبويب يدوياً عبر DevTools لحساب غير أدمن فإن القراءة نفسها
     ستُرفض من القاعدة.
  ───────────────────────────────────────────────────────── */
  async function fetchSellerApplications() {
    const { data, error } = await supabase
      .from("seller_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function safeHttpUrl(v) {
    const s = String(v || "").trim();
    return /^https?:\/\//i.test(s) ? s : null;
  }

  function sellerAppStatusBadge(status) {
    const s = status || "pending";
    if (s === "approved") return `<span class="badge badge-approved">✅ مقبول</span>`;
    if (s === "rejected") return `<span class="badge badge-rejected">❌ مرفوض</span>`;
    return `<span class="badge badge-pending">⏳ قيد المراجعة</span>`;
  }

  function renderSellerAppsTab() {
    const container = document.getElementById("tab-sellerapps");
    if (!container) return;

    /* قيد المراجعة أولاً، ثم الأحدث فأقدم داخل كل مجموعة حالة */
    const sorted = [...ALL_SELLER_APPS].sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    container.innerHTML = `
      <p class="modal-sec-lbl" style="margin-bottom:14px;">طلبات التسجيل كبائع (${ALL_SELLER_APPS.length})</p>
      <div class="detail-rows">
        ${sorted.length ? sorted.map(a => `
          <div class="detail-row" data-action="view-sellerapp" data-id="${esc(a.id)}" style="cursor:pointer;">
            <span class="dr-key">${esc(a.boutique_name || "—")}</span>
            <span class="dr-val">
              ${esc(a.full_name || "—")} — <span dir="ltr">${esc(a.phone || "—")}</span> — ${esc(a.email || "—")}
              <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:2px;">
                ${esc(a.wilaya || "—")}، ${esc(a.commune || "—")} · واتساب: <span dir="ltr">${esc(a.whatsapp || "—")}</span>
                · ${esc(a.product_type || "—")} · ${esc(fmtDate(a.created_at))}
              </span>
            </span>
            <span style="flex-shrink:0;">${sellerAppStatusBadge(a.status)}</span>
          </div>`).join("")
        : `<p style="color:var(--text-muted);font-size:13px;padding:12px;">لا توجد طلبات تسجيل بعد</p>`}
      </div>`;

    const badgeEl = document.getElementById("tab-badge-sellerapps");
    if (badgeEl) badgeEl.textContent = ALL_SELLER_APPS.filter(a => a.status === "pending").length;
  }

  function showSellerAppModal(appId) {
    const app = ALL_SELLER_APPS.find(a => a.id === appId);
    if (!app) return;
    document.getElementById("modalTitle").textContent =
      "طلب بائع: " + (app.boutique_name || app.full_name || "—");
    document.getElementById("modalBody").innerHTML = `
      <div class="m-section">
        <div class="m-title">بيانات مقدّم الطلب</div>
        <div class="info-grid">
          <div class="info-item"><span class="i-lbl">الاسم الكامل</span><span class="i-val">${esc(app.full_name || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">البريد الإلكتروني</span><span class="i-val" style="direction:ltr;">${esc(app.email || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">الهاتف</span><span class="i-val" style="direction:ltr;">${esc(app.phone || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">واتساب</span><span class="i-val" style="direction:ltr;">${esc(app.whatsapp || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">الولاية</span><span class="i-val">${esc(app.wilaya || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">البلدية</span><span class="i-val">${esc(app.commune || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">الحالة</span><span class="i-val">${sellerAppStatusBadge(app.status)}</span></div>
          <div class="info-item"><span class="i-lbl">تاريخ التقديم</span><span class="i-val" style="font-size:12px;">${esc(fmtDate(app.created_at))}</span></div>
        </div>
      </div>
      <div class="m-section">
        <div class="m-title">بيانات المتجر</div>
        <div class="info-grid">
          <div class="info-item"><span class="i-lbl">اسم المتجر</span><span class="i-val">${esc(app.boutique_name || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">نوع المنتجات</span><span class="i-val">${esc(app.product_type || "—")}</span></div>
          <div class="info-item"><span class="i-lbl">رابط التواصل الاجتماعي</span>
            <span class="i-val" style="direction:ltr;word-break:break-all;">
              ${safeHttpUrl(app.social_link) ? `<a href="${esc(safeHttpUrl(app.social_link))}" target="_blank" rel="noopener noreferrer">${esc(app.social_link)}</a>` : esc(app.social_link || "—")}
            </span>
          </div>
        </div>
        <div style="margin-top:10px;">
          <div class="i-lbl" style="margin-bottom:4px;">وصف المتجر</div>
          <div class="msg-full">${esc(app.boutique_description || "—")}</div>
        </div>
      </div>
      ${app.notes ? `
      <div class="m-section">
        <div class="m-title">ملاحظات مقدّم الطلب</div>
        <div class="msg-full">${esc(app.notes)}</div>
      </div>` : ""}
      ${(app.admin_notes || app.reviewed_at) ? `
      <div class="m-section">
        <div class="m-title">مراجعة الأدمن</div>
        <div class="info-grid">
          <div class="info-item"><span class="i-lbl">تاريخ المراجعة</span><span class="i-val" style="font-size:12px;">${esc(fmtDate(app.reviewed_at))}</span></div>
        </div>
        ${app.admin_notes ? `<div class="msg-full" style="margin-top:8px;">${esc(app.admin_notes)}</div>` : ""}
      </div>` : ""}
      ${app.status === "pending" ? `
      <div class="m-section">
        <span style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
          <button class="btn-confirm" data-action="sellerapp-approve" data-id="${esc(app.id)}">✅ قبول الطلب</button>
          <button class="btn-delete"  data-action="sellerapp-reject"  data-id="${esc(app.id)}">❌ رفض الطلب</button>
        </span>
      </div>` : ""}`;
    openModal();
  }

  async function handleApproveSellerApp(id, btn) {
    if (!confirm("هل أنت متأكد من قبول هذا الطلب؟ سيتم إنشاء حساب بائع فعلي.")) return;
    btn.disabled = true;
    try {
      const { error } = await supabase.rpc("approve_seller_application", { app_id: id, notes: null });
      if (error) throw error;
      showToast("✅ تم قبول الطلب بنجاح وتم إنشاء حساب البائع");
      ALL_SELLER_APPS = await fetchSellerApplications();
      renderSellerAppsTab();
      showSellerAppModal(id);
    } catch (err) {
      console.error("approveSellerApplication error:", err);
      showToast("❌ فشل قبول الطلب: " + (err.message || ""));
      btn.disabled = false;
    }
  }

  async function handleRejectSellerApp(id, btn) {
    if (!confirm("هل أنت متأكد من رفض هذا الطلب؟")) return;
    const reason = (prompt("سبب الرفض (اختياري):", "") || "").trim() || null;
    btn.disabled = true;
    try {
      const { error } = await supabase.rpc("reject_seller_application", { app_id: id, notes: reason });
      if (error) throw error;
      showToast("✅ تم رفض الطلب");
      ALL_SELLER_APPS = await fetchSellerApplications();
      renderSellerAppsTab();
      showSellerAppModal(id);
    } catch (err) {
      console.error("rejectSellerApplication error:", err);
      showToast("❌ فشل رفض الطلب: " + (err.message || ""));
      btn.disabled = false;
    }
  }

  /* ─────────────────────────────────────────────────────────
     AGENTS TAB (الموظفون) — رصيد كل موظفة + عدد الطلبيات المكتملة +
     قائمة عمولاتها القابلة للفلترة بالشهر. متاح لكل أدمن (ليس حصراً
     على الأدمن الرئيسي، بخلاف تبويبي البائعين/المحظورين).
  ───────────────────────────────────────────────────────── */
  function renderAgentsTab() {
    const container = document.getElementById("tab-agents");
    if (!container) return;
    const rows = ALL_AGENTS.map(a => {
      const earnings = ALL_AGENT_EARNINGS.filter(e => e.agent_id === a.id);
      const total = earnings.reduce((s, e) => s + Number(e.amount || 0), 0);
      return { agent: a, count: earnings.length, total };
    });
    container.innerHTML = `
      <p class="modal-sec-lbl" style="margin-bottom:14px;">الموظفون (متابعة الطلبيات)</p>
      <div class="detail-rows">
        ${rows.length ? rows.map(r => `
          <div class="detail-row" style="cursor:pointer;" data-action="view-agent-earnings" data-agent-id="${esc(r.agent.id)}">
            <span class="dr-key">📞 ${esc(r.agent.full_name || r.agent.email)}</span>
            <span class="dr-val">
              <strong>${esc(fmtMoney(r.total))}</strong>
              <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:2px;">${r.count} طلبية مكتملة — اضغط لعرض التفاصيل</span>
            </span>
          </div>`).join("")
        : `<p style="color:var(--text-muted);font-size:13px;padding:12px;">لا يوجد موظفو متابعة بعد</p>`}
      </div>

      ${renderDigitalSalesApprovalSection()}`;
  }

  /* ─────────────────────────────────────────────────────────
     DIGITAL SALES COMMISSION — approval queue (order_status='pending')
     + commission payout queue (completed+paid, commission_status='pending').
     Rendered as part of the "الموظفون" tab rather than a new top-level
     nav tab — this is an extension of the existing agent-management view,
     not a separate workflow area.
  ───────────────────────────────────────────────────────── */
  function buildDgApprovalRow(r) {
    const badge = DG_ITEM_TYPE_LABELS[r.item_type] || r.item_type;
    return `
      <div class="detail-row" data-dg-id="${esc(r.id)}">
        <span class="dr-key">${esc(dgAgentName(r.agent_id))}</span>
        <span class="dr-val">
          <strong>${esc(r.product_name || "—")}</strong>
          <span class="pm-tag" style="margin-inline-start:6px;">${esc(badge)}</span>
          <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:2px;">
            👤 ${esc(r.customer_name || "—")} · الكمية ${esc(r.quantity)} · ${esc(fmtDate(r.created_at))}
          </span>
          <span style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button class="btn-confirm" data-action="dg-approve" data-id="${esc(r.id)}">✅ موافقة</button>
            <button class="btn-delete"  data-action="dg-reject"  data-id="${esc(r.id)}">❌ رفض</button>
          </span>
        </span>
      </div>`;
  }

  function buildDgPayoutRow(r) {
    return `
      <div class="detail-row" data-dg-id="${esc(r.id)}">
        <span class="dr-key">${esc(dgAgentName(r.agent_id))}</span>
        <span class="dr-val">
          <strong>${esc(r.product_name || "—")}</strong>
          <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:2px;">
            👤 ${esc(r.customer_name || "—")} · 200 دج × ${esc(r.quantity)} = ${esc(fmtMoney(r.total_commission))}
          </span>
          <span style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button class="btn-confirm" data-action="dg-mark-paid" data-id="${esc(r.id)}">💰 تحديد العمولة كمدفوعة</button>
          </span>
        </span>
      </div>`;
  }

  function renderDigitalSalesApprovalSection() {
    const pendingApproval = ALL_DIGITAL_SALES_ADMIN.filter(r => r.order_status === "pending");
    const awaitingPayout  = ALL_DIGITAL_SALES_ADMIN.filter(r =>
      r.order_status === "completed" && r.payment_status === "paid" && r.commission_status === "pending");

    return `
      <p class="modal-sec-lbl" style="margin:24px 0 14px;">💻 مبيعات رقمية بانتظار الموافقة</p>
      <div class="detail-rows">
        ${pendingApproval.length ? pendingApproval.map(buildDgApprovalRow).join("")
          : `<p style="color:var(--text-muted);font-size:13px;padding:12px;">لا توجد مبيعات رقمية بانتظار الموافقة</p>`}
      </div>

      <p class="modal-sec-lbl" style="margin:24px 0 14px;">💰 عمولات رقمية بانتظار الدفع</p>
      <div class="detail-rows">
        ${awaitingPayout.length ? awaitingPayout.map(buildDgPayoutRow).join("")
          : `<p style="color:var(--text-muted);font-size:13px;padding:12px;">لا توجد عمولات رقمية بانتظار الدفع</p>`}
      </div>`;
  }

  async function handleApproveDigitalSale(id, btn) {
    if (!confirm("هل تريد الموافقة على عملية البيع هذه؟ سيتم تعليمها مكتملة ومدفوعة.")) return;
    btn.disabled = true;
    try {
      await approveDigitalSale(id);
      ALL_DIGITAL_SALES_ADMIN = await fetchAllDigitalSales();
      renderAgentsTab();
    } catch (err) {
      console.error("approveDigitalSale error:", err);
      showToast("❌ فشل الموافقة على العملية: " + (err.message || ""));
      btn.disabled = false;
    }
  }

  async function handleRejectDigitalSale(id, btn) {
    if (!confirm("هل تريد رفض عملية البيع هذه؟ سيتم تعليمها ملغاة.")) return;
    btn.disabled = true;
    try {
      await rejectDigitalSale(id);
      ALL_DIGITAL_SALES_ADMIN = await fetchAllDigitalSales();
      renderAgentsTab();
    } catch (err) {
      console.error("rejectDigitalSale error:", err);
      showToast("❌ فشل رفض العملية: " + (err.message || ""));
      btn.disabled = false;
    }
  }

  async function handleMarkDigitalCommissionPaid(id, btn) {
    if (!confirm("هل تريد تحديد عمولة هذه العملية كمدفوعة؟")) return;
    btn.disabled = true;
    try {
      await markDigitalCommissionPaid(id);
      ALL_DIGITAL_SALES_ADMIN = await fetchAllDigitalSales();
      renderAgentsTab();
    } catch (err) {
      console.error("markDigitalCommissionPaid error:", err);
      showToast("❌ فشل تحديد العمولة كمدفوعة: " + (err.message || ""));
      btn.disabled = false;
    }
  }

  function renderAgentEarningsList(list) {
    const box = document.getElementById("agentEarningsList");
    if (!box) return;
    if (!list.length) {
      box.innerHTML = `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0;">لا توجد أرباح في هذه الفترة</p>`;
      return;
    }
    box.innerHTML = `<div class="detail-rows">${list.map(e => `
      <div class="detail-row">
        <span class="dr-key">طلب #${esc(e.order?.order_number ?? "—")} — ${esc(e.order?.full_name || "—")}</span>
        <span class="dr-val">${esc(fmtMoney(e.amount))}<span style="display:block;font-size:11px;color:var(--text-muted);">${esc(fmtDate(e.created_at))}</span></span>
      </div>`).join("")}</div>`;
  }

  function showAgentEarningsModal(agentId) {
    const agent = ALL_AGENTS.find(a => a.id === agentId);
    if (!agent) return;
    const earnings = ALL_AGENT_EARNINGS.filter(e => e.agent_id === agentId);
    const months = [...new Set(earnings.map(e => new Date(e.created_at).toISOString().slice(0, 7)))].sort().reverse();

    document.getElementById("modalTitle").textContent = "أرباح: " + (agent.full_name || agent.email);
    document.getElementById("modalBody").innerHTML = `
      <div style="margin-bottom:14px;">
        <select class="filter-select" id="agentEarningsMonthFilter" data-agent-id="${esc(agentId)}" style="width:100%;">
          <option value="">📋 كل الفترات</option>
          ${months.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("")}
        </select>
      </div>
      <div id="agentEarningsList"></div>`;
    renderAgentEarningsList(earnings);
    document.getElementById("agentEarningsMonthFilter")
      .addEventListener("change", e => handleAgentEarningsMonthFilter(e.target));
    openModal();
  }

  function handleAgentEarningsMonthFilter(select) {
    const agentId = select.dataset.agentId;
    const month   = select.value;
    const earnings = ALL_AGENT_EARNINGS.filter(e => e.agent_id === agentId);
    const filtered = month
      ? earnings.filter(e => new Date(e.created_at).toISOString().slice(0, 7) === month)
      : earnings;
    renderAgentEarningsList(filtered);
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
     ASSIGN / REASSIGN / REMOVE — موظفة المتابعة (call agent)
     منفصل تماماً عن تعيين البائع أعلاه — نفس الطلب يمكن أن يُعيَّن
     لبائع (لتجهيز/بيع المنتج) ولموظفة متابعة (لتأكيد الطلب مع
     الزبون وتتبع التوصيل) في آن واحد.
  ───────────────────────────────────────────────────────── */
  async function assignOrderAgent(orderId, agentId) {
    const { error } = await supabase
      .from("orders")
      .update({ assigned_agent_id: agentId })
      .eq("id", orderId);
    if (error) throw error;
  }

  async function removeOrderAgentAssignment(orderId) {
    const { error } = await supabase
      .from("orders")
      .update({ assigned_agent_id: null })
      .eq("id", orderId);
    if (error) throw error;
  }

  /* ─────────────────────────────────────────────────────────
     DELIVERY LIFECYCLE (admin-only) — تم الشحن / جاري التسليم /
     تم أخذ الطلبية. أول اثنتين تحديث عادي (الأدمن يملك صلاحية
     UPDATE كاملة عبر orders_admin_update)، وتُختَم توقيتاتهما
     تلقائياً بواسطة trg_orders_guard_agent_update على القاعدة.
     "تم أخذ الطلبية" يستدعي دالة ذرية (mark_order_delivered) تُنشئ
     صف عمولة الموظفة وتُعلّم commission_paid دفعة واحدة، بشكل idempotent
     — انظر 20260827030100_add_agent_order_workflow_rls_and_functions.sql.
  ───────────────────────────────────────────────────────── */
  async function markOrderShipped(orderId) {
    const { error } = await supabase
      .from("orders")
      .update({ delivery_status: "shipped" })
      .eq("id", orderId);
    if (error) throw error;
  }

  async function markOrderOutForDelivery(orderId) {
    const { error } = await supabase
      .from("orders")
      .update({ delivery_status: "out_for_delivery" })
      .eq("id", orderId);
    if (error) throw error;
  }

  async function markOrderDelivered(orderId) {
    const { error } = await supabase.rpc("mark_order_delivered", { p_order_id: orderId });
    if (error) throw error;
  }

  /* ─────────────────────────────────────────────────────────
     DIGITAL SALES COMMISSION (admin approval) — plain .update() calls,
     the admin already has full RLS UPDATE access on agent_digital_sales;
     no SECURITY DEFINER function needed (unlike mark_order_delivered()
     above, which exists specifically because an agent must NOT be able
     to credit her own physical-order commission — here the agent has
     no UPDATE ability on this table at all, so the trust boundary is
     already enforced entirely by RLS itself).
  ───────────────────────────────────────────────────────── */
  async function approveDigitalSale(id) {
    const { error } = await supabase
      .from("agent_digital_sales")
      .update({
        order_status: "completed",
        payment_status: "paid",
        approved_by: CURRENT_STAFF_ID,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
  }

  async function rejectDigitalSale(id) {
    const { error } = await supabase
      .from("agent_digital_sales")
      .update({ order_status: "cancelled" })
      .eq("id", id);
    if (error) throw error;
  }

  async function markDigitalCommissionPaid(id) {
    const { error } = await supabase
      .from("agent_digital_sales")
      .update({ commission_status: "paid", commission_paid_at: new Date().toISOString() })
      .eq("id", id);
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
     CONFIRM — تحديث is_confirmed إلى true (زر "✅ تم الاستلام")
  ───────────────────────────────────────────────────────── */
  async function confirmOrder(orderId) {
    const { error } = await supabase
      .from("orders")
      .update({ is_confirmed: true })
      .eq("id", orderId);
    if (error) throw error;
  }

  /* ─────────────────────────────────────────────────────────
     REVERT — إرجاع is_confirmed إلى NULL (قيد المعالجة)
     نفس عمود is_confirmed الحالي — NULL يعني "قيد المعالجة" أصلاً
     (راجع الملاحظة أعلى الملف)، فلا حاجة لأي عمود/قيمة حالة جديدة.
  ───────────────────────────────────────────────────────── */
  async function revertOrderToPending(orderId) {
    const { error } = await supabase
      .from("orders")
      .update({ is_confirmed: null })
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

    /* When exactly one seller account exists in this system,
       the decision is the literal two-button choice the workflow is
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
     AGENT SECTION — تعيين موظفة متابعة + متابعة التوصيل (طلبات فقط،
     لا يوجد مكافئ لها في مودال الرسائل).
  ───────────────────────────────────────────────────────── */
  function buildAgentSectionHTML(o) {
    const status = o.delivery_status || "pending";
    const agent  = o.assigned_agent;

    let adminControls = "";
    if (isAdmin()) {
      if (ALL_AGENTS.length <= 1) {
        const onlyAgent = ALL_AGENTS[0];
        adminControls = `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            ${onlyAgent ? `<button class="btn-confirm" data-action="assign-agent" data-id="${esc(o.id)}" data-agent-id="${esc(onlyAgent.id)}">
              ➡️ تعيين لـ ${esc(onlyAgent.full_name || onlyAgent.email)}
            </button>` : `<span style="font-size:12px;color:var(--text-muted);">لا يوجد موظفو متابعة نشطون بعد</span>`}
            ${agent ? `<button class="btn-delete" data-action="unassign-agent" data-id="${esc(o.id)}">🔒 إزالة التعيين</button>` : ""}
          </div>`;
      } else {
        const agentOptions = ALL_AGENTS.map(a =>
          `<option value="${esc(a.id)}" ${o.assigned_agent_id === a.id ? "selected" : ""}>${esc(a.full_name || a.email)}</option>`
        ).join("");
        adminControls = `
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
            <select class="filter-select" id="assignAgentSelect" style="flex:1;min-width:160px;">
              <option value="">— اختر موظفة —</option>
              ${agentOptions}
            </select>
            <button class="btn-confirm" data-action="assign-agent" data-id="${esc(o.id)}">
              ${agent ? "🔁 إعادة تعيين" : "➡️ تعيين لموظفة"}
            </button>
            ${agent ? `<button class="btn-delete" data-action="unassign-agent" data-id="${esc(o.id)}">🔒 إزالة التعيين</button>` : ""}
          </div>`;
      }
    }

    /* الأزرار مفعّلة فقط عند الانتقال الصحيح التالي — trg_orders_guard_agent_update
       على القاعدة يرفض أي انتقال آخر بغض النظر عن حالة هذه الأزرار هنا. */
    const statusControls = isAdmin() ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
        <button class="btn-confirm" data-action="mark-shipped" data-id="${esc(o.id)}" ${status !== "confirmed" ? "disabled" : ""}>🚚 تم الشحن</button>
        <button class="btn-confirm" data-action="mark-ofd" data-id="${esc(o.id)}" ${status !== "shipped" ? "disabled" : ""}>🚗 جاري التسليم</button>
        <button class="btn-confirm" data-action="mark-delivered" data-id="${esc(o.id)}" ${status !== "out_for_delivery" ? "disabled" : ""}>📦 تم أخذ الطلبية</button>
      </div>` : "";

    return `
      <div class="m-section">
        <div class="m-title">متابعة التوصيل (موظفة المتابعة)</div>
        <div class="info-grid">
          <div class="info-item">
            <span class="i-lbl">حالة التوصيل</span>
            <span class="i-val">${deliveryBadge(status)}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">الموظفة المعيّنة</span>
            <span class="i-val">${agent ? esc(agent.full_name || agent.email) : "غير معيّنة"}</span>
          </div>
          <div class="info-item">
            <span class="i-lbl">العمولة</span>
            <span class="i-val">${esc(fmtMoney(o.agent_commission))} ${o.commission_paid ? "· ✅ مدفوعة" : ""}</span>
          </div>
        </div>
        ${adminControls}
        ${statusControls}
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
     HANDLE ASSIGN / UNASSIGN — موظفة المتابعة
  ───────────────────────────────────────────────────────── */
  async function handleAssignAgent(orderId, btn) {
    const agentId = btn.dataset.agentId || document.getElementById("assignAgentSelect")?.value;
    if (!agentId) { alert("⚠️ يرجى اختيار موظفة أولاً"); return; }

    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      await assignOrderAgent(orderId, agentId);
      const agent = ALL_AGENTS.find(a => a.id === agentId);
      const order = ALL_ORDERS.find(o => o.id === orderId);
      if (order) {
        order.assigned_agent_id = agentId;
        order.assigned_agent    = agent ? { id: agent.id, full_name: agent.full_name, email: agent.email } : null;
      }
      renderTable(getFiltered());
      if (ACTIVE_ORDER?.id === orderId) showOrderModal(orderId);
    } catch (err) {
      console.error("Assign agent error:", err);
      alert("❌ فشل تعيين الموظفة:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  async function handleUnassignAgent(orderId, btn) {
    btn.disabled = true;
    btn.textContent = "⏳...";
    try {
      await removeOrderAgentAssignment(orderId);
      const order = ALL_ORDERS.find(o => o.id === orderId);
      if (order) { order.assigned_agent_id = null; order.assigned_agent = null; }
      renderTable(getFiltered());
      if (ACTIVE_ORDER?.id === orderId) showOrderModal(orderId);
    } catch (err) {
      console.error("Unassign agent error:", err);
      alert("❌ فشل إزالة التعيين:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = "🔒 إزالة التعيين";
    }
  }

  /* ─────────────────────────────────────────────────────────
     HANDLE DELIVERY LIFECYCLE — تم الشحن / جاري التسليم / تم أخذ الطلبية
  ───────────────────────────────────────────────────────── */
  async function handleMarkShipped(orderId, btn) {
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      await markOrderShipped(orderId);
      const order = ALL_ORDERS.find(o => o.id === orderId);
      if (order) { order.delivery_status = "shipped"; order.shipped_at = new Date().toISOString(); }
      renderTable(getFiltered());
      if (ACTIVE_ORDER?.id === orderId) showOrderModal(orderId);
    } catch (err) {
      console.error("Mark shipped error:", err);
      alert("❌ فشل تحديث الحالة:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  async function handleMarkOutForDelivery(orderId, btn) {
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      await markOrderOutForDelivery(orderId);
      const order = ALL_ORDERS.find(o => o.id === orderId);
      if (order) { order.delivery_status = "out_for_delivery"; order.out_for_delivery_at = new Date().toISOString(); }
      renderTable(getFiltered());
      if (ACTIVE_ORDER?.id === orderId) showOrderModal(orderId);
    } catch (err) {
      console.error("Mark out-for-delivery error:", err);
      alert("❌ فشل تحديث الحالة:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }

  /* mark_order_delivered() على القاعدة تُنشئ صف agent_earnings وتُعلّم
     commission_paid=true ذرياً — نُعيد جلب الطلب هنا (بدل تحديث الكاش
     يدوياً) لضمان أن commission_paid المعروض يطابق ما فعلته الدالة
     فعلاً على القاعدة، ولتحديث تبويب "الموظفون" بنفس الرحلة. */
  async function handleMarkDelivered(orderId, btn) {
    if (!confirm("هل تريد تأكيد استلام الزبون للطلبية؟\nسيتم دفع عمولة الموظفة المعيّنة تلقائياً (إن وُجدت).")) return;
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = "⏳...";
    try {
      await markOrderDelivered(orderId);
      const order = ALL_ORDERS.find(o => o.id === orderId);
      if (order) {
        order.delivery_status = "delivered";
        order.delivered_at = new Date().toISOString();
        if (order.assigned_agent_id) order.commission_paid = true;
      }
      if (order?.assigned_agent_id) {
        ALL_AGENT_EARNINGS = await fetchAgentEarnings().catch(() => ALL_AGENT_EARNINGS);
        if (isAdmin()) renderAgentsTab();
      }
      renderTable(getFiltered());
      if (ACTIVE_ORDER?.id === orderId) showOrderModal(orderId);
      showToast("📦 تم تأكيد استلام الطلبية" + (order?.assigned_agent_id ? " ودفع عمولة الموظفة" : ""));
    } catch (err) {
      console.error("Mark delivered error:", err);
      alert("❌ فشل تحديث الحالة:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = prevText;
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
          <div class="m-order-meta" style="margin-top:6px;">
            ${deliveryBadge(o.delivery_status)}
            ${o.assigned_agent ? `<span style="font-size:11px;color:var(--text-light);">📞 ${esc(o.assigned_agent.full_name || "")}</span>` : ""}
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
      tbody.innerHTML = `<tr><td colspan="13" class="empty">لا توجد طلبات مطابقة</td></tr>`;
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

      /* زر تم الاستلام / زر الإرجاع لقيد المعالجة */
      const confirmBtn = confirmed
        ? `<button class="btn-confirm" disabled>✔ تم الاستلام</button>`
        : isAdmin()
          ? `<button class="btn-confirm" data-id="${esc(o.id)}" data-action="confirm">✅ تم الاستلام</button>`
          : ``;
      const revertBtn = confirmed && isAdmin()
        ? `<button class="btn-revert" data-id="${esc(o.id)}" data-action="revert">↩️ إرجاع لقيد المعالجة</button>`
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
          <td class="nowrap">
            ${deliveryBadge(o.delivery_status)}
            ${o.assigned_agent ? `<div style="font-size:11px;color:var(--text-light);margin-top:3px;">📞 ${esc(o.assigned_agent.full_name || "")}</div>` : ""}
          </td>
          <td class="nowrap">${assignCell}</td>
          <td class="td-actions">
            <div class="actions-col">
              ${receiptBtn}
              <button class="btn-copy-msg" data-id="${esc(o.id)}" data-action="copy-message">📋 نسخ رسالة التأكيد</button>
              ${confirmBtn}
              ${revertBtn}
              ${isAdmin() ? `<button class="btn-delete" data-id="${esc(o.id)}" data-action="delete">🗑 حذف الطلب</button>` : ``}
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  /* ─────────────────────────────────────────────────────────
     HANDLE CONFIRM (تم الاستلام)
  ───────────────────────────────────────────────────────── */
  async function handleConfirm(orderId, btn) {
    btn.disabled    = true;
    btn.textContent = "⏳ جاري التحديث...";

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
      alert("❌ خطأ في تحديث الطلب:\n" + (err.message || ""));
      btn.disabled    = false;
      btn.textContent = "✅ تم الاستلام";
    }
  }

  /* ─────────────────────────────────────────────────────────
     HANDLE REVERT (إرجاع لقيد المعالجة)
  ───────────────────────────────────────────────────────── */
  async function handleRevert(orderId, btn) {
    if (!confirm("هل تريد إرجاع هذا الطلب لحالة \"قيد المعالجة\"؟")) return;

    btn.disabled    = true;
    btn.textContent = "⏳ جاري الإرجاع...";

    try {
      await revertOrderToPending(orderId);

      /* تحديث الكاش */
      const order = ALL_ORDERS.find(o => o.id === orderId);
      if (order) order.is_confirmed = null;

      renderStats(ALL_ORDERS);
      renderTable(getFiltered());

      if (ACTIVE_ORDER?.id === orderId) {
        ACTIVE_ORDER.is_confirmed = null;
        document.getElementById("modalBody").innerHTML = buildModalHTML(ACTIVE_ORDER);
      }

    } catch (err) {
      console.error("Revert error:", err);
      alert("❌ خطأ في إرجاع الطلب:\n" + (err.message || ""));
      btn.disabled    = false;
      btn.textContent = "↩️ إرجاع لقيد المعالجة";
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
     تكلفة الشراء لكل كتاب — يُحفظ في order_items.purchase_cost
  ───────────────────────────────────────────────────────── */
  async function handleSaveCost(itemId, orderId, btn) {
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
      /* .select() يُرجع updated_by/updated_at كما وُضِعا فعلياً بواسطة
         guard_order_items_cost_edit() على القاعدة — الأدمن يملك دائماً
         الكلمة الأخيرة، لا حاجة لأي فحص تعارض من جهة العميل. */
      const { data, error } = await supabase
        .from("order_items")
        .update({ purchase_cost: cost })
        .eq("id", itemId)
        .select("purchase_cost, updated_at, updated_by, updated_by_staff:staff_accounts!order_items_updated_by_fkey ( full_name )")
        .single();
      if (error) throw error;

      /* تحديث الكاش المحلي */
      const order = ALL_ORDERS.find(o => o.id === orderId);
      const item  = order?.order_items?.find(it => it.id === itemId);
      if (item) {
        item.purchase_cost    = data.purchase_cost;
        item.updated_at       = data.updated_at;
        item.updated_by       = data.updated_by;
        item.updated_by_staff = data.updated_by_staff;
      }

      if (ACTIVE_ORDER?.id === orderId) {
        document.getElementById("modalBody").innerHTML = buildModalHTML(ACTIVE_ORDER);
      }
    } catch (err) {
      console.error("Save purchase cost error:", err);
      alert("❌ فشل حفظ التكلفة:\n" + (err.message || ""));
      btn.disabled = false;
      btn.textContent = prevText;
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

    /* ── Products rows (+ per-book purchase cost / profit split) ── */
    const productsHTML = items.length
      ? items.map(it => {
          const hasCost = it.purchase_cost !== null && it.purchase_cost !== undefined && it.purchase_cost !== "";
          const cost    = hasCost ? Number(it.purchase_cost) : null;
          const profit  = hasCost ? Number(it.subtotal || 0) - cost : null;
          const profitHTML = hasCost ? `
              <div class="prod-profit-row">
                <span>💰 الربح: <strong>${esc(fmtMoney(profit))}</strong></span>
              </div>` : ``;
          const editMetaHTML = it.updated_at ? `
              <div class="prod-cost-meta" title="آخر تعديل">✏️ آخر تعديل: ${esc(it.updated_by_staff?.full_name || "—")} · ${esc(fmtDate(it.updated_at))}</div>` : ``;
          return `
            <div class="prod-item-block">
              <div class="prod-row">
                <span class="prod-name">${esc(it.product_name)}</span>
                <span class="prod-qty">× ${esc(it.quantity)}</span>
                <span class="prod-sub">${esc(fmtMoney(it.subtotal))}</span>
              </div>
              <div class="prod-cost-row">
                <label class="prod-cost-lbl" for="cost-${esc(it.id)}">تكلفة الشراء</label>
                <input type="number" min="0" step="1" class="prod-cost-input" id="cost-${esc(it.id)}"
                       data-item-id="${esc(it.id)}" data-order-id="${esc(o.id)}"
                       value="${hasCost ? esc(cost) : ""}" placeholder="0">
                <button class="btn-save-cost" data-action="save-cost" data-item-id="${esc(it.id)}" data-order-id="${esc(o.id)}">💾 حفظ</button>
              </div>
              ${editMetaHTML}
              ${profitHTML}
            </div>`;
        }).join("")
      : `<p style="color:var(--text-muted);font-size:13px;text-align:center;padding:10px 0;">لا توجد منتجات</p>`;

    /* ── Receipt ── */
    const receiptHTML = o.receipt_url
      ? `<a href="${esc(o.receipt_url)}" target="_blank" rel="noopener" class="btn-receipt"
            style="display:inline-flex;margin-bottom:14px;">🧾 فتح وصل الدفع</a>`
      : ``;

    /* ── Action buttons ── */
    const confirmBtn = confirmed
      ? `<button class="btn-confirm" disabled>✔ تم الاستلام</button>`
      : isAdmin()
        ? `<button class="btn-confirm" data-id="${esc(o.id)}" data-action="confirm">✅ تم الاستلام</button>`
        : ``;
    const revertBtn = confirmed && isAdmin()
      ? `<button class="btn-revert" data-id="${esc(o.id)}" data-action="revert">↩️ إرجاع لقيد المعالجة</button>`
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
        ${revertBtn}
        ${isAdmin() ? `<button class="btn-delete" data-id="${esc(o.id)}" data-action="delete">🗑 حذف الطلب</button>` : ``}
      </div>

      ${buildAssignmentSectionHTML(o, "order")}
      ${buildAgentSectionHTML(o)}`;
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
        : tab === "bestpicks"   ? "🔥 المنتجات الأكثر مبيعاً"
        : tab === "contact"     ? "📞 اتصال العمل"
        : tab === "sellers"     ? "👤 إدارة البائعين"
        : tab === "blocked"     ? "🚫 العملاء المحظورون"
        : tab === "agents"      ? "📞 الموظفون (متابعة الطلبيات)"
        : tab === "sellerapps"  ? "📝 طلبات البائعين"
        : "📚 إدارة المنتجات";

        /* فتح التبويب يصفّر عداد "غير مُشاهد" الخاص به */
        if (tab === "orders")   { UNSEEN_ORDERS   = 0; sessionStorage.setItem("admin_orders_last_seen",   new Date().toISOString()); }
        if (tab === "messages") { UNSEEN_MESSAGES = 0; sessionStorage.setItem("admin_messages_last_seen", new Date().toISOString()); }
        updateLiveBadges();
      });
    });

    /* ── Sellers tab — toggle "show amount owed" ─────────────── */
    document.getElementById("tab-sellers")?.addEventListener("click", async e => {
      const btn = e.target.closest('[data-action="toggle-show-owed"]');
      if (!btn) return;
      await handleToggleShowOwed(btn.dataset.id, btn);
    });

    /* ── Blocked customers tab — unblock ─────────────────────── */
    document.getElementById("tab-blocked")?.addEventListener("click", async e => {
      const btn = e.target.closest('[data-action="unblock"]');
      if (!btn) return;
      await handleUnblock(btn.dataset.id, btn);
    });

    /* ── Seller applications tab — open detail modal ─────────── */
    document.getElementById("tab-sellerapps")?.addEventListener("click", e => {
      const row = e.target.closest('[data-action="view-sellerapp"]');
      if (!row) return;
      showSellerAppModal(row.dataset.id);
    });

    /* ── Agents tab — open earnings detail modal / digital sales approval ── */
    document.getElementById("tab-agents")?.addEventListener("click", async e => {
      const dgBtn = e.target.closest('[data-action="dg-approve"], [data-action="dg-reject"], [data-action="dg-mark-paid"]');
      if (dgBtn) {
        const id = dgBtn.dataset.id;
        if (dgBtn.dataset.action === "dg-approve")   await handleApproveDigitalSale(id, dgBtn);
        if (dgBtn.dataset.action === "dg-reject")    await handleRejectDigitalSale(id, dgBtn);
        if (dgBtn.dataset.action === "dg-mark-paid") await handleMarkDigitalCommissionPaid(id, dgBtn);
        return;
      }
      const row = e.target.closest('[data-action="view-agent-earnings"]');
      if (!row) return;
      showAgentEarningsModal(row.dataset.agentId);
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
      if (["confirm", "delete", "revert"].includes(btn.dataset.action) && !isAdmin()) return;
      if (btn.dataset.action === "confirm")       await handleConfirm(btn.dataset.id, btn);
      if (btn.dataset.action === "revert")        await handleRevert(btn.dataset.id, btn);
      if (btn.dataset.action === "delete")        await handleDelete(btn.dataset.id, btn);
      if (btn.dataset.action === "details")       showOrderModal(btn.dataset.id);
      if (btn.dataset.action === "copy-message")  await handleCopyMessage(btn.dataset.id, btn);
    });

    /* Event delegation — المودال */
    document.getElementById("modalBody").addEventListener("click", async e => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (["confirm", "revert", "delete", "delete-msg", "assign-order", "unassign-order", "assign-message", "unassign-message", "start-impersonation",
           "assign-agent", "unassign-agent", "mark-shipped", "mark-ofd", "mark-delivered", "sellerapp-approve", "sellerapp-reject"]
            .includes(btn.dataset.action) && !isAdmin()) return;
      if (btn.dataset.action === "confirm")          await handleConfirm(btn.dataset.id, btn);
      if (btn.dataset.action === "revert")           await handleRevert(btn.dataset.id, btn);
      if (btn.dataset.action === "delete")           await handleDelete(btn.dataset.id, btn);
      if (btn.dataset.action === "delete-msg")       await handleDeleteMessage(btn.dataset.msgId, btn);
      if (btn.dataset.action === "assign-order")     await handleAssign("order", btn.dataset.entityId, btn);
      if (btn.dataset.action === "unassign-order")   await handleUnassign("order", btn.dataset.entityId, btn);
      if (btn.dataset.action === "assign-message")   await handleAssign("message", btn.dataset.entityId, btn);
      if (btn.dataset.action === "unassign-message") await handleUnassign("message", btn.dataset.entityId, btn);
      if (btn.dataset.action === "show-history")     await handleShowHistory(btn.dataset.entityType, btn.dataset.entityId, btn);
      if (btn.dataset.action === "start-impersonation") await handleStartImpersonation(btn);
      if (btn.dataset.action === "copy-message")     await handleCopyMessage(btn.dataset.id, btn);
      if (btn.dataset.action === "save-cost")        await handleSaveCost(btn.dataset.itemId, btn.dataset.orderId, btn);
      if (btn.dataset.action === "assign-agent")     await handleAssignAgent(btn.dataset.id, btn);
      if (btn.dataset.action === "unassign-agent")   await handleUnassignAgent(btn.dataset.id, btn);
      if (btn.dataset.action === "mark-shipped")     await handleMarkShipped(btn.dataset.id, btn);
      if (btn.dataset.action === "mark-ofd")         await handleMarkOutForDelivery(btn.dataset.id, btn);
      if (btn.dataset.action === "mark-delivered")   await handleMarkDelivered(btn.dataset.id, btn);
      if (btn.dataset.action === "sellerapp-approve") await handleApproveSellerApp(btn.dataset.id, btn);
      if (btn.dataset.action === "sellerapp-reject")  await handleRejectSellerApp(btn.dataset.id, btn);
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

      if (isMainAdmin()) {
        document.getElementById("navBtnSellers").style.display = "";
        document.getElementById("navBtnBlocked").style.display = "";
        document.getElementById("navBtnSellerApps").style.display = "";
      }
      /* "الموظفون" متاح لأي أدمن (ليس حصراً على الأدمن الرئيسي) —
         هذا التبويب للعرض/التعيين فقط، لا يتضمن أي إعداد مالي حساس
         مثل "إظهار المبلغ المستحق". */
      document.getElementById("navBtnAgents").style.display = "";

      /* حساب "غير مُشاهد منذ آخر زيارة" قبل أي بيانات جديدة تصل عبر Realtime */
      const lastSeenOrders   = sessionStorage.getItem("admin_orders_last_seen");
      const lastSeenMessages = sessionStorage.getItem("admin_messages_last_seen");

      [ALL_ORDERS, ALL_MESSAGES, ALL_REVIEWS, ALL_SELLERS, ALL_AGENTS, ALL_AGENT_EARNINGS, ALL_DIGITAL_SALES_ADMIN, ALL_SELLER_APPS] = await Promise.all([
        fetchOrders(), fetchMessages(),
        fetchReviews().catch(() => []),
        fetchSellers().catch(() => []),
        fetchAgents().catch(() => []),
        fetchAgentEarnings().catch(() => []),
        fetchAllDigitalSales().catch(() => []),
        isMainAdmin() ? fetchSellerApplications().catch(() => []) : Promise.resolve([]),
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
      if (isMainAdmin()) {
        renderSellersTab();
        ALL_BLOCKED = await fetchBlockedCustomers().catch(() => []);
        renderBlockedTab();
        renderSellerAppsTab();
      }
      renderAgentsTab();
      bindEvents();
      setupRealtime();

    } catch (err) {
      console.error("Boot error:", err);
      alert("❌ خطأ في تحميل لوحة التحكم:\n" + (err.message || JSON.stringify(err)));
    }
  }

  boot();

})();
