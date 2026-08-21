/* ==========================================================
   draft-manager.js — Derradj Shop | Admin draft persistence
   Generic browser-side storage for "unfinished form" drafts —
   used by products-manager.js to protect the Add Product form
   from accidental data loss (refresh, accidental navigation,
   browser close). Not product-specific: text/JSON fields go to
   localStorage, binary image blobs go to IndexedDB (localStorage
   can only hold strings), keyed by a caller-supplied draftId so
   unrelated drafts never collide.
   ========================================================== */
(function () {
  'use strict';

  const FIELDS_PREFIX = 'derradj_admin_draft_v1:';
  const SETTINGS_KEY = 'derradj_admin_settings_v1';
  const DB_NAME = 'derradj_admin_drafts';
  const DB_VERSION = 1;
  const STORE = 'blobs';
  const DEFAULT_DEBOUNCE_MS = 700;

  /* ── Settings (protection ON/OFF) — a single small JSON blob so
     future admin-panel preferences can live alongside it instead of
     spawning a new top-level localStorage key each time. ── */
  function readSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function writeSettings(obj) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj)); } catch { /* storage full/blocked — non-fatal */ }
  }
  function isEnabled() {
    const s = readSettings();
    /* ON by default — absent key (fresh install) or anything but an
       explicit `false` means protection is active. */
    return s.protectAddProductDraft !== false;
  }
  function setEnabled(on) {
    const s = readSettings();
    s.protectAddProductDraft = !!on;
    writeSettings(s);
  }

  /* ── Text/JSON field draft (localStorage) ──────────────────── */
  function hasDraft(draftId) {
    try { return localStorage.getItem(FIELDS_PREFIX + draftId) !== null; } catch { return false; }
  }
  function loadDraft(draftId) {
    try {
      const raw = localStorage.getItem(FIELDS_PREFIX + draftId);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function writeDraftNow(draftId, fields, scrollTop) {
    try {
      localStorage.setItem(FIELDS_PREFIX + draftId, JSON.stringify({
        fields, scrollTop: scrollTop || 0, savedAt: new Date().toISOString(),
      }));
      return true;
    } catch (err) {
      console.warn('[DraftManager] failed to save draft (storage full/blocked?):', err.message || err);
      return false;
    }
  }

  const debounceTimers = new Map(); /* draftId -> timer handle */
  function saveDraft(draftId, fields, scrollTop, delayMs) {
    clearTimeout(debounceTimers.get(draftId));
    const t = setTimeout(() => {
      debounceTimers.delete(draftId);
      writeDraftNow(draftId, fields, scrollTop);
    }, delayMs == null ? DEFAULT_DEBOUNCE_MS : delayMs);
    debounceTimers.set(draftId, t);
  }
  function saveDraftNow(draftId, fields, scrollTop) {
    clearTimeout(debounceTimers.get(draftId));
    debounceTimers.delete(draftId);
    return writeDraftNow(draftId, fields, scrollTop);
  }
  function clearDraftFields(draftId) {
    clearTimeout(debounceTimers.get(draftId));
    debounceTimers.delete(draftId);
    try { localStorage.removeItem(FIELDS_PREFIX + draftId); } catch { /* non-fatal */ }
  }

  /* ── Image blobs (IndexedDB) ────────────────────────────────
     Staged-but-not-yet-uploaded product images are held in memory as
     Blobs (see PM_STAGED_MAIN/PM_GALLERY_ITEMS in products-manager.js)
     — localStorage can't store binary data, so a refresh would
     otherwise silently drop any picked-but-unsaved photo. IndexedDB
     stores Blobs natively. Every method degrades to a no-op/empty
     result (never throws) if IndexedDB is unavailable — e.g. private
     browsing in some browsers — so a blob-storage failure can never
     break the surrounding save flow, only skip image draft recovery. */
  let dbPromise = null;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) { resolve(null); return; }
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: 'id' });
            store.createIndex('by_draftId', 'draftId', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { console.warn('[DraftManager] IndexedDB unavailable:', req.error); resolve(null); };
      } catch (err) {
        console.warn('[DraftManager] IndexedDB open failed:', err.message || err);
        resolve(null);
      }
    });
    return dbPromise;
  }

  async function saveBlob(draftId, slot, blob) {
    const db = await openDb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ id: draftId + '::' + slot, draftId, slot, blob });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => { console.warn('[DraftManager] saveBlob failed:', tx.error); resolve(false); };
      } catch (err) {
        console.warn('[DraftManager] saveBlob failed:', err.message || err);
        resolve(false);
      }
    });
  }

  /* Returns a Map<slot, Blob> for every blob stored under draftId. */
  async function loadBlobs(draftId) {
    const result = new Map();
    const db = await openDb();
    if (!db) return result;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly');
        const idx = tx.objectStore(STORE).index('by_draftId');
        const req = idx.openCursor(IDBKeyRange.only(draftId));
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            result.set(cursor.value.slot, cursor.value.blob);
            cursor.continue();
          } else {
            resolve(result);
          }
        };
        req.onerror = () => { console.warn('[DraftManager] loadBlobs failed:', req.error); resolve(result); };
      } catch (err) {
        console.warn('[DraftManager] loadBlobs failed:', err.message || err);
        resolve(result);
      }
    });
  }

  async function clearBlobs(draftId) {
    const db = await openDb();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        const idx = tx.objectStore(STORE).index('by_draftId');
        const req = idx.openCursor(IDBKeyRange.only(draftId));
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
          else resolve(true);
        };
        req.onerror = () => { console.warn('[DraftManager] clearBlobs failed:', req.error); resolve(false); };
      } catch (err) {
        console.warn('[DraftManager] clearBlobs failed:', err.message || err);
        resolve(false);
      }
    });
  }

  /* ── Combined convenience: wipe both the field draft and its images ── */
  async function clearDraft(draftId) {
    clearDraftFields(draftId);
    await clearBlobs(draftId);
  }

  window.DraftManager = {
    isEnabled, setEnabled,
    hasDraft, loadDraft, saveDraft, saveDraftNow, clearDraftFields,
    saveBlob, loadBlobs, clearBlobs,
    clearDraft,
  };
})();
