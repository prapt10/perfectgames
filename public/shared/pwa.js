'use strict';
/* ============================================================
 * Perfect Games — PWA bootstrap (shared by every page)
 * - Registers the service worker (enables "Install app")
 * - Captures the native install prompt and exposes it so any
 *   page can show its own "Install App" button
 * - Fires window events other scripts can listen for:
 *     'pg:install-available'  -> an install button may be shown
 *     'pg:installed'          -> app was installed
 * ============================================================ */

(function () {
  // Service worker requires http(s) — skip quietly on file:// previews etc.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  window.PGInstall = window.PGInstall || {
    deferred: null,
    isStandalone: function () {
      return window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;
    },
    isIOS: function () {
      return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    },
    prompt: async function () {
      if (!this.deferred) return 'unavailable';
      this.deferred.prompt();
      const choice = await this.deferred.userChoice;
      this.deferred = null;
      return choice.outcome; // 'accepted' | 'dismissed'
    },
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.PGInstall.deferred = e;
    window.dispatchEvent(new CustomEvent('pg:install-available'));
  });

  window.addEventListener('appinstalled', () => {
    window.PGInstall.deferred = null;
    window.dispatchEvent(new CustomEvent('pg:installed'));
  });

  // Auto-wire a header install button if the page has one (#btnInstall),
  // so every game page gets "Install app" without extra per-page JS.
  function wireHeaderButton() {
    const btn = document.getElementById('btnInstall');
    if (!btn) return;
    const PG = window.PGInstall;
    function refresh() {
      if (PG.isStandalone()) { btn.classList.add('hidden'); return; }
      if (PG.isIOS() || PG.deferred) btn.classList.remove('hidden');
      else btn.classList.add('hidden');
    }
    window.addEventListener('pg:install-available', refresh);
    window.addEventListener('pg:installed', refresh);
    refresh();
    btn.addEventListener('click', async () => {
      if (PG.isIOS()) {
        if (typeof window.toast === 'function') window.toast('On iPhone/iPad: tap Share ⬆️ then "Add to Home Screen"');
        else alert('On iPhone/iPad: tap Share, then "Add to Home Screen".');
        return;
      }
      const outcome = await PG.prompt();
      if (outcome === 'unavailable' && typeof window.toast === 'function') {
        window.toast('Install option not ready yet — try again shortly.');
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireHeaderButton);
  } else {
    wireHeaderButton();
  }
})();
