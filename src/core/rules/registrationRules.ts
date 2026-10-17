import { RegistrationRule, RuleContext, RuleResult } from './types';

// REG-01: Participant item-count limits are intentionally removed.
// Eligibility and duplicate-item rules remain active below.
export const ItemLimitRule: RegistrationRule = {
  id: 'REG-01',
  description: 'Participant may register for any number of different eligible items',
  evaluate(_context: RuleContext): RuleResult | null {
    return null;
  },
};

// REG-02: Category match
export const CategoryMatchRule: RegistrationRule = {
  id: 'REG-02',
  description: 'Participant category must match item category',
  evaluate(context: RuleContext): RuleResult | null {
    const { participant, item } = context;
    
    const pCat = String(participant.category_code ?? '').trim().toUpperCase();
    const pCatShort = pCat === 'SENIOR' ? 'SR' : (pCat === 'JUNIOR' ? 'JR' : (pCat === 'CAMPUS' ? 'CA' : pCat));
    const pCatLong = pCat === 'SR' ? 'SENIOR' : (pCat === 'JR' ? 'JUNIOR' : (pCat === 'CA' ? 'CAMPUS' : pCat));

    const itemCodes = (Array.isArray(item.category_codes) ? item.category_codes : [item.category_codes])
      .filter(Boolean)
      .map((code: unknown) => String(code).trim().toUpperCase());
    const matchesCategory = itemCodes.includes(pCat) || 
                            itemCodes.includes(pCatShort) || 
                            itemCodes.includes(pCatLong) || 
                            itemCodes.includes('GN') ||
                            itemCodes.includes('GENERAL');
    
    if (!matchesCategory) {
      if (participant.is_post_hs_religious && (
        itemCodes.includes('JR') || 
        itemCodes.includes('JUNIOR') || 
        itemCodes.includes('SR') || 
        itemCodes.includes('SENIOR')
      )) {
         return null;
      }

      return {
        ruleId: this.id,
        severity: 'error',
        message: `Participant category (${participant.category_code}) does not match item categories (${itemCodes.join(', ')}).`,
        metadata: { participantCategory: participant.category_code, itemCategories: itemCodes }
      };
    }

    // Secondary check: HS restriction for post-HS religious students
    if (participant.is_post_hs_religious && itemCodes.includes('HS')) {
      return {
        ruleId: this.id,
        severity: 'error',
        message: 'Religious students after HS must compete in JR/SR only.',
      };
    }

    return null;
  }
};

// REG-05: Group items are supported at every organisation level.
export const GroupItemLevelRule: RegistrationRule = {
  id: 'REG-05',
  description: 'Group items are allowed at unit, sector, division and higher levels',
  evaluate(context: RuleContext): RuleResult | null {
    // Group items are valid at every organisation level. Keep this rule in
    // the registry for compatibility with existing rule configurations, but
    // do not reject or warn for unit/sector registrations.
    return null;
  }
};

// REG-09: Plagiarism Ban
export const PlagiarismBanRule: RegistrationRule = {
  id: 'REG-09',
  description: 'Active plagiarism ban blocks registration',
  evaluate(context: RuleContext): RuleResult | null {
    const { participant } = context;

    if (participant.plagiarism_ban_until) {
      const banEnd = new Date(participant.plagiarism_ban_until);
      if (banEnd > new Date()) {
        return {
          ruleId: this.id,
          severity: 'error',
          message: `Active plagiarism ban until ${banEnd.toLocaleDateString()}. Registration blocked.`,
          metadata: { banUntil: participant.plagiarism_ban_until }
        };
      }
    }

    return null;
  }
};

// REG-11: Duplicate Registration
export const DuplicateRegistrationRule: RegistrationRule = {
  id: 'REG-11',
  description: 'Participant cannot register for the same item twice',
  evaluate(context: RuleContext): RuleResult | null {
    const { item, existingRegistrations } = context;

    const isDuplicate = existingRegistrations.some(
      (r: any) => r.item_id === item.id
    );

    if (isDuplicate) {
      return {
        ruleId: this.id,
        severity: 'error',
        message: `Already registered for this item.`,
      };
    }

    return null;
  }
};

// REG-12/13/20: Item specific config rules (Daf, Arabana, Languages)
export const ItemSpecificRules: RegistrationRule = {
  id: 'REG-SPECIAL',
  description: 'Enforce item-specific warnings and restrictions',
  evaluate(context: RuleContext): RuleResult | null {
    const { item } = context;

    // Example item specific warning
    if (item.white_dress_required) {
      return {
        ruleId: 'REG-12',
        severity: 'warning',
        message: 'Participants must wear white dress for this item.',
      };
    }

    if (item.regional_dialect_blocked) {
      return {
        ruleId: 'REG-13',
        severity: 'warning',
        message: 'Regional dialects are strictly prohibited for this item.',
      };
    }

    return null;
  }
};

// REG-31: Dual team disqualification
export const DualTeamRule: RegistrationRule = {
  id: 'REG-31',
  description: 'Participant cannot compete from multiple teams in the same festival',
  evaluate(context: RuleContext): RuleResult | null {
    const { participant, existingRegistrations } = context;

    // We assume existingRegistrations contain all festival registrations for this participant.
    // If they have registered under different organisation_ids, they are disqualified.
    const teamRegistrations = existingRegistrations.filter(
      (r: any) => r.participant_id === participant.id
    );
    
    const uniqueUnits = new Set(teamRegistrations.map((r: any) => r.organisation_id));
    
    // We add a check if they are trying to register under a NEW team right now
    if (context.item.organisation_id && !uniqueUnits.has(context.item.organisation_id)) {
        uniqueUnits.add(context.item.organisation_id);
    }

    if (uniqueUnits.size > 1) {
      return {
        ruleId: this.id,
        severity: 'error',
        message: 'A participant cannot compete from multiple teams in the same festival. Disqualification applies.',
      };
    }

    return null;
  }
};
