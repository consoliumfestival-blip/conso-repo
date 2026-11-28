(() => {
  const routes = new Map([
    ['/', '/explore'],
    ['#journey', '/results'],
    ['/#journey', '/results'],
    ['#race', '/standings'],
    ['/#race', '/standings'],
    ['#thought', '/schedules'],
    ['/#thought', '/schedules'],
    ['#register', '/brochure'],
    ['/#register', '/brochure'],
    ['/results', '/results'],
    ['/standings', '/standings'],
    ['/schedule', '/schedules'],
    ['/schedules', '/schedules'],
    ['/gallery', '/media'],
    ['/news', '/news'],
    ['/media', '/media'],
    ['/brochure', '/brochure'],
    ['/contributors', '/media'],
    ['/speakers', '/news'],
    ['/team', '/media'],
    ['/partners', '/brochure'],
    ['/festival-results.html', '/results'],
    ['/festival-standings.html', '/standings'],
    ['/festival-schedule.html', '/schedules'],
    ['/festival-gallery.html', '/media'],
    ['/festival-news.html', '/news'],
    ['/festival-media.html', '/media'],
    ['/festival-brochure.html', '/brochure'],
  ]);
  const cleanPages = new Set(['/explore', '/consoulium', '/campus', '/results', '/standings', '/schedules', '/news', '/media', '/brochure']);
  const hiddenTargets = new Set(['/news', '/brochure', '/speakers', '/partners', '#register', '/#register', '/festival-news.html', '/festival-brochure.html']);
  const DEFAULT_TENANT = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
  const LEGACY_TENANT_ALIAS = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';

  const searchParams = new URLSearchParams(location.search);
  const requestedTenant = searchParams.get('tenant_id');
  const isDefaultTenant = !requestedTenant || requestedTenant === DEFAULT_TENANT || requestedTenant === LEGACY_TENANT_ALIAS;
  const customTenant = isDefaultTenant ? null : requestedTenant;
  const festivalId = searchParams.get('festival_id');

  if (requestedTenant && isDefaultTenant) {
    searchParams.delete('tenant_id');
    const cleanedSearch = searchParams.toString();
    history.replaceState(history.state, '', location.pathname + (cleanedSearch ? '?' + cleanedSearch : '') + location.hash);
  }

  let comingSoonModal = null;
  function openComingSoonModal() {
    if (!comingSoonModal) {
      const style = document.createElement('style');
      style.textContent = `
        .conso-coming-soon-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100020;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(15, 20, 36, 0.56);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.22s ease, visibility 0.22s ease;
        }
        .conso-coming-soon-backdrop.is-open {
          opacity: 1;
          visibility: visible;
        }
        .conso-coming-soon-dialog {
          position: relative;
          width: min(100%, 380px);
          padding: 28px 24px 24px;
          border-radius: 24px;
          background: #ffffff;
          color: #151824;
          border: 1.5px solid rgba(32, 33, 36, 0.12);
          box-shadow: 0 24px 60px -16px rgba(15, 20, 36, 0.38);
          text-align: center;
          font-family: "Google Sans Flex", "Google Sans", system-ui, -apple-system, sans-serif;
          transform: translateY(10px) scale(0.97);
          transition: transform 0.24s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .conso-coming-soon-backdrop.is-open .conso-coming-soon-dialog {
          transform: translateY(0) scale(1);
        }
        .conso-coming-soon-bars {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 5px;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
        }
        .conso-coming-soon-bars i:nth-child(1) { background: #6D28D9; }
        .conso-coming-soon-bars i:nth-child(2) { background: #E11D48; }
        .conso-coming-soon-bars i:nth-child(3) { background: #2563EB; }
        .conso-coming-soon-bars i:nth-child(4) { background: #10B981; }
        .conso-coming-soon-bars i:nth-child(5) { background: #F59E0B; }
        .conso-coming-soon-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.1);
          color: #2563EB;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .conso-coming-soon-title {
          margin: 0 0 8px;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #10142F;
        }
        .conso-coming-soon-desc {
          margin: 0 0 20px;
          font-size: 14.5px;
          line-height: 1.5;
          color: #5f6368;
        }
        .conso-coming-soon-btn {
          appearance: none;
          border: 0;
          border-radius: 999px;
          background: #202124;
          color: #ffffff;
          font: 600 14px/1 "Google Sans Flex", "Google Sans", system-ui, sans-serif;
          padding: 13px 28px;
          cursor: pointer;
          transition: background-color 0.2s ease, transform 0.2s ease;
        }
        .conso-coming-soon-btn:hover {
          background: #10142F;
          transform: translateY(-1px);
        }
      `;
      document.head.append(style);

      comingSoonModal = document.createElement('div');
      comingSoonModal.className = 'conso-coming-soon-backdrop';
      comingSoonModal.setAttribute('role', 'dialog');
      comingSoonModal.setAttribute('aria-modal', 'true');
      comingSoonModal.setAttribute('aria-labelledby', 'conso-coming-soon-heading');
      comingSoonModal.innerHTML = `
        <div class="conso-coming-soon-dialog">
          <div class="conso-coming-soon-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
          <div class="conso-coming-soon-badge">Student Portal</div>
          <h2 class="conso-coming-soon-title" id="conso-coming-soon-heading">Available Soon</h2>
          <p class="conso-coming-soon-desc">Student Portal will be available very soon! You will be able to check candidate profiles, chest numbers, and live results right here.</p>
          <button type="button" class="conso-coming-soon-btn" data-close-coming-soon>Got it</button>
        </div>
      `;
      comingSoonModal.addEventListener('click', (e) => {
        if (e.target === comingSoonModal || e.target.closest?.('[data-close-coming-soon]')) {
          comingSoonModal.classList.remove('is-open');
        }
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && comingSoonModal?.classList.contains('is-open')) {
          comingSoonModal.classList.remove('is-open');
        }
      });
      document.body.append(comingSoonModal);
    }
    requestAnimationFrame(() => {
      comingSoonModal.classList.add('is-open');
      comingSoonModal.querySelector('.conso-coming-soon-btn')?.focus({ preventScroll: true });
    });
  }

  function scrollBelowHero() {
    document.documentElement.classList.remove('is-locked');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobileViewport = matchMedia('(max-width: 899px)').matches;
    const candidates = isMobileViewport
      ? [
          document.getElementById('race') || document.querySelector('section.race'),
          document.getElementById('register') || document.querySelector('section.register'),
        ]
      : [
          document.getElementById('journey') || document.querySelector('section.journey'),
          document.getElementById('race') || document.querySelector('section.race'),
          document.getElementById('register') || document.querySelector('section.register'),
        ];
    const target = candidates.find((el) => el && getComputedStyle(el).display !== 'none' && el.offsetHeight > 0);
    const navOffset = isMobileViewport ? -56 : 0;
    if (target) {
      if (!reduced && typeof window.__consoSmoothScrollTo === 'function') {
        window.__consoSmoothScrollTo(target, navOffset);
      } else {
        const top = Math.max(0, Math.round(target.getBoundingClientRect().top + window.scrollY + navOffset));
        window.scrollTo({ top, behavior: reduced ? 'instant' : 'smooth' });
      }
      return;
    }
    const hero = document.querySelector('.hero');
    const fallbackTop = hero
      ? Math.max(0, Math.round(hero.getBoundingClientRect().bottom + window.scrollY + navOffset))
      : window.innerHeight;
    window.scrollTo({ top: fallbackTop, behavior: reduced ? 'instant' : 'smooth' });
  }

  function replaceGalleryLabel(link) {
    if (link.childElementCount === 0) {
      if (/gallery/i.test(link.textContent || '')) link.textContent = 'Media';
      return;
    }
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (/gallery/i.test(node.nodeValue || '')) {
        node.nodeValue = node.nodeValue.replace(/gallery/gi, (m) => (m[0] === 'G' ? 'Media' : 'media'));
      }
    }
  }

  const update = () => {
    for (const link of document.querySelectorAll('.nav__links a[href], .menu__pages a[href], .menu__chips a[href], .footer__links a[href], a[href="/"]')) {
      const current = link.getAttribute('href');
      const currentPath = current ? new URL(current, location.origin).pathname : '';
      const isDuplicateGallery = link.closest('.nav__links, .menu__pages') && (currentPath === '/contributors' || currentPath === '/gallery');
      if (isDuplicateGallery || hiddenTargets.has(current) || hiddenTargets.has(currentPath)) {
        const listItem = link.closest('.menu__list > li');
        if (listItem) {
          listItem.hidden = true;
          listItem.style.display = 'none';
        } else {
          link.hidden = true;
          link.style.display = 'none';
        }
        link.setAttribute('aria-hidden', 'true');
        link.tabIndex = -1;
        continue;
      }
      const target = routes.get(current) || routes.get(currentPath);
      if (!target) continue;
      if (target === '/media' && (currentPath === '/gallery' || currentPath === '/festival-gallery.html')) {
        replaceGalleryLabel(link);
      }
      if (link.classList.contains('public-link-pending')) link.classList.remove('public-link-pending');
      if (link.hasAttribute('aria-disabled')) link.removeAttribute('aria-disabled');
      if (link.hasAttribute('tabindex')) link.removeAttribute('tabindex');
      const url = new URL(target, location.origin);
      if (customTenant) url.searchParams.set('tenant_id', customTenant);
      if (festivalId) url.searchParams.set('festival_id', festivalId);
      const nextHref = url.pathname + url.search + url.hash;
      if (current !== nextHref) link.setAttribute('href', nextHref);
    }
    for (const portalLink of document.querySelectorAll('.nav__cta, .hero__ctas a.btn--ghost, .menu__cta')) {
      const portalUrl = new URL('/candidate-search', location.origin);
      if (customTenant) portalUrl.searchParams.set('tenant_id', customTenant);
      if (festivalId) portalUrl.searchParams.set('festival_id', festivalId);
      const nextPortalHref = portalUrl.pathname + portalUrl.search;
      if (portalLink.getAttribute('href') !== nextPortalHref) {
        portalLink.setAttribute('href', nextPortalHref);
      }
      const walker = document.createTreeWalker(portalLink, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) {
        if (/student\s*portal/i.test(textNode.nodeValue || '')) {
          textNode.nodeValue = textNode.nodeValue.replace(/student\s*portal/gi, 'Find Me');
        }
      }
      portalLink.removeAttribute('aria-haspopup');
    }
    const heroCtas = document.querySelector('.hero__ctas');
    if (heroCtas) {
      let campusLink = heroCtas.querySelector('.hero__campus-cta');
      if (!campusLink) {
        campusLink = document.createElement('a');
        campusLink.className = 'btn btn--campus-hub hero__campus-cta';
        campusLink.href = '/campus';
        campusLink.setAttribute('data-nav-label', 'Campus Hub');
        campusLink.innerHTML = '<span>Campus Hub</span>';
        heroCtas.append(campusLink);
      } else if (campusLink.getAttribute('href') !== '/campus') {
        campusLink.setAttribute('href', '/campus');
      }
    }
  };

  let updateFrame = 0;
  const scheduleUpdate = () => {
    if (updateFrame) return;
    updateFrame = requestAnimationFrame(() => {
      updateFrame = 0;
      update();
    });
  };
  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });

  window.addEventListener('click', (event) => {
    const link = event.target.closest?.('a');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const rawHref = link.getAttribute('href') || '';

    // 1. Central Explore button on Hero -> auto-scroll down smoothly with NO transition animation
    if (link.matches('.hero__ctas a.btn--primary, .hero__ctas a[href="#journey"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      scrollBelowHero();
      return;
    }

    // 2b. Campus Hub CTA on hero -> /campus
    if (link.matches('.hero__campus-cta') || rawHref === '/campus' || rawHref === '/campus.html') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const openMenuBtn = document.querySelector('.nav__menu.is-open, .nav__menu[aria-expanded="true"]');
      if (openMenuBtn) openMenuBtn.click();
      if (window.__consoTransition) window.__consoTransition.go('/campus', 'Campus Hub');
      else location.assign('/campus');
      return;
    }

    // 3. Find Me buttons (top nav, hero ghost CTA, mobile menu drawer, or any /candidate-search link) -> /candidate-search
    if (link.matches('.nav__cta, .hero__ctas a.btn--ghost, .menu__cta') || rawHref.startsWith('/candidate-search')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const openMenuBtn = document.querySelector('.nav__menu.is-open, .nav__menu[aria-expanded="true"]');
      if (openMenuBtn) openMenuBtn.click();
      const portalUrl = new URL('/candidate-search', location.origin);
      if (customTenant) portalUrl.searchParams.set('tenant_id', customTenant);
      if (festivalId) portalUrl.searchParams.set('festival_id', festivalId);
      const nextPortal = portalUrl.pathname + portalUrl.search;
      if (window.__consoTransition) window.__consoTransition.go(nextPortal, 'Find Me');
      else location.assign(nextPortal);
      return;
    }

    if (!link.href) return;
    if (rawHref === '#' || rawHref.startsWith('#')) {
      if (rawHref.length > 1) {
        const hashTarget = document.getElementById(rawHref.slice(1));
        if (hashTarget) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!reduced && typeof window.__consoSmoothScrollTo === 'function') {
            window.__consoSmoothScrollTo(hashTarget, 0);
          } else {
            hashTarget.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth' });
          }
        }
      }
      return;
    }

    const url = new URL(link.href, location.origin);
    if (url.pathname === '/gallery' || url.pathname === '/festival-gallery.html' || url.pathname === '/contributors') {
      url.pathname = '/media';
    }
    if (!cleanPages.has(url.pathname) && (!url.pathname.startsWith('/festival-') || !url.pathname.endsWith('.html'))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (url.pathname === location.pathname && url.hash) {
      const target = document.getElementById(url.hash.slice(1));
      if (target) {
        history.pushState(null, '', url.pathname + url.search + url.hash);
        target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        return;
      }
      return;
    }
    if (url.pathname === location.pathname && !url.hash) {
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      return;
    }
    const nextUrl = url.pathname + url.search + url.hash;
    const rawLabel = link.querySelector?.('.nav__link, .menu__text') ? link.textContent : link.textContent;
    const word = String(rawLabel || '').replace(/You’re here/i, '').trim();
    if (window.__consoTransition && url.pathname !== '/consoulium') {
      window.__consoTransition.go(nextUrl, word);
    } else {
      location.assign(nextUrl);
    }
  }, true);

  window.addEventListener('pageshow', scheduleUpdate);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleUpdate();
  });

  update();
})();
