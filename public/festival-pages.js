(() => {
  const DEFAULT_TENANT = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
  const STATIC_PAGES = new Set(['gallery', 'news', 'brochure']);
  const MEDIA_PAGE_SIZE = 20;
  const navEntry = typeof performance !== 'undefined' ? performance.getEntriesByType?.('navigation')?.[0] : null;
  const isHardReload = navEntry?.type === 'reload';
  const params = new URLSearchParams(location.search);
  const rawTenant = params.get('tenant_id');
  const tenant = rawTenant === 'f87172d1-ed27-4db4-842c-cc00d3d56de2'
    ? DEFAULT_TENANT
    : rawTenant || DEFAULT_TENANT;
  const festivalId = params.get('festival_id');

  const page = document.body.dataset.page || '';
  const content = document.getElementById('content');
  const updated = document.getElementById('updated');
  const search = document.getElementById('search');
  const filtersHost = document.getElementById('filters');
  const refreshBtn = document.getElementById('refresh');
  const featuredHost = document.getElementById('featured');
  const mediaPaginationHost = document.getElementById('media-pagination');

  const TEAM_PALETTE = ['#6D28D9', '#E11D48', '#2563EB', '#10B981', '#F59E0B'];
  const TEAM_COLOR_RULES = [
    ['cosmix', '#6D28D9'],
    ['cognix', '#E11D48'],
    ['clarix', '#2563EB'],
    ['glifix', '#10B981'],
    ['zenix', '#F59E0B'],
    ['unit a', '#6D28D9'],
    ['unit b', '#E11D48'],
    ['unit c', '#2563EB'],
    ['unit d', '#10B981'],
    ['unit e', '#F59E0B'],
  ];

  function resolveTeamColor(team, stableIndex) {
    if (team?.color) return team.color;
    const name = String(team?.organisation_name || '').toLowerCase();
    for (const [needle, color] of TEAM_COLOR_RULES) {
      if (name.includes(needle)) return color;
    }
    return TEAM_PALETTE[stableIndex % TEAM_PALETTE.length];
  }

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  };

  const formatDate = (value, options) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? 'Time to be announced'
      : new Intl.DateTimeFormat(undefined, options).format(parsed);
  };

  const setMessage = (text, isError = false) => {
    if (!content) return;
    content.replaceChildren(el('div', `empty${isError ? ' error' : ''}`, text));
  };

  function sanitizePublicSnapshot(data) {
    return {
      tenant_id: data.tenant_id ?? null,
      festival_id: data.festival_id ?? null,
      revision: data.revision ?? null,
      generated_at: data.generated_at ?? null,
      expires_at: data.expires_at ?? null,
      features: data.features ?? null,
      settings: data.settings ?? null,
      schedules: Array.isArray(data.schedules) ? data.schedules : [],
      results: (Array.isArray(data.results) ? data.results : [])
        .filter((r) => [1, 2, 3].includes(Number(r.rank)))
        .map((r) => ({
          result_id: r.result_id ?? null,
          item_id: r.item_id ?? null,
          item_code: String(r.item_code || ''),
          item_name: String(r.item_name || ''),
          item_name_ml: String(r.item_name_ml || ''),
          is_group: r.is_group === true,
          item_category_codes: Array.isArray(r.item_category_codes) ? r.item_category_codes : [],
          organisation_name: String(r.organisation_name || ''),
          participant_name: String(r.participant_name || ''),
          rank: Number(r.rank),
        })),
      leaderboard: (Array.isArray(data.leaderboard) ? data.leaderboard : []).map((row) => ({
        organisation_id: row.organisation_id ?? null,
        organisation_name: String(row.organisation_name || 'Unit'),
        organisation_type: row.organisation_type ?? null,
        parent_id: row.parent_id ?? null,
        category_code: typeof row.category_code === 'string' ? row.category_code : undefined,
        total_points: Number(row.total_points || 0),
        first_place_count: Number(row.first_place_count || 0),
        second_place_count: Number(row.second_place_count || 0),
        third_place_count: Number(row.third_place_count || 0),
        result_count: Number(row.result_count || 0),
        latest_published_at: row.latest_published_at ?? null,
        grace_marks_awarded: Number(row.grace_marks_awarded || 0),
      })),
      individual_rankings: Array.isArray(data.individual_rankings)
        ? data.individual_rankings.map((r) => ({
            rank: Number(r.rank || 0),
            participant_name: String(r.participant_name || ''),
            organisation_name: String(r.organisation_name || ''),
            category_code: typeof r.category_code === 'string' ? r.category_code : null,
            profile_slug: typeof r.profile_slug === 'string' ? r.profile_slug : null,
            result_count: Number(r.result_count || 0),
            first_places: Number(r.first_places || 0),
            second_places: Number(r.second_places || 0),
            third_places: Number(r.third_places || 0),
            available_category_codes: Array.isArray(r.available_category_codes) ? r.available_category_codes : [],
          }))
        : [],
    };
  }

  let snapshot = null;
  let activeFilter = 'all';
  let requestId = 0;
  let standingsLimit = 5;
  const cardStore = new Map();
  const teamColorIndex = new Map();
  const mediaCardMap = new Map();
  let mediaState = { items: [], pagination: null, loadingMore: false, etagPage1: null };

  // Shared modal / lightbox host (for Gallery, News, Media)
  const modal = document.createElement('div');
  modal.className = 'glass-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  document.body.append(modal);

  let activeModalResize = null;

  function closeModal() {
    if (activeModalResize) {
      window.removeEventListener('resize', activeModalResize);
      activeModalResize = null;
    }
    modal.hidden = true;
    modal.className = 'glass-modal';
    modal.replaceChildren();
    document.documentElement.style.overflow = '';
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.classList.contains('lightbox__stage')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  let lightboxList = [];
  let lightboxIdx = 0;

  function preloadAround(idx) {
    if (lightboxList.length <= 1) return;
    for (const offset of [-1, 1]) {
      const neighbor = lightboxList[(idx + offset + lightboxList.length) % lightboxList.length];
      const src = neighbor?.cachedImage || neighbor?.image;
      if (src) {
        const pre = new Image();
        pre.src = src;
      }
    }
  }

  function openGalleryLightbox(items, idx) {
    lightboxList = items;
    lightboxIdx = idx;
    document.documentElement.style.overflow = 'hidden';
    renderGalleryLightbox();
  }

  function renderGalleryLightbox() {
    const item = lightboxList[lightboxIdx];
    if (!item) return;
    modal.className = 'glass-modal glass-modal--lightbox';

    const bar = el('div', 'lightbox__bar');
    const counter = el('span', 'meta-pill', `${lightboxIdx + 1} / ${lightboxList.length}`);
    const actions = el('div', 'bulletin-bar__actions');
    if (page === 'media') {
      const dlUrl = item.originalDownloadPath || item.downloadUrl || item.image;
      if (dlUrl) {
        const dlBtn = el('a', 'glass-btn glass-btn--primary', 'Download');
        dlBtn.href = dlUrl;
        dlBtn.download = `${(item.title || 'poster').replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
        actions.append(dlBtn);
      }
    }
    const closeBtn = el('button', 'glass-btn', 'Close');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', closeModal);
    actions.append(closeBtn);
    bar.append(counter, actions);

    const stage = el('div', 'lightbox__stage');
    const img = document.createElement('img');
    img.className = 'lightbox__img';
    img.src = item.cachedImage || item.image || item.thumb;
    img.alt = item.alt || `Media photo ${lightboxIdx + 1}`;
    img.decoding = 'async';
    img.onerror = () => {
      if (!img.dataset.lbFallback && item.image && img.src !== item.image) {
        img.dataset.lbFallback = '1';
        img.src = item.image;
      }
    };
    stage.append(img);

    const nav = el('div', 'lightbox__nav');
    const prev = el('button', 'glass-btn', '← Prev');
    prev.type = 'button';
    prev.disabled = lightboxList.length <= 1;
    prev.addEventListener('click', () => {
      lightboxIdx = (lightboxIdx - 1 + lightboxList.length) % lightboxList.length;
      renderGalleryLightbox();
    });
    const next = el('button', 'glass-btn', 'Next →');
    next.type = 'button';
    next.disabled = lightboxList.length <= 1;
    next.addEventListener('click', () => {
      lightboxIdx = (lightboxIdx + 1) % lightboxList.length;
      renderGalleryLightbox();
    });
    nav.append(prev, next);

    // Touch swipe navigation on mobile
    let touchStartX = 0;
    stage.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) touchStartX = e.touches[0].clientX;
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (!e.changedTouches || !e.changedTouches[0] || lightboxList.length <= 1) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 42) {
        lightboxIdx = dx < 0
          ? (lightboxIdx + 1) % lightboxList.length
          : (lightboxIdx - 1 + lightboxList.length) % lightboxList.length;
        renderGalleryLightbox();
      }
    }, { passive: true });

    modal.replaceChildren(bar, stage, nav);
    modal.hidden = false;
    closeBtn.focus();
    preloadAround(lightboxIdx);
  }

  function openTextModal(tagText, titleText, metaText, bodyText, actionEl) {
    const dialog = el('div', 'glass-modal__dialog');
    const top = el('div', 'glass-modal__top');
    top.append(el('span', 'glass-tag glass-tag--accent', tagText));
    const closeBtn = el('button', 'glass-btn', 'Close');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', closeModal);
    top.append(closeBtn);
    const heading = el('h2', '', titleText);
    heading.style.marginBottom = '8px';
    const meta = el('p', 'glass-panel__sub', metaText);
    meta.style.marginBottom = '16px';
    const body = el('p', '', bodyText);
    body.style.lineHeight = '1.7';
    body.style.color = '#e2e8f0';
    dialog.append(top, heading, meta, body);
    if (actionEl) {
      actionEl.style.marginTop = '18px';
      dialog.append(actionEl);
    }
    modal.replaceChildren(dialog);
    modal.hidden = false;
    closeBtn.focus();
  }

  function openBulletinModal(item, allItems = []) {
    const sheets = [];
    const seen = new Set();
    for (const candidate of [item, ...allItems]) {
      if (!candidate?.posterDesktop && !candidate?.posterMobile) continue;
      const key = candidate.posterDesktop || candidate.posterMobile;
      if (seen.has(key)) continue;
      seen.add(key);
      sheets.push(candidate);
    }
    if (!sheets.length) {
      openTextModal(item.category || 'News', item.title, formatDate(item.date, { dateStyle: 'full', timeStyle: 'short' }), item.body || item.summary);
      return;
    }

    let sheetIdx = 0;
    let manualPortrait = null;
    const isSmallViewport = () => window.matchMedia('(max-width: 760px)').matches;

    const renderSheet = () => {
      const current = sheets[sheetIdx] || item;
      const usePortrait = manualPortrait !== null ? manualPortrait : isSmallViewport();
      const src = usePortrait
        ? (current.posterMobile || current.posterDesktop)
        : (current.posterDesktop || current.posterMobile);

      modal.className = 'glass-modal glass-modal--lightbox glass-modal--bulletin';

      const bar = el('div', 'lightbox__bar bulletin-bar');
      const leftMeta = el('div', 'bulletin-bar__left');
      leftMeta.append(
        el('span', 'glass-tag glass-tag--accent', current.edition || 'Imprint Bulletin'),
        el('span', 'meta-pill', usePortrait ? 'Portrait Edition' : 'Landscape Spread'),
      );

      const controls = el('div', 'bulletin-bar__actions');
      if (current.posterDesktop && current.posterMobile) {
        const flipBtn = el('button', 'glass-btn', usePortrait ? 'Landscape View' : 'Portrait View');
        flipBtn.type = 'button';
        flipBtn.addEventListener('click', () => {
          manualPortrait = !usePortrait;
          renderSheet();
        });
        controls.append(flipBtn);
      }
      const dl = el('a', 'glass-btn', 'Download');
      dl.href = src;
      dl.download = '';
      const closeBtn = el('button', 'glass-btn glass-btn--primary', 'Close');
      closeBtn.type = 'button';
      closeBtn.addEventListener('click', closeModal);
      controls.append(dl, closeBtn);
      bar.append(leftMeta, controls);

      const stage = el('div', 'lightbox__stage bulletin-stage');
      const frame = el('div', 'bulletin-frame');
      const img = document.createElement('img');
      img.className = `lightbox__img bulletin-img ${usePortrait ? 'is-portrait' : 'is-landscape'}`;
      img.src = src;
      img.alt = `${current.edition || 'Imprint Bulletin'} — ${current.title || ''}`;
      img.decoding = 'async';
      frame.append(img);
      stage.append(frame);

      const nav = el('div', 'lightbox__nav bulletin-nav');
      if (sheets.length > 1) {
        sheets.forEach((s, idx) => {
          const tab = el('button', `glass-btn${idx === sheetIdx ? ' glass-btn--primary' : ''}`, s.edition || `Bulletin ${idx + 1}`);
          tab.type = 'button';
          tab.addEventListener('click', () => {
            sheetIdx = idx;
            renderSheet();
          });
          nav.append(tab);
        });
      }

      modal.replaceChildren(bar, stage, nav);
      modal.hidden = false;
      closeBtn.focus();
    };

    if (activeModalResize) window.removeEventListener('resize', activeModalResize);
    let lastMode = isSmallViewport();
    activeModalResize = () => {
      const nextMode = isSmallViewport();
      if (manualPortrait === null && nextMode !== lastMode && !modal.hidden) {
        lastMode = nextMode;
        renderSheet();
      }
    };
    window.addEventListener('resize', activeModalResize);
    document.documentElement.style.overflow = 'hidden';
    renderSheet();
  }

  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') closeModal();
    if ((page === 'gallery' || page === 'media') && lightboxList.length > 1) {
      if (e.key === 'ArrowRight') {
        lightboxIdx = (lightboxIdx + 1) % lightboxList.length;
        renderGalleryLightbox();
      } else if (e.key === 'ArrowLeft') {
        lightboxIdx = (lightboxIdx - 1 + lightboxList.length) % lightboxList.length;
        renderGalleryLightbox();
      }
    }
  });

  function renderFilterChips(items, colorMap = {}) {
    if (!filtersHost) return;
    const chips = items.map(([value, label]) => {
      const btn = el('button', `filter-chip${activeFilter === value ? ' is-active' : ''}`);
      btn.type = 'button';
      if (colorMap[value]) {
        const dot = el('i', 'filter-chip__dot');
        dot.style.setProperty('--dot', colorMap[value]);
        btn.append(dot);
      }
      btn.append(document.createTextNode(label));
      btn.addEventListener('click', () => {
        activeFilter = value;
        render();
      });
      return btn;
    });
    filtersHost.replaceChildren(...chips);
  }

  function isVisible(data) {
    if (page === 'news' || page === 'brochure') return false;
    if (page === 'media') return data.enabled === true;
    if (STATIC_PAGES.has(page)) return true;
    if (data.features?.public_page !== true) return false;
    if (page === 'schedule') return data.features.sections?.schedule === true;
    if (page === 'standings') {
      return data.features.sections?.results === true
        && data.features.public_leaderboard === true
        && data.settings?.is_public_visible === true;
    }
    if (page === 'results') {
      return data.settings?.is_public_visible === true && data.features.sections?.results === true;
    }
    return false;
  }

  function getOrCreateLeaderboardCard(team) {
    const key = String(team.organisation_id || team.organisation_name || '');
    if (!teamColorIndex.has(key)) teamColorIndex.set(key, teamColorIndex.size);
    const color = resolveTeamColor(team, teamColorIndex.get(key));
    let entry = cardStore.get(key);
    if (!entry) {
      const item = document.createElement('li');
      item.className = 'home-leaderboard__card';
      const left = el('div', 'home-leaderboard__left');
      const rank = el('span', 'home-leaderboard__rank');
      const name = el('span', 'home-leaderboard__name');
      left.append(rank, name);
      const points = el('strong', 'home-leaderboard__points');
      item.append(left, points);
      entry = { item, rank, name, points };
      cardStore.set(key, entry);
    }
    entry.item.style.setProperty('--team-c', color);
    entry.name.textContent = team.organisation_name || 'Unit';
    return entry;
  }

  let resultPosters = [];

  function findPostersForResultGroup(results) {
    if (!Array.isArray(resultPosters) || !resultPosters.length || !Array.isArray(results) || !results.length) {
      return [];
    }
    const itemIds = new Set(results.map((r) => r.item_id).filter(Boolean));
    const resultIds = new Set(results.map((r) => r.result_id).filter(Boolean));
    const itemCodes = new Set(results.map((r) => String(r.item_code || '').trim().toLowerCase()).filter(Boolean));
    const itemNames = new Set(
      results.flatMap((r) => [r.item_name, r.item_name_ml])
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean),
    );

    const matched = [];
    const seen = new Set();
    for (const poster of resultPosters) {
      if (!poster || typeof poster !== 'object') continue;
      const pid = poster.render_hash || poster.id;
      if (pid && seen.has(pid)) continue;
      const matchesId = (poster.event_id && itemIds.has(poster.event_id))
        || (poster.result_id && resultIds.has(poster.result_id));
      const matchesCode = poster.item_code && itemCodes.has(String(poster.item_code).trim().toLowerCase());
      const matchesTitle = poster.title && itemNames.has(String(poster.title).trim().toLowerCase());
      if (matchesId || matchesCode || matchesTitle) {
        if (pid) seen.add(pid);
        matched.push(poster);
      }
    }
    return matched;
  }

  function openResultPopup(first, sortedResults, matchedPosters) {
    modal.className = 'glass-modal result-modal';
    const card = el('div', 'glass-modal__dialog result-modal__card');

    const top = el('div', 'glass-modal__top');
    const tags = el('div', 'result-modal__tags');
    tags.append(
      el('span', 'glass-tag glass-tag--accent', first.item_code || 'PODIUM'),
      el('span', 'glass-tag', (first.item_category_codes || []).join(' · ') || 'General'),
    );
    const closeBtn = el('button', 'glass-btn', 'Close');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', closeModal);
    top.append(tags, closeBtn);

    const headingText = first.item_name || first.item_name_ml || 'Competition';
    const titleEl = el('h2', 'result-modal__title', headingText);
    const subEl = (first.item_name_ml && first.item_name_en !== first.item_name_ml && first.item_name !== first.item_name_ml)
      ? el('p', 'glass-panel__sub result-modal__sub', first.item_name_ml)
      : null;

    const podiumRows = el('div', 'glass-rows result-modal__podium');
    for (const res of sortedResults) {
      const rankNum = Number(res.rank);
      const rowNode = el('div', 'glass-row');
      const rankBadge = el('span', 'glass-rank', Number.isFinite(rankNum) ? rankNum : '–');
      if (Number.isFinite(rankNum)) rankBadge.dataset.rank = String(rankNum);
      const info = el('div');
      info.append(
        el('strong', '', res.participant_name || res.organisation_name || 'Published entry'),
        el('small', '', res.organisation_name || ''),
      );
      const placeLabel = rankNum === 1 ? '1st Place' : rankNum === 2 ? '2nd Place' : rankNum === 3 ? '3rd Place' : '';
      rowNode.append(rankBadge, info, el('span', 'glass-points', placeLabel));
      podiumRows.append(rowNode);
    }

    const posterSection = el('div', 'result-modal__posters');
    posterSection.append(el('h3', 'result-modal__section-title', 'Result Poster Preview'));

    if (matchedPosters.length > 0) {
      for (const poster of matchedPosters) {
        const posterBox = el('div', 'result-modal__poster-item');
        const img = document.createElement('img');
        img.className = 'result-modal__poster-img';
        img.src = poster.cached_image_url || poster.image_url || poster.cached_thumb_url || poster.thumb_url;
        img.alt = `${headingText} Result Poster`;
        img.decoding = 'async';
        img.onerror = () => {
          if (!img.dataset.fallback && poster.image_url && img.src !== poster.image_url) {
            img.dataset.fallback = '1';
            img.src = poster.image_url;
          }
        };

        const posterActions = el('div', 'result-modal__poster-actions');
        const badge = el('span', 'meta-pill', poster.result_no != null ? `Result #${poster.result_no}` : (poster.format || 'Result Poster'));
        const dlBtn = el('a', 'glass-btn glass-btn--primary', 'Download Poster');
        dlBtn.href = poster.original_download_path || poster.download_url || poster.image_url;
        dlBtn.download = `${(poster.title || headingText || 'result_poster').replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
        posterActions.append(badge, dlBtn);

        posterBox.append(img, posterActions);
        posterSection.append(posterBox);
      }
    } else {
      const emptyBox = el('div', 'result-modal__empty');
      emptyBox.append(
        el('strong', '', 'Preview not available · പ്രിവ്യൂ ലഭ്യല്ല'),
        el('span', '', 'Result poster has not been published for this competition yet.'),
      );
      posterSection.append(emptyBox);
    }

    card.append(top, titleEl);
    if (subEl) card.append(subEl);
    card.append(podiumRows, posterSection);
    modal.replaceChildren(card);
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function renderResults(term) {
    const allResults = (snapshot.results || []).filter((r) => [1, 2, 3].includes(Number(r.rank)));
    const catSet = new Set();
    for (const r of allResults) {
      for (const c of r.item_category_codes || []) catSet.add(c);
    }
    const chipList = [['all', 'All Categories'], ...Array.from(catSet).map((c) => [c, c])];
    renderFilterChips(chipList);

    const groups = new Map();
    for (const result of allResults) {
      if (activeFilter !== 'all' && !(result.item_category_codes || []).includes(activeFilter)) continue;
      const key = `${result.item_id}:${(result.item_category_codes || []).join(',')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(result);
    }

    const frag = document.createDocumentFragment();
    let count = 0;
    for (const [, results] of groups.entries()) {
      const first = results[0];
      if (term && !results.some((r) => [r.item_name, r.item_name_ml, r.item_code, r.participant_name, r.organisation_name]
        .some((v) => String(v || '').toLocaleLowerCase().includes(term)))) continue;

      const sortedResults = [...results].sort((a, b) => Number(a.rank ?? 999) - Number(b.rank ?? 999));
      const matchedPosters = findPostersForResultGroup(sortedResults);

      const panel = el('article', 'glass-panel glass-panel--clickable');
      panel.tabIndex = 0;
      panel.setAttribute('role', 'button');
      panel.setAttribute('aria-label', `${first.item_name || first.item_name_ml || 'Competition'} result details and poster`);
      const openPopup = () => openResultPopup(first, sortedResults, matchedPosters);
      panel.addEventListener('click', openPopup);
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPopup();
        }
      });

      const head = el('div', 'glass-panel__head');
      head.append(
        el('span', 'glass-tag glass-tag--accent', first.item_code || 'PODIUM'),
        el('span', 'glass-tag', (first.item_category_codes || []).join(' · ') || 'General'),
      );
      const heading = first.item_name || first.item_name_ml || 'Competition';
      panel.append(head, el('h2', '', heading));

      const rows = el('div', 'glass-rows');
      for (const res of sortedResults) {
        const rankNum = Number(res.rank);
        const rowNode = el('div', 'glass-row');
        const rankBadge = el('span', 'glass-rank', Number.isFinite(rankNum) ? rankNum : '–');
        if (Number.isFinite(rankNum)) rankBadge.dataset.rank = String(rankNum);
        const info = el('div');
        info.append(
          el('strong', '', res.participant_name || res.organisation_name || 'Published entry'),
          el('small', '', res.organisation_name || ''),
        );
        const placeLabel = rankNum === 1 ? '1st Place' : rankNum === 2 ? '2nd Place' : rankNum === 3 ? '3rd Place' : '';
        const placePill = el('span', 'glass-points', placeLabel);
        rowNode.append(rankBadge, info, placePill);
        rows.append(rowNode);
      }
      panel.append(rows);

      const previewBar = el('div', `result-card__poster-bar${matchedPosters.length ? ' is-ready' : ' is-empty'}`);
      if (matchedPosters.length > 0) {
        const leadPoster = matchedPosters[0];
        const thumbImg = document.createElement('img');
        thumbImg.className = 'result-card__poster-thumb';
        thumbImg.src = leadPoster.cached_thumb_url || leadPoster.thumb_url || leadPoster.cached_image_url || leadPoster.image_url;
        thumbImg.alt = `${heading} poster preview`;
        thumbImg.loading = 'lazy';
        thumbImg.decoding = 'async';
        thumbImg.onerror = () => {
          const direct = leadPoster.thumb_url || leadPoster.image_url;
          if (!thumbImg.dataset.fallback && direct && thumbImg.src !== direct) {
            thumbImg.dataset.fallback = '1';
            thumbImg.src = direct;
          }
        };
        const previewMeta = el('div', 'result-card__poster-meta');
        previewMeta.append(
          el('strong', '', matchedPosters.length > 1 ? `${matchedPosters.length} Result Posters` : 'Poster Preview'),
          el('small', '', 'Tap card to preview & download'),
        );
        previewBar.append(thumbImg, previewMeta, el('span', 'result-card__poster-cta', 'Open →'));
      } else {
        const emptyMeta = el('div', 'result-card__poster-meta');
        emptyMeta.append(
          el('strong', '', 'Preview not available'),
          el('small', '', 'പ്രിവ്യൂ ലഭ്യല്ല · Tap for result card'),
        );
        previewBar.append(emptyMeta);
      }
      panel.append(previewBar);

      frag.append(panel);
      count++;
    }
    content.replaceChildren(frag);
    if (!count) setMessage(term ? 'No matching results found.' : 'No results published yet.');
  }

  function renderSchedule(term) {
    const schedules = [...(snapshot.schedules || [])]
      .filter((s) => {
        if (!s.start_time) return false;
        const d = new Date(s.start_time);
        if (Number.isNaN(d.getTime())) return false;
        const day = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(d);
        return day === '2026-11-28' || day === '2026-11-29';
      })
      .sort((a, b) => Date.parse(a.start_time || '') - Date.parse(b.start_time || ''));

    const dayKey = (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? 'TBA' : new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).format(d);
    };
    const days = [...new Set(schedules.map((s) => dayKey(s.start_time)))];
    renderFilterChips([['all', 'All Days'], ...days.map((d) => [d, d])]);

    const frag = document.createDocumentFragment();
    let count = 0;
    for (const sch of schedules) {
      const dLabel = dayKey(sch.start_time);
      if (activeFilter !== 'all' && dLabel !== activeFilter) continue;
      if (term && ![sch.items?.item_name_en, sch.items?.item_name_ml, sch.venues?.name, sch.status, dLabel]
        .some((v) => String(v || '').toLocaleLowerCase().includes(term))) continue;

      const panel = el('article', 'glass-panel');
      const head = el('div', 'glass-panel__head');
      head.append(
        el('span', 'glass-tag glass-tag--accent', formatDate(sch.start_time, { dateStyle: 'medium', timeStyle: 'short' })),
        el('span', 'glass-tag glass-tag--status', sch.status || 'Scheduled'),
      );
      const titleText = sch.items?.item_name_en || sch.items?.item_name_ml || 'Scheduled program';
      const subParts = [sch.items?.item_name_ml && sch.items?.item_name_en ? sch.items.item_name_ml : '', sch.venues?.name || 'Venue TBA'].filter(Boolean);
      panel.append(head, el('h2', '', titleText), el('p', 'glass-panel__sub', subParts.join(' · ')));
      frag.append(panel);
      count++;
    }
    content.replaceChildren(frag);
    if (!count) setMessage(term ? 'No matching programs found.' : 'No programs scheduled yet.');
  }

  function renderStandings(term) {
    const showIndividual = snapshot.settings?.is_public_visible === true
      && snapshot.settings?.show_individual_rankings === true;
    const wantsIndividual = new URLSearchParams(location.search).get('view') === 'individual';

    if (showIndividual && wantsIndividual) {
      const rankings = [...(snapshot.individual_rankings || [])]
        .filter((r) => !term || [r.participant_name, r.organisation_name, r.category_code]
          .some((v) => String(v || '').toLocaleLowerCase().includes(term)))
        .sort((a, b) => Number(a.rank || 0) - Number(b.rank || 0));

      if (!rankings.length) {
        content.replaceChildren(el('li', 'home-leaderboard__empty', term ? 'No matching participants.' : 'No individual rankings published yet.'));
        return;
      }

      const nodes = rankings.slice(0, standingsLimit).map((row, idx) => {
        const card = el('li', 'home-leaderboard__card');
        card.style.setProperty('--team-c', TEAM_PALETTE[idx % TEAM_PALETTE.length]);
        const left = el('div', 'home-leaderboard__left');
        const rank = el('span', 'home-leaderboard__rank', `#${Number(row.rank || idx + 1)}`);
        const label = [
          row.participant_name || 'Participant',
          row.organisation_name,
          row.category_code ? row.category_code.toUpperCase() : '',
        ].filter(Boolean).join(' · ');
        const name = el('span', 'home-leaderboard__name', label);
        left.append(rank, name);
        const counts = el('strong', 'home-leaderboard__points', `${Number(row.first_places || 0)}×1st · ${Number(row.second_places || 0)}×2nd · ${Number(row.third_places || 0)}×3rd`);
        card.append(left, counts);
        return card;
      });
      content.replaceChildren(...nodes);
      return;
    }

    const sorted = [...(snapshot.leaderboard || [])]
      .sort((a, b) => Number(b.total_points || 0) - Number(a.total_points || 0));
    const filtered = sorted
      .filter((u) => !term || String(u.organisation_name || '').toLocaleLowerCase().includes(term))
      .slice(0, standingsLimit);

    if (!filtered.length) {
      content.replaceChildren(el('li', 'home-leaderboard__empty', term ? 'No matching units.' : 'No unit standings available yet.'));
      return;
    }

    const nodes = filtered.map((team, idx) => {
      const entry = getOrCreateLeaderboardCard(team);
      entry.rank.textContent = `#${idx + 1}`;
      entry.points.textContent = `${Number(team.total_points || 0)} pts`;
      return entry.item;
    });

    content.replaceChildren(...nodes);
    if (sorted.length > standingsLimit && !term) {
      const more = el('button', 'glass-btn', 'Show all units');
      more.type = 'button';
      more.addEventListener('click', () => {
        standingsLimit += 10;
        renderStandings(term);
      });
      content.append(more);
    }
  }

  function renderGallery() {
    const items = snapshot.gallery || [];
    if (updated) updated.textContent = items.length ? `${items.length} Moments` : '';
    const frag = document.createDocumentFragment();

    items.forEach((item, idx) => {
      const span = item.span || (item.orientation === 'portrait' ? 'tall' : 'sm');
      const card = el('button', `bento-card bento-card--${span} is-loading`);
      card.type = 'button';
      if (item.accent) card.style.setProperty('--card-accent', item.accent);
      card.setAttribute('aria-label', item.alt || `Open photo ${idx + 1}`);

      const img = document.createElement('img');
      img.src = item.thumb || item.image;
      img.alt = item.alt || `Consoulium 2k26 photo ${idx + 1}`;
      if (item.thumbWidth) img.width = item.thumbWidth;
      if (item.thumbHeight) img.height = item.thumbHeight;
      img.decoding = 'async';
      if (idx < 6) {
        img.loading = 'eager';
        img.setAttribute('fetchpriority', 'high');
      } else {
        img.loading = 'lazy';
      }

      const markLoaded = () => {
        card.classList.remove('is-loading');
        card.classList.add('is-loaded');
      };
      img.addEventListener('load', markLoaded, { once: true });
      img.addEventListener('error', markLoaded, { once: true });
      if (img.complete) markLoaded();

      card.append(img);
      card.addEventListener('click', () => openGalleryLightbox(items, idx));
      frag.append(card);
    });

    content.replaceChildren(frag);
    if (!items.length) setMessage('No gallery photos uploaded yet.');
  }

  function renderNews(term) {
    const items = [...(snapshot.news || [])]
      .sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || ''));
    const cats = [...new Set(items.map((n) => n.category).filter(Boolean))];
    renderFilterChips([['all', 'All Updates'], ...cats.map((c) => [c, c])]);
    if (content) content.className = 'news-bento';

    const featured = items.find((n) => n.featured) || items[0];
    if (featuredHost) {
      if (featured && activeFilter === 'all' && !term) {
        const box = el('article', 'news-featured news-featured--editorial');
        if (featured.accent) box.style.setProperty('--card-accent', featured.accent);

        const copyCol = el('div', 'news-featured__copy');
        const head = el('div', 'glass-panel__head');
        head.append(
          el('span', 'glass-tag glass-tag--accent', `${featured.edition || 'Featured'} · ${featured.category || 'Official'}`),
          el('span', 'glass-tag', formatDate(featured.date, { dateStyle: 'medium' })),
        );
        if (featured.kicker) copyCol.append(head, el('p', 'news-featured__kicker', featured.kicker));
        else copyCol.append(head);

        const h2 = el('h2', '', featured.title);
        const p = el('p', 'news-featured__summary', featured.summary);
        copyCol.append(h2, p);

        if (Array.isArray(featured.bullets) && featured.bullets.length) {
          const ul = el('ul', 'news-featured__bullets');
          for (const b of featured.bullets) ul.append(el('li', '', b));
          copyCol.append(ul);
        }

        const btn = el('button', 'glass-btn glass-btn--primary', 'Read Full Bulletin →');
        btn.type = 'button';
        btn.addEventListener('click', () => openBulletinModal(featured, items));
        copyCol.append(btn);

        const mediaCol = el('button', 'news-featured__visual');
        mediaCol.type = 'button';
        mediaCol.setAttribute('aria-label', 'Open full Imprint bulletin poster');
        mediaCol.addEventListener('click', () => openBulletinModal(featured, items));

        if (featured.thumb) {
          const primaryImg = document.createElement('img');
          primaryImg.className = 'news-featured__photo-main';
          primaryImg.src = featured.thumb;
          primaryImg.alt = featured.title || 'Consoulium inaugural';
          primaryImg.decoding = 'async';
          mediaCol.append(primaryImg);
        }
        if (featured.thumbSecondary) {
          const inset = el('div', 'news-featured__photo-inset');
          const secImg = document.createElement('img');
          secImg.src = featured.thumbSecondary;
          secImg.alt = 'Consoulium stage highlight';
          secImg.decoding = 'async';
          inset.append(secImg);
          mediaCol.append(inset);
        }
        mediaCol.append(el('span', 'news-featured__badge', 'IMPRINT E-PAPER'));

        box.append(copyCol, mediaCol);
        featuredHost.replaceChildren(box);
      } else {
        featuredHost.replaceChildren();
      }
    }

    const filtered = items.filter((n) => {
      if (activeFilter === 'all' && !term && featured && n.id === featured.id) return false;
      if (activeFilter !== 'all' && n.category !== activeFilter) return false;
      if (term) {
        const haystack = [n.kicker, n.title, n.summary, n.category, n.edition, n.author, n.authorRole, ...(n.tags || []), n.body];
        if (!haystack.some((v) => String(v || '').toLocaleLowerCase().includes(term))) return false;
      }
      return true;
    });

    if (content) {
      content.className = filtered.length === 1
        ? 'news-bento news-bento--single'
        : filtered.length === 2
          ? 'news-bento news-bento--two'
          : 'news-bento';
    }

    const frag = document.createDocumentFragment();
    for (const item of filtered) {
      const layout = item.layout || 'standard';
      const panel = el('article', `glass-panel news-card news-card--${layout}`);
      if (item.accent) panel.style.setProperty('--card-accent', item.accent);

      if (layout === 'photo' && item.thumb) {
        const heroWrap = el('div', 'news-card__media');
        const img = document.createElement('img');
        img.src = item.thumb;
        img.alt = item.title || 'Consoulium story';
        img.loading = 'lazy';
        img.decoding = 'async';
        heroWrap.append(img, el('span', 'news-card__edition', item.edition || 'Imprint'));

        const body = el('div', 'news-card__body');
        const head = el('div', 'glass-panel__head');
        head.append(
          el('span', 'glass-tag glass-tag--accent', item.category || 'Feature'),
          el('span', 'glass-tag', formatDate(item.date, { dateStyle: 'medium' })),
        );
        body.append(head, el('h2', '', item.title), el('p', 'glass-panel__sub', item.summary));
        if (Array.isArray(item.tags) && item.tags.length) {
          const tagsRow = el('div', 'news-tags');
          for (const tagText of item.tags) tagsRow.append(el('span', 'news-tag', tagText));
          body.append(tagsRow);
        }
        const readBtn = el('button', 'glass-btn news-card__action', 'Read notice →');
        readBtn.type = 'button';
        readBtn.addEventListener('click', () => openBulletinModal(item, items));
        body.append(readBtn);
        panel.append(heroWrap, body);
      } else if (layout === 'quote') {
        const head = el('div', 'glass-panel__head');
        head.append(
          el('span', 'glass-tag glass-tag--accent', `${item.edition || 'Imprint'} · ${item.category || 'Keynote'}`),
          el('span', 'glass-tag', formatDate(item.date, { dateStyle: 'medium' })),
        );
        const quoteBlock = el('div', 'news-quote__box');
        quoteBlock.append(
          el('span', 'news-quote__glyph', '“'),
          el('p', 'news-quote__text', item.summary),
        );
        const authorRow = el('div', 'news-quote__author');
        if (item.thumb) {
          const avatar = document.createElement('img');
          avatar.className = 'news-quote__avatar';
          avatar.src = item.thumb;
          avatar.alt = item.author || item.title || 'Speaker';
          avatar.loading = 'lazy';
          avatar.decoding = 'async';
          authorRow.append(avatar);
        }
        const authorMeta = el('div', 'news-quote__meta');
        authorMeta.append(
          el('strong', '', item.author || item.title),
          el('span', '', item.authorRole || ''),
        );
        authorRow.append(authorMeta);

        const readBtn = el('button', 'glass-btn news-card__action', 'Read notice →');
        readBtn.type = 'button';
        readBtn.addEventListener('click', () => openBulletinModal(item, items));
        panel.append(head, quoteBlock, authorRow, readBtn);
      } else if (layout === 'publication') {
        const head = el('div', 'glass-panel__head');
        head.append(
          el('span', 'glass-tag glass-tag--accent', `${item.edition || 'Imprint'} · ${item.category || 'Publications'}`),
          el('span', 'glass-tag', formatDate(item.date, { dateStyle: 'medium' })),
        );
        const showcase = el('div', 'news-book__row');
        if (item.thumb) {
          const coverWrap = el('div', 'news-book__cover');
          const cover = document.createElement('img');
          cover.src = item.thumb;
          cover.alt = item.title || 'Publication cover';
          cover.loading = 'lazy';
          cover.decoding = 'async';
          coverWrap.append(cover);
          showcase.append(coverWrap);
        }
        const copy = el('div', 'news-book__copy');
        copy.append(el('h2', '', item.title), el('p', 'glass-panel__sub', item.summary));
        showcase.append(copy);

        const readBtn = el('button', 'glass-btn news-card__action', 'Read notice →');
        readBtn.type = 'button';
        readBtn.addEventListener('click', () => openBulletinModal(item, items));
        panel.append(head, showcase, readBtn);
      } else {
        const top = el('div');
        const head = el('div', 'glass-panel__head');
        head.append(
          el('span', 'glass-tag glass-tag--accent', item.category || 'Notice'),
          el('span', 'glass-tag', formatDate(item.date, { dateStyle: 'medium' })),
        );
        top.append(head, el('h2', '', item.title), el('p', 'glass-panel__sub', item.summary));
        const readBtn = el('button', 'glass-btn news-card__action', 'Read notice →');
        readBtn.type = 'button';
        readBtn.addEventListener('click', () => openBulletinModal(item, items));
        panel.append(top, readBtn);
      }
      frag.append(panel);
    }
    content.replaceChildren(frag);
    if (!filtered.length && !(featuredHost && featuredHost.childElementCount)) setMessage('No bulletins found.');
  }

  const MEDIA_BENTO_SPANS = [
    'hero', 'sm', 'sm',
    'sm', 'sm', 'sm',
    'md', 'md',
    'sm', 'sm', 'sm',
    'sm', 'sm', 'hero',
    'sm', 'sm', 'sm',
    'sm', 'sm', 'sm',
  ];

  function persistMediaCache() {
    if (!snapshot) return;
    writeBrowserCache(MEDIA_STORAGE_KEY, {
      etagPage1: mediaState.etagPage1 || null,
      data: {
        tenant_id: tenant,
        festival_id: snapshot.festival_id ?? festivalId ?? null,
        enabled: snapshot.enabled !== false,
        generated_at: snapshot.generated_at || new Date().toISOString(),
        items: mediaState.items,
        pagination: mediaState.pagination,
      },
      fetchedAt: Date.now(),
    });
  }

  function renderMediaPagination() {
    if (!mediaPaginationHost) return;
    const items = mediaState.items || [];
    const pag = mediaState.pagination;
    const hasMore = Boolean(pag?.has_more && pag?.next_offset != null);
    if (!hasMore || !items.length) {
      mediaPaginationHost.hidden = true;
      mediaPaginationHost.replaceChildren();
      return;
    }
    const total = Math.max(items.length, Number(pag.total || items.length));
    const countLabel = el('span', 'meta-pill', `Showing ${items.length} of ${total}`);
    const moreBtn = el('button', 'glass-btn glass-btn--primary', mediaState.loadingMore ? 'Loading next 20…' : 'Show More');
    moreBtn.type = 'button';
    moreBtn.disabled = mediaState.loadingMore;
    moreBtn.addEventListener('click', () => loadMoreMedia());
    mediaPaginationHost.replaceChildren(countLabel, moreBtn);
    mediaPaginationHost.hidden = false;
  }

  async function loadMoreMedia() {
    const pag = mediaState.pagination;
    if (mediaState.loadingMore || !pag?.has_more || pag?.next_offset == null) return;
    mediaState.loadingMore = true;
    renderMediaPagination();
    try {
      const nextParams = new URLSearchParams({
        tenant_id: tenant,
        section: 'media',
        limit: String(MEDIA_PAGE_SIZE),
        offset: String(pag.next_offset),
      });
      if (festivalId) nextParams.set('festival_id', festivalId);
      const res = await fetch(`/api/public-media?${nextParams}`, {
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error('Failed to load next media batch');
      const data = await res.json();
      if (data.tenant_id !== tenant) throw new Error('Invalid media scope');

      const incoming = Array.isArray(data.items) ? data.items : [];
      const seen = new Set(mediaState.items.map((item) => item.render_hash || item.id));
      const merged = [...mediaState.items];
      for (const item of incoming) {
        const k = item.render_hash || item.id;
        if (k && !seen.has(k)) {
          seen.add(k);
          merged.push(item);
        }
      }
      mediaState.items = merged;
      mediaState.pagination = data.pagination || { has_more: false, next_offset: null, total: merged.length };
      if (snapshot) snapshot = { ...snapshot, items: merged, pagination: mediaState.pagination };
      persistMediaCache();
      renderMedia();
    } catch {
      // Keep already-loaded media intact cleanly on transient failure
    } finally {
      mediaState.loadingMore = false;
      renderMediaPagination();
    }
  }

  function renderMedia() {
    const items = mediaState.items || [];
    if (updated) {
      const total = Number(mediaState.pagination?.total || items.length);
      updated.textContent = items.length
        ? (total > items.length ? `${items.length} of ${total} Moments` : `${items.length} Moments`)
        : '';
    }

    if (!items.length) {
      mediaCardMap.clear();
      if (mediaPaginationHost) {
        mediaPaginationHost.hidden = true;
        mediaPaginationHost.replaceChildren();
      }
      setMessage('No event photos or media uploaded yet.');
      return;
    }

    const lightboxItems = items.map((m) => ({
      image: m.image_url,
      cachedImage: m.cached_image_url || '',
      thumb: m.thumb_url,
      downloadUrl: m.download_url || m.image_url,
      originalDownloadPath: m.original_download_path || '',
      alt: m.title || 'Media photo',
      title: m.title || 'poster',
    }));

    const activeKeys = new Set(items.map((item) => item.render_hash || item.id));
    for (const [k] of mediaCardMap) {
      if (!activeKeys.has(k)) mediaCardMap.delete(k);
    }

    const nodes = [];
    items.forEach((item, idx) => {
      const key = item.render_hash || item.id;
      const span = items.length < 3 ? 'md' : MEDIA_BENTO_SPANS[idx % MEDIA_BENTO_SPANS.length];
      let entry = mediaCardMap.get(key);
      if (!entry) {
        const card = el('button', `bento-card bento-card--${span} is-loading`);
        card.type = 'button';
        card.style.setProperty('--card-accent', TEAM_PALETTE[idx % TEAM_PALETTE.length]);
        card.setAttribute('aria-label', item.title || `Open photo ${idx + 1}`);

        const img = document.createElement('img');
        img.src = item.cached_thumb_url || item.thumb_url || item.cached_image_url || item.image_url;
        img.alt = item.title || `Consoulium media photo ${idx + 1}`;
        img.decoding = 'async';
        if (idx < 6) {
          img.loading = 'eager';
          img.setAttribute('fetchpriority', 'high');
        } else {
          img.loading = 'lazy';
        }

        const markLoaded = () => {
          card.classList.remove('is-loading');
          card.classList.add('is-loaded');
        };
        img.addEventListener('load', markLoaded, { once: true });
        img.addEventListener('error', () => {
          if (!img.dataset.fallbackStage && (item.cached_image_url || item.image_url)) {
            const nextSrc = img.src === item.cached_thumb_url
              ? (item.cached_image_url || item.thumb_url || item.image_url)
              : item.image_url;
            if (nextSrc && nextSrc !== img.src) {
              img.dataset.fallbackStage = '1';
              img.src = nextSrc;
              return;
            }
          }
          if (!img.dataset.directFallback && item.image_url && img.src !== item.image_url) {
            img.dataset.directFallback = '1';
            img.src = item.image_url;
            return;
          }
          mediaCardMap.delete(key);
          card.remove();
          mediaState.items = mediaState.items.filter((x) => (x.render_hash || x.id) !== key);
          persistMediaCache();
          renderMediaPagination();
          if (content.children.length === 0) {
            setMessage('No event photos or media uploaded yet.');
          }
        });
        if (img.complete && img.naturalWidth > 0) markLoaded();

        card.append(img);
        entry = { card, img, span, onClick: null };
        card.addEventListener('click', () => entry.onClick?.());
        mediaCardMap.set(key, entry);
      } else if (entry.span !== span) {
        entry.span = span;
        const loaded = entry.card.classList.contains('is-loaded');
        entry.card.className = `bento-card bento-card--${span} ${loaded ? 'is-loaded' : 'is-loading'}`;
      }
      entry.onClick = () => openGalleryLightbox(lightboxItems, idx);
      nodes.push(entry.card);
    });

    const existing = Array.from(content.children);
    const hasOnlyPrefixMatch = existing.length > 0
      && existing.length <= nodes.length
      && existing.every((node, i) => node === nodes[i]);

    if (hasOnlyPrefixMatch) {
      if (nodes.length > existing.length) {
        const frag = document.createDocumentFragment();
        for (let i = existing.length; i < nodes.length; i++) frag.append(nodes[i]);
        content.append(frag);
      }
    } else if (existing.length !== nodes.length || !existing.every((node, i) => node === nodes[i])) {
      content.replaceChildren(...nodes);
    }

    renderMediaPagination();
  }

  function renderBrochure() {
    const b = snapshot.brochure || {};
    const chapters = b.chapters || [];
    if (featuredHost) {
      const hero = el('div', 'brochure-hero');
      const cover = el('div', 'brochure-cover');
      const top = el('div');
      top.append(
        el('span', 'glass-tag glass-tag--accent', b.edition || 'Consoulium 2k26 · Ayatic Codex'),
        el('h2', 'brochure-cover__title', b.title || 'Official Prospectus & Guide'),
      );
      const sub = el('p', 'glass-panel__sub', `${b.dates || '26–29 Nov 2026'} · ${b.venue || 'Bukhari Campus, Kondotty'}`);
      const actions = el('div', 'brochure-cover__actions');
      const printBtn = el('button', 'glass-btn glass-btn--primary', 'Print / Save PDF');
      printBtn.type = 'button';
      printBtn.addEventListener('click', () => window.print());
      actions.append(printBtn);
      if (b.pdfUrl) {
        const pdfLink = el('a', 'glass-btn', 'Download PDF ↓');
        pdfLink.href = b.pdfUrl;
        pdfLink.target = '_blank';
        pdfLink.rel = 'noopener';
        actions.append(pdfLink);
      }
      cover.append(top, sub, actions);

      const quick = el('div', 'glass-panel');
      quick.append(
        el('span', 'glass-tag', 'At a Glance'),
        el('h2', '', 'Ayatic Codex Edition'),
        el('p', 'glass-panel__sub', 'Explore the theme philosophy, five intellectual houses, scoring protocol, and four-day stage structure at Bukhari Campus.'),
      );
      hero.append(cover, quick);
      featuredHost.replaceChildren(hero);
    }

    if (!chapters.length) {
      setMessage('Brochure chapters are being prepared.');
      return;
    }

    if (activeFilter === 'all') activeFilter = chapters[0].id;
    renderFilterChips(chapters.map((c) => [c.id, `${c.number} · ${c.title}`]), Object.fromEntries(chapters.map((c) => [c.id, c.accent])));

    const current = chapters.find((c) => c.id === activeFilter) || chapters[0];
    const panel = el('article', 'glass-panel brochure-chapter');
    const head = el('div', 'glass-panel__head');
    head.append(
      el('span', 'glass-tag glass-tag--accent', `Chapter ${current.number || '01'}`),
      el('span', 'glass-tag', current.subtitle || ''),
    );
    const body = el('p', '', current.body || '');
    body.style.color = '#e2e8f0';
    body.style.lineHeight = '1.68';
    panel.append(head, el('h2', '', current.title), body);
    if (Array.isArray(current.highlights) && current.highlights.length) {
      const ul = el('ul', 'brochure-highlights');
      current.highlights.forEach((h) => ul.append(el('li', '', h)));
      panel.append(ul);
    }
    content.replaceChildren(panel);
  }

  function render() {
    if (!snapshot) {
      setMessage('Public data is temporarily unavailable. Please try again.', true);
      return;
    }
    if (!isVisible(snapshot)) {
      if (filtersHost) filtersHost.replaceChildren();
      if (mediaPaginationHost) {
        mediaPaginationHost.hidden = true;
        mediaPaginationHost.replaceChildren();
      }
      setMessage(page === 'results' && snapshot.features?.sections?.results === true
        ? 'Results are not public yet.'
        : 'This public section is currently unavailable.');
      return;
    }
    const term = search ? search.value.trim().toLocaleLowerCase() : '';
    if (page === 'results') renderResults(term);
    else if (page === 'schedule') renderSchedule(term);
    else if (page === 'standings') renderStandings(term);
    else if (page === 'gallery') renderGallery(term);
    else if (page === 'news') renderNews(term);
    else if (page === 'media') renderMedia();
    else if (page === 'brochure') renderBrochure();
  }

  const SNAP_STORAGE_KEY = `conso_pub_snap_v2:${tenant}:${festivalId || 'active'}`;
  const MEDIA_STORAGE_KEY = `conso_pub_media_v3:${tenant}:${festivalId || 'active'}:media`;
  const RESULT_POSTERS_STORAGE_KEY = `conso_pub_media_v3:${tenant}:${festivalId || 'active'}:result`;

  function readBrowserCache(key) {
    try {
      const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeBrowserCache(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      try {
        sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        // ignore storage quota errors
      }
    }
  }

  function clearBrowserCache(key) {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
  }

  async function fetchResultPosters(force = false, targetRevision = null) {
    if (page !== 'results') return;
    const cached = readBrowserCache(RESULT_POSTERS_STORAGE_KEY);
    if (cached?.data && cached.data.tenant_id === tenant && Array.isArray(cached.data.items)) {
      if (!resultPosters.length) {
        resultPosters = cached.data.items;
        if (snapshot) render();
      }
      if (!force && (!targetRevision || cached.revision === targetRevision)) {
        return;
      }
    }

    const posterParams = new URLSearchParams({ tenant_id: tenant, section: 'result' });
    if (festivalId) posterParams.set('festival_id', festivalId);
    const headers = { Accept: 'application/json' };
    if (!force && cached?.etag) headers['If-None-Match'] = cached.etag;

    try {
      const res = await fetch(`/api/public-media?${posterParams}`, {
        cache: 'no-store',
        credentials: 'omit',
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 304 && cached?.data) {
        writeBrowserCache(RESULT_POSTERS_STORAGE_KEY, {
          ...cached,
          revision: targetRevision ?? cached.revision ?? snapshot?.revision ?? null,
          fetchedAt: Date.now(),
        });
        resultPosters = Array.isArray(cached.data.items) ? cached.data.items : [];
        if (snapshot) render();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (data.tenant_id !== tenant) return;
      const etag = res.headers.get('ETag') || null;
      if (data.enabled === false) {
        clearBrowserCache(RESULT_POSTERS_STORAGE_KEY);
        resultPosters = [];
      } else {
        writeBrowserCache(RESULT_POSTERS_STORAGE_KEY, {
          etag,
          data,
          revision: targetRevision ?? snapshot?.revision ?? null,
          fetchedAt: Date.now(),
        });
        resultPosters = Array.isArray(data.items) ? data.items : [];
      }
      if (snapshot) render();
    } catch {
      // Keep result cards working cleanly even if poster lookup fails
    }
  }

  async function refresh(force = false) {
    const id = ++requestId;
    if (refreshBtn) refreshBtn.disabled = true;
    try {
      if (STATIC_PAGES.has(page)) {
        const response = await fetch('/festival-content.json', { cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error('Content unavailable');
        const data = await response.json();
        if (id !== requestId) return;
        snapshot = data;
        render();
        return;
      }

      if (page === 'media') {
        const cachedMedia = readBrowserCache(MEDIA_STORAGE_KEY);
        if (cachedMedia?.data && cachedMedia.data.tenant_id === tenant && Array.isArray(cachedMedia.data.items)) {
          if (!snapshot) {
            snapshot = cachedMedia.data;
            mediaState = {
              items: cachedMedia.data.items,
              pagination: cachedMedia.data.pagination || null,
              loadingMore: false,
              etagPage1: cachedMedia.etagPage1 || null,
            };
            render();
          }
          if (!force && !isHardReload) {
            return;
          }
        }

        const mediaParams = new URLSearchParams({
          tenant_id: tenant,
          section: 'media',
          limit: String(MEDIA_PAGE_SIZE),
          offset: '0',
        });
        if (festivalId) mediaParams.set('festival_id', festivalId);
        const headers = { Accept: 'application/json' };
        if (!force && cachedMedia?.etagPage1) headers['If-None-Match'] = cachedMedia.etagPage1;

        const response = await fetch(`/api/public-media?${mediaParams}`, {
          cache: 'no-store',
          credentials: 'omit',
          headers,
          signal: AbortSignal.timeout(12000),
        });
        if (response.status === 304 && cachedMedia?.data) {
          if (id !== requestId) return;
          snapshot = cachedMedia.data;
          mediaState = {
            items: cachedMedia.data.items || [],
            pagination: cachedMedia.data.pagination || null,
            loadingMore: false,
            etagPage1: cachedMedia.etagPage1 || null,
          };
          render();
          return;
        }
        if (!response.ok) throw new Error('Media unavailable');
        const data = await response.json();
        if (data.tenant_id !== tenant) throw new Error('Invalid media scope');
        if (id !== requestId) return;
        const etagPage1 = response.headers.get('ETag') || null;
        if (data.enabled === false) {
          clearBrowserCache(MEDIA_STORAGE_KEY);
          mediaState = { items: [], pagination: null, loadingMore: false, etagPage1: null };
        } else {
          mediaState = {
            items: Array.isArray(data.items) ? data.items : [],
            pagination: data.pagination || null,
            loadingMore: false,
            etagPage1,
          };
        }
        snapshot = data;
        if (data.enabled !== false) persistMediaCache();
        render();
        return;
      }

      const storedSnapEntry = readBrowserCache(SNAP_STORAGE_KEY);
      if (!snapshot && storedSnapEntry?.data && storedSnapEntry.data.tenant_id === tenant) {
        snapshot = storedSnapEntry.data;
        if (updated && storedSnapEntry.data.generated_at) {
          updated.textContent = `Updated ${formatDate(storedSnapEntry.data.generated_at, { timeStyle: 'short' })}`;
        }
        render();
      }

      const verRes = await fetch(`/api/public-version?tenant_id=${encodeURIComponent(tenant)}`, {
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
      if (id !== requestId) return;
      if (version.revision === null) {
        clearBrowserCache(SNAP_STORAGE_KEY);
        clearBrowserCache(RESULT_POSTERS_STORAGE_KEY);
      } else if (!force && snapshot && snapshot.revision === version.revision) {
        if (page === 'results') fetchResultPosters(false, version.revision);
        return;
      }

      const snapParams = new URLSearchParams({ tenant_id: tenant });
      if (festivalId) snapParams.set('festival_id', festivalId);

      const snapHeaders = { Accept: 'application/json' };
      if (!force && storedSnapEntry?.etag) {
        snapHeaders['If-None-Match'] = storedSnapEntry.etag;
      }

      const response = await fetch(`/api/public-snapshot?${snapParams}`, {
        cache: 'no-store',
        credentials: 'omit',
        headers: snapHeaders,
        signal: AbortSignal.timeout(8000),
      });
      if (response.status === 304 && storedSnapEntry?.data && storedSnapEntry.data.tenant_id === tenant) {
        if (id !== requestId) return;
        snapshot = storedSnapEntry.data;
        if (updated && storedSnapEntry.data.generated_at) {
          updated.textContent = `Updated ${formatDate(storedSnapEntry.data.generated_at, { timeStyle: 'short' })}`;
        }
        render();
        if (page === 'results') fetchResultPosters(false, snapshot.revision);
        return;
      }
      if (!response.ok) throw new Error('Data unavailable');
      const data = await response.json();
      if (
        data.tenant_id !== tenant
        || !Number.isFinite(Date.parse(data.generated_at))
      ) {
        throw new Error('Invalid snapshot');
      }
      if (id !== requestId) return;
      const sanitized = sanitizePublicSnapshot(data);
      snapshot = sanitized;
      if (sanitized.revision && sanitized.features?.public_page === true) {
        writeBrowserCache(SNAP_STORAGE_KEY, {
          etag: response.headers.get('ETag') || null,
          data: sanitized,
        });
      } else {
        clearBrowserCache(SNAP_STORAGE_KEY);
      }
      if (updated && data.generated_at) {
        updated.textContent = `Updated ${formatDate(data.generated_at, { timeStyle: 'short' })}`;
      }
      render();
      if (page === 'results') fetchResultPosters(force, sanitized.revision);
    } catch {
      if (id !== requestId) return;
      if (!snapshot) {
        render();
      }
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  if (search) {
    search.addEventListener('input', () => {
      render();
    });
  }
  if (refreshBtn) refreshBtn.addEventListener('click', () => {
    refresh(true);
    if (page === 'results') fetchResultPosters(true, snapshot?.revision || null);
  });
  refresh();
  if (page === 'results') fetchResultPosters(false, snapshot?.revision || null);
})();
