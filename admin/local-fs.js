/* ==========================================================
   local-fs.js — Derradj Shop | Admin local-disk image writer
   Runs before products-manager.js — exposes window.LocalFS so new
   product images are written directly into the local project
   repository, via the local-only Node helper in
   scripts/local-image-server.js (start with `npm run
   local-image-server`), instead of Supabase Storage.

   Talks to http://127.0.0.1:8787 — plain fetch(), works in any
   browser including Brave (the File System Access API approach was
   dropped because Brave hard-disables it with no user-facing
   override: https://github.com/brave/brave-browser/issues/44411).
   No build step, no bundler.
   ========================================================== */
(function () {
  'use strict';

  const HELPER_BASE = 'http://127.0.0.1:8787';
  const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const FILENAME_RE = /^(main|image-\d{1,3})\.webp$/;

  let lastStatus = 'offline';

  /* Kept for API-compatibility with callers — every browser can make
     a plain fetch() call, so this is always true now. */
  function isSupported() {
    return true;
  }

  async function ping() {
    try {
      const res = await fetch(HELPER_BASE + '/api/ping', { method: 'GET' });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      lastStatus = data && data.ok === true ? 'granted' : 'offline';
    } catch {
      lastStatus = 'offline';
    }
    return lastStatus;
  }

  /* No folder picker anymore — the helper's project root is fixed by
     its own configuration (scripts/local-image-server.js), never
     chosen by the browser. "Selecting"/"re-authorizing" both just
     mean "check the helper is reachable". */
  async function restorePermission() { return ping(); }
  async function requestReauth() { return ping(); }
  async function selectFolder() { return ping(); }

  function status() {
    return lastStatus;
  }

  function assertValid(slug, filename) {
    if (!SLUG_RE.test(slug || '')) throw new Error('slug غير صالح: ' + slug);
    if (!FILENAME_RE.test(filename || '')) throw new Error('اسم ملف غير مسموح: ' + filename);
  }

  async function writeProductImage({ category, subcategory, slug, filename, blob }) {
    assertValid(slug, filename);
    const qs = new URLSearchParams({ category, subcategory: subcategory || '', slug, filename });
    let res;
    try {
      res = await fetch(`${HELPER_BASE}/api/write-image?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: blob,
      });
    } catch {
      lastStatus = 'offline';
      throw new Error('تعذّر الاتصال بخادم الصور المحلي — تأكد من تشغيله (npm run local-image-server)');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error('فشل حفظ الصورة محلياً: ' + (data?.error || res.status));
    }
    const data = await res.json();
    return data.path; /* e.g. "books/the-straw-man/main.webp" */
  }

  /* Best-effort — mirrors cleanupOrphanedImages()'s non-fatal style in
     products-manager.js, never throws. */
  async function deleteProductImage({ category, subcategory, slug, filename }) {
    try {
      assertValid(slug, filename);
      const qs = new URLSearchParams({ category, subcategory: subcategory || '', slug, filename });
      const res = await fetch(`${HELPER_BASE}/api/delete-image?${qs}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  window.LocalFS = {
    isSupported,
    selectFolder,
    restorePermission,
    requestReauth,
    status,
    writeProductImage,
    deleteProductImage,
  };
})();
