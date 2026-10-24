import { supabase } from '../core/config/supabase';
import { groupEntryChest } from '../core/utils/groupParticipation';

export type GeneralTeamEntry = {
  id: string;
  entry_chest_number: string;
  group_leader_participant_id: string | null;
  leader: { id: string; name: string; chest_number: string | null } | null;
  organisation_id: string;
  organisation: { name: string } | null;
  item: { id: string; item_code: string; item_name_en: string; category_codes: string[]; gender: string | null; group_min_members: number | null; group_max_members: number | null } | null;
  members: { participant_id: string; member_order: number | null; participant: { name: string; chest_number: string | null } | null }[];
};

export function getGeneralTeamSelectionError(input: {
  selectedCount: number;
  organisationCount: number;
  minMembers: number;
  maxMembers: number;
}): string | null {
  const { selectedCount, organisationCount, minMembers, maxMembers } = input;
  if (selectedCount === 0) return 'ആദ്യം കുട്ടികളെ തിരഞ്ഞെടുക്കുക.';
  if (organisationCount !== 1) {
    return organisationCount > 1
      ? 'ഒരു Group entry-യിൽ ഒരേ ടീമിലെ കുട്ടികളെ മാത്രം തിരഞ്ഞെടുക്കുക.'
      : 'തിരഞ്ഞെടുത്ത കുട്ടികളുടെ ടീം കണ്ടെത്താനായില്ല. കുട്ടികളുടെ വിവരങ്ങൾ പരിശോധിക്കുക.';
  }
  if (minMembers < 1) return 'ഈ മത്സരത്തിന്റെ group size ക്രമീകരിച്ചിട്ടില്ല. മത്സരത്തിന്റെ അംഗസംഖ്യ admin ക്രമീകരിക്കണം.';
  if (selectedCount < minMembers) {
    return maxMembers === minMembers
      ? `ഈ മത്സരത്തിന് കൃത്യമായി ${minMembers} കുട്ടികളെ തിരഞ്ഞെടുക്കണം; ഇപ്പോൾ ${selectedCount} പേരാണ് തിരഞ്ഞെടുത്തത്.`
      : `കുറഞ്ഞത് ${minMembers} കുട്ടികളെ തിരഞ്ഞെടുക്കണം; ഇപ്പോൾ ${selectedCount} പേരാണ് തിരഞ്ഞെടുത്തത്.`;
  }
  if (maxMembers > 0 && selectedCount > maxMembers) {
    return maxMembers === minMembers
      ? `ഈ മത്സരത്തിന് കൃത്യമായി ${minMembers} കുട്ടികളെ തിരഞ്ഞെടുക്കണം; ഇപ്പോൾ ${selectedCount} പേരാണ് തിരഞ്ഞെടുത്തത്.`
      : `പരമാവധി ${maxMembers} കുട്ടികളെ മാത്രം തിരഞ്ഞെടുക്കാം; ഇപ്പോൾ ${selectedCount} പേരാണ് തിരഞ്ഞെടുത്തത്.`;
  }
  return null;
}

export function formatGeneralEntryError(error: unknown, operation: 'create' | 'load' = 'create'): string {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('authentication is required')) return 'ലോഗിൻ സെഷൻ കാലഹരണപ്പെട്ടിരിക്കാം. വീണ്ടും ലോഗിൻ ചെയ്ത് ശ്രമിക്കുക.';
  if (normalized.includes('only an administrator')) return 'General team entry സൃഷ്ടിക്കാൻ administrator അനുമതി വേണം.';
  if (normalized.includes('selected festival is not active')) return 'തിരഞ്ഞെടുത്ത festival active അല്ല. Active festival തിരഞ്ഞെടുക്കുക.';
  if (normalized.includes('outside your tenant')) return 'തിരഞ്ഞെടുത്ത festival നിങ്ങളുടെ അനുവദിച്ച പരിധിയിൽ അല്ല.';
  if (normalized.includes('general category is disabled')) return 'ഈ festival-ൽ General category enable ചെയ്തിട്ടില്ല.';
  if (normalized.includes('select an active group competition') || normalized.includes('select an active group program') || normalized.includes('select a single-category group competition')) return 'സജീവമായ Group മത്സരം തിരഞ്ഞെടുക്കുക.';
  if (normalized.includes('select the team members') || normalized.includes('select the required team members')) return 'Entry സൃഷ്ടിക്കുന്നതിന് കുട്ടികളെ തിരഞ്ഞെടുക്കുക.';
  if (normalized.includes('participant can only be selected once') || normalized.includes('student can only be selected once')) return 'ഒരേ കുട്ടിയെ ഒരു entry-യിൽ ഒരിക്കൽ മാത്രം തിരഞ്ഞെടുക്കാം.';
  if (normalized.includes('selected team size is outside')) return 'തിരഞ്ഞെടുത്ത കുട്ടികളുടെ എണ്ണം ഈ മത്സരത്തിന്റെ അംഗസംഖ്യാ പരിധിയിലല്ല. മത്സരത്തിൽ കാണിച്ചിരിക്കുന്ന എണ്ണം പരിശോധിക്കുക.';
  if (normalized.includes('same team') || normalized.includes('same festival and team') || normalized.includes('belong to your team')) return 'തിരഞ്ഞെടുത്ത എല്ലാ കുട്ടികളും ഒരേ festival-ലും ഒരേ ടീമിലും നിന്നുള്ളവരായിരിക്കണം.';
  if (normalized.includes('outside your organisation scope')) return 'ഈ ടീമിനെ കൈകാര്യം ചെയ്യാനുള്ള അനുമതി നിങ്ങളുടെ account-ന് ഇല്ല.';
  if (normalized.includes('group roster is locked')) return 'Check-in, code letter, mark, അല്ലെങ്കിൽ result രേഖപ്പെടുത്തിയതിനാൽ ഈ ടീമിലെ കുട്ടികളെ മാറ്റാനാവില്ല.';
  if (normalized.includes('already a member of this group')) return 'തിരഞ്ഞെടുത്ത കുട്ടി ഈ team entry-യിൽ ഇതിനകം ചേർത്തിട്ടുണ്ട്.';
  if (normalized.includes('chest number conflicts') || normalized.includes('chest number is reserved')) return 'Entry chest number മറ്റൊരു participant അല്ലെങ്കിൽ General entry ഉപയോഗിക്കുന്നുണ്ട്. വീണ്ടും ശ്രമിക്കുക.';
  if (normalized.includes('permission denied') || normalized.includes('42501')) return 'ഈ entry സൃഷ്ടിക്കാൻ ആവശ്യമായ അനുമതി ലഭിച്ചില്ല. Admin access പരിശോധിക്കുക.';
  if (normalized.includes('failed to fetch') || normalized.includes('network')) return 'സർവറുമായി ബന്ധപ്പെടാനായില്ല. Internet connection പരിശോധിച്ച് വീണ്ടും ശ്രമിക്കുക.';

  return message
    ? `${operation === 'load' ? 'General team entries load' : 'General team entry സൃഷ്ടിക്കൽ'} പരാജയപ്പെട്ടു. കാരണം: ${message}`
    : `${operation === 'load' ? 'General team entries load' : 'General team entry സൃഷ്ടിക്കൽ'} പരാജയപ്പെട്ടു. കാരണം കണ്ടെത്താനായില്ല; വീണ്ടും ശ്രമിക്കുക.`;
}

export const generalEntryService = {
  async remove(registrationId: string, expectedMemberIds: string[]) {
    const { data, error } = await supabase.rpc('safe_delete_group_entry_if_unchanged', {
      p_registration_id: registrationId,
      p_expected_member_ids: expectedMemberIds,
    });
    if (error) throw new Error(error.message);
    return data as { status: 'removed' | 'blocked' | 'not_found'; message?: string; member_ids?: string[] };
  },
  async list(festivalId: string): Promise<GeneralTeamEntry[]> {
    const { data, error } = await supabase
      .from('registrations')
      .select('id, entry_chest_number, group_leader_participant_id, leader:participants!registrations_group_leader_participant_id_fkey(id, name, chest_number), organisation_id, organisation:organisations(name), item:items(id, item_code, item_name_en, category_codes, gender, group_min_members, group_max_members), members:group_members(participant_id, member_order, participant:participants(name, chest_number))')
      .eq('festival_id', festivalId)
      .eq('entry_kind', 'general_team')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as GeneralTeamEntry[]).map(entry => ({ ...entry,
      entry_chest_number: groupEntryChest(entry),
      members: [...(entry.members ?? [])].sort((a, b) => (a.member_order ?? Number.MAX_SAFE_INTEGER) - (b.member_order ?? Number.MAX_SAFE_INTEGER)),
    }));
  },

  async create(festivalId: string, itemId: string, participantIds: string[]) {
    const { data, error } = await supabase.rpc('create_general_team_entry', {
      p_festival_id: festivalId,
      p_item_id: itemId,
      p_participant_ids: participantIds,
    });
    if (error) throw new Error(formatGeneralEntryError(error));
    return data as { registration_id: string; entry_chest_number: string; organisation_id: string; member_count: number };
  },

  async updateRoster(registrationId: string, participantIds: string[], expectedParticipantIds: string[], leaderId: string, expectedLeaderId: string | null) {
    const { data, error } = await supabase.rpc('update_group_team_roster', {
      p_registration_id: registrationId,
      p_participant_ids: participantIds,
      p_expected_participant_ids: expectedParticipantIds,
      p_leader_participant_id: leaderId,
      p_expected_leader_participant_id: expectedLeaderId,
    });
    if (error) throw new Error(error.message);
    return data as { registration_id: string; entry_chest_number: string; member_count: number; changed: boolean };
  },
};
