export type RuleResult = {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  metadata?: Record<string, unknown>;
};

export type RuleContext = {
  participant: any; // We'll refine these types once the API interface is finalized
  item: any;
  existingRegistrations: any[];
  festivalConfig: any; // festival configurations like registration dates, active items, limits, etc.
};

export interface RegistrationRule {
  id: string;
  description: string;
  evaluate(context: RuleContext): RuleResult | null; // Returns null if rule passes
}
