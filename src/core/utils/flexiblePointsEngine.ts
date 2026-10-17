export type PointsMode = 'official' | 'hybrid' | 'custom';
export type Rule12Behavior = 'grade_only' | 'rank_and_grade' | 'no_points';

export type GradeThresholds = {
  aPlus: number;
  a: number;
  b: number;
  c: number;
};

export type PointBracket = {
  key: string;
  label: string;
  min: number;
  max: number | null;
  points: [number, number, number, number];
  enabled: boolean;
};

export type FlexiblePointsConfig = {
  mode: PointsMode;
  rankPoints: [number, number, number];
  thresholds: GradeThresholds;
  brackets: PointBracket[];
  groupBrackets: PointBracket[];
  separateGroupBrackets: boolean;
  autoBracketSelection: boolean;
  allowBracketOverride: boolean;
  rule12Enabled: boolean;
  rule12MinTeams: number;
  rule12Behavior: Rule12Behavior;
  enableGraceMarks: boolean;
  version: number;
};

export const OFFICIAL_POINT_BRACKETS: PointBracket[] = [
  { key: '1', label: '1', min: 1, max: 1, points: [6, 5, 3, 1], enabled: true },
  { key: '2', label: '2', min: 2, max: 2, points: [7, 6, 4, 2], enabled: true },
  { key: '3', label: '3', min: 3, max: 3, points: [10, 9, 6, 3], enabled: true },
  { key: '4-5', label: '4–5', min: 4, max: 5, points: [18, 15, 10, 5], enabled: true },
  { key: '6-10', label: '6–10', min: 6, max: 10, points: [25, 20, 12, 6], enabled: true },
];

const cloneBrackets = (brackets: PointBracket[]) =>
  brackets.map((bracket) => ({ ...bracket, points: [...bracket.points] as PointBracket['points'] }));

const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBracket = (value: any, index: number): PointBracket => {
  const fallback = OFFICIAL_POINT_BRACKETS[index] ?? {
    key: String(index + 1),
    label: String(index + 1),
    min: index + 1,
    max: index + 1,
    points: [0, 0, 0, 0] as PointBracket['points'],
    enabled: true,
  };
  const rawPoints = Array.isArray(value?.points) ? value.points : fallback.points;
  return {
    key: String(value?.key ?? fallback.key),
    label: String(value?.label ?? fallback.label),
    min: Math.max(1, Math.trunc(toFiniteNumber(value?.min, fallback.min))),
    max: value?.max === null
      ? null
      : Math.max(1, Math.trunc(toFiniteNumber(value?.max, fallback.max ?? fallback.min))),
    points: [
      toFiniteNumber(rawPoints[0], fallback.points[0]),
      toFiniteNumber(rawPoints[1], fallback.points[1]),
      toFiniteNumber(rawPoints[2], fallback.points[2]),
      toFiniteNumber(rawPoints[3], fallback.points[3]),
    ],
    enabled: value?.enabled !== false,
  };
};

const parseBrackets = (value: unknown, fallback: PointBracket[]) => {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return cloneBrackets(fallback);
  return parsed.map(normalizeBracket).sort((a, b) => a.min - b.min);
};

export const normalizePointsConfig = (config?: any): FlexiblePointsConfig => {
  const mode: PointsMode =
    config?.points_mode === 'official' || config?.points_mode === 'custom'
      ? config.points_mode
      : 'hybrid';
  const useOfficialValues = mode === 'official';
  const thresholds = config?.grade_thresholds ?? {};

  return {
    mode,
    rankPoints: [
      useOfficialValues ? 5 : toFiniteNumber(config?.rank_1_points, 5),
      useOfficialValues ? 3 : toFiniteNumber(config?.rank_2_points, 3),
      useOfficialValues ? 1 : toFiniteNumber(config?.rank_3_points, 1),
    ],
    thresholds: {
      aPlus: useOfficialValues ? 90 : toFiniteNumber(thresholds.a_plus ?? config?.grade_a_plus_min, 90),
      a: useOfficialValues ? 75 : toFiniteNumber(thresholds.a ?? config?.grade_a_min, 75),
      b: useOfficialValues ? 60 : toFiniteNumber(thresholds.b ?? config?.grade_b_min, 60),
      c: useOfficialValues ? 50 : toFiniteNumber(thresholds.c ?? config?.grade_c_min, 50),
    },
    brackets: useOfficialValues
      ? cloneBrackets(OFFICIAL_POINT_BRACKETS)
      : parseBrackets(config?.point_brackets, OFFICIAL_POINT_BRACKETS),
    groupBrackets: parseBrackets(
      config?.group_point_brackets,
      config?.point_brackets
        ? parseBrackets(config.point_brackets, OFFICIAL_POINT_BRACKETS)
        : OFFICIAL_POINT_BRACKETS,
    ),
    separateGroupBrackets: !useOfficialValues && config?.separate_group_brackets === true,
    autoBracketSelection: useOfficialValues || config?.auto_bracket_selection !== false,
    allowBracketOverride: !useOfficialValues && config?.allow_bracket_override !== false,
    rule12Enabled: useOfficialValues || config?.less_than_3_teams_rule !== false,
    rule12MinTeams: useOfficialValues
      ? 3
      : Math.max(1, Math.trunc(toFiniteNumber(config?.rule12_min_teams, 3))),
    rule12Behavior: useOfficialValues
      ? 'grade_only'
      : config?.rule12_behavior === 'rank_and_grade' || config?.rule12_behavior === 'no_points'
        ? config.rule12_behavior
        : 'grade_only',
    enableGraceMarks: config?.enable_grace_marks === true,
    version: Math.max(1, Math.trunc(toFiniteNumber(config?.config_version, 1))),
  };
};

export const calculateGradeFromConfig = (
  totalMark: number,
  maxMark: number,
  config: FlexiblePointsConfig,
): string | null => {
  if (maxMark <= 0 || !Number.isFinite(totalMark)) return null;
  const percentage = (totalMark / maxMark) * 100;
  if (percentage >= config.thresholds.aPlus) return 'A+';
  if (percentage >= config.thresholds.a) return 'A';
  if (percentage >= config.thresholds.b) return 'B';
  if (percentage >= config.thresholds.c) return 'C';
  return null;
};

export const resolvePointBracket = (
  config: FlexiblePointsConfig,
  participantCount: number,
  isGroup: boolean,
  overrideKey?: string | null,
) => {
  const brackets =
    isGroup && config.separateGroupBrackets ? config.groupBrackets : config.brackets;
  const enabled = brackets.filter((bracket) => bracket.enabled);

  if (overrideKey && config.allowBracketOverride) {
    const override = enabled.find((bracket) => bracket.key === overrideKey);
    if (override) return override;
  }

  const exact = enabled.find((bracket) =>
    participantCount >= bracket.min
    && (bracket.max === null || participantCount <= bracket.max));
  if (exact) return exact;

  const lower = [...enabled]
    .filter((bracket) => bracket.min <= participantCount)
    .sort((a, b) => b.min - a.min)[0];
  return lower ?? enabled[0] ?? null;
};

const gradeIndex = (grade: string | null) =>
  grade === 'A+' ? 0 : grade === 'A' ? 1 : grade === 'B' ? 2 : grade === 'C' ? 3 : -1;

export const calculateFlexiblePoints = ({
  grade,
  rank,
  groupSize,
  competingTeamsCount,
  isGroup,
  config,
  bracketOverride,
}: {
  grade: string | null;
  rank: number | null;
  /** How many members per team entry (determines the point bracket) */
  groupSize: number;
  /** How many teams competed in this event (used for Rule 12 check) */
  competingTeamsCount: number;
  isGroup: boolean;
  config: FlexiblePointsConfig;
  bracketOverride?: string | null;
}) => {
  // Bracket is resolved from groupSize (team composition), not from number of competitors
  const bracket = resolvePointBracket(config, groupSize, isGroup, bracketOverride);
  const index = gradeIndex(grade);
  const gradePoints = index >= 0 && bracket
    ? bracket.points[index as 0 | 1 | 2 | 3] ?? 0
    : 0;
  // Rule 12 uses competingTeamsCount (how many teams actually competed)
  const rule12Applies = config.rule12Enabled && competingTeamsCount < config.rule12MinTeams;

  let rankPoints = rank === 1
    ? config.rankPoints[0]
    : rank === 2
      ? config.rankPoints[1]
      : rank === 3
        ? config.rankPoints[2]
        : 0;
  let appliedGradePoints = gradePoints;

  if (rule12Applies) {
    if (config.rule12Behavior === 'grade_only') rankPoints = 0;
    if (config.rule12Behavior === 'no_points') {
      rankPoints = 0;
      appliedGradePoints = 0;
    }
  }

  return {
    total: rankPoints + appliedGradePoints,
    rankPoints,
    gradePoints: appliedGradePoints,
    bracketKey: bracket?.key ?? null,
    bracketLabel: bracket?.label ?? null,
    rule12Applies,
    gradeOnly: rule12Applies && config.rule12Behavior === 'grade_only',
    configVersion: config.version,
  };

};

export const validateFlexiblePointsConfig = (config: FlexiblePointsConfig): string[] => {
  const errors: string[] = [];
  const { aPlus, a, b, c } = config.thresholds;

  if (![aPlus, a, b, c].every((value) => value >= 0 && value <= 100)) {
    errors.push('Grade thresholds must be between 0 and 100.');
  }
  if (!(aPlus > a && a > b && b > c)) {
    errors.push('Grade thresholds must follow A+ > A > B > C.');
  }
  if (config.rankPoints.some((value) => value < 0)) {
    errors.push('Rank points cannot be negative.');
  }
  if (config.rule12MinTeams < 1) {
    errors.push('Rule 12 minimum team count must be at least 1.');
  }

  const validateBrackets = (brackets: PointBracket[], label: string) => {
    const enabled = brackets.filter((bracket) => bracket.enabled).sort((x, y) => x.min - y.min);
    if (enabled.length === 0) {
      errors.push(`${label} must contain at least one enabled bracket.`);
      return;
    }
    enabled.forEach((bracket, index) => {
      if (bracket.max !== null && bracket.max < bracket.min) {
        errors.push(`${label} bracket "${bracket.label}" has an invalid range.`);
      }
      if (bracket.points.some((point) => point < 0)) {
        errors.push(`${label} bracket "${bracket.label}" contains negative points.`);
      }
      const previous = enabled[index - 1];
      if (previous && (previous.max === null || previous.max >= bracket.min)) {
        errors.push(`${label} brackets "${previous.label}" and "${bracket.label}" overlap.`);
      }
    });
  };

  validateBrackets(config.brackets, 'Participant');
  if (config.separateGroupBrackets) validateBrackets(config.groupBrackets, 'Group');
  return errors;
};
