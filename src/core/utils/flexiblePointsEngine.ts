export type PointsMode = 'official' | 'hybrid' | 'custom';
export type Rule12Behavior = 'grade_only' | 'rank_and_grade' | 'no_points';
export type GradeThresholds = { aPlus: number; a: number; b: number; c: number };
export type GradePoints = [number, number, number, number];
export type PointBracket = { key: string; label: string; min: number; max: number | null; points: GradePoints; enabled: boolean };
export type GraceField = { id: string; name: string; maxMarks: number };
export type GradeBoostSection = { id: string; itemIds: string[]; points: Record<string, GradePoints>; groupPoints: Record<string, GradePoints> };
export type RankBoostSection = { id: string; itemIds: string[]; points: [number, number, number] };
export type PointsProfile = 'baseline' | 'grade_boost' | 'rank_boost' | 'both';
export type FlexiblePointsConfig = {
  mode: PointsMode; rankPoints: [number, number, number]; thresholds: GradeThresholds;
  brackets: PointBracket[]; groupBrackets: PointBracket[]; separateGroupBrackets: boolean;
  gradeBoostEnabled: boolean; rankBoostEnabled: boolean; memberBracketsEnabled: boolean;
  autoBracketSelection: boolean; allowBracketOverride: boolean; rule12Enabled: boolean;
  rule12MinTeams: number; rule12Behavior: Rule12Behavior | null; enableGraceMarks: boolean; version: number;
  gradeBoostPoints: Record<string, GradePoints>; groupGradeBoostPoints: Record<string, GradePoints>;
  rankBoostPoints: [number, number, number]; gradeBoostItemIds: string[]; rankBoostItemIds: string[];
  gradeBoostSections: GradeBoostSection[]; rankBoostSections: RankBoostSection[];
  graceFields: GraceField[];
};
// NaN represents a missing editor input, never an award. Validation must succeed before save/calculation.
export const configurationNumber = (value: unknown): number => {
  if (value === null || value === undefined || String(value).trim() === '') return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};
export const displayConfigurationNumber = (value: number) => Number.isFinite(value) ? String(value) : '';
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const gradePoints = (value: unknown): GradePoints =>
  [0, 1, 2, 3].map(index => configurationNumber(array(value)[index])) as GradePoints;
const parseBrackets = (value: unknown): PointBracket[] => array(value).map(row => ({
  key: String(row.key ?? ''), label: String(row.label ?? ''),
  min: configurationNumber(row.min), max: row.max === null ? null : configurationNumber(row.max),
  points: gradePoints(row.points), enabled: row.enabled !== false,
}));
const singleDefaultBracket = (rows: PointBracket[]): PointBracket[] => {
  const keys = rows.map(row => row.key);
  const validRows = rows.every(row => row.key && Number.isSafeInteger(row.min) && row.min >= 1 &&
    (row.max === null || (Number.isSafeInteger(row.max) && row.max >= row.min)));
  if (!validRows || new Set(keys).size !== keys.length) return rows;
  const enabled = rows.filter(row => row.enabled).sort((left, right) => left.min - right.min || left.key.localeCompare(right.key));
  const selected = enabled[0];
  return selected ? [{ ...selected, label: 'Default grade points', min: 1, max: null, enabled: true }] : rows;
};
const boostMap = (value: any): Record<string, GradePoints> => Object.fromEntries(
  Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
    .map(([key, points]) => [key, gradePoints(points)]),
);
const keepDefaultPointMap = (value: any, key: string | undefined): Record<string, GradePoints> => {
  const parsed = boostMap(value);
  return key && Object.prototype.hasOwnProperty.call(parsed, key) ? { [key]: parsed[key] } : {};
};
export const normalizePointsConfig = (record?: any): FlexiblePointsConfig => {
  const brackets = singleDefaultBracket(parseBrackets(record?.point_brackets));
  const separateGroupBrackets = record?.separate_group_brackets === true;
  const groupBrackets = separateGroupBrackets ? singleDefaultBracket(parseBrackets(record?.group_point_brackets)) : brackets;
  const participantKey = brackets.find(bracket => bracket.enabled)?.key;
  const groupKey = groupBrackets.find(bracket => bracket.enabled)?.key;
  const gradeBoostPoints = keepDefaultPointMap(record?.grade_boost_points, participantKey);
  const groupGradeBoostPoints = keepDefaultPointMap(record?.group_grade_boost_points, groupKey);
  const storedGradeSections = array(record?.grade_boost_sections);
  const storedRankSections = array(record?.rank_boost_sections);
  const gradeBoostSections = storedGradeSections.length ? storedGradeSections.map((section: any) => ({
    id: String(section.id ?? ''), itemIds: array(section.item_ids),
    points: keepDefaultPointMap(section.points, participantKey),
    groupPoints: keepDefaultPointMap(section.group_points, groupKey),
  })) : [{ id: 'legacy-grade-section', itemIds: array(record?.grade_boost_item_ids),
    points: gradeBoostPoints, groupPoints: groupGradeBoostPoints }];
  const rankBoostSections = storedRankSections.length ? storedRankSections.map((section: any) => ({
    id: String(section.id ?? ''), itemIds: array(section.item_ids),
    points: [0, 1, 2].map(i => configurationNumber(section.points?.[i])) as [number, number, number],
  })) : [{ id: 'legacy-rank-section', itemIds: array(record?.rank_boost_item_ids),
    points: [0, 1, 2].map(i => configurationNumber(record?.rank_boost_points?.[i])) as [number, number, number] }];
  return {
    // Legacy mode remains metadata; it never supplies numerical scoring rules.
    mode: ['official', 'hybrid', 'custom'].includes(record?.points_mode) ? record.points_mode : 'custom',
    rankPoints: [record?.rank_1_points, record?.rank_2_points, record?.rank_3_points].map(configurationNumber) as [number, number, number],
    thresholds: {
      aPlus: configurationNumber(record?.grade_thresholds?.a_plus), a: configurationNumber(record?.grade_thresholds?.a),
      b: configurationNumber(record?.grade_thresholds?.b), c: configurationNumber(record?.grade_thresholds?.c),
    },
    brackets, groupBrackets,
    separateGroupBrackets,
    gradeBoostEnabled: record?.grade_boost_enabled !== false,
    rankBoostEnabled: record?.rank_boost_enabled !== false,
    // Compatibility fields remain in the config shape, but member-count scoring
    // and bracket overrides are no longer part of the active scoring contract.
    memberBracketsEnabled: false,
    autoBracketSelection: record?.auto_bracket_selection === true, allowBracketOverride: false,
    rule12Enabled: record?.less_than_3_teams_rule === true, rule12MinTeams: configurationNumber(record?.rule12_min_teams),
    rule12Behavior: record?.rule12_behavior ?? null, enableGraceMarks: record?.enable_grace_marks === true,
    version: Number.isInteger(record?.config_version) ? record.config_version : 0,
    gradeBoostPoints, groupGradeBoostPoints,
    rankBoostPoints: [0, 1, 2].map(i => configurationNumber(record?.rank_boost_points?.[i])) as [number, number, number],
    gradeBoostItemIds: array(record?.grade_boost_item_ids), rankBoostItemIds: array(record?.rank_boost_item_ids),
    gradeBoostSections, rankBoostSections,
    graceFields: array(record?.grace_fields).map(f => ({ id: String(f.id ?? ''), name: String(f.name ?? ''), maxMarks: configurationNumber(f.max_marks) })),
  };
};
export const setDefaultGradePoint = (
  config: FlexiblePointsConfig, group: boolean, gradeIndex: number, value: number, newBracketKey: string,
): FlexiblePointsConfig => {
  const field = group ? 'groupBrackets' : 'brackets';
  const brackets = config[field];
  const defaultIndex = brackets.reduce((selected, bracket, index) =>
    bracket.enabled && (selected < 0 || bracket.min < brackets[selected].min) ? index : selected, -1);
  if (defaultIndex < 0) {
    const points = [NaN, NaN, NaN, NaN] as GradePoints;
    points[gradeIndex] = value;
    return { ...config, [field]: [...brackets, {
      key: newBracketKey, label: 'Default grade points', min: 1, max: null, points, enabled: true,
    }] };
  }
  return { ...config, [field]: brackets.map((bracket, index) => {
    if (index !== defaultIndex) return bracket;
    const points = [...bracket.points] as GradePoints;
    points[gradeIndex] = value;
    return { ...bracket, points };
  }) };
};
export const serializePointsConfig = (c: FlexiblePointsConfig) => {
  const brackets = singleDefaultBracket(c.brackets);
  const groupBrackets = c.separateGroupBrackets ? singleDefaultBracket(c.groupBrackets) : brackets;
  const participantKey = brackets.find(bracket => bracket.enabled)?.key;
  const groupKey = groupBrackets.find(bracket => bracket.enabled)?.key;
  const gradeBoostSections = c.gradeBoostSections.map(section => ({
    ...section,
    points: keepDefaultPointMap(section.points, participantKey),
    groupPoints: keepDefaultPointMap(section.groupPoints, groupKey),
  }));
  return {
    points_mode: c.mode, rank_1_points: c.rankPoints[0], rank_2_points: c.rankPoints[1], rank_3_points: c.rankPoints[2],
    grade_thresholds: { a_plus: c.thresholds.aPlus, a: c.thresholds.a, b: c.thresholds.b, c: c.thresholds.c },
    point_brackets: brackets, group_point_brackets: groupBrackets,
    separate_group_brackets: c.separateGroupBrackets, auto_bracket_selection: c.autoBracketSelection,
    grade_boost_enabled: c.gradeBoostEnabled, rank_boost_enabled: c.rankBoostEnabled,
    member_brackets_enabled: false,
    allow_bracket_override: false, less_than_3_teams_rule: c.rule12Enabled,
    rule12_min_teams: Number.isFinite(c.rule12MinTeams) ? c.rule12MinTeams : null, rule12_behavior: c.rule12Behavior ?? null,
    enable_grace_marks: c.enableGraceMarks,
    grade_boost_sections: gradeBoostSections.map(s => ({ id: s.id, item_ids: s.itemIds, points: s.points, group_points: s.groupPoints })),
    rank_boost_sections: c.rankBoostSections.map(s => ({ id: s.id, item_ids: s.itemIds, points: s.points.every(Number.isFinite) ? s.points : [] })),
    // Keep legacy columns as a compatibility projection; new scoring reads section arrays.
    grade_boost_points: Object.assign({}, ...gradeBoostSections.map(s => s.points)),
    group_grade_boost_points: Object.assign({}, ...gradeBoostSections.map(s => s.groupPoints)),
    rank_boost_points: c.rankBoostSections[0]?.points.every(Number.isFinite) ? c.rankBoostSections[0].points : [],
    grade_boost_item_ids: [...new Set(c.gradeBoostSections.flatMap(s => s.itemIds))],
    rank_boost_item_ids: [...new Set(c.rankBoostSections.flatMap(s => s.itemIds))],
    grace_fields: c.graceFields.map(f => ({ id: f.id, name: f.name.trim(), max_marks: f.maxMarks })),
  };
};
export const calculateGradeFromConfig = (total: number, maximum: number, config: Pick<FlexiblePointsConfig, 'thresholds'>): string | null => {
  if (!Number.isFinite(total) || !Number.isFinite(maximum) || maximum <= 0 || total < 0 || total > maximum) return null;
  const { aPlus, a, b, c } = config.thresholds;
  if (![aPlus, a, b, c].every(Number.isFinite) || !(aPlus > a && a > b && b > c)) return null;
  const pct = total / maximum * 100;
  return pct >= aPlus ? 'A+' : pct >= a ? 'A' : pct >= b ? 'B' : pct >= c ? 'C' : null;
};
export const resolvePointBracket = (config: FlexiblePointsConfig, _size: number, group: boolean, override?: string | null) => {
  const enabled = (group && config.separateGroupBrackets ? config.groupBrackets : config.brackets).filter(b => b.enabled);
  const bracket = [...enabled].sort((a, b) => a.min - b.min || a.key.localeCompare(b.key))[0] ?? null;
  // Keep accepting the persisted default key for older result flows, but never
  // let a client choose a different member-count bracket.
  if (override && override !== bracket?.key) return null;
  return bracket;
};
export const getPointsProfile = (config: FlexiblePointsConfig, itemId: string): PointsProfile => {
  const g = config.gradeBoostSections.some(section => section.itemIds.includes(itemId)), r = config.rankBoostSections.some(section => section.itemIds.includes(itemId));
  return g && r ? 'both' : g ? 'grade_boost' : r ? 'rank_boost' : 'baseline';
};
export const calculateFlexiblePoints = ({ grade, rank, groupSize, competingTeamsCount, isGroup, config, bracketOverride, itemId }: {
  grade: string | null; rank: number | null; groupSize: number; competingTeamsCount: number; isGroup: boolean;
  config: FlexiblePointsConfig; bracketOverride?: string | null; itemId?: string;
}) => {
  const errors = validateFlexiblePointsConfig(config);
  if (errors.length) throw new Error(errors[0]);
  if (!itemId && (config.gradeBoostItemIds.length || config.rankBoostItemIds.length)) throw new Error('Competition identity is required.');
  if (!Number.isInteger(groupSize) || groupSize < 1 || !Number.isInteger(competingTeamsCount) || competingTeamsCount < 0) throw new Error('Invalid entry/team count.');
  const bracket = resolvePointBracket(config, groupSize, isGroup, bracketOverride);
  if (!bracket) throw new Error('No configured bracket matches this entry.');
  if (grade !== null && grade !== '-' && !['A+', 'A', 'B', 'C'].includes(grade)) throw new Error('Unknown grade.');
  if (rank !== null && (!Number.isInteger(rank) || rank < 1)) throw new Error('Invalid rank.');
  const profile = getPointsProfile(config, itemId ?? '');
  const gradeSection = config.gradeBoostSections.find(section => section.itemIds.includes(itemId ?? ''));
  const rankSection = config.rankBoostSections.find(section => section.itemIds.includes(itemId ?? ''));
  const boosted = isGroup && config.separateGroupBrackets ? gradeSection?.groupPoints : gradeSection?.points;
  const values = gradeSection ? boosted?.[bracket.key] : bracket.points;
  const gi = ['A+', 'A', 'B', 'C'].indexOf(grade ?? '');
  if (gi >= 0 && !values) throw new Error('Boosted grade points are missing for the selected section and bracket.');
  let gradeAward = gi < 0 ? 0 : values![gi];
  const ranks = rankSection ? rankSection.points : config.rankPoints;
  let rankAward = rank !== null && rank <= ranks.length ? ranks[rank - 1] : 0;
  const rule12Applies = config.rule12Enabled && competingTeamsCount < config.rule12MinTeams;
  if (rule12Applies && config.rule12Behavior !== 'rank_and_grade') rankAward = 0;
  if (rule12Applies && config.rule12Behavior === 'no_points') gradeAward = 0;
  return { total: rankAward + gradeAward, rankPoints: rankAward, gradePoints: gradeAward,
    bracketKey: bracket.key, bracketLabel: bracket.label, profile, rule12Applies,
    gradeOnly: rule12Applies && config.rule12Behavior === 'grade_only', configVersion: config.version };
};
export const validateFlexiblePointsConfig = (c: FlexiblePointsConfig): string[] => {
  const errors: string[] = [];
  if (c.memberBracketsEnabled) errors.push('Member-count grade brackets are no longer supported. Reload the default grade-points configuration.');
  const gradeIds = c.gradeBoostSections.flatMap(section => section.itemIds), rankIds = c.rankBoostSections.flatMap(section => section.itemIds);
  if (!c.gradeBoostEnabled && gradeIds.length) errors.push('Remove Grade Boost competitions before turning it off.');
  if (!c.rankBoostEnabled && rankIds.length) errors.push('Remove Rank Boost competitions before turning it off.');
  const duplicateSectionItems = (sections: {id:string; itemIds:string[]}[], label:string) => {
    const seen = new Set<string>();
    sections.forEach((section, index) => {
      if (!section.id || sections.findIndex(other => other.id === section.id) !== index) errors.push(`${label} section IDs must be unique.`);
      section.itemIds.forEach(id => { if (seen.has(id)) errors.push(`A competition can belong to only one ${label} section.`); seen.add(id); });
    });
  };
  duplicateSectionItems(c.gradeBoostSections, 'Grade Boost'); duplicateSectionItems(c.rankBoostSections, 'Rank Boost');
  const validPoints = (v: number[], n: number) => v.length === n && v.every(x => Number.isSafeInteger(x) && x >= 0 && x <= 2147483647);
  const { aPlus, a, b, c: low } = c.thresholds;
  if (![aPlus, a, b, low].every(x => Number.isFinite(x) && x >= 0 && x <= 100) || !(aPlus > a && a > b && b > low))
    errors.push('Enter ordered grade percentages: A+ > A > B > C.');
  if (!validPoints(c.rankPoints, 3)) errors.push('Enter all baseline rank points as non-negative whole numbers.');
  if (c.rule12Enabled && (!Number.isSafeInteger(c.rule12MinTeams) || c.rule12MinTeams < 1 || !['grade_only', 'rank_and_grade', 'no_points'].includes(c.rule12Behavior ?? '')))
    errors.push('Complete the minimum-team rule.');
  const check = (rows: PointBracket[], label: string, group = false) => {
    const enabled = rows.filter(b => b.enabled).sort((a, b) => a.min - b.min), keys = new Set<string>();
    if (!enabled.length) errors.push(label + ': add an enabled bracket.');
    if (enabled.length && (enabled.length !== 1 || enabled[0].min !== 1 || enabled[0].max !== null))
      errors.push(label + ': configure one default grade-points value for every member count.');
    rows.forEach(b => {
      if (!b.key || keys.has(b.key)) errors.push(label + ': bracket keys must be unique.');
      keys.add(b.key);
      if (!Number.isSafeInteger(b.min) || b.min < 1 || (b.max !== null && (!Number.isSafeInteger(b.max) || b.max < b.min))) errors.push(label + ': complete bracket ranges.');
      if (!validPoints(b.points, 4)) errors.push(label + ': enter all grade points.');
      if (b.enabled && gradeIds.length && c.gradeBoostSections.some(section => section.itemIds.length && !validPoints((group ? section.groupPoints : section.points)[b.key] ?? [], 4))) errors.push(label + ': complete boosted grade points for ' + (b.label || b.key) + '.');
    });
    enabled.forEach((b, i) => { const p = enabled[i - 1]; if (p && (p.max === null || p.max >= b.min)) errors.push(label + ': enabled ranges overlap.'); });
  };
  check(c.brackets, 'Participant');
  if (c.separateGroupBrackets) check(c.groupBrackets, 'Group', true);
  if (rankIds.length && c.rankBoostSections.some(section => section.itemIds.length && !validPoints(section.points, 3))) errors.push('Complete all boosted rank points in each assigned section.');
  const ids = new Set<string>(), names = new Set<string>();
  c.graceFields.forEach(f => {
    const name = f.name.trim().toLowerCase();
    if (!f.id || ids.has(f.id) || !name || names.has(name) || !Number.isSafeInteger(f.maxMarks) || f.maxMarks <= 0)
      errors.push('Grace fields require unique names/IDs and a positive whole-number maximum.');
    ids.add(f.id); names.add(name);
  });
  return [...new Set(errors)];
};
