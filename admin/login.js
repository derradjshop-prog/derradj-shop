document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ Admin Login JS Loaded");

  // ✅ بيانات Supabase الصحيحة (من مشروعك)
  const SUPABASE_URL = "https://jbmcbjzcedqpvnhbmrhk.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpibWNianpjZWRxcHZuaGJtcmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2NjU1MDUsImV4cCI6MjA4NTI0MTUwNX0.u_D1K7gFCQmmI_m0do5-VpdXrXXLPQ8BCDMLc3Ew1Yk";

  // ✅ تأكد أن مكتبة Supabase محمّلة
  if (!window.supabase || !window.supabase.createClient) {
    alert("❌ مكتبة Supabase غير محمّلة. أضف supabase-js قبل admin-login.js");
    return;
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const form = document.getElementById("adminLoginForm");
  const loginButton = form?.querySelector('button[type="submit"]');
  const statusText = document.getElementById("statusText");
  const forgotBtn = document.getElementById("forgotBtn");

  const originalText = loginButton ? loginButton.textContent : "Log In";

  if (!form) {
    console.error("⚠️ لم يتم العثور على الفورم #adminLoginForm");
    return;
  }

  function setStatus(text, ok = false) {
    if (!statusText) return;
    statusText.textContent = text || "";
    statusText.style.color = ok ? "#166534" : "#b91c1c";
  }

  // ✅ تحويل رقم/بريد إلى email مستعمل في Auth
  const toAuthEmail = (contact) => {
    let clean = String(contact || "").trim().toLowerCase();
    clean = clean.replace(/[^0-9a-zA-Z@.]/g, "");

    if (clean.startsWith("+213")) clean = "0" + clean.slice(4);
    else if (clean.startsWith("213")) clean = "0" + clean.slice(3);

    return clean.includes("@") ? clean : `${clean}@derradjshop.com`;
  };

  // ✅ Forgot password
  forgotBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    setStatus("");

    const contactInput = document.getElementById("contact");
    const contact = contactInput?.value.trim() || "";
    if (!contact) {
      setStatus("❌ اكتب البريد أو الرقم أولًا");
      return;
    }

    const email = toAuthEmail(contact);

    try {
      // ملاحظة: إذا ما عندك صفحة reset، تقدر تخليها بدون redirectTo
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;

      setStatus("✅ تم إرسال رابط استرجاع كلمة المرور (إن كان الحساب موجودًا)", true);
    } catch (err) {
      console.error(err);
      setStatus("❌ لم نتمكن من إرسال رابط الاسترجاع");
    }
  });

  // ✅ تسجيل الدخول + تحقق أنه Admin من staff_accounts
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!loginButton) return;

    setStatus("");
    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    const contactInput = document.getElementById("contact");
    const passwordInput = document.getElementById("password");

    const contact = contactInput?.value.trim() || "";
    const password = passwordInput?.value || "";

    if (!contact || !password) {
      setStatus("❌ أدخل البريد/الرقم وكلمة السر");
      loginButton.textContent = originalText;
      loginButton.disabled = false;
      return;
    }

    const emailForAuth = toAuthEmail(contact);

    try {
      // 1) تسجيل الدخول
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: emailForAuth,
          password,
        });

      if (authError || !authData?.user) {
        setStatus("❌ بيانات غير صحيحة");
        loginButton.textContent = originalText;
        loginButton.disabled = false;
        return;
      }

      const userId = authData.user.id;

      // 2) تحقق: هل هذا الحساب موجود في staff_accounts كـ staff أو admin و active؟
      const { data: staffRow, error: staffErr } = await supabase
        .from("staff_accounts")
        .select("email, role, is_active, full_name")
        .eq("id", userId)
        .maybeSingle();

      if (staffErr) {
        console.error("staff_accounts check error:", staffErr);
        setStatus("❌ خطأ أثناء التحقق من صلاحيات الأدمن");
        await supabase.auth.signOut();
        loginButton.textContent = originalText;
        loginButton.disabled = false;
        return;
      }

      if (!staffRow) {
        setStatus("🚫 هذا الحساب غير مصرح (ليس ضمن staff_accounts)");
        await supabase.auth.signOut();
        loginButton.textContent = originalText;
        loginButton.disabled = false;
        return;
      }

      if (staffRow.is_active !== true) {
        setStatus("🚫 هذا الحساب مُعطّل");
        await supabase.auth.signOut();
        loginButton.textContent = originalText;
        loginButton.disabled = false;
        return;
      }

      const role = String(staffRow.role || "").toLowerCase();

      // 2.5) حساب بائع (Seller) — يُحوَّل تلقائياً إلى لوحة البائع
      //      بدلاً من رفضه أو تحميل واجهة الأدمن. الجلسة صالحة بالفعل
      //      لصفحة seller/dashboard.html فلا حاجة لإعادة تسجيل الدخول.
      if (role === 'seller') {
        setStatus("↪️ هذا حساب بائع — يتم تحويلك إلى لوحة البائع...", true);
        window.location.href = "../seller/dashboard.html";
        return;
      }

      if (role !== 'admin') {
        setStatus("🚫 هذا الحساب غير مصرح له بالدخول");
        await supabase.auth.signOut();
        loginButton.textContent = originalText;
        loginButton.disabled = false;
        return;
      }

      // 3) نجاح دخول الأدمن/الستاف
      setStatus("✅ تم تسجيل الدخول بنجاح", true);
      sessionStorage.setItem("staff_role", role);
      sessionStorage.setItem("staff_email", String(staffRow.email || emailForAuth).toLowerCase());

      // ✅ إذا admin.html في نفس مجلد صفحة الأدمن (admin/)
      window.location.href = "admin.html";

      // إذا كان admin.html خارج المجلد: استخدم هذا بدل السطر السابق
      // window.location.href = "../admin.html";

    } catch (err) {
      console.error("❌ Admin login error:", err);
      setStatus("❌ حدث خطأ أثناء تسجيل الدخول");
      loginButton.textContent = originalText;
      loginButton.disabled = false;
    }
  });
});
