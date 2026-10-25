export function getTeamLeaderScheduleCategoryLabel(categoryCodes: string[] | null) {
  if (!Array.isArray(categoryCodes) || categoryCodes.length === 0) return 'Category not set';

  const labels = [...new Set(categoryCodes.map((code) => code.trim()).filter(Boolean))]
    .map((code) => ['GN', 'GENERAL'].includes(code.toUpperCase()) ? 'General' : code)
    .sort((left, right) => left === 'General' ? -1 : right === 'General' ? 1 : left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }));

  return labels.length ? labels.join(', ') : 'Category not set';
}
