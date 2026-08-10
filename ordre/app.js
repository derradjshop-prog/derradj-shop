/* ==========================================================
   app.js — Derradj Shop | Checkout Logic
   Supabase order submission + location data for dropdowns
   ========================================================== */

(function () {
  "use strict";

  /* ── Supabase ─────────────────────────────────────────── */
  if (!window.supabase || !window.supabase.createClient) {
    console.error("❌ Supabase library not loaded.");
    return;
  }

  const supabase = window.supabase.createClient(
    "https://jbmcbjzcedqpvnhbmrhk.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk"
  );

  /* ── رموز الولايات (للشحن) ────────────────────────────── */
  const WILAYA_CODE = window.WILAYA_CODE = {
    "أدرار":1,"الشلف":2,"الأغواط":3,"أم البواقي":4,"باتنة":5,
    "بجاية":6,"بسكرة":7,"بشار":8,"البليدة":9,"البويرة":10,
    "تمنراست":11,"تبسة":12,"تلمسان":13,"تيارت":14,"تيزي وزو":15,
    "الجزائر":16,"الجلفة":17,"جيجل":18,"سطيف":19,"سعيدة":20,
    "سكيكدة":21,"سيدي بلعباس":22,"عنابة":23,"قالمة":24,"قسنطينة":25,
    "المدية":26,"مستغانم":27,"المسيلة":28,"معسكر":29,"ورقلة":30,
    "وهران":31,"البيض":32,"برج بوعريريج":34,"بومرداس":35,
    "الطارف":36,"تيسمسيلت":38,"الوادي":39,"خنشلة":40,
    "سوق أهراس":41,"تيبازة":42,"ميلة":43,"عين الدفلى":44,"النعامة":45,
    "عين تموشنت":46,"غرداية":47,"غليزان":48,"تيميمون":49,
    "أولاد جلال":51,"بني عباس":52,"عين صالح":53,"تقرت":55,
    "المغير":57,"المنيعة":58,
  };

  /* ── بيانات البلديات الأساسية ─────────────────────────── */
  const _baseCommunes = {
    "أدرار (01)":["أدرار","تامست","شروين","رقان","إن زغمير","تيت","قصر قدور","تسابيت","تيميمون","أولاد السعيد","زاوية كونتة","أولف","تيمقتن","تامنطيت","فنوغيل","تنركوك","دلدول","سالي","أقبلي","المطارفة","أولاد أحمد تيمي","بودة","أوقروت","طالمين","برج باجي مختار","السبع","أولاد عيسى","تيمياوين"],
    "الشلف (02)":["الشلف","تنس","وادي الفضة","بوقادير","أبو الحسن","المرسى","الصبحة","أولاد فارس","سيدي عكاشة","الزبوجة"],
    "الأغواط (03)":["الأغواط","حاسي الرمل","عين ماضي","سيدي مخلوف","قلتة سيدي سعد"],
    "أم البواقي (04)":["أم البواقي","عين مليلة","عين فكرون","سيقوس","مسكيانة","فكيرينة","سوق نعمان"],
    "باتنة (05)":["باتنة","عين التوتة","تازولت","مروانة","آريس","بريكة","نقاوس","رأس العيون","سفيان","تيمقاد"],
    "بجاية (06)":["بجاية","أقبو","سيدي عيش","الفناية","خراطة","تيشي","بني منصور","سوق الثنين","تيمزريت"],
    "بسكرة (07)":["بسكرة","أولاد جلال","سيدي خالد","طولقة","الدوسن","فوغالة","مشونش","برانيس","ليشانة"],
    "بشار (08)":["بشار","القنادسة","بني ونيف","العبادلة","كرزاز","تاغيت"],
    "البليدة (09)":["البليدة","بوفاريك","العفرون","موزاية","الأربعاء","بوعينان","الشفة","بئر خادم","سوهان","مفتاح"],
    "البويرة (10)":["البويرة","سور الغزلان","الأخضرية","عين بسام","بشلول","القادرية","حيزر","مزدور","الحجرة","أقبو","وادي البردي"],
    "تمنراست (11)":["تمنراست","عين صالح","عين قزام"],
    "تبسة (12)":["تبسة","الشريعة","بئر العاتر","العوينات","نقرين","الحمامات","العقلة"],
    "تلمسان (13)":["تلمسان","غزاوت","المغنية","ندرومة","بني صاف","رمشي","سبدو","أولاد ميمون"],
    "تيارت (14)":["تيارت","فرندة","مدروسة","مهدية","عين دزاريت","السوقر","وادي ليلي","رحوية"],
    "تيزي وزو (15)":["تيزي وزو","عزازقة","لربعاء ناث إيراثن","بني يني","أقبيل","أيت محمود","مقلع","بوغني","إفرحون"],
    "الجزائر (16)":["الجزائر","حيدرة","باب الوادي","باب الزوار","الحراش","بئر توتة","بوزريعة","دار البيضاء","برج البحري","الرايس حميدو","المحمدية","الرغاية","دالي إبراهيم","القبة","سيدي موسى","بني مسوس","الدويرة","الكاليتوس"],
    "الجلفة (17)":["الجلفة","مسعد","بيرين","حاسي بحبح","دار الشيوخ"],
    "جيجل (18)":["جيجل","الطاهير","الميلية","العوانة","زيامة منصورية","الشقفة","القنار نشفي","تاكسنة"],
    "سطيف (19)":["سطيف","العلمة","عين أرنات","بوقاعة","عين ولمان","حمام قرقور","بئر العرش","أيت نويل","قجال","عين البيضاء"],
    "سعيدة (20)":["سعيدة","عين الحجر","يوب","سيدي بوبكر","أولاد خالد"],
    "سكيكدة (21)":["سكيكدة","عزابة","الحروش","القل","رأس الوادي","بني ولبان","أم الطبول"],
    "سيدي بلعباس (22)":["سيدي بلعباس","تلاغ","سيدي علي بوسيدي","مرحوم","مصطفى بن إبراهيم","الحساسنة","سيدي إبراهيم"],
    "عنابة (23)":["عنابة","سرايدي","البوني","الشطايبي","العلمة"],
    "قالمة (24)":["قالمة","وادي الزناتي","حمام دباغ","هيليوبوليس","بوشقوف","عين الحجل"],
    "قسنطينة (25)":["قسنطينة","الخروب","ديدوش مراد","عين عبيد","زيغود يوسف","حامة بوزيان"],
    "المدية (26)":["المدية","البرواقية","العمارية","وزرة","تابلاط","شلالة العذاورة","أولاد إبراهيم","قصر البخاري","بني سليمان"],
    "مستغانم (27)":["مستغانم","عين تادلس","سيدي علي","حاسي ماماش","مزغران","عشعاشة"],
    "المسيلة (28)":["المسيلة","بوسعادة","سيدي عيسى","مقرة","حمام الضلعة","أولاد دراج","عين الريش","خبانة"],
    "معسكر (29)":["معسكر","تيغنيف","سيق","غريس","المحمدية","وادي الأبطال","بوهني","نسمة"],
    "ورقلة (30)":["ورقلة","حاسي مسعود","الرويسات","سيدي خويلد","البرمة","النقوسة","عين البيضاء"],
    "وهران (31)":["وهران","أرزيو","مرسى الكبير","بطيوة","سيدي الشحمي","بن سنوس","العنصر","الكرمة"],
    "البيض (32)":["البيض","بوقطب","الأبيض سيدي الشيخ","ستيتن","الشلالة"],
    "برج بوعريريج (34)":["برج بوعريريج","رأس الوادي","المنصورة","الحمادية","العناصر","برج زمورة"],
    "بومرداس (35)":["بومرداس","رويبة","ثنية العابد","بودواو","دلس","نارنجة","إسطبل عنتر","الأرجاء","زموري"],
    "الطارف (36)":["الطارف","القالة","بوحجار","بن مهيدي","الذرعان","بريحان"],
    "تيسمسيلت (38)":["تيسمسيلت","خميستي","ثنية الحد","برج الأمير عبد القادر","بوقايد"],
    "الوادي (39)":["الوادي","قمار","الرباح","حساني عبد الكريم","البياضة","المقرن","ورماس"],
    "خنشلة (40)":["خنشلة","قايس","ششار","أولاد رشاش","بوحمامة"],
    "سوق أهراس (41)":["سوق أهراس","تاورة","سدراتة","أولاد إدريس","مداوروش","هنينية"],
    "تيبازة (42)":["تيبازة","شرشال","القليعة","حجوط","فوكة","بواسماعيل","الأصنام","خميستي","سيدي راشد"],
    "ميلة (43)":["ميلة","فرجيوة","تلاغمة","الشلالة","أحمد رشاي","وادي العثمانية"],
    "عين الدفلى (44)":["عين الدفلى","خميس مليانة","العطاف","العامرة","جندل","بطحية","حمام ريغة"],
    "النعامة (45)":["النعامة","مشرية","عين الصفراء","مغرار","عسلة","صفيصيفة"],
    "عين تموشنت (46)":["عين تموشنت","حمام بوحجر","بني صاف","شعبة اللحم","العين الكيحل","أولاد كيحل"],
    "غرداية (47)":["غرداية","بني يزقن","القرارة","بريان","متليلي","الغرارة"],
    "غليزان (48)":["غليزان","وادي رهيو","عمي موسى","يلل","الحمادنة","رلتزان"],
    "تيميمون (49)":["تيميمون","أوقروت","طلمين","دلدول","تنركوك","شروين"],
    "أولاد جلال (51)":["أولاد جلال","الدوسن","الشعيبة"],
    "بني عباس (52)":["بني عباس","كرزاز","إقلي","تامترت"],
    "عين صالح (53)":["عين صالح","فقارة الزوى","عين قزام"],
    "تقرت (55)":["تقرت","تماسين","الطيبات","نزلة","بن قشة"],
    "المغير (57)":["المغير","جامعة","سطيل","القليعة"],
    "المنيعة (58)":["المنيعة","حاسي القارة","حاسي الفحل"],
  };

  /* دمج communes.js مع البيانات الأساسية */
  const communesByWilaya = Object.assign({}, _baseCommunes, window.EXTRA_COMMUNES || {});

  /* ── مساعدات ──────────────────────────────────────────── */
  function parseLabel(k) {
    const m = String(k).match(/^(.*)\s\((\d{2})\)$/);
    return m ? { name: m[1].trim(), code2: m[2] } : { name: k, code2: null };
  }

  function onlyDigits10(v) {
    return String(v || "").replace(/\D+/g, "").slice(0, 10);
  }

  /* ── بناء بيانات dropdowns ────────────────────────────── */
  const sortedKeys = Object.keys(communesByWilaya).sort((a, b) => {
    const A = parseLabel(a).code2 || "99";
    const B = parseLabel(b).code2 || "99";
    return Number(A) - Number(B);
  });

  /* قائمة الولايات: [{ label: "أدرار (01)", value: "أدرار" }] */
  window._wilayaData = sortedKeys.map(k => ({
    label: k,
    value: parseLabel(k).name,
  }));

  /* خريطة الولاية → بلدياتها: { "أدرار": ["أدرار","تامست",...] } */
  window._communesMap = {};
  sortedKeys.forEach(k => {
    window._communesMap[parseLabel(k).name] = communesByWilaya[k] || [];
  });

  /* ── استدعاء تهيئة dropdowns (محددة في index.html) ────── */
  if (typeof window.initLocationSelects === "function") {
    window.initLocationSelects();
  }

  /* ── DOM refs ─────────────────────────────────────────── */
  const orderForm = document.getElementById("orderForm");
  if (!orderForm) return;

  /* ── جلب بيانات المنتجات من الصفوف (تجاهل المخفية وغير المتوفرة) ──── */
  function getProductItems() {
    const rows  = document.querySelectorAll("#productsList .product-row");
    const items = [];
    rows.forEach(row => {
      const idx = parseInt(row.querySelector(".pr-select")?.value);
      const qty = Math.max(1, parseInt(row.querySelector(".pr-qty-input")?.value) || 1);
      const cat = (window.PRODUCTS_CATALOG || [])[idx];
      if (!isNaN(idx) && cat && !cat.hidden && cat.available !== false) {
        items.push({ name: cat.name, price: cat.price, qty, subtotal: cat.price * qty });
      }
    });
    return items;
  }

  /* ── التحقق من توفر جميع المنتجات المحددة ──────────── */
  function checkAllAvailable() {
    const rows = document.querySelectorAll("#productsList .product-row");
    for (const row of rows) {
      const idx = parseInt(row.querySelector(".pr-select")?.value);
      const cat = (window.PRODUCTS_CATALOG || [])[idx];
      if (!isNaN(idx) && cat && !cat.hidden && cat.available === false) {
        return cat.name;
      }
    }
    return null;
  }

  /* ── مساعد: ترجمة كود الخطأ إلى رسالة واضحة ─────────── */
  function friendlyError(err) {
    const code = err?.code || "";
    const msg  = (err?.message || "").toLowerCase();

    if (code === "42501" || msg.includes("row-level security") || msg.includes("rls")) {
      return (
        "❌ خطأ في إعدادات قاعدة البيانات (RLS).\n\n" +
        "يجب تشغيل ملف supabase-setup.sql في لوحة تحكم Supabase لتفعيل صلاحية الإرسال.\n\n" +
        "للمساعدة تواصل معنا: 0542 94 99 67"
      );
    }
    if (code === "42703" || msg.includes("column") || msg.includes("does not exist")) {
      return (
        "❌ عمود مفقود في الجدول (schema mismatch).\n" +
        "الخطأ: " + (err?.message || "") + "\n\n" +
        "تواصل معنا: 0542 94 99 67"
      );
    }
    if (code === "23502" || msg.includes("null value") || msg.includes("not-null")) {
      return (
        "❌ حقل إجباري فارغ.\n" +
        "الخطأ: " + (err?.message || "") + "\n\n" +
        "تواصل معنا: 0542 94 99 67"
      );
    }
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch")) {
      return "❌ خطأ في الاتصال بالإنترنت. تحقق من الشبكة وأعد المحاولة.";
    }
    return (
      "❌ حدث خطأ أثناء إرسال الطلب.\n" +
      "تأكد من اتصالك بالإنترنت وحاول مجدداً.\n\n" +
      "أو تواصل معنا مباشرة: 0542 94 99 67"
    );
  }

  /* ── إرسال الطلب ──────────────────────────────────────── */
  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (typeof window.validateCheckout === "function" && !window.validateCheckout()) return;

    /* ── جمع بيانات النموذج ─────────────────────────────── */
    const fullName     = document.getElementById("full_name")?.value?.trim()    || "";
    const phone        = onlyDigits10(document.getElementById("phoneInput")?.value || "");
    const address      = document.getElementById("addressInput")?.value?.trim() || "";
    const wilaya       = document.getElementById("wilayaHidden")?.value?.trim() || "";
    const commune      = document.getElementById("communeHidden")?.value?.trim() || null;
    const notes        = document.getElementById("notes")?.value?.trim()        || null;
    const pm           = document.querySelector('input[name="payment_method"]:checked')?.value || "";
    const deliveryType = document.querySelector('input[name="delivery_type"]:checked')?.value  || "home";

    /* ── حماية: القيم المقبولة بقاعدة البيانات ────────────
       payment_method : 'prepaid' | 'cash_on_delivery'
       delivery_type  : 'home'    | 'office'            */
    const VALID_PM = ["prepaid", "cash_on_delivery"];
    const VALID_DT = ["home", "office"];
    if (!VALID_PM.includes(pm)) {
      alert("❌ طريقة الدفع غير صالحة. يرجى اختيار طريقة دفع من القائمة.");
      return;
    }
    if (!VALID_DT.includes(deliveryType)) {
      alert("❌ طريقة التوصيل غير صالحة. يرجى اختيار طريقة توصيل صحيحة.");
      return;
    }
    const wilayaCode   = WILAYA_CODE[wilaya] || null;

    const items       = getProductItems();
    const subtotal    = items.reduce((s, it) => s + it.subtotal, 0);
    const shippingFee = Math.max(0, parseInt(document.getElementById("shippingFeeInput")?.value || "0", 10) || 0);
    const totalPrice  = subtotal + shippingFee;

    /* ── سجّل البيانات قبل الإرسال (للتشخيص) ──────────── */
    console.log("📦 Order payload:", {
      fullName, phone, address, wilaya, wilayaCode, commune,
      deliveryType, shippingFee, subtotal, totalPrice, pm,
      itemsCount: items.length,
    });

    /* ── تحقق إضافي: توفر المنتجات ─────────────────────── */
    const unavailName = checkAllAvailable();
    if (unavailName) {
      const alertEl2 = document.getElementById("formAlert");
      const msg2 = `❌ عذرًا، نفذت الكمية من "${unavailName}". يرجى إزالته من طلبك.`;
      if (alertEl2) {
        alertEl2.innerHTML = msg2;
        alertEl2.classList.add("show");
        alertEl2.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        alert(msg2);
      }
      return;
    }

    /* ── تحقق إضافي: بيانات المنتجات ───────────────────── */
    if (items.length === 0) {
      alert("❌ يرجى إضافة منتج واحد على الأقل قبل تأكيد الطلب.");
      return;
    }
    if (!wilaya) {
      alert("❌ يرجى اختيار الولاية قبل إرسال الطلب.");
      return;
    }
    if (!commune) {
      alert("❌ يرجى اختيار البلدية / المنطقة قبل إرسال الطلب.");
      return;
    }
    if (!pm) {
      alert("❌ يرجى اختيار طريقة الدفع.");
      return;
    }

    const submitBtn = document.getElementById("submitBtn");
    const resetBtn  = () => {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "✅ تأكيد الطلب"; }
    };
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "⏳ جاري الإرسال..."; }

    try {

      /* ── 1. رفع وصل الدفع إلى Storage ──────────────────── */
      let receiptUrl = null;
      const receiptFile = document.getElementById("paymentReceipt")?.files?.[0];

      if (receiptFile) {
        const ext      = receiptFile.name.split(".").pop().toLowerCase() || "jpg";
        const filePath = `receipts/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

        console.log("📤 Uploading receipt:", filePath);
        const { data: upData, error: upErr } = await supabase.storage
          .from("payment-receipts")
          .upload(filePath, receiptFile, { upsert: false, contentType: receiptFile.type });

        if (upErr) {
          console.error("❌ Receipt upload error:", upErr);
          throw new Error("فشل رفع وصل الدفع: " + (upErr.message || JSON.stringify(upErr)));
        }

        const { data: urlData } = supabase.storage
          .from("payment-receipts")
          .getPublicUrl(upData.path);

        receiptUrl = urlData?.publicUrl || null;
        console.log("✅ Receipt uploaded:", receiptUrl);
      }

      /* ── 2. إنشاء الطلب في جدول orders ─────────────────── */
      const orderId = crypto.randomUUID();
      console.log("🔑 Order ID:", orderId);

      const orderPayload = {
        id:             orderId,
        full_name:      fullName,
        phone:          phone,
        address:        address,
        wilaya:         wilaya,
        wilaya_code:    wilayaCode,
        commune:        commune,
        delivery_type:  deliveryType,
        shipping_fee:   shippingFee,
        subtotal:       subtotal,
        total_price:    totalPrice,
        payment_method: pm,
        is_confirmed:   null,
        receipt_url:    receiptUrl,
        notes:          notes,
      };
      console.log("📝 Inserting order:", orderPayload);

      const { error: orderErr } = await supabase
        .from("orders")
        .insert(orderPayload);

      if (orderErr) {
        console.error("❌ Order insert error — code:", orderErr.code,
          "| message:", orderErr.message,
          "| details:", orderErr.details,
          "| hint:", orderErr.hint);
        throw orderErr;
      }

      console.log("✅ Order created:", orderId);

      /* ── 3. إضافة المنتجات في جدول order_items ──────────── */
      if (items.length > 0) {
        const orderItems = items.map(it => ({
          order_id:     orderId,
          product_id:   null,
          product_name: it.name,
          unit_price:   it.price,
          quantity:     it.qty,
          subtotal:     it.subtotal,
        }));

        console.log("📝 Inserting order_items:", orderItems);
        const { error: itemsErr } = await supabase
          .from("order_items")
          .insert(orderItems);

        if (itemsErr) {
          console.error("❌ Order items insert error — code:", itemsErr.code,
            "| message:", itemsErr.message);
          /* لا نوقف العملية: الطلب الرئيسي تم — ندوّن الخطأ فقط */
          console.warn("⚠️ Order created but items could not be saved. orderId:", orderId);
        } else {
          console.log(`✅ Order items saved: ${orderItems.length} item(s)`);
        }
      }

      /* ── 4. نجاح — مسح السلة ثم التوجيه لصفحة النجاح ─────── */
      localStorage.removeItem('derradj_cart');
      localStorage.removeItem('derradj_cart_ts');
      window.location.href = "success.html";

    } catch (err) {
      console.error("❌ Submit error:", err);
      resetBtn();
      const alertEl = document.getElementById("formAlert");
      const userMsg = friendlyError(err);
      if (alertEl) {
        alertEl.innerHTML = userMsg.replace(/\n/g, "<br>");
        alertEl.classList.add("show");
        alertEl.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        alert(userMsg);
      }
    }
  });

})();
