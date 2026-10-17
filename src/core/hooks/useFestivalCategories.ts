import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { festivalCategoryService } from '../../services/festivalCategoryService';
import type { FestivalCategoryInput } from '../../types/festivalCategory';

export const useFestivalCategories = (festivalId?: string, activeOnly = false) => {
  const queryClient = useQueryClient();
  const queryKey = ['festival-categories', festivalId, activeOnly] as const;
  const categories = useQuery({
    queryKey,
    queryFn: () => festivalCategoryService.list(festivalId!, activeOnly),
    enabled: !!festivalId,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['festival-categories', festivalId] });
  const create = useMutation({
    mutationFn: ({ tenantId, input }: { tenantId: string; input: FestivalCategoryInput }) =>
      festivalCategoryService.create(tenantId, festivalId!, input),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: FestivalCategoryInput }) => festivalCategoryService.update(id, input),
    onSuccess: invalidate,
  });
  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => festivalCategoryService.setActive(id, isActive),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => festivalCategoryService.remove(id),
    onSuccess: invalidate,
  });
  return { ...categories, create, update, setActive, remove };
};
