import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LEADERBOARD_QUERY_KEYS } from '../../constants/leaderboard';
import { leaderboardSettingsService, LeaderboardSettings, PosterTemplate } from '../../services/leaderboardSettingsService';
import { Platform } from 'react-native';
import { usePublicSnapshot } from './usePublicSnapshot';
import { useFreshPublicQuery } from './useFreshPublicQuery';

export const useGetLeaderboardSettings = (festivalId?: string | null) => {
  return useQuery({
    queryKey: ['leaderboard-settings', festivalId],
    queryFn: () => {
      if (!festivalId) return null;
      return leaderboardSettingsService.getLeaderboardSettings(festivalId);
    },
    enabled: !!festivalId,
  });
};

export const useGetPublicLeaderboardSettings = (
  tenantId?: string | null,
  festivalId?: string | null,
) => {
  const snapshot = usePublicSnapshot(tenantId);
  const direct = useQuery({
    queryKey: LEADERBOARD_QUERY_KEYS.publicLeaderboardSettings(tenantId, festivalId),
    queryFn: () => leaderboardSettingsService.getPublicLeaderboardSettings(tenantId, festivalId),
    enabled: Platform.OS !== 'web' && !!tenantId,
    staleTime: 0,
    gcTime: 30_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
  const freshDirect = useFreshPublicQuery(direct, !!tenantId);
  if (Platform.OS !== 'web') return freshDirect;
  return {
    ...snapshot,
    data: snapshot.data && (!festivalId || snapshot.data.festival_id === festivalId)
      ? snapshot.data.settings
      : null,
  };
};

export const useUpdateLeaderboardSettings = (tenantId: string, festivalId: string) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (payload: Partial<LeaderboardSettings>) =>
      leaderboardSettingsService.updateLeaderboardSettings(tenantId, festivalId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['leaderboard-settings', festivalId], data);
      queryClient.invalidateQueries({ queryKey: ['leaderboard-settings', festivalId] });
      queryClient.invalidateQueries({ queryKey: ['public-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['public-leaderboard-settings'] });
      queryClient.invalidateQueries({ queryKey: ['public-published-results'] });
      queryClient.invalidateQueries({ queryKey: ['publicCandidateProfile'] });
      queryClient.invalidateQueries({ queryKey: ['unitProfile'] });
    },
  });
};

export const useGetPosterTemplates = (festivalId?: string | null) => {
  return useQuery({
    queryKey: ['poster-templates', festivalId],
    queryFn: () => {
      if (!festivalId) return [];
      return leaderboardSettingsService.getPosterTemplates(festivalId);
    },
    enabled: !!festivalId,
  });
};

export const useUpsertPosterTemplate = (tenantId: string, festivalId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Partial<PosterTemplate> & { name: string; background_url: string }) =>
      leaderboardSettingsService.updatePosterTemplate(tenantId, festivalId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poster-templates', festivalId] });
    },
  });
};

export const useDeletePosterTemplate = (festivalId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (templateId: string) => leaderboardSettingsService.deletePosterTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poster-templates', festivalId] });
    },
  });
};

export const useSaveGeneratedPoster = () => {
  return useMutation({
    mutationFn: (payload: any) => leaderboardSettingsService.saveGeneratedPoster(payload),
  });
};
