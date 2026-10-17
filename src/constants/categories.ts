import {
  getCollegeFestCategoryLabel,
  normalizeCollegeFestCategoryInput,
  type FestivalTemplate,
} from '../core/festival/templatePolicy';

export const CATEGORIES = [
  {
    code: "SBJ",
    name_en: "Sub Junior",
    name_ml: "Sub Junior",
    age_max: 14,
    gender: "boys"
  },
  {
    code: 'LP',
    name_en: 'Lower Primary',
    name_ml: 'ലോവർ പ്രൈമറി',
    class_min: 1,
    class_max: 4,
    gender: 'both'
  },
  {
    code: 'UP',
    name_en: 'Upper Primary',
    name_ml: 'അപ്പർ പ്രൈമറി',
    class_min: 5,
    class_max: 7,
    gender: 'both'
  },
  {
    code: 'HS',
    name_en: 'High School',
    name_ml: 'ഹൈസ്കൂൾ',
    class_min: 8,
    class_max: 10,
    gender: 'both'
  },
  {
    code: 'HSS',
    name_en: 'Higher Secondary',
    name_ml: 'ഹയർ സെക്കണ്ടറി',
    class_min: 11, // +1
    class_max: 12, // +2
    gender: 'both'
  },
  {
    code: "JR",
    name_en: "Junior",
    name_ml: "Junior",
    age_min: 15,
    age_max: 20,
    gender: 'boys'
  },
  {
    code: "SR",
    name_en: "Senior",
    name_ml: "Senior",
    age_min: 21,
    age_max: 25,
    gender: 'boys'
  },
  {
    code: 'GN',
    name_en: 'General',
    name_ml: 'ജനറൽ',
    age_max: 25,
    gender: 'both'
  },
  {
    code: 'CA',
    name_en: 'Campus',
    name_ml: 'കാമ്പസ്',
    class_min: 8,
    class_max: 10,
    notes: 'Regular Campus',
    gender: 'both'
  },
  {
    code: 'CG',
    name_en: 'Campus Girls',
    name_ml: 'കാമ്പസ് ഗേൾസ്',
    gender: 'girls'
  },
  {
    code: 'CGP',
    name_en: 'Campus Girls Parallel',
    name_ml: 'കാമ്പസ് ഗേൾസ് പാരലൽ',
    notes: 'Parallel Campus',
    gender: 'girls'
  }
];

export const SAHITHYOLSAV_CATEGORY_ALIASES: Record<string, string> = {
  SBJ: "SBJ",
  SUB_JUNIOR: "SBJ",
  JNR: "JR",
  SNR: "SR",
  JUNIOR: "JR",
  SENIOR: "SR",
  CAMPUS: "CA",
  GENERAL: "GN",
};

export function getCategoryLabel(code: string, template?: FestivalTemplate): string {
  if (template === 'college_fest') {
    const normalizedCode = normalizeCollegeFestCategoryInput(code);
    return normalizedCode ? getCollegeFestCategoryLabel(normalizedCode) : code;
  }

  const normalizedCode = code.trim().toUpperCase();
  const lookupCode = SAHITHYOLSAV_CATEGORY_ALIASES[normalizedCode] ?? normalizedCode;
  return CATEGORIES.find((category) => category.code === lookupCode)?.name_en ?? code;
}
