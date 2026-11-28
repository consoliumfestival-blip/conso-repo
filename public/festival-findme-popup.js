(() => {
  const EXPIRES_AT_MS = Date.parse('2026-11-28T12:50:00Z');
  if (Date.now() >= EXPIRES_AT_MS) return;

  const ALLOWED_PATH = /^\/(consoulium|fest|explore|home|results|scores|standings|live|schedule|schedules|events|media|gallery|photos|posters|news|brochure|festival-(results|standings|schedule|media|news|brochure))(\.html)?$/;
  if (!ALLOWED_PATH.test(location.pathname)) return;

  const STORAGE_KEY = 'conso_findme_live_popup_v1';
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === '1') return;
  } catch {}

  const DEFAULT_TENANT = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
  const LEGACY_TENANT_ALIAS = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';

  function buildFindMeUrl() {
    const src = new URLSearchParams(location.search);
    const out = new URL('/candidate-search', location.origin);
    const tenant = src.get('tenant_id');
    const festival = src.get('festival_id');
    if (tenant && tenant !== DEFAULT_TENANT && tenant !== LEGACY_TENANT_ALIAS) {
      out.searchParams.set('tenant_id', tenant);
    }
    if (festival) out.searchParams.set('festival_id', festival);
    return out.pathname + out.search;
  }

  function isIntroBlocked() {
    if (document.documentElement.classList.contains('is-curtain-covered')) return true;
    const loader = document.getElementById('loader');
    if (loader) {
      const style = getComputedStyle(loader);
      if (style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.05) {
        return true;
      }
    }
    return false;
  }

  let modal = null;
  let isOpen = false;
  let hasPushedHistory = false;
  let ignoreNextPop = false;

  function ensureModal() {
    if (modal) return modal;

    const style = document.createElement('style');
    style.id = 'conso-findme-popup-css';
    style.textContent = `
      .conso-fm-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99000;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgba(8, 12, 28, 0.62);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.24s ease, visibility 0.24s ease;
      }
      .conso-fm-backdrop.is-open {
        opacity: 1;
        visibility: visible;
      }
      .conso-fm-dialog {
        position: relative;
        width: min(100%, 404px);
        padding: 30px 24px 24px;
        border-radius: 26px;
        background: #ffffff;
        color: #151824;
        border: 1.5px solid rgba(15, 23, 42, 0.1);
        box-shadow: 0 28px 70px -16px rgba(5, 8, 22, 0.52);
        text-align: center;
        font-family: "GoogleSansFlex", "Google Sans Flex", "Google Sans", system-ui, -apple-system, sans-serif;
        transform: translateY(14px) scale(0.96);
        transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
      }
      .conso-fm-backdrop.is-open .conso-fm-dialog {
        transform: translateY(0) scale(1);
      }
      .conso-fm-bars {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 5px;
        display: grid;
        grid-template-columns: repeat(5, 1fr);
      }
      .conso-fm-bars i:nth-child(1) { background: #6D28D9; }
      .conso-fm-bars i:nth-child(2) { background: #E11D48; }
      .conso-fm-bars i:nth-child(3) { background: #2563EB; }
      .conso-fm-bars i:nth-child(4) { background: #10B981; }
      .conso-fm-bars i:nth-child(5) { background: #F59E0B; }
      .conso-fm-x {
        position: absolute;
        top: 14px;
        right: 14px;
        width: 32px;
        height: 32px;
        border-radius: 999px;
        border: 1px solid rgba(15, 23, 42, 0.1);
        background: rgba(15, 23, 42, 0.04);
        color: #475569;
        font-size: 18px;
        line-height: 1;
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: background-color 0.2s ease, color 0.2s ease;
      }
      .conso-fm-x:hover {
        background: rgba(15, 23, 42, 0.1);
        color: #0f172a;
      }
      .conso-fm-badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 5px 13px;
        border-radius: 999px;
        background: rgba(16, 185, 129, 0.11);
        border: 1px solid rgba(16, 185, 129, 0.26);
        color: #047857;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        margin-bottom: 12px;
      }
      .conso-fm-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #10B981;
        box-shadow: 0 0 8px rgba(16, 185, 129, 0.72);
      }
      .conso-fm-title {
        margin: 0 0 8px;
        font-size: 24px;
        font-weight: 700;
        letter-spacing: -0.025em;
        line-height: 1.15;
        color: #10142F;
      }
      .conso-fm-desc {
        margin: 0 0 22px;
        font-size: 14.5px;
        line-height: 1.52;
        color: #525866;
      }
      .conso-fm-actions {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      .conso-fm-btn-back {
        appearance: none;
        border: 1px solid rgba(15, 23, 42, 0.14);
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.05);
        color: #334155;
        font: 600 14px/1 "GoogleSansFlex", "Google Sans Flex", "Google Sans", system-ui, sans-serif;
        padding: 13px 20px;
        cursor: pointer;
        transition: background-color 0.2s ease, transform 0.2s ease;
      }
      .conso-fm-btn-back:hover {
        background: rgba(15, 23, 42, 0.1);
        transform: translateY(-1px);
      }
      .conso-fm-btn-go {
        appearance: none;
        border: 0;
        border-radius: 999px;
        background: #10142F;
        color: #ffffff;
        font: 600 14px/1 "GoogleSansFlex", "Google Sans Flex", "Google Sans", system-ui, sans-serif;
        padding: 7px 7px 7px 20px;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        cursor: pointer;
        box-shadow: 0 12px 26px -10px rgba(16, 20, 47, 0.65);
        transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
      }
      .conso-fm-btn-go:hover {
        background: #182047;
        transform: translateY(-1px);
        box-shadow: 0 16px 30px -10px rgba(37, 99, 235, 0.45);
      }
      .conso-fm-arrow {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #6D28D9, #E11D48 25%, #2563EB 50%, #10B981 75%, #F59E0B);
        color: #ffffff;
        font-size: 14px;
        line-height: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        .conso-fm-backdrop,
        .conso-fm-dialog { transition: none; }
      }
    `;
    document.head.appendChild(style);

    modal = document.createElement('div');
    modal.className = 'conso-fm-backdrop';
    modal.id = 'conso-findme-popup';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'conso-fm-heading');
    modal.innerHTML = `
      <div class="conso-fm-dialog">
        <div class="conso-fm-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <button type="button" class="conso-fm-x" data-fm-close aria-label="Close announcement">&times;</button>
        <div class="conso-fm-badge"><span class="conso-fm-dot" aria-hidden="true"></span>Find Me · Now Live</div>
        <h2 class="conso-fm-title" id="conso-fm-heading">Find Me is Available</h2>
        <p class="conso-fm-desc">You can now search candidate profiles, chest numbers, registered items, and live published results directly using Find Me.</p>
        <div class="conso-fm-actions">
          <button type="button" class="conso-fm-btn-back" data-fm-close>Back</button>
          <button type="button" class="conso-fm-btn-go" data-fm-open>
            <span>Open Find Me</span>
            <span class="conso-fm-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest?.('[data-fm-close]')) {
        closePopup(true);
      } else if (e.target.closest?.('[data-fm-open]')) {
        openFindMe();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        closePopup(true);
      }
    });

    window.addEventListener('popstate', () => {
      if (ignoreNextPop) {
        ignoreNextPop = false;
        return;
      }
      if (isOpen) {
        hasPushedHistory = false;
        closePopup(false);
      }
    });

    document.body.appendChild(modal);
    return modal;
  }

  function closePopup(syncHistory) {
    if (!modal || !isOpen) return;
    isOpen = false;
    modal.classList.remove('is-open');
    if (syncHistory && hasPushedHistory && window.history.state && window.history.state.__consoFindMeModal) {
      hasPushedHistory = false;
      ignoreNextPop = true;
      window.history.back();
    } else {
      hasPushedHistory = false;
    }
  }

  function openFindMe() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {}
    if (modal) {
      isOpen = false;
      modal.classList.remove('is-open');
      hasPushedHistory = false;
    }
    const target = buildFindMeUrl();
    if (window.__consoTransition && typeof window.__consoTransition.go === 'function') {
      window.__consoTransition.go(target, 'Find Me');
    } else {
      window.location.assign(target);
    }
  }

  function showPopup() {
    if (Date.now() >= EXPIRES_AT_MS) return;
    if (!ALLOWED_PATH.test(location.pathname)) return;
    const activeDrawer = document.querySelector('.sub-drawer.is-open, .menu.is-open');
    if (activeDrawer) return;
    try {
      if (sessionStorage.getItem(STORAGE_KEY) === '1') return;
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {}

    const el = ensureModal();
    isOpen = true;
    try {
      history.pushState({ ...(history.state || {}), __consoFindMeModal: true }, '', location.href);
      hasPushedHistory = true;
    } catch {}
    requestAnimationFrame(() => {
      el.classList.add('is-open');
      el.querySelector('[data-fm-open]')?.focus({ preventScroll: true });
    });
  }

  let delayScheduled = false;
  const waitStart = Date.now();
  function scheduleAfterLanding() {
    if (delayScheduled || Date.now() >= EXPIRES_AT_MS) return;
    if (isIntroBlocked() && Date.now() - waitStart < 4500) {
      setTimeout(scheduleAfterLanding, 250);
      return;
    }
    delayScheduled = true;
    setTimeout(showPopup, 2400);
  }

  if (document.readyState === 'complete') {
    scheduleAfterLanding();
  } else {
    window.addEventListener('load', scheduleAfterLanding, { once: true });
  }
})();
