export const FESTIVAL_TEMPLATES = ['sahithyolsav', 'college_fest'] as const;

export type FestivalTemplate = typeof FESTIVAL_TEMPLATES[number];

export const DEFAULT_FESTIVAL_TEMPLATE: FestivalTemplate = 'sahithyolsav';

export const COLLEGE_FEST_CATEGORY_CODES = [
  'SUB_JUNIOR',
  'JUNIOR',
  'SENIOR',
] as const;

export type CollegeFestCategoryCode = typeof COLLEGE_FEST_CATEGORY_CODES[number];

export type FestivalCategoryMode = 'auto' | 'manual';

const COLLEGE_FEST_CATEGORY_LABELS: Record<CollegeFestCategoryCode, string> = {
  SUB_JUNIOR: 'Sub Junior',
  JUNIOR: 'Junior',
  SENIOR: 'Senior',
};

const COLLEGE_FEST_CHEST_PREFIXES: Record<CollegeFestCategoryCode, string> = {
  SUB_JUNIOR: 'SJ',
  JUNIOR: 'JR',
  SENIOR: 'SR',
};

export function isFestivalTemplate(value: unknown): value is FestivalTemplate {
  return typeof value === 'string'
    && (FESTIVAL_TEMPLATES as readonly string[]).includes(value);
}

export function isCollegeFestTemplate(template: unknown): template is 'college_fest' {
  return template === 'college_fest';
}

export function isCollegeFestCategory(value: unknown): value is CollegeFestCategoryCode {
  return typeof value === 'string'
    && (COLLEGE_FEST_CATEGORY_CODES as readonly string[]).includes(value);
}

export function getCollegeFestCategoryLabel(code: CollegeFestCategoryCode): string {
  return COLLEGE_FEST_CATEGORY_LABELS[code];
}

export function getCollegeFestChestPrefix(code: CollegeFestCategoryCode): string {
  return COLLEGE_FEST_CHEST_PREFIXES[code];
}

export function normalizeCollegeFestCategoryInput(
  value: unknown,
): CollegeFestCategoryCode | null {
  if (typeof value !== 'string') return null;

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  return isCollegeFestCategory(normalized) ? normalized : null;
}

export function getFestivalCategoryMode(template: FestivalTemplate): FestivalCategoryMode {
  if (!isFestivalTemplate(template)) {
    throw new Error(`Unsupported festival template: ${String(template)}`);
  }

  return isCollegeFestTemplate(template) ? 'manual' : 'auto';
}
