export type DynamicPortal = 'team' | 'stage' | 'candidate';

const cleanLabel = (value: string | null, fallback: string) => {
  const cleaned = (value || fallback).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return Array.from(cleaned || fallback).slice(0, 80).join('');
};

const shortLabel = (value: string) => {
  const chars = Array.from(value);
  if (chars.length <= 12) return value;
  return `${chars.slice(0, 11).join('').trimEnd()}…`;
};

export function createPortalManifest(url: URL, portalValue: string | null) {
  if (portalValue !== 'team' && portalValue !== 'stage' && portalValue !== 'candidate') return null;

  const portal: DynamicPortal = portalValue;
  const fallbackName =
    portal === 'team'
      ? 'Team Portal'
      : portal === 'stage'
        ? 'Stage Management'
        : 'Candidate Profile';
  const name = cleanLabel(url.searchParams.get('name'), fallbackName);
  const identity = cleanLabel(url.searchParams.get('identity'), portal);
  const appId = `/${portal}/${encodeURIComponent(identity)}`;

  const startUrl = (() => {
    if (portal === 'team') {
      return new URL('/team/login?installedPortal=team-leader', url.origin).toString();
    }
    if (portal === 'stage') {
      return new URL(`/stage-management/venue/${encodeURIComponent(identity)}`, url.origin).toString();
    }
    const candidateUrl = new URL(`/candidate/${encodeURIComponent(identity)}`, url.origin);
    candidateUrl.searchParams.set('installedPortal', 'candidate');
    const tenantId = url.searchParams.get('tenant_id');
    const festivalId = url.searchParams.get('festival_id');
    if (tenantId) candidateUrl.searchParams.set('tenant_id', tenantId);
    if (festivalId) candidateUrl.searchParams.set('festival_id', festivalId);
    return candidateUrl.toString();
  })();

  const scopePath =
    portal === 'team' ? '/team/' : portal === 'stage' ? '/stage-management/' : '/candidate/';
  const icon = (path: string) => new URL(path, url.origin).toString();

  return {
    id: appId,
    name,
    short_name: shortLabel(name),
    start_url: startUrl,
    scope: `${url.origin}${scopePath}`,
    display: 'standalone',
    ...(portal === 'team' ? { display_override: ['fullscreen', 'standalone'], orientation: 'any' } : {}),
    background_color: portal === 'team' ? '#1D1B19' : portal === 'candidate' ? '#FAFBFD' : '#ffffff',
    theme_color: portal === 'team' ? '#1D1B19' : portal === 'candidate' ? '#FAFBFD' : '#ffffff',
    icons: [
      { src: icon('/brand/consolium-icon-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon('/brand/consolium-icon-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon('/brand/consolium-maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
