(() => {
  // The homepage is shipped as a prebuilt bundle. Keep its visible navigation
  // pointed at the public pages until the bundle can be rebuilt from source.
  const routes = new Map([
    ['/', '/consoulium'],
    ['#journey', '/festival-results.html'],
    ['/#journey', '/festival-results.html'],
    ['#race', '/festival-standings.html'],
    ['/#race', '/festival-standings.html'],
    ['#thought', '/festival-schedule.html'],
    ['/#thought', '/festival-schedule.html'],
    ['/results', '/festival-results.html'],
    ['/standings', '/festival-standings.html'],
    ['/schedule', '/festival-schedule.html'],
  ]);
  const requestedTenant = new URLSearchParams(location.search).get('tenant_id');
  const tenant = requestedTenant === 'f87172d1-ed27-4db4-842c-cc00d3d56de2'
    ? '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe' : requestedTenant;
  const update = () => {
    for (const link of document.querySelectorAll('.nav__links a[href], .menu__pages a[href], .footer__links a[href], a[href="/"]')) {
      if (['gallery', 'news', 'media', 'brochure'].includes(link.textContent.trim().toLowerCase())) {
        link.classList.add('public-link-pending');
        link.setAttribute('aria-disabled', 'true');
        link.removeAttribute('href');
        link.tabIndex = -1;
        continue;
      }
      const target = routes.get(link.getAttribute('href'));
      if (!target) continue;
      const url = new URL(target, location.origin);
      if (tenant) url.searchParams.set('tenant_id', tenant);
      link.href = url.pathname + url.search;
    }
  };
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.classList.contains('public-link-pending')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!link.href) return;
    const url = new URL(link.href, location.origin);
    if (url.pathname !== '/consoulium' && (!url.pathname.startsWith('/festival-') || !url.pathname.endsWith('.html'))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(url.pathname + url.search);
  }, true);
  update();
})();
