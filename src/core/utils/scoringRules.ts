import { scoringRuleRepository } from '../../lib/repositories/scoringRuleRepository';

export interface ScoringCriterion {
  name: string;
  marks: number;
}

export type ScoringEntryMode = 'criteria' | 'total_only';

export interface ItemRule {
  id?: string;
  event_name: string;
  event_name_ml?: string;
  total_marks: number;
  time_limit?: string;
  guidelines?: string;
  criteria: ScoringCriterion[];
  is_default?: boolean;
  entry_mode: ScoringEntryMode;
}

// Keep the same 100-mark fallback available even when a project has not seeded
// the global DEFAULT_* rows yet. These are runtime fallbacks only; explicit
// tenant/global rules returned by the database still take precedence.
const FALLBACK_PERFORMANCE_RULE: ItemRule = {
  event_name: 'DEFAULT_PERFORMANCE',
  total_marks: 100,
  is_default: true,
  entry_mode: 'total_only',
  criteria: [],
};

const FALLBACK_CREATIVE_RULE: ItemRule = {
  event_name: 'DEFAULT_CREATIVE',
  total_marks: 100,
  is_default: true,
  entry_mode: 'total_only',
  criteria: [],
};

export const getScoringRulesForItem = async (
  itemNameEn: string, 
  itemNameMl?: string, 
  itemType: 'stage' | 'offstage' = 'stage',
  tenantId?: string
): Promise<ItemRule> => {
  
  // Fetch rules from database
  const { data: dbRules, error } = await scoringRuleRepository.listRules<any>(tenantId);
  if (error) throw new Error(error.message);
  const rulesList = (dbRules || []) as any[];

  // Convert DB criteria back to the ScoringCriterion format
  const formatDbRule = (rule: any): ItemRule => ({
    id: rule.id,
    event_name: rule.event_name,
    event_name_ml: rule.event_name_ml,
    total_marks: Number(rule.total_marks),
    time_limit: rule.time_limit,
    guidelines: rule.guidelines,
    is_default: rule.is_default,
    entry_mode: rule.entry_mode === 'total_only' ? 'total_only' : 'criteria',
    criteria: (rule.scoring_criteria || [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((c: any) => ({ name: c.name, marks: c.marks }))
  });

  const GENERIC_PERFORMANCE_RULE = rulesList.find(r => r.event_name === 'DEFAULT_PERFORMANCE');
  const GENERIC_CREATIVE_RULE = rulesList.find(r => r.event_name === 'DEFAULT_CREATIVE');

  const configuredRule = (rule: any): ItemRule => {
    if (!rule) throw new Error('Configure a scoring rule and maximum marks for this item first.');
    const formatted = formatDbRule(rule);
    if (!Number.isFinite(formatted.total_marks) || formatted.total_marks <= 0) throw new Error('The scoring rule needs a valid maximum mark.');
    return formatted;
  };

  const defaultRuleForItem = (): ItemRule => {
    const databaseRule = itemType === 'offstage' ? GENERIC_CREATIVE_RULE : GENERIC_PERFORMANCE_RULE;
    if (databaseRule) {
      const configuredDefault = configuredRule(databaseRule);
      return { ...configuredDefault, total_marks: 100, entry_mode: 'total_only', criteria: [] };
    }

    const fallback = itemType === 'offstage' ? FALLBACK_CREATIVE_RULE : FALLBACK_PERFORMANCE_RULE;
    return { ...fallback };
  };

  if (!itemNameEn && !itemNameMl) return defaultRuleForItem();

  const normalizedSearchEn = (itemNameEn || '').toLowerCase().trim();
  const normalizedSearchMl = (itemNameMl || '').toLowerCase().trim();
  
  // 1. Try exact match (Prioritize tenant custom rules if any, but since listRules fetches both, we just search)
  // We should prefer tenant-specific rules over default rules if they both exist.
  // The query returns both. If multiple, sort so tenant_id != null comes first.
  const sortedRules = [...rulesList].sort((a, b) => {
    if (a.tenant_id && !b.tenant_id) return -1;
    if (!a.tenant_id && b.tenant_id) return 1;
    return 0;
  });

  let matchedRule = sortedRules.find(
    rule => !rule.is_default && (
      rule.event_name.toLowerCase().trim() === normalizedSearchEn || 
      (rule.event_name_ml && rule.event_name_ml.toLowerCase().trim() === normalizedSearchMl)
    )
  );

  // 2. Try partial match
  if (!matchedRule) {
    matchedRule = sortedRules.find(
      rule => !rule.is_default && (
        (normalizedSearchEn && normalizedSearchEn.includes(rule.event_name.toLowerCase().trim())) ||
        (normalizedSearchMl && rule.event_name_ml && normalizedSearchMl.includes(rule.event_name_ml.toLowerCase().trim()))
      )
    );
  }

  if (matchedRule) {
    return configuredRule(matchedRule);
  }

  return defaultRuleForItem();
};

export const getCriterionKey = (name: string) =>
  name
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');

export const formatCriteriaForUI = (criteria: ScoringCriterion[]) => {
  return criteria.map(c => ({
    key: getCriterionKey(c.name),
    label: c.name,
    max: c.marks
  }));
};
