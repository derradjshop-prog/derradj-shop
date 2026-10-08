-- ==========================================================
-- agent_balance_resets — تصفير رصيد موظفة المتابعة من لوحة الأدمن
-- ==========================================================
-- الرصيد كان = مجموع كل صفوف agent_earnings منذ البداية، بلا أي
-- طريقة لتسجيل أن الأدمن دفع للموظفة ما تراكم لها.
--
-- الآن: زر "تصفير الرصيد" في تبويب الموظفون يُدرج صفاً هنا، والرصيد
-- المعروض (في admin.js و agent/dashboard.html) = مجموع agent_earnings
-- بعد آخر reset_at فقط. صفوف agent_earnings لا تُحذف ولا تُعدّل —
-- سجل العمولات كامل يبقى، وهذا الجدول يحفظ كل عملية تصفير ومبلغها.
--
-- ⚠️ شغّل هذا الملف في Supabase SQL Editor *قبل* نشر admin.js و
--    agent/dashboard.html الجديدين، وإلا سيفشل التصفير وتبقى أرصدة
--    الموظفات تُحسب كاملة (fetch يفشل بهدوء ويُعامل كأنه لا تصفير).
-- ==========================================================

create table if not exists public.agent_balance_resets (
  id            uuid primary key default gen_random_uuid(),
  agent_id      uuid not null references public.staff_accounts(id) on delete cascade,
  reset_at      timestamptz not null default now(),
  amount_before numeric not null default 0,
  reset_by      uuid references public.staff_accounts(id) on delete set null
);

create index if not exists agent_balance_resets_agent_reset_idx
  on public.agent_balance_resets (agent_id, reset_at desc);

alter table public.agent_balance_resets enable row level security;

-- الأدمن: قراءة وإدراج فقط (لا تعديل ولا حذف — السجل للتتبع)
drop policy if exists "admin select agent_balance_resets" on public.agent_balance_resets;
create policy "admin select agent_balance_resets"
  on public.agent_balance_resets for select
  to authenticated
  using (exists (
    select 1 from public.staff_accounts s
     where s.id = auth.uid() and s.role = 'admin' and s.is_active
  ));

drop policy if exists "admin insert agent_balance_resets" on public.agent_balance_resets;
create policy "admin insert agent_balance_resets"
  on public.agent_balance_resets for insert
  to authenticated
  with check (
    reset_by = auth.uid()
    and exists (
      select 1 from public.staff_accounts s
       where s.id = auth.uid() and s.role = 'admin' and s.is_active
    )
  );

-- الموظفة: تقرأ سجلات التصفير الخاصة بها فقط (لحساب رصيدها)
drop policy if exists "agent select own agent_balance_resets" on public.agent_balance_resets;
create policy "agent select own agent_balance_resets"
  on public.agent_balance_resets for select
  to authenticated
  using (agent_id = auth.uid());
