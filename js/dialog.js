/* ==========================================================
   dialog.js — Derradj Shop shared custom dialog system
   Replaces native alert()/confirm()/prompt() everywhere with one
   consistent, site-themed modal. Reads each page's own --primary/
   --radius/--font/--text/--border custom properties (with sensible
   fallbacks), so it automatically matches whichever page loads it
   (admin's blue, the checkout page's navy, etc.) without per-page
   theming.

   API — all methods return Promises:
     DZDialog.alert(message, { title, type } = {})
       -> Promise<void>                      resolves when dismissed
     DZDialog.confirm(message, { title, type, confirmText, cancelText, danger } = {})
       -> Promise<boolean>                    true = confirmed, false = cancelled
     DZDialog.prompt(message, { title, defaultValue, placeholder } = {})
       -> Promise<string|null>                null = cancelled

   type: 'info' | 'success' | 'error' | 'warning' | 'question'
   ========================================================== */
(function () {
  'use strict';
  if (window.DZDialog) return;

  const ICONS = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️', question: '❓' };
  const ACCENT_VARS = {
    info:     '--primary, #1d4ed8',
    success:  '--green, #059669',
    error:    '--red, #dc2626',
    warning:  '--amber, #f59e0b',
    question: '--primary, #1d4ed8',
  };
  const ACCENT_BG_VARS = {
    info:     '--primary-bg, #eff6ff',
    success:  '--green-light, #d1fae5',
    error:    '--red-light, #fee2e2',
    warning:  '--amber-light, #fef3c7',
    question: '--primary-bg, #eff6ff',
  };

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const tag = document.createElement('style');
    tag.id = 'dz-dialog-styles';
    tag.textContent = `
      .dz-dialog-overlay {
        position: fixed; inset: 0; z-index: 999999;
        background: rgba(15,23,42,.55);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
        opacity: 0; transition: opacity .18s ease;
      }
      .dz-dialog-overlay.dz-open { opacity: 1; }
      .dz-dialog-box {
        background: var(--white, #fff);
        color: var(--text, #1e293b);
        font-family: var(--font, 'Cairo', sans-serif);
        border-radius: var(--radius-lg, 16px);
        box-shadow: 0 20px 50px rgba(0,0,0,.28);
        max-width: 420px; width: 100%; max-height: 85vh; overflow-y: auto;
        padding: 26px 24px 22px;
        text-align: center;
        transform: translateY(10px) scale(.97);
        transition: transform .18s ease;
      }
      .dz-dialog-overlay.dz-open .dz-dialog-box { transform: translateY(0) scale(1); }
      .dz-dialog-icon {
        width: 52px; height: 52px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 24px; margin: 0 auto 14px;
      }
      .dz-dialog-title { font-size: 17px; font-weight: 900; margin-bottom: 8px; }
      .dz-dialog-msg {
        font-size: 14px; line-height: 1.7;
        color: var(--text-light, #475569);
        white-space: normal;
      }
      .dz-dialog-input {
        width: 100%; margin-top: 14px; padding: 11px 14px;
        border: 1.5px solid var(--border, #e2e8f0); border-radius: var(--radius, 10px);
        font-family: inherit; font-size: 14px; color: var(--text, #1e293b);
        box-sizing: border-box;
      }
      .dz-dialog-input:focus { outline: none; border-color: var(--primary, #1d4ed8); }
      .dz-dialog-actions { display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap; }
      .dz-btn {
        flex: 1; min-width: 100px; padding: 12px 16px; min-height: 44px;
        border-radius: var(--radius, 10px); border: none;
        font-family: inherit; font-size: 14px; font-weight: 800;
        cursor: pointer; transition: filter .15s, background .15s;
      }
      .dz-btn-primary { background: var(--primary, #1d4ed8); color: #fff; }
      .dz-btn-primary:hover { filter: brightness(1.1); }
      .dz-btn-danger { background: var(--red, #dc2626); color: #fff; }
      .dz-btn-danger:hover { filter: brightness(1.1); }
      .dz-btn-secondary { background: var(--bg, #f1f5f9); color: var(--text, #1e293b); border: 1.5px solid var(--border, #e2e8f0); }
      .dz-btn-secondary:hover { background: var(--border, #e2e8f0); }
      @media (max-width: 480px) {
        .dz-dialog-box { padding: 22px 16px 18px; border-radius: 14px; }
        .dz-dialog-actions { flex-direction: column-reverse; }
        .dz-btn { width: 100%; }
      }
    `;
    document.head.appendChild(tag);
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildBase(type, title, message) {
    injectStyles();
    const accentVar   = ACCENT_VARS[type] || ACCENT_VARS.info;
    const accentBgVar = ACCENT_BG_VARS[type] || ACCENT_BG_VARS.info;
    const icon = ICONS[type] || ICONS.info;
    const overlay = document.createElement('div');
    overlay.className = 'dz-dialog-overlay';
    overlay.innerHTML = `
      <div class="dz-dialog-box" role="alertdialog" aria-modal="true" tabindex="-1" dir="rtl">
        <div class="dz-dialog-icon" style="background:var(${accentBgVar});color:var(${accentVar});">${icon}</div>
        ${title ? `<div class="dz-dialog-title">${esc(title)}</div>` : ''}
        <div class="dz-dialog-msg">${esc(message)}</div>
        <div class="dz-dialog-actions"></div>
      </div>`;
    return overlay;
  }

  function open(overlay) {
    document.body.appendChild(overlay);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlay.dataset.prevOverflow = prevOverflow;
    requestAnimationFrame(() => overlay.classList.add('dz-open'));
  }

  function close(overlay) {
    overlay.classList.remove('dz-open');
    document.body.style.overflow = overlay.dataset.prevOverflow || '';
    setTimeout(() => overlay.remove(), 180);
  }

  function makeBtn(label, variant) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dz-btn ' + (variant || '');
    b.textContent = label;
    return b;
  }

  window.DZDialog = {
    alert(message, opts = {}) {
      const { title = '', type = 'info' } = opts;
      return new Promise(resolve => {
        const overlay = buildBase(type, title, message);
        const box = overlay.querySelector('.dz-dialog-box');
        const actions = overlay.querySelector('.dz-dialog-actions');
        const okBtn = makeBtn('حسناً', 'dz-btn-primary');
        actions.appendChild(okBtn);

        let done = false;
        const finish = () => { if (done) return; done = true; close(overlay); resolve(); };
        okBtn.addEventListener('click', finish);
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) finish(); });
        box.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); finish(); }
        });
        open(overlay);
        okBtn.focus();
      });
    },

    confirm(message, opts = {}) {
      const { title = '', type = 'warning', confirmText = 'تأكيد', cancelText = 'إلغاء', danger = false } = opts;
      return new Promise(resolve => {
        const overlay = buildBase(type, title, message);
        const box = overlay.querySelector('.dz-dialog-box');
        const actions = overlay.querySelector('.dz-dialog-actions');
        const confirmBtn = makeBtn(confirmText, danger ? 'dz-btn-danger' : 'dz-btn-primary');
        const cancelBtn  = makeBtn(cancelText, 'dz-btn-secondary');
        actions.appendChild(confirmBtn);
        actions.appendChild(cancelBtn);

        let done = false;
        const finish = (val) => { if (done) return; done = true; close(overlay); resolve(val); };
        confirmBtn.addEventListener('click', () => finish(true));
        cancelBtn.addEventListener('click', () => finish(false));
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) finish(false); });
        box.addEventListener('keydown', e => {
          if (e.key === 'Escape') finish(false);
          if (e.key === 'Enter') finish(true);
        });
        open(overlay);
        confirmBtn.focus();
      });
    },

    prompt(message, opts = {}) {
      const { title = '', defaultValue = '', placeholder = '' } = opts;
      return new Promise(resolve => {
        const overlay = buildBase('question', title, message);
        const box = overlay.querySelector('.dz-dialog-box');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'dz-dialog-input';
        input.value = defaultValue == null ? '' : defaultValue;
        input.placeholder = placeholder;
        box.querySelector('.dz-dialog-msg').insertAdjacentElement('afterend', input);

        const actions = overlay.querySelector('.dz-dialog-actions');
        const confirmBtn = makeBtn('تأكيد', 'dz-btn-primary');
        const cancelBtn  = makeBtn('إلغاء', 'dz-btn-secondary');
        actions.appendChild(confirmBtn);
        actions.appendChild(cancelBtn);

        let done = false;
        const finish = (val) => { if (done) return; done = true; close(overlay); resolve(val); };
        confirmBtn.addEventListener('click', () => finish(input.value));
        cancelBtn.addEventListener('click', () => finish(null));
        overlay.addEventListener('mousedown', e => { if (e.target === overlay) finish(null); });
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') finish(input.value);
          if (e.key === 'Escape') finish(null);
        });
        open(overlay);
        setTimeout(() => input.focus(), 50);
      });
    },
  };
})();
