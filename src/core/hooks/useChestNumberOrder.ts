import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chestNumberService, ChestOrderState } from '../../services/chestNumberService';
import { participantService } from '../../services/participantService';
import { useAuthStore } from '../store/authStore';
import { invalidateCodeLetters } from '../utils/invalidateCodeLetters';

export function useChestNumberOrder(festivalId: string) {
  const tenantId = useAuthStore(state => state.tenant_id);
  const userId = useAuthStore(state => state.user?.id);
  const cache = useQueryClient();
  const key = ['chest-number-order', tenantId, userId, festivalId];
  const query = useQuery({ queryKey: key, queryFn: () => chestNumberService.get(festivalId) });
  const refreshNumbers = () => {
    for (const queryKey of [['participants'], ['participant'], ['publicCandidateProfile']]) {
      void cache.invalidateQueries({ queryKey });
    }
    void invalidateCodeLetters(cache, { festivalId });
  };
  const refreshState = () => { void cache.invalidateQueries({ queryKey: key }); };
  const save = useMutation({
    mutationFn: ({ state, teamIds }: { state: ChestOrderState; teamIds: string[] }) => chestNumberService.save(state, teamIds),
    onSuccess: state => { cache.setQueryData(key, state); refreshNumbers(); },
    onError: refreshState,
  });
  const lock = useMutation({
    mutationFn: ({ state, locked, code }: { state: ChestOrderState; locked: boolean; code?: string }) => chestNumberService.setLock(state, locked, code),
    onSuccess: state => { cache.setQueryData(key, state); },
    onError: refreshState,
  });
  const regenerate = useMutation({
    mutationFn: () => participantService.regenerateFestivalChestNumbers(festivalId),
    onSuccess: () => { refreshNumbers(); refreshState(); },
    onError: refreshState,
  });
  return { query, save, lock, regenerate };
}
