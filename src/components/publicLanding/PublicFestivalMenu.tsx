import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

export const DEFAULT_PUBLIC_TENANT_ID = '45a0c1a0-bda0-4806-8477-f3fd3d6dfbbe';
export const LEGACY_PUBLIC_TENANT_ALIAS = 'f87172d1-ed27-4db4-842c-cc00d3d56de2';

interface NavItem {
  id: 'home' | 'results' | 'standings' | 'schedule' | 'media' | 'find-me';
  label: string;
  to: string;
  c: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', to: '/explore', c: '#6D28D9' },
  { id: 'results', label: 'Results', to: '/results', c: '#E11D48' },
  { id: 'standings', label: 'Standings', to: '/standings', c: '#10B981' },
  { id: 'schedule', label: 'Schedule', to: '/schedules', c: '#F59E0B' },
  { id: 'media', label: 'Media', to: '/media', c: '#6D28D9' },
  { id: 'find-me', label: 'Find Me', to: '/candidate-search', c: '#2563EB' },
];

const QUICK_CHIPS: ReadonlyArray<readonly [string, string]> = [
  ['Results', '/results'],
  ['Standings', '/standings'],
  ['Schedule', '/schedules'],
  ['Media', '/media'],
  ['Find Me', '/candidate-search'],
];

const BAND_COLORS = ['#6D28D9', '#E11D48', '#2563EB', '#10B981', '#F59E0B'];

const GLYPH_SVGS = [
  '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#6D28D9"/><polygon points="50,14 61,39 86,50 61,61 50,86 39,61 14,50 39,39" fill="#fff"/><circle cx="50" cy="50" r="10" fill="#6D28D9"/></svg>',
  '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48"/><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48" transform="rotate(60 50 50)"/><rect x="4.4" y="41.34" width="91.2" height="17.33" rx="8.66" fill="#E11D48" transform="rotate(120 50 50)"/></svg>',
  '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#2563EB"/><path d="M50 20.24C55.36 44.64 55.36 44.64 79.76 50 55.36 55.36 55.36 55.36 50 79.76 44.64 55.36 44.64 55.36 20.24 50 44.64 44.64 44.64 44.64 50 20.24Z" fill="#fff"/></svg>',
  '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="41.76" fill="#fff" stroke="#10B981" stroke-width="12.48"/><path d="M2 50A48 48 0 0 0 98 50Z" fill="#10B981"/></svg>',
  '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30" fill="#F59E0B"/><circle cx="50" cy="18" r="14" fill="#F59E0B"/><circle cx="82" cy="50" r="14" fill="#F59E0B"/><circle cx="50" cy="82" r="14" fill="#F59E0B"/><circle cx="18" cy="50" r="14" fill="#F59E0B"/><circle cx="72.6" cy="27.4" r="14" fill="#F59E0B"/><circle cx="72.6" cy="72.6" r="14" fill="#F59E0B"/><circle cx="27.4" cy="72.6" r="14" fill="#F59E0B"/><circle cx="27.4" cy="27.4" r="14" fill="#F59E0B"/><circle cx="50" cy="50" r="14" fill="#fff"/></svg>',
];

const PUBLIC_REFERRER_LABELS: Record<string, string> = {
  '/consoulium': 'Consoulium',
  '/consoulium.html': 'Consoulium',
  '/fest': 'Consoulium',
  '/explore': 'Home',
  '/explore.html': 'Home',
  '/home': 'Home',
  '/results': 'Results',
  '/festival-results.html': 'Results',
  '/scores': 'Results',
  '/standings': 'Standings',
  '/festival-standings.html': 'Standings',
  '/live': 'Standings',
  '/schedule': 'Schedule',
  '/schedules': 'Schedule',
  '/festival-schedule.html': 'Schedule',
  '/events': 'Schedule',
  '/media': 'Media',
  '/festival-media.html': 'Media',
  '/gallery': 'Media',
  '/photos': 'Media',
  '/posters': 'Media',
  '/news': 'News',
  '/festival-news.html': 'News',
  '/brochure': 'Brochure',
  '/festival-brochure.html': 'Brochure',
};

const SCOPED_MENU_CSS = `
@font-face {
  font-family: "GoogleSansFlex";
  src: url("/assets/google-sans-flex-latin-wdth-normal-B_nyAeTb.woff2") format("woff2");
  font-weight: 100 1000;
  font-stretch: 75% 151%;
  font-display: swap;
}
.conso-pm-btn {
  position: fixed;
  right: 16px;
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  width: 52px;
  height: 52px;
  padding: 0;
  border-radius: 999px;
  border: 1.5px solid rgba(255, 255, 255, 0.24);
  background: #10142F;
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  box-shadow: 0 14px 32px -8px rgba(16, 20, 47, 0.42), 0 0 0 1px rgba(16, 20, 47, 0.08);
  display: grid;
  place-items: center;
  cursor: pointer;
  z-index: 965;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.25s, border-color 0.25s;
}
.conso-pm-btn:hover {
  background: #182047;
  border-color: rgba(255, 255, 255, 0.36);
  transform: translateY(-1px);
}
.conso-pm-btn.is-open {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.42);
  transform: rotate(90deg) scale(1.04);
}
.conso-pm-dots {
  display: grid;
  grid-template-columns: repeat(3, 6px);
  grid-template-rows: repeat(2, 6px);
  gap: 3px;
}
.conso-pm-dots i {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.conso-pm-dots i:nth-child(1) { background: #6D28D9; }
.conso-pm-dots i:nth-child(2) { background: #E11D48; }
.conso-pm-dots i:nth-child(3) { background: #2563EB; }
.conso-pm-dots i:nth-child(4) { background: #10B981; }
.conso-pm-dots i:nth-child(5) { background: #F59E0B; }

.conso-pm-drawer {
  position: fixed;
  inset: 0;
  z-index: 950;
  visibility: hidden;
  pointer-events: none;
  color: #e8eaed;
  font-family: "GoogleSansFlex", "Google Sans", system-ui, -apple-system, sans-serif;
}
.conso-pm-drawer.is-open,
.conso-pm-drawer.is-animating {
  visibility: visible;
  pointer-events: auto;
}
.conso-pm-drawer * { box-sizing: border-box; }
.conso-pm-drawer a { color: inherit; text-decoration: none; }
.conso-pm-bands {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  display: grid;
  grid-template-rows: repeat(5, 1fr);
  overflow: hidden;
}
.conso-pm-band {
  display: block;
  background: var(--c);
  transform: translate3d(-101%, 0, 0);
  will-change: transform;
}
.conso-pm-sheet {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  clip-path: inset(0% 0% 100% 0%);
  background:
    radial-gradient(70% 55% at 88% 8%, rgba(109, 40, 217, 0.28), transparent 62%),
    radial-gradient(60% 50% at 0% 100%, rgba(225, 29, 72, 0.2), transparent 60%),
    radial-gradient(40% 40% at 55% 70%, rgba(16, 185, 129, 0.12), transparent 70%),
    rgba(6, 10, 24, 0.96);
  -webkit-backdrop-filter: blur(22px) saturate(1.4);
  backdrop-filter: blur(22px) saturate(1.4);
  padding: calc(18px + env(safe-area-inset-top, 0px)) clamp(20px, 4vw, 48px) calc(24px + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
}
.conso-pm-inner {
  width: 100%;
  max-width: 1180px;
  flex: 1;
  min-height: 0;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(260px, 0.85fr);
  align-items: center;
  gap: clamp(28px, 6vw, 96px);
}
.conso-pm-pages { min-width: 0; }
.conso-pm-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.conso-pm-eyebrow {
  font-size: 0.76rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #9aa8c7;
  font-weight: 700;
}
.conso-pm-close {
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.conso-pm-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.conso-pm-item { border-top: 1px solid rgba(255, 255, 255, 0.1); }
.conso-pm-item:last-child { border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.conso-pm-link {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 4px;
}
.conso-pm-no {
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--c, #2563EB);
}
.conso-pm-label {
  font-size: clamp(1.45rem, 6vw, 2.2rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.08;
}
.conso-pm-mask {
  display: block;
  overflow: hidden;
  padding: 0.06em 1.2em 0.1em 0;
}
.conso-pm-text {
  position: relative;
  display: inline-block;
  white-space: nowrap;
  transition: transform 0.55s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform, opacity;
}
.conso-pm-trail {
  position: absolute;
  left: -0.1em;
  right: -0.1em;
  bottom: 0.08em;
  height: 0.3em;
  border-radius: 0.2em;
  background: var(--c);
  opacity: 0.85;
  z-index: -1;
  transform-origin: 0 50%;
  transform: scaleX(0);
  transition: transform 0.65s cubic-bezier(0.16, 1, 0.3, 1);
}
.conso-pm-head {
  position: absolute;
  top: 50%;
  right: -0.95em;
  width: 0.62em;
  height: 0.62em;
  margin-top: -0.31em;
  padding: 0.05em;
  border-radius: 50%;
  background: #fff;
  opacity: 0;
  transform: translateX(-1.2em) rotate(-240deg) scale(0.6);
  transition: transform 0.65s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s;
}
.conso-pm-head svg { width: 100%; height: 100%; display: block; }
.conso-pm-link:hover .conso-pm-text,
.conso-pm-link:focus-visible .conso-pm-text { transform: translateX(0.14em); }
.conso-pm-link:hover .conso-pm-trail,
.conso-pm-link:focus-visible .conso-pm-trail,
.conso-pm-item.is-here .conso-pm-trail { transform: scaleX(1); }
.conso-pm-item.is-here .conso-pm-trail { opacity: 0.45; }
.conso-pm-link:hover .conso-pm-head,
.conso-pm-link:focus-visible .conso-pm-head,
.conso-pm-item.is-here .conso-pm-head { opacity: 1; transform: none; }
.conso-pm-here {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.22);
}
.conso-pm-aside {
  display: grid;
  gap: clamp(22px, 4vh, 36px);
  align-items: start;
  justify-items: start;
}
.conso-pm-group,
.conso-pm-event { display: grid; gap: 12px; }
.conso-pm-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.conso-pm-chip {
  display: inline-flex;
  align-items: center;
  padding: 9px 15px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 0.92rem;
  font-weight: 500;
  transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
}
.conso-pm-chip:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.34);
  transform: translateY(-1px);
}
.conso-pm-date {
  margin: 0;
  font-size: clamp(1.35rem, 2.4vw, 1.85rem);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.08;
  color: #fff;
}
.conso-pm-venue {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 500;
  color: #ffd27a;
}
.conso-pm-portal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 13px 26px;
  border-radius: 999px;
  background: #fff;
  color: #0b1021;
  font-size: 0.98rem;
  font-weight: 700;
  transition: transform 160ms ease, box-shadow 160ms ease;
}
.conso-pm-portal:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
}
@media (max-width: 899px) {
  .conso-pm-sheet {
    padding: calc(16px + env(safe-area-inset-top, 0px)) 20px calc(18px + env(safe-area-inset-bottom, 0px));
  }
  .conso-pm-top { margin-bottom: 10px; }
  .conso-pm-inner {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
  }
  .conso-pm-pages {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .conso-pm-list {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-rows: repeat(8, minmax(0, 1fr));
  }
  .conso-pm-link { height: 100%; padding: 0 4px; }
  .conso-pm-label { font-size: clamp(1.7rem, min(7.2vw, 4.4vh), 3.1rem); }
  .conso-pm-aside { display: none; }
}
`;

export function withTenantPath(
  path: string,
  tenantId?: string | null,
  festivalId?: string | null,
): string {
  if (!path.startsWith('/') || typeof window === 'undefined') return path;
  const isDefault =
    !tenantId || tenantId === DEFAULT_PUBLIC_TENANT_ID || tenantId === LEGACY_PUBLIC_TENANT_ALIAS;
  const url = new URL(path, window.location.origin);
  if (!isDefault && tenantId) {
    url.searchParams.set('tenant_id', tenantId);
  }
  if (festivalId) {
    url.searchParams.set('festival_id', festivalId);
  }
  return url.pathname + url.search + url.hash;
}

export function navigateToPublicRoute(
  path: string,
  label?: string,
  opts?: { tenantId?: string | null; festivalId?: string | null },
) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const target = withTenantPath(path, opts?.tenantId, opts?.festivalId);
  const transition = (window as any).__consoTransition;
  if (transition && typeof transition.go === 'function') {
    transition.go(target, label || 'Consolium');
  } else {
    window.location.assign(target);
  }
}

export function navigateBackFromCandidateSearch(opts: {
  tenantId?: string | null;
  festivalId?: string | null;
  fallbackNative?: () => void;
}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    opts.fallbackNative?.();
    return;
  }

  try {
    if (document.referrer) {
      const refUrl = new URL(document.referrer);
      if (refUrl.origin === window.location.origin) {
        const cleanPath = refUrl.pathname.replace(/\/+$/, '') || '/';
        const refLabel = PUBLIC_REFERRER_LABELS[cleanPath];
        if (refLabel) {
          const target = refUrl.pathname + refUrl.search + refUrl.hash;
          const transition = (window as any).__consoTransition;
          if (transition && typeof transition.go === 'function') {
            transition.go(target, refLabel);
          } else {
            window.location.assign(target);
          }
          return;
        }
      }
    }
  } catch {
    // Ignore invalid referrer values and fall back cleanly to Explore.
  }

  navigateToPublicRoute('/explore', 'Home', {
    tenantId: opts.tenantId,
    festivalId: opts.festivalId,
  });
}

export function navigateBackFromCandidateProfile(
  router: { canGoBack: () => boolean; back: () => void; replace: (arg: any) => void },
  opts: { tenantId?: string | null; festivalId?: string | null },
) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  const params: Record<string, string> = {};
  if (
    opts.tenantId
    && opts.tenantId !== DEFAULT_PUBLIC_TENANT_ID
    && opts.tenantId !== LEGACY_PUBLIC_TENANT_ALIAS
  ) {
    params.tenant_id = opts.tenantId;
  }
  if (opts.festivalId) {
    params.festival_id = opts.festivalId;
  }
  router.replace({ pathname: '/candidate-search', params });
}

interface PublicFestivalMenuProps {
  currentId?: 'find-me' | 'candidate-profile';
  tenantId?: string | null;
  festivalId?: string | null;
  onResetScroll?: () => void;
}

export function PublicFestivalMenu({
  currentId = 'find-me',
  tenantId,
  festivalId,
  onResetScroll,
}: PublicFestivalMenuProps) {
  const onResetScrollRef = useRef(onResetScroll);
  onResetScrollRef.current = onResetScroll;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;

    if (!document.getElementById('conso-pm-css')) {
      const style = document.createElement('style');
      style.id = 'conso-pm-css';
      style.textContent = SCOPED_MENU_CSS;
      document.head.appendChild(style);
    }

    const host = document.createElement('div');
    host.id = 'conso-pm-host';

    const openBtn = document.createElement('button');
    openBtn.className = 'conso-pm-btn';
    openBtn.type = 'button';
    openBtn.id = 'sub-menu-open';
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.setAttribute('aria-controls', 'conso-pm-drawer');
    openBtn.setAttribute('aria-label', 'Open menu');
    openBtn.innerHTML = '<span class="conso-pm-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';

    const drawer = document.createElement('div');
    drawer.className = 'conso-pm-drawer';
    drawer.id = 'conso-pm-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('aria-label', 'Festival navigation menu');

    const bandsHtml = `<div class="conso-pm-bands" aria-hidden="true">${BAND_COLORS.map((c) => `<i class="conso-pm-band" style="--c:${c}"></i>`).join('')}</div>`;
    const drawerItemsHtml = NAV_ITEMS.map((item, idx) => {
      const isHere = item.id === currentId;
      const here = isHere ? '<span class="conso-pm-here" data-pm-fade>Here</span>' : '';
      const glyphSvg = GLYPH_SVGS[idx % GLYPH_SVGS.length];
      return `
        <li class="conso-pm-item${isHere ? ' is-here' : ''}" style="--c:${item.c}">
          <a class="conso-pm-link" href="${withTenantPath(item.to, tenantId, festivalId)}" data-pm-id="${item.id}" data-pm-to="${item.to}" data-nav-label="${item.label}">
            <span class="conso-pm-no" data-pm-fade>${String(idx + 1).padStart(2, '0')}</span>
            <span class="conso-pm-label">
              <span class="conso-pm-mask">
                <span class="conso-pm-text">
                  ${item.label}
                  <span class="conso-pm-trail" aria-hidden="true"></span>
                  <span class="conso-pm-head" aria-hidden="true">${glyphSvg}</span>
                </span>
              </span>
            </span>
            ${here}
          </a>
        </li>
      `;
    }).join('');

    const chipsHtml = QUICK_CHIPS.map(([label, path]) => {
      const itemId = path === '/candidate-search' ? 'find-me' : '';
      return `<a class="conso-pm-chip" href="${withTenantPath(path, tenantId, festivalId)}" data-pm-id="${itemId}" data-pm-to="${path}" data-nav-label="${label}">${label}</a>`;
    }).join('');

    drawer.innerHTML = `
      ${bandsHtml}
      <div class="conso-pm-sheet">
        <div class="conso-pm-inner">
          <div class="conso-pm-pages">
            <div class="conso-pm-top" data-pm-fade>
              <span class="conso-pm-eyebrow">Consoulium 2k26 · Ayatic Codex</span>
              <button class="conso-pm-close" type="button" id="sub-menu-close">Close</button>
            </div>
            <ul class="conso-pm-list">${drawerItemsHtml}</ul>
          </div>
          <aside class="conso-pm-aside" data-pm-fade>
            <div class="conso-pm-group">
              <span class="conso-pm-eyebrow">Quick Sections</span>
              <div class="conso-pm-chips">${chipsHtml}</div>
            </div>
            <div class="conso-pm-event">
              <span class="conso-pm-eyebrow">Ayatic Codex · 5th Edition</span>
              <strong class="conso-pm-date">26 – 29 Nov 2026</strong>
              <span class="conso-pm-venue">Bukhari Campus, Kondotty</span>
            </div>
            <a class="conso-pm-portal" href="${withTenantPath('/candidate-search', tenantId, festivalId)}" id="sub-drawer-portal" data-pm-id="find-me" data-pm-to="/candidate-search" data-nav-label="Find Me">
              <span>Find Me</span>
              <span aria-hidden="true">→</span>
            </a>
          </aside>
        </div>
      </div>
    `;

    host.append(openBtn, drawer);
    document.body.appendChild(host);

    const closeBtn = drawer.querySelector('#sub-menu-close') as HTMLButtonElement | null;
    const sheet = drawer.querySelector('.conso-pm-sheet') as HTMLDivElement;
    const bands = Array.from(drawer.querySelectorAll('.conso-pm-band')) as HTMLElement[];
    const texts = Array.from(drawer.querySelectorAll('.conso-pm-text')) as HTMLElement[];
    const fades = Array.from(drawer.querySelectorAll('[data-pm-fade]')) as HTMLElement[];
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let seq = 0;

    const cancelAnims = () => {
      [sheet, ...bands, ...texts, ...fades].forEach((el) => {
        if (typeof el.getAnimations === 'function') {
          el.getAnimations().forEach((anim) => anim.cancel());
        }
      });
    };

    const setDrawer = (nextOpen: boolean) => {
      const mySeq = ++seq;
      cancelAnims();
      drawer.setAttribute('aria-hidden', String(!nextOpen));
      openBtn.setAttribute('aria-expanded', String(nextOpen));
      openBtn.setAttribute('aria-label', nextOpen ? 'Close menu' : 'Open menu');
      openBtn.classList.toggle('is-open', nextOpen);

      if (nextOpen) {
        drawer.classList.add('is-open', 'is-animating');
        if (reduced || typeof sheet.animate !== 'function') {
          sheet.style.clipPath = 'inset(0% 0% 0% 0%)';
          drawer.classList.remove('is-animating');
          closeBtn?.focus();
          return;
        }
        sheet.style.clipPath = 'inset(0% 0% 100% 0%)';
        const inAnims = bands.map((b, i) =>
          b.animate(
            [{ transform: 'translate3d(-101%, 0, 0)' }, { transform: 'translate3d(0, 0, 0)' }],
            { duration: 380, delay: i * 40, easing: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)', fill: 'forwards' },
          ),
        );
        Promise.all(inAnims.map((a) => a.finished))
          .then(() => {
            if (mySeq !== seq) return;
            sheet.style.clipPath = 'inset(0% 0% 0% 0%)';
            const outAnims = bands.map((b, i) =>
              b.animate(
                [{ transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(101%, 0, 0)' }],
                { duration: 480, delay: i * 40, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)', fill: 'forwards' },
              ),
            );
            texts.forEach((t, i) =>
              t.animate(
                [{ transform: 'translateY(115%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
                { duration: 700, delay: 30 + i * 38, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
              ),
            );
            fades.forEach((f, i) =>
              f.animate(
                [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
                { duration: 540, delay: 90 + i * 24, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
              ),
            );
            Promise.all(outAnims.map((a) => a.finished))
              .then(() => {
                if (mySeq !== seq) return;
                drawer.classList.remove('is-animating');
                closeBtn?.focus({ preventScroll: true });
              })
              .catch(() => {});
          })
          .catch(() => {});
      } else if (drawer.classList.contains('is-open')) {
        drawer.classList.remove('is-open');
        drawer.classList.add('is-animating');
        if (reduced || typeof sheet.animate !== 'function') {
          sheet.style.clipPath = 'inset(0% 0% 100% 0%)';
          drawer.classList.remove('is-animating');
          return;
        }
        texts.forEach((t, i) =>
          t.animate(
            [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-60%)', opacity: 0 }],
            { duration: 240, delay: i * 16, easing: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)', fill: 'forwards' },
          ),
        );
        fades.forEach((f) =>
          f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }),
        );
        const wipe = sheet.animate(
          [{ clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 100% 0%)' }],
          { duration: 420, delay: 90, easing: 'cubic-bezier(0.645, 0.045, 0.355, 1)', fill: 'forwards' },
        );
        wipe.finished
          .then(() => {
            if (mySeq !== seq) return;
            cancelAnims();
            sheet.style.clipPath = 'inset(0% 0% 100% 0%)';
            bands.forEach((b) => {
              b.style.transform = 'translate3d(-101%, 0, 0)';
            });
            drawer.classList.remove('is-animating');
          })
          .catch(() => {
            drawer.classList.remove('is-animating');
          });
      }
    };

    const onOpenClick = () => setDrawer(!drawer.classList.contains('is-open'));
    const onCloseClick = () => setDrawer(false);
    const onDrawerClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest?.('a[data-pm-to]') as HTMLAnchorElement | null;
      if (link) {
        e.preventDefault();
        const pmId = link.getAttribute('data-pm-id') || '';
        const pmTo = link.getAttribute('data-pm-to') || '/';
        const label = link.getAttribute('data-nav-label') || 'Consolium';
        if (pmId && pmId === currentId) {
          setDrawer(false);
          onResetScrollRef.current?.();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        setDrawer(false);
        navigateToPublicRoute(pmTo, label, { tenantId, festivalId });
        return;
      }
      if (e.target === drawer || e.target === sheet) {
        setDrawer(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) {
        setDrawer(false);
      }
    };

    openBtn.addEventListener('click', onOpenClick);
    closeBtn?.addEventListener('click', onCloseClick);
    drawer.addEventListener('click', onDrawerClick);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      cancelAnims();
      openBtn.removeEventListener('click', onOpenClick);
      closeBtn?.removeEventListener('click', onCloseClick);
      drawer.removeEventListener('click', onDrawerClick);
      document.removeEventListener('keydown', onKeyDown);
      host.remove();
    };
  }, [currentId, festivalId, tenantId]);

  return null;
}
