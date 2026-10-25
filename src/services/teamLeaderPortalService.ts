import { supabase } from '@/core/config/supabase';
import type { TeamLeaderParticipantExportRow } from '@/services/participantExportService';

export interface TeamLeaderScheduleParticipants {
  schedule_id: string;
  item_id: string;
  checkin_complete: boolean;
  participants: TeamLeaderParticipantExportRow[];
}

export interface TeamLeaderContext {
  assignment_id: string;
  parent_tenant_id: string;
  festival_id: string;
  festival_team_id: string;
  organisation_id: string;
  team_name?: string;
  festival_name?: string;
  portal_primary_color?: string | null;
  portal_accent_color?: string | null;
}

export interface TeamLeaderParticipant {
  id: string;
  name: string;
  gender: string | null;
  category_code: string | null;
  chest_number: string | null;
  status: string | null;
  festival_id: string;
  organisation_id: string | null;
  profile_slug?: string | null;
}

export interface TeamLeaderScheduleRow {
  schedule_id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  category_codes: string[] | null;
  venue_name: string | null;
  start_time: string | null;
  end_time: string | null;
  event_status: string | null;
  participant_count: number;
  checked_in_count: number;
}

export interface TeamLeaderPublishedResult {
  result_id: string;
  item_code: string | null;
  item_name: string | null;
  participant_name: string | null;
  rank: number | null;
  grade: string | null;
  points_awarded: number | null;
  published_at: string | null;
}

export interface TeamLeaderStanding {
  rank: number;
  organisation_id: string;
  team_name: string;
  total_points: number;
  is_own_team: boolean;
}

export interface TeamLeaderAnnouncement {
  id: string;
  title: string | null;
  message: string | null;
  type: string | null;
  created_at: string;
}

export interface TeamLeaderProgramOption {
  item_id: string;
  item_code: string | null;
  item_name_en: string | null;
  item_name_ml: string | null;
  category_codes: string[] | null;
  item_type?: string | null;
  gender: string | null;
  participation_type: string | null;
  group_min_members: number | null;
  group_max_members: number | null;
  entry_kind: 'participant' | 'general_team';
  is_assigned: boolean;
  is_eligible: boolean;
  team_entry_count: number;
  eligible_participant_ids?: string[] | null;
  assigned_participant_ids?: string[] | null;
  is_completed?: boolean;
  assignment_locked?: boolean;
}

export interface TeamLeaderGroupRosterMember {
  registration_id: string;
  entry_chest_number: string | null;
  participant_id: string;
  participant_name: string;
  participant_chest_number: string | null;
  member_order: number | null;
  is_leader: boolean;
}

export interface TeamLeaderIndividualRosterMember {
  registration_id: string;
  participant_id: string;
  participant_name: string;
  participant_chest_number: string | null;
  participant_category_code: string | null;
  registration_status: string | null;
}

export interface TeamLeaderParticipantProgram {
  item_id: string;
  item_code: string | null;
  item_name_en: string | null;
  item_name_ml: string | null;
  category_codes: string[] | null;
  participation_type: string | null;
  entry_kind: 'participant' | 'general_team';
  registration_status: string | null;
}

export interface TeamLeaderItemLimitStatus {
  item_id: string;
  participant_count: number;
  max_participants_per_team: number | null;
}

async function readRpc<T>(name: string): Promise<T[]> {
  const { data, error } = await supabase.rpc(name);
  if (error) throw error;
  return (data ?? []) as T[];
}

async function readRpcSingle<T>(name: string): Promise<T | null> {
  const { data, error } = await supabase.rpc(name);
  // PostgREST can surface an empty single-row RPC result as PGRST116.
  // Treat it as an absent context so the portal can show a useful state
  // instead of breaking on a raw database error.
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  const rows = (data ?? []) as T[];
  return rows.length > 0 ? rows[0] : null;
}

/**
 * All portal reads use server-side assignment resolution. No method accepts a
 * tenant, festival, team, or organisation id from the caller.
 */
export const teamLeaderPortalService = {
  getContext: () => readRpcSingle<TeamLeaderContext>('get_team_leader_context_details'),
  getBranding: async (festivalTeamId: string) => {
    const { data, error } = await supabase
      .from('festival_teams')
      .select('portal_primary_color, portal_accent_color')
      .eq('id', festivalTeamId)
      .maybeSingle();
    // Branding is optional presentation data. A missing/blocked branding
    // read must not hide an otherwise valid, securely resolved portal.
    if (error) {
      console.warn('Team Leader branding unavailable:', error.message);
      return { portal_primary_color: null, portal_accent_color: null };
    }
    return data ?? { portal_primary_color: null, portal_accent_color: null };
  },
  getParticipants: () => readRpc<TeamLeaderParticipant>('get_team_leader_participants'),
  getItemLimitStatus: () => readRpc<TeamLeaderItemLimitStatus>('get_team_leader_item_limit_status'),
  getParticipantExportRows: async () => {
    const { data, error } = await supabase.rpc('get_team_leader_participant_export_rows');
    if (error) throw error;
    return (data ?? []) as TeamLeaderParticipantExportRow[];
  },
  getProgramsForParticipant: async (participantId: string) => {
    const { data, error } = await supabase.rpc('get_team_leader_participant_programs', {
      p_participant_id: participantId,
    });
    if (error) throw error;
    return (data ?? []) as TeamLeaderParticipantProgram[];
  },
  getProgramsForTeam: async () => {
    const [programs, completionRows] = await Promise.all([
      supabase.rpc('get_team_leader_programs_for_team_with_locks'),
      supabase.rpc('get_team_leader_completed_program_ids'),
    ]);
    if (programs.error) throw programs.error;
    if (completionRows.error) throw completionRows.error;
    const completedIds = new Set(((completionRows.data ?? []) as { item_id: string }[]).map((row) => row.item_id));
    return ((programs.data ?? []) as TeamLeaderProgramOption[]).map((program) => ({
      ...program,
      is_completed: completedIds.has(program.item_id),
    }));
  },
  getEligibleGroupMemberIds: async (itemId: string) => {
    const { data, error } = await supabase.rpc('get_team_leader_eligible_group_member_ids', {
      p_item_id: itemId,
    });
    if (error) throw error;
    return ((data ?? []) as { participant_id: string }[]).map((row) => row.participant_id);
  },
  getProgramGroupRoster: async (itemId: string) => {
    const { data, error } = await supabase.rpc('get_team_leader_program_group_roster', {
      p_item_id: itemId,
    });
    if (error) throw error;
    return (data ?? []) as TeamLeaderGroupRosterMember[];
  },
  getProgramIndividualRoster: async (itemId: string) => {
    const { data, error } = await supabase.rpc('get_team_leader_program_individual_roster', {
      p_item_id: itemId,
    });
    if (error) throw error;
    return (data ?? []) as TeamLeaderIndividualRosterMember[];
  },
  deselectIndividualRegistration: async (registrationId: string) => {
    const { data, error } = await supabase.rpc('safe_unassign_registration', {
      p_registration_id: registrationId,
    });
    if (error) throw error;
    return data as { status: 'removed' | 'blocked' | 'not_found'; message?: string };
  },
  removeGroupMember: async (registrationId: string, participantId: string, expectedMemberIds: string[], replacementLeaderId?: string) => {
    const { data, error } = await supabase.rpc('safe_remove_group_member', {
      p_registration_id: registrationId,
      p_participant_id: participantId,
      p_expected_member_ids: expectedMemberIds,
      p_replacement_leader_id: replacementLeaderId ?? null,
    });
    if (error) throw error;
    return data as { status: 'removed' | 'blocked' | 'not_found'; message?: string };
  },
  deleteGroupEntry: async (registrationId: string, expectedMemberIds: string[]) => {
    const { data, error } = await supabase.rpc('safe_delete_group_entry_if_unchanged', {
      p_registration_id: registrationId,
      p_expected_member_ids: expectedMemberIds,
    });
    if (error) throw error;
    return data as { status: 'removed' | 'blocked' | 'not_found'; message?: string };
  },
  markProgramCompleted: async (itemId: string) => {
    const { data, error } = await supabase.rpc('team_leader_mark_program_completed', {
      p_item_id: itemId,
    });
    if (error) throw error;
    return data as { item_id: string; participant_count: number; completed_at: string; status: string };
  },
  assignProgram: async (participantId: string, itemId: string) => {
    const { data, error } = await supabase.rpc('team_leader_assign_program', {
      p_participant_id: participantId,
      p_item_id: itemId,
    });
    if (error) throw error;
    return data as { registration_id: string; status: string };
  },
  assignProgramParticipants: async (participantIds: string[], itemId: string) => {
    const { data, error } = await supabase.rpc('team_leader_assign_program_participants', {
      p_item_id: itemId,
      p_participant_ids: participantIds,
    });
    if (error) throw error;
    return data as { item_id: string; assigned_participant_ids: string[]; assigned_count: number; status: string };
  },
  createGeneralEntry: async (itemId: string, participantIds: string[]) => {
    const { data, error } = await supabase.rpc('team_leader_create_general_entry', {
      p_item_id: itemId,
      p_participant_ids: participantIds,
    });
    if (error) throw error;
    return data as { registration_id: string; entry_chest_number: string; member_count: number };
  },
  getSchedule: () => readRpc<TeamLeaderScheduleRow>('get_team_leader_schedule'),
  getScheduleParticipants: async (scheduleId: string): Promise<TeamLeaderScheduleParticipants> => {
    const { data, error } = await supabase.rpc('get_team_leader_schedule_participants', { p_schedule_id: scheduleId });
    if (error) throw error;
    if (!data || data.schedule_id !== scheduleId || !Array.isArray(data.participants)
      || typeof data.item_id !== 'string' || typeof data.checkin_complete !== 'boolean') {
      throw new Error('Unable to read the event participant details. Please retry.');
    }
    return data as TeamLeaderScheduleParticipants;
  },
  getPublishedResults: () => readRpc<TeamLeaderPublishedResult>('get_team_leader_published_results'),
  getStandings: () => readRpc<TeamLeaderStanding>('get_team_leader_standings'),
  getAnnouncements: () => readRpc<TeamLeaderAnnouncement>('get_team_leader_announcements'),
  resetPassword: async (userId: string, festivalId: string) => {
    const { data, error } = await supabase.functions.invoke('provision-team-leader', {
      body: { action: 'reset_password', user_id: userId, festival_id: festivalId },
    });
    if (error) throw error;
    if (!data?.success || typeof data?.password !== 'string' || !/^[0-9]{6}$/.test(data.password)
      || typeof data?.username !== 'string' || !data.username.trim()) {
      throw new Error(data?.message || 'The reset response did not contain a username and six-digit password. Check the account before reissuing credentials.');
    }
    return { ...data, username: data.username.trim() } as { success: true; password: string; username: string };
  },

  selfUpdateCredentials: async (
    newUsernameOrLegacyUserId: string | null,
    newPasswordOrUsername: string,
    legacyPassword?: string,
  ) => {
    // Keep the previous three-argument call shape working for older route copies.
    const newUsername = legacyPassword === undefined ? newUsernameOrLegacyUserId : newPasswordOrUsername;
    const newPassword = legacyPassword === undefined ? newPasswordOrUsername : legacyPassword;
    const { data, error } = await supabase.functions.invoke('provision-team-leader', {
      body: {
        action: 'self_update_credentials',
        new_username: newUsername,
        new_password: newPassword,
      },
    });
    if (error) {
      const response = (error as any).context;
      let payload: any;
      if (response && typeof response.json === 'function') {
        try {
          payload = await response.json();
        } catch {
          // Keep the standard invoke error when the response has no JSON body.
        }
      }
      throw new Error(
        payload?.error === 'CREDENTIAL_CHANGE_NOT_REQUIRED'
          ? 'Credential setup is already complete. Sign in again with your current password.'
          : typeof payload?.message === 'string' && payload.message
          ? payload.message
          : error.message || 'Could not update Team Leader credentials.'
      );
    }
    if (!data?.success || typeof data?.username !== 'string' || !data.username.trim()) {
      throw new Error('Credential setup could not be confirmed. Sign in again with your new password.');
    }
    return { ...data, username: data.username.trim() };
  },
};
