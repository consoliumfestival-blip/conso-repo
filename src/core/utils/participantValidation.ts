import { supabase } from '../config/supabase';
import type {
  CollegeFestCategoryCode,
  FestivalTemplate,
} from '../festival/templatePolicy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SahithyolsavCategoryCode =
  | 'LP'
  | 'UP'
  | 'HS'
  | 'HSS'
  | 'JUNIOR'
  | 'SENIOR'
  | 'CAMPUS'
  | 'GENERAL';

export type CategoryCode<
  TTemplate extends FestivalTemplate = 'sahithyolsav',
> = TTemplate extends 'college_fest'
  ? CollegeFestCategoryCode
  : SahithyolsavCategoryCode;

export type FestivalCategoryCode = CategoryCode<FestivalTemplate>;

export type EducationType =
  | 'degree'
  | 'pg'
  | 'iti'
  | 'polytechnic'
  | 'poly'
  | 'ded'
  | 'bed'
  | string;

export interface ParticipantData {
  /** Standard (1–12) – required for class-based categories */
  class_std?: number | string | null;
  /** ISO date string 'YYYY-MM-DD' */
  dob?: string | null;
  /** Education type – triggers CAMPUS override when college-level */
  education_type?: EducationType | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default festival year – used when not explicitly provided.
 *  Change this to the current festival year when deploying. */
export const DEFAULT_FESTIVAL_YEAR = 2026;

/** Education types that map to CAMPUS category */
const CAMPUS_EDUCATION_TYPES = new Set([
  'degree', 'pg', 'iti', 'polytechnic', 'poly', 'ded', 'bed',
  'd.ed', 'b.ed',
]);

// ---------------------------------------------------------------------------
// Core Date Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the cutoff date for a given festival year.
 *   getCutoffDate(2025) → Date('2025-05-31')
 *   getCutoffDate(2026) → Date('2026-05-31')
 */
export function getCutoffDate(festivalYear: number = DEFAULT_FESTIVAL_YEAR): Date {
  return new Date(`${festivalYear}-05-31`);
}

/**
 * Returns the oldest allowed DOB for a given max age.
 *   getDOBLimit(2025, 20) → Date('2005-05-31')  (born AFTER this to qualify)
 *   getDOBLimit(2026, 20) → Date('2006-05-31')
 *
 * A participant is eligible only if dob > getDOBLimit(year, maxAge).
 * DOB exactly ON the limit → NOT eligible (strict '>').
 */
export function getDOBLimit(festivalYear: number, maxAge: number): Date {
  return new Date(`${festivalYear - maxAge}-05-31`);
}

/**
 * Returns the exact DOB range (from/to) for JUNIOR and SENIOR categories based on festival year.
 */
export function getCategoryDOBRange(
  category: 'JUNIOR' | 'SENIOR',
  festivalYear: number = DEFAULT_FESTIVAL_YEAR
): { minDOB: Date; maxDOB: Date; label: string } {
  const formatTextDate = (d: Date) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${d.getDate().toString().padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  if (category === 'JUNIOR') {
    // Born AFTER 31 May of (festivalYear - 20) and ON or BEFORE 31 May of (festivalYear - 15)
    const minDOB = new Date(`${festivalYear - 20}-05-31`);
    const maxDOB = new Date(`${festivalYear - 15}-05-31`);
    const dayAfterMin = new Date(minDOB);
    dayAfterMin.setDate(dayAfterMin.getDate() + 1);

    const label = `${formatTextDate(dayAfterMin)} to ${formatTextDate(maxDOB)}`;
    return { minDOB, maxDOB, label };
  } else {
    // Born AFTER 31 May of (festivalYear - 26) and ON or BEFORE 31 May of (festivalYear - 20)
    const minDOB = new Date(`${festivalYear - 26}-05-31`);
    const maxDOB = new Date(`${festivalYear - 20}-05-31`);
    const dayAfterMin = new Date(minDOB);
    dayAfterMin.setDate(dayAfterMin.getDate() + 1);

    const label = `${formatTextDate(dayAfterMin)} to ${formatTextDate(maxDOB)}`;
    return { minDOB, maxDOB, label };
  }
}


// ---------------------------------------------------------------------------
// Utility: Age Calculation (as of cutoff date)
// ---------------------------------------------------------------------------

/**
 * Calculates completed years of age as of the cutoff date for the given festival year.
 */
export function calculateAge(
  dob: string,
  festivalYear: number = DEFAULT_FESTIVAL_YEAR
): number {
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) {
    throw new Error('Invalid date of birth provided.');
  }

  const cutoff = getCutoffDate(festivalYear);
  let age = cutoff.getFullYear() - birth.getFullYear();
  const monthDiff = cutoff.getMonth() - birth.getMonth();
  const dayDiff   = cutoff.getDate()  - birth.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}

// ---------------------------------------------------------------------------
// Core: Category Determination
// ---------------------------------------------------------------------------

/**
 * Determines the correct category for a participant using Niyamavali rules.
 *
 * Priority order:
 *  1. CAMPUS  – education_type is college-level
 *  2. SENIOR  – dob > (year-25)-05-31  AND  dob <= (year-21)-05-31  [age 21–25]
 *  3. JUNIOR  – dob > (year-20)-05-31                                [age 15–20]
 *  4. LP/UP/HS/HSS – class-based fallback
 *
 * NOTE: SENIOR is checked BEFORE JUNIOR to prevent misclassification.
 * DOB exactly ON the boundary date → NOT eligible (strict comparison).
 */
export function getCategory(
  data: ParticipantData,
  festivalYear: number = DEFAULT_FESTIVAL_YEAR
): SahithyolsavCategoryCode {
  const { class_std, dob, education_type } = data;

  // ── 1. CAMPUS override ────────────────────────────────────────────────────
  const eduLower = (education_type ?? '').toString().trim().toLowerCase();
  if (CAMPUS_EDUCATION_TYPES.has(eduLower)) {
    return 'CAMPUS';
  }

  // ── 2. Class-based (school students) ─────────────────────────────────────
  // If class_std is provided, the participant is a school student.
  // School students always get their class-based category (LP/UP/HS/HSS),
  // regardless of age. JUNIOR/SENIOR are only for post-school participants.
  const cls = typeof class_std === 'string'
    ? parseInt(class_std, 10)
    : (class_std ?? NaN);

  if (!isNaN(cls)) {
    if (cls >= 1  && cls <= 4)  return 'LP';
    if (cls >= 5  && cls <= 7)  return 'UP';
    if (cls >= 8  && cls <= 10) return 'HS';
    if (cls >= 11 && cls <= 12) return 'HSS';
  }

  // ── 3. Age-based JUNIOR / SENIOR (no class provided) ─────────────────────
  if (dob) {
    const dobDate = new Date(dob);
    if (isNaN(dobDate.getTime())) {
      throw new Error('Invalid date of birth provided.');
    }

    const juniorLimit = getDOBLimit(festivalYear, 20); // (year-20)-05-31  → age 20 pivot
    const seniorLimit = getDOBLimit(festivalYear, 26); // (year-26)-05-31  → age 25 included (max SENIOR)
    const youngLimit  = getDOBLimit(festivalYear, 15); // (year-15)-05-31  → age 15 included (min JUNIOR)

    // SENIOR first (age 20–25)
    if (dobDate > seniorLimit && dobDate <= juniorLimit) {
      return 'SENIOR';
    }

    // JUNIOR (age 15–19)
    if (dobDate > juniorLimit && dobDate <= youngLimit) {
      return 'JUNIOR';
    }
  }

  throw new Error(
    'Category could not be determined. Please provide a valid DOB, class (1–12), or education type.'
  );
}

// ---------------------------------------------------------------------------
// Validation: Class-Age Consistency
// ---------------------------------------------------------------------------

/**
 * Expected age ranges for each class group.
 * These are approximate but catch obvious mismatches
 * (e.g. a 10-year-old in class 11 is impossible).
 */
const CLASS_CATEGORY_AGE_RANGES: Record<string, [number, number]> = {
  LP:  [5,  12],
  UP:  [9,  14],
  HS:  [12, 17],
  HSS: [15, 20],
};

/**
 * Returns a warning message if age doesn't match the class category.
 * Returns null if everything is fine.
 *
 * Example: age 10 + class 11/12 (HSS) → returns warning string.
 */
export function checkClassAgeConsistency(
  classCategoryCode: string,
  age: number
): string | null {
  const range = CLASS_CATEGORY_AGE_RANGES[classCategoryCode.toUpperCase()];
  if (!range) return null;
  const [min, max] = range;
  if (age < min || age > max) {
    return `⚠️ Age ${age} doesn't match ${classCategoryCode} class (expected age ${min}–${max}). Please verify DOB and class.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Validation: Full Participant
// ---------------------------------------------------------------------------

/**
 * Validates a participant and returns their resolved category.
 * Throws descriptive errors for invalid data.
 */
export function validateParticipant(
  data: ParticipantData,
  festivalYear: number = DEFAULT_FESTIVAL_YEAR
): SahithyolsavCategoryCode {

  // ── Step 1: Determine category first ──────────────────────────────────────
  // For CAMPUS and class-based, DOB is NOT required.
  // For JUNIOR/SENIOR, we need DOB to resolve the category.
  const category = getCategory(data, festivalYear);

  // ── Step 2: CAMPUS — education type wins regardless of age ────────────────
  if (category === 'CAMPUS') {
    // If DOB is provided, at least verify it's realistic for college
    if (data.dob) {
      const dobDate = new Date(data.dob);
      if (!isNaN(dobDate.getTime())) {
        const age = calculateAge(data.dob, festivalYear);
        if (age < 15) {
          throw new Error(
            `⚠️ Age ${age} is too young for college. CAMPUS category requires minimum age 15.`
          );
        }
      }
    }
    // Note: CAMPUS overrides JUNIOR/SENIOR — a 20-year-old in Degree is CAMPUS, not SENIOR.
    return category;
  }

  if (['LP', 'UP', 'HS', 'HSS'].includes(category)) {
    // DOB is optional for school students
    if (data.dob) {
      const dobDate = new Date(data.dob);
      if (!isNaN(dobDate.getTime())) {
        const age = calculateAge(data.dob, festivalYear);
        const warning = checkClassAgeConsistency(category, age);
        if (warning) throw new Error(warning);
      }
    }
    return category;
  }

  // ── Step 3: JUNIOR / SENIOR — DOB is mandatory ────────────────────────────
  if (!data.dob) {
    throw new Error('Date of Birth (DOB) is required for JUNIOR / SENIOR category.');
  }

  const dobDate = new Date(data.dob);
  if (isNaN(dobDate.getTime())) {
    throw new Error('Invalid date of birth provided.');
  }

  // Verify against exact DOB cutoff bounds
  const { minDOB, maxDOB, label } = getCategoryDOBRange(category as 'JUNIOR' | 'SENIOR', festivalYear);
  if (dobDate <= minDOB || dobDate > maxDOB) {
    throw new Error(
      `⚠️ Date of birth is not valid for ${category} category. Eligibility: ${label}.`
    );
  }

  return category;
}

// ---------------------------------------------------------------------------
// Validation: Max Events
// ---------------------------------------------------------------------------

export function validateMaxEvents(events: any[]) {
  if (events && events.length > 4) {
    throw new Error('Maximum 4 events per participant allowed.');
  }
}

// ---------------------------------------------------------------------------
// Validation: Age vs Category (legacy helper – kept for backward compat)
// ---------------------------------------------------------------------------

/** @deprecated Use validateParticipant() instead. */
export function validateAgeCategory(age: number | undefined, category: string) {
  if (age === undefined || isNaN(age)) return;

  const ranges: Record<string, [number, number]> = {
    LP:     [5,  14],
    UP:     [10, 14],
    HS:     [13, 17],
    HSS:    [16, 18],
    JUNIOR: [15, 20],
    SENIOR: [21, 25],
    CAMPUS: [18, 30],
    JR:     [15, 20],
    SR:     [21, 25],
    CA:     [18, 30],
  };

  const key = category.toUpperCase();
  const [min, max] = ranges[key] || [0, 100];

  if (age < min || age > max) {
    throw new Error(
      `Age ${age} is not valid for category ${category}. Allowed range: ${min}–${max}.`
    );
  }
}

// ---------------------------------------------------------------------------
// Validation: Unique Events
// ---------------------------------------------------------------------------

export function validateUniqueEvents(events: string[]) {
  const set = new Set(events);
  if (set.size < events.length) {
    throw new Error('Duplicate events selected.');
  }
}

// ---------------------------------------------------------------------------
// Validation: No Duplicate Participant (async – DB check)
// ---------------------------------------------------------------------------

export async function validateNoDuplicate(
  name: string,
  phone: string | undefined,
  unitOrgId: string
) {
  let query = supabase
    .from('participants')
    .select('id')
    .eq('unit_org_id', unitOrgId);

  if (phone) {
    query = query.or(`name.eq.${name},phone.eq.${phone}`);
  } else {
    query = query.eq('name', name);
  }

  const { data, error } = await query;
  if (error) throw new Error('Database check failed: ' + error.message);

  if (data && data.length > 0) {
    throw new Error('Duplicate participant or contact already exists in this unit.');
  }
}
