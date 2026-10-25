/** Build filter choices from the category values present in the current data. */
export const getCategoryFilterOptions = (values: unknown[]): string[] => {
  const categories = Array.from(new Set(
    values
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => typeof value === 'string' ? value.trim() : '')
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b));

  return ['All', ...categories];
};
