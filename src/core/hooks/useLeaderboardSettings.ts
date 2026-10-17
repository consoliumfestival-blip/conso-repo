import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LEADERBOARD_QUERY_KEYS } from '../../constants/leaderboard';
import { leaderboardSettingsService, LeaderboardSettings, PosterTemplate } from '../../services/leaderboardSettingsService';

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
  return useQuery({
    queryKey: LEADERBOARD_QUERY_KEYS.publicLeaderboardSettings(tenantId, festivalId),
    queryFn: () => leaderboardSettingsService.getPublicLeaderboardSettings(tenantId, festivalId),
    enabled: !!tenantId,
    staleTime: 300000, // 5 minutes
    gcTime: 1800000, // 30 minutes
  });
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
