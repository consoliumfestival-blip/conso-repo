export function isGeneralCategoryCode(value?: string | null): boolean {
  const code = String(value ?? '').trim().toUpperCase();
  return code === 'GN' || code === 'GENERAL';
}
