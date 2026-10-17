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
  getSchedule: () => readRpc<TeamLeaderScheduleRow>('get_team_leader_schedule'),
  getPublishedResults: () => readRpc<TeamLeaderPublishedResult>('get_team_leader_published_results'),
  getStandings: () => readRpc<TeamLeaderStanding>('get_team_leader_standings'),
  getAnnouncements: () => readRpc<TeamLeaderAnnouncement>('get_team_leader_announcements'),
};
