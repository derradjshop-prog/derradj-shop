// supabase/functions/notify-new-order/index.ts
//
// Sends a Telegram message to the shop owner the moment a new row lands
// in public.orders. Called by a plain SQL trigger on public.orders
// (see supabase/migrations/20260703182521_notify_new_order_trigger.sql —
// trigger_notify_new_order() calls this function via pg_net's
// net.http_post) — NOT by the checkout page. ordre/app.js never knows
// this function exists: it just
// inserts into "orders" like it always has, and Supabase fires this
// function server-side, after the insert has already committed. That
// means a Telegram/network failure in here can never block, slow down,
// or fail the customer's checkout — the row is already saved before this
// function is even invoked.
//
// Why order_items needs a retry loop:
// ordre/app.js inserts the order row, THEN inserts order_items in a
// second, separate request (see ordre/app.js, "إضافة المنتجات في جدول
// order_items"). The INSERT webhook on "orders" can fire and reach this
// function before that second request lands, so the product list may
// not exist in the database yet. Rather than touching the checkout flow
// to change that ordering, this function polls order_items briefly
// (a few hundred ms apart, a few seconds total) and sends the message
// with whatever it finds — it never blocks indefinitely and never
// throws if the list is still empty.
//
// Required secrets (`npx supabase secrets set NAME=value` — never the
// Dashboard):
//   TELEGRAM_BOT_TOKEN         token from @BotFather
//   TELEGRAM_CHAT_ID           chat/user id the bot should message
//   ORDER_NOTIFY_WEBHOOK_SECRET
//     A random string only you and trigger_notify_new_order() (in the
//     migration named above) know. This function has verify_jwt = false
//     (see supabase/config.toml) because the trigger has no Supabase Auth
//     session to send — so this header is what stops a stranger from
//     finding the function's public URL and spamming your Telegram chat.
//     Must match the literal string hardcoded in that migration's
//     net.http_post headers — if you rotate one, edit the other and
//     re-run both commands.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically
// by the Supabase platform for every Edge Function — no need to set
// them. The service role key is required (not the anon key) because
// anon has INSERT-only access to orders/order_items; reading the items
// back for the message needs to bypass that RLS restriction.
//
// Deploy with:
//   npx supabase login
//   npx supabase link --project-ref jbmcbjzcedqpvnhbmrhk
//   npx supabase functions deploy notify-new-order
//   npx supabase secrets set TELEGRAM_BOT_TOKEN=xxxx TELEGRAM_CHAT_ID=xxxx ORDER_NOTIFY_WEBHOOK_SECRET=xxxx

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
const WEBHOOK_SECRET = Deno.env.get('ORDER_NOTIFY_WEBHOOK_SECRET');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Legacy Telegram "Markdown" only needs these four characters escaped.
// Order data (names, addresses, product titles) is free text a customer
// typed, so it has to be treated as untrusted input here.
function escapeMarkdown(value: unknown): string {
  return String(value ?? '').replace(/([_*`\[])/g, '\\$1');
}

function formatDA(amount: unknown): string {
  const n = Number(amount) || 0;
  return `${new Intl.NumberFormat('en-US').format(n)} DA`;
}

function formatAlgeriaTime(iso: unknown): string {
  const d = iso ? new Date(String(iso)) : new Date();
  if (Number.isNaN(d.getTime())) return String(iso ?? '—');
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Algiers',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

const DELIVERY_LABELS: Record<string, string> = {
  home: 'Home delivery',
  office: 'Office / stop-desk pickup',
};

const PAYMENT_LABELS: Record<string, string> = {
  cash_on_delivery: 'Cash on delivery',
  prepaid: 'Prepaid',
  ccp: 'CCP',
  baridimob: 'BaridiMob',
};

type OrderItem = {
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
};

// order_items can lag a few hundred ms behind the orders row (see file
// header) — poll briefly instead of giving up on the first empty read.
async function fetchOrderItemsWithRetry(
  supabaseAdmin: ReturnType<typeof createClient>,
  orderId: string,
): Promise<OrderItem[]> {
  const MAX_ATTEMPTS = 6;
  const DELAY_MS = 500;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabaseAdmin
      .from('order_items')
      .select('product_name, unit_price, quantity, subtotal')
      .eq('order_id', orderId)
      .order('product_name', { ascending: true });

    if (error) {
      console.error(`order_items fetch failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, error.message);
    } else if (data && data.length > 0) {
      return data as OrderItem[];
    }

    if (attempt < MAX_ATTEMPTS) await sleep(DELAY_MS);
  }

  return [];
}

function buildMessage(order: Record<string, unknown>, items: OrderItem[]): string {
  const deliveryLabel = DELIVERY_LABELS[String(order.delivery_type)] ?? escapeMarkdown(order.delivery_type);
  const paymentLabel = PAYMENT_LABELS[String(order.payment_method)] ?? escapeMarkdown(order.payment_method);
  const wilayaLine = order.commune
    ? `${escapeMarkdown(order.wilaya)} — ${escapeMarkdown(order.commune)}`
    : escapeMarkdown(order.wilaya);

  const itemsBlock = items.length
    ? items
        .map((it, i) => {
          const name = escapeMarkdown(it.product_name);
          const qty = Number(it.quantity) || 0;
          const unit = formatDA(it.unit_price);
          const lineTotal = formatDA(it.subtotal ?? (Number(it.unit_price) || 0) * qty);
          return `${i + 1}. ${name} — ${qty} × ${unit} = ${lineTotal}`;
        })
        .join('\n')
    : '_Items are still saving — check the order in the dashboard._';

  return [
    '🔔 *New Order*',
    '',
    `*Order:* #${escapeMarkdown(order.order_number)}`,
    `*Customer:* ${escapeMarkdown(order.full_name)}`,
    `*Phone:* ${escapeMarkdown(order.phone)}`,
    `*Total:* ${formatDA(order.total_price)}`,
    `*Delivery:* ${deliveryLabel}`,
    `*Wilaya:* ${wilayaLine}`,
    `*Address:* ${escapeMarkdown(order.address)}`,
    `*Date:* ${formatAlgeriaTime(order.created_at)}`,
    `*Payment:* ${paymentLabel}`,
    '',
    `*Products (${items.length}):*`,
    itemsBlock,
  ].join('\n');
}

async function sendTelegramMessage(text: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const body = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const payload = await res.json().catch(() => null);

      if (res.ok && payload?.ok) return { ok: true };

      console.error(`Telegram API error (attempt ${attempt}/2):`, res.status, payload);
      // A 4xx means the request itself is wrong (bad token, bad chat id,
      // malformed markdown) — retrying the exact same request won't help.
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, error: payload?.description || `Telegram HTTP ${res.status}` };
      }
    } catch (err) {
      console.error(`Telegram request failed (attempt ${attempt}/2):`, err);
    }
    if (attempt < 2) await sleep(700);
  }

  return { ok: false, error: 'Telegram delivery failed after retries' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  // The Database Webhook has no Supabase Auth session to present, so a
  // shared secret header is what proves this call actually came from our
  // own webhook and not from someone who found the function's URL.
  if (!WEBHOOK_SECRET || req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }

  let payload: { type?: string; table?: string; record?: Record<string, unknown> };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { type, table, record } = payload ?? {};
  if (table !== 'orders' || type !== 'INSERT' || !record?.id) {
    // Not the event we care about (e.g. the webhook was reused for
    // another table later) — acknowledge quietly, do nothing.
    return json({ ok: true, skipped: true }, 200);
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('notify-new-order: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID secret is not configured yet.');
    // 200, not 500 — a missing secret must never look like a checkout
    // failure to anything retrying this webhook.
    return json({ ok: false, error: 'Telegram secrets not configured' }, 200);
  }

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const items = await fetchOrderItemsWithRetry(supabaseAdmin, String(record.id));
    const text = buildMessage(record, items);
    console.log("MESSAGE:", text);
    const result = await sendTelegramMessage(text);

    if (!result.ok) {
      console.error(`notify-new-order: order #${record.order_number} — Telegram send failed:`, result.error);
    }

    // result.error is included here (not just console.error'd) so the trigger
    // path can see the failure reason in net._http_response via
    // `select content from net._http_response order by id desc limit 1;` —
    // no Edge Function log viewer needed to debug a failed send.
    return json({ ok: result.ok, items_found: items.length, error: result.error }, 200);
  } catch (err) {
    console.error('notify-new-order: unexpected error:', err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 200);
  }
});
