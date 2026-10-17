import { RegistrationRule, RuleContext, RuleResult } from './types';
import { 
  ItemLimitRule, 
  CategoryMatchRule, 
  GroupItemLevelRule, 
  PlagiarismBanRule, 
  DuplicateRegistrationRule, 
  ItemSpecificRules,
  DualTeamRule
} from './registrationRules';

export class RuleEngine {
  private activeRules: RegistrationRule[] = [];

  constructor() {
    // Register default rules
    this.registerRule(ItemLimitRule);
    this.registerRule(CategoryMatchRule);
    this.registerRule(GroupItemLevelRule);
    this.registerRule(PlagiarismBanRule);
    this.registerRule(DuplicateRegistrationRule);
    this.registerRule(ItemSpecificRules);
    this.registerRule(DualTeamRule);
  }

  registerRule(rule: RegistrationRule) {
    this.activeRules.push(rule);
  }

  clearRules() {
    this.activeRules = [];
  }

  evaluateRegistration(context: RuleContext): {
    isValid: boolean;
    errors: RuleResult[];
    warnings: RuleResult[];
  } {
    const errors: RuleResult[] = [];
    const warnings: RuleResult[] = [];

    for (const rule of this.activeRules) {
      const result = rule.evaluate(context);
      if (result) {
        if (result.severity === 'error') {
          errors.push(result);
        } else if (result.severity === 'warning') {
          warnings.push(result);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Export a singleton instance for easy usage
export const ruleEngine = new RuleEngine();
