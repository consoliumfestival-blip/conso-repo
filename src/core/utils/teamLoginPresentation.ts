/** Names are display-only hints, never used for authentication or team ownership. */
export function teamLoginPath(festivalName?: string | null, teamName?: string | null) {
  const params = new URLSearchParams();
  if (festivalName?.trim()) params.set('festival', festivalName.trim().slice(0, 160));
  if (teamName?.trim()) params.set('team', teamName.trim().slice(0, 160));
  return `/team/login${params.size ? `?${params}` : ''}`;
}
export function loginDisplayName(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 160) || '';
}
