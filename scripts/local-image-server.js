/* ==========================================================
   local-image-server.js — Derradj Shop | LOCAL DEV ONLY
   ==========================================================
   A tiny local-only HTTP helper the admin panel (running under
   VS Code Live Server) talks to so a newly-picked product image can
   be written directly into this repo, on this machine, without ever
   touching Supabase Storage. The browser already converts the image
   to real WebP bytes (see convertToWebpForLocal() in
   admin/products-manager.js) before sending it here — this server
   only ever writes bytes it's given, it does no image processing of
   its own (no duplicate conversion logic).

   Start it with:  npm run local-image-server
   Stop it with:   Ctrl+C

   Security model:
   - Binds to 127.0.0.1 only — never reachable from the network.
   - Only accepts requests whose Origin is one of the local Admin's
     Live Server origins (127.0.0.1/localhost on port 5500 or 5501 —
     Live Server falls back to 5501 when 5500 is already in use).
   - The project root is fixed to this script's own parent directory
     — never taken from the request. The browser can never choose an
     arbitrary destination.
   - category/slug/filename are validated against strict allow-list
     regexes; subcategory is sanitized the same way
     resolveThumbSrc()/electronicsFolderBase() already do elsewhere
     in this codebase, with an explicit guard against "." / ".." so
     it can never become a path-traversal segment.
   - Every resolved write/delete path is re-checked to still be
     inside the project root before touching disk.
   - This file is NEVER referenced by netlify.toml or any deploy
     step — it only ever runs because you started it manually.
   ========================================================== */
'use strict';

const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const PORT = 8787;
const HOST = '127.0.0.1';
const ROOT = path.resolve(__dirname, '..');
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:5501',
  'http://localhost:5501',
]);

/* Same mapping as resolveThumbSrc()/electronicsFolderBase() elsewhere
   in the project — keep in sync if that mapping ever changes. */
const SUBCATEGORY_DIR = { power_bank: 'power-bank', smart_watch: 'smart-watch' };
const CATEGORY_RE = /^[a-z_]+$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FILENAME_RE = /^(main|image-\d{1,3})\.webp$/;
const MAX_BODY_BYTES = 15 * 1024 * 1024; /* one product image, generous cap */

function sanitizeSubdir(subcategory) {
  let s = String(SUBCATEGORY_DIR[subcategory] || subcategory || 'other')
    .replace(/[\/\\?%*:|"<>]/g, '-')
    .trim() || 'other';
  /* Stripping slashes above still leaves a bare "." or ".." able to
     act as a real path-traversal segment once handed to path.join —
     neutralize that explicitly. */
  if (s === '.' || s === '..') s = 'other';
  return s;
}

function resolveTarget(searchParams) {
  const category = searchParams.get('category') || '';
  const subcategory = searchParams.get('subcategory') || '';
  const slug = searchParams.get('slug') || '';
  const filename = searchParams.get('filename') || '';

  if (!CATEGORY_RE.test(category)) throw new Error('category غير صالحة');
  if (!SLUG_RE.test(slug)) throw new Error('slug غير صالح');
  if (!FILENAME_RE.test(filename)) throw new Error('اسم ملف غير مسموح');

  const segments = category === 'books'
    ? ['books', slug]
    : category === 'subscriptions'
    ? ['subscriptions', slug]
    : ['Electronique', sanitizeSubdir(subcategory), slug];

  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') throw new Error('مسار غير صالح');
  }

  const dir = path.resolve(path.join(ROOT, ...segments));
  if (dir !== ROOT && !dir.startsWith(ROOT + path.sep)) {
    throw new Error('مسار غير صالح — خارج مجلد المشروع');
  }
  return { dir, filename, relPath: [...segments, filename].join('/') };
}

function isWebp(buf) {
  return buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP';
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(json);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('الملف كبير جداً');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  /* The 127.0.0.1 bind already blocks remote network access — this
     Origin check is defense in depth against another local process
     or browser tab making requests. */
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    send(res, 403, { ok: false, error: 'origin غير مسموح' });
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  try {
    if (req.method === 'GET' && url.pathname === '/api/ping') {
      send(res, 200, { ok: true, root: ROOT });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/write-image') {
      const { dir, filename, relPath } = resolveTarget(url.searchParams);
      const buf = await readBody(req);
      if (!isWebp(buf)) throw new Error('الملف المرسل ليس WebP صالحاً');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, filename), buf);
      console.log(`[local-image-server] wrote ${relPath} (${(buf.length / 1024).toFixed(0)}KB)`);
      send(res, 200, { ok: true, path: relPath });
      return;
    }

    if (req.method === 'DELETE' && url.pathname === '/api/delete-image') {
      const { dir, filename, relPath } = resolveTarget(url.searchParams);
      await fs.rm(path.join(dir, filename), { force: true });
      console.log(`[local-image-server] deleted ${relPath}`);
      send(res, 200, { ok: true });
      return;
    }

    send(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    send(res, 400, { ok: false, error: err.message || String(err) });
  }
});

server.on('error', async err => {
  if (err.code !== 'EADDRINUSE') throw err;

  /* Something is already bound to 8787 — find out if it's just this
     same server left running from an earlier terminal (totally fine,
     nothing to do) or an unrelated process (needs the user's attention).
     Never auto-pick a different port and never kill anything. */
  try {
    const res = await fetch(`http://${HOST}:${PORT}/api/ping`);
    const data = res.ok ? await res.json() : null;
    if (data?.ok === true && data.root === ROOT) {
      console.log(`[local-image-server] already running for this project on http://${HOST}:${PORT} — nothing to do.`);
      process.exit(0);
    }
    console.error(`[local-image-server] port ${PORT} is in use by a DIFFERENT server (root: ${data?.root || 'unknown'}).`);
    console.error('[local-image-server] stop that process before starting this one — refusing to pick a different port.');
  } catch {
    console.error(`[local-image-server] port ${PORT} is in use by a process that isn't answering /api/ping (not this server).`);
    console.error('[local-image-server] find and stop it (e.g. `netstat -ano | findstr :8787` on Windows), then retry.');
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`[local-image-server] LOCAL DEV ONLY — listening on http://${HOST}:${PORT}`);
  console.log(`[local-image-server] project root: ${ROOT}`);
  console.log('[local-image-server] accepting requests only from:', [...ALLOWED_ORIGINS].join(', '));
  console.log('[local-image-server] press Ctrl+C to stop.');
});
