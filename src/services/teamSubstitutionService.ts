import { supabase } from '@/core/config/supabase';

export interface TeamSubstitutionRequest {
  request_id: string;
  registration_id: string;
  old_participant_id: string;
  old_participant_name: string;
  old_chest_number: string | null;
  new_participant_id: string;
  new_participant_name: string;
  new_chest_number: string | null;
  reason: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'stale';
  admin_reason: string | null;
  requested_at: string;
  decided_at: string | null;
}

export interface AdminSubstitutionSummary {
  item_id: string;
  item_code: string | null;
  item_name: string;
  request_count: number | string;
  oldest_requested_at: string;
}

export interface AdminSubstitutionRequest extends Omit<TeamSubstitutionRequest, 'status' | 'admin_reason' | 'decided_at'> {
  organisation_id: string;
  team_name: string;
  item_code: string | null;
  item_name: string;
  requested_by: string;
}

export const teamSubstitutionService = {
  async getTeamRequests(itemId: string) {
    const { data, error } = await supabase.rpc('get_team_leader_individual_substitution_requests', {
      p_item_id: itemId,
    });
    if (error) throw error;
    return (data ?? []) as TeamSubstitutionRequest[];
  },

  async getTeamGroupRequests(itemId: string) {
    const { data, error } = await supabase.rpc('get_team_leader_group_substitution_requests', {
      p_item_id: itemId,
    });
    if (error) throw error;
    return (data ?? []) as TeamSubstitutionRequest[];
  },

  async request(registrationId: string, replacementParticipantId: string, reason: string) {
    const { data, error } = await supabase.rpc('team_leader_request_individual_substitution', {
      p_registration_id: registrationId,
      p_new_participant_id: replacementParticipantId,
      p_reason: reason,
    });
    if (error) throw error;
    return data as { status: 'pending_approval' | 'pending_exists'; request_id?: string | null };
  },

  async requestGroup(registrationId: string, oldParticipantId: string, replacementParticipantId: string, reason: string) {
    const { data, error } = await supabase.rpc('team_leader_request_group_substitution', {
      p_registration_id: registrationId,
      p_old_participant_id: oldParticipantId,
      p_new_participant_id: replacementParticipantId,
      p_reason: reason,
    });
    if (error) throw error;
    return data as { status: 'pending_approval' | 'pending_exists'; request_id?: string | null };
  },

  async getAdminSummary(festivalId: string) {
    const { data, error } = await supabase.rpc('get_admin_program_substitution_summary', {
      p_festival_id: festivalId,
    });
    if (error) throw error;
    return (data ?? []) as AdminSubstitutionSummary[];
  },

  async getAdminRequests(festivalId: string, itemId: string) {
    const { data, error } = await supabase.rpc('get_admin_program_substitution_requests', {
      p_festival_id: festivalId,
      p_item_id: itemId,
    });
    if (error) throw error;
    return (data ?? []) as AdminSubstitutionRequest[];
  },

  async review(requestId: string, action: 'approve' | 'reject', adminReason?: string) {
    const { data, error } = await supabase.rpc('review_team_leader_substitution', {
      p_request_id: requestId,
      p_action: action,
      p_admin_reason: adminReason?.trim() || null,
    });
    if (error) throw error;
    return data as { status: 'approved' | 'rejected' | 'pending_approval' | 'stale' | 'blocked' | 'not_found'; message?: string };
  },
};
