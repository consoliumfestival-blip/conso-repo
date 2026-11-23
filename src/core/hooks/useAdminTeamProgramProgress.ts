import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/core/config/supabase';

export type AdminTeamProgramProgressRow = {
  festival_team_id: string;
  organisation_id: string;
  team_name: string;
  participant_count: number | string;
  assigned_participant_count: number | string;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  assigned_count: number | string;
  is_completed: boolean;
};

export const adminTeamProgramProgressQueryKey = (
  festivalId: string | null | undefined,
  tenantId?: string | null,
  actorId?: string | null,
) => ['admin-team-program-progress', festivalId, tenantId, actorId] as const;

export function useAdminTeamProgramProgress(
  festivalId: string | null | undefined,
  tenantId?: string | null,
  actorId?: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: adminTeamProgramProgressQueryKey(festivalId, tenantId, actorId),
    enabled: enabled && !!festivalId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_team_program_progress', {
        p_festival_id: festivalId!,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminTeamProgramProgressRow[];
    },
  });
}
