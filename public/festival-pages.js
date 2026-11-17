(() => {
  const DEFAULT_TENANT = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
  const tenant = new URLSearchParams(location.search).get('tenant_id') || DEFAULT_TENANT;
  const page = document.body.dataset.page;
  const content = document.getElementById('content');
  const updated = document.getElementById('updated');
  const search = document.getElementById('search');
  let snapshot = null;
  let requestId = 0;
  let confirmedAt = 0;

  document.querySelectorAll('[data-tenant-link]').forEach((link) => {
    const url = new URL(link.getAttribute('href'), location.origin);
    url.searchParams.set('tenant_id', tenant);
    link.href = url.pathname + url.search;
  });

  const element = (tag, className, value) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = String(value);
    return node;
  };
  const message = (text, isError = false) => {
    content.replaceChildren(element('div', `empty${isError ? ' error' : ''}`, text));
  };
  const reconcile = (parent, nextParent) => {
    const previous = Array.from(parent.childNodes);
    const next = Array.from(nextParent.childNodes);
    const used = new Set();
    next.forEach((desired, index) => {
      const key = desired.nodeType === Node.ELEMENT_NODE ? desired.getAttribute('data-key') : null;
      const current = key
        ? previous.find((candidate) => !used.has(candidate) && candidate.nodeType === Node.ELEMENT_NODE && candidate.getAttribute('data-key') === key)
        : previous[index] && !used.has(previous[index]) && !previous[index].getAttribute?.('data-key') ? previous[index] : null;
      if (!current || current.nodeType !== desired.nodeType ||
          (current.nodeType === Node.ELEMENT_NODE && current.tagName !== desired.tagName)) {
        parent.insertBefore(desired, parent.childNodes[index] || null);
        return;
      }
      used.add(current);
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.nodeValue !== desired.nodeValue) current.nodeValue = desired.nodeValue;
      } else {
        for (const attr of Array.from(current.attributes)) {
          if (!desired.hasAttribute(attr.name)) current.removeAttribute(attr.name);
        }
        for (const attr of Array.from(desired.attributes)) {
          if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
        }
        reconcile(current, desired);
      }
      if (parent.childNodes[index] !== current) parent.insertBefore(current, parent.childNodes[index] || null);
    });
    previous.forEach((old) => { if (!used.has(old)) old.remove(); });
  };
  const date = (value, options) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'Time to be announced' : new Intl.DateTimeFormat(undefined, options).format(parsed);
  };
  const row = (rank, name, subtitle, points) => {
    const node = element('div', 'row');
    node.append(element('span', 'rank', rank), element('span', '', ''));
    node.children[1].append(element('strong', '', name), element('small', '', subtitle));
    node.append(element('span', 'points', points));
    return node;
  };
  const visible = (data) => {
    if (data.features?.public_page !== true) return false;
    if (page === 'schedule') return data.features.sections?.schedule === true;
    if (page === 'standings') return data.features.sections?.results === true && data.features.public_leaderboard === true;
    if (data.settings?.is_public_visible !== true) return false;
    if (page === 'results') return data.features.sections?.results === true;
    return false;
  };

  function render() {
    if (!snapshot || Date.now() >= confirmedAt + 60000) {
      snapshot = null;
      updated.textContent = '';
      message('Public data is temporarily unavailable. Please try again.', true);
      return;
    }
    if (!visible(snapshot)) {
      message(page === 'results' && snapshot.features.sections?.results === true
        ? 'Results are not public yet.' : 'This public section is currently unavailable.');
      return;
    }
    const term = search.value.trim().toLocaleLowerCase();
    const grid = document.createDocumentFragment();
    if (page === 'results') {
      const groups = new Map();
      for (const result of snapshot.results || []) {
        const key = `${result.item_id}:${(result.item_category_codes || []).join(',')}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(result);
      }
      for (const results of groups.values()) {
        const first = results[0];
        if (term && !results.some((r) => [r.item_name, r.item_code, r.participant_name, r.organisation_name].some((v) => String(v || '').toLocaleLowerCase().includes(term)))) continue;
        const panel = element('article', 'panel');
        panel.dataset.key = `result:${key}`;
        panel.append(element('span', 'tag', [first.item_code, ...(first.item_category_codes || [])].filter(Boolean).join(' · ')), element('h2', '', first.item_name || 'Competition'));
        const rows = element('div', 'rows');
        for (const result of results.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))) {
          const entry = row(result.rank ?? '–', result.participant_name || result.organisation_name || 'Published entry', [result.organisation_name, result.grade && `Grade ${result.grade}`].filter(Boolean).join(' · '), result.points_awarded == null ? '' : `${result.points_awarded} pts`);
          entry.dataset.key = `result:${result.result_id}`;
          rows.append(entry);
        }
        panel.append(rows); grid.append(panel);
      }
    } else if (page === 'standings') {
      const rows = (snapshot.leaderboard || []).filter((r) => !term || String(r.organisation_name || '').toLocaleLowerCase().includes(term)).sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0));
      const panel = element('article', 'panel');
      panel.dataset.key = 'standings';
      panel.append(element('span', 'tag', 'Unit leaderboard'), element('h2', '', 'Current standings'));
      const list = element('div', 'rows');
      const hasPublishedScores = rows.some((unit) => Number(unit.result_count || 0) > 0 || Number(unit.total_points || 0) > 0);
      rows.forEach((unit, index) => {
        const entry = row(hasPublishedScores ? index + 1 : '–', unit.organisation_name || 'Unit', `${unit.result_count || 0} published results`, `${unit.total_points || 0} pts`);
        entry.dataset.key = `unit:${unit.organisation_id}`;
        list.append(entry);
      });
      panel.append(list); if (rows.length) grid.append(panel);
    } else {
      const schedules = (snapshot.schedules || []).filter((s) => !term || [s.items?.item_name_en, s.items?.item_name_ml, s.venues?.name].some((v) => String(v || '').toLocaleLowerCase().includes(term))).sort((a, b) => Date.parse(a.start_time || '') - Date.parse(b.start_time || ''));
      for (const schedule of schedules) {
        const panel = element('article', 'panel');
        panel.dataset.key = `schedule:${schedule.id || schedule.schedule_id}`;
        panel.append(element('span', 'schedule-date', date(schedule.start_time, { dateStyle: 'medium', timeStyle: 'short' })), element('h2', '', schedule.items?.item_name_en || schedule.items?.item_name_ml || 'Scheduled program'));
        panel.append(element('p', '', [schedule.venues?.name, schedule.status].filter(Boolean).join(' · ') || 'Venue to be announced'));
        grid.append(panel);
      }
    }
    reconcile(content, grid);
    if (!content.childElementCount) message(term ? 'No matches found.' : page === 'schedule' ? 'No programs scheduled yet.' : 'Nothing published yet.');
  }

  async function refresh() {
    const id = ++requestId;
    try {
      const versionResponse = await fetch(`/api/public-version?tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!versionResponse.ok) throw new Error('Version unavailable');
      const version = await versionResponse.json();
      const checkedAt = Date.parse(version.checked_at);
      if (version.tenant_id !== tenant || !(version.revision === null || (typeof version.revision === 'string' && /^(0|[1-9][0-9]*)$/.test(version.revision))) ||
          !Number.isFinite(checkedAt) || checkedAt > Date.now() + 10000 || checkedAt < Date.now() - 15000) throw new Error('Invalid version');
      if (id !== requestId) return;
      if (snapshot && snapshot.revision === version.revision) {
        const wasFresh = Date.now() < confirmedAt + 60000;
        confirmedAt = Date.now();
        if (!wasFresh) render();
        return;
      }
      const response = await fetch(`/api/public-snapshot?tenant_id=${encodeURIComponent(tenant)}`, { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Snapshot unavailable');
      const data = await response.json();
      if (data.tenant_id !== tenant || data.revision !== version.revision || !Number.isFinite(Date.parse(data.generated_at)) || !Number.isFinite(Date.parse(data.expires_at)) || Date.now() >= Date.parse(data.expires_at) || Date.parse(data.expires_at) - Date.parse(data.generated_at) > 60000) throw new Error('Expired snapshot');
      if (id !== requestId) return;
      snapshot = data;
      confirmedAt = Date.now();
      updated.textContent = `Updated ${date(data.generated_at, { timeStyle: 'short' })}`;
      render();
    } catch {
      if (id !== requestId) return;
      if (!snapshot || Date.now() >= confirmedAt + 60000) render();
    }
  }

  search.addEventListener('input', render);
  document.getElementById('refresh').addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (snapshot && Date.now() >= confirmedAt + 60000) render(); refresh(); } });
  setInterval(() => { if (!document.hidden) refresh(); else if (snapshot) render(); }, 20000);
  setInterval(() => { if (snapshot && Date.now() >= confirmedAt + 60000) render(); }, 1000);
  refresh();
})();
