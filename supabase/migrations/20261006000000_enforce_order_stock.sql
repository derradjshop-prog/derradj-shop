-- ==========================================================
-- enforce_order_stock — رفض أي طلب يحتوي منتجاً غير متوفر
-- ==========================================================
-- التحقق من التوفر كان في المتصفح فقط، فكانت تمرّ طلبات لمنتجات
-- "نفذت الكمية" (صفحة مفتوحة قبل تغيير الحالة، فشل تحميل الكتالوج،
-- منتجات محذوفة من لوحة الإدارة ما زالت في القائمة المحلية).
--
-- الآن: ordre/app.js يرسل catalog_ids (أرقام المنتجات، والباقة مفكوكة
-- إلى كتبها) مع الطلب، وهذا الـ trigger يرفض الطلب كاملاً إن كان أي
-- منتج جعله الأدمن غير متوفر (stock_status = 'out_of_stock') أو عطّله
-- (is_active = false) في admin_products_catalog.
--
-- ⚠️ شغّل هذا الملف في Supabase SQL Editor *قبل* نشر ordre/app.js الجديد،
--    وإلا ستفشل الطلبات بخطأ "column catalog_ids does not exist".
-- ==========================================================

alter table public.orders
  add column if not exists catalog_ids integer[];

create or replace function public.enforce_order_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bad text;
begin
  -- نسخة قديمة من صفحة الطلب (بدون catalog_ids) لا يمكن التحقق منها → ترفض
  if new.catalog_ids is null or cardinality(new.catalog_ids) = 0 then
    raise exception 'product_unavailable: يرجى تحديث صفحة الطلب'
      using errcode = 'P0001';
  end if;

  select string_agg(coalesce(p.product_name, '#' || ids.id::text), '، ')
    into bad
    from unnest(new.catalog_ids) as ids(id)
    join public.admin_products_catalog p on p.catalog_id = ids.id
   where p.is_active is not true
      or p.stock_status = 'out_of_stock';

  if bad is not null then
    raise exception 'product_unavailable: %', bad using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_order_stock() from public, anon, authenticated;

drop trigger if exists trg_enforce_order_stock on public.orders;
create trigger trg_enforce_order_stock
  before insert on public.orders
  for each row execute function public.enforce_order_stock();
