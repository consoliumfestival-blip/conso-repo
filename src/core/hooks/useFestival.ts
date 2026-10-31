import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { festivalSettingsService } from '../../services/festivalSettingsService';
import type { CompetitionItemUpdate } from '../../providers/database/DatabaseProvider';
import { useAuthStore } from '../store/authStore';
import type { FestivalTemplate } from '../festival/templatePolicy';

type FestivalCalendarRecord = {
  id: string;
  tenant_id: string;
  festival_year: number;
  level: string;
  custom_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  registration_open?: string | null;
  registration_close?: string | null;
  is_active: boolean;
  festival_template: FestivalTemplate;
  gender_mode?: 'boys_only' | 'girls_only' | 'both';
  general_category_enabled?: boolean;
  team_leader_on_stage_locked?: boolean;
  team_leader_off_stage_locked?: boolean;
  chest_number_category_range?: 100 | 1000;
  chest_number_template?: 'category' | 'team';
};

type PointsConfigRecord = {
  id: string;
  tenant_id: string;
  festival_id: string;
  rank_1_points: number;
  rank_2_points: number;
  rank_3_points: number;
  ind_a_plus_points: number;
  ind_a_points: number;
  ind_b_points: number;
  ind_c_points: number;
  grp_a_plus_points: number;
  grp_a_points: number;
  grp_b_points: number;
  grp_c_points: number;
  less_than_3_teams_rule: boolean | null;
  points_mode?: 'official' | 'hybrid' | 'custom';
  grade_thresholds?: {
    a_plus: number;
    a: number;
    b: number;
    c: number;
  };
  point_brackets?: unknown[];
  group_point_brackets?: unknown[];
  separate_group_brackets?: boolean;
  auto_bracket_selection?: boolean;
  allow_bracket_override?: boolean;
  rule12_min_teams?: number | null;
  rule12_behavior?: 'grade_only' | 'rank_and_grade' | 'no_points' | null;
  config_version?: number;
  change_reason?: string | null;
  enable_grace_marks?: boolean;
  grade_boost_points?: Record<string, number[]>;
  group_grade_boost_points?: Record<string, number[]>;
  rank_boost_points?: number[];
  grade_boost_item_ids?: string[];
  rank_boost_item_ids?: string[];
  grade_boost_sections?: { id: string; item_ids: string[]; points: Record<string, number[]>; group_points: Record<string, number[]> }[];
  rank_boost_sections?: { id: string; item_ids: string[]; points: number[] }[];
  grace_fields?: { id: string; name: string; max_marks: number }[];
};

export const useFestival = () => {
  const { tenant_id } = useAuthStore();
  const queryClient = useQueryClient();

  // 1. Fetch active festival for the current tenant
  const useActiveFestival = () => {
    return useQuery({
      queryKey: ['active-festival', tenant_id],
      queryFn: async () => {
        if (!tenant_id) return null;
        return festivalSettingsService.getActiveFestival<FestivalCalendarRecord>(tenant_id);
      },
      enabled: !!tenant_id,
    });
  };

  // 2. Fetch Points Configuration
  const usePointsConfig = (festivalId: string | undefined) => {
    return useQuery({
      queryKey: ['points-config', festivalId],
      queryFn: async () => {
        if (!festivalId) return null;
        return festivalSettingsService.getPointsConfig<PointsConfigRecord>(festivalId);
      },
      enabled: !!festivalId,
    });
  };

  // 3. Mutation: Upsert Points Config
  const useUpdatePoints = () => {
    return useMutation({
      mutationFn: async (payload: any) => {
        if (!tenant_id) throw new Error('Tenant is required to update points configuration');
        return festivalSettingsService.updatePointsConfig<PointsConfigRecord>(tenant_id, payload);
      },
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['points-config', data.festival_id] });
      },
    });
  };

  // 4. Mutation: Update Festival Dates
  const useUpdateFestival = () => {
    return useMutation({
      mutationFn: async (payload: any) => {
        if (!tenant_id) throw new Error('Tenant is required to update festival configuration');
        return festivalSettingsService.updateFestival<FestivalCalendarRecord>(tenant_id, payload);
      },
      onSuccess: (festival) => {
        const previous = queryClient.getQueryData<FestivalCalendarRecord | null>(['active-festival', tenant_id]);
        if (!previous || previous.chest_number_template !== festival.chest_number_template ||
            previous.chest_number_category_range !== festival.chest_number_category_range) {
          queryClient.invalidateQueries({ queryKey: ['participants'] });
          queryClient.invalidateQueries({ queryKey: ['participant'] });
        }
        queryClient.invalidateQueries({ queryKey: ['active-festival', tenant_id] });
      },
    });
  };

  // 5. Fetch Active Items from DB
  const useActiveItems = (festivalId: string | undefined) => {
    return useQuery({
      queryKey: ['active-items', festivalId],
      queryFn: async () => {
        if (!festivalId) return [];
        return festivalSettingsService.getActiveItemCodes(festivalId);
      },
      enabled: !!festivalId,
    });
  };

  // 6. Fetch Items from DB
  const useItems = (festivalId: string | undefined) => {
    return useQuery({
      queryKey: ['items', festivalId, tenant_id],
      queryFn: async () => {
        if (!festivalId) return [];
        return festivalSettingsService.getItems<any>(festivalId);
      },
      enabled: !!festivalId && !!tenant_id,
    });
  };

  const useSelectableItems = (festivalId: string | undefined) => useQuery({
    queryKey: ['selectable-items', festivalId, tenant_id],
    queryFn: () => festivalSettingsService.getSelectableItems<any>(festivalId!, tenant_id!),
    enabled: !!festivalId && !!tenant_id,
  });

  const useUpdateCompetitionItem = (festivalId: string | undefined) => useMutation({
    mutationFn: async (input: Omit<CompetitionItemUpdate, 'festivalId'>) => {
      if (!festivalId || !tenant_id) throw new Error('Select a festival before editing competitions.');
      await festivalSettingsService.updateCompetitionItem({ ...input, festivalId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === 'program-cards' && query.queryKey[2] === festivalId });
      queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === 'program-detail' && query.queryKey[2] === festivalId });
      queryClient.invalidateQueries({ queryKey: ['active-items', festivalId] });
      queryClient.invalidateQueries({ queryKey: ['items', festivalId] });
      queryClient.invalidateQueries({ queryKey: ['selectable-items', festivalId] });
    },
  });

  const useApplyItemChanges = (festivalId: string | undefined) => useMutation({
    mutationFn: async ({ activateCodes, deactivateCodes, itemRecords }: {
      activateCodes: string[];
      deactivateCodes: string[];
      itemRecords?: any[];
    }) => {
      if (!festivalId || !tenant_id) throw new Error('Select a festival before changing programs.');
      await festivalSettingsService.applyItemChanges(festivalId, activateCodes, deactivateCodes, itemRecords);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === 'program-cards' && query.queryKey[2] === festivalId });
      queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === 'program-detail' && query.queryKey[2] === festivalId });
      queryClient.invalidateQueries({ queryKey: ['active-items', festivalId] });
      queryClient.invalidateQueries({ queryKey: ['items', festivalId] });
      queryClient.invalidateQueries({ queryKey: ['selectable-items', festivalId] });
    },
  });

  // 7. Mutation: Sync Active Items
  const useUpdateActiveItems = (festivalId: string | undefined) => {
    return useMutation({
      mutationFn: async ({ selectedCodes, itemRecords }: { selectedCodes: string[], itemRecords?: any[] }) => {
        if (!festivalId || !tenant_id) return;
        await festivalSettingsService.updateActiveItemCodes(festivalId, tenant_id, selectedCodes, itemRecords);
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['active-items', festivalId] });
        queryClient.invalidateQueries({ queryKey: ['items', festivalId] });
      },
    });
  };

  return {
    useActiveFestival,
    usePointsConfig,
    useUpdatePoints,
    useUpdateFestival,
    useActiveItems,
    useItems,
    useSelectableItems,
    useUpdateCompetitionItem,
    useApplyItemChanges,
    useUpdateActiveItems,
  };
};
