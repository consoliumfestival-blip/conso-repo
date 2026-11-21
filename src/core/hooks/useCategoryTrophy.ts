import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoryTrophyService } from '@/services/categoryTrophyService';

export const useCategoryTrophyMode = (tenantId?: string | null, festivalId?: string | null, publicRevision?: string | null) => useQuery({
  queryKey: ['category-trophy-mode', tenantId, festivalId, publicRevision],
  queryFn: () => categoryTrophyService.getMode(tenantId!, festivalId!),
  enabled: !!tenantId && !!festivalId,
  staleTime: 0,
  refetchInterval: false,
  placeholderData: (previous, priorQuery) => priorQuery?.queryKey[1] === tenantId && priorQuery?.queryKey[2] === festivalId ? previous : undefined,
});

export const usePublicCategoryTrophy = (tenantId?: string | null, festivalId?: string | null, enabled = true, publicRevision?: string | null) => useQuery({
  queryKey: ['category-trophy-public', tenantId, festivalId, publicRevision],
  queryFn: () => categoryTrophyService.listPublic(tenantId!, festivalId!),
  enabled: enabled && !!tenantId && !!festivalId,
  staleTime: 10_000,
  refetchInterval: false,
  placeholderData: (previous, priorQuery) => priorQuery?.queryKey[1] === tenantId && priorQuery?.queryKey[2] === festivalId ? previous : undefined,
});

export const useAdminCategoryTrophy = (tenantId?: string | null, festivalId?: string | null, enabled = true) => useQuery({
  queryKey: ['category-trophy-admin', tenantId, festivalId],
  queryFn: () => categoryTrophyService.listAdmin(tenantId!, festivalId!),
  enabled: enabled && !!tenantId && !!festivalId,
  staleTime: 10_000,
});

export const useSuperCategoryTrophyMode = (tenantId?: string | null, festivalId?: string | null) => {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['super-category-trophy-mode', tenantId, festivalId],
    queryFn: () => categoryTrophyService.getSuperMode(tenantId!, festivalId!),
    enabled: !!tenantId && !!festivalId,
    staleTime: 0,
  });
  const mutation = useMutation({
    mutationFn: ({ enabled, expectedEnabled }: { enabled: boolean; expectedEnabled: boolean }) => categoryTrophyService.setSuperMode(tenantId!, festivalId!, enabled, expectedEnabled),
    onSuccess: (data) => {
      cache.setQueryData(['super-category-trophy-mode', tenantId, festivalId], data);
      cache.invalidateQueries({ queryKey: ['category-trophy-mode', tenantId, festivalId] });
      cache.invalidateQueries({ queryKey: ['category-trophy-public', tenantId, festivalId] });
      cache.invalidateQueries({ queryKey: ['category-trophy-admin', tenantId, festivalId] });
    },
  });
  return { ...query, enabled: query.data?.enabled === true, setMode: mutation };
};
