import { Item, Participant, Registration, Festival } from '../../types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class RegistrationValidator {
  
  // Rule 1: Max 4 items per participant (excluding General)
  static checkItemLimit(
    participantId: string,
    existingRegistrations: Registration[],
    newItem: Item
  ): ValidationResult {
    if (newItem.category_codes.includes('GN')) {
      return { isValid: true, errors: [], warnings: [] };
    }
    const nonGeneralCount = existingRegistrations.filter(
      r => !r.item.category_codes.includes('GN')
    ).length;
    if (nonGeneralCount >= 4) {
      return {
        isValid: false,
        errors: ['ഒരാൾക്ക് General-ൽ പുറമേ max 4 items മാത്രം (Rule 1)'],
        warnings: []
      };
    }
    return { isValid: true, errors: [], warnings: [] };
  }

  // Rule 2: HS-ന് ശേഷം religious students → JR/SR only
  static checkPostHSCategory(
    participant: Participant,
    item: Item
  ): ValidationResult {
    if (participant.is_post_hs_religious && 
        item.category_codes.includes('HS')) {
      return {
        isValid: false,
        errors: ['HS-ന് ശേഷം മത വിദ്യാർഥികൾ JR/SR-ൽ മാത്രം (Rule 2)'],
        warnings: []
      };
    }
    return { isValid: true, errors: [], warnings: [] };
  }

  // Rule 5: Group items are allowed at every organisation level.
  static checkGroupItemLevel(
    item: Item,
    currentLevel: string
  ): ValidationResult {
    // Keep the method for callers that still reference REG-05. The rule is
    // intentionally permissive now, including unit and sector levels.
    return { isValid: true, errors: [], warnings: [] };
  }

  // Rule 11: ദഫ്, അറബന – white dress, arabana 12 inch
  static checkDafArabanaRules(item: Item): ValidationResult {
    const warnings: string[] = [];
    if (item.white_dress_required) {
      warnings.push('⚠️ ദഫ്/അറബന: മത്സരാർഥികൾ വെളുത്ത വസ്ത്രം ധരിക്കണം (Rule 11)');
    }
    if (item.item_code === 'GN-121') { // Arabana
      warnings.push('⚠️ അറബന: 12 ഇഞ്ച് വ്യാസം ഉറപ്പ് വരുത്തണം (Rule 11)');
    }
    return { isValid: true, errors: [], warnings };
  }

  // Rule 12: < 3 teams → grade points only
  static checkMinTeamsRule(
    registrationCount: number,
    item: Item
  ): { gradeOnly: boolean; message: string | null } {
    if (registrationCount < 3) {
      return {
        gradeOnly: true,
        message: `${registrationCount} entries മാത്രം. 1st/2nd points ഇല്ല. Grade points മാത്രം (Rule 12)`
      };
    }
    return { gradeOnly: false, message: null };
  }

  // Rule 17: No regional dialect
  static checkRegionalDialect(item: Item): ValidationResult {
    if (item.regional_dialect_blocked) {
      return {
        isValid: true,
        errors: [],
        warnings: ['⚠️ കഥ കഥനം/പ്രസംഗം: പ്രാദേശിക ഭാഷ വകഭേദങ്ങൾ ഉപയോഗിക്കരുത് (Rule 17)']
      };
    }
    return { isValid: true, errors: [], warnings: [] };
  }

  // Rule 20: ദഫ് – Sanghaganam + Khavali only, leather only
  static checkDafUsage(item: Item): ValidationResult {
    const dafAllowedItems = ['GN-120', 'GN-130']; // Daf, Khavali
    if (!dafAllowedItems.includes(item.item_code) && item.daf_allowed) {
      return {
        isValid: false,
        errors: ['ദഫ് ഉപയോഗം ഈ item-ൽ അനുവദനീയമല്ല (Rule 20)'],
        warnings: []
      };
    }
    return { isValid: true, errors: [], warnings: [] };
  }

  // Rule 29: Campus Parallel – recognized board only
  static checkCampusParallelEligibility(
    participant: Participant,
    item: Item
  ): ValidationResult {
    if (item.category_codes.includes('CGP')) {
      if (!participant.is_recognized_board_student) {
        return {
          isValid: false,
          errors: ['Campus Girls Parallel: അംഗീകൃത Board/University course ആവശ്യം (Rule 29)'],
          warnings: []
        };
      }
    }
    return { isValid: true, errors: [], warnings: [] };
  }

  // Rule 31: Dual team disqualification
  static checkDualTeam(
    participantId: string,
    festivalRegistrations: Registration[]
  ): ValidationResult {
    const teamRegistrations = festivalRegistrations.filter(
      r => r.participant_id === participantId
    );
    const uniqueUnits = new Set(teamRegistrations.map(r => r.organisation_id));
    if (uniqueUnits.size > 1) {
      return {
        isValid: false,
        errors: ['ഒരാൾ ഒരേ festival-ൽ 2 teams-ൽ നിന്ന് participate ചെയ്യാൻ പാടില്ല → Disqualification (Rule 31)'],
        warnings: []
      };
    }
    return { isValid: true, errors: [], warnings: [] };
  }

  // Plagiarism ban check
  static checkPlagiarismBan(participant: Participant): ValidationResult {
    if (participant.plagiarism_ban_until && 
        new Date(participant.plagiarism_ban_until) > new Date()) {
      return {
        isValid: false,
        errors: [`Plagiarism ban active until ${participant.plagiarism_ban_until}. മത്സരിക്കാൻ അനുവദിക്കില്ല (Rule 1)`],
        warnings: []
      };
    }
    return { isValid: true, errors: [], warnings: [] };
  }
  
  // Run all validations
  static validateAll(
    participant: Participant,
    item: Item,
    existingRegistrations: Registration[],
    festival: Festival
  ): ValidationResult {
    const allErrors: string[] = [];
    const allWarnings: string[] = [];

    const checks = [
      this.checkItemLimit(participant.id, existingRegistrations, item),
      this.checkPostHSCategory(participant, item),
      this.checkGroupItemLevel(item, festival.level),
      this.checkDafArabanaRules(item),
      this.checkRegionalDialect(item),
      this.checkDafUsage(item),
      this.checkCampusParallelEligibility(participant, item),
      this.checkDualTeam(participant.id, existingRegistrations),
      this.checkPlagiarismBan(participant),
    ];

    checks.forEach(result => {
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    });

    return {
      isValid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings
    };
  }
}
