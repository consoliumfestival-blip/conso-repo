import { supabase } from '@/core/config/supabase';

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
  getProgramsForParticipant: async (participantId: string) => {
    const { data, error } = await supabase.rpc('get_team_leader_programs', {
      p_participant_id: participantId,
    });
    if (error) throw error;
    return (data ?? []) as TeamLeaderProgramOption[];
  },
  getProgramsForTeam: async () => {
    const { data, error } = await supabase.rpc('get_team_leader_programs_for_team');
    if (error) throw error;
    return (data ?? []) as TeamLeaderProgramOption[];
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
  getPublishedResults: () => readRpc<TeamLeaderPublishedResult>('get_team_leader_published_results'),
  getStandings: () => readRpc<TeamLeaderStanding>('get_team_leader_standings'),
  getAnnouncements: () => readRpc<TeamLeaderAnnouncement>('get_team_leader_announcements'),
  resetPassword: async (userId: string, festivalId: string) => {
    const { data, error } = await supabase.functions.invoke('provision-team-leader', {
      body: { action: 'reset_password', user_id: userId, festival_id: festivalId },
    });
    if (error) throw error;
    if (!data?.success || typeof data?.password !== 'string') {
      throw new Error(data?.message || 'Password reset did not complete.');
    }
    return data as { success: true; password: string; username: string };
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
        typeof payload?.message === 'string' && payload.message
          ? payload.message
          : error.message || 'Could not update Team Leader credentials.'
      );
    }
    return data;
  },
};
