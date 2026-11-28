(() => {
  const STORAGE_KEY = 'conso_curtain';
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const UNITS = [
    {
      c: '#6D28D9',
      svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#6D28D9"/><polygon points="50,14 61,39 86,50 61,61 50,86 39,61 14,50 39,39" fill="#fff"/><circle cx="50" cy="50" r="10" fill="#6D28D9"/></svg>',
    },
    {
      c: '#E11D48',
      svg: '<svg viewBox="0 0 100 100"><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48"/><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48" transform="rotate(60 50 50)"/><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48" transform="rotate(120 50 50)"/></svg>',
    },
    {
      c: '#2563EB',
      svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#2563EB"/><path d="M50 20.24C55.36 44.64 55.36 44.64 79.76 50 55.36 55.36 55.36 55.36 50 79.76 44.64 55.36 44.64 55.36 20.24 50 44.64 44.64 44.64 44.64 50 20.24Z" fill="#fff"/></svg>',
    },
    {
      c: '#10B981',
      svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="41.76" fill="#fff" stroke="#10B981" stroke-width="12.48"/><path d="M2 50A48 48 0 0 0 98 50Z" fill="#10B981"/></svg>',
    },
    {
      c: '#F59E0B',
      svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#F59E0B"/><circle cx="50" cy="18" r="14" fill="#F59E0B"/><circle cx="82" cy="50" r="14" fill="#F59E0B"/><circle cx="50" cy="82" r="14" fill="#F59E0B"/><circle cx="18" cy="50" r="14" fill="#F59E0B"/><circle cx="72.6" cy="27.4" r="14" fill="#F59E0B"/><circle cx="72.6" cy="72.6" r="14" fill="#F59E0B"/><circle cx="27.4" cy="72.6" r="14" fill="#F59E0B"/><circle cx="27.4" cy="27.4" r="14" fill="#F59E0B"/><circle cx="50" cy="50" r="14" fill="#fff"/></svg>',
    },
  ];

  // Check synchronously in <head> before paint if arriving via an internal curtain sweep
  let pendingEnter = null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      sessionStorage.removeItem(STORAGE_KEY);
      const parsed = JSON.parse(raw);
      if (parsed && Date.now() - Number(parsed.ts || 0) < 5500) {
        pendingEnter = parsed;
      }
    }
  } catch {}

  const style = document.createElement('style');
  style.textContent = `
    @font-face {
      font-family: "GoogleSansFlex";
      src: url("/assets/google-sans-flex-latin-wdth-normal-B_nyAeTb.woff2") format("woff2");
      font-weight: 100 1000;
      font-stretch: 75% 151%;
      font-display: swap;
    }
    .conso-curtain {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: grid;
      grid-template-rows: repeat(5, 1fr);
      overflow: hidden;
      pointer-events: none;
      visibility: hidden;
      background: transparent;
    }
    .conso-curtain.is-active,
    html.is-curtain-covered .conso-curtain {
      visibility: visible;
      pointer-events: auto;
    }
    .conso-curtain__band {
      position: relative;
      width: 200vw;
      will-change: transform;
      transform: translate3d(-200vw, 0, 0);
    }
    .conso-curtain__band::before {
      content: "";
      position: absolute;
      inset: 0 12vh 0 0;
      background: linear-gradient(90deg, transparent 0, var(--c) 22%, var(--c) 100%);
    }
    .conso-curtain__head {
      position: absolute;
      top: 50%;
      right: 0;
      width: 20vh;
      max-width: 22vw;
      height: 20vh;
      max-height: 22vw;
      transform: translate(-2%, -50%);
      border-radius: 50%;
      background: #fff;
      display: grid;
      place-items: center;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
    }
    .conso-curtain__head svg {
      width: 84%;
      height: 84%;
      display: block;
    }
    .conso-curtain__clip {
      position: absolute;
      inset: 0 12vh 0 0;
      overflow: hidden;
    }
    .conso-curtain__word {
      position: absolute;
      left: 70vw;
      top: calc(var(--i) * -100%);
      width: 100vw;
      height: 500%;
      display: grid;
      place-items: center;
      pointer-events: none;
    }
    .conso-curtain__word b {
      font-family: "GoogleSansFlex", "Google Sans", system-ui, sans-serif;
      font-size: clamp(2.6rem, 11vw, 9.5rem);
      font-weight: 700;
      letter-spacing: -0.055em;
      line-height: 0.94;
      color: color-mix(in oklab, var(--c), #0b0f1c 54%);
      text-align: center;
    }
    html.is-curtain-covered .conso-curtain__band {
      transform: translate3d(-70vw, 0, 0);
    }
    html.is-curtain-covered .conso-curtain__word {
      transform: translate3d(0, 0, 0);
    }
  `;
  document.head.append(style);

  let rootEl = null;
  let bands = [];
  let words = [];
  let navigating = false;

  function ensureDOM(parent) {
    if (rootEl && rootEl.isConnected) return rootEl;
    rootEl = document.createElement('div');
    rootEl.className = 'conso-curtain';
    rootEl.setAttribute('aria-hidden', 'true');
    rootEl.innerHTML = UNITS.map((u, idx) => `
      <div class="conso-curtain__band" style="--c:${u.c};--i:${idx}">
        <span class="conso-curtain__clip">
          <span class="conso-curtain__word"><b></b></span>
        </span>
        <span class="conso-curtain__head">${u.svg}</span>
      </div>
    `).join('');
    bands = [...rootEl.querySelectorAll('.conso-curtain__band')];
    words = [...rootEl.querySelectorAll('.conso-curtain__word')];
    (parent || document.body || document.documentElement).append(rootEl);
    return rootEl;
  }

  function setWord(wordText) {
    const clean = String(wordText || '').trim();
    words.forEach((w) => {
      const b = w.querySelector('b');
      if (b) b.textContent = clean;
    });
  }

  let loaderGuard = null;
  if (pendingEnter) {
    document.documentElement.classList.add('is-curtain-covered', 'no-loader');
    // Mount curtain synchronously in <head> onto <html> so frame 0 is already 100% covered (no initial blink!)
    ensureDOM(document.documentElement);
    setWord(pendingEnter.word || '');
    rootEl.classList.add('is-active');
    loaderGuard = new MutationObserver(() => {
      const loaderEl = document.getElementById('loader');
      if (loaderEl) {
        loaderEl.remove();
        loaderGuard.disconnect();
      }
    });
    loaderGuard.observe(document.documentElement, { childList: true, subtree: true });
  }

  function uncoverOnReady() {
    if (!pendingEnter) return;
    const enterWord = pendingEnter.word || '';
    pendingEnter = null;

    const run = () => {
      loaderGuard?.disconnect();
      const loaderEl = document.getElementById('loader');
      if (loaderEl && document.documentElement.classList.contains('no-loader')) {
        loaderEl.remove();
      }
      ensureDOM(document.documentElement);
      setWord(enterWord);
      rootEl.classList.add('is-active');
      bands.forEach((b) => { b.style.transform = 'translate3d(-70vw, 0, 0)'; });

      if (REDUCED || !bands[0].animate) {
        document.documentElement.classList.remove('is-curtain-covered');
        rootEl.classList.remove('is-active');
        return;
      }

      const fontWait = document.fonts?.ready
        ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 90))])
        : Promise.resolve();

      const heroWait = location.pathname.includes('explore') && !document.querySelector('.ayatic-3d-scene')
        ? new Promise((resolve) => {
            let settled = false;
            let obs = null;
            const finish = () => {
              if (settled) return;
              settled = true;
              obs?.disconnect();
              resolve();
            };
            obs = new MutationObserver(() => {
              if (document.querySelector('.ayatic-3d-scene')) finish();
            });
            obs.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(finish, 350);
          })
        : location.pathname.startsWith('/candidate') && !document.querySelector('[data-public-portal-ready="1"]')
          ? new Promise((resolve) => {
              let settled = false;
              let obs = null;
              const finish = () => {
                if (settled) return;
                settled = true;
                obs?.disconnect();
                resolve();
              };
              obs = new MutationObserver(() => {
                if (document.querySelector('[data-public-portal-ready="1"]')) finish();
              });
              obs.observe(document.documentElement, { childList: true, subtree: true });
              setTimeout(finish, 1800);
            })
          : Promise.resolve();

      Promise.all([fontWait, heroWait]).then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            document.documentElement.classList.remove('is-curtain-covered');
            const anims = bands.map((b, i) => b.animate(
              [
                { transform: 'translate3d(-70vw, 0, 0)' },
                { transform: 'translate3d(110vw, 0, 0)' },
              ],
              {
                duration: 740,
                delay: 20 + i * 50,
                easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
                fill: 'both',
              },
            ));
            Promise.all(anims.map((a) => a.finished)).then(() => {
              rootEl.classList.remove('is-active');
              bands.forEach((b) => {
                b.getAnimations().forEach((a) => a.cancel());
                b.style.transform = '';
              });
            }).catch(() => {
              rootEl.classList.remove('is-active');
            });
          });
        });
      });
    };

    if (document.readyState !== 'loading') run();
    else document.addEventListener('DOMContentLoaded', run, { once: true });
  }

  uncoverOnReady();

  function inferLabel(url, explicitLabel) {
    if (explicitLabel) return explicitLabel;
    const path = new URL(url, location.origin).pathname.toLowerCase();
    if (path.includes('results')) return 'Results';
    if (path.includes('standings')) return 'Standings';
    if (path.includes('schedule')) return 'Schedule';
    if (path.includes('gallery') || path.includes('media')) return 'Media';
    if (path.includes('candidate')) return 'Find Me';
    if (path.includes('news')) return 'News';
    if (path.includes('brochure')) return 'Brochure';
    if (path.includes('explore')) return 'Home';
    return 'Consoulium';
  }

  function go(url, explicitLabel) {
    if (navigating) return;
    try {
      const dest = new URL(url, location.origin);
      if (dest.origin === location.origin && dest.pathname === location.pathname && dest.search === location.search) {
        if (dest.hash) {
          const hashTarget = document.getElementById(dest.hash.slice(1));
          if (hashTarget) {
            hashTarget.scrollIntoView({ behavior: REDUCED ? 'instant' : 'smooth' });
          }
        }
        return;
      }
    } catch {}
    navigating = true;
    const label = inferLabel(url, explicitLabel);

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), word: label }));
    } catch {}

    if (REDUCED || !document.body || !Element.prototype.animate) {
      location.assign(url);
      return;
    }

    ensureDOM();
    setWord(label);
    rootEl.classList.add('is-active');
    rootEl.style.pointerEvents = 'auto';

    const wordAnims = words.map((w, i) => w.animate(
      [
        { transform: 'translate3d(130vw, 0, 0)' },
        { transform: 'translate3d(0, 0, 0)' },
      ],
      {
        duration: 580,
        delay: i * 48,
        easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
        fill: 'both',
      },
    ));

    const bandAnims = bands.map((b, i) => b.animate(
      [
        { transform: 'translate3d(-200vw, 0, 0)' },
        { transform: 'translate3d(-70vw, 0, 0)' },
      ],
      {
        duration: 580,
        delay: i * 48,
        easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)',
        fill: 'both',
      },
    ));

    Promise.all([...bandAnims, ...wordAnims].map((a) => a.finished))
      .finally(() => location.assign(url));
  }

  // Handle browser bfcache restore cleanly so curtain never stays stuck
  window.addEventListener('pageshow', (e) => {
    navigating = false;
    if (e.persisted && rootEl) {
      rootEl.classList.remove('is-active');
      bands.forEach((b) => b.getAnimations().forEach((a) => a.cancel()));
    }
  });

  window.__consoTransition = { go };

  const POPUP_EXPIRES_AT_MS = Date.parse('2026-11-28T12:50:00Z');
  const POPUP_PATH_RE = /^\/(consoulium|fest|explore|home|results|scores|standings|live|schedule|events|media|gallery|photos|posters|news|brochure|festival-(results|standings|schedule|media|news|brochure))(\.html)?$/;
  if (Date.now() < POPUP_EXPIRES_AT_MS && POPUP_PATH_RE.test(location.pathname)) {
    const injectPopup = () => {
      if (document.getElementById('conso-findme-popup-loader')) return;
      const s = document.createElement('script');
      s.id = 'conso-findme-popup-loader';
      s.src = '/festival-findme-popup.js?v=20261128i';
      s.defer = true;
      document.head.appendChild(s);
    };
    if (document.head) injectPopup();
    else document.addEventListener('DOMContentLoaded', injectPopup, { once: true });
  }
})();
