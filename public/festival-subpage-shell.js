(() => {
  const page = document.body.dataset.page || '';
  const searchParams = new URLSearchParams(location.search);
  const DEFAULT_TENANT = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
  const LEGACY_TENANT_ALIAS = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';
  const CAMPUS_TENANT = '73ee92f3-d795-43eb-997e-380e52856424';
  const rawTenant = searchParams.get('tenant_id');
  const isDefaultTenant = !rawTenant || rawTenant === DEFAULT_TENANT || rawTenant === LEGACY_TENANT_ALIAS;
  const customTenant = isDefaultTenant ? null : rawTenant;
  const isCampus = customTenant === CAMPUS_TENANT;
  const homePath = isCampus ? '/campus' : '/explore';
  const festivalId = searchParams.get('festival_id');

  if (rawTenant && isDefaultTenant) {
    searchParams.delete('tenant_id');
    const cleanedSearch = searchParams.toString();
    history.replaceState(history.state, '', location.pathname + (cleanedSearch ? '?' + cleanedSearch : '') + location.hash);
  }

  function withTenant(path) {
    if (!path.startsWith('/')) return path;
    const url = new URL(path, location.origin);
    if (customTenant && path !== '/campus') url.searchParams.set('tenant_id', customTenant);
    if (festivalId) url.searchParams.set('festival_id', festivalId);
    return url.pathname + url.search + url.hash;
  }

  const NAV_ITEMS = [
    { id: 'home', label: 'Home', to: homePath, c: '#6D28D9' },
    { id: 'results', label: 'Results', to: '/results', c: '#E11D48' },
    { id: 'standings', label: 'Standings', to: '/standings', c: '#10B981' },
    { id: 'schedule', label: 'Schedule', to: '/schedule', c: '#F59E0B' },
    { id: 'media', label: 'Media', to: '/media', c: '#6D28D9' },
    { id: 'find-me', label: 'Find Me', to: '/candidate-search', c: '#2563EB', menuOnly: true },
  ].filter((item) => !isCampus || ['home', 'results', 'standings', 'find-me'].includes(item.id));

  const GLYPH_LIST = [
    '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#6D28D9"/><polygon points="50,14 61,39 86,50 61,61 50,86 39,61 14,50 39,39" fill="#fff"/><circle cx="50" cy="50" r="10" fill="#6D28D9"/></svg>',
    '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48"/><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48" transform="rotate(60 50 50)"/><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48" transform="rotate(120 50 50)"/></svg>',
    '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#2563EB"/><path d="M50 20.24C55.36 44.64 55.36 44.64 79.76 50 55.36 55.36 55.36 55.36 50 79.76 44.64 55.36 44.64 55.36 20.24 50 44.64 44.64 44.64 44.64 50 20.24Z" fill="#fff"/></svg>',
    '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="41.76" fill="#fff" stroke="#10B981" stroke-width="12.48"/><path d="M2 50A48 48 0 0 0 98 50Z" fill="#10B981"/></svg>',
    '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30" fill="#F59E0B"/><circle cx="50" cy="18" r="14" fill="#F59E0B"/><circle cx="82" cy="50" r="14" fill="#F59E0B"/><circle cx="50" cy="82" r="14" fill="#F59E0B"/><circle cx="18" cy="50" r="14" fill="#F59E0B"/><circle cx="72.6" cy="27.4" r="14" fill="#F59E0B"/><circle cx="72.6" cy="72.6" r="14" fill="#F59E0B"/><circle cx="27.4" cy="72.6" r="14" fill="#F59E0B"/><circle cx="27.4" cy="27.4" r="14" fill="#F59E0B"/><circle cx="50" cy="50" r="14" fill="#fff"/></svg>',
  ];
  const GLYPHS_SVG = GLYPH_LIST.join('');

  // Inject Deep Sapphire / Codex atmospheric background layer
  const atmosphere = document.createElement('div');
  atmosphere.className = 'sub-atmosphere';
  atmosphere.setAttribute('aria-hidden', 'true');
  atmosphere.innerHTML = `
    <svg class="sub-atmosphere__svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none">
      <circle cx="720" cy="360" r="340" stroke="rgba(147,197,253,0.08)" stroke-width="1"/>
      <circle cx="720" cy="360" r="220" stroke="rgba(147,197,253,0.09)" stroke-dasharray="6 6" stroke-width="1"/>
      <rect x="520" y="160" width="400" height="400" transform="rotate(45 720 360)" stroke="rgba(109,40,217,0.12)" stroke-width="1"/>
    </svg>
    <div class="sub-atmosphere__horizon"></div>
  `;
  document.body.prepend(atmosphere);

  // Inject Floating Glass Pill Navbar
  const nav = document.createElement('header');
  nav.className = 'sub-nav';
  const linksHtml = NAV_ITEMS.filter((item) => !item.menuOnly).map((item) => {
    const active = item.id === page ? ' aria-current="page"' : '';
    const extraCls = item.extra ? ' sub-nav__link--extra' : '';
    return `<a class="sub-nav__link${extraCls}" href="${withTenant(item.to)}"${active}>${item.label}</a>`;
  }).join('');

  nav.innerHTML = `
    <div class="sub-nav__shell">
      <a class="sub-nav__brand" href="${withTenant(homePath)}" aria-label="${isCampus ? 'Campus' : 'Consoulium 2k26'} home" data-nav-label="Home">
        <img class="sub-nav__logo" src="/brand/consolium-logo-footer.png" alt="" width="28" height="28" decoding="async">
        <span class="sub-nav__brand-text">${isCampus ? 'Campus' : 'Consoulium 2k26'}</span>
      </a>
      <nav class="sub-nav__links" aria-label="Festival navigation">${linksHtml}</nav>
      <a class="sub-nav__cta" href="${withTenant('/candidate-search')}" id="sub-portal-btn" data-nav-label="Find Me">
        <span>Find Me</span>
        <span class="sub-nav__cta-arrow" aria-hidden="true">→</span>
      </a>
    </div>
    <button class="sub-nav__menu-btn" type="button" id="sub-menu-open" aria-expanded="false" aria-controls="sub-drawer" aria-label="Open menu">
      <span class="sub-menu-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
    </button>
  `;
  document.body.append(nav);

  // Mobile Fullscreen Drawer with 5-band sweep animation (matching explore.html)
  const BAND_COLORS = ['#6D28D9', '#E11D48', '#2563EB', '#10B981', '#F59E0B'];
  const drawer = document.createElement('div');
  drawer.className = 'sub-drawer';
  drawer.id = 'sub-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.setAttribute('aria-label', 'Festival navigation menu');

  const bandsHtml = `<div class="sub-drawer__bands" aria-hidden="true">${BAND_COLORS.map((c) => `<i class="sub-drawer__band" style="--c:${c}"></i>`).join('')}</div>`;
  const drawerItems = NAV_ITEMS.map((item, idx) => {
    const isHere = item.id === page;
    const here = isHere ? '<span class="sub-drawer__here" data-menu-fade>Here</span>' : '';
    const glyphSvg = GLYPH_LIST[idx % GLYPH_LIST.length];
    return `
      <li class="sub-drawer__item${isHere ? ' is-here' : ''}" style="--c:${item.c}">
        <a class="sub-drawer__link" href="${withTenant(item.to)}" data-nav-label="${item.label}">
          <span class="sub-drawer__no" data-menu-fade>${String(idx + 1).padStart(2, '0')}</span>
          <span class="sub-drawer__label">
            <span class="sub-drawer__mask">
              <span class="sub-drawer__text">
                ${item.label}
                <span class="sub-drawer__trail" aria-hidden="true"></span>
                <span class="sub-drawer__head" aria-hidden="true">${glyphSvg}</span>
              </span>
            </span>
          </span>
          ${here}
        </a>
      </li>
    `;
  }).join('');

  const quickChipsHtml = [
    ['Results', '/results'],
    ['Standings', '/standings'],
    ['Schedule', '/schedule'],
    ['Media', '/media'],
    ['Find Me', '/candidate-search'],
  ].filter(([label]) => !isCampus || ['Results', 'Standings', 'Find Me'].includes(label))
    .map(([label, path]) => `<a class="sub-drawer__chip" href="${withTenant(path)}" data-nav-label="${label}">${label}</a>`).join('');

  drawer.innerHTML = `
    ${bandsHtml}
    <div class="sub-drawer__sheet">
      <div class="sub-drawer__inner">
        <div class="sub-drawer__pages">
          <div class="sub-drawer__top" data-menu-fade>
            <span class="sub-drawer__eyebrow">${isCampus ? 'Campus' : 'Consoulium 2k26 · Ayatic Codex'}</span>
            <button class="sub-drawer__close" type="button" id="sub-menu-close">Close</button>
          </div>
          <ul class="sub-drawer__list">${drawerItems}</ul>
        </div>
        <aside class="sub-drawer__aside" data-menu-fade>
          <div class="sub-drawer__group">
            <span class="sub-drawer__eyebrow">Quick Sections</span>
            <div class="sub-drawer__chips">${quickChipsHtml}</div>
          </div>
          ${isCampus ? '' : `<div class="sub-drawer__event">
            <span class="sub-drawer__eyebrow">Ayatic Codex · 5th Edition</span>
            <strong class="sub-drawer__date">26 – 29 Nov 2026</strong>
            <span class="sub-drawer__venue">Bukhari Campus, Kondotty</span>
          </div>`}
          <a class="sub-drawer__portal" href="${withTenant('/candidate-search')}" id="sub-drawer-portal" data-nav-label="Find Me">
            <span>Find Me</span>
            <span aria-hidden="true">→</span>
          </a>
        </aside>
      </div>
    </div>
  `;
  document.body.append(drawer);

  const openBtn = nav.querySelector('#sub-menu-open');
  const closeBtn = drawer.querySelector('#sub-menu-close');
  const drawerBands = [...drawer.querySelectorAll('.sub-drawer__band')];
  const drawerSheet = drawer.querySelector('.sub-drawer__sheet');
  const drawerTexts = [...drawer.querySelectorAll('.sub-drawer__text')];
  const drawerFades = [...drawer.querySelectorAll('[data-menu-fade]')];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let drawerSeq = 0;

  function cancelDrawerAnims() {
    [drawerSheet, ...drawerBands, ...drawerTexts, ...drawerFades].forEach((el) => {
      if (el && el.getAnimations) el.getAnimations().forEach((a) => a.cancel());
    });
  }

  function setDrawer(open) {
    const seq = ++drawerSeq;
    cancelDrawerAnims();
    drawer.setAttribute('aria-hidden', String(!open));
    openBtn.setAttribute('aria-expanded', String(open));
    openBtn.classList.toggle('is-open', open);

    if (open) {
      drawer.classList.add('is-open', 'is-animating');
      if (reducedMotion || !drawerSheet.animate) {
        drawerSheet.style.clipPath = 'inset(0% 0% 0% 0%)';
        drawer.classList.remove('is-animating');
        closeBtn.focus();
        return;
      }

      drawerSheet.style.clipPath = 'inset(0% 0% 100% 0%)';
      const inAnims = drawerBands.map((b, i) => b.animate(
        [{ transform: 'translate3d(-101%, 0, 0)' }, { transform: 'translate3d(0, 0, 0)' }],
        { duration: 380, delay: i * 40, easing: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)', fill: 'forwards' },
      ));

      Promise.all(inAnims.map((a) => a.finished)).then(() => {
        if (seq !== drawerSeq) return;
        drawerSheet.style.clipPath = 'inset(0% 0% 0% 0%)';
        const outAnims = drawerBands.map((b, i) => b.animate(
          [{ transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(101%, 0, 0)' }],
          { duration: 480, delay: i * 40, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)', fill: 'forwards' },
        ));
        drawerTexts.forEach((t, i) => t.animate(
          [{ transform: 'translateY(115%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: 700, delay: 30 + i * 38, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
        ));
        drawerFades.forEach((f, i) => f.animate(
          [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: 540, delay: 90 + i * 24, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
        ));
        Promise.all(outAnims.map((a) => a.finished)).then(() => {
          if (seq !== drawerSeq) return;
          drawer.classList.remove('is-animating');
          closeBtn.focus({ preventScroll: true });
        });
      }).catch(() => {});
    } else if (drawer.classList.contains('is-open')) {
      drawer.classList.remove('is-open');
      drawer.classList.add('is-animating');
      if (reducedMotion || !drawerSheet.animate) {
        drawerSheet.style.clipPath = 'inset(0% 0% 100% 0%)';
        drawer.classList.remove('is-animating');
        return;
      }

      drawerTexts.forEach((t, i) => t.animate(
        [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-60%)', opacity: 0 }],
        { duration: 240, delay: i * 16, easing: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)', fill: 'forwards' },
      ));
      drawerFades.forEach((f) => f.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 180, fill: 'forwards' },
      ));
      const wipe = drawerSheet.animate(
        [{ clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 100% 0%)' }],
        { duration: 420, delay: 90, easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)', fill: 'forwards' },
      );
      wipe.finished.then(() => {
        if (seq !== drawerSeq) return;
        cancelDrawerAnims();
        drawerSheet.style.clipPath = 'inset(0% 0% 100% 0%)';
        drawerBands.forEach((b) => { b.style.transform = 'translate3d(-101%, 0, 0)'; });
        drawer.classList.remove('is-animating');
      }).catch(() => {
        drawer.classList.remove('is-animating');
      });
    }
  }

  openBtn?.addEventListener('click', () => setDrawer(!drawer.classList.contains('is-open')));
  closeBtn?.addEventListener('click', () => setDrawer(false));
  drawer.addEventListener('click', (e) => {
    if (e.target === drawer || e.target === drawerSheet) setDrawer(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) setDrawer(false);
  });

  // Trigger 5-band curtain sweep when clicking any subpage navigation link
  document.addEventListener('click', (e) => {
    const link = e.target.closest?.('a[href]');
    if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (link.hasAttribute('download') || link.target === '_blank') return;
    const rawHref = link.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#')) return;
    const url = new URL(link.href, location.origin);
    if (url.origin !== location.origin) return;
    if (url.pathname === '/candidate-search') {
      if (drawer.classList.contains('is-open')) setDrawer(false);
    }
    e.preventDefault();
    if (url.pathname === location.pathname && !url.hash) {
      if (drawer.classList.contains('is-open')) setDrawer(false);
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
      return;
    }
    const label = link.dataset.navLabel || link.querySelector('.sub-drawer__text')?.firstChild?.textContent?.trim() || link.textContent.trim();
    if (window.__consoTransition) {
      window.__consoTransition.go(url.pathname + url.search + url.hash, label);
    } else {
      location.assign(url.pathname + url.search + url.hash);
    }
  });

  // Inject Exact Compact Footer (.footer.footer--compact) inside .sub-page (or body)
  const footer = document.createElement('footer');
  footer.className = 'footer footer--compact';
  const footerLinks = [
    ['Home', homePath, 'home'],
    ['Results', '/results', 'results'],
    ['Standings', '/standings', 'standings'],
    ['Schedule', '/schedule', 'schedule'],
    ['Media', '/media', 'media'],
    ['Find Me', '/candidate-search', 'find-me'],
  ].filter(([, , id]) => !isCampus || ['home', 'results', 'standings', 'find-me'].includes(id)).map(([label, path, id]) => {
    const active = id === page ? ' aria-current="page"' : '';
    return `<a href="${withTenant(path)}"${active}>${label}</a>`;
  }).join('');

  footer.innerHTML = `
    <div class="footer__top-row">
      <div class="footer__brand-slot">
        <span class="footer__logo-box" aria-hidden="true">
          <img src="/brand/consolium-logo-footer.png" alt="" width="36" height="36" loading="lazy" decoding="async">
        </span>
        <div class="footer__brand-meta">
          <strong class="footer__wordmark">${isCampus ? 'Campus' : 'Consoulium 2k26'}</strong>
          <span class="footer__sub">${isCampus ? 'Published festival updates' : 'Ayatic Codex · 26–29 Nov 2026'}</span>
        </div>
      </div>
      <nav class="footer__links footer__links--compact" aria-label="Footer">${footerLinks}</nav>
      <div class="footer__social-slot" aria-label="Social links">
        <a class="footer__social-btn" href="#instagram" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>
        <a class="footer__social-btn" href="#facebook" aria-label="Facebook"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg></a>
        <a class="footer__social-btn" href="#whatsapp" aria-label="WhatsApp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/><path d="M9.5 9.2c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3-.1.5.4.8 1.2 1.6 2 2 .2.1.4 0 .5-.1l.6-.5c.2-.1.4-.2.6-.1l1.6.7c.3.1.4.3.4.5v.5c0 .7-.6 1.2-1.3 1.2-1.9-.1-4.1-1.3-5.6-2.8-1.4-1.4-2.5-3.4-2.6-5.2 0-.6.4-1.1.8-1.5z"/></svg></a>
      </div>
    </div>
  `;

  footer.querySelectorAll('.footer__social-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => e.preventDefault());
  });

  const pageWrap = document.querySelector('.sub-page') || document.body;
  pageWrap.append(footer);
})();
