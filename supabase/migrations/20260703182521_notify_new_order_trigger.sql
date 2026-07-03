-- Replaces the Dashboard "Database Webhook" on public.orders with a plain
-- SQL trigger, so the whole notify-on-new-order setup lives in this repo
-- and can be changed by editing this file + `supabase db push` — no
-- Dashboard visits needed.
--
-- The old webhook was itself just a Postgres trigger (tgname
-- "notify-new-order") calling supabase_functions.http_request(...) with a
-- baked-in service_role JWT. We drop that one and replace it with our own
-- function/trigger pair that calls the Edge Function via pg_net directly.

create extension if not exists pg_net;

-- Old Dashboard-created webhook trigger — remove so orders don't notify twice.
drop trigger if exists "notify-new-order" on public.orders;

create or replace function public.trigger_notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://jbmcbjzcedqpvnhbmrhk.supabase.co/functions/v1/notify-new-order',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'DERRADJ_NOTIFY_SECRET_2026'
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'orders',
      'record', to_jsonb(NEW)
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_orders_notify_new_order on public.orders;

create trigger trg_orders_notify_new_order
  after insert on public.orders
  for each row
  execute function public.trigger_notify_new_order();
