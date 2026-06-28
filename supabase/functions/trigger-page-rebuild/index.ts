// supabase/functions/trigger-page-rebuild/index.ts
//
// Triggers the "Generate product pages" GitHub Actions workflow
// (workflow_dispatch) right after the admin panel successfully
// inserts/updates/deletes a row in admin_products_catalog — replacing
// the old fixed cron schedule with an on-demand rebuild.
//
// Why this needs to be an Edge Function and not a direct fetch() from
// admin/products-manager.js: dispatching a workflow requires a GitHub
// token with `actions: write` on this repo. That token must never reach
// the browser (anyone with devtools open could read it straight out of
// admin.js and get write access to this repo's Actions). Routing through
// a server-side function keeps the token here, in Supabase secrets,
// where only this function can read it.
//
// Required secrets (set once with `supabase secrets set --env-file ...`
// or via the Dashboard → Edge Functions → trigger-page-rebuild → Secrets):
//   GITHUB_TOKEN          fine-grained PAT, scoped to ONLY this repo,
//                         with "Actions: Read and write" permission.
//   GITHUB_OWNER          e.g. "derradjshop-prog"          (optional, has a default below)
//   GITHUB_REPO           e.g. "derradj-shop"              (optional, has a default below)
//   GITHUB_WORKFLOW_FILE  e.g. "generate-product-pages.yml" (optional, has a default below)
//   GITHUB_REF            branch to run against, e.g. "main" (optional, has a default below)
//
// SUPABASE_URL and SUPABASE_ANON_KEY are injected automatically by the
// Supabase platform for every Edge Function — no need to set them.
//
// Deploy with:
//   npx supabase login
//   npx supabase link --project-ref jbmcbjzcedqpvnhbmrhk
//   npx supabase functions deploy trigger-page-rebuild
//   npx supabase secrets set GITHUB_TOKEN=ghp_xxxxxxxxxxxx

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GITHUB_OWNER = Deno.env.get('GITHUB_OWNER') ?? 'derradjshop-prog';
const GITHUB_REPO = Deno.env.get('GITHUB_REPO') ?? 'derradj-shop';
const GITHUB_WORKFLOW_FILE = Deno.env.get('GITHUB_WORKFLOW_FILE') ?? 'generate-product-pages.yml';
const GITHUB_REF = Deno.env.get('GITHUB_REF') ?? 'main';
const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  try {
    if (!GITHUB_TOKEN) {
      return json(
        { ok: false, error: 'GITHUB_TOKEN secret is not configured on this function yet.' },
        500,
      );
    }

    // 1) Require a real, currently-logged-in, active staff account — not
    //    just "any request carrying the public anon key."
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ ok: false, error: 'Unauthorized — a valid admin session is required.' }, 401);
    }

    const { data: staff, error: staffErr } = await supabase
      .from('staff_accounts')
      .select('role, is_active')
      .eq('id', userData.user.id)
      .maybeSingle();

    const role = String(staff?.role || '').toLowerCase();
    if (staffErr || !staff || !staff.is_active || !['admin', 'seller'].includes(role)) {
      return json({ ok: false, error: 'Forbidden — not an active staff account.' }, 403);
    }

    // 2) Optional human-readable reason, logged in the workflow run only
    //    (e.g. "add product: قوة عقلك الباطن") — never trusted for anything else.
    let reason = 'admin-panel';
    try {
      const body = await req.json();
      if (body?.reason) reason = String(body.reason).slice(0, 200);
    } catch {
      /* no JSON body is fine */
    }

    // 3) Dispatch the workflow.
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'derradj-shop-admin',
        },
        body: JSON.stringify({ ref: GITHUB_REF, inputs: { reason } }),
      },
    );

    if (dispatchRes.status !== 204) {
      const text = await dispatchRes.text().catch(() => '');
      return json(
        { ok: false, error: `GitHub API ${dispatchRes.status}: ${text || dispatchRes.statusText}` },
        502,
      );
    }

    // 4) Best-effort lookup of the run that was just created, so the
    //    admin gets a direct link instead of "trust me, it started."
    //    workflow_dispatch itself returns 204 with no run id — this is
    //    the only way to recover one without changing the workflow.
    let run: { id: number; html_url: string; status: string } | null = null;
    try {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const runsRes = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=1`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
      if (runsRes.ok) {
        const runsData = await runsRes.json();
        const latest = runsData?.workflow_runs?.[0];
        if (latest) run = { id: latest.id, html_url: latest.html_url, status: latest.status };
      }
    } catch {
      /* the dispatch already succeeded — a failed lookup isn't a real failure */
    }

    return json({ ok: true, run }, 200);
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
