(() => {
  const routes = new Map([
    ['/', '/explore'],
    ['#journey', '/results'],
    ['/#journey', '/results'],
    ['#race', '/standings'],
    ['/#race', '/standings'],
    ['#thought', '/schedule'],
    ['/#thought', '/schedule'],
    ['#register', '/brochure'],
    ['/#register', '/brochure'],
    ['/results', '/results'],
    ['/standings', '/standings'],
    ['/schedule', '/schedule'],
    ['/gallery', '/gallery'],
    ['/news', '/news'],
    ['/media', '/media'],
    ['/brochure', '/brochure'],
    ['/contributors', '/gallery'],
    ['/speakers', '/news'],
    ['/team', '/media'],
    ['/partners', '/brochure'],
    ['/festival-results.html', '/results'],
    ['/festival-standings.html', '/standings'],
    ['/festival-schedule.html', '/schedule'],
    ['/festival-gallery.html', '/gallery'],
    ['/festival-news.html', '/news'],
    ['/festival-media.html', '/media'],
    ['/festival-brochure.html', '/brochure'],
  ]);
  const cleanPages = new Set(['/explore', '/consoulium', '/results', '/standings', '/schedule', '/gallery', '/news', '/media', '/brochure']);
  const DEFAULT_TENANT = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
  const searchParams = new URLSearchParams(location.search);
  const requestedTenant = searchParams.get('tenant_id');
  const tenant = requestedTenant === 'f87172d1-ed27-4db4-842c-cc00d3d56de2'
    ? DEFAULT_TENANT
    : requestedTenant || DEFAULT_TENANT;
  const festivalId = searchParams.get('festival_id');
  const update = () => {
    for (const link of document.querySelectorAll('.nav__links a[href], .menu__pages a[href], .menu__chips a[href], .footer__links a[href], a[href="/"]')) {
      const current = link.getAttribute('href');
      const target = routes.get(current);
      if (!target) continue;
      if (link.classList.contains('public-link-pending')) link.classList.remove('public-link-pending');
      if (link.hasAttribute('aria-disabled')) link.removeAttribute('aria-disabled');
      if (link.hasAttribute('tabindex')) link.removeAttribute('tabindex');
      const url = new URL(target, location.origin);
      if (tenant) url.searchParams.set('tenant_id', tenant);
      if (festivalId) url.searchParams.set('festival_id', festivalId);
      const nextHref = url.pathname + url.search + url.hash;
      if (current !== nextHref) link.setAttribute('href', nextHref);
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!link.href) return;
    const url = new URL(link.href, location.origin);
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
  update();
})();
