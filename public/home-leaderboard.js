// Live public standings from /api/public-version & /api/public-snapshot without changing the home scene.
const DEFAULT_TENANT = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
const SNAPSHOT_TTL_MS = 60_000;
let cachedSnapshot = null;
let confirmedAt = 0;

function getScope() {
  const params = new URLSearchParams(location.search);
  const rawTenant = params.get('tenant_id');
  const tenant = rawTenant === 'f87172d1-ed27-4db4-842c-cc00d3d56de2'
    ? DEFAULT_TENANT
    : rawTenant || DEFAULT_TENANT;
  const festivalId = params.get('festival_id');
  return { tenant, festivalId };
}

async function fetchStandings(force = false) {
  const { tenant, festivalId } = getScope();
  const verParams = new URLSearchParams({ tenant_id: tenant });
  const verRes = await fetch(`/api/public-version?${verParams}`, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!verRes.ok) throw new Error('Version unavailable');
  const version = await verRes.json();
  const checkedAt = Date.parse(version.checked_at);
  if (
    version.tenant_id !== tenant
    || !(version.revision === null || (typeof version.revision === 'string' && /^(0|[1-9][0-9]*)$/.test(version.revision)))
    || !Number.isFinite(checkedAt)
    || checkedAt > Date.now() + 10000
    || checkedAt < Date.now() - 15000
  ) {
    throw new Error('Invalid version');
  }

  if (!force && cachedSnapshot && cachedSnapshot.revision === version.revision && Date.now() < confirmedAt + SNAPSHOT_TTL_MS) {
    confirmedAt = Date.now();
    return cachedSnapshot;
  }

  const snapParams = new URLSearchParams({ tenant_id: tenant });
  if (festivalId) snapParams.set('festival_id', festivalId);
  const snapRes = await fetch(`/api/public-snapshot?${snapParams}`, {
    cache: 'no-store',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!snapRes.ok) throw new Error('Standings unavailable');
  const data = await snapRes.json();
  if (
    data.tenant_id !== tenant
    || data.revision !== version.revision
    || !Number.isFinite(Date.parse(data.generated_at))
    || !Number.isFinite(Date.parse(data.expires_at))
    || Date.now() >= Date.parse(data.expires_at)
    || Date.parse(data.expires_at) - Date.parse(data.generated_at) > SNAPSHOT_TTL_MS
  ) {
    throw new Error('Expired snapshot');
  }
  cachedSnapshot = data;
  confirmedAt = Date.now();
  return data;
}

const TEAM_PALETTE = ['#6D28D9', '#E11D48', '#2563EB', '#10B981', '#F59E0B'];
const TEAM_COLOR_RULES = [
  ['cosmix', '#6D28D9'],
  ['cognix', '#E11D48'],
  ['clarix', '#2563EB'],
  ['glifix', '#10B981'],
  ['zenix', '#F59E0B'],
];

function resolveTeamColor(team, stableIndex) {
  if (team?.color) return team.color;
  const name = String(team?.organisation_name || '').toLowerCase();
  for (const [needle, color] of TEAM_COLOR_RULES) {
    if (name.includes(needle)) return color;
  }
  return TEAM_PALETTE[stableIndex % TEAM_PALETTE.length];
}

async function install(section) {
  if (section.classList.contains('home-leaderboard')) return;
  section.classList.add('home-leaderboard');

  section.querySelector('.register__head')?.remove();

  const mega = section.querySelector('.mega');
  mega?.removeAttribute('href');
  mega?.removeAttribute('target');
  mega?.removeAttribute('rel');
  mega?.removeAttribute('data-cursor');
  mega?.setAttribute('role', 'presentation');
  mega?.setAttribute('aria-hidden', 'true');
  mega?.setAttribute('tabindex', '-1');
  mega?.querySelectorAll('.mega__label').forEach((label) => label.replaceChildren('Leaderboard'));

  const list = document.createElement('ol');
  list.className = 'home-leaderboard__list';
  list.setAttribute('aria-label', 'Team points');
  section.querySelector('.register__action')?.append(list);

  const views = [];
  function node(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function addView(kind, content) {
    views.push({ kind, content, limit: 5 });
  }
  addView('standings', list);
  const block = node('section', 'public-section');
  block.id = 'public-results';
  block.tabIndex = -1;
  block.setAttribute('aria-label', 'Festival sections');
  const navList = node('div', 'public-section__nav-list');
  if (mega) {
    for (const labelText of ['Results', 'Schedule', 'Standings', 'Gallery']) {
      const btn = node('button', 'mega public-section__banner public-section__nav-btn');
      btn.type = 'button';
      for (const child of mega.children) {
        if (!child.classList.contains('mega__arrow')) btn.append(child.cloneNode(true));
      }
      btn.querySelectorAll('.mega__label').forEach((label) => { label.textContent = labelText; });
      btn.querySelectorAll('.mega__orbit').forEach((orbit) => {
        orbit.removeAttribute('style');
      });
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        const url = new URL('/' + labelText.toLowerCase(), location.origin);
        const { tenant, festivalId } = getScope();
        if (tenant) url.searchParams.set('tenant_id', tenant);
        if (festivalId) url.searchParams.set('festival_id', festivalId);
        const nextUrl = url.pathname + url.search;
        if (window.__consoTransition) window.__consoTransition.go(nextUrl, labelText);
        else location.assign(nextUrl);
      });
      navList.append(btn);
    }
  }
  block.append(navList);
  section.append(block);
  const resultsSection = section.querySelector('#public-results');
  if (resultsSection && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let revealFrame = 0;
    const updateReveal = () => {
      revealFrame = 0;
      if (!resultsSection.isConnected) {
        window.removeEventListener('scroll', scheduleReveal);
        window.removeEventListener('resize', scheduleReveal);
        return;
      }
      const viewport = window.innerHeight;
      const top = resultsSection.getBoundingClientRect().top;
      const progress = Math.max(0, Math.min(1, (viewport - top) / (viewport * 1.2)));
      const eased = progress * progress * (3 - 2 * progress);
      resultsSection.style.setProperty('--result-opacity', eased.toFixed(3));
      resultsSection.style.setProperty('--result-fade', `${45 * (1 - eased)}vh`);
    };
    const scheduleReveal = () => {
      if (!revealFrame) revealFrame = requestAnimationFrame(updateReveal);
    };
    window.addEventListener('scroll', scheduleReveal, { passive: true });
    window.addEventListener('resize', scheduleReveal, { passive: true });
    scheduleReveal();
  }
  let snapshot = null;
  let loadError = false;
  let pending = false;
  const cardStore = new Map();
  const teamColorIndex = new Map();

  function getOrCreateCard(team) {
    const key = String(team.organisation_id || team.organisation_name || '');
    if (!teamColorIndex.has(key)) teamColorIndex.set(key, teamColorIndex.size);
    const color = resolveTeamColor(team, teamColorIndex.get(key));
    let entry = cardStore.get(key);
    if (!entry) {
      const item = document.createElement('li');
      item.className = 'home-leaderboard__card';
      const left = document.createElement('div');
      left.className = 'home-leaderboard__left';
      const rank = document.createElement('span');
      rank.className = 'home-leaderboard__rank';
      const name = document.createElement('span');
      name.className = 'home-leaderboard__name';
      left.append(rank, name);
      const points = document.createElement('strong');
      points.className = 'home-leaderboard__points';
      item.append(left, points);
      entry = { item, rank, name, points, lastPoints: null };
      cardStore.set(key, entry);
    }
    entry.item.style.setProperty('--team-c', color);
    entry.name.textContent = team.organisation_name;
    return entry;
  }

  function render(onlyView, animateFlip = false) {
    for (const view of onlyView ? [onlyView] : views) {
      const { kind, content } = view;
      if (loadError || !snapshot) {
        content.replaceChildren(node('li', 'home-leaderboard__empty', loadError ? 'Live standings are temporarily unavailable.' : 'Loading live standings…'));
        continue;
      }
      const allowed = snapshot?.features?.public_page === true && (kind === 'schedule'
        ? snapshot.features.sections?.schedule === true
        : snapshot.features.sections?.results === true && (kind === 'standings'
          ? snapshot.features.public_leaderboard === true && snapshot.settings?.is_public_visible === true
          : snapshot.settings?.is_public_visible === true));
      if (!allowed) {
        content.replaceChildren(node('li', 'home-leaderboard__empty', 'Standings are currently unavailable.'));
        continue;
      }
      const sorted = [...(snapshot.leaderboard || [])]
        .sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0));
      const filtered = sorted.slice(0, view.limit);

      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const prevPositions = new Map();
      if (animateFlip && !reducedMotion) {
        for (const child of content.children) {
          if (child.classList.contains('home-leaderboard__card')) {
            prevPositions.set(child, child.getBoundingClientRect().top);
          }
        }
      }

      const nodes = [];
      filtered.forEach((team, idx) => {
        const entry = getOrCreateCard(team);
        const pts = Number(team.total_points || 0);
        entry.rank.textContent = `#${idx + 1}`;
        entry.points.textContent = `${pts} pts`;
        if (entry.lastPoints !== null && entry.lastPoints !== pts) {
          entry.item.classList.remove('is-updated');
          void entry.item.offsetWidth;
          entry.item.classList.add('is-updated');
          window.clearTimeout(entry.popTimer);
          entry.popTimer = window.setTimeout(() => entry.item.classList.remove('is-updated'), 650);
        }
        entry.lastPoints = pts;
        nodes.push(entry.item);
      });

      content.replaceChildren(...nodes);
      if (sorted.length > view.limit) {
        const more = node('button', 'public-section__more', 'Show more');
        more.type = 'button';
        more.addEventListener('click', () => { view.limit += 5; render(view); });
        content.append(more);
      }

      if (animateFlip && !reducedMotion && prevPositions.size) {
        for (const item of nodes) {
          const oldTop = prevPositions.get(item);
          if (oldTop == null) continue;
          const deltaY = oldTop - item.getBoundingClientRect().top;
          if (Math.abs(deltaY) < 1) continue;
          item.classList.toggle('is-rising', deltaY > 0);
          item.style.transition = 'none';
          item.style.transform = `translate3d(0, ${deltaY}px, 0)`;
        }
        content.getBoundingClientRect();
        requestAnimationFrame(() => {
          for (const item of nodes) {
            if (!item.style.transform) continue;
            item.style.transition = 'transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)';
            item.style.transform = 'translate3d(0, 0, 0)';
            const cleanup = () => {
              item.style.transition = '';
              item.style.transform = '';
              item.classList.remove('is-rising');
              item.removeEventListener('transitionend', cleanup);
            };
            item.addEventListener('transitionend', cleanup);
          }
        });
      }

      if (!filtered.length) {
        content.replaceChildren(node('li', 'home-leaderboard__empty', 'No standings published yet.'));
      }
    }
  }

  async function refresh(force = false) {
    if (pending || !section.isConnected) return;
    pending = true;
    if (!snapshot && !loadError && views[0]) {
      views[0].content.replaceChildren(node('li', 'home-leaderboard__empty', 'Loading live standings…'));
    }
    try {
      snapshot = await fetchStandings(force);
      loadError = false;
      if (section.isConnected) render(undefined, true);
    } catch {
      cachedSnapshot = null;
      confirmedAt = 0;
      snapshot = null;
      loadError = true;
      if (section.isConnected) render(undefined, false);
    } finally {
      pending = false;
    }
  }
  const onVisible = () => {
    if (!section.isConnected) { document.removeEventListener('visibilitychange', onVisible); return; }
    if (!document.hidden) refresh(true);
  };
  document.addEventListener('visibilitychange', onVisible);
  await refresh();

}

const observer = new MutationObserver(() => {
  const section = document.querySelector('section#register');
  if (section) install(section);
});
observer.observe(document.body, { childList: true, subtree: true });
const initialSection = document.querySelector('section#register');
if (initialSection) install(initialSection);
